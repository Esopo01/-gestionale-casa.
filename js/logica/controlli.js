/*
 * Gestionale casa — controlli automatici.
 * Ogni controllo restituisce avvisi { tipo, livello, testo, rotta } dove "rotta"
 * porta all'elemento da sistemare. Tutte le soglie arrivano dalle Impostazioni.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var D = GC.date || require('./date.js');
  var I = GC.importi || require('./importi.js');
  var A = GC.archivio || require('./archivio.js');
  var M = GC.movimenti || require('./movimenti.js');

  var TIPI = {
    'impegno-scaduto': 'Impegni scaduti',
    'previsto-scaduto': 'Movimenti previsti non confermati',
    'bolletta': 'Bollette più alte del solito',
    'lavoro': 'Lavori oltre il preventivo',
    'personale': 'Personale: dovuto diverso dal pagato',
    'produzione': 'Produzione fotovoltaica bassa',
    'backup': 'Backup'
  };

  function descriviMovimento(archivio, m) {
    return (m.controparte || m.note || M.nomeCategoria(archivio.collezioni.categorie, m.categoriaId, m.sottocategoriaId)) +
      ' ' + I.formattaImporto(m.importoCent);
  }

  function previstiScaduti(archivio, oggi) {
    return M.previstiScaduti(archivio.collezioni.movimenti, oggi).map(function (m) {
      return {
        tipo: 'previsto-scaduto',
        livello: 'medio',
        testo: D.formattaData(m.data) + ': ' + descriviMovimento(archivio, m) + ' — previsto, non ancora confermato',
        rotta: '#/movimenti/registro?apri=' + m.id
      };
    });
  }

  function backup(archivio, oggi) {
    if (A.eVuoto(archivio)) { return []; }
    var giorni = archivio.impostazioni.soglie.backupGiorni;
    var ultimo = archivio.meta.ultimoBackupIl;
    if (!ultimo) {
      return [{ tipo: 'backup', livello: 'alto', testo: 'Non hai ancora fatto un backup dei dati.', rotta: '#/impostazioni/backup' }];
    }
    var passati = D.differenzaGiorni(ultimo.slice(0, 10), oggi);
    if (passati > giorni) {
      return [{ tipo: 'backup', livello: 'alto',
        testo: 'L\'ultimo backup è di ' + passati + ' giorni fa (' + D.formattaData(ultimo.slice(0, 10)) + ').',
        rotta: '#/impostazioni/backup' }];
    }
    return [];
  }

  // Elenco dei controlli: ogni sezione aggiunge qui il proprio.
  var CONTROLLI = [previstiScaduti, backup];

  function esegui(archivio, oggi) {
    var avvisi = [];
    CONTROLLI.forEach(function (controllo) {
      avvisi = avvisi.concat(controllo(archivio, oggi));
    });
    return avvisi;
  }

  function perTipo(avvisi) {
    var gruppi = [];
    var indice = {};
    avvisi.forEach(function (a) {
      if (indice[a.tipo] == null) {
        indice[a.tipo] = gruppi.length;
        gruppi.push({ tipo: a.tipo, nome: TIPI[a.tipo] || a.tipo, avvisi: [] });
      }
      gruppi[indice[a.tipo]].avvisi.push(a);
    });
    return gruppi;
  }

  var api = {
    TIPI: TIPI,
    esegui: esegui,
    perTipo: perTipo,
    previstiScaduti: previstiScaduti,
    backup: backup
  };

  GC.controlli = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
