/*
 * Gestionale casa — importazione dei dati dell'inverter da CSV.
 * Accetta separatore ";" o "," (o tabulazione), decimali con virgola o punto,
 * date gg/mm/aaaa o AAAA-MM-GG (anche con l'ora), mm/aaaa o AAAA-MM per le righe mensili.
 * Le righe giornaliere (o più fitte, con l'orario) vengono sommate per giorno; quelle mensili
 * per mese. L'abbinamento delle colonne e le unità (kWh o Wh) vengono scelti dall'utente
 * la prima volta e ricordati in un "profilo" legato alle intestazioni del file.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var B = GC.base || require('./base.js');
  var D = GC.date || require('./date.js');
  var I = GC.importi || require('./importi.js');
  var CSV = GC.csv || require('./csv.js');
  var A = GC.archivio || require('./archivio.js');
  var E = GC.energia || require('./energia.js');

  // Campi da abbinare alle colonne, con le parole che li fanno riconoscere nelle intestazioni.
  var CAMPI = [
    { campo: 'data', nome: 'Data', obbligatorio: true, parole: ['data', 'date', 'giorno', 'day', 'periodo', 'mese', 'time'], escludi: [] },
    { campo: 'prodottaWh', nome: 'Energia prodotta', obbligatorio: true, parole: ['produz', 'prodott', 'generat', 'yield', 'fotovolt', 'solar', 'pv'], escludi: [] },
    { campo: 'immessaWh', nome: 'Immessa in rete', parole: ['immess', 'export', 'cedut', 'feed', 'verso rete', 'alla rete', 'in rete'], escludi: [] },
    { campo: 'prelevataWh', nome: 'Prelevata dalla rete', parole: ['preliev', 'prelevat', 'acquist', 'dalla rete', 'da rete', 'import'], escludi: ['importo'] },
    { campo: 'consumoWh', nome: 'Consumo', parole: ['consum', 'load', 'carico', 'utenz'], escludi: [] },
    { campo: 'batteriaCaricaWh', nome: 'Batteria: carica', parole: ['carica', 'charge'], escludi: ['scarica', 'discharge'] },
    { campo: 'batteriaScaricaWh', nome: 'Batteria: scarica', parole: ['scarica', 'discharge'], escludi: [] }
  ];
  var VALORI_VUOTI = ['', '-', '--', 'n.d.', 'nd', 'n/a', 'na', 'null'];

  function pulisciCella(c) { return String(c == null ? '' : c).trim(); }

  function eData(cella) {
    return !!(D.leggiData(cella) || D.leggiMese(cella));
  }

  // Riga d'intestazione: la prima riga seguita da una riga con una data valida in qualche colonna.
  function trovaIntestazione(righe) {
    for (var i = 0; i < Math.min(righe.length - 1, 30); i++) {
      var successiva = righe[i + 1].map(pulisciCella);
      var corrente = righe[i].map(pulisciCella);
      var nonVuote = corrente.filter(Boolean).length;
      if (nonVuote >= 2 && successiva.some(eData) && !corrente.some(eData)) { return i; }
    }
    return 0;
  }

  // Decide il separatore decimale per tutto il file, contando i numeri senza ambiguità.
  function rilevaDecimale(righe, separatore) {
    var virgola = 0;
    var punto = 0;
    righe.slice(0, 400).forEach(function (r) {
      r.forEach(function (cella) {
        var c = pulisciCella(cella);
        if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(c) || /^-?\d+,\d+$/.test(c)) { virgola++; }
        else if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(c) || /^-?\d+\.\d{1,2}$/.test(c) || /^-?\d+\.\d{4,}$/.test(c) || /^-?\d{4,}\.\d+$/.test(c)) { punto++; }
      });
    });
    if (virgola > punto) { return ','; }
    if (punto > virgola) { return '.'; }
    return separatore === ',' ? '.' : ',';
  }

  /*
   * Legge il testo del file. opzioni (facoltative, dal profilo o scelte nell'anteprima):
   * { separatore, decimale, rigaIntestazione }.
   */
  function analizza(testo, opzioni) {
    opzioni = opzioni || {};
    var t = CSV.togliBom(testo);
    var separatore = opzioni.separatore || CSV.rilevaSeparatore(t);
    var righe = CSV.analizza(t, separatore).filter(function (r) { return r.some(function (c) { return pulisciCella(c) !== ''; }); });
    var ri = opzioni.rigaIntestazione != null && opzioni.rigaIntestazione < righe.length ? opzioni.rigaIntestazione : trovaIntestazione(righe);
    var intestazioni = (righe[ri] || []).map(pulisciCella);
    var dati = righe.slice(ri + 1);
    return {
      separatore: separatore,
      decimale: opzioni.decimale || rilevaDecimale(dati, separatore),
      rigaIntestazione: ri,
      intestazioni: intestazioni,
      righe: dati,
      prime: righe.slice(0, Math.min(righe.length, 12)),
      firma: intestazioni.join('|')
    };
  }

  function unitaDa(intestazione) {
    var s = intestazione.toLowerCase();
    if (/kwh/.test(s)) { return 'kWh'; }
    if (/(^|[^k])wh\b/.test(s)) { return 'Wh'; }
    return 'kWh';
  }

  // Propone l'abbinamento colonne → campi in base alle intestazioni.
  function suggerisci(intestazioni) {
    var colonne = {};
    var unita = {};
    var usate = {};
    CAMPI.forEach(function (def) {
      var scelta = null;
      intestazioni.forEach(function (h, i) {
        if (scelta != null || usate[i]) { return; }
        var s = h.toLowerCase();
        var trovata = def.parole.some(function (p) { return s.indexOf(p) >= 0; });
        var esclusa = def.escludi.some(function (p) { return s.indexOf(p) >= 0; });
        if (trovata && !esclusa) { scelta = i; }
      });
      if (scelta == null && def.campo === 'data' && intestazioni.length) { scelta = 0; }
      if (scelta != null) {
        usate[scelta] = true;
        colonne[def.campo] = intestazioni[scelta];
        if (def.campo !== 'data') { unita[def.campo] = unitaDa(intestazioni[scelta]); }
      }
    });
    return { colonne: colonne, unita: unita };
  }

  // Profilo da ricordare: abbinamento per nome di colonna, unità, formato del file.
  function creaProfilo(analisi, scelte) {
    return {
      firma: analisi.firma,
      separatore: analisi.separatore,
      decimale: analisi.decimale,
      rigaIntestazione: analisi.rigaIntestazione,
      colonne: Object.assign({}, scelte.colonne),
      unita: Object.assign({}, scelte.unita),
      granularita: scelte.granularita || 'auto'
    };
  }

  function profiloAdatto(profilo, analisi) {
    return !!(profilo && profilo.firma && profilo.firma === analisi.firma);
  }

  function leggiDataCella(cella) {
    var c = pulisciCella(cella);
    var giorno = D.leggiData(c);
    if (giorno) { return { tipo: 'giorno', data: giorno }; }
    var mese = D.leggiMese(c);
    if (mese) { return { tipo: 'mese', data: mese }; }
    return null;
  }

  function leggiValore(cella, unita, decimale) {
    var c = pulisciCella(cella);
    if (VALORI_VUOTI.indexOf(c.toLowerCase()) >= 0) { return { vuoto: true }; }
    var n = I.leggiNumero(c, unita === 'Wh' ? 0 : 3, { decimale: decimale });
    return n == null ? { errore: true } : { valore: n };
  }

  /*
   * Converte le righe in totali per giorno o per mese.
   * Restituisce { granularita, periodi: { 'AAAA-MM-GG' | 'AAAA-MM': valori }, scartate: [{ riga, motivo }], valide }.
   */
  function converti(analisi, profilo) {
    var indici = {};
    var mancanti = [];
    CAMPI.forEach(function (def) {
      var nome = profilo.colonne[def.campo];
      var i = nome != null && nome !== '' ? analisi.intestazioni.indexOf(nome) : -1;
      if (i >= 0) { indici[def.campo] = i; } else if (def.obbligatorio) { mancanti.push(def.nome); }
    });
    if (mancanti.length) { return { errore: 'Scegli la colonna per: ' + mancanti.join(', ') + '.' }; }
    var letti = [];
    var scartate = [];
    analisi.righe.forEach(function (r, n) {
      var numeroRiga = analisi.rigaIntestazione + n + 2;
      var data = leggiDataCella(r[indici.data]);
      if (!data) { scartate.push({ riga: numeroRiga, motivo: 'data non valida ("' + pulisciCella(r[indici.data]) + '")' }); return; }
      var valori = {};
      var errore = null;
      Object.keys(indici).forEach(function (campo) {
        if (campo === 'data' || errore) { return; }
        var v = leggiValore(r[indici[campo]], profilo.unita[campo] || 'kWh', analisi.decimale);
        if (v.errore) { errore = 'numero non valido in "' + analisi.intestazioni[indici[campo]] + '" ("' + pulisciCella(r[indici[campo]]) + '")'; return; }
        valori[campo] = v.vuoto ? null : v.valore;
      });
      if (errore) { scartate.push({ riga: numeroRiga, motivo: errore }); return; }
      letti.push({ data: data, valori: valori });
    });

    var granularita = profilo.granularita && profilo.granularita !== 'auto' ? profilo.granularita : rilevaGranularita(letti);
    var periodi = {};
    letti.forEach(function (x) {
      var chiave = granularita === 'mensile' ? x.data.data.slice(0, 7) : x.data.data;
      if (granularita === 'giornaliera' && x.data.tipo === 'mese') { return; }
      if (!periodi[chiave]) { periodi[chiave] = {}; E.CAMPI.forEach(function (c) { periodi[chiave][c] = null; }); }
      Object.keys(x.valori).forEach(function (c) {
        if (x.valori[c] != null) { periodi[chiave][c] = (periodi[chiave][c] || 0) + x.valori[c]; }
      });
    });
    return { granularita: granularita, periodi: periodi, scartate: scartate, valide: letti.length };
  }

  // Righe mensili se le date sono mesi, o se ogni mese ha una sola riga e sempre il giorno 1.
  function rilevaGranularita(letti) {
    if (!letti.length) { return 'giornaliera'; }
    if (letti.some(function (x) { return x.data.tipo === 'mese'; })) { return 'mensile'; }
    var perMese = {};
    letti.forEach(function (x) { perMese[x.data.data.slice(0, 7)] = (perMese[x.data.data.slice(0, 7)] || 0) + 1; });
    var mesi = Object.keys(perMese);
    var unaPerMese = mesi.every(function (m) { return perMese[m] === 1; });
    var tuttiIlPrimo = letti.every(function (x) { return x.data.data.slice(8, 10) === '01'; });
    return mesi.length >= 2 && unaPerMese && tuttiIlPrimo ? 'mensile' : 'giornaliera';
  }

  // Totali per mese di una conversione (per l'anteprima).
  function totaliPerMese(risultato) {
    var mesi = {};
    Object.keys(risultato.periodi).sort().forEach(function (p) {
      var m = p.slice(0, 7);
      if (!mesi[m]) { mesi[m] = { giorni: 0 }; E.CAMPI.forEach(function (c) { mesi[m][c] = null; }); }
      if (p.length === 10) { mesi[m].giorni++; }
      E.CAMPI.forEach(function (c) {
        var v = risultato.periodi[p][c];
        if (v != null) { mesi[m][c] = (mesi[m][c] || 0) + v; }
      });
    });
    return mesi;
  }

  // Quali dati esistenti verrebbero sostituiti dall'importazione.
  function sostituzioni(archivio, risultato) {
    var mesi = {};
    var periodi = Object.keys(risultato.periodi);
    var insieme = {};
    periodi.forEach(function (p) { insieme[p] = true; mesi[p.slice(0, 7)] = true; });
    var giorniSostituiti = 0;
    var mesiManuali = [];
    archivio.collezioni.energia.forEach(function (e) {
      if (e.periodo.length === 10 && insieme[e.periodo]) { giorniSostituiti++; }
      if (e.periodo.length === 7 && mesi[e.periodo]) { mesiManuali.push(e.periodo); }
      if (risultato.granularita === 'mensile' && e.periodo.length === 10 && mesi[e.periodo.slice(0, 7)]) { giorniSostituiti++; }
    });
    return { giorni: giorniSostituiti, mesi: mesiManuali.sort() };
  }

  /*
   * Salva il risultato nell'archivio: per ogni giorno o mese importato sostituisce i dati
   * già presenti (reimportare lo stesso periodo non duplica).
   */
  function applica(archivio, risultato, ora) {
    var periodi = Object.keys(risultato.periodi).sort();
    var mesi = {};
    var insieme = {};
    periodi.forEach(function (p) { insieme[p] = true; mesi[p.slice(0, 7)] = true; });
    var a = A.eliminaDove(archivio, 'energia', function (e) {
      if (insieme[e.periodo]) { return true; }
      if (e.periodo.length === 7 && mesi[e.periodo]) { return true; }
      if (risultato.granularita === 'mensile' && e.periodo.length === 10 && mesi[e.periodo.slice(0, 7)]) { return true; }
      return false;
    }, ora);
    var nuovi = a.collezioni.energia.slice();
    periodi.forEach(function (p) {
      nuovi.push(Object.assign({ id: B.nuovoId(), creatoIl: ora, modificatoIl: ora, periodo: p, origine: 'csv' }, risultato.periodi[p]));
    });
    return A.conCollezione(a, 'energia', nuovi);
  }

  var api = {
    CAMPI: CAMPI,
    analizza: analizza,
    rilevaDecimale: rilevaDecimale,
    suggerisci: suggerisci,
    creaProfilo: creaProfilo,
    profiloAdatto: profiloAdatto,
    converti: converti,
    totaliPerMese: totaliPerMese,
    sostituzioni: sostituzioni,
    applica: applica
  };

  GC.importaEnergia = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
