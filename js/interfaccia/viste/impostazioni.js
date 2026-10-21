/*
 * Gestionale casa — Impostazioni: famiglia e conti, categorie, soglie, impianto,
 * backup e ripristino, dati di prova, cancella tutto.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var ui = GC.ui;
  var esc = ui.esc;
  var D = GC.date;
  var I = GC.importi;
  var S = GC.schema;
  var A = GC.archivio;
  var M = GC.movimenti;
  var stato = GC.stato;

  function schede() {
    var voci = [
      { id: 'famiglia', testo: 'Famiglia e conti' },
      { id: 'categorie', testo: 'Categorie' },
      { id: 'soglie', testo: 'Soglie' }
    ];
    if (GC.forme.impostazioniImpianto) { voci.push({ id: 'impianto', testo: 'Impianto' }); }
    voci.push({ id: 'backup', testo: 'Backup e dati' });
    return voci;
  }

  function archivio() { return stato.archivio; }

  // --- Familiari e conti: elenchi di soli nomi ---

  var ELENCHI = {
    familiari: { titolo: 'Persone della famiglia', singolare: 'persona', campo: 'responsabileId',
      spiegazione: 'Servono per indicare chi si occupa di impegni, scadenze e pagamenti.' },
    conti: { titolo: 'Conti e mezzi di pagamento', singolare: 'conto', campo: 'contoId',
      spiegazione: 'Facoltativi: conto corrente, carta, contanti… per riscontrare l\'estratto conto.' }
  };

  function renderElenco(nome) {
    var info = ELENCHI[nome];
    var lista = archivio().collezioni[nome];
    var h = '<div class="scheda"><div class="intestazione"><h2>' + esc(info.titolo) + '</h2>' +
      '<button type="button" class="pulsante piccolo" data-azione="nome-nuovo" data-collezione="' + nome + '">+ Aggiungi</button></div>' +
      '<p class="tenue">' + esc(info.spiegazione) + '</p>';
    if (!lista.length) { return h + '<p class="tenue">Nessuna voce.</p></div>'; }
    return h + '<ul class="elenco">' + lista.map(function (r) {
      return '<li><button type="button" class="riga" data-azione="nome-modifica" data-collezione="' + nome + '" data-id="' + esc(r.id) + '">' +
        '<span class="corpo"><span class="titolo">' + esc(r.nome) + '</span></span><span class="destra tenue">Modifica</span></button></li>';
    }).join('') + '</ul></div>';
  }

  function apriNome(collezione, id) {
    var info = ELENCHI[collezione];
    var r = id ? A.trova(archivio(), collezione, id) : null;
    ui.apriModale({
      titolo: r ? 'Modifica ' + info.singolare : 'Nuova ' + info.singolare,
      corpo: '<form id="modulo-nome" data-modulo="nome" autocomplete="off"><div class="errore-modulo"></div>' +
        ui.campo({ nome: 'nome', etichetta: 'Nome', valore: r ? r.nome : '', autofocus: true }) +
        '<input type="hidden" name="collezione" value="' + esc(collezione) + '"><input type="hidden" name="id" value="' + esc(id || '') + '"></form>',
      piede: (r ? '<button type="button" class="pulsante leggero sinistra" data-azione="nome-elimina" data-collezione="' + collezione + '" data-id="' + esc(id) + '">Elimina</button>' : '') +
        '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-nome">Salva</button>'
    });
  }

  GC.azioni['nome-nuovo'] = function (d) { apriNome(d.collezione); };
  GC.azioni['nome-modifica'] = function (d) { apriNome(d.collezione, d.id); };

  GC.moduli.nome = function (v, form) {
    var nome = (v.nome || '').trim();
    if (!nome) { ui.erroreModulo(form, 'Scrivi un nome.'); return; }
    if (!ELENCHI[v.collezione]) { return; }
    stato.applica(function (a) {
      return A.salva(a, v.collezione, v.id ? { id: v.id, nome: nome } : { nome: nome }, stato.ora()).archivio;
    }, { form: form });
  };

  GC.azioni['nome-elimina'] = function (d) {
    var info = ELENCHI[d.collezione];
    ui.conferma('Eliminare questa voce? Dove era indicata, il campo resterà vuoto.', { titolo: 'Eliminare?', ok: 'Elimina', pericolo: true }).then(function (si) {
      if (!si) { return; }
      ui.chiudiModale();
      var ora = stato.ora();
      stato.applica(function (a) {
        a = A.elimina(a, d.collezione, d.id, ora);
        return A.azzeraRiferimenti(a, info.campo, d.id, ora);
      });
    });
  };

  // --- Categorie ---

  var NOMI_VERSO = { uscita: 'Uscite', entrata: 'Entrate', entrambi: 'Uscite ed entrate' };

  function renderCategorie() {
    var cats = archivio().collezioni.categorie;
    var h = '<div class="scheda"><div class="intestazione"><h2>Categorie</h2>' +
      '<button type="button" class="pulsante piccolo" data-azione="categoria-nuova">+ Categoria</button></div>' +
      '<p class="tenue">Rinomina, aggiungi o archivia le categorie. Quelle segnate "usata dal programma" servono a bollette, personale, animali, lavori o GSE: si possono rinominare ma non eliminare.</p>' +
      '<ul class="elenco categoria-albero">';
    M.principali(cats, null, true).forEach(function (c) {
      h += rigaCategoria(c, false);
      M.sottocategorie(cats, c.id, null, true).forEach(function (s) { h += rigaCategoria(s, true); });
      h += '<li class="figlia"><button type="button" class="pulsante leggero piccolo" data-azione="categoria-nuova" data-padre="' + esc(c.id) + '">+ Sottocategoria di ' + esc(c.nome) + '</button></li>';
    });
    return h + '</ul></div>';
  }

  function rigaCategoria(c, figlia) {
    var etichette = (c.ruolo ? ui.distintivo('usata dal programma', 'ok') + ' ' : '') + (c.archiviata ? ui.distintivo('archiviata') : '');
    var verso = c.verso ? NOMI_VERSO[c.verso] : '';
    return '<li' + (figlia ? ' class="figlia"' : '') + '><button type="button" class="riga" data-azione="categoria-modifica" data-id="' + esc(c.id) + '">' +
      '<span class="corpo"><span class="titolo">' + esc(c.nome) + '</span> ' + etichette +
      (verso && !figlia ? '<br><span class="sotto">' + esc(verso) + '</span>' : '') + '</span>' +
      '<span class="destra tenue">' + M.usiCategoria(archivio(), c.id) + ' usi</span></button></li>';
  }

  function apriCategoria(id, padreId) {
    var c = id ? A.trova(archivio(), 'categorie', id) : null;
    var padre = c ? c.padreId : (padreId || null);
    var opzioniVerso = [{ valore: 'uscita', testo: 'Uscite' }, { valore: 'entrata', testo: 'Entrate' }, { valore: 'entrambi', testo: 'Uscite ed entrate' }];
    if (padre) { opzioniVerso.unshift({ valore: '', testo: 'Come la categoria' }); }
    var corpo = '<form id="modulo-categoria" data-modulo="categoria" autocomplete="off"><div class="errore-modulo"></div>' +
      (padre ? '<p class="tenue">Sottocategoria di <strong>' + esc((A.trova(archivio(), 'categorie', padre) || {}).nome) + '</strong></p>' : '') +
      ui.campo({ nome: 'nome', etichetta: 'Nome', valore: c ? c.nome : '', autofocus: true }) +
      ui.campo({ nome: 'verso', etichetta: 'Si usa per', tipo: 'select', valore: c ? (c.verso || '') : (padre ? '' : 'uscita'), opzioni: opzioniVerso }) +
      ui.campo({ nome: 'ordine', etichetta: 'Posizione nell\'elenco', tipo: 'intero', valore: c ? c.ordine : '', aiuto: 'numero più basso = più in alto' }) +
      (c ? ui.campo({ nome: 'archiviata', etichetta: 'Archiviata (non compare più nelle scelte)', tipo: 'spunta', valore: c.archiviata }) : '') +
      '<input type="hidden" name="id" value="' + esc(id || '') + '"><input type="hidden" name="padreId" value="' + esc(padre || '') + '"></form>';
    ui.apriModale({
      titolo: c ? 'Modifica categoria' : (padre ? 'Nuova sottocategoria' : 'Nuova categoria'),
      corpo: corpo,
      piede: (c && !c.ruolo ? '<button type="button" class="pulsante leggero sinistra" data-azione="categoria-elimina" data-id="' + esc(c.id) + '">Elimina</button>' : '') +
        '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-categoria">Salva</button>'
    });
  }

  GC.azioni['categoria-nuova'] = function (d) { apriCategoria(null, d.padre); };
  GC.azioni['categoria-modifica'] = function (d) { apriCategoria(d.id); };

  GC.moduli.categoria = function (v, form) {
    var nome = (v.nome || '').trim();
    if (!nome) { ui.erroreModulo(form, 'Scrivi il nome della categoria.'); return; }
    var ordine = v.ordine ? I.leggiIntero(v.ordine, 0, 9999) : null;
    stato.applica(function (a) {
      var fratelli = a.collezioni.categorie.filter(function (c) { return (c.padreId || '') === (v.padreId || ''); });
      var campi = {
        nome: nome,
        verso: v.verso || null,
        ordine: ordine != null ? ordine : fratelli.length + 1
      };
      if (v.id) {
        if (v.archiviata !== undefined) { campi.archiviata = !!v.archiviata; }
        return A.aggiorna(a, 'categorie', v.id, campi, stato.ora()).archivio;
      }
      campi.padreId = v.padreId || null;
      campi.ruolo = null;
      campi.archiviata = false;
      return A.inserisci(a, 'categorie', campi, stato.ora()).archivio;
    }, { form: form });
  };

  GC.azioni['categoria-elimina'] = function (d) {
    ui.conferma('Eliminare la categoria (e le sue sottocategorie)? Si può solo se non è usata da nessun movimento, ricorrenza, budget o manutenzione.', {
      titolo: 'Eliminare la categoria?', ok: 'Elimina', pericolo: true
    }).then(function (si) {
      if (!si) { return; }
      var ok = stato.applica(function (a) { return M.eliminaCategoria(a, d.id, stato.ora()); });
      if (ok) { ui.chiudiModale(); }
    });
  };

  // --- Soglie ---

  function renderSoglie() {
    var s = archivio().impostazioni.soglie;
    return '<div class="scheda"><h2>Soglie dei controlli</h2>' +
      '<form id="modulo-soglie" data-modulo="soglie" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
      ui.campo({ nome: 'bollettaPct', etichetta: 'Bollette: avviso se importo o consumo superano di (%)', tipo: 'intero', valore: s.bollettaPct }) +
      ui.campo({ nome: 'bollettaUltime', etichetta: 'Bollette: senza l\'anno prima, media delle ultime', tipo: 'intero', valore: s.bollettaUltime }) +
      ui.campo({ nome: 'produzioneMinPct', etichetta: 'Fotovoltaico: avviso se la produzione è sotto (%) di quella attesa', tipo: 'intero', valore: s.produzioneMinPct }) +
      ui.campo({ nome: 'backupGiorni', etichetta: 'Backup: avviso dopo quanti giorni', tipo: 'intero', valore: s.backupGiorni }) +
      ui.campo({ nome: 'finestraGiorni', etichetta: 'Impegni e previsti: "prossimi" giorni', tipo: 'intero', valore: s.finestraGiorni }) +
      ui.campo({ nome: 'tolleranzaPersonale', etichetta: 'Personale: differenza tollerata tra dovuto e pagato (€)', tipo: 'importo', valore: I.importoPerCampo(s.tolleranzaPersonaleCent) }) +
      ui.campo({ nome: 'ricorrenzeMesiAvanti', etichetta: 'Ricorrenze: genera i previsti fino a quanti mesi avanti', tipo: 'intero', valore: archivio().impostazioni.ricorrenzeMesiAvanti }) +
      '<div class="pulsanti"><button type="submit" class="pulsante">Salva le soglie</button></div></form></div>';
  }

  GC.moduli.soglie = function (v, form) {
    var n = function (k, min, max) {
      var x = I.leggiIntero(v[k], min, max);
      if (x == null) { throw new Error('Valore non valido: deve essere un numero intero tra ' + min + ' e ' + max + '.'); }
      return x;
    };
    stato.applica(function (a) {
      var tolleranza = I.leggiImporto(v.tolleranzaPersonale || '0');
      if (tolleranza == null) { throw new Error('La differenza tollerata non è un importo valido.'); }
      var soglie = {
        bollettaPct: n('bollettaPct', 1, 1000),
        bollettaUltime: n('bollettaUltime', 1, 24),
        produzioneMinPct: n('produzioneMinPct', 1, 100),
        backupGiorni: n('backupGiorni', 1, 365),
        finestraGiorni: n('finestraGiorni', 1, 365),
        tolleranzaPersonaleCent: tolleranza
      };
      var mesi = n('ricorrenzeMesiAvanti', 1, 36);
      a = A.conImpostazioni(a, { soglie: soglie, ricorrenzeMesiAvanti: mesi }, stato.ora());
      return M.generaPrevisti(a, stato.oggi(), stato.ora()).archivio;
    }, { form: form, chiudi: false, messaggio: 'Soglie salvate.' });
  };

  // --- Backup e dati ---

  function dimensione(caratteri) {
    var byte = caratteri * 2;
    if (byte < 1024 * 1024) { return Math.max(1, Math.round(byte / 1024)) + ' KB'; }
    return (Math.round(byte / 1024 / 1024 * 10) / 10).toString().replace('.', ',') + ' MB';
  }

  function renderBackup() {
    var a = archivio();
    var vuoto = A.eVuoto(a);
    var r = A.riepilogo(a);
    var h = '<div class="scheda"><h2>Backup e ripristino</h2>' +
      '<p>' + (a.meta.ultimoBackupIl ? 'Ultimo backup: <strong>' + esc(D.formattaDataOra(a.meta.ultimoBackupIl)) + '</strong>' : '<strong>Nessun backup fatto finora.</strong>') + '</p>' +
      '<p class="tenue">Il backup è un file JSON con tutti i dati. Conservalo fuori dal browser (es. Google Drive) e usalo per passare i dati a un altro dispositivo.</p>' +
      '<div class="pulsanti"><button type="button" class="pulsante" data-azione="esporta-backup">Esporta backup</button>' +
      '<button type="button" class="pulsante secondario" data-azione="importa-backup">Importa un backup…</button></div></div>';
    h += '<div class="scheda"><h2>Spazio usato</h2><p>Circa <strong>' + esc(dimensione(GC.salvataggio.spazioOccupato())) + '</strong> per ' +
      r.totale + ' elementi salvati.</p><p class="tenue">Di solito il browser concede circa 5 MB a questo indirizzo, condivisi con gli altri siti GitHub Pages dello stesso account. Allegati e curve a 15 minuti non vengono mai salvati.</p></div>';
    h += '<div class="scheda"><h2>Dati di prova</h2><p>Carica 14 mesi di dati inventati per provare ogni schermata e ogni avviso.</p>' +
      (vuoto ? '' : '<p class="tenue">Disponibile solo ad archivio vuoto: prima usa "Cancella tutto".</p>') +
      '<div class="pulsanti"><button type="button" class="pulsante secondario" data-azione="carica-demo"' + (vuoto ? '' : ' disabled') + '>Carica dati di prova</button></div></div>';
    h += '<div class="scheda"><h2>Cancella tutto</h2><p>Elimina tutti i dati da questo browser e riparte da zero (categorie predefinite).</p>' +
      '<div class="pulsanti"><button type="button" class="pulsante pericolo" data-azione="cancella-tutto">Cancella tutto…</button></div></div>';
    h += '<div class="scheda"><h2>Informazioni</h2><dl class="dati"><dt>Versione dei dati</dt><dd>' + esc(a.schemaVersion) + '</dd>' +
      '<dt>Archivio creato</dt><dd>' + esc(D.formattaDataOra(a.meta.creatoIl)) + '</dd>' +
      '<dt>Dove sono i dati</dt><dd>Solo in questo browser, su questo dispositivo</dd></dl></div>';
    return h;
  }

  GC.azioni['carica-demo'] = function () {
    if (!A.eVuoto(archivio())) { ui.messaggio('L\'archivio non è vuoto: i dati di prova si caricano solo ad archivio vuoto.', { tipo: 'errore' }); return; }
    ui.conferma('Carico 14 mesi di dati inventati. Potrai eliminarli con "Cancella tutto".', { titolo: 'Caricare i dati di prova?', ok: 'Carica' }).then(function (si) {
      if (!si) { return; }
      stato.sostituisci(GC.demo.genera(stato.oggi(), stato.ora())).then(function () {
        GC.app.vai('home');
        GC.app.aggiorna();
        ui.messaggio('Dati di prova caricati.');
      });
    });
  };

  GC.azioni['cancella-tutto'] = function () {
    var vuoto = A.eVuoto(archivio());
    ui.conferma('', {
      titolo: 'Cancellare tutti i dati?',
      html: '<p>Tutti i movimenti, le schede, gli impegni, i dati dell\'energia e le impostazioni di questo browser verranno eliminati. L\'operazione non si può annullare.</p>' +
        (vuoto ? '' : '<p>Prima di procedere puoi scaricare un backup:</p><div class="pulsanti"><button type="button" class="pulsante secondario" data-azione="esporta-backup">Scarica un backup</button></div>'),
      ok: 'Cancella tutto',
      pericolo: true
    }).then(function (si) {
      if (!si) { return; }
      stato.sostituisci(S.nuovoArchivio(stato.ora())).then(function () {
        GC.app.aggiorna();
        ui.messaggio('Tutti i dati sono stati cancellati.');
      });
    });
  };

  GC.azioni['importa-backup'] = function () {
    ui.scegliFile('.json,application/json').then(function (file) {
      if (!file) { return null; }
      return ui.leggiFile(file).then(function (testo) {
        var r = A.leggiBackup(testo, stato.ora());
        if (!r.ok) {
          ui.apriModale({
            titolo: 'File non valido',
            corpo: '<p>Il file "' + esc(file.name) + '" non si può importare:</p><ul>' + r.errori.slice(0, 10).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>',
            piede: '<button type="button" class="pulsante" data-azione="chiudi-modale">Chiudi</button>'
          });
          return null;
        }
        riepilogoImportazione(r.archivio, file.name);
        return null;
      });
    }).catch(function (e) { ui.messaggio(e.message, { tipo: 'errore' }); });
  };

  var daImportare = null;

  function riepilogoImportazione(esterno, nomeFile) {
    daImportare = esterno;
    var r = A.riepilogo(esterno);
    var unione = A.unisci(archivio(), esterno).resoconto;
    var righe = S.COLLEZIONI.filter(function (n) { return r.conteggi[n] > 0 && n !== 'categorie'; }).map(function (n) {
      return '<tr><td>' + esc(S.NOMI_COLLEZIONI[n]) + '</td><td>' + r.conteggi[n] + '</td></tr>';
    }).join('');
    var corpo = '<p>File: <strong>' + esc(nomeFile) + '</strong></p>' +
      '<dl class="dati"><dt>Backup del</dt><dd>' + esc(r.ultimoBackupIl ? D.formattaDataOra(r.ultimoBackupIl) : 'non indicato') + '</dd>' +
      '<dt>Versione dei dati</dt><dd>' + esc(r.schemaVersion) + '</dd>' +
      (r.movimentiDal ? '<dt>Movimenti</dt><dd>dal ' + esc(D.formattaData(r.movimentiDal)) + ' al ' + esc(D.formattaData(r.movimentiAl)) + '</dd>' : '') + '</dl>' +
      (righe ? '<div class="tabella-scorri"><table class="tabella"><thead><tr><th>Contenuto</th><th>Elementi</th></tr></thead><tbody>' + righe + '</tbody></table></div>' : '<p>Il file non contiene dati oltre alle categorie.</p>') +
      '<h3 style="margin-top:12px">Come vuoi importarlo?</h3>' +
      '<p><strong>Sostituisci tutto</strong>: i dati di questo browser vengono sostituiti da quelli del file.</p>' +
      '<p><strong>Unisci</strong>: tiene i dati di entrambi; per ogni elemento vince la modifica più recente. Con questo file: ' +
      unione.aggiunti + ' aggiunti, ' + unione.aggiornati + ' aggiornati, ' + unione.eliminati + ' eliminati.</p>' +
      '<p class="tenue">Prima di procedere scarico automaticamente un backup dei dati attuali.</p>';
    ui.apriModale({
      titolo: 'Importare questo backup?',
      corpo: corpo,
      larga: true,
      piede: '<button type="button" class="pulsante secondario sinistra" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="button" class="pulsante secondario" data-azione="importa-conferma" data-modo="unisci">Unisci</button>' +
        '<button type="button" class="pulsante pericolo" data-azione="importa-conferma" data-modo="sostituisci">Sostituisci tutto</button>'
    });
  }

  GC.azioni['importa-conferma'] = function (d) {
    if (!daImportare) { return; }
    var esterno = daImportare;
    daImportare = null;
    if (!A.eVuoto(archivio())) { GC.app.esportaBackup('gestionale-casa-backup-prima-importazione'); }
    var nuovo = d.modo === 'unisci' ? A.unisci(archivio(), esterno).archivio : esterno;
    ui.chiudiTutte();
    stato.sostituisci(nuovo).then(function () {
      if (stato.bloccato) { stato.sblocca().then(function () { GC.app.mostraBanner(); }); }
      GC.app.aggiorna();
      ui.messaggio(d.modo === 'unisci' ? 'Backup unito ai dati di questo browser.' : 'Backup ripristinato.');
    });
  };

  // --- Schermata ---

  GC.viste.impostazioni = {
    titolo: 'Impostazioni',
    render: function (rotta) {
      var scheda = rotta.parti[0] || 'famiglia';
      var h = ui.schedeNav('impostazioni', schede(), scheda);
      if (scheda === 'categorie') { return h + renderCategorie(); }
      if (scheda === 'soglie') { return h + renderSoglie(); }
      if (scheda === 'impianto' && GC.forme.impostazioniImpianto) { return h + GC.forme.impostazioniImpianto(); }
      if (scheda === 'backup') { return h + renderBackup(); }
      return h + '<div class="griglia due"><div>' + renderElenco('familiari') + '</div><div>' + renderElenco('conti') + '</div></div>';
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
