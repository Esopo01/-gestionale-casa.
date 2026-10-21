/*
 * Gestionale casa — operazioni sui record dell'archivio, backup e unione di archivi.
 * Le funzioni non modificano l'archivio ricevuto: ne restituiscono uno nuovo
 * (le collezioni non toccate restano condivise). "ora" è il timestamp ISO da usare
 * per creatoIl / modificatoIl / eliminatoIl e viene sempre passato da chi chiama.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var B = GC.base || require('./base.js');
  var S = GC.schema || require('./schema.js');

  function lista(archivio, nome) {
    var l = archivio.collezioni[nome];
    if (!l) { throw new Error('Collezione sconosciuta: ' + nome); }
    return l;
  }

  function conCollezione(archivio, nome, nuova) {
    var collezioni = Object.assign({}, archivio.collezioni);
    collezioni[nome] = nuova;
    return Object.assign({}, archivio, { collezioni: collezioni });
  }

  function trova(archivio, nome, id) {
    if (!id) { return null; }
    var l = lista(archivio, nome);
    for (var i = 0; i < l.length; i++) { if (l[i].id === id) { return l[i]; } }
    return null;
  }

  function inserisci(archivio, nome, campi, ora) {
    var record = Object.assign({}, campi, {
      id: campi.id || B.nuovoId(),
      creatoIl: ora,
      modificatoIl: ora
    });
    return { archivio: conCollezione(archivio, nome, lista(archivio, nome).concat([record])), record: record };
  }

  function aggiorna(archivio, nome, id, modifiche, ora) {
    var trovato = null;
    var nuova = lista(archivio, nome).map(function (r) {
      if (r.id !== id) { return r; }
      trovato = Object.assign({}, r, modifiche, { id: r.id, creatoIl: r.creatoIl, modificatoIl: ora });
      return trovato;
    });
    if (!trovato) { throw new Error('Elemento non trovato (' + nome + ').'); }
    return { archivio: conCollezione(archivio, nome, nuova), record: trovato };
  }

  // Inserisce se il record non ha id (o non esiste), altrimenti aggiorna.
  function salva(archivio, nome, campi, ora) {
    if (campi.id && trova(archivio, nome, campi.id)) {
      var modifiche = Object.assign({}, campi);
      delete modifiche.id;
      return aggiorna(archivio, nome, campi.id, modifiche, ora);
    }
    return inserisci(archivio, nome, campi, ora);
  }

  // Elimina i record per cui condizione(record) è vera e annota ciascuno in "eliminati".
  function eliminaDove(archivio, nome, condizione, ora) {
    var tenuti = [];
    var tolti = [];
    lista(archivio, nome).forEach(function (r) { (condizione(r) ? tolti : tenuti).push(r); });
    if (!tolti.length) { return archivio; }
    var a = conCollezione(archivio, nome, tenuti);
    var lapidi = tolti.map(function (r) { return { collezione: nome, id: r.id, eliminatoIl: ora }; });
    return Object.assign({}, a, { eliminati: (archivio.eliminati || []).concat(lapidi) });
  }

  function elimina(archivio, nome, id, ora) {
    return eliminaDove(archivio, nome, function (r) { return r.id === id; }, ora);
  }

  function conImpostazioni(archivio, modifiche, ora) {
    var imp = Object.assign({}, archivio.impostazioni, modifiche, { modificatoIl: ora });
    return Object.assign({}, archivio, { impostazioni: imp });
  }

  function conMeta(archivio, modifiche) {
    return Object.assign({}, archivio, { meta: Object.assign({}, archivio.meta, modifiche) });
  }

  // Tutti i record che puntano a un elemento (es. i movimenti di un lavoro).
  function collegati(archivio, nome, tipo, id) {
    return lista(archivio, nome).filter(function (r) {
      return r.collegamento && r.collegamento.tipo === tipo && r.collegamento.id === id;
    });
  }

  // Toglie un riferimento (es. responsabileId di un familiare eliminato) da tutte le collezioni.
  function azzeraRiferimenti(archivio, campo, id, ora) {
    var a = archivio;
    S.COLLEZIONI.forEach(function (nome) {
      (a.collezioni[nome] || []).forEach(function (r) {
        if (r[campo] === id) {
          var modifica = {};
          modifica[campo] = null;
          a = aggiorna(a, nome, r.id, modifica, ora).archivio;
        }
      });
    });
    return a;
  }

  // Toglie i collegamenti { tipo, id } che puntano a un elemento eliminato.
  function scollega(archivio, tipo, id, ora) {
    var a = archivio;
    S.COLLEZIONI.forEach(function (nome) {
      (a.collezioni[nome] || []).forEach(function (r) {
        if (r.collegamento && r.collegamento.tipo === tipo && r.collegamento.id === id) {
          a = aggiorna(a, nome, r.id, { collegamento: null }, ora).archivio;
        }
      });
    });
    return a;
  }

  function nomeCollegamento(archivio, collegamento) {
    if (!collegamento || !collegamento.tipo) { return ''; }
    var tipo = S.COLLEGAMENTI[collegamento.tipo];
    if (!tipo) { return ''; }
    var r = trova(archivio, tipo.collezione, collegamento.id);
    return r ? tipo.etichetta + ': ' + tipo.nome(r) : tipo.etichetta + ' eliminato';
  }

  // L'archivio è "vuoto" se non ci sono record oltre alle categorie.
  function eVuoto(archivio) {
    return S.COLLEZIONI.every(function (nome) {
      return nome === 'categorie' || !archivio.collezioni[nome] || archivio.collezioni[nome].length === 0;
    });
  }

  function numeroRecord(archivio) {
    return S.COLLEZIONI.reduce(function (tot, nome) { return tot + (archivio.collezioni[nome] || []).length; }, 0);
  }

  function riepilogo(archivio) {
    var conteggi = {};
    S.COLLEZIONI.forEach(function (nome) { conteggi[nome] = (archivio.collezioni[nome] || []).length; });
    var date = (archivio.collezioni.movimenti || []).map(function (m) { return m.data; }).filter(Boolean).sort();
    return {
      schemaVersion: archivio.schemaVersion,
      creatoIl: archivio.meta ? archivio.meta.creatoIl : null,
      ultimoBackupIl: archivio.meta ? archivio.meta.ultimoBackupIl : null,
      conteggi: conteggi,
      totale: numeroRecord(archivio),
      movimentiDal: date.length ? date[0] : null,
      movimentiAl: date.length ? date[date.length - 1] : null
    };
  }

  // --- Backup ---

  // Prepara il file di backup: registra la data del backup e restituisce il testo JSON.
  function esporta(archivio, ora) {
    var aggiornato = conMeta(archivio, { ultimoBackupIl: ora });
    return { archivio: aggiornato, testo: JSON.stringify(aggiornato, null, 1) };
  }

  // Legge un file di backup: controlla la forma e lo porta alla versione attuale.
  function leggiBackup(testo, ora) {
    var dati;
    try {
      dati = JSON.parse(String(testo).replace(/^﻿/, ''));
    } catch (e) {
      return { ok: false, errori: ['Il file non è un JSON valido.'] };
    }
    var errori = S.controlla(dati);
    if (errori.length) { return { ok: false, errori: errori }; }
    try {
      return { ok: true, archivio: S.migra(dati, ora), errori: [] };
    } catch (e2) {
      return { ok: false, errori: [e2.message] };
    }
  }

  /*
   * Unisce due archivi (es. telefono e computer). Per ogni record vince la modifica
   * più recente; un record eliminato su un dispositivo sparisce anche dall'altro,
   * a meno che sia stato modificato dopo l'eliminazione.
   */
  function unisci(locale, esterno) {
    var lapidi = {};
    (locale.eliminati || []).concat(esterno.eliminati || []).forEach(function (t) {
      var chiave = t.collezione + '|' + t.id;
      if (!lapidi[chiave] || t.eliminatoIl > lapidi[chiave].eliminatoIl) { lapidi[chiave] = t; }
    });
    var resoconto = { aggiunti: 0, aggiornati: 0, eliminati: 0 };
    var collezioni = {};
    S.COLLEZIONI.forEach(function (nome) {
      var ordine = [];
      var mappa = {};
      var origine = {};
      (locale.collezioni[nome] || []).forEach(function (r) { ordine.push(r.id); mappa[r.id] = r; origine[r.id] = 'locale'; });
      (esterno.collezioni[nome] || []).forEach(function (r) {
        var presente = mappa[r.id];
        if (!presente) {
          ordine.push(r.id); mappa[r.id] = r; origine[r.id] = 'esterno';
        } else if ((r.modificatoIl || '') > (presente.modificatoIl || '')) {
          mappa[r.id] = r; origine[r.id] = 'aggiornato';
        }
      });
      collezioni[nome] = [];
      ordine.forEach(function (id) {
        var r = mappa[id];
        var lapide = lapidi[nome + '|' + id];
        if (lapide && lapide.eliminatoIl >= (r.modificatoIl || '')) {
          if (origine[id] !== 'esterno') { resoconto.eliminati++; }
          return;
        }
        if (origine[id] === 'esterno') { resoconto.aggiunti++; }
        if (origine[id] === 'aggiornato') { resoconto.aggiornati++; }
        collezioni[nome].push(r);
      });
    });
    var impostazioni = (esterno.impostazioni.modificatoIl || '') > (locale.impostazioni.modificatoIl || '')
      ? esterno.impostazioni : locale.impostazioni;
    var creati = [locale.meta.creatoIl, esterno.meta.creatoIl].filter(Boolean).sort();
    var backup = [locale.meta.ultimoBackupIl, esterno.meta.ultimoBackupIl].filter(Boolean).sort();
    var archivio = {
      app: locale.app,
      schemaVersion: locale.schemaVersion,
      meta: Object.assign({}, locale.meta, {
        creatoIl: creati.length ? creati[0] : null,
        ultimoBackupIl: backup.length ? backup[backup.length - 1] : null
      }),
      impostazioni: impostazioni,
      collezioni: collezioni,
      eliminati: Object.keys(lapidi).map(function (k) { return lapidi[k]; })
    };
    return { archivio: archivio, resoconto: resoconto };
  }

  var api = {
    trova: trova,
    inserisci: inserisci,
    aggiorna: aggiorna,
    salva: salva,
    elimina: elimina,
    eliminaDove: eliminaDove,
    conImpostazioni: conImpostazioni,
    conMeta: conMeta,
    conCollezione: conCollezione,
    collegati: collegati,
    azzeraRiferimenti: azzeraRiferimenti,
    scollega: scollega,
    nomeCollegamento: nomeCollegamento,
    eVuoto: eVuoto,
    numeroRecord: numeroRecord,
    riepilogo: riepilogo,
    esporta: esporta,
    leggiBackup: leggiBackup,
    unisci: unisci
  };

  GC.archivio = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
