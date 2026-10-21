/*
 * Gestionale casa — impegni e scadenze.
 * L'elenco unisce, ricalcolandoli ogni volta:
 *  - gli impegni inseriti a mano (collezione "impegni"),
 *  - i movimenti previsti (pagamenti da fare: "fatto" = confermato),
 *  - le prossime scadenze delle manutenzioni periodiche,
 *  - i richiami degli eventi sanitari degli animali.
 * Così ogni data sta in un solo posto e non può andare fuori allineamento.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var B = GC.base || require('./base.js');
  var D = GC.date || require('./date.js');
  var I = GC.importi || require('./importi.js');
  var A = GC.archivio || require('./archivio.js');
  var M = GC.movimenti || require('./movimenti.js');
  var L = GC.lavori || require('./lavori.js');
  var AN = GC.animali || require('./animali.js');

  var TIPI = {
    impegno: 'Impegno',
    pagamento: 'Pagamento',
    manutenzione: 'Manutenzione',
    richiamo: 'Richiamo'
  };

  function ordina(voci) {
    return voci.sort(function (a, b) {
      if (a.data !== b.data) { return a.data < b.data ? -1 : 1; }
      return (a.ora || '99:99') < (b.ora || '99:99') ? -1 : 1;
    });
  }

  function elenco(archivio, oggi) {
    var c = archivio.collezioni;
    var voci = [];
    c.impegni.forEach(function (i) {
      voci.push({
        chiave: 'impegno-' + i.id, tipo: 'impegno', origine: { tipo: 'impegno', id: i.id },
        titolo: i.titolo, data: i.data, ora: i.ora || null, responsabileId: i.responsabileId || null,
        stato: i.stato === 'fatto' ? 'fatto' : 'da_fare', fattoIl: i.fattoIl || null,
        ricorrente: !!i.ogniMesi, ogniMesi: i.ogniMesi || null, collegamento: i.collegamento || null, note: i.note || ''
      });
    });
    c.movimenti.forEach(function (m) {
      if (m.stato !== 'previsto') { return; }
      var descr = m.controparte || m.note || M.nomeCategoria(c.categorie, m.categoriaId, m.sottocategoriaId);
      voci.push({
        chiave: 'pagamento-' + m.id, tipo: 'pagamento', origine: { tipo: 'movimento', id: m.id },
        titolo: (m.verso === 'entrata' ? 'Incasso: ' : 'Pagamento: ') + descr + ' (' + I.formattaImporto(m.importoCent) + ')',
        data: m.data, ora: null, responsabileId: m.responsabileId || null, stato: 'da_fare',
        ricorrente: !!m.ricorrenzaId, collegamento: m.collegamento || null, importoCent: m.importoCent, note: ''
      });
    });
    c.manutenzioni.forEach(function (man) {
      if (man.attiva === false) { return; }
      var prossima = L.prossimaScadenza(archivio, man);
      if (!prossima) { return; }
      voci.push({
        chiave: 'manutenzione-' + man.id, tipo: 'manutenzione', origine: { tipo: 'manutenzione', id: man.id },
        titolo: man.nome, data: prossima, ora: null, responsabileId: man.responsabileId || null, stato: 'da_fare',
        ricorrente: true, ogniMesi: man.ogniMesi, collegamento: { tipo: 'manutenzione', id: man.id }, note: man.fornitore || ''
      });
    });
    AN.richiamiAperti(archivio).forEach(function (e) {
      var animale = A.trova(archivio, 'animali', e.animaleId);
      if (animale && animale.attivo === false) { return; }
      voci.push({
        chiave: 'richiamo-' + e.id, tipo: 'richiamo', origine: { tipo: 'evento', id: e.id },
        titolo: 'Richiamo ' + (e.descrizione || e.tipo) + (animale ? ' – ' + animale.nome : ''),
        data: e.dataRichiamo, ora: null, responsabileId: e.responsabileId || null, stato: 'da_fare',
        ricorrente: false, collegamento: { tipo: 'animale', id: e.animaleId }, note: ''
      });
    });
    return ordina(voci);
  }

  // Viste: prossimi N giorni (da oggi compreso), scaduti (prima di oggi, non fatti), fatti.
  function viste(voci, oggi, giorni) {
    var fine = D.aggiungiGiorni(oggi, giorni);
    return {
      prossimi: voci.filter(function (v) { return v.stato === 'da_fare' && v.data >= oggi && v.data <= fine; }),
      scaduti: voci.filter(function (v) { return v.stato === 'da_fare' && v.data < oggi; }),
      daFare: voci.filter(function (v) { return v.stato === 'da_fare'; }),
      fatti: voci.filter(function (v) { return v.stato === 'fatto'; }).sort(function (a, b) {
        return (a.fattoIl || a.data) < (b.fattoIl || b.data) ? 1 : -1;
      })
    };
  }

  // Data successiva di un impegno ricorrente, calcolata dalla prima data della serie.
  function prossimaData(impegno) {
    var inizio = impegno.ricorrenzaInizio || impegno.data;
    for (var k = 1; k < 2400; k++) {
      var d = D.aggiungiMesi(inizio, k * impegno.ogniMesi);
      if (d > impegno.data) { return d; }
    }
    return null;
  }

  function validaImpegno(i) {
    var errori = [];
    if (!B.testo(i.titolo).trim()) { errori.push('Scrivi di cosa si tratta.'); }
    if (!D.valida(i.data)) { errori.push('Inserisci la data.'); }
    if (i.ora && !D.oraValida(i.ora)) { errori.push('L\'ora non è valida (es. 18:30).'); }
    return errori;
  }

  // Segna fatto un impegno inserito a mano; se è ricorrente crea il successivo.
  function segnaFatto(archivio, id, oggi, ora) {
    var imp = A.trova(archivio, 'impegni', id);
    if (!imp) { throw new Error('Impegno non trovato.'); }
    var a = A.aggiorna(archivio, 'impegni', id, { stato: 'fatto', fattoIl: oggi }, ora).archivio;
    if (imp.ogniMesi > 0) {
      var successivo = Object.assign({}, imp, {
        data: prossimaData(imp), stato: 'da_fare', fattoIl: null, ricorrenzaInizio: imp.ricorrenzaInizio || imp.data
      });
      delete successivo.id;
      a = A.inserisci(a, 'impegni', successivo, ora).archivio;
    }
    return a;
  }

  function riapri(archivio, id, ora) {
    return A.aggiorna(archivio, 'impegni', id, { stato: 'da_fare', fattoIl: null }, ora).archivio;
  }

  // Settimane (da lunedì) del mese con le voci di ogni giorno.
  function calendario(mese, voci) {
    var primo = D.primoGiorno(mese);
    var ultimo = D.ultimoGiorno(mese);
    var inizio = D.aggiungiGiorni(primo, -D.giornoSettimana(primo));
    var fine = D.aggiungiGiorni(ultimo, 6 - D.giornoSettimana(ultimo));
    var perGiorno = {};
    voci.forEach(function (v) { (perGiorno[v.data] = perGiorno[v.data] || []).push(v); });
    var settimane = [];
    var settimana = [];
    for (var d = inizio; d <= fine; d = D.aggiungiGiorni(d, 1)) {
      settimana.push({ data: d, delMese: d.slice(0, 7) === mese, voci: perGiorno[d] || [] });
      if (settimana.length === 7) { settimane.push(settimana); settimana = []; }
    }
    return settimane;
  }

  var api = {
    TIPI: TIPI,
    elenco: elenco,
    viste: viste,
    prossimaData: prossimaData,
    validaImpegno: validaImpegno,
    segnaFatto: segnaFatto,
    riapri: riapri,
    calendario: calendario
  };

  GC.impegni = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
