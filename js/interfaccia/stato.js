/*
 * Gestionale casa — stato in memoria dell'interfaccia.
 * Tiene l'archivio corrente, applica le modifiche (funzioni pure della logica)
 * e chiede allo strato di salvataggio di scriverle. Se il salvataggio fallisce,
 * i dati restano in memoria e compare un avviso con la proposta di esportarli.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var D = GC.date;
  var S = GC.schema;
  var M = GC.movimenti;
  var salvataggio = GC.salvataggio;

  var stato = {
    archivio: null,
    errore: null,          // ultimo salvataggio fallito { motivo, messaggio }
    bloccato: false,       // true se i dati salvati sono illeggibili: non si sovrascrivono
    testoIlleggibile: null,
    giorno: null,

    oggi: function () { return D.daOggetto(new Date()); },
    ora: function () { return new Date().toISOString(); },

    avvia: function () {
      var self = this;
      return salvataggio.carica().then(function (r) {
        var ora = self.ora();
        if (r.stato === 'ok') {
          try {
            var versione = r.archivio.schemaVersion;
            self.archivio = S.migra(r.archivio, ora);
            if (versione !== self.archivio.schemaVersion) { self.salva(); }
          } catch (e) {
            self.archivio = S.nuovoArchivio(ora);
            self.bloccato = true;
            self.testoIlleggibile = JSON.stringify(r.archivio);
            self.errore = { motivo: 'versione', messaggio: e.message };
          }
        } else if (r.stato === 'illeggibile') {
          self.archivio = S.nuovoArchivio(ora);
          self.bloccato = true;
          self.testoIlleggibile = r.testo;
          self.errore = { motivo: 'illeggibile', messaggio: 'I dati salvati in questo browser non si riescono a leggere. Non li ho toccati.' };
        } else if (r.stato === 'non-disponibile') {
          self.archivio = S.nuovoArchivio(ora);
          self.errore = { motivo: 'non-disponibile', messaggio: r.messaggio };
        } else {
          self.archivio = S.nuovoArchivio(ora);
          self.salva();
        }
        self.nuovoGiorno();
      });
    },

    // All'avvio e quando cambia il giorno: crea i previsti delle ricorrenze.
    nuovoGiorno: function () {
      var oggi = this.oggi();
      if (this.giorno === oggi) { return false; }
      this.giorno = oggi;
      var r = M.generaPrevisti(this.archivio, oggi, this.ora());
      if (r.creati > 0) { this.archivio = r.archivio; this.salva(); }
      return true;
    },

    /*
     * Applica una modifica: trasforma(archivio) restituisce il nuovo archivio.
     * Gli errori (validazione) diventano un messaggio e l'archivio resta com'era.
     */
    applica: function (trasforma, opzioni) {
      opzioni = opzioni || {};
      var nuovo;
      try {
        nuovo = trasforma(this.archivio);
      } catch (e) {
        if (opzioni.form) { GC.ui.erroreModulo(opzioni.form, e.message); } else { GC.ui.messaggio(e.message, { tipo: 'errore' }); }
        return false;
      }
      if (!nuovo) { return false; }
      this.archivio = nuovo;
      this.salva();
      if (opzioni.chiudi !== false && opzioni.form) { GC.ui.chiudiModale(); }
      if (GC.app) { GC.app.aggiorna(); }
      if (opzioni.messaggio) { GC.ui.messaggio(opzioni.messaggio, opzioni.azioneMessaggio ? { azione: opzioni.azioneMessaggio } : undefined); }
      return true;
    },

    salva: function () {
      var self = this;
      if (self.bloccato) { if (GC.app) { GC.app.mostraBanner(); } return Promise.resolve({ ok: false }); }
      return salvataggio.salva(self.archivio).then(function (r) {
        var prima = self.errore;
        self.errore = r.ok ? null : r;
        if ((prima || self.errore) && GC.app) { GC.app.mostraBanner(); }
        return r;
      });
    },

    // I dati illeggibili vengono scartati: si riparte dall'archivio in memoria.
    sblocca: function () {
      this.bloccato = false;
      this.testoIlleggibile = null;
      this.errore = null;
      return this.salva();
    },

    sostituisci: function (archivio) {
      this.archivio = archivio;
      this.giorno = null;
      this.nuovoGiorno();
      return this.salva();
    },

    // Un'altra scheda dello stesso browser ha salvato: si ricaricano i dati.
    ricarica: function () {
      var self = this;
      if (self.bloccato) { return Promise.resolve(); }
      return salvataggio.carica().then(function (r) {
        if (r.stato === 'ok') {
          self.archivio = S.migra(r.archivio, self.ora());
          if (GC.app) { GC.app.aggiorna(); }
          GC.ui.messaggio('Dati aggiornati da un\'altra scheda aperta.');
        }
      });
    }
  };

  GC.stato = stato;
})(typeof window !== 'undefined' ? window : globalThis);
