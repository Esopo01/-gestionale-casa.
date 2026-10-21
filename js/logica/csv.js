/*
 * Gestionale casa — lettura e scrittura di testo CSV.
 * Gestisce campi tra virgolette (con "" all'interno), a capo dentro i campi,
 * fine riga Windows o Unix e il BOM iniziale.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};

  function togliBom(testo) {
    return String(testo == null ? '' : testo).replace(/^﻿/, '');
  }

  function analizza(testo, separatore) {
    var s = togliBom(testo);
    var righe = [];
    var riga = [];
    var campo = '';
    var traVirgolette = false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (traVirgolette) {
        if (c === '"') {
          if (s.charAt(i + 1) === '"') { campo += '"'; i++; } else { traVirgolette = false; }
        } else {
          campo += c;
        }
      } else if (c === '"' && campo === '') {
        traVirgolette = true;
      } else if (c === separatore) {
        riga.push(campo); campo = '';
      } else if (c === '\r' || c === '\n') {
        if (c === '\r' && s.charAt(i + 1) === '\n') { i++; }
        riga.push(campo); campo = '';
        righe.push(riga); riga = [];
      } else {
        campo += c;
      }
    }
    if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }
    return righe;
  }

  // Conta un carattere fuori dalle virgolette in una riga di testo.
  function contaFuoriVirgolette(riga, carattere) {
    var n = 0;
    var dentro = false;
    for (var i = 0; i < riga.length; i++) {
      var c = riga.charAt(i);
      if (c === '"') { dentro = !dentro; } else if (c === carattere && !dentro) { n++; }
    }
    return n;
  }

  // Sceglie tra ";", "," e tabulazione quello presente in modo regolare nelle prime righe.
  function rilevaSeparatore(testo) {
    var righe = togliBom(testo).split(/\r\n|\n|\r/).filter(function (r) { return r.trim() !== ''; }).slice(0, 20);
    var candidati = [';', ',', '\t'];
    var migliore = ';';
    var punteggioMigliore = -1;
    candidati.forEach(function (sep) {
      var conteggi = righe.map(function (r) { return contaFuoriVirgolette(r, sep); });
      var conSeparatore = conteggi.filter(function (n) { return n > 0; });
      if (!conSeparatore.length) { return; }
      var frequenze = {};
      conSeparatore.forEach(function (n) { frequenze[n] = (frequenze[n] || 0) + 1; });
      var piuComune = 0;
      Object.keys(frequenze).forEach(function (k) { if (frequenze[k] > piuComune) { piuComune = frequenze[k]; } });
      var punteggio = piuComune * 10 + conSeparatore.length;
      if (punteggio > punteggioMigliore) { punteggioMigliore = punteggio; migliore = sep; }
    });
    return migliore;
  }

  function campo(valore, separatore) {
    var s = valore == null ? '' : String(valore);
    if (s.indexOf(separatore) >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function genera(righe, separatore) {
    return righe.map(function (riga) {
      return riga.map(function (v) { return campo(v, separatore); }).join(separatore);
    }).join('\r\n') + '\r\n';
  }

  var api = {
    analizza: analizza,
    rilevaSeparatore: rilevaSeparatore,
    genera: genera,
    togliBom: togliBom
  };

  GC.csv = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
