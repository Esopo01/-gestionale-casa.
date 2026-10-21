/*
 * Gestionale casa — dati di prova.
 * Genera 14 mesi di dati inventati (nessun dato reale) che terminano con "oggi".
 * Sono costruiti in modo da far scattare almeno un avviso per ogni controllo:
 * impegno scaduto, previsto non confermato, bolletta oltre soglia, lavoro oltre
 * preventivo, personale con dovuto diverso dal pagato, produzione bassa, backup vecchio.
 * I numeri casuali sono ripetibili (seme fisso), così i test sono stabili.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var B = GC.base || require('./base.js');
  var D = GC.date || require('./date.js');
  var I = GC.importi || require('./importi.js');
  var S = GC.schema || require('./schema.js');
  var M = GC.movimenti || require('./movimenti.js');

  function generatore(seme) {
    var t = seme >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // kWh attesi e prelevati dalla rete per mese (gennaio … dicembre), valori inventati.
  var ATTESA_KWH = [260, 360, 560, 700, 800, 840, 880, 790, 610, 430, 280, 220];
  var PRELEVATA_KWH = [230, 200, 170, 140, 120, 150, 190, 180, 140, 160, 200, 240];
  var GAS_SMC = [160, 140, 100, 60, 30, 15, 12, 12, 20, 55, 110, 150];

  function genera(oggi, ora) {
    var casuale = generatore(20261021);
    function tra(min, max) { return min + (max - min) * casuale(); }
    function centesimi(min, max) { return Math.round(tra(min, max)) * 100 + Math.round(tra(0, 99)); }

    var a = S.nuovoArchivio(ora);
    var c = a.collezioni;
    function aggiungi(nome, campi) {
      var r = Object.assign({}, campi, { id: B.nuovoId(), creatoIl: ora, modificatoIl: ora });
      c[nome].push(r);
      return r;
    }
    function movimento(campi) {
      return aggiungi('movimenti', M.nuovoMovimento(campi));
    }

    var meseCorrente = D.mese(oggi);
    var primoMese = D.spostaMese(meseCorrente, -13);
    var mesi = D.elencoMesi(primoMese, meseCorrente);
    var inizio = D.primoGiorno(primoMese);
    var mesiConclusi = mesi.slice(0, -1);
    function giorno(mese, g) { return mese + '-' + String(Math.min(g, D.giorniDelMese(mese))).padStart(2, '0'); }
    function statoDi(data) { return data < oggi ? 'effettivo' : 'previsto'; }

    // --- Famiglia e conti ---
    var giulia = aggiungi('familiari', { nome: 'Giulia (esempio)' });
    var marco = aggiungi('familiari', { nome: 'Marco (esempio)' });
    var conto = aggiungi('conti', { nome: 'Conto cointestato (esempio)' });
    var carta = aggiungi('conti', { nome: 'Carta di credito (esempio)' });
    var contanti = aggiungi('conti', { nome: 'Contanti' });
    var tuttiConti = [conto, carta, contanti];

    // --- Personale e animali (servono ai collegamenti delle ricorrenze) ---
    var aumento = D.primoGiorno(D.spostaMese(meseCorrente, -6));
    var anna = aggiungi('persone', {
      nome: 'Anna (esempio)', ruolo: 'Collaboratrice domestica', telefono: '000 0000000', email: '',
      tipoRapporto: 'Lavoro domestico a ore', giorniOrario: 'lunedì e giovedì, 9:00–13:00',
      paghe: [{ dal: inizio, tipo: 'oraria', importoCent: 950 }, { dal: aumento, tipo: 'oraria', importoCent: 1000 }],
      dataInizio: inizio, dataFine: null, attiva: true, note: 'Persona inventata per i dati di prova.'
    });
    var paolo = aggiungi('persone', {
      nome: 'Paolo (esempio)', ruolo: 'Giardiniere', telefono: '', email: '',
      tipoRapporto: 'Prestazione occasionale', giorniOrario: 'un sabato al mese',
      paghe: [{ dal: inizio, tipo: 'mensile', importoCent: 15000 }],
      dataInizio: inizio, dataFine: null, attiva: true, note: ''
    });
    var briciola = aggiungi('animali', {
      nome: 'Briciola (esempio)', specie: 'Cane', razza: 'Meticcio', dataNascita: D.aggiungiMesi(oggi, -50),
      microchip: '000000000000000', veterinario: 'Ambulatorio veterinario Esempio, tel. 000 0000000',
      assicurazione: 'Compagnia Esempio, polizza n. 0000', attivo: true, note: ''
    });
    var micio = aggiungi('animali', {
      nome: 'Micio (esempio)', specie: 'Gatto', razza: 'Europeo', dataNascita: D.aggiungiMesi(oggi, -30),
      microchip: '', veterinario: 'Ambulatorio veterinario Esempio', assicurazione: '', attivo: true, note: ''
    });

    // --- Ricorrenze: generano i previsti; quelli passati vengono poi confermati ---
    function ricorrenza(campi) {
      return aggiungi('ricorrenze', Object.assign({
        dataFine: null, verso: 'uscita', sottocategoriaId: null, controparte: '', collegamento: null,
        detraibile: false, contoId: conto.id, responsabileId: null, note: '', attiva: true, generataFinoAl: null
      }, campi));
    }
    ricorrenza({ descrizione: 'Rata mutuo', ogniMesi: 1, dataInizio: giorno(primoMese, 5), importoCent: 64530,
      categoriaId: 'cat-casa', sottocategoriaId: 'cat-casa-mutuo', controparte: 'Banca Esempio', responsabileId: marco.id });
    ricorrenza({ descrizione: 'Spese condominiali', ogniMesi: 3, dataInizio: giorno(primoMese, 10), importoCent: 31000,
      categoriaId: 'cat-casa', sottocategoriaId: 'cat-casa-condominio', controparte: 'Amministrazione condominio (esempio)' });
    ricorrenza({ descrizione: 'TARI', ogniMesi: 6, dataInizio: giorno(D.spostaMese(primoMese, 1), 16), importoCent: 14200,
      categoriaId: 'cat-casa', sottocategoriaId: 'cat-casa-tari', controparte: 'Comune (esempio)', responsabileId: giulia.id });
    ricorrenza({ descrizione: 'Assicurazione casa', ogniMesi: 12, dataInizio: giorno(D.spostaMese(primoMese, 2), 20), importoCent: 26500,
      categoriaId: 'cat-casa', sottocategoriaId: 'cat-casa-assicurazioni', controparte: 'Assicurazioni Esempio' });
    var internet = ricorrenza({ descrizione: 'Internet e telefono', ogniMesi: 1, dataInizio: giorno(primoMese, 3), importoCent: 2790,
      categoriaId: 'cat-utenze', sottocategoriaId: 'cat-utenze-internet', controparte: 'Operatore Esempio', contoId: carta.id });
    ricorrenza({ descrizione: 'Contributi lavoro domestico', ogniMesi: 3, dataInizio: giorno(D.spostaMese(primoMese, 1), 10), importoCent: 16200,
      categoriaId: 'cat-personale', sottocategoriaId: 'cat-personale-contributi', controparte: 'Ente previdenziale (esempio)',
      collegamento: { tipo: 'persona', id: anna.id }, responsabileId: giulia.id });
    ricorrenza({ descrizione: 'Assicurazione cane', ogniMesi: 12, dataInizio: giorno(D.spostaMese(primoMese, 4), 12), importoCent: 9800,
      categoriaId: 'cat-animali', sottocategoriaId: 'cat-animali-assicurazione', controparte: 'Compagnia Esempio',
      collegamento: { tipo: 'animale', id: briciola.id } });
    ricorrenza({ descrizione: 'Cibo per animali', ogniMesi: 1, dataInizio: giorno(primoMese, 22), importoCent: 4500,
      categoriaId: 'cat-animali', sottocategoriaId: 'cat-animali-cibo', controparte: 'Negozio animali (esempio)', contoId: carta.id });

    // --- Energia: produzione mensile; l'ultimo mese concluso è basso (avviso) ---
    var prelevata = {};
    mesi.forEach(function (m) {
      prelevata[m] = Math.round(PRELEVATA_KWH[Number(m.slice(5, 7)) - 1] * tra(0.92, 1.08)) * 1000;
    });

    // Periodi delle bollette della luce (bimestrali), arrivate entro oggi.
    function periodi(mesiPerPeriodo) {
      var out = [];
      mesi.forEach(function (m) {
        if ((Number(m.slice(5, 7)) - 1) % mesiPerPeriodo !== 0) { return; }
        var ultimo = D.spostaMese(m, mesiPerPeriodo - 1);
        var dal = D.primoGiorno(m);
        var al = D.ultimoGiorno(ultimo);
        if (D.aggiungiGiorni(al, 10) > oggi) { return; }
        var dentro = [];
        for (var k = 0; k < mesiPerPeriodo; k++) { dentro.push(D.spostaMese(m, k)); }
        out.push({ dal: dal, al: al, mesi: dentro });
      });
      return out;
    }
    var periodiLuce = periodi(2);
    // L'ultima bolletta della luce consuma molto di più (condizionatori accesi): avviso.
    if (periodiLuce.length > 1) {
      var ultimoP = periodiLuce[periodiLuce.length - 1];
      var massimoPrima = 0;
      periodiLuce.slice(0, -1).forEach(function (p) {
        var s = B.somma(p.mesi, function (m) { return prelevata[m] || 0; });
        if (s > massimoPrima) { massimoPrima = s; }
      });
      var naturale = B.somma(ultimoP.mesi, function (m) { return prelevata[m] || 0; });
      var fattore = Math.max(1.7, 1.6 * massimoPrima / naturale);
      ultimoP.mesi.forEach(function (m) { prelevata[m] = Math.round(prelevata[m] * fattore / 1000) * 1000; });
    }

    var imp = a.impostazioni.impianto;
    imp.potenzaW = 6000;
    imp.batteria = true;
    imp.capacitaBatteriaWh = 10000;
    imp.regimeGse = 'ssp';
    imp.dataAttivazione = inizio;
    imp.costoCent = 1150000;
    imp.produzioneAttesaWh = ATTESA_KWH.map(function (k) { return k * 1000; });
    imp.costoKWhRiserva = 250000;

    var ultimoConcluso = mesiConclusi[mesiConclusi.length - 1];
    mesiConclusi.forEach(function (m) {
      var attesa = ATTESA_KWH[Number(m.slice(5, 7)) - 1] * 1000;
      var prodotta = Math.round(attesa * (m === ultimoConcluso ? 0.6 : tra(0.88, 1.08)) / 100) * 100;
      var carica = Math.round(prodotta * 0.18 / 100) * 100;
      aggiungi('energia', {
        periodo: m, prodottaWh: prodotta, immessaWh: Math.round(prodotta * tra(0.35, 0.45) / 100) * 100,
        prelevataWh: prelevata[m], consumoWh: null, batteriaCaricaWh: carica,
        batteriaScaricaWh: Math.round(carica * 0.92 / 100) * 100, origine: 'manuale'
      });
    });
    // Mese in corso: dati giornalieri, come da un'importazione CSV.
    var giorniCorrenti = D.differenzaGiorni(D.primoGiorno(meseCorrente), oggi);
    var attesaGiorno = ATTESA_KWH[Number(meseCorrente.slice(5, 7)) - 1] * 1000 / D.giorniDelMese(meseCorrente);
    var prelevataGiorno = prelevata[meseCorrente] / D.giorniDelMese(meseCorrente);
    for (var g = 1; g <= giorniCorrenti; g++) {
      var prodGiorno = Math.round(attesaGiorno * tra(0.3, 1.5) / 100) * 100;
      aggiungi('energia', {
        periodo: giorno(meseCorrente, g), prodottaWh: prodGiorno,
        immessaWh: Math.round(prodGiorno * tra(0.3, 0.5) / 100) * 100,
        prelevataWh: Math.round(prelevataGiorno * tra(0.7, 1.3) / 100) * 100,
        consumoWh: null, batteriaCaricaWh: null, batteriaScaricaWh: null, origine: 'csv'
      });
    }

    // --- Bollette ---
    function bolletta(tipo, p, consumo, importoCent, quotaFissaCent, fornitore, sottocategoria) {
      var b = aggiungi('bollette', { tipo: tipo, periodoDal: p.dal, periodoAl: p.al, consumo: consumo,
        quotaFissaCent: quotaFissaCent, numero: '', note: '' });
      var data = D.aggiungiGiorni(p.al, 30);
      movimento({ data: data, importoCent: importoCent, importoPrevistoCent: importoCent, verso: 'uscita',
        categoriaId: 'cat-utenze', sottocategoriaId: sottocategoria, stato: statoDi(data), controparte: fornitore,
        collegamento: { tipo: 'bolletta', id: b.id }, contoId: conto.id, responsabileId: giulia.id });
    }
    periodiLuce.forEach(function (p) {
      var wh = B.somma(p.mesi, function (m) { return prelevata[m] || 0; });
      var fissa = 3200;
      bolletta('luce', p, wh, fissa + I.valoreEnergia(wh, 270000), fissa, 'Fornitore luce (esempio)', 'cat-utenze-luce');
    });
    periodi(2).forEach(function (p) {
      var smc = B.somma(p.mesi, function (m) { return Math.round(GAS_SMC[Number(m.slice(5, 7)) - 1] * tra(0.9, 1.1)); });
      bolletta('gas', p, smc * 1000, 1800 + smc * 105, null, 'Fornitore gas (esempio)', 'cat-utenze-gas');
    });
    periodi(3).forEach(function (p) {
      var mc = Math.round(tra(34, 46));
      bolletta('acqua', p, mc * 1000, 2500 + mc * 210, null, 'Gestore acqua (esempio)', 'cat-utenze-acqua');
    });

    // --- Lavori ---
    function lavoro(campi, preventivi, pagamenti) {
      var l = aggiungi('lavori', Object.assign({ descrizione: '', contatti: '', dataInizio: null, dataFine: null,
        detrazionePct: null, detrazioneAnni: null, note: '', documento: '' }, campi));
      preventivi.forEach(function (p) {
        aggiungi('preventivi', Object.assign({ lavoroId: l.id, documento: '', note: '' }, p));
      });
      pagamenti.forEach(function (p) {
        movimento({ data: p.data, importoCent: p.importoCent, importoPrevistoCent: p.importoCent, verso: 'uscita',
          categoriaId: 'cat-lavori', sottocategoriaId: 'cat-lavori-lavori', stato: statoDi(p.data),
          controparte: campi.fornitore, collegamento: { tipo: 'lavoro', id: l.id }, detraibile: !!campi.detrazionePct,
          contoId: conto.id, note: p.note });
      });
      return l;
    }
    var mBagno = mesi[3];
    lavoro({ titolo: 'Rifacimento bagno (esempio)', descrizione: 'Nuovi sanitari, piastrelle e doccia.',
      fornitore: 'Edilizia Esempio srl', contatti: 'tel. 000 0000000', stato: 'finito',
      dataInizio: giorno(mBagno, 10), dataFine: giorno(D.spostaMese(mBagno, 2), 20), detrazionePct: 50, detrazioneAnni: 10 },
    [{ fornitore: 'Edilizia Esempio srl', data: giorno(D.spostaMese(mBagno, -1), 12), importoCent: 850000, scelto: true },
      { fornitore: 'Ristrutturazioni Demo', data: giorno(D.spostaMese(mBagno, -1), 18), importoCent: 920000, scelto: false }],
    [{ data: giorno(mBagno, 5), importoCent: 300000, note: 'Acconto' },
      { data: giorno(D.spostaMese(mBagno, 1), 15), importoCent: 300000, note: 'Secondo acconto' },
      { data: giorno(D.spostaMese(mBagno, 2), 25), importoCent: 315000, note: 'Saldo (lavori extra)' }]);
    lavoro({ titolo: 'Sostituzione infissi (esempio)', fornitore: 'Serramenti Esempio', stato: 'in_corso',
      dataInizio: D.aggiungiGiorni(oggi, -20), detrazionePct: 50, detrazioneAnni: 10 },
    [{ fornitore: 'Serramenti Esempio', data: D.aggiungiGiorni(oggi, -60), importoCent: 620000, scelto: true }],
    [{ data: D.aggiungiGiorni(oggi, -20), importoCent: 200000, note: 'Acconto' },
      { data: D.aggiungiGiorni(oggi, 40), importoCent: 420000, note: 'Saldo a fine lavori' }]);
    lavoro({ titolo: 'Tinteggiatura soggiorno (esempio)', fornitore: 'Imbianchino Esempio', stato: 'preventivo' },
      [{ fornitore: 'Imbianchino Esempio', data: D.aggiungiGiorni(oggi, -15), importoCent: 125000, scelto: false }], []);
    lavoro({ titolo: 'Pergola in giardino (esempio)', fornitore: '', stato: 'idea' }, [], []);

    // --- Manutenzioni periodiche ---
    function manutenzione(campi, costoCent, categoria) {
      var mt = aggiungi('manutenzioni', Object.assign({ contatti: '', attiva: true, note: '',
        categoriaId: categoria[0], sottocategoriaId: categoria[1] }, campi, { costoAbitualeCent: costoCent }));
      aggiungi('interventi', { manutenzioneId: mt.id, data: campi.ultimaData, note: '', documento: '', movimentoId: null });
      if (campi.ultimaData >= inizio) {
        movimento({ data: campi.ultimaData, importoCent: costoCent, verso: 'uscita', categoriaId: categoria[0],
          sottocategoriaId: categoria[1], stato: 'effettivo', controparte: campi.fornitore,
          collegamento: { tipo: 'manutenzione', id: mt.id }, contoId: conto.id });
      }
      return mt;
    }
    var lavoriMan = ['cat-lavori', 'cat-lavori-manutenzioni'];
    manutenzione({ nome: 'Caldaia: controllo e pulizia (esempio)', ogniMesi: 12,
      ultimaData: D.aggiungiGiorni(D.aggiungiMesi(oggi, -12), 20), fornitore: 'Termoidraulica Esempio', responsabileId: marco.id }, 12000, lavoriMan);
    manutenzione({ nome: 'Condizionatori: pulizia filtri (esempio)', ogniMesi: 12,
      ultimaData: D.aggiungiMesi(oggi, -13), fornitore: 'Clima Esempio', responsabileId: marco.id }, 8000, lavoriMan);
    manutenzione({ nome: 'Pannelli fotovoltaici: pulizia (esempio)', ogniMesi: 12,
      ultimaData: D.aggiungiMesi(oggi, -5), fornitore: 'Solare Esempio', responsabileId: marco.id }, 9000, ['cat-energia', 'cat-energia-manutenzione']);
    manutenzione({ nome: 'Depuratore: cambio filtri (esempio)', ogniMesi: 6,
      ultimaData: D.aggiungiMesi(oggi, -4), fornitore: 'Acqua Esempio', responsabileId: giulia.id }, 4500, lavoriMan);

    // --- Personale: ore e pagamenti; un mese pagato 10 € in meno (avviso) ---
    var orePerMese = {};
    for (var d = inizio; d < oggi; d = D.aggiungiGiorni(d, 1)) {
      var gs = D.giornoSettimana(d);
      if (gs !== 0 && gs !== 3) { continue; }
      var minuti = casuale() < 0.15 ? 180 : (casuale() < 0.1 ? 300 : 240);
      aggiungi('ore', { personaId: anna.id, data: d, minuti: minuti, note: '' });
      var pagaOra = d >= aumento ? 1000 : 950;
      orePerMese[D.mese(d)] = (orePerMese[D.mese(d)] || 0) + minuti * pagaOra;
    }
    var meseSbagliato = D.spostaMese(meseCorrente, -3);
    mesiConclusi.forEach(function (m) {
      var dovuto = Math.round((orePerMese[m] || 0) / 60);
      if (dovuto > 0) {
        movimento({ data: D.ultimoGiorno(m), importoCent: m === meseSbagliato ? dovuto - 1000 : dovuto, verso: 'uscita',
          categoriaId: 'cat-personale', sottocategoriaId: 'cat-personale-stipendi', stato: 'effettivo',
          controparte: anna.nome, collegamento: { tipo: 'persona', id: anna.id }, competenza: m,
          contoId: contanti.id, responsabileId: giulia.id });
      }
      movimento({ data: giorno(m, 28), importoCent: 15000, verso: 'uscita', categoriaId: 'cat-personale',
        sottocategoriaId: 'cat-personale-stipendi', stato: 'effettivo', controparte: paolo.nome,
        collegamento: { tipo: 'persona', id: paolo.id }, competenza: m, contoId: contanti.id });
      if (m.slice(5, 7) === '12') {
        movimento({ data: giorno(m, 20), importoCent: 33000, verso: 'uscita', categoriaId: 'cat-personale',
          sottocategoriaId: 'cat-personale-tredicesima', stato: 'effettivo', controparte: anna.nome,
          collegamento: { tipo: 'persona', id: anna.id }, competenza: m, contoId: conto.id });
      }
    });

    // --- Animali: eventi sanitari e spese ---
    function evento(campi, costo) {
      var e = aggiungi('eventiSanitari', Object.assign({ dataRichiamo: null, richiamoFattoIl: null,
        responsabileId: giulia.id, note: '', documento: '' }, campi));
      if (costo && campi.data >= inizio) {
        movimento({ data: campi.data, importoCent: costo, verso: 'uscita', categoriaId: 'cat-animali',
          sottocategoriaId: campi.tipo === 'farmaco' || campi.tipo === 'antiparassitario' ? 'cat-animali-farmaci' : 'cat-animali-veterinario',
          stato: 'effettivo', controparte: 'Ambulatorio veterinario Esempio',
          collegamento: { tipo: 'animale', id: campi.animaleId }, detraibile: campi.tipo !== 'antiparassitario',
          contoId: carta.id });
      }
      return e;
    }
    evento({ animaleId: briciola.id, tipo: 'vaccino', data: D.aggiungiGiorni(oggi, -355), descrizione: 'Polivalente',
      dataRichiamo: D.aggiungiGiorni(oggi, 10) }, 5500);
    for (var k = 0; ; k++) {
      var dataAnti = D.aggiungiMesi(D.aggiungiGiorni(inizio, 6), k * 3);
      if (dataAnti >= oggi) { break; }
      evento({ animaleId: briciola.id, tipo: 'antiparassitario', data: dataAnti, descrizione: 'Antiparassitario trimestrale',
        dataRichiamo: D.aggiungiMesi(dataAnti, 3) }, 3900);
    }
    evento({ animaleId: briciola.id, tipo: 'visita', data: D.aggiungiGiorni(oggi, -120), descrizione: 'Controllo annuale' }, 6500);
    evento({ animaleId: micio.id, tipo: 'vaccino', data: D.aggiungiGiorni(oggi, -300), descrizione: 'Trivalente',
      dataRichiamo: D.aggiungiGiorni(oggi, 65) }, 4800);
    mesi.forEach(function (m, i) {
      if (i % 2 === 0) {
        var dataT = giorno(m, 14);
        if (dataT < oggi) {
          movimento({ data: dataT, importoCent: 4000, verso: 'uscita', categoriaId: 'cat-animali',
            sottocategoriaId: 'cat-animali-toelettatura', stato: 'effettivo', controparte: 'Toelettatura Esempio',
            collegamento: { tipo: 'animale', id: briciola.id }, contoId: contanti.id });
        }
      }
    });

    // --- Impegni inseriti a mano ---
    function impegno(campi) {
      return aggiungi('impegni', Object.assign({ ora: null, ogniMesi: null, ricorrenzaInizio: null, responsabileId: null,
        stato: 'da_fare', fattoIl: null, collegamento: null, note: '' }, campi));
    }
    impegno({ titolo: 'Rinnovare la carta d\'identità (esempio)', data: D.aggiungiGiorni(oggi, -5), responsabileId: giulia.id });
    impegno({ titolo: 'Riunione di condominio (esempio)', data: D.aggiungiGiorni(oggi, 12), ora: '18:30', responsabileId: marco.id });
    var lettura = D.aggiungiGiorni(oggi, 20);
    impegno({ titolo: 'Autolettura contatore acqua (esempio)', data: lettura, ogniMesi: 3, ricorrenzaInizio: lettura, responsabileId: marco.id });
    impegno({ titolo: 'Revisione estintore (esempio)', data: D.aggiungiGiorni(oggi, -40), stato: 'fatto',
      fattoIl: D.aggiungiGiorni(oggi, -38), responsabileId: marco.id });

    // --- Spese varie ---
    for (var giornoSpesa = D.aggiungiGiorni(inizio, 2); giornoSpesa < oggi; giornoSpesa = D.aggiungiGiorni(giornoSpesa, Math.round(tra(4, 9)))) {
      movimento({ data: giornoSpesa, importoCent: centesimi(35, 140), verso: 'uscita', categoriaId: 'cat-spesa',
        stato: 'effettivo', controparte: casuale() < 0.5 ? 'Supermercato Esempio' : 'Mercato rionale',
        contoId: tuttiConti[Math.floor(casuale() * 3)].id });
    }
    movimento({ data: giorno(mesi[6], 14), importoCent: 54900, verso: 'uscita', categoriaId: 'cat-arredi', stato: 'effettivo',
      controparte: 'Elettrodomestici Esempio', note: 'Lavatrice (esempio)', documento: 'scontrino-lavatrice.pdf', contoId: carta.id });
    movimento({ data: giorno(mesi[9], 3), importoCent: 7990, verso: 'uscita', categoriaId: 'cat-arredi', stato: 'effettivo',
      controparte: 'Arredamenti Esempio', note: 'Lampada da terra', contoId: carta.id });
    movimento({ data: giorno(mesi[8], 21), importoCent: 3500, verso: 'uscita', categoriaId: 'cat-altro', stato: 'effettivo',
      controparte: 'Ferramenta Esempio', note: 'Piccole riparazioni', contoId: contanti.id });

    // --- Ricavi GSE (inseriti a mano dagli estratti) ---
    mesi.forEach(function (m, i) {
      if (i % 3 !== 2) { return; }
      var dataG = giorno(m, 25);
      if (dataG >= oggi) { return; }
      movimento({ data: dataG, importoCent: centesimi(55, 95), verso: 'entrata', categoriaId: 'cat-energia',
        sottocategoriaId: 'cat-energia-gse', stato: 'effettivo', controparte: 'GSE', contoId: conto.id,
        note: 'Acconto contributo (esempio)' });
    });

    // --- Budget dell'anno in corso ---
    var anno = Number(oggi.slice(0, 4));
    [['cat-casa', 1100000], ['cat-utenze', 240000], ['cat-spesa', 550000], ['cat-animali', 150000],
      ['cat-lavori', 1600000], ['cat-personale', 600000]].forEach(function (b) {
      aggiungi('budget', { anno: anno, categoriaId: b[0], importoCent: b[1] });
    });

    // Previsti delle ricorrenze: quelli passati risultano pagati, tranne l'ultimo di internet (avviso).
    a = M.generaPrevisti(a, oggi, ora).archivio;
    var internetPassati = a.collezioni.movimenti.filter(function (m) {
      return m.ricorrenzaId === internet.id && m.data < oggi;
    }).sort(function (x, y) { return x.data < y.data ? 1 : -1; });
    var lasciaPrevisto = internetPassati.length ? internetPassati[0].id : null;
    a.collezioni.movimenti = a.collezioni.movimenti.map(function (m) {
      if (m.ricorrenzaId && m.stato === 'previsto' && m.data < oggi && m.id !== lasciaPrevisto) {
        return Object.assign({}, m, { stato: 'effettivo' });
      }
      return m;
    });

    a.meta.ultimoBackupIl = D.aggiungiGiorni(oggi, -10) + 'T18:00:00.000Z';
    return a;
  }

  var api = { genera: genera };

  GC.demo = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
