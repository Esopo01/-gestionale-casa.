/*
 * Gestionale casa — strumenti comuni dell'interfaccia: finestre, messaggi, moduli, file.
 * Le schermate producono HTML come testo (sempre passando i dati da esc()) e
 * reagiscono ai clic tramite gli attributi data-azione, data-modulo e data-cambia.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var doc = radice.document;
  var I = GC.importi;
  var D = GC.date;

  // Registri dei gestori: data-azione="nome", <form data-modulo="nome">, data-cambia="nome".
  GC.azioni = GC.azioni || {};
  GC.moduli = GC.moduli || {};
  GC.cambi = GC.cambi || {};
  GC.viste = GC.viste || {};
  GC.forme = GC.forme || {};

  var contatore = 0;

  function esc(valore) {
    return String(valore == null ? '' : valore).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function euro(centesimi) { return esc(I.formattaImporto(centesimi)); }
  function data(iso) { return esc(D.formattaData(iso)); }

  // --- Icone (SVG in linea, nessun file esterno) ---

  function icona(percorso) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + percorso + '</svg>';
  }
  var ICONE = {
    home: icona('<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
    movimenti: icona('<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>'),
    impegni: icona('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    altro: icona('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
    lavori: icona('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>'),
    personale: icona('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'),
    animali: icona('<circle cx="6" cy="10" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="6" r="2"/><circle cx="18" cy="10" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5-2 3-4 3-4 0-4-3z"/>'),
    energia: icona('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    impostazioni: icona('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')
  };

  // --- Finestre modali ---

  var pila = [];

  function apriModale(o) {
    contatore++;
    var sfondo = doc.createElement('div');
    sfondo.className = 'modale-sfondo';
    var idTitolo = 'titolo-modale-' + contatore;
    sfondo.innerHTML = '<div class="modale' + (o.larga ? ' larga' : '') + '" role="dialog" aria-modal="true" aria-labelledby="' + idTitolo + '">' +
      '<div class="modale-testa"><h2 id="' + idTitolo + '">' + esc(o.titolo) + '</h2>' +
      '<button type="button" class="chiudi" data-azione="chiudi-modale" aria-label="Chiudi">×</button></div>' +
      '<div class="modale-corpo">' + (o.corpo || '') + '</div>' +
      (o.piede ? '<div class="modale-piede">' + o.piede + '</div>' : '') + '</div>';
    doc.body.appendChild(sfondo);
    pila.push({ elemento: sfondo, precedente: doc.activeElement, allaChiusura: o.allaChiusura });
    doc.body.style.overflow = 'hidden';
    var fuoco = sfondo.querySelector('[autofocus]');
    if (fuoco) { setTimeout(function () { fuoco.focus(); }, 40); }
    return sfondo;
  }

  function chiudiModale() {
    var cima = pila.pop();
    if (!cima) { return; }
    cima.elemento.remove();
    if (!pila.length) { doc.body.style.overflow = ''; }
    if (cima.precedente && typeof cima.precedente.focus === 'function' && doc.body.contains(cima.precedente)) {
      cima.precedente.focus();
    }
    if (cima.allaChiusura) { cima.allaChiusura(); }
  }

  function chiudiTutte() { while (pila.length) { chiudiModale(); } }

  function modaleAperta() { return pila.length > 0 ? pila[pila.length - 1].elemento : null; }

  // Chiede conferma; risponde con una Promise<boolean>.
  function conferma(testo, o) {
    o = o || {};
    return new Promise(function (risolvi) {
      var esito = false;
      var m = apriModale({
        titolo: o.titolo || 'Conferma',
        corpo: (o.html || '<p>' + esc(testo) + '</p>'),
        piede: '<button type="button" class="pulsante secondario" data-ruolo="no">' + esc(o.annulla || 'Annulla') + '</button>' +
          '<button type="button" class="pulsante' + (o.pericolo ? ' pericolo' : '') + '" data-ruolo="si">' + esc(o.ok || 'Conferma') + '</button>',
        allaChiusura: function () { risolvi(esito); }
      });
      m.querySelector('[data-ruolo="no"]').addEventListener('click', function () { chiudiModale(); });
      m.querySelector('[data-ruolo="si"]').addEventListener('click', function () { esito = true; chiudiModale(); });
      setTimeout(function () { m.querySelector('[data-ruolo="no"]').focus(); }, 40);
    });
  }

  // --- Messaggi brevi ---

  function messaggio(testo, o) {
    o = o || {};
    var contenitore = doc.getElementById('messaggi');
    if (!contenitore) { return; }
    var el = doc.createElement('div');
    el.className = 'messaggio' + (o.tipo === 'errore' ? ' errore' : '');
    el.setAttribute('role', o.tipo === 'errore' ? 'alert' : 'status');
    var span = doc.createElement('span');
    span.style.flex = '1';
    span.textContent = testo;
    el.appendChild(span);
    if (o.azione) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.textContent = o.azione.testo;
      b.addEventListener('click', function () { el.remove(); o.azione.esegui(); });
      el.appendChild(b);
    }
    while (contenitore.children.length >= 2) { contenitore.removeChild(contenitore.firstChild); }
    contenitore.appendChild(el);
    setTimeout(function () { el.remove(); }, o.durata || (o.tipo === 'errore' ? 7000 : 4500));
  }

  // --- File ---

  function scarica(nomeFile, contenuto, tipo) {
    var blob = new Blob([contenuto], { type: tipo || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = doc.createElement('a');
    a.href = url;
    a.download = nomeFile;
    a.style.display = 'none';
    doc.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }

  function scegliFile(accetta) {
    return new Promise(function (risolvi) {
      var input = doc.createElement('input');
      input.type = 'file';
      if (accetta) { input.accept = accetta; }
      input.style.display = 'none';
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        input.remove();
        risolvi(f || null);
      });
      doc.body.appendChild(input);
      input.click();
    });
  }

  function leggiComeTesto(file, codifica) {
    return new Promise(function (risolvi, rifiuta) {
      var lettore = new FileReader();
      lettore.onload = function () { risolvi(String(lettore.result)); };
      lettore.onerror = function () { rifiuta(new Error('Il file non si riesce a leggere.')); };
      lettore.readAsText(file, codifica);
    });
  }

  // Legge un file di testo; se non è UTF-8 (es. CSV salvato da Excel) lo rilegge come Windows-1252.
  function leggiFile(file) {
    return leggiComeTesto(file, 'utf-8').then(function (testo) {
      if (testo.indexOf('�') >= 0) { return leggiComeTesto(file, 'windows-1252'); }
      return testo;
    });
  }

  // --- Moduli ---

  function opzioni(lista, selezionato) {
    return lista.map(function (o) {
      var valore = o.valore == null ? '' : String(o.valore);
      var sel = String(selezionato == null ? '' : selezionato) === valore ? ' selected' : '';
      return '<option value="' + esc(valore) + '"' + sel + (o.disabilitata ? ' disabled' : '') + '>' + esc(o.testo) + '</option>';
    }).join('');
  }

  /*
   * Un campo con etichetta. o = { nome, etichetta, tipo, valore, opzioni, obbligatorio,
   * aiuto, segnaposto, cambia, lista, autofocus, attributi }.
   */
  function campo(o) {
    contatore++;
    var id = 'campo-' + contatore;
    var attr = ' name="' + esc(o.nome) + '" id="' + id + '"' +
      (o.obbligatorio ? ' required' : '') +
      (o.cambia ? ' data-cambia="' + esc(o.cambia) + '"' : '') +
      (o.autofocus ? ' autofocus' : '') +
      (o.segnaposto ? ' placeholder="' + esc(o.segnaposto) + '"' : '') +
      (o.attributi || '');
    var valore = o.valore == null ? '' : o.valore;
    var controllo;
    switch (o.tipo) {
      case 'importo':
      case 'decimale':
        controllo = '<input type="text" inputmode="decimal" autocomplete="off" value="' + esc(valore) + '"' + attr + '>';
        break;
      case 'intero':
        controllo = '<input type="text" inputmode="numeric" autocomplete="off" value="' + esc(valore) + '"' + attr + '>';
        break;
      case 'data':
        controllo = '<input type="date" value="' + esc(valore) + '"' + attr + '>';
        break;
      case 'mese':
        controllo = '<input type="month" value="' + esc(valore) + '"' + (o.segnaposto ? '' : ' placeholder="AAAA-MM"') + attr + '>';
        break;
      case 'ora':
        controllo = '<input type="time" value="' + esc(valore) + '"' + attr + '>';
        break;
      case 'select':
        controllo = '<select' + attr + '>' + opzioni(o.opzioni || [], valore) + '</select>';
        break;
      case 'area':
        controllo = '<textarea' + attr + '>' + esc(valore) + '</textarea>';
        break;
      case 'spunta':
        return '<label class="campo-spunta"><input type="checkbox" value="1"' + (valore ? ' checked' : '') + attr + '> ' +
          esc(o.etichetta) + (o.aiuto ? ' <span class="aiuto tenue">' + esc(o.aiuto) + '</span>' : '') + '</label>';
      default:
        controllo = '<input type="text" value="' + esc(valore) + '"' + (o.lista ? ' list="' + esc(o.lista) + '"' : '') + attr + '>';
    }
    return '<label class="campo" for="' + id + '"><span>' + esc(o.etichetta) +
      (o.aiuto ? ' <span class="aiuto">' + esc(o.aiuto) + '</span>' : '') + '</span>' + controllo + '</label>';
  }

  // Scelta a pulsanti affiancati (es. Uscita / Entrata).
  function segmentato(nome, voci, valore, cambia) {
    return '<div class="segmentato" role="radiogroup">' + voci.map(function (v) {
      return '<label><input type="radio" name="' + esc(nome) + '" value="' + esc(v.valore) + '"' +
        (String(v.valore) === String(valore) ? ' checked' : '') + (cambia ? ' data-cambia="' + esc(cambia) + '"' : '') +
        '><span>' + esc(v.testo) + '</span></label>';
    }).join('') + '</div>';
  }

  function datalist(id, valori) {
    return '<datalist id="' + esc(id) + '">' + valori.map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist>';
  }

  // Valori di un modulo: le caselle di spunta diventano true/false.
  function leggiModulo(form) {
    var valori = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) { return; }
      if (el.type === 'checkbox') { valori[el.name] = el.checked; return; }
      if (el.type === 'radio') { if (el.checked) { valori[el.name] = el.value; } return; }
      valori[el.name] = el.value;
    });
    return valori;
  }

  function erroreModulo(form, testo) {
    var box = form.querySelector('.errore-modulo');
    if (box) {
      box.textContent = testo || '';
      if (testo) { box.scrollIntoView({ block: 'nearest' }); }
    } else if (testo) {
      messaggio(testo, { tipo: 'errore' });
    }
  }

  // --- Pezzi ricorrenti delle schermate ---

  function schedeNav(base, voci, attiva) {
    return '<nav class="schede-nav" aria-label="Schede">' + voci.map(function (v) {
      return '<a href="#/' + base + '/' + v.id + '"' + (v.id === attiva ? ' class="attiva" aria-current="page"' : '') + '>' + esc(v.testo) + '</a>';
    }).join('') + '</nav>';
  }

  function vuoto(testo, azioneHtml) {
    return '<div class="vuoto"><p>' + esc(testo) + '</p>' + (azioneHtml || '') + '</div>';
  }

  function barra(frazione) {
    if (frazione == null) { return ''; }
    var pct = Math.max(0, Math.min(100, Math.round(frazione * 100)));
    var classe = frazione > 1 ? 'oltre' : (frazione > 0.85 ? 'vicino' : '');
    return '<div class="barra" aria-hidden="true"><div class="' + classe + '" style="width:' + pct + '%"></div></div>';
  }

  function variazioneHtml(v) {
    if (v == null) { return '<span class="tenue">nessun confronto</span>'; }
    var classe = v > 0 ? 'su' : (v < 0 ? 'giu' : '');
    return '<span class="' + classe + '">' + esc(I.formattaPercentuale(v, true)) + '</span>';
  }

  function distintivo(testo, classe) {
    return '<span class="distintivo ' + (classe || '') + '">' + esc(testo) + '</span>';
  }

  var api = {
    esc: esc,
    euro: euro,
    data: data,
    ICONE: ICONE,
    apriModale: apriModale,
    chiudiModale: chiudiModale,
    chiudiTutte: chiudiTutte,
    modaleAperta: modaleAperta,
    conferma: conferma,
    messaggio: messaggio,
    scarica: scarica,
    scegliFile: scegliFile,
    leggiFile: leggiFile,
    opzioni: opzioni,
    campo: campo,
    segmentato: segmentato,
    datalist: datalist,
    leggiModulo: leggiModulo,
    erroreModulo: erroreModulo,
    schedeNav: schedeNav,
    vuoto: vuoto,
    barra: barra,
    variazioneHtml: variazioneHtml,
    distintivo: distintivo
  };

  GC.ui = api;
})(typeof window !== 'undefined' ? window : globalThis);
