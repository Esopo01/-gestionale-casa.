/*
 * Gestionale casa — lavori una tantum (preventivi, pagamenti, detrazione) e
 * manutenzioni periodiche (prossima scadenza, interventi).
 * La percentuale e gli anni di detrazione li inserisce l'utente: qui non c'è nessuna regola fiscale.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var B = GC.base || require('./base.js');
  var D = GC.date || require('./date.js');
  var A = GC.archivio || require('./archivio.js');
  var M = GC.movimenti || require('./movimenti.js');

  // --- Lavori ---

  function preventivi(archivio, lavoroId) {
    return archivio.collezioni.preventivi.filter(function (p) { return p.lavoroId === lavoroId; })
      .sort(function (a, b) { return (a.data || '') < (b.data || '') ? -1 : 1; });
  }

  function pagamenti(archivio, lavoroId) {
    return M.ordina(A.collegati(archivio, 'movimenti', 'lavoro', lavoroId));
  }

  /*
   * Riepilogo economico di un lavoro:
   *  preventivoScelto = somma dei preventivi scelti (null se nessuno),
   *  speso = pagamenti effettivi (uscite meno eventuali rimborsi), previsto = pagamenti previsti,
   *  detrazione = speso detraibile × percentuale inserita, rata = detrazione ÷ anni.
   */
  function riepilogo(archivio, lavoro) {
    var scelti = preventivi(archivio, lavoro.id).filter(function (p) { return p.scelto; });
    var preventivoScelto = scelti.length ? B.somma(scelti, function (p) { return p.importoCent; }) : null;
    var movimenti = pagamenti(archivio, lavoro.id);
    var effettivi = movimenti.filter(function (m) { return m.stato === 'effettivo'; });
    var speso = M.costoNetto(effettivi);
    var previsto = M.costoNetto(movimenti.filter(function (m) { return m.stato === 'previsto'; }));
    var detraibile = M.costoNetto(effettivi.filter(function (m) { return m.detraibile; }));
    var detrazione = lavoro.detrazionePct != null ? Math.round(detraibile * lavoro.detrazionePct / 100) : null;
    var rata = detrazione != null && lavoro.detrazioneAnni > 0 ? Math.round(detrazione / lavoro.detrazioneAnni) : null;
    return {
      preventivoScelto: preventivoScelto,
      speso: speso,
      previsto: previsto,
      differenza: preventivoScelto != null ? speso - preventivoScelto : null,
      supera: preventivoScelto != null && speso > preventivoScelto,
      residuo: preventivoScelto != null ? preventivoScelto - speso - previsto : null,
      detraibile: detraibile,
      detrazione: detrazione,
      rata: rata
    };
  }

  function validaLavoro(l) {
    var errori = [];
    if (!B.testo(l.titolo).trim()) { errori.push('Scrivi una descrizione breve del lavoro.'); }
    if (l.detrazionePct != null && (l.detrazionePct < 0 || l.detrazionePct > 200)) { errori.push('La percentuale di detrazione non è valida.'); }
    if (l.detrazioneAnni != null && (l.detrazioneAnni < 1 || l.detrazioneAnni > 30)) { errori.push('Gli anni di detrazione non sono validi.'); }
    return errori;
  }

  // Elimina un lavoro con i suoi preventivi; i pagamenti restano nel registro senza collegamento.
  function eliminaLavoro(archivio, id, ora) {
    var a = A.eliminaDove(archivio, 'preventivi', function (p) { return p.lavoroId === id; }, ora);
    a = A.scollega(a, 'lavoro', id, ora);
    return A.elimina(a, 'lavori', id, ora);
  }

  // --- Manutenzioni periodiche ---

  function interventi(archivio, manutenzioneId) {
    return archivio.collezioni.interventi.filter(function (i) { return i.manutenzioneId === manutenzioneId; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  }

  function ultimaEsecuzione(archivio, manutenzione) {
    var date = interventi(archivio, manutenzione.id).map(function (i) { return i.data; });
    if (manutenzione.ultimaData) { date.push(manutenzione.ultimaData); }
    date.sort();
    return date.length ? date[date.length - 1] : null;
  }

  // Prossima scadenza = ultima esecuzione + frequenza (null se non si conosce l'ultima).
  function prossimaScadenza(archivio, manutenzione) {
    var ultima = ultimaEsecuzione(archivio, manutenzione);
    if (!ultima || !(manutenzione.ogniMesi > 0)) { return null; }
    return D.aggiungiMesi(ultima, manutenzione.ogniMesi);
  }

  function validaManutenzione(m) {
    var errori = [];
    if (!B.testo(m.nome).trim()) { errori.push('Scrivi il nome della manutenzione.'); }
    if (!(m.ogniMesi > 0)) { errori.push('Indica ogni quanti mesi va fatta.'); }
    if (m.ultimaData && !D.valida(m.ultimaData)) { errori.push('L\'ultima data non è valida.'); }
    return errori;
  }

  /*
   * Registra un intervento: aggiorna l'ultima data e, se c'è un costo, crea il
   * movimento effettivo collegato alla manutenzione.
   */
  function registraIntervento(archivio, manutenzioneId, dati, ora) {
    var man = A.trova(archivio, 'manutenzioni', manutenzioneId);
    if (!man) { throw new Error('Manutenzione non trovata.'); }
    if (!D.valida(dati.data)) { throw new Error('Inserisci la data dell\'intervento.'); }
    var a = archivio;
    var movimentoId = null;
    if (dati.costoCent > 0) {
      var cat = man.categoriaId ? { categoriaId: man.categoriaId, sottocategoriaId: man.sottocategoriaId || null }
        : M.coppiaPerRuolo(a.collezioni.categorie, 'manutenzione');
      var r = A.inserisci(a, 'movimenti', M.nuovoMovimento({
        data: dati.data, importoCent: dati.costoCent, verso: 'uscita', stato: dati.stato || 'effettivo',
        categoriaId: cat.categoriaId, sottocategoriaId: cat.sottocategoriaId,
        controparte: man.fornitore || '', collegamento: { tipo: 'manutenzione', id: man.id },
        contoId: dati.contoId || null, responsabileId: man.responsabileId || null,
        note: dati.note || '', documento: dati.documento || '', detraibile: !!dati.detraibile
      }), ora);
      a = r.archivio;
      movimentoId = r.record.id;
    }
    a = A.inserisci(a, 'interventi', { manutenzioneId: man.id, data: dati.data, note: dati.note || '',
      documento: dati.documento || '', movimentoId: movimentoId }, ora).archivio;
    if (!man.ultimaData || dati.data > man.ultimaData) {
      a = A.aggiorna(a, 'manutenzioni', man.id, { ultimaData: dati.data }, ora).archivio;
    }
    return a;
  }

  function eliminaManutenzione(archivio, id, ora) {
    var a = A.eliminaDove(archivio, 'interventi', function (i) { return i.manutenzioneId === id; }, ora);
    a = A.scollega(a, 'manutenzione', id, ora);
    return A.elimina(a, 'manutenzioni', id, ora);
  }

  var api = {
    preventivi: preventivi,
    pagamenti: pagamenti,
    riepilogo: riepilogo,
    validaLavoro: validaLavoro,
    eliminaLavoro: eliminaLavoro,
    interventi: interventi,
    ultimaEsecuzione: ultimaEsecuzione,
    prossimaScadenza: prossimaScadenza,
    validaManutenzione: validaManutenzione,
    registraIntervento: registraIntervento,
    eliminaManutenzione: eliminaManutenzione
  };

  GC.lavori = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
