/*
 * Gestionale casa — esportazione delle scadenze in formato .ics (iCalendar, RFC 5545),
 * da importare nel calendario del telefono, che può avvisare anche a pagina chiusa.
 * Le scadenze senza orario diventano eventi di un giorno intero (DTSTART;VALUE=DATE).
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var D = GC.date || require('./date.js');

  function testoIcs(t) {
    return String(t == null ? '' : t)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  }

  function lunghezzaUtf8(carattere) {
    var c = carattere.codePointAt(0);
    return c < 0x80 ? 1 : (c < 0x800 ? 2 : (c < 0x10000 ? 3 : 4));
  }

  // Le righe più lunghe di 75 byte vanno spezzate: la continuazione inizia con uno spazio.
  function piega(riga) {
    var parti = [];
    var corrente = '';
    var byte = 0;
    Array.from(riga).forEach(function (ch) {
      var b = lunghezzaUtf8(ch);
      var limite = parti.length ? 74 : 75;
      if (byte + b > limite) { parti.push(corrente); corrente = ''; byte = 0; }
      corrente += ch;
      byte += b;
    });
    parti.push(corrente);
    return parti.join('\r\n ');
  }

  function dataIcs(iso) { return iso.replace(/-/g, ''); }

  function timestampIcs(ts) {
    return ts.replace(/\.\d+/, '').replace(/[-:]/g, '');
  }

  function aggiungiOra(iso, ora, minuti) {
    var tot = Number(ora.slice(0, 2)) * 60 + Number(ora.slice(3, 5)) + minuti;
    var giorni = Math.floor(tot / 1440);
    tot -= giorni * 1440;
    return { data: D.aggiungiGiorni(iso, giorni), ora: String(Math.floor(tot / 60)).padStart(2, '0') + String(tot % 60).padStart(2, '0') };
  }

  /*
   * eventi: [{ uid, titolo, data: 'AAAA-MM-GG', ora: 'HH:MM' | null, descrizione }]
   * opzioni: { ora: timestamp ISO (DTSTAMP), promemoria: null | 'giorno' | 'vigilia' }
   *  - giorno: evento di un giorno intero → avviso alle 9 di quel giorno; con orario → un'ora prima
   *  - vigilia: alle 9 del giorno prima; con orario → un giorno prima
   */
  function genera(eventi, opzioni) {
    opzioni = opzioni || {};
    var stamp = timestampIcs(opzioni.ora || '2000-01-01T00:00:00Z');
    var righe = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gestionale casa//Scadenze//IT', 'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH', 'X-WR-CALNAME:Gestionale casa'];
    eventi.forEach(function (e) {
      righe.push('BEGIN:VEVENT');
      righe.push('UID:' + e.uid);
      righe.push('DTSTAMP:' + stamp);
      if (e.ora && D.oraValida(e.ora)) {
        var fine = aggiungiOra(e.data, e.ora, 60);
        righe.push('DTSTART:' + dataIcs(e.data) + 'T' + e.ora.replace(':', '') + '00');
        righe.push('DTEND:' + dataIcs(fine.data) + 'T' + fine.ora + '00');
      } else {
        righe.push('DTSTART;VALUE=DATE:' + dataIcs(e.data));
        righe.push('DTEND;VALUE=DATE:' + dataIcs(D.aggiungiGiorni(e.data, 1)));
      }
      righe.push('SUMMARY:' + testoIcs(e.titolo));
      if (e.descrizione) { righe.push('DESCRIPTION:' + testoIcs(e.descrizione)); }
      righe.push('TRANSP:TRANSPARENT');
      if (opzioni.promemoria === 'giorno' || opzioni.promemoria === 'vigilia') {
        var conOra = e.ora && D.oraValida(e.ora);
        var trigger = opzioni.promemoria === 'giorno' ? (conOra ? '-PT1H' : 'PT9H') : (conOra ? '-P1D' : '-PT15H');
        righe.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + testoIcs(e.titolo), 'TRIGGER:' + trigger, 'END:VALARM');
      }
      righe.push('END:VEVENT');
    });
    righe.push('END:VCALENDAR');
    return righe.map(piega).join('\r\n') + '\r\n';
  }

  // Evento .ics da una voce dell'elenco impegni: l'UID dipende solo dall'elemento d'origine,
  // così reimportando il file il calendario aggiorna l'evento invece di duplicarlo.
  function daVoce(voce) {
    return {
      uid: voce.chiave + '@gestionale-casa',
      titolo: voce.titolo,
      data: voce.data,
      ora: voce.ora || null,
      descrizione: voce.note || ''
    };
  }

  var api = { genera: genera, daVoce: daVoce, piega: piega, testoIcs: testoIcs };

  GC.ics = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
