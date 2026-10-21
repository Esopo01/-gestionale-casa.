/*
 * Gestionale casa — bollette di luce, gas e acqua.
 * L'importo di una bolletta è la somma dei movimenti collegati (uscite meno eventuali
 * rimborsi), così non è scritto in due posti. Il consumo è in millesimi dell'unità.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var B = GC.base || require('./base.js');
  var D = GC.date || require('./date.js');
  var A = GC.archivio || require('./archivio.js');
  var M = GC.movimenti || require('./movimenti.js');

  function importo(archivio, bollettaId) {
    return M.costoNetto(A.collegati(archivio, 'movimenti', 'bolletta', bollettaId));
  }

  // Bollette (di un tipo, se indicato) con l'importo calcolato, in ordine di periodo.
  function conImporti(archivio, tipo) {
    return archivio.collezioni.bollette.filter(function (b) { return !tipo || b.tipo === tipo; }).map(function (b) {
      return Object.assign({}, b, { importoCent: importo(archivio, b.id) });
    }).sort(function (x, y) { return x.periodoDal < y.periodoDal ? -1 : (x.periodoDal > y.periodoDal ? 1 : 0); });
  }

  function media(valori) {
    if (!valori.length) { return null; }
    return Math.round(B.somma(valori, function (v) { return v; }) / valori.length);
  }

  /*
   * Bolletta di riferimento per il confronto: quella dello stesso tipo il cui periodo,
   * spostato avanti di un anno, copre almeno metà del periodo di questa; se manca,
   * la media delle ultime N bollette dello stesso tipo precedenti a questa.
   * "bollette" deve contenere importoCent (vedi conImporti).
   */
  function riferimento(bollette, bolletta, ultime) {
    var stessoTipo = bollette.filter(function (x) { return x.tipo === bolletta.tipo && x.id !== bolletta.id; });
    var dalPrima = D.annoPrima(bolletta.periodoDal);
    var alPrima = D.annoPrima(bolletta.periodoAl);
    var durata = D.differenzaGiorni(bolletta.periodoDal, bolletta.periodoAl) + 1;
    var migliore = null;
    var copertura = 0;
    stessoTipo.forEach(function (x) {
      var giorni = D.sovrapposizione(x.periodoDal, x.periodoAl, dalPrima, alPrima);
      if (giorni > copertura) { copertura = giorni; migliore = x; }
    });
    if (migliore && copertura * 2 >= durata) {
      return { tipo: 'anno-prima', bollette: [migliore], importoCent: migliore.importoCent, consumo: migliore.consumo };
    }
    var precedenti = stessoTipo.filter(function (x) { return x.periodoDal < bolletta.periodoDal; })
      .sort(function (x, y) { return x.periodoDal < y.periodoDal ? 1 : -1; })
      .slice(0, ultime || 6);
    if (!precedenti.length) { return null; }
    var importi = precedenti.map(function (x) { return x.importoCent; }).filter(function (v) { return v > 0; });
    var consumi = precedenti.map(function (x) { return x.consumo; }).filter(function (v) { return v > 0; });
    return { tipo: 'media', bollette: precedenti, importoCent: media(importi), consumo: media(consumi) };
  }

  function supera(valore, rif, percentuale) {
    return valore != null && rif != null && rif > 0 && valore * 100 > rif * (100 + percentuale);
  }

  // Confronta una bolletta con il riferimento; segnala se importo o consumo superano la soglia.
  function confronta(bollette, bolletta, soglie) {
    var rif = riferimento(bollette, bolletta, soglie.bollettaUltime);
    if (!rif) { return null; }
    var pct = soglie.bollettaPct;
    return {
      riferimento: rif,
      superaImporto: bolletta.importoCent > 0 && supera(bolletta.importoCent, rif.importoCent, pct),
      superaConsumo: supera(bolletta.consumo, rif.consumo, pct),
      variazioneImporto: rif.importoCent > 0 && bolletta.importoCent > 0 ? (bolletta.importoCent - rif.importoCent) / rif.importoCent : null,
      variazioneConsumo: rif.consumo > 0 && bolletta.consumo != null ? (bolletta.consumo - rif.consumo) / rif.consumo : null
    };
  }

  // Costo per unità consumata (centesimi per unità), solo indicativo.
  function costoPerUnita(bolletta) {
    if (!(bolletta.consumo > 0) || !(bolletta.importoCent > 0)) { return null; }
    return Math.round(bolletta.importoCent * 1000 / bolletta.consumo);
  }

  /*
   * Costo variabile del kWh per un mese, in milionesimi di euro per kWh:
   * (importo − quota fissa) ÷ kWh, sommando le bollette della luce terminate nei
   * 12 mesi fino a quel mese; se non ce ne sono, l'ultima precedente; altrimenti
   * il valore di riserva delle Impostazioni.
   */
  function costoVariabileKWh(archivio, mese) {
    var fine = D.ultimoGiorno(mese);
    var inizio = D.primoGiorno(D.spostaMese(mese, -11));
    var luce = conImporti(archivio, 'luce').filter(function (b) {
      return b.quotaFissaCent != null && b.consumo > 0 && b.importoCent > b.quotaFissaCent;
    });
    var usate = luce.filter(function (b) { return b.periodoAl >= inizio && b.periodoAl <= fine; });
    if (!usate.length) {
      var prima = luce.filter(function (b) { return b.periodoAl < inizio; });
      if (prima.length) { usate = [prima[prima.length - 1]]; }
    }
    if (usate.length) {
      var variabile = B.somma(usate, function (b) { return b.importoCent - b.quotaFissaCent; });
      var wattora = B.somma(usate, function (b) { return b.consumo; });
      return { valore: Math.round(variabile * 10000000 / wattora), fonte: 'bollette', numeroBollette: usate.length };
    }
    var riserva = archivio.impostazioni.impianto.costoKWhRiserva;
    if (riserva != null) { return { valore: riserva, fonte: 'impostazioni', numeroBollette: 0 }; }
    return { valore: null, fonte: null, numeroBollette: 0 };
  }

  function validaBolletta(b) {
    var errori = [];
    if (!D.valida(b.periodoDal) || !D.valida(b.periodoAl)) { errori.push('Inserisci il periodo della bolletta (dal… al…).'); }
    else if (b.periodoAl < b.periodoDal) { errori.push('La fine del periodo è prima dell\'inizio.'); }
    return errori;
  }

  var api = {
    importo: importo,
    conImporti: conImporti,
    riferimento: riferimento,
    confronta: confronta,
    costoPerUnita: costoPerUnita,
    costoVariabileKWh: costoVariabileKWh,
    validaBolletta: validaBolletta
  };

  GC.bollette = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
