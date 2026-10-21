/*
 * Gestionale casa — date.
 * Le date sono stringhe "AAAA-MM-GG" (i mesi "AAAA-MM") e si mostrano come gg/mm/aaaa.
 * I calcoli usano il calendario in UTC per non risentire dell'ora legale.
 * Nessuna funzione legge da sola la data di oggi: chi ne ha bisogno la riceve come parametro.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};

  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
    'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  var GIORNI_BREVI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
  var MS_GIORNO = 86400000;

  function due(n) { return String(n).padStart(2, '0'); }

  function componi(anno, mese, giorno) {
    return String(anno).padStart(4, '0') + '-' + due(mese) + '-' + due(giorno);
  }

  function scomponi(iso) {
    return { anno: Number(iso.slice(0, 4)), mese: Number(iso.slice(5, 7)), giorno: Number(iso.slice(8, 10)) };
  }

  function bisestile(anno) {
    return (anno % 4 === 0 && anno % 100 !== 0) || anno % 400 === 0;
  }

  function giorniNelMese(anno, mese) {
    return [31, bisestile(anno) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mese - 1];
  }

  function valida(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) { return false; }
    var p = scomponi(iso);
    return p.mese >= 1 && p.mese <= 12 && p.giorno >= 1 && p.giorno <= giorniNelMese(p.anno, p.mese);
  }

  function meseValido(mese) {
    return typeof mese === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(mese);
  }

  // Accetta gg/mm/aaaa (anche con - o .) e AAAA-MM-GG, eventualmente seguiti dall'ora.
  function leggiData(testo) {
    var s = String(testo == null ? '' : testo).trim();
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
    var iso = null;
    if (m) {
      iso = componi(Number(m[1]), Number(m[2]), Number(m[3]));
    } else {
      m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[T\s].*)?$/.exec(s);
      if (m) { iso = componi(Number(m[3]), Number(m[2]), Number(m[1])); }
    }
    return iso && valida(iso) ? iso : null;
  }

  // Accetta AAAA-MM e mm/aaaa.
  function leggiMese(testo) {
    var s = String(testo == null ? '' : testo).trim();
    var m = /^(\d{4})-(\d{1,2})$/.exec(s);
    var mese = null;
    if (m) {
      mese = String(m[1]) + '-' + due(Number(m[2]));
    } else {
      m = /^(\d{1,2})[/.-](\d{4})$/.exec(s);
      if (m) { mese = String(m[2]) + '-' + due(Number(m[1])); }
    }
    return mese && meseValido(mese) ? mese : null;
  }

  function formattaData(iso) {
    if (!iso || !valida(iso)) { return ''; }
    return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  }

  function formattaDataBreve(iso) {
    if (!iso || !valida(iso)) { return ''; }
    var p = scomponi(iso);
    return p.giorno + ' ' + MESI_BREVI[p.mese - 1];
  }

  function formattaMese(mese) {
    if (!meseValido(mese)) { return ''; }
    return MESI[Number(mese.slice(5, 7)) - 1] + ' ' + mese.slice(0, 4);
  }

  function formattaMeseBreve(mese) {
    if (!meseValido(mese)) { return ''; }
    return MESI_BREVI[Number(mese.slice(5, 7)) - 1] + ' ' + mese.slice(2, 4);
  }

  function nomeMese(numero) { return MESI[numero - 1]; }

  function versoUtc(iso) {
    var p = scomponi(iso);
    return Date.UTC(p.anno, p.mese - 1, p.giorno);
  }

  function daUtc(ms) {
    var d = new Date(ms);
    return componi(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  function aggiungiGiorni(iso, giorni) {
    return daUtc(versoUtc(iso) + giorni * MS_GIORNO);
  }

  function differenzaGiorni(da, a) {
    return Math.round((versoUtc(a) - versoUtc(da)) / MS_GIORNO);
  }

  /*
   * Aggiunge mesi a una data tenendo il giorno di partenza quando esiste,
   * altrimenti l'ultimo giorno del mese (31/01 + 1 mese = 28/02).
   * giornoBase, se indicato, sostituisce il giorno della data.
   */
  function aggiungiMesi(iso, mesi, giornoBase) {
    var p = scomponi(iso);
    var totale = p.anno * 12 + (p.mese - 1) + mesi;
    var anno = Math.floor(totale / 12);
    var mese = totale - anno * 12 + 1;
    var giorno = Math.min(giornoBase || p.giorno, giorniNelMese(anno, mese));
    return componi(anno, mese, giorno);
  }

  function annoPrima(iso) { return aggiungiMesi(iso, -12); }

  function mese(iso) { return iso.slice(0, 7); }

  function primoGiorno(meseIso) { return meseIso + '-01'; }

  function ultimoGiorno(meseIso) {
    var a = Number(meseIso.slice(0, 4));
    var m = Number(meseIso.slice(5, 7));
    return meseIso + '-' + due(giorniNelMese(a, m));
  }

  function giorniDelMese(meseIso) {
    return giorniNelMese(Number(meseIso.slice(0, 4)), Number(meseIso.slice(5, 7)));
  }

  function spostaMese(meseIso, mesi) {
    return mese(aggiungiMesi(primoGiorno(meseIso), mesi));
  }

  // Mesi da "da" ad "a" compresi.
  function elencoMesi(da, a) {
    var out = [];
    var m = da;
    var sicurezza = 0;
    while (m <= a && sicurezza < 2400) {
      out.push(m);
      m = spostaMese(m, 1);
      sicurezza++;
    }
    return out;
  }

  // 0 = lunedì … 6 = domenica.
  function giornoSettimana(iso) {
    var g = new Date(versoUtc(iso)).getUTCDay();
    return (g + 6) % 7;
  }

  function nomeGiornoBreve(indice) { return GIORNI_BREVI[indice]; }

  // Giorni in comune tra due intervalli chiusi.
  function sovrapposizione(da1, a1, da2, a2) {
    var inizio = da1 > da2 ? da1 : da2;
    var fine = a1 < a2 ? a1 : a2;
    if (inizio > fine) { return 0; }
    return differenzaGiorni(inizio, fine) + 1;
  }

  // Data locale (non UTC) di un oggetto Date: la usa l'interfaccia per sapere "oggi".
  function daOggetto(d) {
    return componi(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function formattaDataOra(timestamp) {
    if (!timestamp) { return ''; }
    var d = new Date(timestamp);
    if (isNaN(d.getTime())) { return ''; }
    return formattaData(daOggetto(d)) + ' ' + due(d.getHours()) + ':' + due(d.getMinutes());
  }

  function oraValida(ora) {
    return typeof ora === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(ora);
  }

  function leggiOra(testo) {
    var s = String(testo == null ? '' : testo).trim().replace('.', ':');
    var m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) { return null; }
    var ora = due(Number(m[1])) + ':' + m[2];
    return oraValida(ora) ? ora : null;
  }

  var api = {
    MESI: MESI,
    valida: valida,
    meseValido: meseValido,
    leggiData: leggiData,
    leggiMese: leggiMese,
    formattaData: formattaData,
    formattaDataBreve: formattaDataBreve,
    formattaMese: formattaMese,
    formattaMeseBreve: formattaMeseBreve,
    nomeMese: nomeMese,
    giorniNelMese: giorniNelMese,
    giorniDelMese: giorniDelMese,
    aggiungiGiorni: aggiungiGiorni,
    differenzaGiorni: differenzaGiorni,
    aggiungiMesi: aggiungiMesi,
    annoPrima: annoPrima,
    mese: mese,
    primoGiorno: primoGiorno,
    ultimoGiorno: ultimoGiorno,
    spostaMese: spostaMese,
    elencoMesi: elencoMesi,
    giornoSettimana: giornoSettimana,
    nomeGiornoBreve: nomeGiornoBreve,
    sovrapposizione: sovrapposizione,
    daOggetto: daOggetto,
    formattaDataOra: formattaDataOra,
    oraValida: oraValida,
    leggiOra: leggiOra
  };

  GC.date = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
