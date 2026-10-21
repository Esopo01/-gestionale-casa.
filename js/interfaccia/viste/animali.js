/*
 * Gestionale casa — Animali: schede, eventi sanitari con richiami, costi.
 * #/animali, #/animale/<id>
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
  var AN = GC.animali;
  var stato = GC.stato;

  function archivio() { return stato.archivio; }
  function nomeTipo(v) {
    var t = S.TIPI_EVENTO.filter(function (x) { return x.valore === v; })[0];
    return t ? t.nome : v;
  }

  function badgeRichiamo(data, oggi) {
    if (data < oggi) { return ui.distintivo('richiamo scaduto', 'pericolo'); }
    if (data <= D.aggiungiGiorni(oggi, archivio().impostazioni.soglie.finestraGiorni)) { return ui.distintivo('richiamo in arrivo', 'attenzione'); }
    return '';
  }

  function renderElenco() {
    var oggi = stato.oggi();
    var animali = archivio().collezioni.animali.slice().sort(function (a, b) {
      return ((a.attivo === false) - (b.attivo === false)) || B.confrontaTesti(a.nome, b.nome);
    });
    var h = '<div class="scheda"><div class="intestazione"><h2>Animali</h2><button type="button" class="pulsante" data-azione="animale-nuovo">+ Animale</button></div>';
    if (!animali.length) { return h + ui.vuoto('Nessun animale.') + '</div>'; }
    h += '<ul class="elenco">';
    animali.forEach(function (a) {
      var richiami = AN.richiamiAperti(archivio(), a.id);
      var prossimo = richiami[0];
      h += '<li><a class="riga" href="#/animale/' + esc(a.id) + '"><span class="corpo"><span class="titolo">' + esc(a.nome) + '</span> ' +
        (a.attivo === false ? ui.distintivo('non più con noi') : (prossimo ? badgeRichiamo(prossimo.dataRichiamo, oggi) : '')) +
        '<br><span class="sotto">' + esc([a.specie, a.razza, AN.etaTesto(a.dataNascita, oggi)].filter(Boolean).join(' · ')) +
        (prossimo ? '<br>Prossimo richiamo: ' + esc(prossimo.descrizione || nomeTipo(prossimo.tipo)) + ' il ' + ui.data(prossimo.dataRichiamo) : '') +
        '</span></span><span class="destra tenue">›</span></a></li>';
    });
    return h + '</ul></div>';
  }

  function apriAnimale(id) {
    var a = id ? A.trova(archivio(), 'animali', id) : null;
    var v = a || { nome: '', specie: '', razza: '', dataNascita: '', microchip: '', veterinario: '', assicurazione: '', attivo: true, note: '' };
    ui.apriModale({
      titolo: a ? 'Modifica scheda' : 'Nuovo animale',
      corpo: '<form id="modulo-animale" data-modulo="animale" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
        ui.campo({ nome: 'nome', etichetta: 'Nome', valore: v.nome, autofocus: !a }) +
        '<div class="due-colonne">' + ui.campo({ nome: 'specie', etichetta: 'Specie', valore: v.specie, lista: 'elenco-specie' }) +
        ui.campo({ nome: 'razza', etichetta: 'Razza', valore: v.razza }) + '</div>' + ui.datalist('elenco-specie', ['Cane', 'Gatto', 'Coniglio', 'Uccello', 'Pesce', 'Altro']) +
        '<div class="due-colonne">' + ui.campo({ nome: 'dataNascita', etichetta: 'Data di nascita', tipo: 'data', valore: v.dataNascita }) +
        ui.campo({ nome: 'microchip', etichetta: 'Microchip', valore: v.microchip, attributi: ' inputmode="numeric"' }) + '</div>' +
        ui.campo({ nome: 'veterinario', etichetta: 'Veterinario', tipo: 'area', valore: v.veterinario, segnaposto: 'nome, telefono, indirizzo' }) +
        ui.campo({ nome: 'assicurazione', etichetta: 'Assicurazione', tipo: 'area', valore: v.assicurazione, segnaposto: 'compagnia, numero di polizza, scadenza' }) +
        ui.campo({ nome: 'attivo', etichetta: 'È ancora con noi', tipo: 'spunta', valore: v.attivo !== false }) +
        ui.campo({ nome: 'note', etichetta: 'Note', tipo: 'area', valore: v.note }) +
        '<input type="hidden" name="id" value="' + esc(id || '') + '"></form>',
      piede: (a ? '<button type="button" class="pulsante leggero sinistra" data-azione="animale-elimina" data-id="' + esc(id) + '">Elimina</button>' : '') +
        '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-animale">Salva</button>'
    });
  }

  GC.azioni['animale-nuovo'] = function () { apriAnimale(); };
  GC.azioni['animale-modifica'] = function (d) { apriAnimale(d.id); };

  GC.moduli.animale = function (v, form) {
    var nuovoId = null;
    var ok = stato.applica(function (a) {
      var campi = {
        nome: (v.nome || '').trim(), specie: (v.specie || '').trim(), razza: (v.razza || '').trim(), dataNascita: D.leggiData(v.dataNascita),
        microchip: (v.microchip || '').trim(), veterinario: (v.veterinario || '').trim(), assicurazione: (v.assicurazione || '').trim(),
        attivo: !!v.attivo, note: (v.note || '').trim()
      };
      if (!campi.nome) { throw new Error('Scrivi il nome.'); }
      if (v.id) { return A.aggiorna(a, 'animali', v.id, campi, stato.ora()).archivio; }
      var r = A.inserisci(a, 'animali', campi, stato.ora());
      nuovoId = r.record.id;
      return r.archivio;
    }, { form: form, messaggio: 'Scheda salvata.' });
    if (ok && nuovoId) { GC.app.vai('animale/' + nuovoId); }
  };

  GC.azioni['animale-elimina'] = function (d) {
    ui.conferma('La scheda e gli eventi sanitari verranno eliminati. Le spese restano nel registro, senza collegamento.', {
      titolo: 'Eliminare la scheda?', ok: 'Elimina', pericolo: true
    }).then(function (si) {
      if (!si) { return; }
      ui.chiudiTutte();
      stato.applica(function (a) { return AN.eliminaAnimale(a, d.id, stato.ora()); }, { messaggio: 'Scheda eliminata.' });
      GC.app.vai('animali');
    });
  };

  // --- Eventi sanitari ---

  /*
   * Modulo di un evento. opzioni: { animaleId, id } per modificare,
   * { animaleId, richiamoDi } per registrare il richiamo di un evento precedente.
   */
  function apriEvento(opzioni) {
    var e = opzioni.id ? A.trova(archivio(), 'eventiSanitari', opzioni.id) : null;
    var precedente = opzioni.richiamoDi ? A.trova(archivio(), 'eventiSanitari', opzioni.richiamoDi) : null;
    var v = e || {
      tipo: precedente ? precedente.tipo : 'vaccino', data: stato.oggi(), descrizione: precedente ? precedente.descrizione : '',
      dataRichiamo: '', responsabileId: precedente ? precedente.responsabileId : '', note: '', documento: ''
    };
    var corpo = '<form id="modulo-evento" data-modulo="evento" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
      (precedente ? '<p class="tenue">Richiamo di: ' + esc(precedente.descrizione || nomeTipo(precedente.tipo)) + ' del ' + ui.data(precedente.data) + '</p>' : '') +
      '<div class="due-colonne">' + ui.campo({ nome: 'tipo', etichetta: 'Tipo', tipo: 'select', valore: v.tipo,
        opzioni: S.TIPI_EVENTO.map(function (t) { return { valore: t.valore, testo: t.nome }; }) }) +
      ui.campo({ nome: 'data', etichetta: 'Data', tipo: 'data', valore: v.data }) + '</div>' +
      ui.campo({ nome: 'descrizione', etichetta: 'Descrizione', valore: v.descrizione, segnaposto: 'es. Polivalente, antiparassitario mensile' }) +
      ui.campo({ nome: 'dataRichiamo', etichetta: 'Prossimo richiamo', tipo: 'data', valore: v.dataRichiamo || '', aiuto: 'compare negli impegni' }) +
      ui.campo({ nome: 'responsabileId', etichetta: 'Chi se ne occupa', tipo: 'select', valore: v.responsabileId || '', opzioni: GC.forme.opzioniResponsabili() });
    if (!e) {
      corpo += '<fieldset><legend>Costo (facoltativo)</legend><div class="due-colonne">' +
        ui.campo({ nome: 'costo', etichetta: 'Importo (€)', tipo: 'importo', valore: '' }) +
        ui.campo({ nome: 'contoId', etichetta: 'Conto', tipo: 'select', valore: '', opzioni: GC.forme.opzioniConti() }) + '</div>' +
        ui.campo({ nome: 'controparte', etichetta: 'Pagato a', valore: '', lista: 'elenco-veterinari' }) +
        ui.datalist('elenco-veterinari', M.controparti(archivio().collezioni.movimenti)) +
        ui.campo({ nome: 'detraibile', etichetta: 'Detraibile', tipo: 'spunta', valore: false }) +
        '<p class="tenue">Il costo diventa un movimento del registro collegato all\'animale.</p></fieldset>';
    }
    corpo += ui.campo({ nome: 'documento', etichetta: 'Documento', valore: v.documento, segnaposto: 'nome del file o link' }) +
      ui.campo({ nome: 'note', etichetta: 'Note', tipo: 'area', valore: v.note }) +
      '<input type="hidden" name="id" value="' + esc(opzioni.id || '') + '"><input type="hidden" name="animaleId" value="' + esc(opzioni.animaleId) + '">' +
      '<input type="hidden" name="richiamoDi" value="' + esc(opzioni.richiamoDi || '') + '"></form>';
    ui.apriModale({
      titolo: e ? 'Modifica evento' : (precedente ? 'Registra il richiamo' : 'Nuovo evento sanitario'),
      corpo: corpo,
      piede: (e ? '<button type="button" class="pulsante leggero sinistra" data-azione="evento-elimina" data-id="' + esc(e.id) + '">Elimina</button>' : '') +
        '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-evento">Salva</button>'
    });
  }

  GC.azioni['evento-nuovo'] = function (d) { apriEvento({ animaleId: d.animale }); };
  GC.azioni['evento-modifica'] = function (d) { apriEvento({ animaleId: d.animale, id: d.id }); };
  GC.azioni['richiamo-registra'] = function (d) {
    var e = A.trova(archivio(), 'eventiSanitari', d.id);
    if (e) { apriEvento({ animaleId: e.animaleId, richiamoDi: e.id }); }
  };

  GC.moduli.evento = function (v, form) {
    stato.applica(function (a) {
      var costo = v.costo ? I.leggiImporto(v.costo) : 0;
      if (v.costo && costo == null) { throw new Error('Il costo non è un importo valido.'); }
      return AN.registraEvento(a, {
        id: v.id || null, animaleId: v.animaleId, tipo: v.tipo, data: D.leggiData(v.data), descrizione: (v.descrizione || '').trim(),
        dataRichiamo: v.dataRichiamo ? D.leggiData(v.dataRichiamo) : null, responsabileId: v.responsabileId || null,
        note: (v.note || '').trim(), documento: (v.documento || '').trim(), costoCent: costo, contoId: v.contoId || null,
        controparte: (v.controparte || '').trim(), detraibile: !!v.detraibile, chiudeRichiamoDi: v.richiamoDi || null
      }, stato.ora());
    }, { form: form, messaggio: 'Evento salvato.' });
  };

  GC.azioni['evento-elimina'] = function (d) {
    ui.conferma('Eliminare questo evento sanitario? L\'eventuale spesa resta nel registro.', { titolo: 'Eliminare?', ok: 'Elimina', pericolo: true }).then(function (si) {
      if (!si) { return; }
      ui.chiudiModale();
      stato.applica(function (a) { return A.elimina(a, 'eventiSanitari', d.id, stato.ora()); });
    });
  };

  // --- Scheda ---

  function renderAnimale(id) {
    var a = A.trova(archivio(), 'animali', id);
    if (!a) { return '<div class="scheda">' + ui.vuoto('Scheda non trovata.', '<a class="pulsante" href="#/animali">Torna agli animali</a>') + '</div>'; }
    var oggi = stato.oggi();
    var h = '<p><a href="#/animali">‹ Animali</a></p>';
    h += '<div class="scheda"><div class="intestazione"><h2>' + esc(a.nome) + '</h2>' +
      '<button type="button" class="pulsante piccolo secondario" data-azione="animale-modifica" data-id="' + esc(a.id) + '">Modifica</button></div>' +
      '<dl class="dati"><dt>Specie</dt><dd>' + esc([a.specie, a.razza].filter(Boolean).join(', ') || '—') + '</dd>' +
      (a.dataNascita ? '<dt>Nato il</dt><dd>' + ui.data(a.dataNascita) + ' (' + esc(AN.etaTesto(a.dataNascita, oggi)) + ')</dd>' : '') +
      (a.microchip ? '<dt>Microchip</dt><dd>' + esc(a.microchip) + '</dd>' : '') +
      (a.veterinario ? '<dt>Veterinario</dt><dd>' + esc(a.veterinario) + '</dd>' : '') +
      (a.assicurazione ? '<dt>Assicurazione</dt><dd>' + esc(a.assicurazione) + '</dd>' : '') +
      (a.note ? '<dt>Note</dt><dd>' + esc(a.note) + '</dd>' : '') + '</dl></div>';

    var richiami = AN.richiamiAperti(archivio(), a.id);
    h += '<div class="scheda"><h2>Prossimi richiami</h2>';
    h += richiami.length ? '<ul class="elenco">' + richiami.map(function (e) {
      return '<li class="riga-con-azioni"><div class="riga"><span class="corpo"><span class="titolo">' + esc(e.descrizione || nomeTipo(e.tipo)) + '</span> ' +
        badgeRichiamo(e.dataRichiamo, oggi) + '<br><span class="sotto">' + esc(nomeTipo(e.tipo)) + ' · ultimo il ' + esc(D.formattaData(e.data)) +
        (e.responsabileId ? ' · ' + esc(GC.forme.nomeResponsabile(e.responsabileId)) : '') + '</span></span><span class="destra"><strong>' + ui.data(e.dataRichiamo) +
        '</strong></span></div><span class="azioni-riga"><button type="button" class="pulsante piccolo secondario" data-azione="richiamo-registra" data-id="' + esc(e.id) + '">Fatto</button></span></li>';
    }).join('') + '</ul>' : '<p class="tenue">Nessun richiamo in programma.</p>';
    h += '</div>';

    var eventi = AN.eventi(archivio(), a.id);
    h += '<div class="scheda"><div class="intestazione"><h2>Eventi sanitari</h2><button type="button" class="pulsante piccolo" data-azione="evento-nuovo" data-animale="' + esc(a.id) + '">+ Evento</button></div>';
    h += eventi.length ? '<ul class="elenco">' + eventi.map(function (e) {
      return '<li><button type="button" class="riga" data-azione="evento-modifica" data-animale="' + esc(a.id) + '" data-id="' + esc(e.id) + '"><span class="corpo"><span class="titolo">' +
        esc(e.descrizione || nomeTipo(e.tipo)) + '</span><br><span class="sotto">' + esc([nomeTipo(e.tipo), e.dataRichiamo ? 'richiamo ' + D.formattaData(e.dataRichiamo) : '', e.note].filter(Boolean).join(' · ')) +
        '</span></span><span class="destra">' + ui.data(e.data) + '</span></button></li>';
    }).join('') + '</ul>' : '<p class="tenue">Nessun evento registrato.</p>';
    h += '</div>';

    var costi = AN.costiPerAnno(archivio(), a.id);
    var anni = Object.keys(costi).sort().reverse();
    var cat = M.coppiaPerRuolo(archivio().collezioni.categorie, 'animali');
    var movimenti = M.ordina(A.collegati(archivio(), 'movimenti', 'animale', a.id), true);
    h += '<div class="scheda"><div class="intestazione"><h2>Costi</h2><button type="button" class="pulsante piccolo" data-azione="movimento-nuovo" data-categoria-id="' +
      esc(cat.categoriaId || '') + '" data-collegamento-tipo="animale" data-collegamento-id="' + esc(a.id) + '">+ Spesa</button></div>';
    if (anni.length) {
      h += '<div class="numeri">' + anni.slice(0, 4).map(function (anno) {
        return '<div class="numero"><div class="etichetta">' + esc(anno) + '</div><div class="valore">' + ui.euro(costi[anno]) + '</div></div>';
      }).join('') + '</div>';
    }
    h += movimenti.length ? '<ul class="elenco">' + movimenti.slice(0, 20).map(function (m) { return GC.forme.rigaMovimento(m, { senzaCollegamento: true }); }).join('') + '</ul>' : '<p class="tenue">Nessuna spesa collegata.</p>';
    h += '</div>';
    if (GC.forme.impegniCollegati) { h += GC.forme.impegniCollegati({ tipo: 'animale', id: a.id }); }
    return h;
  }

  GC.viste.animali = { titolo: 'Animali', render: renderElenco };
  GC.viste.animale = { titolo: 'Animali', render: function (rotta) { return renderAnimale(rotta.parti[0]); } };

  GC.forme.evento = apriEvento;
})(typeof window !== 'undefined' ? window : globalThis);
