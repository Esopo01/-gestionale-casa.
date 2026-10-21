/*
 * Gestionale casa — registro movimenti: categorie, totali, budget, ricorrenze,
 * spesa rapida ed esportazione CSV.
 * Un movimento ha sempre importoCent positivo; "verso" dice se è uscita o entrata.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var B = GC.base || require('./base.js');
  var D = GC.date || require('./date.js');
  var I = GC.importi || require('./importi.js');
  var S = GC.schema || require('./schema.js');
  var A = GC.archivio || require('./archivio.js');
  var CSV = GC.csv || require('./csv.js');

  // --- Categorie ---

  function ordinaCategorie(a, b) {
    return (a.ordine || 0) - (b.ordine || 0) || B.confrontaTesti(a.nome, b.nome);
  }

  function versoCategoria(categorie, c) {
    if (c.verso) { return c.verso; }
    var padre = c.padreId ? B.perId(categorie)[c.padreId] : null;
    return padre ? padre.verso : 'entrambi';
  }

  function ammessa(categorie, c, verso) {
    if (!verso) { return true; }
    var v = versoCategoria(categorie, c);
    return v === 'entrambi' || v === verso;
  }

  function principali(categorie, verso, conArchiviate) {
    return categorie.filter(function (c) {
      return !c.padreId && (conArchiviate || !c.archiviata) && ammessa(categorie, c, verso);
    }).sort(ordinaCategorie);
  }

  function sottocategorie(categorie, padreId, verso, conArchiviate) {
    return categorie.filter(function (c) {
      return c.padreId === padreId && (conArchiviate || !c.archiviata) && ammessa(categorie, c, verso);
    }).sort(ordinaCategorie);
  }

  function perRuolo(categorie, ruolo) {
    for (var i = 0; i < categorie.length; i++) { if (categorie[i].ruolo === ruolo) { return categorie[i]; } }
    return null;
  }

  // Categoria e sottocategoria (se c'è) da usare per un ruolo, es. "stipendi".
  function coppiaPerRuolo(categorie, ruolo) {
    var c = perRuolo(categorie, ruolo);
    if (!c) { return { categoriaId: null, sottocategoriaId: null }; }
    return c.padreId ? { categoriaId: c.padreId, sottocategoriaId: c.id } : { categoriaId: c.id, sottocategoriaId: null };
  }

  function ruoloDiMovimento(categorie, m) {
    var mappa = B.perId(categorie);
    var sotto = m.sottocategoriaId ? mappa[m.sottocategoriaId] : null;
    if (sotto && sotto.ruolo) { return sotto.ruolo; }
    var cat = mappa[m.categoriaId];
    return cat ? cat.ruolo : null;
  }

  function nomeCategoria(categorie, categoriaId, sottocategoriaId) {
    var mappa = B.perId(categorie);
    var c = mappa[categoriaId];
    var s = sottocategoriaId ? mappa[sottocategoriaId] : null;
    if (!c) { return 'Senza categoria'; }
    return s ? c.nome + ' › ' + s.nome : c.nome;
  }

  // Quante volte una categoria è usata (come categoria o sottocategoria).
  function usiCategoria(archivio, id) {
    var usa = function (r) { return r.categoriaId === id || r.sottocategoriaId === id; };
    var c = archivio.collezioni;
    return c.movimenti.filter(usa).length + c.ricorrenze.filter(usa).length +
      c.manutenzioni.filter(usa).length + c.budget.filter(function (b) { return b.categoriaId === id; }).length;
  }

  function eliminaCategoria(archivio, id, ora) {
    var categorie = archivio.collezioni.categorie;
    var figlie = categorie.filter(function (c) { return c.padreId === id; });
    var tutte = [id].concat(figlie.map(function (f) { return f.id; }));
    var usi = tutte.reduce(function (t, x) { return t + usiCategoria(archivio, x); }, 0);
    if (usi > 0) { throw new Error('La categoria è usata da ' + usi + ' elementi: puoi archiviarla, ma non eliminarla.'); }
    var c = A.trova(archivio, 'categorie', id);
    if (c && c.ruolo || figlie.some(function (f) { return f.ruolo; })) {
      throw new Error('Questa categoria serve al programma (bollette, personale, GSE…): puoi rinominarla ma non eliminarla.');
    }
    return A.eliminaDove(archivio, 'categorie', function (r) { return tutte.indexOf(r.id) >= 0; }, ora);
  }

  // --- Movimenti ---

  function meseCompetenza(m) {
    return m.competenza || D.mese(m.data);
  }

  function nuovoMovimento(campi) {
    return Object.assign({
      data: null, importoCent: 0, verso: 'uscita', categoriaId: null, sottocategoriaId: null,
      stato: 'effettivo', importoPrevistoCent: null, controparte: '', collegamento: null,
      competenza: null, detraibile: false, contoId: null, responsabileId: null,
      note: '', documento: '', ricorrenzaId: null
    }, campi);
  }

  function validaMovimento(m, categorie) {
    var errori = [];
    if (!D.valida(m.data)) { errori.push('Inserisci una data valida.'); }
    if (!(m.importoCent > 0)) { errori.push('Inserisci un importo maggiore di zero.'); }
    if (m.verso !== 'uscita' && m.verso !== 'entrata') { errori.push('Scegli uscita o entrata.'); }
    if (m.stato !== 'previsto' && m.stato !== 'effettivo') { errori.push('Scegli previsto o effettivo.'); }
    if (!m.categoriaId || !B.perId(categorie)[m.categoriaId]) { errori.push('Scegli una categoria.'); }
    if (m.competenza && !D.meseValido(m.competenza)) { errori.push('Il mese di competenza non è valido.'); }
    return errori;
  }

  // Saldo con segno: uscite positive, entrate negative (utile per i costi di un lavoro).
  function costoNetto(movimenti) {
    return B.somma(movimenti, function (m) { return m.verso === 'uscita' ? m.importoCent : -m.importoCent; });
  }

  function filtra(movimenti, filtro, categorie) {
    filtro = filtro || {};
    var testo = B.normalizza(filtro.testo);
    var mappa = categorie ? B.perId(categorie) : {};
    return movimenti.filter(function (m) {
      if (filtro.da && m.data < filtro.da) { return false; }
      if (filtro.a && m.data > filtro.a) { return false; }
      if (filtro.anno && m.data.slice(0, 4) !== String(filtro.anno)) { return false; }
      if (filtro.mese && D.mese(m.data) !== filtro.mese) { return false; }
      if (filtro.stato && m.stato !== filtro.stato) { return false; }
      if (filtro.verso && m.verso !== filtro.verso) { return false; }
      if (filtro.categoriaId && m.categoriaId !== filtro.categoriaId && m.sottocategoriaId !== filtro.categoriaId) { return false; }
      if (filtro.detraibile === 'si' && !m.detraibile) { return false; }
      if (filtro.detraibile === 'no' && m.detraibile) { return false; }
      if (filtro.contoId && m.contoId !== filtro.contoId) { return false; }
      if (testo) {
        var c = mappa[m.categoriaId];
        var s = mappa[m.sottocategoriaId];
        var dove = [m.controparte, m.note, m.documento, c && c.nome, s && s.nome].map(B.normalizza).join(' ');
        if (dove.indexOf(testo) < 0) { return false; }
      }
      return true;
    });
  }

  function ordina(movimenti, discendente) {
    return movimenti.slice().sort(function (a, b) {
      var r = a.data < b.data ? -1 : (a.data > b.data ? 1 : (a.creatoIl < b.creatoIl ? -1 : 1));
      return discendente ? -r : r;
    });
  }

  /*
   * Totali di un insieme di movimenti (già filtrati):
   *  speso = uscite effettive, entrate = entrate effettive,
   *  previsto = uscite previste, previstoEntrate = entrate previste.
   */
  function totali(movimenti) {
    var t = { speso: 0, entrate: 0, previsto: 0, previstoEntrate: 0 };
    movimenti.forEach(function (m) {
      if (m.stato === 'effettivo') {
        if (m.verso === 'uscita') { t.speso += m.importoCent; } else { t.entrate += m.importoCent; }
      } else if (m.verso === 'uscita') {
        t.previsto += m.importoCent;
      } else {
        t.previstoEntrate += m.importoCent;
      }
    });
    return t;
  }

  function totaliPeriodo(movimenti, da, a) {
    return totali(filtra(movimenti, { da: da, a: a }));
  }

  // Totali per categoria principale, con il dettaglio per sottocategoria.
  function totaliPerCategoria(movimenti, categorie) {
    var mappa = B.perId(categorie);
    var out = {};
    movimenti.forEach(function (m) {
      var c = mappa[m.categoriaId];
      var principale = c && c.padreId ? c.padreId : m.categoriaId;
      if (!out[principale]) { out[principale] = { movimenti: [], sotto: {} }; }
      out[principale].movimenti.push(m);
      var chiaveSotto = m.sottocategoriaId || '';
      if (!out[principale].sotto[chiaveSotto]) { out[principale].sotto[chiaveSotto] = []; }
      out[principale].sotto[chiaveSotto].push(m);
    });
    Object.keys(out).forEach(function (id) {
      var voce = out[id];
      var sotto = {};
      Object.keys(voce.sotto).forEach(function (s) { sotto[s] = totali(voce.sotto[s]); });
      out[id] = Object.assign(totali(voce.movimenti), { sotto: sotto });
    });
    return out;
  }

  function variazione(attuale, precedente) {
    if (!precedente) { return null; }
    return (attuale - precedente) / precedente;
  }

  // Speso dall'inizio del mese e dell'anno, confrontato con gli stessi giorni dell'anno prima.
  function confrontoAnnoPrima(movimenti, oggi) {
    var inizioMese = D.primoGiorno(D.mese(oggi));
    var inizioAnno = oggi.slice(0, 4) + '-01-01';
    var oggiPrima = D.annoPrima(oggi);
    var mese = totaliPeriodo(movimenti, inizioMese, oggi).speso;
    var mesePrima = totaliPeriodo(movimenti, D.annoPrima(inizioMese), oggiPrima).speso;
    var anno = totaliPeriodo(movimenti, inizioAnno, oggi).speso;
    var annoPrimaSpeso = totaliPeriodo(movimenti, D.annoPrima(inizioAnno), oggiPrima).speso;
    return {
      mese: { attuale: mese, precedente: mesePrima, variazione: variazione(mese, mesePrima), da: inizioMese, a: oggi },
      anno: { attuale: anno, precedente: annoPrimaSpeso, variazione: variazione(anno, annoPrimaSpeso), da: inizioAnno, a: oggi }
    };
  }

  function previstiProssimi(movimenti, oggi, giorni) {
    var fine = D.aggiungiGiorni(oggi, giorni);
    return ordina(movimenti.filter(function (m) {
      return m.stato === 'previsto' && m.data >= oggi && m.data <= fine;
    }));
  }

  function previstiScaduti(movimenti, oggi) {
    return ordina(movimenti.filter(function (m) { return m.stato === 'previsto' && m.data < oggi; }));
  }

  // --- Budget annuale per categoria ---

  function usoBudget(archivio, anno) {
    var categorie = archivio.collezioni.categorie;
    var mappa = B.perId(categorie);
    var movimenti = filtra(archivio.collezioni.movimenti, { anno: anno });
    var perCat = totaliPerCategoria(movimenti, categorie);
    return archivio.collezioni.budget.filter(function (b) { return b.anno === Number(anno); }).map(function (b) {
      var t = perCat[b.categoriaId] || { speso: 0, previsto: 0 };
      return {
        budget: b,
        categoria: mappa[b.categoriaId] || null,
        budgetCent: b.importoCent,
        spesoCent: t.speso,
        previstoCent: t.previsto,
        percentuale: I.rapporto(t.speso, b.importoCent),
        percentualeConPrevisti: I.rapporto(t.speso + t.previsto, b.importoCent)
      };
    }).sort(function (x, y) { return ordinaCategorie(x.categoria || {}, y.categoria || {}); });
  }

  // --- Spesa rapida e conferma dei previsti ---

  function spesaRapida(archivio, campi, oggi, ora) {
    var m = nuovoMovimento({
      data: oggi,
      importoCent: campi.importoCent,
      verso: 'uscita',
      categoriaId: campi.categoriaId,
      stato: 'effettivo'
    });
    var errori = validaMovimento(m, archivio.collezioni.categorie);
    if (errori.length) { throw new Error(errori.join(' ')); }
    return A.inserisci(archivio, 'movimenti', m, ora);
  }

  function conferma(archivio, id, campi, ora) {
    var m = A.trova(archivio, 'movimenti', id);
    if (!m) { throw new Error('Movimento non trovato.'); }
    var modifiche = {
      stato: 'effettivo',
      importoCent: campi.importoCent != null ? campi.importoCent : m.importoCent,
      importoPrevistoCent: m.importoPrevistoCent != null ? m.importoPrevistoCent : m.importoCent,
      data: campi.data || m.data
    };
    if (campi.contoId !== undefined) { modifiche.contoId = campi.contoId; }
    return A.aggiorna(archivio, 'movimenti', id, modifiche, ora);
  }

  // --- Ricorrenze ---

  // Date di una ricorrenza fino a "fino": ognuna calcolata dalla data d'inizio,
  // così dal 31/01 si ottiene 28/02 e poi di nuovo 31/03.
  function dateRicorrenza(ricorrenza, fino) {
    var out = [];
    if (!ricorrenza.dataInizio || !(ricorrenza.ogniMesi > 0)) { return out; }
    var limite = ricorrenza.dataFine && ricorrenza.dataFine < fino ? ricorrenza.dataFine : fino;
    for (var k = 0; k < 2400; k++) {
      var d = D.aggiungiMesi(ricorrenza.dataInizio, k * ricorrenza.ogniMesi);
      if (d > limite) { break; }
      out.push(d);
    }
    return out;
  }

  function prossimaData(ricorrenza, oggi) {
    var date = dateRicorrenza(ricorrenza, D.aggiungiMesi(oggi, (ricorrenza.ogniMesi || 1) + 1));
    for (var i = 0; i < date.length; i++) { if (date[i] >= oggi) { return date[i]; } }
    return null;
  }

  function movimentoDaRicorrenza(ric, data) {
    return nuovoMovimento({
      data: data,
      importoCent: ric.importoCent,
      importoPrevistoCent: ric.importoCent,
      verso: ric.verso || 'uscita',
      categoriaId: ric.categoriaId,
      sottocategoriaId: ric.sottocategoriaId || null,
      stato: 'previsto',
      controparte: ric.controparte || '',
      collegamento: ric.collegamento || null,
      detraibile: !!ric.detraibile,
      contoId: ric.contoId || null,
      responsabileId: ric.responsabileId || null,
      note: ric.descrizione || ric.note || '',
      ricorrenzaId: ric.id
    });
  }

  /*
   * Crea i movimenti previsti delle ricorrenze fino a "mesi avanti" da oggi.
   * generataFinoAl ricorda fin dove si è arrivati: rigenerare non duplica e
   * un previsto cancellato a mano non ricompare.
   */
  function generaPrevisti(archivio, oggi, ora) {
    var mesiAvanti = archivio.impostazioni.ricorrenzeMesiAvanti || 12;
    var limite = D.aggiungiMesi(oggi, mesiAvanti);
    var a = archivio;
    var creati = 0;
    archivio.collezioni.ricorrenze.forEach(function (ric) {
      if (ric.attiva === false) { return; }
      var date = dateRicorrenza(ric, limite).filter(function (d) { return !ric.generataFinoAl || d > ric.generataFinoAl; });
      if (!date.length) { return; }
      date.forEach(function (d) {
        a = A.inserisci(a, 'movimenti', movimentoDaRicorrenza(ric, d), ora).archivio;
        creati++;
      });
      a = A.aggiorna(a, 'ricorrenze', ric.id, { generataFinoAl: limite }, ora).archivio;
    });
    return { archivio: a, creati: creati };
  }

  function validaRicorrenza(r, categorie) {
    var errori = [];
    if (!B.testo(r.descrizione).trim()) { errori.push('Scrivi una descrizione.'); }
    if (!D.valida(r.dataInizio)) { errori.push('Inserisci la data della prima scadenza.'); }
    if (r.dataFine && (!D.valida(r.dataFine) || r.dataFine < r.dataInizio)) { errori.push('La data di fine non è valida.'); }
    if (!(r.ogniMesi > 0)) { errori.push('Scegli la frequenza.'); }
    if (!(r.importoCent > 0)) { errori.push('Inserisci un importo maggiore di zero.'); }
    if (!r.categoriaId || !B.perId(categorie)[r.categoriaId]) { errori.push('Scegli una categoria.'); }
    return errori;
  }

  // Salva una ricorrenza nuova o modificata e rigenera i suoi previsti futuri.
  function salvaRicorrenza(archivio, campi, oggi, ora) {
    var errori = validaRicorrenza(campi, archivio.collezioni.categorie);
    if (errori.length) { throw new Error(errori.join(' ')); }
    var a = archivio;
    var esistente = campi.id ? A.trova(a, 'ricorrenze', campi.id) : null;
    if (esistente) {
      // I previsti futuri non confermati vengono ricreati con i nuovi valori.
      a = A.eliminaDove(a, 'movimenti', function (m) {
        return m.ricorrenzaId === esistente.id && m.stato === 'previsto' && m.data >= oggi;
      }, ora);
      var ieri = D.aggiungiGiorni(oggi, -1);
      var finora = esistente.generataFinoAl && esistente.generataFinoAl < ieri ? esistente.generataFinoAl : ieri;
      if (!esistente.generataFinoAl) { finora = null; }
      a = A.aggiorna(a, 'ricorrenze', esistente.id, Object.assign({}, campi, { generataFinoAl: finora }), ora).archivio;
    } else {
      a = A.inserisci(a, 'ricorrenze', Object.assign({ attiva: true, generataFinoAl: null }, campi), ora).archivio;
    }
    return generaPrevisti(a, oggi, ora).archivio;
  }

  // Elimina una ricorrenza; i previsti non confermati spariscono, gli effettivi restano.
  function eliminaRicorrenza(archivio, id, ora) {
    var a = A.eliminaDove(archivio, 'movimenti', function (m) {
      return m.ricorrenzaId === id && m.stato === 'previsto';
    }, ora);
    a = A.elimina(a, 'ricorrenze', id, ora);
    a.collezioni.movimenti.filter(function (m) { return m.ricorrenzaId === id; }).forEach(function (m) {
      a = A.aggiorna(a, 'movimenti', m.id, { ricorrenzaId: null }, ora).archivio;
    });
    return a;
  }

  // Segna come pagati (effettivi) i previsti di una ricorrenza con data già passata.
  function confermaPassati(archivio, ricorrenzaId, oggi, ora) {
    var a = archivio;
    archivio.collezioni.movimenti.filter(function (m) {
      return m.ricorrenzaId === ricorrenzaId && m.stato === 'previsto' && m.data < oggi;
    }).forEach(function (m) {
      a = conferma(a, m.id, {}, ora).archivio;
    });
    return a;
  }

  // --- Esportazione CSV per Excel in italiano ---

  function esportaCsv(archivio, filtro) {
    var c = archivio.collezioni;
    var categorie = B.perId(c.categorie);
    var conti = B.perId(c.conti);
    var responsabili = B.perId(c.familiari.concat(c.persone));
    var movimenti = ordina(filtra(c.movimenti, filtro, c.categorie));
    var righe = [['Data', 'Tipo', 'Importo', 'Categoria', 'Sottocategoria', 'Stato', 'Fornitore o beneficiario',
      'Collegato a', 'Detraibile', 'Conto', 'Competenza', 'Chi se ne occupa', 'Note', 'Documento']];
    movimenti.forEach(function (m) {
      var cat = categorie[m.categoriaId];
      var sotto = categorie[m.sottocategoriaId];
      righe.push([
        D.formattaData(m.data),
        m.verso === 'uscita' ? 'Uscita' : 'Entrata',
        I.importoPerCsv(m.importoCent),
        cat ? cat.nome : '',
        sotto ? sotto.nome : '',
        m.stato === 'effettivo' ? 'Effettivo' : 'Previsto',
        m.controparte || '',
        A.nomeCollegamento(archivio, m.collegamento),
        m.detraibile ? 'sì' : 'no',
        conti[m.contoId] ? conti[m.contoId].nome : '',
        m.competenza ? m.competenza.slice(5, 7) + '/' + m.competenza.slice(0, 4) : '',
        responsabili[m.responsabileId] ? responsabili[m.responsabileId].nome : '',
        m.note || '',
        m.documento || ''
      ]);
    });
    return { testo: '﻿' + CSV.genera(righe, ';'), numero: movimenti.length };
  }

  function controparti(movimenti) {
    var visti = {};
    var out = [];
    movimenti.forEach(function (m) {
      var n = B.testo(m.controparte).trim();
      if (n && !visti[n.toLowerCase()]) { visti[n.toLowerCase()] = true; out.push(n); }
    });
    return out.sort(B.confrontaTesti);
  }

  function anni(movimenti, oggi) {
    var visti = {};
    visti[oggi.slice(0, 4)] = true;
    movimenti.forEach(function (m) { visti[m.data.slice(0, 4)] = true; });
    return Object.keys(visti).sort().reverse();
  }

  var api = {
    principali: principali,
    sottocategorie: sottocategorie,
    perRuolo: perRuolo,
    coppiaPerRuolo: coppiaPerRuolo,
    ruoloDiMovimento: ruoloDiMovimento,
    nomeCategoria: nomeCategoria,
    versoCategoria: versoCategoria,
    usiCategoria: usiCategoria,
    eliminaCategoria: eliminaCategoria,
    meseCompetenza: meseCompetenza,
    nuovoMovimento: nuovoMovimento,
    validaMovimento: validaMovimento,
    costoNetto: costoNetto,
    filtra: filtra,
    ordina: ordina,
    totali: totali,
    totaliPeriodo: totaliPeriodo,
    totaliPerCategoria: totaliPerCategoria,
    confrontoAnnoPrima: confrontoAnnoPrima,
    previstiProssimi: previstiProssimi,
    previstiScaduti: previstiScaduti,
    usoBudget: usoBudget,
    spesaRapida: spesaRapida,
    conferma: conferma,
    dateRicorrenza: dateRicorrenza,
    prossimaData: prossimaData,
    generaPrevisti: generaPrevisti,
    validaRicorrenza: validaRicorrenza,
    salvaRicorrenza: salvaRicorrenza,
    eliminaRicorrenza: eliminaRicorrenza,
    confermaPassati: confermaPassati,
    esportaCsv: esportaCsv,
    controparti: controparti,
    anni: anni
  };

  GC.movimenti = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
