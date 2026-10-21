/*
 * Gestionale casa — energia e fotovoltaico.
 * I dati sono salvati per mese ("AAAA-MM") o per giorno ("AAAA-MM-GG"), mai a 15 minuti.
 * Un valore null è un dato mancante, diverso da zero.
 *  autoconsumo = prodotta − immessa
 *  consumo della casa = autoconsumo + prelevata
 *  quota autoconsumata = autoconsumo ÷ prodotta
 *  autosufficienza = autoconsumo ÷ consumo della casa
 *  risparmio = autoconsumo × costo variabile del kWh (dalle bollette o dalle Impostazioni)
 *  beneficio = risparmio + ricavi GSE registrati come entrate
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var B = GC.base || require('./base.js');
  var D = GC.date || require('./date.js');
  var I = GC.importi || require('./importi.js');
  var M = GC.movimenti || require('./movimenti.js');
  var BO = GC.bollette || require('./bollette.js');

  var CAMPI = ['prodottaWh', 'immessaWh', 'prelevataWh', 'consumoWh', 'batteriaCaricaWh', 'batteriaScaricaWh'];
  var NOMI_CAMPI = {
    prodottaWh: 'Energia prodotta',
    immessaWh: 'Immessa in rete',
    prelevataWh: 'Prelevata dalla rete',
    consumoWh: 'Consumo (dall\'inverter)',
    batteriaCaricaWh: 'Batteria: carica',
    batteriaScaricaWh: 'Batteria: scarica'
  };

  function vuoti() {
    var v = {};
    CAMPI.forEach(function (c) { v[c] = null; });
    return v;
  }

  /*
   * Dati di un mese: il record mensile se c'è, altrimenti la somma dei giornalieri.
   * Restituisce null se il mese non ha nessun dato.
   */
  function datiMese(archivio, mese) {
    var energia = archivio.collezioni.energia;
    var mensile = null;
    var giornalieri = [];
    for (var i = 0; i < energia.length; i++) {
      var e = energia[i];
      if (e.periodo === mese) { mensile = e; } else if (e.periodo.length === 10 && e.periodo.slice(0, 7) === mese) { giornalieri.push(e); }
    }
    var giorniNelMese = D.giorniDelMese(mese);
    if (mensile) {
      var valori = vuoti();
      CAMPI.forEach(function (c) { valori[c] = mensile[c] == null ? null : mensile[c]; });
      return { mese: mese, origine: 'mensile', recordId: mensile.id, giorni: null, giorniNelMese: giorniNelMese, completo: true, valori: valori };
    }
    if (!giornalieri.length) { return null; }
    var somme = vuoti();
    var conteggi = {};
    CAMPI.forEach(function (c) { conteggi[c] = 0; });
    giornalieri.forEach(function (g) {
      CAMPI.forEach(function (c) {
        if (g[c] != null) { somme[c] = (somme[c] || 0) + g[c]; conteggi[c]++; }
      });
    });
    return {
      mese: mese, origine: 'giornaliero', recordId: null, giorni: giornalieri.length, giorniNelMese: giorniNelMese,
      completo: conteggi.prodottaWh >= giorniNelMese, conteggi: conteggi, valori: somme
    };
  }

  function mesiConDati(archivio) {
    var visti = {};
    archivio.collezioni.energia.forEach(function (e) { visti[e.periodo.slice(0, 7)] = true; });
    return Object.keys(visti).sort();
  }

  // Ricavi GSE del mese: entrate effettive nella categoria con ruolo "gse" (mese di competenza o data).
  function ricaviGse(archivio, mese) {
    var gse = archivio.collezioni.categorie.filter(function (c) { return c.ruolo === 'gse'; }).map(function (c) { return c.id; });
    return B.somma(archivio.collezioni.movimenti, function (m) {
      if (m.stato !== 'effettivo' || M.meseCompetenza(m) !== mese) { return 0; }
      if (gse.indexOf(m.sottocategoriaId) < 0 && gse.indexOf(m.categoriaId) < 0) { return 0; }
      return m.verso === 'entrata' ? m.importoCent : -m.importoCent;
    });
  }

  // I calcoli del fotovoltaico a partire dai valori (in Wh), dal costo del kWh e dai ricavi GSE.
  function calcoli(valori, costoKWh, ricaviGseCent) {
    var prodotta = valori.prodottaWh;
    var immessa = valori.immessaWh;
    var prelevata = valori.prelevataWh;
    var autoconsumo = prodotta != null && immessa != null ? prodotta - immessa : null;
    var consumoCasa = autoconsumo != null && prelevata != null ? autoconsumo + prelevata : null;
    var risparmio = autoconsumo != null && costoKWh != null ? I.valoreEnergia(autoconsumo, costoKWh) : null;
    var gse = ricaviGseCent || 0;
    return {
      autoconsumoWh: autoconsumo,
      consumoCasaWh: consumoCasa,
      quotaAutoconsumata: prodotta > 0 && autoconsumo != null ? autoconsumo / prodotta : null,
      autosufficienza: consumoCasa > 0 ? autoconsumo / consumoCasa : null,
      risparmioCent: risparmio,
      ricaviGseCent: gse,
      beneficioCent: risparmio != null ? risparmio + gse : null
    };
  }

  function produzioneAttesa(archivio, mese) {
    var attese = archivio.impostazioni.impianto.produzioneAttesaWh || [];
    var v = attese[Number(mese.slice(5, 7)) - 1];
    return v == null ? null : v;
  }

  function riepilogoMese(archivio, mese) {
    var dati = datiMese(archivio, mese);
    var costo = BO.costoVariabileKWh(archivio, mese);
    var gse = ricaviGse(archivio, mese);
    return {
      mese: mese,
      dati: dati,
      valori: dati ? dati.valori : vuoti(),
      costo: costo,
      attesaWh: produzioneAttesa(archivio, mese),
      calcoli: calcoli(dati ? dati.valori : vuoti(), costo.valore, gse)
    };
  }

  /*
   * Somma di più mesi (es. un anno). Ogni mese usa il proprio costo del kWh.
   * Un valore è null solo se manca in tutti i mesi; "mesiMancanti" conta i mesi senza dati.
   */
  function riepilogoPeriodo(archivio, mesi) {
    var valori = vuoti();
    var risparmio = null;
    var gse = 0;
    var mesiMancanti = 0;
    var parziali = 0;
    mesi.forEach(function (mese) {
      var r = riepilogoMese(archivio, mese);
      gse += r.calcoli.ricaviGseCent;
      if (!r.dati) { mesiMancanti++; return; }
      if (!r.dati.completo) { parziali++; }
      CAMPI.forEach(function (c) { if (r.valori[c] != null) { valori[c] = (valori[c] || 0) + r.valori[c]; } });
      if (r.calcoli.risparmioCent != null) { risparmio = (risparmio || 0) + r.calcoli.risparmioCent; }
    });
    var c = calcoli(valori, null, gse);
    c.risparmioCent = risparmio;
    c.beneficioCent = risparmio != null ? risparmio + gse : null;
    return { mesi: mesi, valori: valori, calcoli: c, mesiMancanti: mesiMancanti, mesiParziali: parziali };
  }

  /*
   * Controllo: produzione degli ultimi 3 mesi conclusi sotto la soglia (es. 70%) di quella
   * attesa (Impostazioni) o, se manca, di quella dello stesso mese dell'anno prima.
   * Si controllano solo mesi con dati completi.
   */
  function controlloProduzione(archivio, oggi) {
    var pct = archivio.impostazioni.soglie.produzioneMinPct;
    var corrente = D.mese(oggi);
    var avvisi = [];
    [-3, -2, -1].forEach(function (k) {
      var mese = D.spostaMese(corrente, k);
      var dati = datiMese(archivio, mese);
      if (!dati || !dati.completo || dati.valori.prodottaWh == null) { return; }
      var atteso = produzioneAttesa(archivio, mese);
      var fonte = 'attesa';
      if (atteso == null) {
        var prima = datiMese(archivio, D.spostaMese(mese, -12));
        atteso = prima && prima.completo ? prima.valori.prodottaWh : null;
        fonte = 'anno-prima';
      }
      if (!(atteso > 0)) { return; }
      var prodotta = dati.valori.prodottaWh;
      if (prodotta * 100 < atteso * pct) {
        avvisi.push({
          tipo: 'produzione',
          livello: 'medio',
          mese: mese,
          percentuale: prodotta / atteso,
          testo: D.formattaMese(mese) + ': prodotti ' + I.formattaEnergia(prodotta) + ', il ' + I.formattaPercentuale(prodotta / atteso) +
            (fonte === 'attesa' ? ' di quelli attesi (' : ' dello stesso mese dell\'anno prima (') + I.formattaEnergia(atteso) + ').',
          rotta: '#/energia/mese?mese=' + mese
        });
      }
    });
    return avvisi;
  }

  /*
   * Rientro dell'investimento: beneficio cumulato dalla data di attivazione (o dal primo dato)
   * rispetto al costo dell'impianto. La data stimata usa la media del beneficio degli ultimi
   * 12 mesi con dati (servono almeno 3 mesi).
   */
  function rientro(archivio, oggi) {
    var imp = archivio.impostazioni.impianto;
    var corrente = D.mese(oggi);
    var conDati = mesiConDati(archivio);
    var inizio = imp.dataAttivazione ? D.mese(imp.dataAttivazione) : (conDati[0] || null);
    var risultato = { costoCent: imp.costoCent, inizio: inizio, serie: [], cumulatoCent: 0, mesiMancanti: 0,
      percentuale: null, raggiunto: null, stimato: null, mediaMensileCent: null };
    if (!inizio || inizio > corrente) { return risultato; }
    var cumulato = 0;
    D.elencoMesi(inizio, corrente).forEach(function (mese) {
      var r = riepilogoMese(archivio, mese);
      if (r.calcoli.risparmioCent == null) { risultato.mesiMancanti++; }
      cumulato += (r.calcoli.risparmioCent || 0) + r.calcoli.ricaviGseCent;
      risultato.serie.push({ mese: mese, beneficioCent: r.calcoli.beneficioCent, cumulatoCent: cumulato, completo: !!(r.dati && r.dati.completo) });
      if (imp.costoCent > 0 && !risultato.raggiunto && cumulato >= imp.costoCent) { risultato.raggiunto = mese; }
    });
    risultato.cumulatoCent = cumulato;
    if (imp.costoCent > 0) {
      risultato.percentuale = cumulato / imp.costoCent;
      var utili = risultato.serie.filter(function (s) { return s.beneficioCent != null && s.completo; }).slice(-12);
      if (utili.length >= 3) {
        var media = B.somma(utili, function (s) { return s.beneficioCent; }) / utili.length;
        risultato.mediaMensileCent = Math.round(media);
        if (!risultato.raggiunto && media > 0) {
          risultato.stimato = D.spostaMese(corrente, Math.ceil((imp.costoCent - cumulato) / media));
        }
      }
    }
    return risultato;
  }

  function validaValori(valori) {
    var errori = [];
    CAMPI.forEach(function (c) {
      if (valori[c] != null && (!(valori[c] >= 0) || Math.round(valori[c]) !== valori[c])) { errori.push(NOMI_CAMPI[c] + ': valore non valido.'); }
    });
    if (valori.prodottaWh != null && valori.immessaWh != null && valori.immessaWh > valori.prodottaWh) {
      errori.push('L\'energia immessa in rete non può superare quella prodotta.');
    }
    return errori;
  }

  var api = {
    CAMPI: CAMPI,
    NOMI_CAMPI: NOMI_CAMPI,
    datiMese: datiMese,
    mesiConDati: mesiConDati,
    ricaviGse: ricaviGse,
    calcoli: calcoli,
    produzioneAttesa: produzioneAttesa,
    riepilogoMese: riepilogoMese,
    riepilogoPeriodo: riepilogoPeriodo,
    controlloProduzione: controlloProduzione,
    rientro: rientro,
    validaValori: validaValori
  };

  GC.energia = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
