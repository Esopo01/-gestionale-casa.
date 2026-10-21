/*
 * Gestionale casa — strato di salvataggio.
 * È l'UNICO file che usa localStorage. Per passare a un database (o a un'app con dati
 * condivisi) basta sostituire questo file mantenendo le stesse funzioni: rispondono
 * tutte con una Promise, come farebbe un database.
 *
 * L'archivio intero sta in una sola chiave, così ogni salvataggio riesce o fallisce
 * per intero. Tutte le chiavi iniziano con "gestionale-casa:" perché i siti GitHub Pages
 * dello stesso account condividono lo stesso spazio nel browser.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};

  var PREFISSO = 'gestionale-casa:';
  var CHIAVE_ARCHIVIO = PREFISSO + 'archivio';
  var CHIAVE_PREFERENZE = PREFISSO + 'preferenze';

  var depositoForzato = null;

  function deposito() {
    if (depositoForzato) { return depositoForzato; }
    try {
      return radice.localStorage || null;
    } catch (e) {
      return null; // il browser blocca l'accesso (es. cookie e dati dei siti disattivati)
    }
  }

  function motivoErrore(e) {
    if (!e) { return 'altro'; }
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014) {
      return 'spazio';
    }
    return 'altro';
  }

  function messaggioErrore(motivo) {
    if (motivo === 'spazio') {
      return 'Lo spazio del browser per questo sito è esaurito.';
    }
    if (motivo === 'non-disponibile') {
      return 'Il browser non permette di salvare dati per questa pagina (navigazione privata o dati dei siti bloccati).';
    }
    return 'Il browser ha rifiutato il salvataggio.';
  }

  /*
   * Legge l'archivio. Risponde con { stato: 'vuoto' | 'ok' | 'illeggibile', archivio, testo }.
   * Con 'illeggibile' i dati salvati non vengono toccati, così si possono recuperare.
   */
  function carica() {
    return new Promise(function (risolvi) {
      var d = deposito();
      if (!d) { risolvi({ stato: 'non-disponibile', messaggio: messaggioErrore('non-disponibile') }); return; }
      var testo;
      try {
        testo = d.getItem(CHIAVE_ARCHIVIO);
      } catch (e) {
        risolvi({ stato: 'non-disponibile', messaggio: messaggioErrore('non-disponibile') });
        return;
      }
      if (testo == null || testo === '') { risolvi({ stato: 'vuoto' }); return; }
      try {
        risolvi({ stato: 'ok', archivio: JSON.parse(testo) });
      } catch (e2) {
        risolvi({ stato: 'illeggibile', testo: testo });
      }
    });
  }

  // Scrive l'archivio. Non rifiuta mai: risponde { ok: true } oppure { ok: false, motivo, messaggio }.
  function salva(archivio) {
    return new Promise(function (risolvi) {
      var d = deposito();
      if (!d) { risolvi({ ok: false, motivo: 'non-disponibile', messaggio: messaggioErrore('non-disponibile') }); return; }
      try {
        var testo = JSON.stringify(archivio);
        d.setItem(CHIAVE_ARCHIVIO, testo);
        risolvi({ ok: true, caratteri: testo.length });
      } catch (e) {
        var motivo = motivoErrore(e);
        risolvi({ ok: false, motivo: motivo, messaggio: messaggioErrore(motivo) });
      }
    });
  }

  function cancella() {
    return new Promise(function (risolvi) {
      var d = deposito();
      try {
        if (d) { d.removeItem(CHIAVE_ARCHIVIO); }
        risolvi({ ok: true });
      } catch (e) {
        risolvi({ ok: false, motivo: motivoErrore(e), messaggio: messaggioErrore(motivoErrore(e)) });
      }
    });
  }

  // Preferenze di questo dispositivo (filtri, ultima scheda): non fanno parte del backup.
  function leggiPreferenze() {
    var d = deposito();
    try {
      var t = d ? d.getItem(CHIAVE_PREFERENZE) : null;
      return t ? JSON.parse(t) : {};
    } catch (e) {
      return {};
    }
  }

  function scriviPreferenze(preferenze) {
    var d = deposito();
    try {
      if (d) { d.setItem(CHIAVE_PREFERENZE, JSON.stringify(preferenze)); }
    } catch (e) { /* le preferenze non sono indispensabili */ }
  }

  // Spazio occupato dalle chiavi del programma, in caratteri (il browser ne conta circa 2 byte l'uno).
  function spazioOccupato() {
    var d = deposito();
    if (!d) { return 0; }
    var totale = 0;
    try {
      for (var i = 0; i < d.length; i++) {
        var k = d.key(i);
        if (k && k.indexOf(PREFISSO) === 0) { totale += k.length + (d.getItem(k) || '').length; }
      }
    } catch (e) { return 0; }
    return totale;
  }

  // Avvisa quando un'altra scheda aperta sullo stesso sito ha salvato l'archivio.
  function osserva(richiamo) {
    if (typeof radice.addEventListener !== 'function') { return; }
    radice.addEventListener('storage', function (evento) {
      if (evento.key === CHIAVE_ARCHIVIO) { richiamo(); }
    });
  }

  // Solo per i test: sostituisce localStorage con un deposito finto.
  function usaDeposito(finto) { depositoForzato = finto; }

  var api = {
    PREFISSO: PREFISSO,
    carica: carica,
    salva: salva,
    cancella: cancella,
    leggiPreferenze: leggiPreferenze,
    scriviPreferenze: scriviPreferenze,
    spazioOccupato: spazioOccupato,
    osserva: osserva,
    usaDeposito: usaDeposito
  };

  GC.salvataggio = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
