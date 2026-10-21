/*
 * Gestionale casa — Energia e fotovoltaico: numeri del mese e dell'anno con la spiegazione,
 * grafici, tabella dei dati mensili, importazione CSV guidata, impostazioni dell'impianto.
 * #/energia/mese?mese=AAAA-MM | anno | grafici | dati | importa
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
  var E = GC.energia;
  var IE = GC.importaEnergia;
  var G = GC.grafici;
  var stato = GC.stato;

  var SCHEDE = [
    { id: 'mese', testo: 'Mese' },
    { id: 'anno', testo: 'Anno' },
    { id: 'grafici', testo: 'Grafici' },
    { id: 'dati', testo: 'Dati' },
    { id: 'importa', testo: 'Importa CSV' }
  ];
  var MANCANTE = '<span class="mancante">dato mancante</span>';

  var meseScelto = null;
  var annoScelto = null;
  var imp = null; // stato dell'importazione guidata

  function archivio() { return stato.archivio; }

  function en(wh) { return wh == null ? MANCANTE : esc(I.formattaEnergia(wh)); }
  function pc(x) { return x == null ? MANCANTE : esc(I.formattaPercentuale(x)); }
  function eu(c) { return c == null ? MANCANTE : ui.euro(c); }

  function voce(etichetta, valore, formula, spiegazione) {
    return '<div class="numero"><div class="etichetta">' + esc(etichetta) + '</div><div class="valore">' + valore + '</div>' +
      (formula ? '<div class="nota">' + esc(formula) + '</div>' : '') + '<div class="spiegazione">' + esc(spiegazione) + '</div></div>';
  }

  function testoCosto(costo) {
    if (costo.fonte === 'bollette') {
      return 'Costo variabile usato: ' + I.formattaPrezzoKWh(costo.valore) + ', ricavato da ' + costo.numeroBollette +
        (costo.numeroBollette === 1 ? ' bolletta' : ' bollette') + ' della luce con quota fissa.';
    }
    if (costo.fonte === 'impostazioni') {
      return 'Costo variabile usato: ' + I.formattaPrezzoKWh(costo.valore) + ', il valore di riserva delle Impostazioni (nessuna bolletta della luce con quota fissa).';
    }
    return 'Manca il costo variabile del kWh: inserisci la quota fissa nelle bollette della luce o un valore di riserva in Impostazioni › Impianto.';
  }

  // I numeri (mese o anno) con le frasi che li spiegano.
  function numeri(valori, c, costoTesto) {
    var h = '<div class="numeri">' +
      voce('Energia prodotta', en(valori.prodottaWh), '', 'Quanta energia hanno prodotto i pannelli.') +
      voce('Immessa in rete', en(valori.immessaWh), '', 'La parte della produzione non usata in casa e ceduta alla rete.') +
      voce('Prelevata dalla rete', en(valori.prelevataWh), '', 'L\'energia comprata dalla rete quando i pannelli non bastavano.') +
      voce('Autoconsumo', en(c.autoconsumoWh), 'prodotta − immessa', 'L\'energia dei pannelli usata in casa, anche passando dalla batteria.') +
      voce('Consumo della casa', en(c.consumoCasaWh), 'autoconsumo + prelevata', 'Tutta l\'energia consumata in casa.') +
      voce('Quota autoconsumata', pc(c.quotaAutoconsumata), 'autoconsumo ÷ prodotta', 'Quanta parte della produzione hai usato tu invece di cederla alla rete.') +
      voce('Autosufficienza', pc(c.autosufficienza), 'autoconsumo ÷ consumo della casa', 'Quanta parte dei consumi della casa è stata coperta dai pannelli.') +
      voce('Risparmio in bolletta', eu(c.risparmioCent), 'autoconsumo × costo variabile del kWh', 'Quanto avresti pagato in più comprando dalla rete l\'energia che hai autoconsumato.') +
      voce('Ricavi GSE', ui.euro(c.ricaviGseCent), 'entrate registrate', 'Le entrate inserite in Energia › Ricavi GSE, copiate dagli estratti del GSE.') +
      voce('Beneficio', eu(c.beneficioCent), 'risparmio + ricavi GSE', 'Quanto ti ha reso l\'impianto.') +
      '</div>';
    h += '<p class="tenue" style="margin-top:10px">' + esc(costoTesto) + '</p>';
    var extra = [];
    if (valori.consumoWh != null) { extra.push(voce('Consumo misurato dall\'inverter', en(valori.consumoWh), '', 'Il consumo come lo misura l\'inverter: può differire da quello calcolato.')); }
    if (valori.batteriaCaricaWh != null) { extra.push(voce('Batteria: carica', en(valori.batteriaCaricaWh), '', 'Energia entrata nella batteria.')); }
    if (valori.batteriaScaricaWh != null) { extra.push(voce('Batteria: scarica', en(valori.batteriaScaricaWh), '', 'Energia uscita dalla batteria verso la casa.')); }
    if (extra.length) { h += '<div class="numeri" style="margin-top:10px">' + extra.join('') + '</div>'; }
    return h;
  }

  // --- Mese ---

  function renderMese(rotta) {
    var oggi = stato.oggi();
    if (rotta.parametri.mese && D.meseValido(rotta.parametri.mese)) { meseScelto = rotta.parametri.mese; }
    if (!meseScelto) { meseScelto = ultimoMeseConDati(oggi) || D.mese(oggi); }
    var r = E.riepilogoMese(archivio(), meseScelto);
    var soglia = archivio().impostazioni.soglie.produzioneMinPct;
    var gse = M.coppiaPerRuolo(archivio().collezioni.categorie, 'gse');
    var h = '<div class="scheda"><div class="selettore-mese">' +
      '<button type="button" class="pulsante secondario" data-azione="energia-mese" data-delta="-1" aria-label="Mese precedente">‹</button>' +
      '<strong>' + esc(D.formattaMese(meseScelto)) + '</strong>' +
      '<button type="button" class="pulsante secondario" data-azione="energia-mese" data-delta="1" aria-label="Mese successivo">›</button></div>';
    if (!r.dati) {
      h += '<div class="attenzione-box">Nessun dato per questo mese: importa il CSV dell\'inverter o inseriscilo a mano nella scheda Dati.</div>';
    } else if (!r.dati.completo) {
      h += '<div class="nota-box">Dati di ' + r.dati.giorni + ' giorni su ' + r.dati.giorniNelMese + ': il mese è incompleto.</div>';
    }
    if (r.attesaWh != null && r.valori.prodottaWh != null) {
      var quota = r.valori.prodottaWh / r.attesaWh;
      var bassa = r.dati && r.dati.completo && r.valori.prodottaWh * 100 < r.attesaWh * soglia;
      h += '<div class="' + (bassa ? 'attenzione-box' : 'nota-box') + '">Produzione attesa nel mese: ' + esc(I.formattaEnergia(r.attesaWh)) + '. ' +
        (r.dati.completo ? 'Prodotto il ' : 'Finora prodotto il ') + esc(I.formattaPercentuale(quota)) + (bassa ? ', sotto la soglia del ' + soglia + '%.' : '.') + '</div>';
    }
    h += numeri(r.valori, r.calcoli, testoCosto(r.costo));
    h += '<div class="pulsanti"><button type="button" class="pulsante secondario piccolo" data-azione="energia-modifica" data-mese="' + esc(meseScelto) + '">Modifica i dati del mese</button>' +
      '<button type="button" class="pulsante secondario piccolo" data-azione="movimento-nuovo" data-verso="entrata" data-categoria-id="' + esc(gse.categoriaId || '') +
      '" data-sottocategoria-id="' + esc(gse.sottocategoriaId || '') + '" data-competenza="' + esc(meseScelto) + '" data-controparte="GSE">+ Ricavo GSE</button></div>';
    return h + '</div>';
  }

  function ultimoMeseConDati(oggi) {
    var mesi = E.mesiConDati(archivio()).filter(function (m) { return m <= D.mese(oggi); });
    return mesi.length ? mesi[mesi.length - 1] : null;
  }

  GC.azioni['energia-mese'] = function (d) { meseScelto = D.spostaMese(meseScelto, Number(d.delta)); GC.app.vai('energia/mese?mese=' + meseScelto); };

  // --- Anno ---

  function renderAnno() {
    var oggi = stato.oggi();
    if (!annoScelto) { annoScelto = Number(oggi.slice(0, 4)); }
    var fine = Math.min(12, annoScelto === Number(oggi.slice(0, 4)) ? Number(oggi.slice(5, 7)) : 12);
    var mesi = annoScelto > Number(oggi.slice(0, 4)) ? [] : D.elencoMesi(annoScelto + '-01', annoScelto + '-' + String(fine).padStart(2, '0'));
    var r = E.riepilogoPeriodo(archivio(), mesi);
    var h = '<div class="scheda"><div class="selettore-mese">' +
      '<button type="button" class="pulsante secondario" data-azione="energia-anno" data-delta="-1" aria-label="Anno precedente">‹</button>' +
      '<strong>' + annoScelto + '</strong>' +
      '<button type="button" class="pulsante secondario" data-azione="energia-anno" data-delta="1" aria-label="Anno successivo">›</button></div>';
    if (r.mesiMancanti || r.mesiParziali) {
      h += '<div class="nota-box">' + (r.mesiMancanti ? r.mesiMancanti + ' mesi senza dati' : '') + (r.mesiMancanti && r.mesiParziali ? ', ' : '') +
        (r.mesiParziali ? r.mesiParziali + ' mesi incompleti' : '') + ': i totali comprendono solo i dati presenti.</div>';
    }
    h += numeri(r.valori, r.calcoli, 'Il risparmio somma i mesi, ognuno con il proprio costo del kWh.');
    return h + '</div>';
  }

  GC.azioni['energia-anno'] = function (d) { annoScelto += Number(d.delta); GC.app.aggiorna(); };

  // --- Grafici ---

  function renderGrafici() {
    var oggi = stato.oggi();
    var corrente = D.mese(oggi);
    var mesi = D.elencoMesi(D.spostaMese(corrente, -13), corrente);
    var riep = mesi.map(function (m) { return E.riepilogoMese(archivio(), m); });
    var etichette = mesi.map(D.formattaMeseBreve);
    var kwh = function (v) { return I.raggruppa(Math.round(v / 1000)); };
    var h = '<div class="scheda"><h2>Produzione e consumo per mese (kWh)</h2><div class="grafico">' + G.barre({
      titolo: 'Produzione e consumo della casa per mese',
      etichette: etichette,
      serie: [
        { nome: 'Prodotta', classe: 'serie-1', valori: riep.map(function (r) { return r.valori.prodottaWh; }) },
        { nome: 'Consumo della casa', classe: 'serie-2', valori: riep.map(function (r) { return r.calcoli.consumoCasaWh; }) }
      ],
      formato: kwh,
      formatoValore: function (v) { return I.formattaEnergia(v); }
    }) + '</div><p class="tenue">"n.d." = dato mancante. Il mese in corso è parziale.</p></div>';

    var rientro = E.rientro(archivio(), oggi);
    h += '<div class="scheda"><h2>Rientro dell\'investimento (€)</h2>';
    if (!rientro.serie.length) {
      h += '<p class="tenue">Servono la data di attivazione (Impostazioni › Impianto) o almeno un mese di dati.</p></div>';
      return h;
    }
    var euroAsse = function (v) { return I.raggruppa(Math.round(v / 100)); };
    h += '<div class="grafico">' + G.linee({
      titolo: 'Beneficio cumulato rispetto al costo dell\'impianto',
      etichette: rientro.serie.map(function (s) { return D.formattaMeseBreve(s.mese); }),
      serie: [{ nome: 'Beneficio cumulato', classe: 'linea-1', valori: rientro.serie.map(function (s) { return s.cumulatoCent; }) }],
      soglia: rientro.costoCent ? { valore: rientro.costoCent, nome: 'Costo dell\'impianto' } : null,
      formato: euroAsse,
      formatoValore: function (v) { return I.formattaImporto(v); }
    }) + '</div>';
    h += '<div class="numeri" style="margin-top:10px">' +
      voce('Beneficio cumulato', ui.euro(rientro.cumulatoCent), 'dal ' + D.formattaMese(rientro.inizio), 'Risparmio in bolletta più ricavi GSE dall\'attivazione.') +
      voce('Costo dell\'impianto', rientro.costoCent ? ui.euro(rientro.costoCent) : MANCANTE, 'Impostazioni › Impianto', 'Quanto è costato l\'impianto.') +
      voce('Recuperato', pc(rientro.percentuale), 'cumulato ÷ costo', 'Quanta parte del costo è già rientrata.') +
      voce('Rientro', rientro.raggiunto ? esc('raggiunto a ' + D.formattaMese(rientro.raggiunto)) : (rientro.stimato ? esc('stimato a ' + D.formattaMese(rientro.stimato)) : MANCANTE),
        rientro.mediaMensileCent != null ? 'media ' + I.formattaImporto(rientro.mediaMensileCent) + ' al mese' : '',
        rientro.raggiunto ? 'Il beneficio cumulato ha superato il costo.' : 'Stima con la media del beneficio degli ultimi 12 mesi completi (ne servono almeno 3).') +
      '</div>';
    if (rientro.mesiMancanti) {
      h += '<p class="tenue">' + rientro.mesiMancanti + ' mesi senza dati o senza costo del kWh: per quei mesi è contato solo l\'eventuale ricavo GSE, quindi il beneficio è sottostimato.</p>';
    }
    return h + '</div>';
  }

  // --- Dati mensili ---

  function renderDati() {
    var oggi = stato.oggi();
    var conDati = E.mesiConDati(archivio());
    var attivazione = archivio().impostazioni.impianto.dataAttivazione;
    var inizio = [attivazione ? D.mese(attivazione) : null, conDati[0] || null].filter(Boolean).sort()[0] || D.spostaMese(D.mese(oggi), -11);
    var fine = [D.mese(oggi), conDati[conDati.length - 1] || D.mese(oggi)].sort()[1];
    var mesi = D.elencoMesi(inizio, fine).reverse();
    var h = '<div class="scheda"><div class="intestazione"><h2>Dati per mese</h2>' +
      '<button type="button" class="pulsante piccolo" data-azione="energia-modifica">+ Inserisci un mese</button></div>' +
      '<p class="tenue">Tocca un mese per inserire o correggere i valori a mano. I dati importati per giorno sono sommati per mese.</p>' +
      '<div class="tabella-scorri"><table class="tabella"><thead><tr><th>Mese</th><th>Prodotta</th><th>Immessa</th><th>Prelevata</th><th>Consumo casa</th><th>Origine</th></tr></thead><tbody>';
    mesi.forEach(function (m) {
      var r = E.riepilogoMese(archivio(), m);
      var origine = !r.dati ? '<span class="mancante">mancante</span>' : (r.dati.origine === 'mensile' ? 'mensile' : r.dati.giorni + '/' + r.dati.giorniNelMese + ' gg');
      var cella = function (v) { return v == null ? '<span class="mancante">n.d.</span>' : esc(I.formattaEnergia(v)); };
      h += '<tr class="cliccabile" data-azione="energia-modifica" data-mese="' + m + '"><td>' + esc(D.formattaMeseBreve(m)) + '</td><td>' + cella(r.valori.prodottaWh) +
        '</td><td>' + cella(r.valori.immessaWh) + '</td><td>' + cella(r.valori.prelevataWh) + '</td><td>' + cella(r.calcoli.consumoCasaWh) + '</td><td>' + origine + '</td></tr>';
    });
    return h + '</tbody></table></div></div>';
  }

  GC.azioni['energia-modifica'] = function (d) {
    var mese = d.mese || '';
    var dati = mese ? E.datiMese(archivio(), mese) : null;
    var v = dati ? dati.valori : {};
    var campi = E.CAMPI.map(function (c) {
      return ui.campo({ nome: c, etichetta: E.NOMI_CAMPI[c] + ' (kWh)', tipo: 'decimale', valore: I.energiaPerCampo(v[c]) });
    });
    ui.apriModale({
      titolo: mese ? 'Dati di ' + D.formattaMese(mese) : 'Inserisci un mese',
      corpo: '<form id="modulo-energia" data-modulo="energia" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
        (mese ? '<input type="hidden" name="mese" value="' + esc(mese) + '">' : ui.campo({ nome: 'mese', etichetta: 'Mese', tipo: 'mese', valore: D.mese(stato.oggi()) })) +
        (dati && dati.origine === 'giornaliero' ? '<div class="nota-box">Questo mese ha ' + dati.giorni + ' giorni importati: salvando, verranno sostituiti da questi valori mensili.</div>' : '') +
        '<div class="due-colonne">' + campi.slice(0, 2).join('') + '</div><div class="due-colonne">' + campi.slice(2, 4).join('') + '</div>' +
        '<div class="due-colonne">' + campi.slice(4).join('') + '</div>' +
        '<p class="tenue">Lascia vuoto un campo se il dato manca: verrà mostrato come "dato mancante", non come zero.</p></form>',
      piede: (dati ? '<button type="button" class="pulsante leggero sinistra" data-azione="energia-elimina" data-mese="' + esc(mese) + '">Elimina i dati</button>' : '') +
        '<button type="button" class="pulsante secondario" data-azione="chiudi-modale">Annulla</button>' +
        '<button type="submit" class="pulsante" form="modulo-energia">Salva</button>'
    });
  };

  function togliMese(a, mese, ora) {
    return A.eliminaDove(a, 'energia', function (e) { return e.periodo === mese || e.periodo.slice(0, 8) === mese + '-'; }, ora);
  }

  GC.moduli.energia = function (v, form) {
    stato.applica(function (a) {
      var mese = D.leggiMese(v.mese);
      if (!mese) { throw new Error('Scegli il mese.'); }
      var valori = {};
      E.CAMPI.forEach(function (c) {
        var t = (v[c] || '').trim();
        if (!t) { valori[c] = null; return; }
        var n = I.leggiEnergiaKWh(t);
        if (n == null) { throw new Error(E.NOMI_CAMPI[c] + ': scrivi un numero in kWh, ad esempio 24,3.'); }
        valori[c] = n;
      });
      var errori = E.validaValori(valori);
      if (errori.length) { throw new Error(errori.join(' ')); }
      var ora = stato.ora();
      a = togliMese(a, mese, ora);
      if (E.CAMPI.every(function (c) { return valori[c] == null; })) { return a; }
      return A.inserisci(a, 'energia', Object.assign({ periodo: mese, origine: 'manuale' }, valori), ora).archivio;
    }, { form: form, messaggio: 'Dati del mese salvati.' });
  };

  GC.azioni['energia-elimina'] = function (d) {
    ui.conferma('Eliminare tutti i dati dell\'energia di ' + D.formattaMese(d.mese) + '?', { titolo: 'Eliminare?', ok: 'Elimina', pericolo: true }).then(function (si) {
      if (!si) { return; }
      ui.chiudiModale();
      stato.applica(function (a) { return togliMese(a, d.mese, stato.ora()); }, { messaggio: 'Dati eliminati.' });
    });
  };

  // --- Importazione CSV guidata ---

  var NOMI_SEPARATORI = { ';': 'Punto e virgola ( ; )', ',': 'Virgola ( , )', '\t': 'Tabulazione' };

  GC.azioni['importa-scegli'] = function () {
    ui.scegliFile('.csv,.txt,text/csv,text/plain').then(function (file) {
      if (!file) { return null; }
      return ui.leggiFile(file).then(function (testo) { iniziaImportazione(file.name, testo); });
    }).catch(function (e) { ui.messaggio(e.message, { tipo: 'errore' }); });
  };

  function iniziaImportazione(nomeFile, testo) {
    var profilo = archivio().impostazioni.profiloCsvEnergia;
    var analisi = IE.analizza(testo);
    if (IE.profiloAdatto(profilo, analisi)) {
      // Dal profilo si riprendono colonne e unità; separatore e decimali si riconoscono da ogni file,
      // ma se il separatore è lo stesso dell'ultima volta vale anche il decimale scelto allora.
      if (profilo.separatore === analisi.separatore && profilo.decimale) {
        analisi = IE.analizza(testo, { separatore: analisi.separatore, decimale: profilo.decimale, rigaIntestazione: analisi.rigaIntestazione });
      }
      imp = { nomeFile: nomeFile, testo: testo, analisi: analisi, scelte: { colonne: profilo.colonne, unita: profilo.unita, granularita: profilo.granularita || 'auto' }, daProfilo: true };
      if (prepara()) { imp.passo = 'anteprima'; } else { imp.passo = 'abbinamento'; }
    } else {
      var s = IE.suggerisci(analisi.intestazioni);
      imp = { nomeFile: nomeFile, testo: testo, analisi: analisi, scelte: { colonne: s.colonne, unita: s.unita, granularita: 'auto' }, passo: 'abbinamento' };
    }
    if (!analisi.righe.length) { imp = null; ui.messaggio('Il file non contiene righe di dati.', { tipo: 'errore' }); return; }
    GC.app.vai('energia/importa');
    GC.app.aggiorna();
  }

  function prepara() {
    var r = IE.converti(imp.analisi, IE.creaProfilo(imp.analisi, imp.scelte));
    if (r.errore) { imp.errore = r.errore; return false; }
    if (!Object.keys(r.periodi).length) { imp.errore = 'Nessuna riga valida da importare: controlla le colonne e il formato.'; imp.risultato = r; return false; }
    imp.errore = null;
    imp.risultato = r;
    return true;
  }

  function renderImporta() {
    if (!imp) {
      var profilo = archivio().impostazioni.profiloCsvEnergia;
      return '<div class="scheda"><h2>Importa il CSV dell\'inverter</h2>' +
        '<p>Il programma legge file CSV con righe giornaliere (o più fitte, che somma per giorno) oppure mensili:</p>' +
        '<ul><li>separatore punto e virgola o virgola;</li><li>decimali con la virgola o con il punto;</li>' +
        '<li>date gg/mm/aaaa o AAAA-MM-GG (anche con l\'ora), mesi mm/aaaa o AAAA-MM;</li><li>valori in kWh o in Wh (energia, non potenza).</li></ul>' +
        '<p class="tenue">Se l\'app dell\'inverter esporta solo in Excel, apri il file in Excel e salvalo come "CSV". La prima volta scegli tu quali colonne usare; il programma lo ricorda.' +
        (profilo ? ' Abbinamento salvato per le colonne: ' + esc(Object.keys(profilo.colonne).map(function (k) { return profilo.colonne[k]; }).join(', ')) + '.' : '') + '</p>' +
        '<div class="pulsanti"><button type="button" class="pulsante" data-azione="importa-scegli">Scegli il file CSV…</button></div>' +
        '<p class="tenue">Il file viene letto nel browser: non viene inviato da nessuna parte. Si salvano solo i totali per giorno o per mese.</p></div>';
    }
    return imp.passo === 'anteprima' ? renderAnteprima() : renderAbbinamento();
  }

  function renderAbbinamento() {
    var an = imp.analisi;
    var opzColonne = [{ valore: '', testo: '— non presente —' }].concat(an.intestazioni.map(function (h) { return { valore: h, testo: h || '(senza nome)' }; }));
    var h = '<div class="scheda"><h2>Abbinamento delle colonne</h2><p>File: <strong>' + esc(imp.nomeFile) + '</strong></p>' +
      (imp.errore ? '<div class="errore-modulo">' + esc(imp.errore) + '</div>' : '') +
      '<form id="modulo-abbinamento" data-modulo="importa-abbinamento" autocomplete="off">' +
      '<fieldset><legend>Formato del file (riconosciuto da solo)</legend><div class="due-colonne">' +
      ui.campo({ nome: 'separatore', etichetta: 'Separatore', tipo: 'select', valore: an.separatore, cambia: 'importa-formato',
        opzioni: Object.keys(NOMI_SEPARATORI).map(function (k) { return { valore: k, testo: NOMI_SEPARATORI[k] }; }) }) +
      ui.campo({ nome: 'decimale', etichetta: 'Decimali', tipo: 'select', valore: an.decimale, cambia: 'importa-formato',
        opzioni: [{ valore: ',', testo: 'Con la virgola (24,3)' }, { valore: '.', testo: 'Con il punto (24.3)' }] }) + '</div>' +
      '<div class="due-colonne">' + ui.campo({ nome: 'rigaIntestazione', etichetta: 'Riga delle intestazioni', tipo: 'select', valore: String(an.rigaIntestazione), cambia: 'importa-formato',
        opzioni: an.prime.slice(0, 10).map(function (r, i) { return { valore: String(i), testo: (i + 1) + ': ' + r.filter(Boolean).slice(0, 3).join(' | ').slice(0, 40) }; }) }) +
      ui.campo({ nome: 'granularita', etichetta: 'Righe', tipo: 'select', valore: imp.scelte.granularita || 'auto',
        opzioni: [{ valore: 'auto', testo: 'Riconosci da solo' }, { valore: 'giornaliera', testo: 'Giornaliere (o più fitte)' }, { valore: 'mensile', testo: 'Mensili' }] }) +
      '</div></fieldset><fieldset><legend>Quale colonna contiene…</legend>';
    IE.CAMPI.forEach(function (def) {
      var sel = ui.campo({ nome: 'col-' + def.campo, etichetta: def.nome + (def.obbligatorio ? ' *' : ''), tipo: 'select', valore: imp.scelte.colonne[def.campo] || '', opzioni: opzColonne });
      if (def.campo === 'data') { h += sel; return; }
      h += '<div class="due-colonne">' + sel + ui.campo({ nome: 'un-' + def.campo, etichetta: 'Unità', tipo: 'select', valore: imp.scelte.unita[def.campo] || 'kWh',
        opzioni: [{ valore: 'kWh', testo: 'kWh' }, { valore: 'Wh', testo: 'Wh' }] }) + '</div>';
    });
    h += '</fieldset></form>';
    h += '<p class="tenue">Prime righe del file:</p><div class="anteprima">' + esc(an.prime.slice(0, 8).map(function (r) { return r.join(an.separatore === '\t' ? '  ' : an.separatore); }).join('\n')) + '</div>';
    h += '<div class="pulsanti"><button type="button" class="pulsante secondario" data-azione="importa-annulla">Annulla</button>' +
      '<button type="submit" class="pulsante" form="modulo-abbinamento">Vai all\'anteprima</button></div></div>';
    return h;
  }

  function scelteDaModulo(v) {
    var colonne = {};
    var unita = {};
    IE.CAMPI.forEach(function (def) {
      if (v['col-' + def.campo]) { colonne[def.campo] = v['col-' + def.campo]; }
      if (def.campo !== 'data') { unita[def.campo] = v['un-' + def.campo] || 'kWh'; }
    });
    return { colonne: colonne, unita: unita, granularita: v.granularita || 'auto' };
  }

  GC.cambi['importa-formato'] = function (el) {
    var v = ui.leggiModulo(el.form);
    var opzioni = { separatore: v.separatore, rigaIntestazione: Number(v.rigaIntestazione) };
    if (el.name === 'decimale') { opzioni.decimale = v.decimale; }
    if (el.name === 'separatore') { opzioni.rigaIntestazione = null; }
    imp.analisi = IE.analizza(imp.testo, opzioni);
    var scelte = scelteDaModulo(v);
    var mancanoColonne = Object.keys(scelte.colonne).some(function (k) { return imp.analisi.intestazioni.indexOf(scelte.colonne[k]) < 0; });
    if (mancanoColonne || !Object.keys(scelte.colonne).length) {
      var s = IE.suggerisci(imp.analisi.intestazioni);
      scelte = { colonne: s.colonne, unita: s.unita, granularita: scelte.granularita };
    }
    imp.scelte = scelte;
    imp.errore = null;
    GC.app.aggiorna();
  };

  GC.moduli['importa-abbinamento'] = function (v) {
    imp.scelte = scelteDaModulo(v);
    imp.passo = prepara() ? 'anteprima' : 'abbinamento';
    GC.app.aggiorna();
  };

  function renderAnteprima() {
    var r = imp.risultato;
    var mesi = IE.totaliPerMese(r);
    var sost = IE.sostituzioni(archivio(), r);
    var campiPresenti = E.CAMPI.filter(function (c) { return imp.scelte.colonne[c]; });
    var h = '<div class="scheda"><h2>Anteprima dell\'importazione</h2><p>File: <strong>' + esc(imp.nomeFile) + '</strong>' +
      (imp.daProfilo ? ' <span class="tenue">(abbinamento salvato)</span>' : '') + '</p>' +
      '<dl class="dati"><dt>Righe lette</dt><dd>' + r.valide + '</dd><dt>Righe scartate</dt><dd>' + r.scartate.length + '</dd>' +
      '<dt>Dati</dt><dd>' + (r.granularita === 'mensile' ? 'mensili' : 'giornalieri') + ', ' + Object.keys(r.periodi).length + (r.granularita === 'mensile' ? ' mesi' : ' giorni') + '</dd>' +
      '<dt>Formato</dt><dd>' + esc(NOMI_SEPARATORI[imp.analisi.separatore]) + ', decimali con ' + (imp.analisi.decimale === ',' ? 'la virgola' : 'il punto') + '</dd></dl>';
    if (sost.giorni || sost.mesi.length) {
      h += '<div class="attenzione-box">Sostituisce dati già presenti: ' + [sost.giorni ? sost.giorni + ' giorni' : '', sost.mesi.length ? 'mesi inseriti a mano (' + sost.mesi.map(D.formattaMeseBreve).join(', ') + ')' : '']
        .filter(Boolean).join(' e ') + '. Reimportare lo stesso periodo non crea doppioni.</div>';
    }
    h += '<div class="tabella-scorri"><table class="tabella"><thead><tr><th>Mese</th>' + (r.granularita === 'mensile' ? '' : '<th>Giorni</th>') +
      campiPresenti.map(function (c) { return '<th>' + esc(E.NOMI_CAMPI[c].replace(' (dall\'inverter)', '')) + '</th>'; }).join('') + '</tr></thead><tbody>';
    Object.keys(mesi).sort().forEach(function (m) {
      h += '<tr><td>' + esc(D.formattaMeseBreve(m)) + '</td>' + (r.granularita === 'mensile' ? '' : '<td>' + mesi[m].giorni + '/' + D.giorniDelMese(m) + '</td>') +
        campiPresenti.map(function (c) { return '<td>' + (mesi[m][c] == null ? '<span class="mancante">n.d.</span>' : esc(I.formattaEnergia(mesi[m][c]))) + '</td>'; }).join('') + '</tr>';
    });
    h += '</tbody></table></div>';
    if (r.scartate.length) {
      h += '<details class="altri"><summary>Righe scartate (' + r.scartate.length + ')</summary><ul>' + r.scartate.slice(0, 20).map(function (s) {
        return '<li>Riga ' + s.riga + ': ' + esc(s.motivo) + '</li>';
      }).join('') + (r.scartate.length > 20 ? '<li>…</li>' : '') + '</ul><p class="tenue">Le righe di totale o di titolo vengono scartate da sole.</p></details>';
    }
    h += '<div class="pulsanti"><button type="button" class="pulsante secondario" data-azione="importa-annulla">Annulla</button>' +
      '<button type="button" class="pulsante secondario" data-azione="importa-cambia">Cambia abbinamento</button>' +
      '<button type="button" class="pulsante" data-azione="importa-conferma-energia">Importa</button></div></div>';
    return h;
  }

  GC.azioni['importa-annulla'] = function () { imp = null; GC.app.aggiorna(); };
  GC.azioni['importa-cambia'] = function () { imp.passo = 'abbinamento'; imp.daProfilo = false; GC.app.aggiorna(); };

  GC.azioni['importa-conferma-energia'] = function () {
    var r = imp.risultato;
    var profilo = IE.creaProfilo(imp.analisi, imp.scelte);
    var n = Object.keys(r.periodi).length;
    var testo = n + (r.granularita === 'mensile' ? ' mesi importati.' : ' giorni importati.');
    var ok = stato.applica(function (a) {
      a = IE.applica(a, r, stato.ora());
      return A.conImpostazioni(a, { profiloCsvEnergia: profilo }, stato.ora());
    }, { messaggio: testo });
    if (ok) {
      var primo = Object.keys(r.periodi).sort().pop();
      imp = null;
      meseScelto = primo.slice(0, 7);
      GC.app.vai('energia/dati');
    }
  };

  // --- Impostazioni dell'impianto (scheda di Impostazioni) ---

  function impostazioniImpianto() {
    var imp0 = archivio().impostazioni.impianto;
    var profilo = archivio().impostazioni.profiloCsvEnergia;
    var h = '<div class="scheda"><h2>Impianto fotovoltaico</h2>' +
      '<form id="modulo-impianto" data-modulo="impianto" autocomplete="off" novalidate><div class="errore-modulo"></div>' +
      '<div class="due-colonne">' + ui.campo({ nome: 'potenza', etichetta: 'Potenza (kWp)', tipo: 'decimale', valore: I.energiaPerCampo(imp0.potenzaW) }) +
      ui.campo({ nome: 'dataAttivazione', etichetta: 'Data di attivazione', tipo: 'data', valore: imp0.dataAttivazione || '' }) + '</div>' +
      ui.campo({ nome: 'batteria', etichetta: 'Con batteria di accumulo', tipo: 'spunta', valore: imp0.batteria }) +
      '<div class="due-colonne">' + ui.campo({ nome: 'capacita', etichetta: 'Capacità batteria (kWh)', tipo: 'decimale', valore: I.energiaPerCampo(imp0.capacitaBatteriaWh) }) +
      ui.campo({ nome: 'costo', etichetta: 'Costo dell\'impianto (€)', tipo: 'importo', valore: I.importoPerCampo(imp0.costoCent) }) + '</div>' +
      ui.campo({ nome: 'regimeGse', etichetta: 'Regime con il GSE', tipo: 'select', valore: imp0.regimeGse,
        opzioni: S.REGIMI_GSE.map(function (r) { return { valore: r.valore, testo: r.nome }; }) }) +
      '<p class="tenue">Il regime è un promemoria: le regole di calcolo del GSE cambiano e non sono nel programma. I ricavi li inserisci tu dagli estratti, come entrate in Energia › Ricavi GSE.</p>' +
      ui.campo({ nome: 'costoKWh', etichetta: 'Costo variabile del kWh di riserva (€/kWh)', tipo: 'decimale', valore: I.prezzoPerCampo(imp0.costoKWhRiserva),
        aiuto: 'usato quando non ci sono bollette della luce con quota fissa' }) +
      '<fieldset><legend>Produzione attesa per mese (kWh)</legend><p class="tenue">Ad esempio dal preventivo dell\'installatore. Serve per l\'avviso di produzione bassa.</p><div class="due-colonne">';
    for (var i = 0; i < 12; i++) {
      h += ui.campo({ nome: 'attesa-' + i, etichetta: D.nomeMese(i + 1).charAt(0).toUpperCase() + D.nomeMese(i + 1).slice(1), tipo: 'decimale',
        valore: I.energiaPerCampo(imp0.produzioneAttesaWh[i]) });
    }
    h += '</div></fieldset><div class="pulsanti"><button type="submit" class="pulsante">Salva l\'impianto</button></div></form></div>';
    h += '<div class="scheda"><h2>Importazione CSV dell\'inverter</h2>' + (profilo ?
      '<p>Abbinamento salvato per le colonne: <strong>' + esc(Object.keys(profilo.colonne).map(function (k) { return profilo.colonne[k]; }).join(', ')) + '</strong>.</p>' +
      '<div class="pulsanti"><button type="button" class="pulsante secondario" data-azione="profilo-csv-azzera">Dimentica l\'abbinamento</button></div>' :
      '<p class="tenue">Nessun abbinamento salvato: verrà chiesto alla prima importazione.</p>') + '</div>';
    return h;
  }

  GC.moduli.impianto = function (v, form) {
    stato.applica(function (a) {
      var leggi = function (testo, fn, nome) {
        var t = (testo || '').trim();
        if (!t) { return null; }
        var n = fn(t);
        if (n == null) { throw new Error(nome + ': valore non valido.'); }
        return n;
      };
      var attese = [];
      for (var i = 0; i < 12; i++) { attese.push(leggi(v['attesa-' + i], I.leggiEnergiaKWh, 'Produzione attesa di ' + D.nomeMese(i + 1))); }
      var impianto = {
        potenzaW: leggi(v.potenza, I.leggiEnergiaKWh, 'Potenza'),
        batteria: !!v.batteria,
        capacitaBatteriaWh: leggi(v.capacita, I.leggiEnergiaKWh, 'Capacità della batteria'),
        regimeGse: v.regimeGse,
        dataAttivazione: v.dataAttivazione ? D.leggiData(v.dataAttivazione) : null,
        costoCent: leggi(v.costo, function (t) { return I.leggiImporto(t); }, 'Costo dell\'impianto'),
        produzioneAttesaWh: attese,
        costoKWhRiserva: leggi(v.costoKWh, I.leggiPrezzoKWh, 'Costo del kWh')
      };
      return A.conImpostazioni(a, { impianto: impianto }, stato.ora());
    }, { form: form, chiudi: false, messaggio: 'Dati dell\'impianto salvati.' });
  };

  GC.azioni['profilo-csv-azzera'] = function () {
    ui.conferma('Alla prossima importazione ti verrà chiesto di nuovo quali colonne usare.', { titolo: 'Dimenticare l\'abbinamento?', ok: 'Dimentica' }).then(function (si) {
      if (si) { stato.applica(function (a) { return A.conImpostazioni(a, { profiloCsvEnergia: null }, stato.ora()); }); }
    });
  };

  // --- Riquadro della Home ---

  function riepilogoEnergiaHome(a, oggi) {
    var corrente = D.mese(oggi);
    var mese = E.datiMese(a, corrente) ? corrente : ultimoMeseConDati(oggi);
    var h = '<div class="scheda"><div class="intestazione"><h2>Fotovoltaico</h2><a href="#/energia/mese' + (mese ? '?mese=' + mese : '') + '">Dettagli</a></div>';
    if (!mese) {
      return h + '<p class="tenue">Nessun dato dell\'energia.</p><div class="pulsanti"><a class="pulsante piccolo" href="#/energia/importa">Importa il CSV dell\'inverter</a></div></div>';
    }
    var r = E.riepilogoMese(a, mese);
    var rientro = E.rientro(a, oggi);
    h += '<p class="tenue" style="text-transform:none">' + esc(D.formattaMese(mese)) + (r.dati && !r.dati.completo ? ' (dati di ' + r.dati.giorni + ' giorni su ' + r.dati.giorniNelMese + ')' : '') + '</p>' +
      '<div class="numeri">' +
      voce('Prodotta', en(r.valori.prodottaWh), r.attesaWh != null && r.valori.prodottaWh != null && r.dati && r.dati.completo ?
        I.formattaPercentuale(r.valori.prodottaWh / r.attesaWh) + ' dell\'attesa' : (r.dati && !r.dati.completo ? 'mese non completo' : ''), 'Energia dai pannelli.') +
      voce('Autosufficienza', pc(r.calcoli.autosufficienza), '', 'Consumi coperti dai pannelli.') +
      voce('Beneficio', eu(r.calcoli.beneficioCent), '', 'Risparmio in bolletta + ricavi GSE.') +
      voce('Rientro', rientro.percentuale != null ? pc(rientro.percentuale) : MANCANTE, rientro.raggiunto ? 'raggiunto' : (rientro.stimato ? 'stimato a ' + D.formattaMeseBreve(rientro.stimato) : ''), 'Parte del costo dell\'impianto già recuperata.') +
      '</div></div>';
    return h;
  }

  // --- Schermata ---

  GC.viste.energia = {
    titolo: 'Energia',
    render: function (rotta) {
      var scheda = rotta.parti[0] || 'mese';
      var h = ui.schedeNav('energia', SCHEDE, scheda);
      if (scheda === 'anno') { return h + renderAnno(); }
      if (scheda === 'grafici') { return h + renderGrafici(); }
      if (scheda === 'dati') { return h + renderDati(); }
      if (scheda === 'importa') { return h + renderImporta(); }
      return h + renderMese(rotta);
    }
  };

  GC.forme.impostazioniImpianto = impostazioniImpianto;
  GC.forme.riepilogoEnergiaHome = riepilogoEnergiaHome;
})(typeof window !== 'undefined' ? window : globalThis);
