/*
 * Gestionale casa — lettura e formato di importi, energia, percentuali, ore e prezzi.
 * Tutto è salvato come numero intero: importi in centesimi, energia in wattora,
 * consumi in millesimi dell'unità, ore in minuti, prezzo del kWh in milionesimi di euro.
 * I calcoli non usano mai numeri con la virgola mobile sui valori salvati.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};

  var NBSP = ' ';

  function pulisci(testo) {
    return String(testo == null ? '' : testo)
      .replace(/€/g, '')
      .replace(/[\s  ]/g, '');
  }

  function ripeti(carattere, volte) {
    var s = '';
    for (var i = 0; i < volte; i++) { s += carattere; }
    return s;
  }

  /*
   * Legge un numero scritto da una persona e lo restituisce come intero
   * moltiplicato per 10^cifre (es. cifre 2: "12,5" → 1250). Restituisce null se non valido.
   * opzioni.decimale: ',' o '.' se il separatore decimale è noto (file CSV);
   *   se manca valgono le regole italiane: con virgola e punto, l'ultimo è il decimale;
   *   solo virgola = decimale; solo punto seguito da gruppi di 3 cifre = migliaia
   *   ("1.234" = 1234), altrimenti decimale ("12.50" = 12,50).
   * opzioni.maxDecimali: rifiuta numeri con più decimali di così.
   * opzioni.negativi: ammette il segno meno.
   */
  function leggiNumero(testo, cifre, opzioni) {
    opzioni = opzioni || {};
    var s = pulisci(testo);
    if (s === '') { return null; }
    var negativo = false;
    if (s.charAt(0) === '-' || s.charAt(0) === '+') {
      negativo = s.charAt(0) === '-';
      s = s.slice(1);
    }
    if (negativo && !opzioni.negativi) { return null; }
    if (s === '') { return null; }

    var decimale = opzioni.decimale;
    if (!decimale) {
      var virgola = s.lastIndexOf(',');
      var punto = s.lastIndexOf('.');
      if (virgola >= 0 && punto >= 0) {
        decimale = virgola > punto ? ',' : '.';
      } else if (virgola >= 0) {
        decimale = ',';
      } else if (punto >= 0) {
        decimale = /^\d{1,3}(\.\d{3})+$/.test(s) ? ',' : '.';
      } else {
        decimale = ',';
      }
    }
    var migliaia = decimale === ',' ? '.' : ',';
    var parti = s.split(decimale);
    if (parti.length > 2) { return null; }
    var intera = parti[0];
    var decimali = parti.length === 2 ? parti[1] : '';
    if (parti.length === 2 && decimali === '') { return null; }
    if (intera.indexOf(migliaia) >= 0) {
      var gruppi = new RegExp('^\\d{1,3}(\\' + migliaia + '\\d{3})+$');
      if (!gruppi.test(intera)) { return null; }
      intera = intera.split(migliaia).join('');
    }
    if (intera === '' && decimali !== '') { intera = '0'; }
    if (!/^\d+$/.test(intera)) { return null; }
    if (decimali !== '' && !/^\d+$/.test(decimali)) { return null; }
    if (opzioni.maxDecimali != null && decimali.length > opzioni.maxDecimali) { return null; }

    var frazione = (decimali + ripeti('0', cifre + 1)).slice(0, cifre + 1);
    var valore = Number(intera) * Math.pow(10, cifre) + (cifre > 0 ? Number(frazione.slice(0, cifre)) : 0);
    if (Number(frazione.charAt(cifre)) >= 5) { valore += 1; }
    if (!isFinite(valore) || valore > Number.MAX_SAFE_INTEGER) { return null; }
    return negativo ? -valore : valore;
  }

  function raggruppa(intero) {
    return String(intero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function formattaScalato(valore, cifre, decimaliMostrati) {
    var negativo = valore < 0;
    var assoluto = Math.abs(valore);
    var fattore = Math.pow(10, cifre - decimaliMostrati);
    var arrotondato = Math.round(assoluto / fattore);
    var base = Math.pow(10, decimaliMostrati);
    var intera = Math.floor(arrotondato / base);
    var resto = arrotondato % base;
    var s = raggruppa(intera);
    if (decimaliMostrati > 0) {
      s += ',' + String(resto).padStart(decimaliMostrati, '0');
    }
    return (negativo && arrotondato !== 0 ? '-' : '') + s;
  }

  // Valore da mettere in un campo di inserimento: senza punti delle migliaia,
  // decimali con la virgola e senza zeri finali (es. 24300 con cifre 3 → "24,3").
  function perCampo(valore, cifre, minimoDecimali) {
    if (valore == null) { return ''; }
    var negativo = valore < 0;
    var assoluto = Math.abs(valore);
    var base = Math.pow(10, cifre);
    var intera = Math.floor(assoluto / base);
    var resto = String(assoluto % base).padStart(cifre, '0');
    var minimo = minimoDecimali || 0;
    while (resto.length > minimo && resto.charAt(resto.length - 1) === '0') { resto = resto.slice(0, -1); }
    return (negativo ? '-' : '') + intera + (resto ? ',' + resto : '');
  }

  // --- Importi in centesimi ---

  function leggiImporto(testo, opzioni) {
    opzioni = opzioni || {};
    return leggiNumero(testo, 2, { maxDecimali: 2, negativi: !!opzioni.negativi });
  }

  function formattaImporto(centesimi) {
    if (centesimi == null || isNaN(centesimi)) { return '—'; }
    return formattaScalato(Math.round(centesimi), 2, 2) + NBSP + '€';
  }

  function importoPerCampo(centesimi) {
    if (centesimi == null) { return ''; }
    return perCampo(centesimi, 2, 2);
  }

  // Formato per i CSV destinati a Excel in italiano: niente punto delle migliaia.
  function importoPerCsv(centesimi) {
    if (centesimi == null) { return ''; }
    return perCampo(centesimi, 2, 2);
  }

  // --- Energia in wattora ---

  function leggiEnergiaKWh(testo) {
    var valore = leggiNumero(testo, 3, { maxDecimali: 3 });
    return valore;
  }

  function formattaEnergia(wattora, decimali) {
    if (wattora == null || isNaN(wattora)) { return '—'; }
    return formattaScalato(Math.round(wattora), 3, decimali == null ? 1 : decimali) + NBSP + 'kWh';
  }

  function energiaPerCampo(wattora) {
    return perCampo(wattora, 3, 0);
  }

  // --- Consumi delle bollette in millesimi dell'unità (Wh, millesimi di Smc, litri) ---

  function leggiConsumo(testo) {
    return leggiNumero(testo, 3, { maxDecimali: 3 });
  }

  function formattaConsumo(millesimi, unita) {
    if (millesimi == null || isNaN(millesimi)) { return '—'; }
    var decimali = millesimi % 1000 === 0 ? 0 : (millesimi % 100 === 0 ? 1 : (millesimi % 10 === 0 ? 2 : 3));
    return formattaScalato(millesimi, 3, decimali) + (unita ? NBSP + unita : '');
  }

  function consumoPerCampo(millesimi) {
    return perCampo(millesimi, 3, 0);
  }

  // --- Prezzo del kWh in milionesimi di euro (0,25 €/kWh = 250000) ---

  function leggiPrezzoKWh(testo) {
    return leggiNumero(testo, 6, { maxDecimali: 6 });
  }

  function formattaPrezzoKWh(milionesimi) {
    if (milionesimi == null || isNaN(milionesimi)) { return '—'; }
    return perCampo(milionesimi, 6, 2) + NBSP + '€/kWh';
  }

  function prezzoPerCampo(milionesimi) {
    return perCampo(milionesimi, 6, 2);
  }

  // Risparmio in centesimi: wattora × (milionesimi di euro per kWh) ÷ 10.000.000.
  function valoreEnergia(wattora, prezzoMilionesimi) {
    if (wattora == null || prezzoMilionesimi == null) { return null; }
    return Math.round(wattora * prezzoMilionesimi / 10000000);
  }

  // --- Percentuali ---

  function rapporto(numeratore, denominatore) {
    if (numeratore == null || denominatore == null || denominatore === 0) { return null; }
    return numeratore / denominatore;
  }

  // 0.6 → "60%", 0.6667 → "66,7%". Un decimale, senza ",0" finale.
  function formattaPercentuale(frazione, conSegno) {
    if (frazione == null || isNaN(frazione)) { return '—'; }
    var decimi = Math.round(frazione * 1000);
    var negativo = decimi < 0;
    var assoluto = Math.abs(decimi);
    var s = raggruppa(Math.floor(assoluto / 10));
    if (assoluto % 10 !== 0) { s += ',' + (assoluto % 10); }
    var segno = negativo ? '-' : (conSegno && decimi > 0 ? '+' : '');
    return segno + s + '%';
  }

  // --- Ore lavorate in minuti ---

  // "7:30" → 450, "7,5" → 450, "8" → 480.
  function leggiMinuti(testo) {
    var s = pulisci(testo);
    if (s === '') { return null; }
    var m = /^(\d{1,3}):([0-5]\d)$/.exec(s);
    if (m) { return Number(m[1]) * 60 + Number(m[2]); }
    var centesimiDiOra = leggiNumero(s, 2, { maxDecimali: 2 });
    if (centesimiDiOra == null) { return null; }
    return Math.round(centesimiDiOra * 60 / 100);
  }

  function formattaOre(minuti) {
    if (minuti == null || isNaN(minuti)) { return '—'; }
    var ore = Math.floor(minuti / 60);
    var resto = minuti % 60;
    if (ore === 0) { return resto + ' min'; }
    return ore + ' h' + (resto ? ' ' + resto + ' min' : '');
  }

  function minutiPerCampo(minuti) {
    if (minuti == null) { return ''; }
    var ore = Math.floor(minuti / 60);
    var resto = minuti % 60;
    return ore + ':' + String(resto).padStart(2, '0');
  }

  // Dovuto per ore lavorate: minuti × paga oraria in centesimi ÷ 60, arrotondato al centesimo.
  function dovutoOre(minuti, pagaOrariaCent) {
    return Math.round(minuti * pagaOrariaCent / 60);
  }

  // --- Numeri interi semplici (percentuali di detrazione, anni, giorni) ---

  function leggiIntero(testo, minimo, massimo) {
    var s = pulisci(testo);
    if (!/^-?\d+$/.test(s)) { return null; }
    var n = Number(s);
    if (minimo != null && n < minimo) { return null; }
    if (massimo != null && n > massimo) { return null; }
    return n;
  }

  var api = {
    leggiNumero: leggiNumero,
    leggiImporto: leggiImporto,
    formattaImporto: formattaImporto,
    importoPerCampo: importoPerCampo,
    importoPerCsv: importoPerCsv,
    leggiEnergiaKWh: leggiEnergiaKWh,
    formattaEnergia: formattaEnergia,
    energiaPerCampo: energiaPerCampo,
    leggiConsumo: leggiConsumo,
    formattaConsumo: formattaConsumo,
    consumoPerCampo: consumoPerCampo,
    leggiPrezzoKWh: leggiPrezzoKWh,
    formattaPrezzoKWh: formattaPrezzoKWh,
    prezzoPerCampo: prezzoPerCampo,
    valoreEnergia: valoreEnergia,
    rapporto: rapporto,
    formattaPercentuale: formattaPercentuale,
    leggiMinuti: leggiMinuti,
    formattaOre: formattaOre,
    minutiPerCampo: minutiPerCampo,
    dovutoOre: dovutoOre,
    leggiIntero: leggiIntero,
    raggruppa: raggruppa
  };

  GC.importi = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
