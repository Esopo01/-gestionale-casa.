/*
 * Gestionale casa — Lavori e manutenzioni.
 * #/lavori, #/lavori/manutenzioni, #/lavoro/<id>, #/manutenzione/<id>
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var ui = GC.ui;
  var esc = ui.esc;
  var B = GC.base;
  var D = GC.date;
  var I = GC.importi;
  var S = GC.schema;
  var A = GC.archivio;
  var M = GC.movimenti;
  var L = GC.lavori;
  var stato = GC.stato;

  var SCHEDE = [{ id: 'elenco', testo: 'Lavori' }, { id: 'manutenzioni', testo: 'Manutenzioni periodiche' }];
  var filtroStato = '';

  function archivio() { return stato.archivio; }
  function nomeStato(v) {
    var s = S.STATI_LAVORO.filter(function (x) { return x.valore === v; })[0];
    return s ? s.nome : v;
  }
  function classeStato(v) {
    return { idea: '', preventivo: 'previsto', approvato: 'attenzione', in_corso: 'attenzione', finito: 'ok' }[v] || '';
  }

  // --- Elenco lavori ---

  function renderLavori() {
    var lavori = archivio().collezioni.lavori.filter(function (l) { return !filtroStato || l.stato === filtroStato; });
    var ordine = { in_corso: 0, approvato: 1, preventivo: 2, idea: 3, finito: 4 };
    lavori.sort(function (a, b) { return (ordine[a.stato] - ordine[b.stato]) || B.confrontaTesti(a.titolo, b.titolo); });
    var h = '<div class="scheda"><div class="intestazione"><h2>Lavori</h2>' +
      '<button type="button" class="pulsante" data-azione="lavoro-nuovo">+ Lavoro</button></div>';
    h += '<div class="schede-nav">' + [{ valore: '', nome: 'Tutti' }].concat(S.STATI_LAVORO).map(function (s) {
      return '<button type="button" class="chip' + (s.valore === filtroStato ? ' attivo' : '') + '" data-azione="lavori-filtro" data-stato="' + s.valore + '">' + esc(s.nome) + '</button>';
    }).join('') + '</div>';
    if (!lavori.length) {
      return h + ui.vuoto(archivio().collezioni.lavori.length ? 'Nessun lavoro in questo stato.' : 'Nessun lavoro. Aggiungi un\'idea, un preventivo o un lavoro in corso.') + '</div>';
    }
    h += '<ul class="elenco">';
    lavori.forEach(function (l) {
      var r = L.riepilogo(archivio(), l);
      var sotto = [];
      if (l.fornitore) { sotto.push(l.fornitore); }
      if (r.preventivoScelto != null) { sotto.push('preventivo ' + I.formattaImporto(r.preventivoScelto)); }
      if (r.speso) { sotto.push('speso ' + I.formattaImporto(r.speso)); }
      h += '<li><a class="riga" href="#/lavoro/' + esc(l.id) + '"><span class="corpo"><span class="titolo">' + esc(l.titolo) + '</span> ' +
        ui.distintivo(nomeStato(l.stato), classeStato(l.stato)) + (r.supera ? ' ' + ui.distintivo('oltre il preventivo', 'pericolo') : '') +
        '<br><span class="sotto">' + esc(sotto.join(' · ')) + '</span></span><span class="destra tenue">›</span></a></li>';
    });
    return h + '</ul></div>';
  }

  GC.azioni['lavori-filtro'] = function (d) { filtroStato = d.stato; GC.app.aggiorna(); };

  // --- Modulo lavoro ---

  function apriLavoro(id) {
    var l = id ? A.trova(archivio(), 'lavori', id) : null;
    var v = l || { titolo: '', descrizione: '', fornitore: '', contatti: '', stato: 'idea', dataInizio: '', dataFine: '',
      detrazionePct: null, detrazioneAnni: null, note: '', documento: '' };
    var corpo = '<form id="modulo-lavoro" data-modulo="lavoro" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
      ui.campo({ nome: 'titolo', etichetta: 'Lavoro', valore: v.titolo, segnaposto: 'es. Rifacimento bagno', autofocus: !l }) +
      ui.campo({ nome: 'stato', etichetta: 'Stato', tipo: 'select', valore: v.stato,
        opzioni: S.STATI_LAVORO.map(function (s) { return { valore: s.valore, testo: s.nome }; }) }) +
      ui.campo({ nome: 'descrizione', etichetta: 'Descrizione', tipo: 'area', valore: v.descrizione }) +
      ui.campo({ nome: 'fornitore', etichetta: 'Fornitore', valore: v.fornitore }) +
      ui.campo({ nome: 'contatti', etichetta: 'Contatti del fornitore', tipo: 'area', valore: v.contatti, segnaposto: 'telefono, email, referente…' }) +
      '<div class="due-colonne">' + ui.campo({ nome: 'dataInizio', etichetta: 'Inizio', tipo: 'data', valore: v.dataInizio }) +
      ui.campo({ nome: 'dataFine', etichetta: 'Fine', tipo: 'data', valore: v.dataFine }) + '</div>' +
      '<fieldset><legend>Detrazione (la inserisci tu)</legend><div class="due-colonne">' +
      ui.campo({ nome: 'detrazionePct', etichetta: 'Percentuale (%)', tipo: 'intero', valore: v.detrazionePct }) +
      ui.campo({ nome: 'detrazioneAnni', etichetta: 'In quanti anni', tipo: 'intero', valore: v.detrazioneAnni }) + '</div>' +
      '<p class="tenue">Il programma non conosce le regole fiscali: calcola solo speso detraibile × percentuale ÷ anni.</p></fieldset>' +
      ui.campo({ nome: 'documento', etichetta: 'Documento', valore: v.documento, segnaposto: 'nome del file o link' }) +
      ui.campo({ nome: 'note', etichetta: 'Note', tipo: 'area', valore: v.note }) +
      '<input type="hidden" name="id" value="' + esc(id || '') + '"></form>';
    ui.apriModale({
      titolo: l ? 'Modifica lavoro' : 'Nuovo lavoro',
      corpo: corpo,
      piede: (l ? '<button type="button" class="pulsante leggero sinistra" data-azione="lavoro-elimina" data-id="' + esc(id) + '">Elimina</button>' : '') +
        '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-lavoro">Salva</button>'
    });
  }

  GC.azioni['lavoro-nuovo'] = function () { apriLavoro(); };
  GC.azioni['lavoro-modifica'] = function (d) { apriLavoro(d.id); };

  GC.moduli.lavoro = function (v, form) {
    var nuovoId = null;
    var ok = stato.applica(function (a) {
      var pct = v.detrazionePct ? I.leggiIntero(v.detrazionePct, 0, 200) : null;
      var anni = v.detrazioneAnni ? I.leggiIntero(v.detrazioneAnni, 1, 30) : null;
      if (v.detrazionePct && pct == null) { throw new Error('La percentuale di detrazione deve essere un numero intero.'); }
      if (v.detrazioneAnni && anni == null) { throw new Error('Gli anni di detrazione devono essere un numero tra 1 e 30.'); }
      var campi = {
        titolo: (v.titolo || '').trim(), descrizione: (v.descrizione || '').trim(), fornitore: (v.fornitore || '').trim(),
        contatti: (v.contatti || '').trim(), stato: v.stato, dataInizio: D.leggiData(v.dataInizio), dataFine: D.leggiData(v.dataFine),
        detrazionePct: pct, detrazioneAnni: anni, documento: (v.documento || '').trim(), note: (v.note || '').trim()
      };
      var errori = L.validaLavoro(campi);
      if (errori.length) { throw new Error(errori.join(' ')); }
      if (v.id) { return A.aggiorna(a, 'lavori', v.id, campi, stato.ora()).archivio; }
      var r = A.inserisci(a, 'lavori', campi, stato.ora());
      nuovoId = r.record.id;
      return r.archivio;
    }, { form: form, messaggio: 'Lavoro salvato.' });
    if (ok && nuovoId) { GC.app.vai('lavoro/' + nuovoId); }
  };

  GC.azioni['lavoro-elimina'] = function (d) {
    ui.conferma('Il lavoro e i suoi preventivi verranno eliminati. I pagamenti restano nel registro, senza collegamento.', {
      titolo: 'Eliminare il lavoro?', ok: 'Elimina', pericolo: true
    }).then(function (si) {
      if (!si) { return; }
      ui.chiudiTutte();
      stato.applica(function (a) { return L.eliminaLavoro(a, d.id, stato.ora()); }, { messaggio: 'Lavoro eliminato.' });
      GC.app.vai('lavori');
    });
  };

  // --- Preventivi ---

  function apriPreventivo(lavoroId, id) {
    var p = id ? A.trova(archivio(), 'preventivi', id) : null;
    var lavoro = A.trova(archivio(), 'lavori', lavoroId);
    var v = p || { fornitore: lavoro ? lavoro.fornitore : '', data: stato.oggi(), importoCent: null, scelto: false, documento: '', note: '' };
    ui.apriModale({
      titolo: p ? 'Modifica preventivo' : 'Nuovo preventivo',
      corpo: '<form id="modulo-preventivo" data-modulo="preventivo" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
        ui.campo({ nome: 'fornitore', etichetta: 'Fornitore', valore: v.fornitore, autofocus: !p }) +
        '<div class="due-colonne">' + ui.campo({ nome: 'importo', etichetta: 'Importo (€)', tipo: 'importo', valore: I.importoPerCampo(v.importoCent) }) +
        ui.campo({ nome: 'data', etichetta: 'Data', tipo: 'data', valore: v.data }) + '</div>' +
        ui.campo({ nome: 'scelto', etichetta: 'Preventivo scelto', tipo: 'spunta', valore: v.scelto, aiuto: 'se ne scegli più di uno si sommano' }) +
        ui.campo({ nome: 'documento', etichetta: 'Documento', valore: v.documento, segnaposto: 'nome del file o link' }) +
        ui.campo({ nome: 'note', etichetta: 'Note', tipo: 'area', valore: v.note }) +
        '<input type="hidden" name="id" value="' + esc(id || '') + '"><input type="hidden" name="lavoroId" value="' + esc(lavoroId) + '"></form>',
      piede: (p ? '<button type="button" class="pulsante leggero sinistra" data-azione="preventivo-elimina" data-id="' + esc(id) + '">Elimina</button>' : '') +
        '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-preventivo">Salva</button>'
    });
  }

  GC.azioni['preventivo-nuovo'] = function (d) { apriPreventivo(d.lavoro); };
  GC.azioni['preventivo-modifica'] = function (d) { apriPreventivo(d.lavoro, d.id); };

  GC.moduli.preventivo = function (v, form) {
    stato.applica(function (a) {
      var importo = I.leggiImporto(v.importo);
      if (!(importo > 0)) { throw new Error('Scrivi l\'importo del preventivo.'); }
      var campi = { lavoroId: v.lavoroId, fornitore: (v.fornitore || '').trim(), importoCent: importo, data: D.leggiData(v.data),
        scelto: !!v.scelto, documento: (v.documento || '').trim(), note: (v.note || '').trim() };
      if (v.id) { return A.aggiorna(a, 'preventivi', v.id, campi, stato.ora()).archivio; }
      return A.inserisci(a, 'preventivi', campi, stato.ora()).archivio;
    }, { form: form });
  };

  GC.azioni['preventivo-elimina'] = function (d) {
    ui.conferma('Eliminare questo preventivo?', { titolo: 'Eliminare?', ok: 'Elimina', pericolo: true }).then(function (si) {
      if (!si) { return; }
      ui.chiudiModale();
      stato.applica(function (a) { return A.elimina(a, 'preventivi', d.id, stato.ora()); });
    });
  };

  // --- Scheda di un lavoro ---

  function numero(etichetta, valore, nota, classe) {
    return '<div class="numero"><div class="etichetta">' + esc(etichetta) + '</div><div class="valore' + (classe ? ' ' + classe : '') + '">' +
      valore + '</div>' + (nota ? '<div class="nota">' + esc(nota) + '</div>' : '') + '</div>';
  }

  function renderLavoro(id) {
    var l = A.trova(archivio(), 'lavori', id);
    if (!l) { return '<div class="scheda">' + ui.vuoto('Lavoro non trovato.', '<a class="pulsante" href="#/lavori">Torna ai lavori</a>') + '</div>'; }
    var r = L.riepilogo(archivio(), l);
    var cat = M.coppiaPerRuolo(archivio().collezioni.categorie, 'lavoro');
    var h = '<p><a href="#/lavori">‹ Lavori</a></p>';
    h += '<div class="scheda"><div class="intestazione"><h2>' + esc(l.titolo) + '</h2>' +
      '<button type="button" class="pulsante piccolo secondario" data-azione="lavoro-modifica" data-id="' + esc(l.id) + '">Modifica</button></div>' +
      '<p>' + ui.distintivo(nomeStato(l.stato), classeStato(l.stato)) + '</p>' +
      (l.descrizione ? '<p>' + esc(l.descrizione) + '</p>' : '') +
      '<dl class="dati">' +
      (l.fornitore ? '<dt>Fornitore</dt><dd>' + esc(l.fornitore) + '</dd>' : '') +
      (l.contatti ? '<dt>Contatti</dt><dd>' + esc(l.contatti) + '</dd>' : '') +
      (l.dataInizio ? '<dt>Inizio</dt><dd>' + ui.data(l.dataInizio) + '</dd>' : '') +
      (l.dataFine ? '<dt>Fine</dt><dd>' + ui.data(l.dataFine) + '</dd>' : '') +
      (l.documento ? '<dt>Documento</dt><dd>' + esc(l.documento) + '</dd>' : '') +
      (l.note ? '<dt>Note</dt><dd>' + esc(l.note) + '</dd>' : '') + '</dl></div>';

    h += '<div class="scheda"><h2>Preventivo e speso</h2>';
    if (r.supera) { h += '<div class="attenzione-box">Lo speso supera il preventivo scelto di ' + ui.euro(r.differenza) + '.</div>'; }
    h += '<div class="numeri">' +
      numero('Preventivo scelto', r.preventivoScelto != null ? ui.euro(r.preventivoScelto) : '<span class="mancante">nessuno scelto</span>') +
      numero('Speso', ui.euro(r.speso), 'pagamenti effettivi', r.supera ? 'su' : '') +
      numero('Previsto', ui.euro(r.previsto), 'pagamenti ancora da fare') +
      numero('Differenza', r.differenza != null ? ui.euro(r.differenza) : '—', 'speso − preventivo', r.supera ? 'su' : '') +
      '</div>' + (r.preventivoScelto ? ui.barra(I.rapporto(r.speso, r.preventivoScelto)) : '') + '</div>';

    var prev = L.preventivi(archivio(), l.id);
    h += '<div class="scheda"><div class="intestazione"><h2>Preventivi ricevuti</h2>' +
      '<button type="button" class="pulsante piccolo" data-azione="preventivo-nuovo" data-lavoro="' + esc(l.id) + '">+ Preventivo</button></div>';
    h += prev.length ? '<ul class="elenco">' + prev.map(function (p) {
      return '<li><button type="button" class="riga" data-azione="preventivo-modifica" data-lavoro="' + esc(l.id) + '" data-id="' + esc(p.id) + '">' +
        '<span class="corpo"><span class="titolo">' + esc(p.fornitore || 'Preventivo') + '</span> ' + (p.scelto ? ui.distintivo('scelto', 'ok') : '') +
        '<br><span class="sotto">' + esc([D.formattaData(p.data), p.documento, p.note].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="destra importo">' + ui.euro(p.importoCent) + '</span></button></li>';
    }).join('') + '</ul>' : '<p class="tenue">Nessun preventivo.</p>';
    h += '</div>';

    var pag = L.pagamenti(archivio(), l.id).reverse();
    h += '<div class="scheda"><div class="intestazione"><h2>Pagamenti</h2>' +
      '<button type="button" class="pulsante piccolo" data-azione="movimento-nuovo" data-categoria-id="' + esc(cat.categoriaId || '') +
      '" data-sottocategoria-id="' + esc(cat.sottocategoriaId || '') + '" data-collegamento-tipo="lavoro" data-collegamento-id="' + esc(l.id) +
      '" data-controparte="' + esc(l.fornitore || '') + '"' + (l.detrazionePct ? ' data-detraibile="1"' : '') + '>+ Pagamento</button></div>' +
      '<p class="tenue">Acconti e saldo sono movimenti del registro collegati a questo lavoro (scrivi "acconto" o "saldo" nelle note).</p>';
    h += pag.length ? '<ul class="elenco">' + pag.map(function (m) { return GC.forme.rigaMovimento(m, { senzaCollegamento: true }); }).join('') + '</ul>' : '<p class="tenue">Nessun pagamento.</p>';
    h += '</div>';

    if (l.detrazionePct != null) {
      h += '<div class="scheda"><h2>Detrazione</h2><div class="numeri">' +
        numero('Speso detraibile', ui.euro(r.detraibile), 'pagamenti effettivi segnati "detraibile"') +
        numero('Detrazione ' + l.detrazionePct + '%', ui.euro(r.detrazione)) +
        (r.rata != null ? numero('All\'anno', ui.euro(r.rata), 'per ' + l.detrazioneAnni + ' anni') : '') +
        '</div><p class="tenue">Percentuale e anni li hai inseriti tu: il programma non verifica limiti né requisiti.</p></div>';
    }
    if (GC.forme.impegniCollegati) { h += GC.forme.impegniCollegati({ tipo: 'lavoro', id: l.id }); }
    return h;
  }

  // --- Manutenzioni ---

  function badgeScadenza(prossima, oggi) {
    if (!prossima) { return ui.distintivo('ultima data mancante', 'attenzione'); }
    if (prossima < oggi) { return ui.distintivo('scaduta', 'pericolo'); }
    if (prossima <= D.aggiungiGiorni(oggi, archivio().impostazioni.soglie.finestraGiorni)) { return ui.distintivo('in arrivo', 'attenzione'); }
    return '';
  }

  function renderManutenzioni() {
    var oggi = stato.oggi();
    var lista = archivio().collezioni.manutenzioni.map(function (m) { return { m: m, prossima: L.prossimaScadenza(archivio(), m) }; })
      .sort(function (a, b) {
        if (a.m.attiva === false && b.m.attiva !== false) { return 1; }
        if (b.m.attiva === false && a.m.attiva !== false) { return -1; }
        return (a.prossima || '9999') < (b.prossima || '9999') ? -1 : 1;
      });
    var h = '<div class="scheda"><div class="intestazione"><h2>Manutenzioni periodiche</h2>' +
      '<button type="button" class="pulsante" data-azione="manutenzione-nuova">+ Manutenzione</button></div>' +
      '<p class="tenue">La prossima scadenza si calcola dall\'ultima volta + la frequenza e compare negli impegni.</p>';
    if (!lista.length) { return h + ui.vuoto('Nessuna manutenzione: caldaia, condizionatori, pannelli, depuratore…') + '</div>'; }
    h += '<ul class="elenco">';
    lista.forEach(function (x) {
      var m = x.m;
      h += '<li><a class="riga" href="#/manutenzione/' + esc(m.id) + '"><span class="corpo"><span class="titolo">' + esc(m.nome) + '</span> ' +
        (m.attiva === false ? ui.distintivo('sospesa') : badgeScadenza(x.prossima, oggi)) +
        '<br><span class="sotto">' + esc([S.nomeFrequenza(m.ogniMesi), m.fornitore].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="destra"><span class="sotto">prossima</span><br><strong>' + (x.prossima ? ui.data(x.prossima) : '—') + '</strong></span></a></li>';
    });
    return h + '</ul></div>';
  }

  function corpoManutenzione(v) {
    return '<div class="errore-modulo"></div>' +
      ui.campo({ nome: 'nome', etichetta: 'Manutenzione', valore: v.nome, segnaposto: 'es. Caldaia: controllo annuale', autofocus: !v.id }) +
      '<div class="due-colonne">' + ui.campo({ nome: 'ogniMesi', etichetta: 'Ogni quanti mesi', tipo: 'intero', valore: v.ogniMesi, aiuto: '12 = ogni anno' }) +
      ui.campo({ nome: 'ultimaData', etichetta: 'Ultima volta', tipo: 'data', valore: v.ultimaData }) + '</div>' +
      ui.campo({ nome: 'fornitore', etichetta: 'Fornitore', valore: v.fornitore }) +
      ui.campo({ nome: 'contatti', etichetta: 'Contatti', tipo: 'area', valore: v.contatti }) +
      ui.campo({ nome: 'costoAbituale', etichetta: 'Costo abituale (€)', tipo: 'importo', valore: v.costoAbituale }) +
      '<div class="due-colonne">' +
      ui.campo({ nome: 'categoriaId', etichetta: 'Categoria dei costi', tipo: 'select', valore: v.categoriaId, opzioni: GC.forme.opzioniCategorie('uscita'), cambia: 'manutenzione-ricarica' }) +
      ui.campo({ nome: 'sottocategoriaId', etichetta: 'Sottocategoria', tipo: 'select', valore: v.sottocategoriaId, opzioni: GC.forme.opzioniSottocategorie(v.categoriaId, 'uscita') }) + '</div>' +
      ui.campo({ nome: 'responsabileId', etichetta: 'Chi se ne occupa', tipo: 'select', valore: v.responsabileId, opzioni: GC.forme.opzioniResponsabili() }) +
      ui.campo({ nome: 'attiva', etichetta: 'Attiva (compare negli impegni)', tipo: 'spunta', valore: v.attiva }) +
      ui.campo({ nome: 'note', etichetta: 'Note', tipo: 'area', valore: v.note }) +
      '<input type="hidden" name="id" value="' + esc(v.id || '') + '">';
  }

  function apriManutenzione(id) {
    var m = id ? A.trova(archivio(), 'manutenzioni', id) : null;
    var predef = M.coppiaPerRuolo(archivio().collezioni.categorie, 'manutenzione');
    var v = m ? {
      id: m.id, nome: m.nome, ogniMesi: m.ogniMesi, ultimaData: m.ultimaData || '', fornitore: m.fornitore || '', contatti: m.contatti || '',
      costoAbituale: I.importoPerCampo(m.costoAbitualeCent), categoriaId: m.categoriaId || '', sottocategoriaId: m.sottocategoriaId || '',
      responsabileId: m.responsabileId || '', attiva: m.attiva !== false, note: m.note || ''
    } : { nome: '', ogniMesi: '12', ultimaData: '', fornitore: '', contatti: '', costoAbituale: '', categoriaId: predef.categoriaId || '',
      sottocategoriaId: predef.sottocategoriaId || '', responsabileId: '', attiva: true, note: '' };
    ui.apriModale({
      titolo: m ? 'Modifica manutenzione' : 'Nuova manutenzione',
      corpo: '<form id="modulo-manutenzione" data-modulo="manutenzione" autocomplete="off" novalidate>' + corpoManutenzione(v) + '</form>',
      piede: (m ? '<button type="button" class="pulsante leggero sinistra" data-azione="manutenzione-elimina" data-id="' + esc(id) + '">Elimina</button>' : '') +
        '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-manutenzione">Salva</button>'
    });
  }

  GC.cambi['manutenzione-ricarica'] = function (el) {
    var v = ui.leggiModulo(el.form);
    v.sottocategoriaId = '';
    el.form.innerHTML = corpoManutenzione(v);
  };

  GC.azioni['manutenzione-nuova'] = function () { apriManutenzione(); };
  GC.azioni['manutenzione-modifica'] = function (d) { apriManutenzione(d.id); };

  GC.moduli.manutenzione = function (v, form) {
    var nuovoId = null;
    var ok = stato.applica(function (a) {
      var costo = v.costoAbituale ? I.leggiImporto(v.costoAbituale) : null;
      if (v.costoAbituale && costo == null) { throw new Error('Il costo abituale non è un importo valido.'); }
      var campi = {
        nome: (v.nome || '').trim(), ogniMesi: I.leggiIntero(v.ogniMesi, 1, 240), ultimaData: D.leggiData(v.ultimaData),
        fornitore: (v.fornitore || '').trim(), contatti: (v.contatti || '').trim(), costoAbitualeCent: costo,
        categoriaId: v.categoriaId || null, sottocategoriaId: v.sottocategoriaId || null, responsabileId: v.responsabileId || null,
        attiva: !!v.attiva, note: (v.note || '').trim()
      };
      var errori = L.validaManutenzione(campi);
      if (errori.length) { throw new Error(errori.join(' ')); }
      if (v.id) { return A.aggiorna(a, 'manutenzioni', v.id, campi, stato.ora()).archivio; }
      var r = A.inserisci(a, 'manutenzioni', campi, stato.ora());
      nuovoId = r.record.id;
      return r.archivio;
    }, { form: form, messaggio: 'Manutenzione salvata.' });
    if (ok && nuovoId) { GC.app.vai('manutenzione/' + nuovoId); }
  };

  GC.azioni['manutenzione-elimina'] = function (d) {
    ui.conferma('La manutenzione e il suo storico verranno eliminati. I costi restano nel registro, senza collegamento.', {
      titolo: 'Eliminare la manutenzione?', ok: 'Elimina', pericolo: true
    }).then(function (si) {
      if (!si) { return; }
      ui.chiudiTutte();
      stato.applica(function (a) { return L.eliminaManutenzione(a, d.id, stato.ora()); }, { messaggio: 'Manutenzione eliminata.' });
      GC.app.vai('lavori/manutenzioni');
    });
  };

  // Registra l'intervento (usato anche da "Fatto" negli impegni).
  function apriIntervento(id) {
    var m = A.trova(archivio(), 'manutenzioni', id);
    if (!m) { return; }
    ui.apriModale({
      titolo: 'Registra intervento',
      corpo: '<form id="modulo-intervento" data-modulo="intervento" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
        '<p><strong>' + esc(m.nome) + '</strong></p>' +
        '<div class="due-colonne">' + ui.campo({ nome: 'data', etichetta: 'Data', tipo: 'data', valore: stato.oggi() }) +
        ui.campo({ nome: 'costo', etichetta: 'Costo (€)', tipo: 'importo', valore: I.importoPerCampo(m.costoAbitualeCent), aiuto: 'vuoto se gratuito' }) + '</div>' +
        ui.campo({ nome: 'contoId', etichetta: 'Conto', tipo: 'select', valore: '', opzioni: GC.forme.opzioniConti() }) +
        ui.campo({ nome: 'documento', etichetta: 'Documento', valore: '', segnaposto: 'nome del file o link' }) +
        ui.campo({ nome: 'note', etichetta: 'Note', tipo: 'area', valore: '' }) +
        '<input type="hidden" name="id" value="' + esc(m.id) + '"></form>' +
        '<p class="tenue">La prossima scadenza diventerà ' + esc(S.nomeFrequenza(m.ogniMesi).toLowerCase()) + ' dopo questa data. Con un costo viene creato il movimento nel registro.</p>',
      piede: '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-intervento">Registra</button>'
    });
  }

  GC.azioni['intervento-nuovo'] = function (d) { apriIntervento(d.id); };

  GC.moduli.intervento = function (v, form) {
    stato.applica(function (a) {
      var costo = v.costo ? I.leggiImporto(v.costo) : 0;
      if (v.costo && costo == null) { throw new Error('Il costo non è un importo valido.'); }
      return L.registraIntervento(a, v.id, { data: D.leggiData(v.data), costoCent: costo, contoId: v.contoId || null,
        documento: (v.documento || '').trim(), note: (v.note || '').trim() }, stato.ora());
    }, { form: form, messaggio: 'Intervento registrato.' });
  };

  GC.azioni['intervento-elimina'] = function (d) {
    ui.conferma('Eliminare questo intervento dallo storico? L\'eventuale costo resta nel registro.', { titolo: 'Eliminare?', ok: 'Elimina', pericolo: true })
      .then(function (si) {
        if (!si) { return; }
        stato.applica(function (a) { return A.elimina(a, 'interventi', d.id, stato.ora()); });
      });
  };

  function renderManutenzione(id) {
    var m = A.trova(archivio(), 'manutenzioni', id);
    if (!m) { return '<div class="scheda">' + ui.vuoto('Manutenzione non trovata.', '<a class="pulsante" href="#/lavori/manutenzioni">Torna alle manutenzioni</a>') + '</div>'; }
    var oggi = stato.oggi();
    var prossima = L.prossimaScadenza(archivio(), m);
    var h = '<p><a href="#/lavori/manutenzioni">‹ Manutenzioni</a></p>';
    h += '<div class="scheda"><div class="intestazione"><h2>' + esc(m.nome) + '</h2>' +
      '<button type="button" class="pulsante piccolo secondario" data-azione="manutenzione-modifica" data-id="' + esc(m.id) + '">Modifica</button></div>' +
      '<p>' + (m.attiva === false ? ui.distintivo('sospesa') : badgeScadenza(prossima, oggi)) + '</p>' +
      '<dl class="dati"><dt>Frequenza</dt><dd>' + esc(S.nomeFrequenza(m.ogniMesi)) + '</dd>' +
      '<dt>Ultima volta</dt><dd>' + (L.ultimaEsecuzione(archivio(), m) ? ui.data(L.ultimaEsecuzione(archivio(), m)) : '—') + '</dd>' +
      '<dt>Prossima</dt><dd><strong>' + (prossima ? ui.data(prossima) : '—') + '</strong></dd>' +
      (m.fornitore ? '<dt>Fornitore</dt><dd>' + esc(m.fornitore) + '</dd>' : '') +
      (m.contatti ? '<dt>Contatti</dt><dd>' + esc(m.contatti) + '</dd>' : '') +
      (m.costoAbitualeCent != null ? '<dt>Costo abituale</dt><dd>' + ui.euro(m.costoAbitualeCent) + '</dd>' : '') +
      (m.responsabileId ? '<dt>Se ne occupa</dt><dd>' + esc(GC.forme.nomeResponsabile(m.responsabileId)) + '</dd>' : '') +
      (m.note ? '<dt>Note</dt><dd>' + esc(m.note) + '</dd>' : '') + '</dl>' +
      '<div class="pulsanti"><button type="button" class="pulsante" data-azione="intervento-nuovo" data-id="' + esc(m.id) + '">Registra intervento</button></div></div>';
    var storico = L.interventi(archivio(), m.id);
    var movimenti = B.perId(archivio().collezioni.movimenti);
    h += '<div class="scheda"><h2>Storico interventi</h2>';
    h += storico.length ? '<ul class="elenco">' + storico.map(function (i) {
      var mov = i.movimentoId ? movimenti[i.movimentoId] : null;
      return '<li class="riga-con-azioni"><div class="riga"><span class="corpo"><span class="titolo">' + ui.data(i.data) + '</span><br><span class="sotto">' +
        esc([i.note, i.documento].filter(Boolean).join(' · ') || '—') + '</span></span><span class="destra importo">' + (mov ? ui.euro(mov.importoCent) : '') +
        '</span></div><span class="azioni-riga"><button type="button" class="pulsante leggero piccolo" data-azione="intervento-elimina" data-id="' + esc(i.id) + '" aria-label="Elimina intervento">×</button></span></li>';
    }).join('') + '</ul>' : '<p class="tenue">Nessun intervento registrato.</p>';
    h += '</div>';
    var costi = M.ordina(A.collegati(archivio(), 'movimenti', 'manutenzione', m.id), true);
    if (costi.length) {
      h += '<div class="scheda"><h2>Costi nel registro</h2><ul class="elenco">' + costi.map(function (x) { return GC.forme.rigaMovimento(x, { senzaCollegamento: true }); }).join('') + '</ul></div>';
    }
    return h;
  }

  // --- Schermate ---

  GC.viste.lavori = {
    titolo: 'Lavori e manutenzioni',
    render: function (rotta) {
      var scheda = rotta.parti[0] === 'manutenzioni' ? 'manutenzioni' : 'elenco';
      return ui.schedeNav('lavori', SCHEDE, scheda) + (scheda === 'manutenzioni' ? renderManutenzioni() : renderLavori());
    }
  };
  GC.viste.lavoro = { titolo: 'Lavoro', render: function (rotta) { return renderLavoro(rotta.parti[0]); } };
  GC.viste.manutenzione = { titolo: 'Manutenzione', render: function (rotta) { return renderManutenzione(rotta.parti[0]); } };

  GC.forme.intervento = apriIntervento;
})(typeof window !== 'undefined' ? window : globalThis);
