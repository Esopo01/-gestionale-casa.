/*
 * Gestionale casa — Personale: schede, storico paghe, registro ore, dovuto e pagato per mese.
 * #/personale, #/persona/<id>?mese=AAAA-MM
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
  var P = GC.personale;
  var stato = GC.stato;

  var RAPPORTI = ['Lavoro domestico a ore', 'Lavoro domestico mensile', 'Prestazione occasionale', 'Libero professionista / partita IVA', 'Altro'];

  function archivio() { return stato.archivio; }

  function testoPaga(p) {
    if (!p) { return 'paga non indicata'; }
    return I.formattaImporto(p.importoCent) + (p.tipo === 'oraria' ? '/ora' : '/mese');
  }

  // --- Elenco ---

  function renderElenco() {
    var oggi = stato.oggi();
    var tolleranza = archivio().impostazioni.soglie.tolleranzaPersonaleCent;
    var persone = archivio().collezioni.persone.slice().sort(function (a, b) {
      return ((a.attiva === false) - (b.attiva === false)) || B.confrontaTesti(a.nome, b.nome);
    });
    var h = '<div class="scheda"><div class="intestazione"><h2>Personale</h2>' +
      '<button type="button" class="pulsante" data-azione="persona-nuova">+ Persona</button></div>' +
      '<p class="tenue">Il programma registra importi e scadenze; contributi e importi di legge li inserisci tu, perché cambiano ogni anno.</p>';
    if (!persone.length) { return h + ui.vuoto('Nessuna persona. Aggiungi chi lavora in casa (collaboratori, giardiniere, babysitter…).') + '</div>'; }
    h += '<ul class="elenco">';
    persone.forEach(function (p) {
      var diff = P.differenze(archivio(), p, oggi, tolleranza).length;
      h += '<li><a class="riga" href="#/persona/' + esc(p.id) + '"><span class="corpo"><span class="titolo">' + esc(p.nome) + '</span> ' +
        (p.attiva === false ? ui.distintivo('non più attiva') : '') + (diff ? ' ' + ui.distintivo(diff + (diff === 1 ? ' mese da verificare' : ' mesi da verificare'), 'pericolo') : '') +
        '<br><span class="sotto">' + esc([p.ruolo, p.tipoRapporto, testoPaga(P.pagaAttuale(p, oggi))].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="destra tenue">›</span></a></li>';
    });
    return h + '</ul></div>';
  }

  // --- Modulo persona ---

  function apriPersona(id) {
    var p = id ? A.trova(archivio(), 'persone', id) : null;
    var v = p || { nome: '', ruolo: '', telefono: '', email: '', tipoRapporto: '', giorniOrario: '', dataInizio: stato.oggi(), dataFine: '', attiva: true, note: '' };
    var corpo = '<form id="modulo-persona" data-modulo="persona" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
      ui.campo({ nome: 'nome', etichetta: 'Nome', valore: v.nome, autofocus: !p }) +
      ui.campo({ nome: 'ruolo', etichetta: 'Ruolo', valore: v.ruolo, segnaposto: 'es. collaboratrice domestica, giardiniere' }) +
      '<div class="due-colonne">' + ui.campo({ nome: 'telefono', etichetta: 'Telefono', valore: v.telefono, attributi: ' inputmode="tel"' }) +
      ui.campo({ nome: 'email', etichetta: 'Email', valore: v.email, attributi: ' inputmode="email"' }) + '</div>' +
      ui.campo({ nome: 'tipoRapporto', etichetta: 'Tipo di rapporto', valore: v.tipoRapporto, lista: 'elenco-rapporti' }) + ui.datalist('elenco-rapporti', RAPPORTI) +
      ui.campo({ nome: 'giorniOrario', etichetta: 'Giorni e orario', valore: v.giorniOrario, segnaposto: 'es. lunedì e giovedì, 9–13' }) +
      '<div class="due-colonne">' + ui.campo({ nome: 'dataInizio', etichetta: 'Inizio rapporto', tipo: 'data', valore: v.dataInizio }) +
      ui.campo({ nome: 'dataFine', etichetta: 'Fine rapporto', tipo: 'data', valore: v.dataFine }) + '</div>';
    if (!p) {
      corpo += '<fieldset><legend>Paga</legend>' + ui.segmentato('tipoPaga', [{ valore: 'oraria', testo: 'A ore' }, { valore: 'mensile', testo: 'Mensile' }], 'oraria') +
        ui.campo({ nome: 'importoPaga', etichetta: 'Importo (€ all\'ora o al mese)', tipo: 'importo', valore: '' }) +
        '<p class="tenue">Puoi aggiungere le variazioni di paga dalla scheda della persona.</p></fieldset>';
    }
    corpo += ui.campo({ nome: 'attiva', etichetta: 'Lavora ancora da noi', tipo: 'spunta', valore: v.attiva !== false }) +
      ui.campo({ nome: 'note', etichetta: 'Note', tipo: 'area', valore: v.note }) +
      '<input type="hidden" name="id" value="' + esc(id || '') + '"></form>';
    ui.apriModale({
      titolo: p ? 'Modifica scheda' : 'Nuova persona',
      corpo: corpo,
      piede: (p ? '<button type="button" class="pulsante leggero sinistra" data-azione="persona-elimina" data-id="' + esc(id) + '">Elimina</button>' : '') +
        '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-persona">Salva</button>'
    });
  }

  GC.azioni['persona-nuova'] = function () { apriPersona(); };
  GC.azioni['persona-modifica'] = function (d) { apriPersona(d.id); };

  GC.moduli.persona = function (v, form) {
    var nuovoId = null;
    var ok = stato.applica(function (a) {
      var campi = {
        nome: (v.nome || '').trim(), ruolo: (v.ruolo || '').trim(), telefono: (v.telefono || '').trim(), email: (v.email || '').trim(),
        tipoRapporto: (v.tipoRapporto || '').trim(), giorniOrario: (v.giorniOrario || '').trim(),
        dataInizio: D.leggiData(v.dataInizio), dataFine: D.leggiData(v.dataFine), attiva: !!v.attiva, note: (v.note || '').trim()
      };
      if (v.id) {
        var esistente = A.trova(a, 'persone', v.id);
        campi.paghe = esistente.paghe || [];
      } else {
        campi.paghe = [];
        if (v.importoPaga) {
          var importo = I.leggiImporto(v.importoPaga);
          if (!(importo > 0)) { throw new Error('La paga non è un importo valido.'); }
          campi.paghe.push({ dal: campi.dataInizio || stato.oggi(), tipo: v.tipoPaga === 'mensile' ? 'mensile' : 'oraria', importoCent: importo });
        }
      }
      var errori = P.validaPersona(campi);
      if (errori.length) { throw new Error(errori.join(' ')); }
      if (v.id) { return A.aggiorna(a, 'persone', v.id, campi, stato.ora()).archivio; }
      var r = A.inserisci(a, 'persone', campi, stato.ora());
      nuovoId = r.record.id;
      return r.archivio;
    }, { form: form, messaggio: 'Scheda salvata.' });
    if (ok && nuovoId) { GC.app.vai('persona/' + nuovoId); }
  };

  GC.azioni['persona-elimina'] = function (d) {
    ui.conferma('La scheda, le ore e le correzioni verranno eliminate. I pagamenti restano nel registro, senza collegamento.', {
      titolo: 'Eliminare la scheda?', ok: 'Elimina', pericolo: true
    }).then(function (si) {
      if (!si) { return; }
      ui.chiudiTutte();
      stato.applica(function (a) { return P.eliminaPersona(a, d.id, stato.ora()); }, { messaggio: 'Scheda eliminata.' });
      GC.app.vai('personale');
    });
  };

  // --- Paghe ---

  GC.azioni['paga-nuova'] = function (d) {
    ui.apriModale({
      titolo: 'Nuova paga',
      corpo: '<form id="modulo-paga" data-modulo="paga" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
        ui.segmentato('tipo', [{ valore: 'oraria', testo: 'A ore' }, { valore: 'mensile', testo: 'Mensile' }], 'oraria') +
        '<div class="due-colonne">' + ui.campo({ nome: 'importo', etichetta: 'Importo (€)', tipo: 'importo', valore: '', autofocus: true }) +
        ui.campo({ nome: 'dal', etichetta: 'Valida dal', tipo: 'data', valore: stato.oggi() }) + '</div>' +
        '<p class="tenue">I mesi precedenti continuano a usare la paga di allora.</p>' +
        '<input type="hidden" name="id" value="' + esc(d.id) + '"></form>',
      piede: '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-paga">Salva</button>'
    });
  };

  GC.moduli.paga = function (v, form) {
    stato.applica(function (a) {
      var p = A.trova(a, 'persone', v.id);
      var importo = I.leggiImporto(v.importo);
      if (!(importo > 0)) { throw new Error('Scrivi l\'importo della paga.'); }
      var dal = D.leggiData(v.dal);
      if (!dal) { throw new Error('Inserisci da quando vale.'); }
      var paghe = (p.paghe || []).filter(function (x) { return x.dal !== dal; }).concat([{ dal: dal, tipo: v.tipo === 'mensile' ? 'mensile' : 'oraria', importoCent: importo }])
        .sort(function (x, y) { return x.dal < y.dal ? -1 : 1; });
      return A.aggiorna(a, 'persone', v.id, { paghe: paghe }, stato.ora()).archivio;
    }, { form: form, messaggio: 'Paga salvata.' });
  };

  GC.azioni['paga-elimina'] = function (d) {
    ui.conferma('Eliminare questa paga dallo storico?', { titolo: 'Eliminare?', ok: 'Elimina', pericolo: true }).then(function (si) {
      if (!si) { return; }
      stato.applica(function (a) {
        var p = A.trova(a, 'persone', d.id);
        return A.aggiorna(a, 'persone', d.id, { paghe: (p.paghe || []).filter(function (x) { return x.dal !== d.dal; }) }, stato.ora()).archivio;
      });
    });
  };

  // --- Ore ---

  GC.azioni['ore-nuove'] = function (d) {
    var oggi = stato.oggi();
    var data = d.mese && D.mese(oggi) !== d.mese ? D.ultimoGiorno(d.mese) : oggi;
    ui.apriModale({
      titolo: 'Ore lavorate',
      corpo: '<form id="modulo-ore" data-modulo="ore" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
        '<div class="due-colonne">' + ui.campo({ nome: 'data', etichetta: 'Giorno', tipo: 'data', valore: data }) +
        ui.campo({ nome: 'ore', etichetta: 'Ore', tipo: 'decimale', valore: '', segnaposto: 'es. 4 o 3:30', autofocus: true }) + '</div>' +
        ui.campo({ nome: 'note', etichetta: 'Note', valore: '' }) +
        '<input type="hidden" name="personaId" value="' + esc(d.id) + '"></form>',
      piede: '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-ore">Salva</button>'
    });
  };

  GC.moduli.ore = function (v, form) {
    stato.applica(function (a) {
      var minuti = I.leggiMinuti(v.ore);
      if (!(minuti > 0)) { throw new Error('Scrivi le ore, ad esempio 4 oppure 3:30.'); }
      var data = D.leggiData(v.data);
      if (!data) { throw new Error('Inserisci il giorno.'); }
      return A.inserisci(a, 'ore', { personaId: v.personaId, data: data, minuti: minuti, note: (v.note || '').trim() }, stato.ora()).archivio;
    }, { form: form, messaggio: 'Ore registrate.' });
  };

  GC.azioni['ore-elimina'] = function (d) {
    ui.conferma('Eliminare queste ore dal registro?', { titolo: 'Eliminare?', ok: 'Elimina', pericolo: true }).then(function (si) {
      if (si) { stato.applica(function (a) { return A.elimina(a, 'ore', d.id, stato.ora()); }); }
    });
  };

  // --- Correzione del dovuto di un mese ---

  GC.azioni['rettifica-modifica'] = function (d) {
    var r = P.rettifica(archivio(), d.id, d.mese);
    ui.apriModale({
      titolo: 'Dovuto di ' + D.formattaMese(d.mese),
      corpo: '<form id="modulo-rettifica" data-modulo="rettifica" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
        '<p class="tenue">Usalo quando il dovuto del mese non è quello calcolato (inizio a metà mese, assenze non pagate, rimborsi…).</p>' +
        ui.campo({ nome: 'importo', etichetta: 'Dovuto del mese (€)', tipo: 'importo', valore: r ? I.importoPerCampo(r.dovutoCent) : '', autofocus: true }) +
        ui.campo({ nome: 'note', etichetta: 'Motivo', valore: r ? r.note : '' }) +
        '<input type="hidden" name="personaId" value="' + esc(d.id) + '"><input type="hidden" name="mese" value="' + esc(d.mese) + '"></form>',
      piede: (r ? '<button type="button" class="pulsante leggero sinistra" data-azione="rettifica-elimina" data-id="' + esc(r.id) + '">Torna al calcolo</button>' : '') +
        '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-rettifica">Salva</button>'
    });
  };

  GC.moduli.rettifica = function (v, form) {
    stato.applica(function (a) {
      var importo = I.leggiImporto(v.importo);
      if (importo == null) { throw new Error('Scrivi il dovuto del mese.'); }
      var esistente = P.rettifica(a, v.personaId, v.mese);
      var campi = { personaId: v.personaId, mese: v.mese, dovutoCent: importo, note: (v.note || '').trim() };
      if (esistente) { return A.aggiorna(a, 'rettifiche', esistente.id, campi, stato.ora()).archivio; }
      return A.inserisci(a, 'rettifiche', campi, stato.ora()).archivio;
    }, { form: form });
  };

  GC.azioni['rettifica-elimina'] = function (d) {
    ui.chiudiModale();
    stato.applica(function (a) { return A.elimina(a, 'rettifiche', d.id, stato.ora()); });
  };

  // --- Scheda di una persona ---

  function numero(etichetta, valore, nota, classe) {
    return '<div class="numero"><div class="etichetta">' + esc(etichetta) + '</div><div class="valore' + (classe ? ' ' + classe : '') + '">' + valore +
      '</div>' + (nota ? '<div class="nota">' + esc(nota) + '</div>' : '') + '</div>';
  }

  function renderPersona(id, rotta) {
    var p = A.trova(archivio(), 'persone', id);
    if (!p) { return '<div class="scheda">' + ui.vuoto('Scheda non trovata.', '<a class="pulsante" href="#/personale">Torna al personale</a>') + '</div>'; }
    var oggi = stato.oggi();
    var mese = rotta.parametri.mese && D.meseValido(rotta.parametri.mese) ? rotta.parametri.mese : D.mese(oggi);
    var tolleranza = archivio().impostazioni.soglie.tolleranzaPersonaleCent;
    var paga = P.pagaAttuale(p, oggi);
    var h = '<p><a href="#/personale">‹ Personale</a></p>';
    h += '<div class="scheda"><div class="intestazione"><h2>' + esc(p.nome) + '</h2>' +
      '<button type="button" class="pulsante piccolo secondario" data-azione="persona-modifica" data-id="' + esc(p.id) + '">Modifica</button></div>' +
      '<dl class="dati">' + (p.ruolo ? '<dt>Ruolo</dt><dd>' + esc(p.ruolo) + '</dd>' : '') +
      (p.tipoRapporto ? '<dt>Rapporto</dt><dd>' + esc(p.tipoRapporto) + '</dd>' : '') +
      (p.giorniOrario ? '<dt>Giorni e orario</dt><dd>' + esc(p.giorniOrario) + '</dd>' : '') +
      '<dt>Paga attuale</dt><dd>' + esc(testoPaga(paga)) + '</dd>' +
      (p.telefono ? '<dt>Telefono</dt><dd>' + esc(p.telefono) + '</dd>' : '') +
      (p.email ? '<dt>Email</dt><dd>' + esc(p.email) + '</dd>' : '') +
      (p.dataInizio ? '<dt>Dal</dt><dd>' + ui.data(p.dataInizio) + '</dd>' : '') +
      (p.dataFine ? '<dt>Al</dt><dd>' + ui.data(p.dataFine) + '</dd>' : '') +
      (p.note ? '<dt>Note</dt><dd>' + esc(p.note) + '</dd>' : '') + '</dl></div>';

    // Mese selezionato
    var r = P.riepilogoMese(archivio(), p, mese);
    var fuori = r.differenza != null && Math.abs(r.differenza) > tolleranza && mese < D.mese(oggi);
    var stip = M.coppiaPerRuolo(archivio().collezioni.categorie, 'stipendi');
    var origine = { ore: 'ore × paga oraria', mensile: 'paga mensile', rettifica: 'corretto a mano' }[r.origine] || 'nessuna paga per questo mese';
    h += '<div class="scheda"><div class="selettore-mese">' +
      '<a class="pulsante secondario" href="#/persona/' + esc(p.id) + '?mese=' + D.spostaMese(mese, -1) + '" aria-label="Mese precedente">‹</a>' +
      '<strong>' + esc(D.formattaMese(mese)) + '</strong>' +
      '<a class="pulsante secondario" href="#/persona/' + esc(p.id) + '?mese=' + D.spostaMese(mese, 1) + '" aria-label="Mese successivo">›</a></div>';
    if (fuori) { h += '<div class="attenzione-box">Dovuto e pagato non coincidono: differenza di ' + ui.euro(Math.abs(r.differenza)) + (r.differenza > 0 ? ' da pagare.' : ' pagati in più.') + '</div>'; }
    if (mese === D.mese(oggi)) { h += '<p class="tenue">Mese in corso: il controllo si fa a mese concluso.</p>'; }
    h += '<div class="numeri">' +
      numero('Ore', esc(I.formattaOre(r.minuti))) +
      numero('Dovuto', r.dovuto != null ? ui.euro(r.dovuto) : '—', origine) +
      numero('Pagato', ui.euro(r.pagato), 'Stipendi di competenza del mese') +
      numero('Differenza', r.differenza != null ? ui.euro(r.differenza) : '—', 'dovuto − pagato', fuori ? 'su' : '') + '</div>' +
      '<div class="pulsanti"><button type="button" class="pulsante piccolo" data-azione="ore-nuove" data-id="' + esc(p.id) + '" data-mese="' + esc(mese) + '">+ Ore</button>' +
      '<button type="button" class="pulsante piccolo" data-azione="movimento-nuovo" data-categoria-id="' + esc(stip.categoriaId || '') + '" data-sottocategoria-id="' +
      esc(stip.sottocategoriaId || '') + '" data-collegamento-tipo="persona" data-collegamento-id="' + esc(p.id) + '" data-competenza="' + esc(mese) +
      '" data-controparte="' + esc(p.nome) + '"' + (r.differenza > 0 ? ' data-importo="' + esc(I.importoPerCampo(r.differenza)) + '"' : '') + '>+ Pagamento</button>' +
      '<button type="button" class="pulsante piccolo secondario" data-azione="rettifica-modifica" data-id="' + esc(p.id) + '" data-mese="' + esc(mese) + '">Correggi dovuto</button></div>';
    var ore = P.oreDelMese(archivio(), p.id, mese);
    if (ore.length) {
      h += '<h3 style="margin-top:14px">Registro ore</h3><ul class="elenco">' + ore.map(function (o) {
        return '<li class="riga-con-azioni"><div class="riga"><span class="corpo"><span class="titolo">' + ui.data(o.data) + '</span>' +
          (o.note ? '<br><span class="sotto">' + esc(o.note) + '</span>' : '') + '</span><span class="destra">' + esc(I.formattaOre(o.minuti)) + '</span></div>' +
          '<span class="azioni-riga"><button type="button" class="pulsante leggero piccolo" data-azione="ore-elimina" data-id="' + esc(o.id) + '" aria-label="Elimina">×</button></span></li>';
      }).join('') + '</ul>';
    }
    h += '</div>';

    // Ultimi 12 mesi
    var mesi = D.elencoMesi(D.spostaMese(D.mese(oggi), -11), D.mese(oggi)).reverse();
    h += '<div class="scheda"><h2>Ultimi 12 mesi</h2><div class="tabella-scorri"><table class="tabella"><thead><tr><th>Mese</th><th>Ore</th><th>Dovuto</th><th>Pagato</th><th>Diff.</th></tr></thead><tbody>';
    mesi.forEach(function (m) {
      var x = P.riepilogoMese(archivio(), p, m);
      var errore = x.differenza != null && Math.abs(x.differenza) > tolleranza && m < D.mese(oggi);
      h += '<tr class="cliccabile" data-azione="persona-mese" data-id="' + esc(p.id) + '" data-mese="' + m + '"><td>' + esc(D.formattaMeseBreve(m)) + '</td><td>' +
        (x.minuti ? esc(I.formattaOre(x.minuti)) : '') + '</td><td>' + (x.dovuto != null ? ui.euro(x.dovuto) : '—') + '</td><td>' + ui.euro(x.pagato) +
        '</td><td class="' + (errore ? 'su' : '') + '">' + (x.differenza != null ? ui.euro(x.differenza) : '—') + '</td></tr>';
    });
    h += '</tbody></table></div></div>';

    // Paghe
    h += '<div class="scheda"><div class="intestazione"><h2>Storico paghe</h2><button type="button" class="pulsante piccolo" data-azione="paga-nuova" data-id="' + esc(p.id) + '">+ Paga</button></div>';
    h += (p.paghe || []).length ? '<ul class="elenco">' + p.paghe.slice().sort(function (x, y) { return x.dal < y.dal ? 1 : -1; }).map(function (pg) {
      return '<li class="riga-con-azioni"><div class="riga"><span class="corpo"><span class="titolo">dal ' + ui.data(pg.dal) + '</span><br><span class="sotto">' +
        (pg.tipo === 'oraria' ? 'a ore' : 'mensile') + '</span></span><span class="destra importo">' + esc(testoPaga(pg)) + '</span></div>' +
        '<span class="azioni-riga"><button type="button" class="pulsante leggero piccolo" data-azione="paga-elimina" data-id="' + esc(p.id) + '" data-dal="' + esc(pg.dal) + '" aria-label="Elimina">×</button></span></li>';
    }).join('') + '</ul>' : '<p class="tenue">Nessuna paga: aggiungila per calcolare il dovuto.</p>';
    h += '</div>';

    // Pagamenti
    var pagamenti = P.pagamenti(archivio(), p.id);
    h += '<div class="scheda"><h2>Pagamenti</h2>';
    h += pagamenti.length ? '<ul class="elenco">' + pagamenti.slice(0, 24).map(function (m) { return GC.forme.rigaMovimento(m, { senzaCollegamento: true }); }).join('') + '</ul>' +
      (pagamenti.length > 24 ? '<p class="tenue">Gli altri sono nel registro (filtra per categoria Personale).</p>' : '') : '<p class="tenue">Nessun pagamento.</p>';
    h += '</div>';

    // Scadenze ricorrenti
    var contributi = M.coppiaPerRuolo(archivio().collezioni.categorie, 'contributi');
    var ricorrenze = archivio().collezioni.ricorrenze.filter(function (x) { return x.collegamento && x.collegamento.tipo === 'persona' && x.collegamento.id === p.id; });
    h += '<div class="scheda"><div class="intestazione"><h2>Scadenze ricorrenti</h2>' +
      '<button type="button" class="pulsante piccolo" data-azione="ricorrenza-nuova" data-categoria-id="' + esc(contributi.categoriaId || '') +
      '" data-sottocategoria-id="' + esc(contributi.sottocategoriaId || '') + '" data-collegamento-tipo="persona" data-collegamento-id="' + esc(p.id) +
      '" data-descrizione="Contributi ' + esc(p.nome) + '">+ Scadenza</button></div>' +
      '<p class="tenue">Contributi, tredicesima, TFR: inserisci tu importi e date; compaiono negli impegni come pagamenti previsti.</p>';
    h += ricorrenze.length ? '<ul class="elenco">' + ricorrenze.map(function (x) {
      var prossima = M.prossimaData(x, oggi);
      return '<li><button type="button" class="riga" data-azione="ricorrenza-apri" data-id="' + esc(x.id) + '"><span class="corpo"><span class="titolo">' +
        esc(x.descrizione) + '</span><br><span class="sotto">' + esc(S.nomeFrequenza(x.ogniMesi)) + (prossima ? ' · prossima ' + esc(D.formattaData(prossima)) : '') +
        '</span></span><span class="destra importo">' + ui.euro(x.importoCent) + '</span></button></li>';
    }).join('') + '</ul>' : '<p class="tenue">Nessuna scadenza ricorrente.</p>';
    h += '</div>';
    if (GC.forme.impegniCollegati) { h += GC.forme.impegniCollegati({ tipo: 'persona', id: p.id }); }
    return h;
  }

  GC.azioni['persona-mese'] = function (d) { GC.app.vai('persona/' + d.id + '?mese=' + d.mese); };

  GC.viste.personale = { titolo: 'Personale', render: renderElenco };
  GC.viste.persona = { titolo: 'Personale', render: function (rotta) { return renderPersona(rotta.parti[0], rotta); } };
})(typeof window !== 'undefined' ? window : globalThis);
