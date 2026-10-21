/*
 * Gestionale casa — struttura dei dati, valori iniziali e migrazioni.
 *
 * L'archivio è un unico oggetto:
 *   { app, schemaVersion, meta, impostazioni, collezioni: { nome: [record] }, eliminati: [] }
 * Ogni record ha id, creatoIl e modificatoIl. I collegamenti tra record sono { tipo, id }.
 * Quando la struttura cambia: si alza VERSIONE e si aggiunge un passo in PASSI.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var B = GC.base || require('./base.js');

  var VERSIONE = 1;
  var APP = 'gestionale-casa';

  var COLLEZIONI = [
    'familiari', 'conti', 'categorie', 'budget', 'movimenti', 'ricorrenze', 'bollette',
    'lavori', 'preventivi', 'manutenzioni', 'interventi', 'persone', 'ore', 'rettifiche',
    'animali', 'eventiSanitari', 'impegni', 'energia'
  ];

  var NOMI_COLLEZIONI = {
    familiari: 'Familiari', conti: 'Conti', categorie: 'Categorie', budget: 'Budget', movimenti: 'Movimenti',
    ricorrenze: 'Ricorrenze', bollette: 'Bollette', lavori: 'Lavori', preventivi: 'Preventivi',
    manutenzioni: 'Manutenzioni', interventi: 'Interventi di manutenzione', persone: 'Personale',
    ore: 'Registro ore', rettifiche: 'Correzioni del dovuto', animali: 'Animali',
    eventiSanitari: 'Eventi sanitari', impegni: 'Impegni', energia: 'Dati energia'
  };

  // Tipi di collegamento: a quale collezione puntano e come si chiama l'elemento.
  var COLLEGAMENTI = {
    lavoro: { collezione: 'lavori', etichetta: 'Lavoro', nome: function (r) { return r.titolo; } },
    manutenzione: { collezione: 'manutenzioni', etichetta: 'Manutenzione', nome: function (r) { return r.nome; } },
    persona: { collezione: 'persone', etichetta: 'Persona', nome: function (r) { return r.nome; } },
    animale: { collezione: 'animali', etichetta: 'Animale', nome: function (r) { return r.nome; } },
    bolletta: { collezione: 'bollette', etichetta: 'Bolletta', nome: function (r) { return nomeBolletta(r); } }
  };

  var TIPI_BOLLETTA = {
    luce: { nome: 'Luce', unita: 'kWh' },
    gas: { nome: 'Gas', unita: 'Smc' },
    acqua: { nome: 'Acqua', unita: 'm³' }
  };

  var STATI_LAVORO = [
    { valore: 'idea', nome: 'Idea' },
    { valore: 'preventivo', nome: 'Preventivo' },
    { valore: 'approvato', nome: 'Approvato' },
    { valore: 'in_corso', nome: 'In corso' },
    { valore: 'finito', nome: 'Finito' }
  ];

  var TIPI_EVENTO = [
    { valore: 'vaccino', nome: 'Vaccino' },
    { valore: 'antiparassitario', nome: 'Antiparassitario' },
    { valore: 'visita', nome: 'Visita' },
    { valore: 'farmaco', nome: 'Farmaco' },
    { valore: 'altro', nome: 'Altro' }
  ];

  var REGIMI_GSE = [
    { valore: 'nessuno', nome: 'Nessuno' },
    { valore: 'ssp', nome: 'Scambio sul Posto' },
    { valore: 'rid', nome: 'Ritiro Dedicato' },
    { valore: 'cer', nome: 'Comunità energetica' }
  ];

  var FREQUENZE = [
    { mesi: 1, nome: 'Mensile' },
    { mesi: 2, nome: 'Bimestrale' },
    { mesi: 3, nome: 'Trimestrale' },
    { mesi: 6, nome: 'Semestrale' },
    { mesi: 12, nome: 'Annuale' }
  ];

  function nomeFrequenza(mesi) {
    for (var i = 0; i < FREQUENZE.length; i++) {
      if (FREQUENZE[i].mesi === mesi) { return FREQUENZE[i].nome; }
    }
    if (mesi === 24) { return 'Ogni 2 anni'; }
    if (mesi && mesi % 12 === 0) { return 'Ogni ' + (mesi / 12) + ' anni'; }
    return mesi ? 'Ogni ' + mesi + ' mesi' : 'Nessuna';
  }

  function nomeBolletta(b) {
    var tipo = TIPI_BOLLETTA[b.tipo] ? TIPI_BOLLETTA[b.tipo].nome : 'Bolletta';
    var periodo = '';
    if (b.periodoDal && b.periodoAl) {
      periodo = ' ' + b.periodoDal.slice(8, 10) + '/' + b.periodoDal.slice(5, 7) + '/' + b.periodoDal.slice(0, 4) +
        '–' + b.periodoAl.slice(8, 10) + '/' + b.periodoAl.slice(5, 7) + '/' + b.periodoAl.slice(0, 4);
    }
    return tipo + periodo;
  }

  /*
   * Categorie predefinite. Gli id sono fissi (non casuali) perché due dispositivi
   * partiti da zero abbiano le stesse categorie e i loro archivi si possano unire.
   * "ruolo" indica le categorie che il programma riconosce anche se vengono rinominate.
   */
  var CATEGORIE = [
    { id: 'casa', nome: 'Casa', verso: 'uscita', sotto: [
      { id: 'mutuo', nome: 'Mutuo o affitto' }, { id: 'condominio', nome: 'Condominio' },
      { id: 'imu', nome: 'IMU' }, { id: 'tari', nome: 'TARI' }, { id: 'assicurazioni', nome: 'Assicurazioni' }] },
    { id: 'utenze', nome: 'Utenze', verso: 'uscita', sotto: [
      { id: 'luce', nome: 'Luce', ruolo: 'luce' }, { id: 'gas', nome: 'Gas', ruolo: 'gas' },
      { id: 'acqua', nome: 'Acqua', ruolo: 'acqua' }, { id: 'internet', nome: 'Internet e telefono' }] },
    { id: 'lavori', nome: 'Lavori e manutenzioni', verso: 'uscita', ruolo: 'lavori', sotto: [
      { id: 'lavori', nome: 'Lavori', ruolo: 'lavoro' }, { id: 'manutenzioni', nome: 'Manutenzioni', ruolo: 'manutenzione' }] },
    { id: 'personale', nome: 'Personale', verso: 'uscita', ruolo: 'personale', sotto: [
      { id: 'stipendi', nome: 'Stipendi', ruolo: 'stipendi' }, { id: 'contributi', nome: 'Contributi', ruolo: 'contributi' },
      { id: 'tredicesima', nome: 'Tredicesima' }, { id: 'tfr', nome: 'TFR' }] },
    { id: 'animali', nome: 'Animali', verso: 'uscita', ruolo: 'animali', sotto: [
      { id: 'cibo', nome: 'Cibo' }, { id: 'veterinario', nome: 'Veterinario', ruolo: 'veterinario' },
      { id: 'farmaci', nome: 'Farmaci' }, { id: 'toelettatura', nome: 'Toelettatura' },
      { id: 'assicurazione', nome: 'Assicurazione' }] },
    { id: 'energia', nome: 'Energia', verso: 'entrambi', ruolo: 'energia', sotto: [
      { id: 'manutenzione', nome: 'Manutenzione impianto', verso: 'uscita' },
      { id: 'gse', nome: 'Ricavi GSE', verso: 'entrata', ruolo: 'gse' }] },
    { id: 'arredi', nome: 'Arredi ed elettrodomestici', verso: 'uscita', sotto: [] },
    { id: 'spesa', nome: 'Spesa e prodotti per la casa', verso: 'uscita', sotto: [] },
    { id: 'altro', nome: 'Altro', verso: 'entrambi', sotto: [] }
  ];

  function categoriePredefinite(ora) {
    var out = [];
    CATEGORIE.forEach(function (c, i) {
      var idPadre = 'cat-' + c.id;
      out.push({ id: idPadre, creatoIl: ora, modificatoIl: ora, nome: c.nome, padreId: null,
        verso: c.verso, ruolo: c.ruolo || null, ordine: i + 1, archiviata: false });
      c.sotto.forEach(function (s, j) {
        out.push({ id: idPadre + '-' + s.id, creatoIl: ora, modificatoIl: ora, nome: s.nome, padreId: idPadre,
          verso: s.verso || null, ruolo: s.ruolo || null, ordine: j + 1, archiviata: false });
      });
    });
    return out;
  }

  function impostazioniPredefinite(ora) {
    return {
      modificatoIl: ora || null,
      soglie: {
        bollettaPct: 30,
        bollettaUltime: 6,
        produzioneMinPct: 70,
        backupGiorni: 7,
        finestraGiorni: 30,
        tolleranzaPersonaleCent: 0
      },
      ricorrenzeMesiAvanti: 12,
      impianto: {
        potenzaW: null,
        batteria: false,
        capacitaBatteriaWh: null,
        regimeGse: 'nessuno',
        dataAttivazione: null,
        costoCent: null,
        produzioneAttesaWh: [null, null, null, null, null, null, null, null, null, null, null, null],
        costoKWhRiserva: null
      },
      profiloCsvEnergia: null
    };
  }

  function nuovoArchivio(ora) {
    var collezioni = {};
    COLLEZIONI.forEach(function (nome) { collezioni[nome] = []; });
    collezioni.categorie = categoriePredefinite(ora);
    return {
      app: APP,
      schemaVersion: VERSIONE,
      meta: { creatoIl: ora, ultimoBackupIl: null },
      impostazioni: impostazioniPredefinite(ora),
      collezioni: collezioni,
      eliminati: []
    };
  }

  // Aggiunge i valori predefiniti mancanti senza toccare quelli presenti.
  function completaOggetto(valore, predefinito) {
    if (!B.eOggetto(predefinito)) { return valore === undefined ? predefinito : valore; }
    var out = B.eOggetto(valore) ? Object.assign({}, valore) : {};
    Object.keys(predefinito).forEach(function (chiave) {
      out[chiave] = completaOggetto(out[chiave], predefinito[chiave]);
    });
    return out;
  }

  function completa(archivio, ora) {
    var a = Object.assign({}, archivio);
    a.app = APP;
    a.meta = completaOggetto(a.meta, { creatoIl: ora || null, ultimoBackupIl: null });
    a.impostazioni = completaOggetto(a.impostazioni, impostazioniPredefinite(null));
    var imp = a.impostazioni.impianto;
    if (!Array.isArray(imp.produzioneAttesaWh) || imp.produzioneAttesaWh.length !== 12) {
      var attesa = [];
      for (var i = 0; i < 12; i++) {
        attesa.push(Array.isArray(imp.produzioneAttesaWh) && imp.produzioneAttesaWh[i] != null ? imp.produzioneAttesaWh[i] : null);
      }
      a.impostazioni = Object.assign({}, a.impostazioni, { impianto: Object.assign({}, imp, { produzioneAttesaWh: attesa }) });
    }
    var collezioni = Object.assign({}, a.collezioni || {});
    COLLEZIONI.forEach(function (nome) {
      if (!Array.isArray(collezioni[nome])) { collezioni[nome] = []; }
    });
    a.collezioni = collezioni;
    if (!Array.isArray(a.eliminati)) { a.eliminati = []; }
    return a;
  }

  /*
   * Passi di migrazione: PASSI[n] porta un archivio dalla versione n alla n+1.
   * Esempio per il futuro (versione 2):
   *   function (a) { a.collezioni.garanzie = []; a.schemaVersion = 2; return a; }
   */
  var PASSI = [
    // 0 → 1: archivi senza numero di versione; prendono la struttura della versione 1.
    function (a) { a.schemaVersion = 1; return a; }
  ];

  function migra(archivio, ora) {
    if (!B.eOggetto(archivio)) { throw new Error('Il file non contiene un archivio valido.'); }
    var a = B.clona(archivio);
    var versione = typeof a.schemaVersion === 'number' ? a.schemaVersion : 0;
    if (versione > VERSIONE) {
      throw new Error('Questi dati sono stati creati da una versione più recente del programma (versione dati ' +
        versione + ', questa è la ' + VERSIONE + '). Aggiorna la pagina e riprova.');
    }
    while (versione < VERSIONE) {
      a = PASSI[versione](a, ora);
      versione = a.schemaVersion;
    }
    return completa(a, ora);
  }

  // Controlla la forma dell'archivio; restituisce l'elenco dei problemi trovati.
  function controlla(archivio) {
    var errori = [];
    if (!B.eOggetto(archivio)) { return ['Il contenuto non è un archivio.']; }
    if (archivio.app !== APP) { errori.push('Il file non è un backup del Gestionale casa.'); }
    if (!B.eOggetto(archivio.collezioni)) { errori.push('Mancano le collezioni dei dati.'); return errori; }
    var visti = {};
    COLLEZIONI.forEach(function (nome) {
      var lista = archivio.collezioni[nome];
      if (lista === undefined) { return; }
      if (!Array.isArray(lista)) { errori.push('La collezione "' + nome + '" non è un elenco.'); return; }
      lista.forEach(function (r, i) {
        if (!B.eOggetto(r) || typeof r.id !== 'string' || !r.id) {
          errori.push('Record senza id nella collezione "' + nome + '" (posizione ' + (i + 1) + ').');
          return;
        }
        var chiave = nome + '|' + r.id;
        if (visti[chiave]) { errori.push('Id ripetuto nella collezione "' + nome + '": ' + r.id); }
        visti[chiave] = true;
      });
    });
    return errori;
  }

  var api = {
    VERSIONE: VERSIONE,
    APP: APP,
    COLLEZIONI: COLLEZIONI,
    NOMI_COLLEZIONI: NOMI_COLLEZIONI,
    COLLEGAMENTI: COLLEGAMENTI,
    TIPI_BOLLETTA: TIPI_BOLLETTA,
    STATI_LAVORO: STATI_LAVORO,
    TIPI_EVENTO: TIPI_EVENTO,
    REGIMI_GSE: REGIMI_GSE,
    FREQUENZE: FREQUENZE,
    nomeFrequenza: nomeFrequenza,
    nomeBolletta: nomeBolletta,
    categoriePredefinite: categoriePredefinite,
    impostazioniPredefinite: impostazioniPredefinite,
    nuovoArchivio: nuovoArchivio,
    completa: completa,
    migra: migra,
    controlla: controlla
  };

  GC.schema = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
