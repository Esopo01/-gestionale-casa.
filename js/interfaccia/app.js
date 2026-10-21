/*
 * Gestionale casa — avvio, navigazione tra le schermate e azioni comuni.
 * Gli indirizzi sono del tipo #/sezione/scheda?parametro=valore: funzionano sia
 * su GitHub Pages sia aprendo index.html dal computer.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var doc = radice.document;
  var ui = GC.ui;
  var esc = ui.esc;
  var A = GC.archivio;
  var M = GC.movimenti;
  var I = GC.importi;
  var stato = GC.stato;

  var VOCI = [
    { id: 'home', testo: 'Home', icona: 'home', sempre: true },
    { id: 'movimenti', testo: 'Movimenti', icona: 'movimenti', sempre: true },
    { id: 'impegni', testo: 'Impegni', icona: 'impegni', sempre: true },
    { id: 'lavori', testo: 'Lavori', icona: 'lavori' },
    { id: 'personale', testo: 'Personale', icona: 'personale' },
    { id: 'animali', testo: 'Animali', icona: 'animali' },
    { id: 'energia', testo: 'Energia', icona: 'energia' },
    { id: 'impostazioni', testo: 'Impostazioni', icona: 'impostazioni' },
    { id: 'altro', testo: 'Altro', icona: 'altro', soloStretto: true }
  ];
  var SEZIONE_DI = { lavoro: 'lavori', manutenzione: 'lavori', persona: 'personale', animale: 'animali' };

  var ultimaChiave = null;

  function leggiRotta() {
    var h = (radice.location.hash || '').replace(/^#\/?/, '');
    var pezzi = h.split('?');
    var parti = pezzi[0].split('/').filter(Boolean).map(function (p) { return decodeURIComponent(p); });
    var parametri = {};
    (pezzi[1] || '').split('&').forEach(function (kv) {
      if (!kv) { return; }
      var i = kv.indexOf('=');
      var k = i >= 0 ? kv.slice(0, i) : kv;
      parametri[decodeURIComponent(k)] = i >= 0 ? decodeURIComponent(kv.slice(i + 1)) : '';
    });
    return { vista: parti[0] || 'home', parti: parti.slice(1), parametri: parametri, percorso: pezzi[0] || 'home' };
  }

  function vai(percorso) {
    radice.location.hash = '#/' + percorso.replace(/^#?\/?/, '');
  }

  function disegnaNav(attiva) {
    var nav = doc.getElementById('navigazione');
    var sezione = SEZIONE_DI[attiva] || attiva;
    nav.innerHTML = VOCI.map(function (v) {
      var classi = [];
      if (!v.sempre && !v.soloStretto) { classi.push('solo-largo'); }
      if (v.soloStretto) { classi.push('solo-stretto'); }
      var attivaQui = v.id === sezione || (v.soloStretto && !VOCI.some(function (x) { return x.sempre && x.id === sezione; }) && sezione !== 'home');
      if (attivaQui) { classi.push('attiva'); }
      return '<a href="#/' + v.id + '" class="' + classi.join(' ') + '"' + (attivaQui ? ' aria-current="page"' : '') + '>' +
        ui.ICONE[v.icona] + '<span>' + esc(v.testo) + '</span></a>';
    }).join('');
  }

  function togliParametro(rotta, nome) {
    var resto = Object.keys(rotta.parametri).filter(function (k) { return k !== nome; }).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(rotta.parametri[k]);
    });
    var nuovo = '#/' + rotta.percorso + (resto.length ? '?' + resto.join('&') : '');
    try { radice.history.replaceState(null, '', nuovo); } catch (e) { /* alcuni browser lo vietano sui file locali */ }
  }

  function aggiorna() {
    var rotta = leggiRotta();
    var vista = GC.viste[rotta.vista] || GC.viste.home;
    var chiave = rotta.percorso;
    var scorrimento = radice.scrollY;
    var contenuto = doc.getElementById('contenuto');
    try {
      var titolo = typeof vista.titolo === 'function' ? vista.titolo(rotta) : vista.titolo;
      doc.getElementById('titolo').textContent = titolo || 'Gestionale casa';
      doc.title = (titolo ? titolo + ' · ' : '') + 'Gestionale casa';
      contenuto.innerHTML = vista.render(rotta);
      if (vista.dopo) { vista.dopo(rotta); }
    } catch (e) {
      contenuto.innerHTML = '<div class="scheda"><h2>Qualcosa non ha funzionato</h2><p>' + esc(e.message) +
        '</p><p class="tenue">I dati non sono stati toccati. Prova a tornare alla Home.</p><a class="pulsante" href="#/home">Home</a></div>';
      if (radice.console) { radice.console.error(e); }
    }
    disegnaNav(rotta.vista);
    if (chiave === ultimaChiave) { radice.scrollTo(0, scorrimento); } else { radice.scrollTo(0, 0); }
    ultimaChiave = chiave;
    if (rotta.parametri.apri && vista.apri && !ui.modaleAperta()) {
      var id = rotta.parametri.apri;
      togliParametro(rotta, 'apri');
      vista.apri(id, rotta);
    }
  }

  function mostraBanner() {
    var banner = doc.getElementById('banner');
    var e = stato.errore;
    if (!e) { banner.classList.add('nascosto'); banner.innerHTML = ''; return; }
    var testo;
    var azioni = '<button type="button" class="pulsante piccolo" data-azione="esporta-backup">Esporta backup</button>';
    if (e.motivo === 'illeggibile' || e.motivo === 'versione') {
      testo = e.messaggio + ' Scarica i dati salvati per recuperarli, oppure ripristina un backup. Finché non scegli, le modifiche non vengono salvate.';
      azioni = '<button type="button" class="pulsante piccolo" data-azione="scarica-grezzi">Scarica i dati salvati</button> ' +
        '<a class="pulsante piccolo secondario" href="#/impostazioni/backup">Ripristina un backup</a> ' +
        '<button type="button" class="pulsante piccolo pericolo" data-azione="ricomincia">Ricomincia da zero</button>';
    } else if (e.motivo === 'non-disponibile') {
      testo = e.messaggio + ' Quello che inserisci si perde chiudendo la pagina: esporta un backup prima di chiudere.';
    } else if (e.motivo === 'spazio') {
      testo = 'Attenzione: le ultime modifiche NON sono salvate nel browser. ' + e.messaggio +
        ' I dati sono ancora in memoria finché non chiudi la pagina: esporta subito un backup.';
    } else {
      testo = 'Attenzione: le ultime modifiche NON sono salvate nel browser. ' + (e.messaggio || '') + ' Esporta un backup per non perderle.';
    }
    banner.innerHTML = '<div>' + esc(testo) + '</div><div class="azioni">' + azioni + '</div>';
    banner.classList.remove('nascosto');
  }

  // --- Azioni comuni ---

  function nomeFile(prefisso, estensione) {
    return prefisso + '-' + stato.oggi() + '.' + estensione;
  }

  // Esporta il backup completo; restituisce false se l'utente non ha dati da esportare.
  function esportaBackup(prefisso) {
    var r = A.esporta(stato.archivio, stato.ora());
    ui.scarica(nomeFile(prefisso || 'gestionale-casa-backup', 'json'), r.testo, 'application/json');
    stato.archivio = r.archivio;
    stato.salva();
    return true;
  }

  GC.azioni['chiudi-modale'] = function () { ui.chiudiModale(); };

  GC.azioni['esporta-backup'] = function () {
    esportaBackup();
    ui.messaggio('Backup scaricato. Conservalo fuori dal browser (es. Google Drive).');
    aggiorna();
  };

  GC.azioni['scarica-grezzi'] = function () {
    ui.scarica(nomeFile('gestionale-casa-dati-salvati', 'txt'), stato.testoIlleggibile || '', 'text/plain');
  };

  GC.azioni.ricomincia = function () {
    ui.conferma('I dati salvati in questo browser verranno sostituiti da un archivio vuoto. Hai scaricato i dati salvati?', {
      titolo: 'Ricominciare da zero?', ok: 'Ricomincia', pericolo: true
    }).then(function (si) {
      if (!si) { return; }
      stato.sblocca().then(function () { mostraBanner(); aggiorna(); });
    });
  };

  // --- Spesa rapida ---

  GC.azioni['spesa-rapida'] = function () {
    var categorie = M.principali(stato.archivio.collezioni.categorie, 'uscita');
    ui.apriModale({
      titolo: 'Nuova spesa',
      corpo: '<form id="modulo-spesa" data-modulo="spesa-rapida" autocomplete="off">' +
        '<div class="errore-modulo"></div>' +
        '<label class="campo"><span>Importo (€)</span><input type="text" name="importo" class="importo-grande" inputmode="decimal" placeholder="0,00" autofocus></label>' +
        '<p class="tenue">Tocca la categoria per salvare: data di oggi, spesa già pagata.</p>' +
        '<div class="griglia-categorie">' + categorie.map(function (c) {
          return '<button type="button" data-azione="spesa-rapida-salva" data-categoria="' + esc(c.id) + '">' + esc(c.nome) + '</button>';
        }).join('') + '</div></form>'
    });
  };

  GC.moduli['spesa-rapida'] = function (valori, form) {
    ui.erroreModulo(form, 'Tocca una categoria per salvare la spesa.');
  };

  GC.azioni['spesa-rapida-salva'] = function (dati, elemento) {
    var form = elemento.form || doc.getElementById('modulo-spesa');
    var importo = I.leggiImporto(form.elements.importo.value);
    if (!(importo > 0)) {
      ui.erroreModulo(form, 'Scrivi l\'importo, ad esempio 12,50.');
      form.elements.importo.focus();
      return;
    }
    var registrato = null;
    stato.applica(function (a) {
      var r = M.spesaRapida(a, { importoCent: importo, categoriaId: dati.categoria }, stato.oggi(), stato.ora());
      registrato = r.record;
      return r.archivio;
    }, { form: form });
    if (registrato) {
      var nome = M.nomeCategoria(stato.archivio.collezioni.categorie, registrato.categoriaId);
      ui.messaggio('Spesa di ' + I.formattaImporto(registrato.importoCent) + ' registrata in ' + nome + '.', {
        azione: { testo: 'Modifica', esegui: function () { GC.forme.movimento({ id: registrato.id }); } }
      });
    }
  };

  // --- Sezioni non ancora costruite in questa fase ---

  function inArrivo(titolo) {
    return {
      titolo: titolo,
      render: function () {
        return '<div class="scheda">' + ui.vuoto('Questa sezione arriva nella prossima fase del lavoro.') + '</div>';
      }
    };
  }
  ['impegni', 'lavori', 'personale', 'animali', 'energia'].forEach(function (id) {
    if (!GC.viste[id]) {
      var voce = VOCI.filter(function (v) { return v.id === id; })[0];
      GC.viste[id] = inArrivo(voce.testo);
    }
  });

  GC.viste.altro = {
    titolo: 'Altro',
    render: function () {
      var voci = [
        { id: 'lavori', testo: 'Lavori e manutenzioni', nota: 'Preventivi, pagamenti, scadenze' },
        { id: 'personale', testo: 'Personale', nota: 'Schede, ore, pagamenti' },
        { id: 'animali', testo: 'Animali', nota: 'Schede, vaccini, richiami' },
        { id: 'energia', testo: 'Energia', nota: 'Fotovoltaico e consumi' },
        { id: 'impostazioni', testo: 'Impostazioni', nota: 'Categorie, soglie, backup' }
      ];
      return '<div class="menu-altro">' + voci.map(function (v) {
        return '<a href="#/' + v.id + '">' + ui.ICONE[v.id] + '<span>' + esc(v.testo) + '</span><small>' + esc(v.nota) + '</small></a>';
      }).join('') + '</div>';
    }
  };

  // --- Eventi globali ---

  doc.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-azione]') : null;
    if (!el) { return; }
    var gestore = GC.azioni[el.getAttribute('data-azione')];
    if (!gestore) { return; }
    e.preventDefault();
    gestore(el.dataset, el, e);
  });

  doc.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.getAttribute || !form.getAttribute('data-modulo')) { return; }
    e.preventDefault();
    var gestore = GC.moduli[form.getAttribute('data-modulo')];
    if (gestore) { ui.erroreModulo(form, ''); gestore(ui.leggiModulo(form), form); }
  });

  doc.addEventListener('change', function (e) {
    var el = e.target.closest ? e.target.closest('[data-cambia]') : null;
    if (!el) { return; }
    var gestore = GC.cambi[el.getAttribute('data-cambia')];
    if (gestore) { gestore(el, e); }
  });

  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && ui.modaleAperta()) { ui.chiudiModale(); }
  });

  radice.addEventListener('hashchange', function () { ui.chiudiTutte(); aggiorna(); });

  doc.addEventListener('visibilitychange', function () {
    if (!doc.hidden && stato.archivio && stato.nuovoGiorno()) { aggiorna(); }
  });

  GC.salvataggio.osserva(function () { stato.ricarica(); });

  GC.app = {
    aggiorna: aggiorna,
    vai: vai,
    leggiRotta: leggiRotta,
    mostraBanner: mostraBanner,
    esportaBackup: esportaBackup,
    nomeFile: nomeFile
  };

  stato.avvia().then(function () {
    mostraBanner();
    aggiorna();
  });
})(typeof window !== 'undefined' ? window : globalThis);
