/*
 * Gestionale casa — Impegni e scadenze: prossimi giorni, scaduti, calendario del mese, fatti;
 * esportazione .ics delle scadenze scelte.
 * #/impegni/prossimi | scaduti | calendario | fatti
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var ui = GC.ui;
  var esc = ui.esc;
  var D = GC.date;
  var S = GC.schema;
  var A = GC.archivio;
  var IM = GC.impegni;
  var ICS = GC.ics;
  var stato = GC.stato;

  var filtroTipo = '';
  var filtroResponsabile = '';
  var selezione = null;   // null = selezione spenta, altrimenti { chiave: true }
  var meseCalendario = null;
  var giornoScelto = null;

  function archivio() { return stato.archivio; }

  var CLASSE_TIPO = { impegno: 'ok', pagamento: 'previsto', manutenzione: 'attenzione', richiamo: 'attenzione' };

  function schede(viste) {
    return [
      { id: 'prossimi', testo: 'Prossimi ' + archivio().impostazioni.soglie.finestraGiorni + ' giorni' },
      { id: 'scaduti', testo: 'Scaduti' + (viste.scaduti.length ? ' (' + viste.scaduti.length + ')' : '') },
      { id: 'calendario', testo: 'Calendario' },
      { id: 'tutti', testo: 'Tutti da fare' },
      { id: 'fatti', testo: 'Fatti' }
    ];
  }

  function voci() {
    var oggi = stato.oggi();
    return IM.elenco(archivio(), oggi).filter(function (v) {
      if (filtroTipo && v.tipo !== filtroTipo) { return false; }
      if (filtroResponsabile && v.responsabileId !== filtroResponsabile) { return false; }
      return true;
    });
  }

  // Riga di una voce (usata anche nella Home).
  function rigaImpegno(v, oggi, conSelezione) {
    var scaduto = v.stato === 'da_fare' && v.data < oggi;
    var sotto = [D.formattaData(v.data) + (v.ora ? ' alle ' + v.ora : '')];
    var resp = GC.forme.nomeResponsabile(v.responsabileId);
    if (resp) { sotto.push(resp); }
    if (v.collegamento && v.tipo === 'impegno') { sotto.push(A.nomeCollegamento(archivio(), v.collegamento)); }
    if (v.ricorrente && v.tipo === 'impegno') { sotto.push(S.nomeFrequenza(v.ogniMesi).toLowerCase()); }
    if (v.stato === 'fatto' && v.fattoIl) { sotto.push('fatto il ' + D.formattaData(v.fattoIl)); }
    var spunta = conSelezione ? '<input type="checkbox" class="spunta-ics" data-cambia="impegno-seleziona" data-chiave="' + esc(v.chiave) + '"' +
      (selezione && selezione[v.chiave] ? ' checked' : '') + ' aria-label="Seleziona per il calendario" style="width:24px;height:24px;flex-shrink:0;accent-color:var(--primario)">' : '';
    var azione = '';
    if (v.stato === 'da_fare') {
      azione = '<button type="button" class="pulsante piccolo secondario" data-azione="impegno-fatto" data-tipo="' + v.tipo + '" data-id="' + esc(v.origine.id) + '">' +
        (v.tipo === 'pagamento' ? 'Conferma' : 'Fatto') + '</button>';
    } else if (v.tipo === 'impegno') {
      azione = '<button type="button" class="pulsante leggero piccolo" data-azione="impegno-riapri" data-id="' + esc(v.origine.id) + '">Riapri</button>';
    }
    return '<li class="riga-con-azioni">' + spunta + '<button type="button" class="riga" data-azione="impegno-apri" data-tipo="' + v.tipo + '" data-id="' + esc(v.origine.id) +
      '" data-collegamento="' + esc(v.collegamento ? v.collegamento.id : '') + '"><span class="corpo"><span class="titolo">' + esc(v.titolo) + '</span> ' +
      ui.distintivo(IM.TIPI[v.tipo], CLASSE_TIPO[v.tipo]) + (scaduto ? ' ' + ui.distintivo('scaduto', 'pericolo') : '') +
      '<br><span class="sotto">' + esc(sotto.join(' · ')) + '</span></span></button><span class="azioni-riga">' + azione + '</span></li>';
  }

  function filtri() {
    var tipi = [{ valore: '', testo: 'Tutti' }].concat(Object.keys(IM.TIPI).map(function (k) { return { valore: k, testo: IM.TIPI[k] }; }));
    return '<div class="schede-nav">' + tipi.map(function (t) {
      return '<button type="button" class="chip' + (t.valore === filtroTipo ? ' attivo' : '') + '" data-azione="impegni-tipo" data-tipo="' + t.valore + '">' + esc(t.testo) + '</button>';
    }).join('') + '</div>' +
      '<form class="filtri" data-modulo="impegni-filtro">' + ui.campo({ nome: 'responsabile', etichetta: 'Chi se ne occupa', tipo: 'select', valore: filtroResponsabile,
        opzioni: [{ valore: '', testo: 'Tutti' }].concat(GC.forme.opzioniResponsabili().slice(1)), cambia: 'impegni-responsabile' }) + '</form>';
  }

  function barraSelezione(elenco) {
    if (!selezione) {
      return '<div class="pulsanti"><button type="button" class="pulsante secondario piccolo" data-azione="ics-avvia">Esporta nel calendario (.ics)…</button></div>';
    }
    var n = Object.keys(selezione).filter(function (k) { return selezione[k]; }).length;
    return '<div class="nota-box">Scegli le scadenze da mettere nel calendario del telefono, poi esporta il file e aprilo dal telefono.' +
      '<div class="pulsanti"><button type="button" class="pulsante piccolo secondario" data-azione="ics-tutti" data-chiavi="' + esc(elenco.map(function (v) { return v.chiave; }).join(',')) +
      '">Seleziona tutte</button><button type="button" class="pulsante piccolo" data-azione="ics-esporta"' + (n ? '' : ' disabled') + '>Esporta ' + n + ' in .ics</button>' +
      '<button type="button" class="pulsante piccolo leggero" data-azione="ics-annulla">Annulla</button></div></div>';
  }

  function elencoHtml(lista, oggi, vuotoTesto, conSelezione) {
    if (!lista.length) { return ui.vuoto(vuotoTesto); }
    return '<ul class="elenco">' + lista.map(function (v) { return rigaImpegno(v, oggi, conSelezione && !!selezione); }).join('') + '</ul>';
  }

  function renderCalendario(tutte, oggi) {
    if (!meseCalendario) { meseCalendario = D.mese(oggi); }
    var daFare = tutte.filter(function (v) { return v.stato === 'da_fare' || v.tipo === 'impegno'; });
    var settimane = IM.calendario(meseCalendario, daFare);
    var h = '<div class="selettore-mese"><button type="button" class="pulsante secondario" data-azione="calendario-mese" data-delta="-1" aria-label="Mese precedente">‹</button>' +
      '<strong>' + esc(D.formattaMese(meseCalendario)) + '</strong>' +
      '<button type="button" class="pulsante secondario" data-azione="calendario-mese" data-delta="1" aria-label="Mese successivo">›</button></div>';
    h += '<div class="calendario">' + [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<div class="giorno-nome">' + D.nomeGiornoBreve(i) + '</div>'; }).join('');
    settimane.forEach(function (s) {
      s.forEach(function (g) {
        var aperte = g.voci.filter(function (v) { return v.stato === 'da_fare'; });
        var scadute = aperte.some(function (v) { return v.data < oggi; });
        var classi = [g.delMese ? '' : 'fuori', g.data === oggi ? 'oggi' : '', g.data === giornoScelto ? 'scelto' : ''].join(' ');
        h += '<button type="button" class="' + classi + '" data-azione="calendario-giorno" data-data="' + g.data + '" aria-label="' + esc(D.formattaData(g.data)) +
          (aperte.length ? ', ' + aperte.length + ' scadenze' : '') + '"><span>' + Number(g.data.slice(8)) + '</span>' +
          '<span class="punti' + (scadute ? ' scaduto' : '') + '">' + (aperte.length ? (aperte.length > 3 ? '•••+' : new Array(aperte.length + 1).join('•')) : '&nbsp;') + '</span></button>';
      });
    });
    h += '</div>';
    var giorno = giornoScelto && giornoScelto.slice(0, 7) === meseCalendario ? giornoScelto : null;
    var delGiorno = giorno ? daFare.filter(function (v) { return v.data === giorno; }) :
      daFare.filter(function (v) { return v.data.slice(0, 7) === meseCalendario && v.stato === 'da_fare'; });
    h += '<h3 style="margin:14px 0 4px">' + (giorno ? esc(D.formattaData(giorno)) : 'Da fare nel mese') + '</h3>';
    h += elencoHtml(delGiorno, oggi, giorno ? 'Niente in questo giorno.' : 'Niente da fare in questo mese.', false);
    return h;
  }

  function render(rotta) {
    var oggi = stato.oggi();
    var tutte = voci();
    var giorni = archivio().impostazioni.soglie.finestraGiorni;
    var viste = IM.viste(tutte, oggi, giorni);
    var scheda = rotta.parti[0] || 'prossimi';
    var h = ui.schedeNav('impegni', schede(viste), scheda);
    h += '<div class="scheda"><div class="intestazione"><h2>Impegni e scadenze</h2><button type="button" class="pulsante" data-azione="impegno-nuovo">+ Impegno</button></div>';
    h += filtri();
    if (scheda === 'calendario') {
      h += renderCalendario(tutte, oggi);
    } else if (scheda === 'scaduti') {
      h += barraSelezione(viste.scaduti) + elencoHtml(viste.scaduti, oggi, 'Nessun impegno scaduto.', true);
    } else if (scheda === 'tutti') {
      h += barraSelezione(viste.daFare) + elencoHtml(viste.daFare, oggi, 'Niente da fare.', true);
    } else if (scheda === 'fatti') {
      h += elencoHtml(viste.fatti.slice(0, 100), oggi, 'Nessun impegno segnato come fatto.', false) +
        '<p class="tenue">I pagamenti confermati sono nel registro dei movimenti; manutenzioni e richiami fatti sono nelle rispettive schede.</p>';
    } else {
      h += barraSelezione(viste.prossimi) + elencoHtml(viste.prossimi, oggi, 'Niente in programma nei prossimi ' + giorni + ' giorni.', true);
    }
    h += '<p class="tenue">Qui trovi impegni, pagamenti previsti, manutenzioni e richiami. La pagina chiusa non può avvisarti: esporta le scadenze nel calendario del telefono.</p>';
    return h + '</div>';
  }

  GC.azioni['impegni-tipo'] = function (d) { filtroTipo = d.tipo; GC.app.aggiorna(); };
  GC.cambi['impegni-responsabile'] = function (el) { filtroResponsabile = el.value; GC.app.aggiorna(); };
  GC.moduli['impegni-filtro'] = function () {};
  GC.azioni['calendario-mese'] = function (d) { meseCalendario = D.spostaMese(meseCalendario, Number(d.delta)); giornoScelto = null; GC.app.aggiorna(); };
  GC.azioni['calendario-giorno'] = function (d) {
    giornoScelto = giornoScelto === d.data ? null : d.data;
    if (d.data.slice(0, 7) !== meseCalendario) { meseCalendario = d.data.slice(0, 7); }
    GC.app.aggiorna();
  };

  // --- Apri e "fatto" ---

  GC.azioni['impegno-apri'] = function (d) {
    if (d.tipo === 'impegno') { apriImpegno({ id: d.id }); return; }
    if (d.tipo === 'pagamento') { GC.forme.movimento({ id: d.id }); return; }
    if (d.tipo === 'manutenzione') { GC.app.vai('manutenzione/' + d.id); return; }
    if (d.tipo === 'richiamo' && d.collegamento) { GC.app.vai('animale/' + d.collegamento); }
  };

  GC.azioni['impegno-fatto'] = function (d) {
    if (d.tipo === 'pagamento') { GC.forme.conferma(d.id); return; }
    if (d.tipo === 'manutenzione') { GC.forme.intervento(d.id); return; }
    if (d.tipo === 'richiamo') { GC.azioni['richiamo-registra']({ id: d.id }); return; }
    var imp = A.trova(archivio(), 'impegni', d.id);
    stato.applica(function (a) { return IM.segnaFatto(a, d.id, stato.oggi(), stato.ora()); }, {
      messaggio: imp && imp.ogniMesi ? 'Fatto. Ho creato il prossimo: ' + D.formattaData(IM.prossimaData(imp)) + '.' : 'Segnato come fatto.'
    });
  };

  GC.azioni['impegno-riapri'] = function (d) {
    stato.applica(function (a) { return IM.riapri(a, d.id, stato.ora()); });
  };

  // --- Modulo impegno ---

  var TIPI_COLLEGABILI = [{ valore: '', testo: 'Nessuno' }, { valore: 'lavoro', testo: 'Lavoro' }, { valore: 'manutenzione', testo: 'Manutenzione' },
    { valore: 'persona', testo: 'Persona del personale' }, { valore: 'animale', testo: 'Animale' }];

  function corpoImpegno(v) {
    return '<div class="errore-modulo"></div>' +
      ui.campo({ nome: 'titolo', etichetta: 'Cosa', valore: v.titolo, segnaposto: 'es. Appuntamento, rinnovo documento', autofocus: !v.id }) +
      '<div class="due-colonne">' + ui.campo({ nome: 'data', etichetta: 'Data', tipo: 'data', valore: v.data }) +
      ui.campo({ nome: 'ora', etichetta: 'Ora (facoltativa)', tipo: 'ora', valore: v.ora }) + '</div>' +
      '<div class="due-colonne">' + ui.campo({ nome: 'ogniMesi', etichetta: 'Si ripete', tipo: 'select', valore: v.ogniMesi,
        opzioni: [{ valore: '', testo: 'No' }].concat(S.FREQUENZE.map(function (f) { return { valore: String(f.mesi), testo: f.nome }; })) }) +
      ui.campo({ nome: 'responsabileId', etichetta: 'Chi se ne occupa', tipo: 'select', valore: v.responsabileId, opzioni: GC.forme.opzioniResponsabili() }) + '</div>' +
      '<div class="due-colonne">' + ui.campo({ nome: 'collegamentoTipo', etichetta: 'Collegato a', tipo: 'select', valore: v.collegamentoTipo, opzioni: TIPI_COLLEGABILI, cambia: 'impegno-ricarica' }) +
      ui.campo({ nome: 'collegamentoId', etichetta: 'Elemento', tipo: 'select', valore: v.collegamentoId, opzioni: GC.forme.opzioniElementi(v.collegamentoTipo) }) + '</div>' +
      ui.campo({ nome: 'note', etichetta: 'Note', tipo: 'area', valore: v.note }) +
      '<input type="hidden" name="id" value="' + esc(v.id || '') + '">';
  }

  function apriImpegno(valori) {
    var imp = valori && valori.id ? A.trova(archivio(), 'impegni', valori.id) : null;
    var v = imp ? {
      id: imp.id, titolo: imp.titolo, data: imp.data, ora: imp.ora || '', ogniMesi: imp.ogniMesi ? String(imp.ogniMesi) : '',
      responsabileId: imp.responsabileId || '', collegamentoTipo: imp.collegamento ? imp.collegamento.tipo : '',
      collegamentoId: imp.collegamento ? imp.collegamento.id : '', note: imp.note || ''
    } : Object.assign({ titolo: '', data: stato.oggi(), ora: '', ogniMesi: '', responsabileId: '', collegamentoTipo: '', collegamentoId: '', note: '' }, valori || {});
    ui.apriModale({
      titolo: imp ? 'Modifica impegno' : 'Nuovo impegno',
      corpo: '<form id="modulo-impegno" data-modulo="impegno" autocomplete="off" novalidate>' + corpoImpegno(v) + '</form>',
      piede: (imp ? '<button type="button" class="pulsante leggero sinistra" data-azione="impegno-elimina" data-id="' + esc(imp.id) + '">Elimina</button>' : '') +
        '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-impegno">Salva</button>'
    });
  }

  GC.cambi['impegno-ricarica'] = function (el) {
    var v = ui.leggiModulo(el.form);
    v.collegamentoId = '';
    el.form.innerHTML = corpoImpegno(v);
  };

  GC.azioni['impegno-nuovo'] = function (d) {
    apriImpegno(d && d.collegamentoTipo ? { collegamentoTipo: d.collegamentoTipo, collegamentoId: d.collegamentoId } : {});
  };

  GC.moduli.impegno = function (v, form) {
    stato.applica(function (a) {
      var campi = {
        titolo: (v.titolo || '').trim(), data: D.leggiData(v.data), ora: v.ora ? D.leggiOra(v.ora) : null,
        ogniMesi: v.ogniMesi ? Number(v.ogniMesi) : null, responsabileId: v.responsabileId || null,
        collegamento: v.collegamentoTipo && v.collegamentoId ? { tipo: v.collegamentoTipo, id: v.collegamentoId } : null,
        note: (v.note || '').trim()
      };
      if (v.ora && !campi.ora) { throw new Error('L\'ora non è valida (es. 18:30).'); }
      var errori = IM.validaImpegno(campi);
      if (errori.length) { throw new Error(errori.join(' ')); }
      if (v.id) {
        var prima = A.trova(a, 'impegni', v.id);
        campi.ricorrenzaInizio = campi.ogniMesi ? (prima.ogniMesi === campi.ogniMesi && prima.ricorrenzaInizio ? prima.ricorrenzaInizio : campi.data) : null;
        return A.aggiorna(a, 'impegni', v.id, campi, stato.ora()).archivio;
      }
      campi.ricorrenzaInizio = campi.ogniMesi ? campi.data : null;
      campi.stato = 'da_fare';
      campi.fattoIl = null;
      return A.inserisci(a, 'impegni', campi, stato.ora()).archivio;
    }, { form: form, messaggio: 'Impegno salvato.' });
  };

  GC.azioni['impegno-elimina'] = function (d) {
    ui.conferma('Eliminare questo impegno?', { titolo: 'Eliminare?', ok: 'Elimina', pericolo: true }).then(function (si) {
      if (!si) { return; }
      ui.chiudiModale();
      stato.applica(function (a) { return A.elimina(a, 'impegni', d.id, stato.ora()); }, { messaggio: 'Impegno eliminato.' });
    });
  };

  // Scheda "Impegni" mostrata nelle schede di lavori, persone e animali.
  function impegniCollegati(collegamento) {
    var lista = archivio().collezioni.impegni.filter(function (i) {
      return i.collegamento && i.collegamento.tipo === collegamento.tipo && i.collegamento.id === collegamento.id && i.stato !== 'fatto';
    }).sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    var oggi = stato.oggi();
    var voci = IM.elenco(archivio(), oggi).filter(function (v) { return v.tipo === 'impegno' && lista.some(function (i) { return i.id === v.origine.id; }); });
    return '<div class="scheda"><div class="intestazione"><h2>Impegni</h2><button type="button" class="pulsante piccolo" data-azione="impegno-nuovo" data-collegamento-tipo="' +
      esc(collegamento.tipo) + '" data-collegamento-id="' + esc(collegamento.id) + '">+ Impegno</button></div>' +
      (voci.length ? '<ul class="elenco">' + voci.map(function (v) { return rigaImpegno(v, oggi, false); }).join('') + '</ul>' : '<p class="tenue">Nessun impegno collegato.</p>') + '</div>';
  }

  // --- Esportazione .ics ---

  GC.azioni['ics-avvia'] = function () { selezione = {}; GC.app.aggiorna(); };
  GC.azioni['ics-annulla'] = function () { selezione = null; GC.app.aggiorna(); };
  GC.azioni['ics-tutti'] = function (d) {
    selezione = selezione || {};
    (d.chiavi || '').split(',').filter(Boolean).forEach(function (k) { selezione[k] = true; });
    GC.app.aggiorna();
  };
  GC.cambi['impegno-seleziona'] = function (el) {
    if (!selezione) { selezione = {}; }
    selezione[el.getAttribute('data-chiave')] = el.checked;
    GC.app.aggiorna();
  };

  GC.azioni['ics-esporta'] = function () {
    var chiavi = Object.keys(selezione || {}).filter(function (k) { return selezione[k]; });
    if (!chiavi.length) { return; }
    ui.apriModale({
      titolo: 'Esporta nel calendario',
      corpo: '<form id="modulo-ics" data-modulo="ics" autocomplete="off"><p>' + chiavi.length + ' scadenze selezionate.</p>' +
        ui.campo({ nome: 'promemoria', etichetta: 'Promemoria del calendario', tipo: 'select', valore: 'vigilia', opzioni: [
          { valore: '', testo: 'Nessuno' },
          { valore: 'giorno', testo: 'Il giorno stesso (alle 9, o un\'ora prima)' },
          { valore: 'vigilia', testo: 'Il giorno prima (alle 9, o 24 ore prima)' }] }) +
        '<p class="tenue">Apri il file scaricato dal telefono (o importalo nel calendario di Google, Apple o Outlook). Esportando di nuovo le stesse scadenze, il calendario le aggiorna invece di duplicarle.</p></form>',
      piede: '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-ics">Scarica .ics</button>'
    });
  };

  GC.moduli.ics = function (v) {
    var chiavi = Object.keys(selezione || {}).filter(function (k) { return selezione[k]; });
    var tutte = IM.elenco(archivio(), stato.oggi());
    var scelte = tutte.filter(function (x) { return chiavi.indexOf(x.chiave) >= 0; });
    var testo = ICS.genera(scelte.map(ICS.daVoce), { ora: stato.ora(), promemoria: v.promemoria || null });
    ui.scarica(GC.app.nomeFile('scadenze', 'ics'), testo, 'text/calendar;charset=utf-8');
    ui.chiudiModale();
    selezione = null;
    GC.app.aggiorna();
    ui.messaggio(scelte.length + ' scadenze esportate.');
  };

  GC.viste.impegni = { titolo: 'Impegni', render: render };

  GC.forme.rigaImpegno = rigaImpegno;
  GC.forme.impegno = apriImpegno;
  GC.forme.impegniCollegati = impegniCollegati;
})(typeof window !== 'undefined' ? window : globalThis);
