/*
 * Gestionale casa — schermata Movimenti: registro, ricorrenze, bollette, budget, esportazione.
 * Espone anche i moduli condivisi con le altre sezioni:
 *   GC.forme.movimento(valori, opzioni), GC.forme.conferma(id), GC.forme.ricorrenza(valori)
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
  var BO = GC.bollette;
  var stato = GC.stato;

  var SCHEDE = [
    { id: 'registro', testo: 'Registro' },
    { id: 'ricorrenze', testo: 'Ricorrenze' },
    { id: 'bollette', testo: 'Bollette' },
    { id: 'budget', testo: 'Budget' },
    { id: 'esporta', testo: 'Esporta CSV' }
  ];
  var RUOLI_BOLLETTA = { luce: true, gas: true, acqua: true };
  var LIMITE_RIGHE = 250;

  var filtro = null;
  var righeMostrate = LIMITE_RIGHE;
  var tipoBollette = 'luce';
  var annoBudget = null;

  function archivio() { return stato.archivio; }
  function categorie() { return archivio().collezioni.categorie; }

  function filtroIniziale() {
    return { anno: stato.oggi().slice(0, 4), mese: '', categoriaId: '', stato: '', verso: '', detraibile: '', testo: '', contoId: '', futuri: '' };
  }

  // --- Elenchi per i menu a tendina ---

  function opzioniCategorie(verso, conTutte) {
    var out = conTutte ? [{ valore: '', testo: 'Tutte le categorie' }] : [{ valore: '', testo: 'Scegli…' }];
    M.principali(categorie(), verso, !!conTutte).forEach(function (c) {
      out.push({ valore: c.id, testo: c.nome });
      if (conTutte) {
        M.sottocategorie(categorie(), c.id, null, true).forEach(function (s) {
          out.push({ valore: s.id, testo: '\u00a0\u00a0› ' + s.nome });
        });
      }
    });
    return out;
  }

  function opzioniSottocategorie(categoriaId, verso) {
    var out = [{ valore: '', testo: 'Nessuna' }];
    if (!categoriaId) { return out; }
    M.sottocategorie(categorie(), categoriaId, verso).forEach(function (s) { out.push({ valore: s.id, testo: s.nome }); });
    return out;
  }

  function opzioniConti() {
    return [{ valore: '', testo: 'Non indicato' }].concat(archivio().collezioni.conti.map(function (c) {
      return { valore: c.id, testo: c.nome };
    }));
  }

  function opzioniResponsabili() {
    var c = archivio().collezioni;
    var out = [{ valore: '', testo: 'Nessuno' }];
    c.familiari.forEach(function (f) { out.push({ valore: f.id, testo: f.nome }); });
    c.persone.filter(function (p) { return p.attiva !== false; }).forEach(function (p) {
      out.push({ valore: p.id, testo: p.nome + ' (personale)' });
    });
    return out;
  }

  function nomeResponsabile(id) {
    if (!id) { return ''; }
    var r = A.trova(archivio(), 'familiari', id) || A.trova(archivio(), 'persone', id);
    return r ? r.nome : '';
  }

  var TIPI_COLLEGABILI = [
    { valore: '', testo: 'Nessuno' },
    { valore: 'lavoro', testo: 'Lavoro' },
    { valore: 'manutenzione', testo: 'Manutenzione' },
    { valore: 'persona', testo: 'Persona del personale' },
    { valore: 'animale', testo: 'Animale' },
    { valore: 'bolletta', testo: 'Bolletta' }
  ];

  function opzioniElementi(tipo) {
    var info = S.COLLEGAMENTI[tipo];
    if (!info) { return [{ valore: '', testo: '—' }]; }
    var elementi = archivio().collezioni[info.collezione].slice();
    if (tipo === 'bolletta') { elementi.sort(function (x, y) { return x.periodoDal < y.periodoDal ? 1 : -1; }); }
    return [{ valore: '', testo: 'Scegli…' }].concat(elementi.map(function (r) {
      return { valore: r.id, testo: info.nome(r) };
    }));
  }

  // --- Modulo movimento (condiviso) ---

  function ruoloScelto(v) {
    var mappa = B.perId(categorie());
    var s = v.sottocategoriaId ? mappa[v.sottocategoriaId] : null;
    if (s && s.ruolo) { return s.ruolo; }
    var c = mappa[v.categoriaId];
    return c ? c.ruolo : null;
  }

  function valoriDaMovimento(m) {
    var v = {
      id: m.id, verso: m.verso, importo: I.importoPerCampo(m.importoCent), data: m.data, stato: m.stato,
      categoriaId: m.categoriaId || '', sottocategoriaId: m.sottocategoriaId || '', controparte: m.controparte || '',
      collegamentoTipo: m.collegamento ? m.collegamento.tipo : '', collegamentoId: m.collegamento ? m.collegamento.id : '',
      contoId: m.contoId || '', competenza: m.competenza || '', detraibile: !!m.detraibile,
      responsabileId: m.responsabileId || '', note: m.note || '', documento: m.documento || '',
      ricorrenzaId: m.ricorrenzaId || ''
    };
    if (m.collegamento && m.collegamento.tipo === 'bolletta') {
      Object.assign(v, valoriBolletta(A.trova(archivio(), 'bollette', m.collegamento.id)));
    }
    return v;
  }

  function valoriBolletta(b) {
    if (!b) { return { bollettaId: '', periodoDal: '', periodoAl: '', consumo: '', quotaFissa: '', numero: '' }; }
    return {
      bollettaId: b.id, periodoDal: b.periodoDal || '', periodoAl: b.periodoAl || '',
      consumo: I.consumoPerCampo(b.consumo), quotaFissa: I.importoPerCampo(b.quotaFissaCent), numero: b.numero || ''
    };
  }

  function corpoMovimento(v) {
    var ruolo = ruoloScelto(v);
    var eBolletta = !!RUOLI_BOLLETTA[ruolo];
    var h = '<div class="errore-modulo"></div>';
    h += ui.segmentato('verso', [{ valore: 'uscita', testo: 'Uscita' }, { valore: 'entrata', testo: 'Entrata' }], v.verso, 'movimento-ricarica');
    h += '<div class="due-colonne">' +
      ui.campo({ nome: 'importo', etichetta: 'Importo (€)', tipo: 'importo', valore: v.importo, segnaposto: '0,00', autofocus: !v.id }) +
      ui.campo({ nome: 'data', etichetta: 'Data', tipo: 'data', valore: v.data }) + '</div>';
    h += ui.segmentato('stato', [{ valore: 'effettivo', testo: 'Effettivo (pagato)' }, { valore: 'previsto', testo: 'Previsto' }], v.stato);
    h += '<div class="due-colonne">' +
      ui.campo({ nome: 'categoriaId', etichetta: 'Categoria', tipo: 'select', valore: v.categoriaId, opzioni: opzioniCategorie(v.verso), cambia: 'movimento-ricarica' }) +
      ui.campo({ nome: 'sottocategoriaId', etichetta: 'Sottocategoria', tipo: 'select', valore: v.sottocategoriaId, opzioni: opzioniSottocategorie(v.categoriaId, v.verso), cambia: 'movimento-ricarica' }) +
      '</div>';
    h += ui.campo({ nome: 'controparte', etichetta: v.verso === 'entrata' ? 'Da chi (pagatore)' : 'Fornitore o beneficiario', valore: v.controparte, lista: 'elenco-controparti' });
    h += ui.datalist('elenco-controparti', M.controparti(archivio().collezioni.movimenti));

    if (eBolletta) {
      var tipo = ruolo;
      var unita = S.TIPI_BOLLETTA[tipo].unita;
      var esistenti = archivio().collezioni.bollette.filter(function (b) { return b.tipo === tipo; })
        .sort(function (x, y) { return x.periodoDal < y.periodoDal ? 1 : -1; });
      h += '<fieldset><legend>Dati bolletta ' + esc(S.TIPI_BOLLETTA[tipo].nome.toLowerCase()) + ' (facoltativi)</legend>';
      h += ui.campo({ nome: 'bollettaId', etichetta: 'Bolletta', tipo: 'select', valore: v.bollettaId, cambia: 'movimento-bolletta',
        opzioni: [{ valore: '', testo: 'Nuova bolletta' }].concat(esistenti.map(function (b) { return { valore: b.id, testo: S.nomeBolletta(b) }; })) });
      h += '<div class="due-colonne">' +
        ui.campo({ nome: 'periodoDal', etichetta: 'Periodo dal', tipo: 'data', valore: v.periodoDal }) +
        ui.campo({ nome: 'periodoAl', etichetta: 'al', tipo: 'data', valore: v.periodoAl }) + '</div>';
      h += '<div class="due-colonne">' +
        ui.campo({ nome: 'consumo', etichetta: 'Consumo (' + unita + ')', tipo: 'decimale', valore: v.consumo }) +
        (tipo === 'luce' ? ui.campo({ nome: 'quotaFissa', etichetta: 'Quota fissa (€)', tipo: 'importo', valore: v.quotaFissa,
          aiuto: 'quote fisse + quota potenza del periodo' }) : ui.campo({ nome: 'numero', etichetta: 'Numero bolletta', valore: v.numero })) +
        '</div>';
      if (tipo === 'luce') { h += ui.campo({ nome: 'numero', etichetta: 'Numero bolletta', valore: v.numero }); }
      h += '<p class="tenue">Con periodo e consumo il programma confronta le bollette; con la quota fissa calcola il costo variabile del kWh per il fotovoltaico.</p>';
      h += '</fieldset>';
    }

    h += '<details class="altri"' + (v.apriDettagli ? ' open' : '') + '><summary>Altri dettagli</summary>';
    if (!eBolletta) {
      h += '<div class="due-colonne">' +
        ui.campo({ nome: 'collegamentoTipo', etichetta: 'Collegato a', tipo: 'select', valore: v.collegamentoTipo, opzioni: TIPI_COLLEGABILI, cambia: 'movimento-ricarica' }) +
        ui.campo({ nome: 'collegamentoId', etichetta: 'Elemento', tipo: 'select', valore: v.collegamentoId, opzioni: opzioniElementi(v.collegamentoTipo) }) +
        '</div>';
    }
    h += '<div class="due-colonne">' +
      ui.campo({ nome: 'contoId', etichetta: 'Conto', tipo: 'select', valore: v.contoId, opzioni: opzioniConti() }) +
      ui.campo({ nome: 'competenza', etichetta: 'Mese di competenza', tipo: 'mese', valore: v.competenza, aiuto: 'se diverso dalla data' }) +
      '</div>';
    h += ui.campo({ nome: 'responsabileId', etichetta: 'Chi se ne occupa', tipo: 'select', valore: v.responsabileId, opzioni: opzioniResponsabili() });
    h += ui.campo({ nome: 'detraibile', etichetta: 'Detraibile', tipo: 'spunta', valore: v.detraibile });
    h += ui.campo({ nome: 'note', etichetta: 'Note', tipo: 'area', valore: v.note });
    h += ui.campo({ nome: 'documento', etichetta: 'Documento', valore: v.documento, segnaposto: 'nome del file o link (es. Google Drive)' });
    h += '</details>';
    h += '<input type="hidden" name="id" value="' + esc(v.id || '') + '">';
    h += '<input type="hidden" name="ricorrenzaId" value="' + esc(v.ricorrenzaId || '') + '">';
    return h;
  }

  /*
   * Apre il modulo di un movimento. valori: { id } per modificare, oppure valori iniziali
   * (verso, categoriaId, sottocategoriaId, collegamentoTipo, collegamentoId, stato, data, importo…).
   */
  function apriMovimento(valori, opzioni) {
    opzioni = opzioni || {};
    var v;
    if (valori && valori.id) {
      var m = A.trova(archivio(), 'movimenti', valori.id);
      if (!m) { ui.messaggio('Movimento non trovato.', { tipo: 'errore' }); return; }
      v = valoriDaMovimento(m);
    } else {
      v = Object.assign({
        verso: 'uscita', importo: '', data: stato.oggi(), stato: 'effettivo', categoriaId: '', sottocategoriaId: '',
        controparte: '', collegamentoTipo: '', collegamentoId: '', contoId: '', competenza: '', detraibile: false,
        responsabileId: '', note: '', documento: ''
      }, valoriBolletta(null), valori || {});
      if (v.collegamentoTipo) { v.apriDettagli = true; }
    }
    var titolo = opzioni.titolo || (v.id ? 'Modifica movimento' : 'Nuovo movimento');
    var piede = (v.id ? '<button type="button" class="pulsante leggero sinistra" data-azione="movimento-elimina" data-id="' + esc(v.id) + '">Elimina</button>' : '') +
      '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
      '<button type="submit" class="pulsante" form="modulo-movimento">Salva</button>';
    ui.apriModale({
      titolo: titolo,
      corpo: '<form id="modulo-movimento" data-modulo="movimento" autocomplete="off" novalidate>' + corpoMovimento(v) + '</form>',
      piede: piede
    });
  }

  GC.cambi['movimento-ricarica'] = function (el) {
    var form = el.form;
    var v = ui.leggiModulo(form);
    if (el.name === 'verso') {
      var c = A.trova(archivio(), 'categorie', v.categoriaId);
      if (c && !(M.versoCategoria(categorie(), c) === 'entrambi' || M.versoCategoria(categorie(), c) === v.verso)) {
        v.categoriaId = '';
        v.sottocategoriaId = '';
      }
    }
    if (el.name === 'categoriaId') { v.sottocategoriaId = ''; }
    if (el.name === 'collegamentoTipo') { v.collegamentoId = ''; }
    v.apriDettagli = !!form.querySelector('details.altri[open]');
    form.innerHTML = corpoMovimento(v);
  };

  GC.cambi['movimento-bolletta'] = function (el) {
    var form = el.form;
    var v = ui.leggiModulo(form);
    Object.assign(v, valoriBolletta(A.trova(archivio(), 'bollette', v.bollettaId)));
    v.bollettaId = el.value;
    form.innerHTML = corpoMovimento(v);
  };

  function leggiMovimento(v) {
    var importo = I.leggiImporto(v.importo);
    if (importo == null) { throw new Error('Scrivi un importo valido, ad esempio 1.234,56.'); }
    var competenza = v.competenza ? D.leggiMese(v.competenza) : null;
    if (v.competenza && !competenza) { throw new Error('Il mese di competenza non è valido (AAAA-MM).'); }
    return M.nuovoMovimento({
      data: D.leggiData(v.data) || v.data,
      importoCent: importo,
      verso: v.verso,
      stato: v.stato,
      categoriaId: v.categoriaId || null,
      sottocategoriaId: v.sottocategoriaId || null,
      controparte: (v.controparte || '').trim(),
      collegamento: v.collegamentoTipo && v.collegamentoId ? { tipo: v.collegamentoTipo, id: v.collegamentoId } : null,
      contoId: v.contoId || null,
      competenza: competenza,
      detraibile: !!v.detraibile,
      responsabileId: v.responsabileId || null,
      note: (v.note || '').trim(),
      documento: (v.documento || '').trim(),
      ricorrenzaId: v.ricorrenzaId || null
    });
  }

  function bollettaCompilata(v) {
    return !!(v.bollettaId || v.periodoDal || v.periodoAl || v.consumo || v.quotaFissa || v.numero);
  }

  // Elimina una bolletta rimasta senza movimenti collegati.
  function pulisciBolletta(a, bollettaId, ora) {
    if (!bollettaId) { return a; }
    if (A.collegati(a, 'movimenti', 'bolletta', bollettaId).length) { return a; }
    return A.elimina(a, 'bollette', bollettaId, ora);
  }

  GC.moduli.movimento = function (v, form) {
    var ora = stato.ora();
    stato.applica(function (a) {
      var m = leggiMovimento(v);
      var errori = M.validaMovimento(m, a.collezioni.categorie);
      if (errori.length) { throw new Error(errori.join(' ')); }
      var ruolo = M.ruoloDiMovimento(a.collezioni.categorie, m);
      var precedente = v.id ? A.trova(a, 'movimenti', v.id) : null;
      var bollettaPrima = precedente && precedente.collegamento && precedente.collegamento.tipo === 'bolletta' ? precedente.collegamento.id : null;
      if (RUOLI_BOLLETTA[ruolo] && bollettaCompilata(v)) {
        var consumo = v.consumo ? I.leggiConsumo(v.consumo) : null;
        if (v.consumo && consumo == null) { throw new Error('Il consumo non è un numero valido.'); }
        var quota = v.quotaFissa ? I.leggiImporto(v.quotaFissa) : null;
        if (v.quotaFissa && quota == null) { throw new Error('La quota fissa non è un importo valido.'); }
        var b = { tipo: ruolo, periodoDal: D.leggiData(v.periodoDal), periodoAl: D.leggiData(v.periodoAl),
          consumo: consumo, quotaFissaCent: ruolo === 'luce' ? quota : null, numero: (v.numero || '').trim() };
        var erroriB = BO.validaBolletta(b);
        if (erroriB.length) { throw new Error(erroriB.join(' ')); }
        var esistente = v.bollettaId ? A.trova(a, 'bollette', v.bollettaId) : null;
        var rb = esistente ? A.aggiorna(a, 'bollette', esistente.id, b, ora) : A.inserisci(a, 'bollette', b, ora);
        a = rb.archivio;
        m.collegamento = { tipo: 'bolletta', id: rb.record.id };
      } else if (RUOLI_BOLLETTA[ruolo]) {
        m.collegamento = null;
      }
      if (v.id) {
        a = A.aggiorna(a, 'movimenti', v.id, m, ora).archivio;
      } else {
        a = A.inserisci(a, 'movimenti', m, ora).archivio;
      }
      if (bollettaPrima && (!m.collegamento || m.collegamento.id !== bollettaPrima)) { a = pulisciBolletta(a, bollettaPrima, ora); }
      return a;
    }, { form: form, messaggio: v.id ? 'Movimento aggiornato.' : 'Movimento registrato.' });
  };

  GC.azioni['movimento-elimina'] = function (dati) {
    var m = A.trova(archivio(), 'movimenti', dati.id);
    if (!m) { return; }
    var testo = 'Eliminare il movimento del ' + D.formattaData(m.data) + ' di ' + I.formattaImporto(m.importoCent) + '?';
    ui.conferma(testo, { titolo: 'Eliminare il movimento?', ok: 'Elimina', pericolo: true }).then(function (si) {
      if (!si) { return; }
      ui.chiudiModale();
      var ora = stato.ora();
      stato.applica(function (a) {
        a = A.elimina(a, 'movimenti', m.id, ora);
        if (m.collegamento && m.collegamento.tipo === 'bolletta') { a = pulisciBolletta(a, m.collegamento.id, ora); }
        return a;
      }, { messaggio: 'Movimento eliminato.' });
    });
  };

  GC.azioni['movimento-nuovo'] = function (dati) {
    var valori = {};
    ['verso', 'categoriaId', 'sottocategoriaId', 'collegamentoTipo', 'collegamentoId', 'stato', 'competenza', 'importo', 'controparte']
      .forEach(function (k) { if (dati[k]) { valori[k] = dati[k]; } });
    apriMovimento(valori);
  };

  GC.azioni['movimento-apri'] = function (dati) { apriMovimento({ id: dati.id }); };

  // --- Conferma di un previsto ---

  function apriConferma(id) {
    var m = A.trova(archivio(), 'movimenti', id);
    if (!m) { return; }
    var oggi = stato.oggi();
    var data = m.data <= oggi ? m.data : oggi;
    var descr = m.controparte || m.note || M.nomeCategoria(categorie(), m.categoriaId, m.sottocategoriaId);
    ui.apriModale({
      titolo: 'Conferma pagamento',
      corpo: '<form id="modulo-conferma" data-modulo="conferma" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
        '<p><strong>' + esc(descr) + '</strong><br><span class="tenue">Previsto: ' + ui.euro(m.importoCent) + ' il ' + ui.data(m.data) + '</span></p>' +
        '<div class="due-colonne">' +
        ui.campo({ nome: 'importo', etichetta: 'Importo reale (€)', tipo: 'importo', valore: I.importoPerCampo(m.importoCent), autofocus: true }) +
        ui.campo({ nome: 'data', etichetta: 'Data del pagamento', tipo: 'data', valore: data }) + '</div>' +
        ui.campo({ nome: 'contoId', etichetta: 'Conto', tipo: 'select', valore: m.contoId || '', opzioni: opzioniConti() }) +
        '<input type="hidden" name="id" value="' + esc(m.id) + '"></form>',
      piede: '<button type="button" class="pulsante leggero sinistra" data-azione="conferma-dettagli" data-id="' + esc(m.id) + '">Tutti i dettagli</button>' +
        '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-conferma">Conferma</button>'
    });
  }

  GC.moduli.conferma = function (v, form) {
    var importo = I.leggiImporto(v.importo);
    if (!(importo > 0)) { ui.erroreModulo(form, 'Scrivi l\'importo pagato.'); return; }
    var data = D.leggiData(v.data);
    if (!data) { ui.erroreModulo(form, 'Inserisci la data del pagamento.'); return; }
    stato.applica(function (a) {
      return M.conferma(a, v.id, { importoCent: importo, data: data, contoId: v.contoId || null }, stato.ora()).archivio;
    }, { form: form, messaggio: 'Pagamento confermato.' });
  };

  GC.azioni['movimento-conferma'] = function (dati) { apriConferma(dati.id); };
  GC.azioni['conferma-dettagli'] = function (dati) { ui.chiudiModale(); apriMovimento({ id: dati.id }); };

  // --- Registro ---

  function rigaMovimento(m, mostraData) {
    var cat = M.nomeCategoria(categorie(), m.categoriaId, m.sottocategoriaId);
    var titolo = m.controparte || m.note || cat;
    var sotto = [mostraData === false ? '' : D.formattaData(m.data), cat];
    var collegamento = A.nomeCollegamento(archivio(), m.collegamento);
    if (collegamento && m.collegamento.tipo !== 'bolletta') { sotto.push(collegamento); }
    var nomeSotto = m.sottocategoriaId ? (A.trova(archivio(), 'categorie', m.sottocategoriaId) || {}).nome : '';
    if (m.controparte && m.note && m.note !== nomeSotto) { sotto.push(m.note); }
    var etichette = (m.stato === 'previsto' ? ui.distintivo('previsto', 'previsto') + ' ' : '') +
      (m.detraibile ? ui.distintivo('detraibile') : '');
    var segno = m.verso === 'entrata' ? '+' : '';
    return '<li class="riga-con-azioni' + (m.stato === 'previsto' ? ' previsto' : '') + '">' +
      '<button type="button" class="riga" data-azione="movimento-apri" data-id="' + esc(m.id) + '">' +
      '<span class="corpo"><span class="titolo">' + esc(titolo) + '</span><br><span class="sotto">' +
      esc(sotto.filter(Boolean).join(' · ')) + '</span>' + (etichette ? '<br>' + etichette : '') + '</span>' +
      '<span class="destra importo' + (m.verso === 'entrata' ? ' entrata' : '') + '">' + segno + ui.euro(m.importoCent) + '</span></button>' +
      (m.stato === 'previsto' ? '<span class="azioni-riga"><button type="button" class="pulsante piccolo secondario" data-azione="movimento-conferma" data-id="' + esc(m.id) + '">Conferma</button></span>' : '') +
      '</li>';
  }

  function moduloFiltri(f) {
    var anni = M.anni(archivio().collezioni.movimenti, stato.oggi());
    var opzAnni = [{ valore: '', testo: 'Tutti gli anni' }].concat(anni.map(function (a) { return { valore: a, testo: a }; }));
    var opzMesi = [{ valore: '', testo: 'Tutti i mesi' }].concat(D.MESI.map(function (n, i) {
      return { valore: String(i + 1).padStart(2, '0'), testo: n.charAt(0).toUpperCase() + n.slice(1) };
    }));
    var conti = archivio().collezioni.conti;
    return '<form class="filtri" data-modulo="filtro-movimenti">' +
      ui.campo({ nome: 'anno', etichetta: 'Anno', tipo: 'select', valore: f.anno, opzioni: opzAnni, cambia: 'filtro-movimenti' }) +
      ui.campo({ nome: 'mese', etichetta: 'Mese', tipo: 'select', valore: f.mese, opzioni: opzMesi, cambia: 'filtro-movimenti' }) +
      ui.campo({ nome: 'categoriaId', etichetta: 'Categoria', tipo: 'select', valore: f.categoriaId, opzioni: opzioniCategorie(null, true), cambia: 'filtro-movimenti' }) +
      ui.campo({ nome: 'stato', etichetta: 'Stato', tipo: 'select', valore: f.stato, cambia: 'filtro-movimenti',
        opzioni: [{ valore: '', testo: 'Tutti' }, { valore: 'effettivo', testo: 'Effettivi' }, { valore: 'previsto', testo: 'Previsti' }] }) +
      ui.campo({ nome: 'verso', etichetta: 'Tipo', tipo: 'select', valore: f.verso, cambia: 'filtro-movimenti',
        opzioni: [{ valore: '', testo: 'Uscite ed entrate' }, { valore: 'uscita', testo: 'Uscite' }, { valore: 'entrata', testo: 'Entrate' }] }) +
      ui.campo({ nome: 'detraibile', etichetta: 'Detraibile', tipo: 'select', valore: f.detraibile, cambia: 'filtro-movimenti',
        opzioni: [{ valore: '', testo: 'Tutti' }, { valore: 'si', testo: 'Sì' }, { valore: 'no', testo: 'No' }] }) +
      (conti.length ? ui.campo({ nome: 'contoId', etichetta: 'Conto', tipo: 'select', valore: f.contoId, cambia: 'filtro-movimenti',
        opzioni: [{ valore: '', testo: 'Tutti i conti' }].concat(conti.map(function (c) { return { valore: c.id, testo: c.nome }; })) }) : '') +
      '<div class="largo">' + ui.campo({ nome: 'testo', etichetta: 'Cerca', valore: f.testo, segnaposto: 'fornitore, note, documento…', cambia: 'filtro-movimenti' }) + '</div>' +
      '</form>';
  }

  GC.cambi['filtro-movimenti'] = function (el) {
    var v = ui.leggiModulo(el.form);
    filtro = Object.assign({}, filtro, v);
    righeMostrate = LIMITE_RIGHE;
    GC.app.aggiorna();
  };

  GC.moduli['filtro-movimenti'] = function (v) {
    filtro = Object.assign({}, filtro, v);
    righeMostrate = LIMITE_RIGHE;
    GC.app.aggiorna();
  };

  GC.azioni['movimenti-futuri'] = function () { filtro.futuri = filtro.futuri ? '' : '1'; GC.app.aggiorna(); };

  GC.azioni['movimenti-altri'] = function () { righeMostrate += LIMITE_RIGHE; GC.app.aggiorna(); };
  GC.azioni['filtro-azzera'] = function () { filtro = filtroIniziale(); GC.app.aggiorna(); };

  function filtroPerLogica(f) {
    return {
      anno: f.anno || null,
      mese: f.anno && f.mese ? f.anno + '-' + f.mese : null,
      meseSenzaAnno: !f.anno && f.mese ? f.mese : null,
      categoriaId: f.categoriaId || null,
      stato: f.stato || null,
      verso: f.verso || null,
      detraibile: f.detraibile || null,
      contoId: f.contoId || null,
      testo: f.testo || ''
    };
  }

  function renderRegistro() {
    if (!filtro) { filtro = filtroIniziale(); }
    var fl = filtroPerLogica(filtro);
    var elenco = M.filtra(archivio().collezioni.movimenti, fl, categorie());
    if (fl.meseSenzaAnno) { elenco = elenco.filter(function (m) { return m.data.slice(5, 7) === fl.meseSenzaAnno; }); }
    // I previsti lontani (oltre la finestra dei "prossimi giorni") si mostrano solo a richiesta.
    var limiteFuturi = D.aggiungiGiorni(stato.oggi(), archivio().impostazioni.soglie.finestraGiorni);
    var lontani = elenco.filter(function (m) { return m.data > limiteFuturi; });
    if (!filtro.futuri && !fl.mese) { elenco = elenco.filter(function (m) { return m.data <= limiteFuturi; }); }
    elenco = M.ordina(elenco, true);
    var t = M.totali(elenco);
    var h = '<div class="scheda"><div class="intestazione"><h2>Registro</h2>' +
      '<button type="button" class="pulsante" data-azione="movimento-nuovo">+ Movimento</button></div>' +
      '<details class="altri"' + (filtroAttivo() ? ' open' : '') + '><summary>Filtri' + (filtroAttivo() ? ' (attivi)' : '') + '</summary>' + moduloFiltri(filtro) +
      '<button type="button" class="pulsante leggero piccolo" data-azione="filtro-azzera">Azzera filtri</button></details>' +
      '<div class="totali-barra"><span>Speso: <strong>' + ui.euro(t.speso) + '</strong></span>' +
      '<span>Entrate: <strong class="entrata">' + ui.euro(t.entrate) + '</strong></span>' +
      '<span>Previsto: <strong>' + ui.euro(t.previsto) + '</strong></span>' +
      '<span class="tenue">' + elenco.length + ' movimenti</span></div>';
    if (lontani.length && !fl.mese) {
      h += '<div class="pulsanti" style="margin-top:0"><button type="button" class="pulsante leggero piccolo" data-azione="movimenti-futuri">' +
        (filtro.futuri ? 'Nascondi i previsti dopo il ' + esc(D.formattaData(limiteFuturi)) :
          'Mostra anche i ' + lontani.length + ' previsti dopo il ' + esc(D.formattaData(limiteFuturi))) + '</button></div>';
    }
    if (!elenco.length) {
      h += ui.vuoto(archivio().collezioni.movimenti.length ? 'Nessun movimento con questi filtri.' : 'Ancora nessun movimento. Usa "+ Spesa" o "+ Movimento" per iniziare.');
    } else {
      var meseCorrente = null;
      var mostrati = elenco.slice(0, righeMostrate);
      var totaliMese = {};
      elenco.forEach(function (m) {
        var k = D.mese(m.data);
        if (!totaliMese[k]) { totaliMese[k] = []; }
        totaliMese[k].push(m);
      });
      h += '<ul class="elenco">';
      mostrati.forEach(function (m) {
        var k = D.mese(m.data);
        if (k !== meseCorrente) {
          meseCorrente = k;
          var tm = M.totali(totaliMese[k]);
          h += '<li class="gruppo-mese"><span style="text-transform:capitalize">' + esc(D.formattaMese(k)) + '</span><span>' +
            ui.euro(tm.speso) + (tm.previsto ? ' + ' + ui.euro(tm.previsto) + ' previsti' : '') + '</span></li>';
        }
        h += rigaMovimento(m);
      });
      h += '</ul>';
      if (elenco.length > mostrati.length) {
        h += '<div class="pulsanti"><button type="button" class="pulsante secondario" data-azione="movimenti-altri">Mostra altri ' +
          Math.min(LIMITE_RIGHE, elenco.length - mostrati.length) + '</button></div>';
      }
    }
    return h + '</div>';
  }

  function filtroAttivo() {
    var f = filtro || filtroIniziale();
    var base = filtroIniziale();
    return Object.keys(base).some(function (k) { return (f[k] || '') !== (base[k] || ''); });
  }

  // --- Ricorrenze ---

  function valoriRicorrenza(r) {
    return {
      id: r.id, descrizione: r.descrizione || '', importo: I.importoPerCampo(r.importoCent), verso: r.verso || 'uscita',
      ogniMesi: String(r.ogniMesi || 1), dataInizio: r.dataInizio || '', dataFine: r.dataFine || '',
      categoriaId: r.categoriaId || '', sottocategoriaId: r.sottocategoriaId || '', controparte: r.controparte || '',
      collegamentoTipo: r.collegamento ? r.collegamento.tipo : '', collegamentoId: r.collegamento ? r.collegamento.id : '',
      contoId: r.contoId || '', responsabileId: r.responsabileId || '', detraibile: !!r.detraibile, note: r.note || '',
      attiva: r.attiva !== false
    };
  }

  function corpoRicorrenza(v) {
    var h = '<div class="errore-modulo"></div>';
    h += ui.campo({ nome: 'descrizione', etichetta: 'Descrizione', valore: v.descrizione, segnaposto: 'es. Rata mutuo, Contributi', autofocus: !v.id });
    h += ui.segmentato('verso', [{ valore: 'uscita', testo: 'Uscita' }, { valore: 'entrata', testo: 'Entrata' }], v.verso, 'ricorrenza-ricarica');
    h += '<div class="due-colonne">' +
      ui.campo({ nome: 'importo', etichetta: 'Importo (€)', tipo: 'importo', valore: v.importo }) +
      ui.campo({ nome: 'ogniMesi', etichetta: 'Frequenza', tipo: 'select', valore: v.ogniMesi,
        opzioni: S.FREQUENZE.map(function (f) { return { valore: String(f.mesi), testo: f.nome }; }) }) + '</div>';
    h += '<div class="due-colonne">' +
      ui.campo({ nome: 'dataInizio', etichetta: 'Prima scadenza', tipo: 'data', valore: v.dataInizio }) +
      ui.campo({ nome: 'dataFine', etichetta: 'Fine (facoltativa)', tipo: 'data', valore: v.dataFine }) + '</div>';
    h += '<div class="due-colonne">' +
      ui.campo({ nome: 'categoriaId', etichetta: 'Categoria', tipo: 'select', valore: v.categoriaId, opzioni: opzioniCategorie(v.verso), cambia: 'ricorrenza-ricarica' }) +
      ui.campo({ nome: 'sottocategoriaId', etichetta: 'Sottocategoria', tipo: 'select', valore: v.sottocategoriaId, opzioni: opzioniSottocategorie(v.categoriaId, v.verso) }) + '</div>';
    h += ui.campo({ nome: 'controparte', etichetta: 'Fornitore o beneficiario', valore: v.controparte, lista: 'elenco-controparti-r' });
    h += ui.datalist('elenco-controparti-r', M.controparti(archivio().collezioni.movimenti));
    h += '<details class="altri"' + (v.collegamentoTipo ? ' open' : '') + '><summary>Altri dettagli</summary>';
    h += '<div class="due-colonne">' +
      ui.campo({ nome: 'collegamentoTipo', etichetta: 'Collegato a', tipo: 'select', valore: v.collegamentoTipo,
        opzioni: TIPI_COLLEGABILI.filter(function (t) { return t.valore !== 'bolletta'; }), cambia: 'ricorrenza-ricarica' }) +
      ui.campo({ nome: 'collegamentoId', etichetta: 'Elemento', tipo: 'select', valore: v.collegamentoId, opzioni: opzioniElementi(v.collegamentoTipo) }) + '</div>';
    h += '<div class="due-colonne">' +
      ui.campo({ nome: 'contoId', etichetta: 'Conto', tipo: 'select', valore: v.contoId, opzioni: opzioniConti() }) +
      ui.campo({ nome: 'responsabileId', etichetta: 'Chi se ne occupa', tipo: 'select', valore: v.responsabileId, opzioni: opzioniResponsabili() }) + '</div>';
    h += ui.campo({ nome: 'detraibile', etichetta: 'Detraibile', tipo: 'spunta', valore: v.detraibile });
    h += ui.campo({ nome: 'note', etichetta: 'Note', tipo: 'area', valore: v.note });
    h += ui.campo({ nome: 'attiva', etichetta: 'Attiva (genera i movimenti previsti)', tipo: 'spunta', valore: v.attiva });
    h += '</details>';
    h += '<input type="hidden" name="id" value="' + esc(v.id || '') + '">';
    return h;
  }

  function apriRicorrenza(valori) {
    var v;
    if (valori && valori.id) {
      var r = A.trova(archivio(), 'ricorrenze', valori.id);
      if (!r) { return; }
      v = valoriRicorrenza(r);
    } else {
      v = Object.assign(valoriRicorrenza({ dataInizio: stato.oggi() }), valori || {});
    }
    ui.apriModale({
      titolo: v.id ? 'Modifica ricorrenza' : 'Nuova ricorrenza',
      corpo: '<form id="modulo-ricorrenza" data-modulo="ricorrenza" autocomplete="off" novalidate>' + corpoRicorrenza(v) + '</form>',
      piede: (v.id ? '<button type="button" class="pulsante leggero sinistra" data-azione="ricorrenza-elimina" data-id="' + esc(v.id) + '">Elimina</button>' : '') +
        '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-ricorrenza">Salva</button>'
    });
  }

  GC.cambi['ricorrenza-ricarica'] = function (el) {
    var form = el.form;
    var v = ui.leggiModulo(form);
    if (el.name === 'categoriaId' || el.name === 'verso') { v.sottocategoriaId = ''; }
    if (el.name === 'verso') { v.categoriaId = ''; }
    if (el.name === 'collegamentoTipo') { v.collegamentoId = ''; }
    form.innerHTML = corpoRicorrenza(v);
    if (el.name === 'collegamentoTipo') { form.querySelector('details.altri').open = true; }
  };

  GC.moduli.ricorrenza = function (v, form) {
    var importo = I.leggiImporto(v.importo);
    var oggi = stato.oggi();
    var ora = stato.ora();
    var campi = {
      descrizione: (v.descrizione || '').trim(),
      importoCent: importo,
      verso: v.verso,
      ogniMesi: Number(v.ogniMesi),
      dataInizio: D.leggiData(v.dataInizio),
      dataFine: v.dataFine ? D.leggiData(v.dataFine) : null,
      categoriaId: v.categoriaId || null,
      sottocategoriaId: v.sottocategoriaId || null,
      controparte: (v.controparte || '').trim(),
      collegamento: v.collegamentoTipo && v.collegamentoId ? { tipo: v.collegamentoTipo, id: v.collegamentoId } : null,
      contoId: v.contoId || null,
      responsabileId: v.responsabileId || null,
      detraibile: !!v.detraibile,
      note: (v.note || '').trim(),
      attiva: !!v.attiva
    };
    if (v.id) { campi.id = v.id; }
    var nuova = !v.id;
    var salvata = stato.applica(function (a) {
      if (importo == null) { throw new Error('Scrivi un importo valido.'); }
      return M.salvaRicorrenza(a, campi, oggi, ora);
    }, { form: form, messaggio: 'Ricorrenza salvata: i movimenti previsti sono aggiornati.' });
    if (salvata && nuova && campi.dataInizio < oggi) {
      var ric = archivio().collezioni.ricorrenze[archivio().collezioni.ricorrenze.length - 1];
      var passati = archivio().collezioni.movimenti.filter(function (m) {
        return m.ricorrenzaId === ric.id && m.stato === 'previsto' && m.data < oggi;
      });
      if (passati.length) {
        ui.conferma('La prima scadenza è nel passato: ci sono ' + passati.length + ' scadenze già passate. Le segno come già pagate (effettive)?', {
          titolo: 'Scadenze passate', ok: 'Sì, già pagate', annulla: 'No, lasciale previste'
        }).then(function (si) {
          if (si) { stato.applica(function (a) { return M.confermaPassati(a, ric.id, oggi, stato.ora()); }); }
        });
      }
    }
  };

  GC.azioni['ricorrenza-elimina'] = function (dati) {
    ui.conferma('I movimenti previsti non ancora confermati di questa ricorrenza verranno eliminati; quelli già pagati restano nel registro.', {
      titolo: 'Eliminare la ricorrenza?', ok: 'Elimina', pericolo: true
    }).then(function (si) {
      if (!si) { return; }
      ui.chiudiModale();
      stato.applica(function (a) { return M.eliminaRicorrenza(a, dati.id, stato.ora()); }, { messaggio: 'Ricorrenza eliminata.' });
    });
  };

  GC.azioni['ricorrenza-nuova'] = function (dati) {
    var valori = {};
    ['categoriaId', 'sottocategoriaId', 'collegamentoTipo', 'collegamentoId', 'descrizione', 'controparte'].forEach(function (k) {
      if (dati[k]) { valori[k] = dati[k]; }
    });
    apriRicorrenza(valori);
  };
  GC.azioni['ricorrenza-apri'] = function (dati) { apriRicorrenza({ id: dati.id }); };

  function rigaRicorrenza(r, oggi) {
    var prossima = r.attiva === false ? null : M.prossimaData(r, oggi);
    var sotto = [S.nomeFrequenza(r.ogniMesi), M.nomeCategoria(categorie(), r.categoriaId, r.sottocategoriaId)];
    if (r.controparte) { sotto.push(r.controparte); }
    var resp = nomeResponsabile(r.responsabileId);
    if (resp) { sotto.push(resp); }
    return '<li><button type="button" class="riga" data-azione="ricorrenza-apri" data-id="' + esc(r.id) + '">' +
      '<span class="corpo"><span class="titolo">' + esc(r.descrizione) + '</span>' +
      (r.attiva === false ? ' ' + ui.distintivo('in pausa') : '') + '<br><span class="sotto">' + esc(sotto.join(' · ')) + '</span></span>' +
      '<span class="destra"><span class="importo' + (r.verso === 'entrata' ? ' entrata' : '') + '">' + ui.euro(r.importoCent) + '</span><br>' +
      '<span class="sotto">' + (prossima ? 'prossima ' + ui.data(prossima) : '—') + '</span></span></button></li>';
  }

  function renderRicorrenze() {
    var oggi = stato.oggi();
    var lista = archivio().collezioni.ricorrenze.slice().sort(function (a, b) { return B.confrontaTesti(a.descrizione, b.descrizione); });
    var h = '<div class="scheda"><div class="intestazione"><h2>Ricorrenze</h2>' +
      '<button type="button" class="pulsante" data-azione="ricorrenza-nuova">+ Ricorrenza</button></div>' +
      '<p class="tenue">Ogni ricorrenza crea da sola i movimenti previsti fino a ' + esc(archivio().impostazioni.ricorrenzeMesiAvanti) +
      ' mesi avanti. Quando paghi, conferma l\'importo reale dal registro.</p>';
    h += lista.length ? '<ul class="elenco">' + lista.map(function (r) { return rigaRicorrenza(r, oggi); }).join('') + '</ul>'
      : ui.vuoto('Nessuna ricorrenza: aggiungi mutuo, condominio, assicurazioni, abbonamenti…');
    return h + '</div>';
  }

  // --- Bollette ---

  function renderBollette() {
    var tipi = Object.keys(S.TIPI_BOLLETTA);
    var soglie = archivio().impostazioni.soglie;
    var tutte = BO.conImporti(archivio());
    var lista = tutte.filter(function (b) { return b.tipo === tipoBollette; }).reverse();
    var unita = S.TIPI_BOLLETTA[tipoBollette].unita;
    var cat = M.perRuolo(categorie(), tipoBollette);
    var h = '<div class="scheda"><div class="intestazione"><h2>Bollette</h2>' +
      (cat ? '<button type="button" class="pulsante" data-azione="movimento-nuovo" data-categoria-id="' + esc(cat.padreId || cat.id) + '" data-sottocategoria-id="' +
        esc(cat.padreId ? cat.id : '') + '" data-stato="previsto">+ Bolletta</button>' : '') + '</div>';
    h += '<div class="schede-nav">' + tipi.map(function (t) {
      return '<button type="button" class="chip' + (t === tipoBollette ? ' attivo' : '') + '" data-azione="bollette-tipo" data-tipo="' + t + '">' +
        esc(S.TIPI_BOLLETTA[t].nome) + '</button>';
    }).join('') + '</div>';
    if (tipoBollette === 'luce') {
      var costo = BO.costoVariabileKWh(archivio(), D.mese(stato.oggi()));
      h += '<div class="nota-box">Costo variabile del kWh: <strong>' + esc(I.formattaPrezzoKWh(costo.valore)) + '</strong> — ' +
        (costo.fonte === 'bollette' ? 'ricavato da ' + costo.numeroBollette + ' bollette dell\'ultimo anno con quota fissa.' :
          costo.fonte === 'impostazioni' ? 'valore di riserva delle Impostazioni (nessuna bolletta con quota fissa).' :
            'mancano bollette con quota fissa e il valore di riserva nelle Impostazioni.') + '</div>';
    }
    h += '<p class="tenue">Segnalo le bollette con importo o consumo oltre il ' + esc(soglie.bollettaPct) +
      '% rispetto allo stesso periodo dell\'anno prima o, se manca, alla media delle ultime ' + esc(soglie.bollettaUltime) + '.</p>';
    if (!lista.length) {
      h += ui.vuoto('Nessuna bolletta. Registra un pagamento in Utenze › ' + S.TIPI_BOLLETTA[tipoBollette].nome + ' e compila i "Dati bolletta".');
      return h + '</div>';
    }
    h += '<ul class="elenco">';
    lista.forEach(function (b) {
      var conf = BO.confronta(tutte, b, soglie);
      var perUnita = BO.costoPerUnita(b);
      var etichette = '';
      if (conf) {
        var rif = conf.riferimento.tipo === 'anno-prima' ? 'anno prima' : 'media ' + conf.riferimento.bollette.length;
        if (conf.variazioneImporto != null) {
          etichette += ui.distintivo('importo ' + I.formattaPercentuale(conf.variazioneImporto, true) + ' vs ' + rif, conf.superaImporto ? 'pericolo' : '') + ' ';
        }
        if (conf.variazioneConsumo != null) {
          etichette += ui.distintivo('consumo ' + I.formattaPercentuale(conf.variazioneConsumo, true), conf.superaConsumo ? 'pericolo' : '');
        }
      }
      h += '<li><button type="button" class="riga" data-azione="bolletta-apri" data-id="' + esc(b.id) + '">' +
        '<span class="corpo"><span class="titolo">' + esc(D.formattaData(b.periodoDal) + ' – ' + D.formattaData(b.periodoAl)) + '</span><br>' +
        '<span class="sotto">Consumo ' + esc(I.formattaConsumo(b.consumo, unita)) +
        (perUnita != null ? ' · ' + esc(I.formattaImporto(perUnita)) + '/' + esc(unita) : '') +
        (b.quotaFissaCent != null ? ' · quota fissa ' + ui.euro(b.quotaFissaCent) : '') + '</span>' +
        (etichette ? '<br>' + etichette : '') + '</span>' +
        '<span class="destra importo">' + ui.euro(b.importoCent) + '</span></button></li>';
    });
    return h + '</ul></div>';
  }

  GC.azioni['bollette-tipo'] = function (dati) { tipoBollette = dati.tipo; GC.app.aggiorna(); };

  function apriBolletta(id) {
    var mov = A.collegati(archivio(), 'movimenti', 'bolletta', id);
    if (mov.length) { apriMovimento({ id: mov[0].id }); }
  }
  GC.azioni['bolletta-apri'] = function (dati) { apriBolletta(dati.id); };

  // --- Budget ---

  function renderBudget() {
    var oggi = stato.oggi();
    if (!annoBudget) { annoBudget = oggi.slice(0, 4); }
    var anni = M.anni(archivio().collezioni.movimenti, oggi);
    var prossimo = String(Number(oggi.slice(0, 4)) + 1);
    if (anni.indexOf(prossimo) < 0) { anni.unshift(prossimo); }
    var uso = M.usoBudget(archivio(), annoBudget);
    var h = '<div class="scheda"><div class="intestazione"><h2>Budget ' + esc(annoBudget) + '</h2>' +
      '<button type="button" class="pulsante" data-azione="budget-modifica">Imposta budget</button></div>';
    h += '<div class="schede-nav">' + anni.map(function (a) {
      return '<button type="button" class="chip' + (a === annoBudget ? ' attivo' : '') + '" data-azione="budget-anno" data-anno="' + a + '">' + a + '</button>';
    }).join('') + '</div>';
    if (!uso.length) {
      h += ui.vuoto('Nessun budget per il ' + annoBudget + '. Il budget è facoltativo: imposta un importo annuale per le categorie che vuoi tenere d\'occhio.');
      return h + '</div>';
    }
    var totB = B.somma(uso, function (u) { return u.budgetCent; });
    var totS = B.somma(uso, function (u) { return u.spesoCent; });
    h += '<ul class="elenco">';
    uso.forEach(function (u) {
      h += '<li><div class="riga" style="display:block"><div class="intestazione"><span class="titolo">' + esc(u.categoria ? u.categoria.nome : 'Categoria eliminata') + '</span>' +
        '<span><strong>' + esc(I.formattaPercentuale(u.percentuale)) + '</strong></span></div>' + ui.barra(u.percentuale) +
        '<span class="sotto">' + ui.euro(u.spesoCent) + ' spesi su ' + ui.euro(u.budgetCent) +
        (u.previstoCent ? ' · ' + ui.euro(u.previstoCent) + ' previsti' : '') + '</span></div></li>';
    });
    h += '</ul><p><strong>Totale:</strong> ' + ui.euro(totS) + ' su ' + ui.euro(totB) + ' (' + esc(I.formattaPercentuale(I.rapporto(totS, totB))) + ')</p>';
    return h + '</div>';
  }

  GC.azioni['budget-anno'] = function (dati) { annoBudget = dati.anno; GC.app.aggiorna(); };

  GC.azioni['budget-modifica'] = function () {
    var anno = Number(annoBudget);
    var esistenti = archivio().collezioni.budget.filter(function (b) { return b.anno === anno; });
    var perCat = {};
    esistenti.forEach(function (b) { perCat[b.categoriaId] = b; });
    var corpo = '<form id="modulo-budget" data-modulo="budget" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
      '<p class="tenue">Lascia vuoto per non avere un budget su quella categoria.</p>' +
      M.principali(categorie(), 'uscita').map(function (c) {
        return ui.campo({ nome: 'b-' + c.id, etichetta: c.nome, tipo: 'importo', valore: perCat[c.id] ? I.importoPerCampo(perCat[c.id].importoCent) : '' });
      }).join('') + '<input type="hidden" name="anno" value="' + anno + '"></form>';
    ui.apriModale({
      titolo: 'Budget ' + anno,
      corpo: corpo,
      piede: '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-budget">Salva</button>'
    });
  };

  GC.moduli.budget = function (v, form) {
    var anno = Number(v.anno);
    var ora = stato.ora();
    stato.applica(function (a) {
      Object.keys(v).filter(function (k) { return k.indexOf('b-') === 0; }).forEach(function (k) {
        var categoriaId = k.slice(2);
        var testo = (v[k] || '').trim();
        var esistente = a.collezioni.budget.filter(function (b) { return b.anno === anno && b.categoriaId === categoriaId; })[0];
        if (!testo) {
          if (esistente) { a = A.elimina(a, 'budget', esistente.id, ora); }
          return;
        }
        var importo = I.leggiImporto(testo);
        if (importo == null) { throw new Error('Importo non valido per ' + (A.trova(a, 'categorie', categoriaId) || {}).nome + '.'); }
        if (esistente) { a = A.aggiorna(a, 'budget', esistente.id, { importoCent: importo }, ora).archivio; }
        else { a = A.inserisci(a, 'budget', { anno: anno, categoriaId: categoriaId, importoCent: importo }, ora).archivio; }
      });
      return a;
    }, { form: form, messaggio: 'Budget salvato.' });
  };

  // --- Esportazione CSV ---

  var filtroCsv = null;

  function renderEsporta() {
    var oggi = stato.oggi();
    if (!filtroCsv) { filtroCsv = { anno: oggi.slice(0, 4), categoriaId: '', detraibile: '' }; }
    var anni = M.anni(archivio().collezioni.movimenti, oggi);
    var r = M.esportaCsv(archivio(), filtroCsvLogica());
    return '<div class="scheda"><h2>Esporta i movimenti in CSV</h2>' +
      '<p class="tenue">Il file usa il punto e virgola e i decimali con la virgola: si apre direttamente in Excel in italiano.</p>' +
      '<form class="filtri" data-modulo="esporta-csv">' +
      ui.campo({ nome: 'anno', etichetta: 'Anno', tipo: 'select', valore: filtroCsv.anno, cambia: 'filtro-csv',
        opzioni: [{ valore: '', testo: 'Tutti gli anni' }].concat(anni.map(function (a) { return { valore: a, testo: a }; })) }) +
      ui.campo({ nome: 'categoriaId', etichetta: 'Categoria', tipo: 'select', valore: filtroCsv.categoriaId, opzioni: opzioniCategorie(null, true), cambia: 'filtro-csv' }) +
      ui.campo({ nome: 'detraibile', etichetta: 'Detraibile', tipo: 'select', valore: filtroCsv.detraibile, cambia: 'filtro-csv',
        opzioni: [{ valore: '', testo: 'Tutti' }, { valore: 'si', testo: 'Solo detraibili' }, { valore: 'no', testo: 'Solo non detraibili' }] }) +
      '</form><p>' + r.numero + ' movimenti da esportare.</p>' +
      '<div class="pulsanti"><button type="button" class="pulsante" data-azione="scarica-csv"' + (r.numero ? '' : ' disabled') + '>Scarica CSV</button></div></div>';
  }

  function filtroCsvLogica() {
    return { anno: filtroCsv.anno || null, categoriaId: filtroCsv.categoriaId || null, detraibile: filtroCsv.detraibile || null };
  }

  GC.cambi['filtro-csv'] = function (el) {
    filtroCsv = Object.assign({}, filtroCsv, ui.leggiModulo(el.form));
    GC.app.aggiorna();
  };
  GC.moduli['esporta-csv'] = function () { GC.azioni['scarica-csv'](); };

  GC.azioni['scarica-csv'] = function () {
    var r = M.esportaCsv(archivio(), filtroCsvLogica());
    var nome = 'movimenti' + (filtroCsv.anno ? '-' + filtroCsv.anno : '') + (filtroCsv.detraibile === 'si' ? '-detraibili' : '');
    ui.scarica(GC.app.nomeFile(nome, 'csv'), r.testo, 'text/csv;charset=utf-8');
  };

  // --- Schermata ---

  GC.viste.movimenti = {
    titolo: 'Movimenti',
    render: function (rotta) {
      var scheda = rotta.parti[0] || 'registro';
      var h = ui.schedeNav('movimenti', SCHEDE, scheda);
      if (scheda === 'ricorrenze') { return h + renderRicorrenze(); }
      if (scheda === 'bollette') {
        if (rotta.parametri.tipo && S.TIPI_BOLLETTA[rotta.parametri.tipo]) { tipoBollette = rotta.parametri.tipo; }
        return h + renderBollette();
      }
      if (scheda === 'budget') { return h + renderBudget(); }
      if (scheda === 'esporta') { return h + renderEsporta(); }
      return h + renderRegistro();
    },
    apri: function (id, rotta) {
      if (rotta.parti[0] === 'bollette') { apriBolletta(id); return; }
      if (rotta.parti[0] === 'ricorrenze') { apriRicorrenza({ id: id }); return; }
      apriMovimento({ id: id });
    }
  };

  GC.forme.movimento = apriMovimento;
  GC.forme.conferma = apriConferma;
  GC.forme.ricorrenza = apriRicorrenza;
  GC.forme.rigaMovimento = rigaMovimento;
  GC.forme.opzioniResponsabili = opzioniResponsabili;
  GC.forme.opzioniConti = opzioniConti;
  GC.forme.opzioniCategorie = opzioniCategorie;
  GC.forme.opzioniSottocategorie = opzioniSottocategorie;
  GC.forme.opzioniElementi = opzioniElementi;
  GC.forme.nomeResponsabile = nomeResponsabile;
  GC.forme.TIPI_COLLEGABILI = TIPI_COLLEGABILI;
})(typeof window !== 'undefined' ? window : globalThis);
