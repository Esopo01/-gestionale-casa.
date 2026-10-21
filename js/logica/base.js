/*
 * Gestionale casa — funzioni di base condivise dalla logica.
 * Nessun accesso al DOM né allo spazio del browser: gira identico nel browser e in Node.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};

  function esadecimale(byte) {
    return (byte + 0x100).toString(16).slice(1);
  }

  // Identificativo univoco (UUID v4) generato sul dispositivo: due dispositivi
  // non producono mai lo stesso id, così i loro archivi potranno essere uniti.
  function nuovoId() {
    var c = radice.crypto;
    if (c && typeof c.randomUUID === 'function') {
      try { return c.randomUUID(); } catch (e) { /* contesto non sicuro: si usa il metodo sotto */ }
    }
    var b = [];
    var i;
    if (c && typeof c.getRandomValues === 'function') {
      var casuali = new Uint8Array(16);
      c.getRandomValues(casuali);
      for (i = 0; i < 16; i++) { b.push(casuali[i]); }
    } else {
      for (i = 0; i < 16; i++) { b.push(Math.floor(Math.random() * 256)); }
    }
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = b.map(esadecimale).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function clona(valore) {
    return valore === undefined ? undefined : JSON.parse(JSON.stringify(valore));
  }

  function testo(valore) {
    return valore == null ? '' : String(valore);
  }

  function normalizza(valore) {
    return testo(valore).trim().toLowerCase();
  }

  function confrontaTesti(a, b) {
    return testo(a).localeCompare(testo(b), 'it', { sensitivity: 'base' });
  }

  function somma(lista, valoreDi) {
    var totale = 0;
    for (var i = 0; i < lista.length; i++) { totale += valoreDi(lista[i]) || 0; }
    return totale;
  }

  function perId(lista) {
    var mappa = {};
    for (var i = 0; i < lista.length; i++) { mappa[lista[i].id] = lista[i]; }
    return mappa;
  }

  function eOggetto(valore) {
    return valore !== null && typeof valore === 'object' && !Array.isArray(valore);
  }

  var api = {
    nuovoId: nuovoId,
    clona: clona,
    testo: testo,
    normalizza: normalizza,
    confrontaTesti: confrontaTesti,
    somma: somma,
    perId: perId,
    eOggetto: eOggetto
  };

  GC.base = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
