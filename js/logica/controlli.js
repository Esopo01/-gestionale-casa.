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
  var BO = GC.bollette || require('./bollette.js');
  var L = GC.lavori || require('./lavori.js');
  var P = GC.personale || require('./personale.js');
  var IM = GC.impegni || require('./impegni.js');
  var S = GC.schema || require('./schema.js');

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

  // Impegni, manutenzioni e richiami con data passata e non fatti (i pagamenti sono nel controllo dei previsti).
  function impegniScaduti(archivio, oggi) {
    var voci = IM.elenco(archivio, oggi).filter(function (v) { return v.tipo !== 'pagamento'; });
    return IM.viste(voci, oggi, 0).scaduti.map(function (v) {
      var rotta = '#/impegni/scaduti';
      if (v.tipo === 'manutenzione') { rotta = '#/manutenzione/' + v.origine.id; }
      if (v.tipo === 'richiamo' && v.collegamento) { rotta = '#/animale/' + v.collegamento.id; }
      return {
        tipo: 'impegno-scaduto',
        livello: 'alto',
        testo: D.formattaData(v.data) + ': ' + v.titolo + ' — scaduto da ' + D.differenzaGiorni(v.data, oggi) + ' giorni',
        rotta: rotta
      };
    });
  }

  // Bollette con importo o consumo oltre la soglia rispetto allo stesso periodo dell'anno prima o alla media.
  function bollette(archivio) {
    var soglie = archivio.impostazioni.soglie;
    var tutte = BO.conImporti(archivio);
    var avvisi = [];
    tutte.forEach(function (b) {
      var c = BO.confronta(tutte, b, soglie);
      if (!c || (!c.superaImporto && !c.superaConsumo)) { return; }
      var tipo = S.TIPI_BOLLETTA[b.tipo];
      var n = c.riferimento.bollette.length;
      var rif = c.riferimento.tipo === 'anno-prima' ? 'allo stesso periodo dell\'anno prima' :
        (n === 1 ? 'alla bolletta precedente' : 'alla media delle ultime ' + n);
      var cosa = [];
      if (c.superaImporto) { cosa.push('importo ' + I.formattaImporto(b.importoCent) + ' (' + I.formattaPercentuale(c.variazioneImporto, true) + ')'); }
      if (c.superaConsumo) { cosa.push('consumo ' + I.formattaConsumo(b.consumo, tipo.unita) + ' (' + I.formattaPercentuale(c.variazioneConsumo, true) + ')'); }
      avvisi.push({
        tipo: 'bolletta',
        livello: 'medio',
        testo: 'Bolletta ' + tipo.nome.toLowerCase() + ' ' + D.formattaData(b.periodoDal) + '–' + D.formattaData(b.periodoAl) +
          ': ' + cosa.join(' e ') + ' rispetto ' + rif + '.',
        rotta: '#/movimenti/bollette?tipo=' + b.tipo + '&apri=' + b.id
      });
    });
    return avvisi;
  }

  // Lavori in cui lo speso supera il preventivo scelto.
  function lavori(archivio) {
    return archivio.collezioni.lavori.map(function (l) {
      var r = L.riepilogo(archivio, l);
      if (!r.supera) { return null; }
      return {
        tipo: 'lavoro',
        livello: 'medio',
        testo: l.titolo + ': speso ' + I.formattaImporto(r.speso) + ' su un preventivo di ' + I.formattaImporto(r.preventivoScelto) +
          ' (' + I.formattaImporto(r.differenza) + ' in più).',
        rotta: '#/lavoro/' + l.id
      };
    }).filter(Boolean);
  }

  // Mesi in cui il dovuto al personale è diverso dal pagato.
  function personale(archivio, oggi) {
    var tolleranza = archivio.impostazioni.soglie.tolleranzaPersonaleCent;
    var avvisi = [];
    archivio.collezioni.persone.forEach(function (p) {
      P.differenze(archivio, p, oggi, tolleranza).forEach(function (r) {
        var verso = r.differenza > 0 ? 'da pagare ancora ' : 'pagato in più ';
        avvisi.push({
          tipo: 'personale',
          livello: 'medio',
          testo: p.nome + ', ' + D.formattaMese(r.mese) + ': dovuto ' + I.formattaImporto(r.dovuto) + ', pagato ' +
            I.formattaImporto(r.pagato) + ' (' + verso + I.formattaImporto(Math.abs(r.differenza)) + ').',
          rotta: '#/persona/' + p.id + '?mese=' + r.mese
        });
      });
    });
    return avvisi;
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
  var CONTROLLI = [impegniScaduti, previstiScaduti, bollette, lavori, personale, backup];

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
    CONTROLLI: CONTROLLI,
    impegniScaduti: impegniScaduti,
    previstiScaduti: previstiScaduti,
    bollette: bollette,
    lavori: lavori,
    personale: personale,
    backup: backup
  };

  GC.controlli = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
