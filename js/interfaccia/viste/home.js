/*
 * Gestionale casa — Home (dashboard): speso del mese e dell'anno, previsti in arrivo,
 * impegni, avvisi dei controlli, fotovoltaico del mese, ultimo backup.
 * Le parti delle altre sezioni compaiono quando i rispettivi moduli sono caricati.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var ui = GC.ui;
  var esc = ui.esc;
  var D = GC.date;
  var A = GC.archivio;
  var M = GC.movimenti;
  var stato = GC.stato;

  function benvenuto() {
    return '<div class="scheda"><h2>Benvenuto nel Gestionale casa</h2>' +
      '<p>L\'archivio è vuoto. Per provare ogni schermata puoi caricare 14 mesi di dati inventati, e cancellarli quando vuoi iniziare con i dati veri.</p>' +
      '<div class="pulsanti"><a class="pulsante" href="#/impostazioni/backup">Carica dati di prova</a>' +
      '<a class="pulsante secondario" href="#/impostazioni/famiglia">Imposta famiglia e conti</a></div>' +
      '<p class="tenue">I dati restano solo in questo browser: ricordati di fare un backup ogni tanto.</p></div>';
  }

  function numeroSpeso(etichetta, voce, nota) {
    return '<div class="numero"><div class="etichetta">' + esc(etichetta) + '</div>' +
      '<div class="valore">' + ui.euro(voce.attuale) + '</div>' +
      '<div class="nota">' + ui.variazioneHtml(voce.variazione) + ' rispetto a ' + ui.euro(voce.precedente) + '</div>' +
      '<div class="spiegazione">' + esc(nota) + '</div></div>';
  }

  function schedaSpeso(a, oggi) {
    var c = M.confrontoAnnoPrima(a.collezioni.movimenti, oggi);
    var giorno = D.formattaDataBreve(oggi);
    return '<div class="scheda"><div class="intestazione"><h2>Speso</h2><a href="#/movimenti/registro">Registro</a></div>' +
      '<div class="numeri">' +
      numeroSpeso('Questo mese', c.mese, 'Dal 1° al ' + giorno + ', confrontato con gli stessi giorni dell\'anno scorso.') +
      numeroSpeso('Quest\'anno', c.anno, 'Dal 1° gennaio al ' + giorno + ', confrontato con lo stesso periodo dell\'anno scorso.') +
      '</div></div>';
  }

  function schedaPrevisti(a, oggi) {
    var giorni = a.impostazioni.soglie.finestraGiorni;
    var previsti = M.previstiProssimi(a.collezioni.movimenti, oggi, giorni);
    var t = M.totali(previsti);
    var h = '<div class="scheda"><div class="intestazione"><h2>Previsti nei prossimi ' + esc(giorni) + ' giorni</h2>' +
      '<span><strong>' + ui.euro(t.previsto) + '</strong></span></div>';
    if (!previsti.length) { return h + '<p class="tenue">Nessun movimento previsto.</p></div>'; }
    h += '<ul class="elenco">' + previsti.slice(0, 8).map(function (m) { return GC.forme.rigaMovimento(m); }).join('') + '</ul>';
    if (previsti.length > 8) { h += '<p class="tenue">… e altri ' + (previsti.length - 8) + '.</p>'; }
    if (t.previstoEntrate) { h += '<p class="tenue">Entrate previste: ' + ui.euro(t.previstoEntrate) + '</p>'; }
    return h + '</div>';
  }

  function schedaImpegni(a, oggi) {
    if (!GC.impegni) { return ''; }
    var giorni = a.impostazioni.soglie.finestraGiorni;
    var voci = GC.impegni.elenco(a, oggi).filter(function (v) { return v.tipo !== 'pagamento'; });
    var viste = GC.impegni.viste(voci, oggi, giorni);
    var h = '<div class="scheda"><div class="intestazione"><h2>Impegni</h2><a href="#/impegni">Tutti</a></div>';
    if (!viste.scaduti.length && !viste.prossimi.length) { return h + '<p class="tenue">Nessun impegno scaduto o in arrivo.</p></div>'; }
    h += '<ul class="elenco">';
    viste.scaduti.slice(0, 5).forEach(function (v) { h += GC.forme.rigaImpegno(v, oggi); });
    viste.prossimi.slice(0, 6).forEach(function (v) { h += GC.forme.rigaImpegno(v, oggi); });
    h += '</ul>';
    var nascosti = Math.max(0, viste.scaduti.length - 5) + Math.max(0, viste.prossimi.length - 6);
    if (nascosti) { h += '<p class="tenue">… e altri ' + nascosti + ' nella sezione Impegni.</p>'; }
    return h + '</div>';
  }

  function schedaAvvisi(a, oggi) {
    var avvisi = GC.controlli.esegui(a, oggi);
    var h = '<div class="scheda avvisi"><div class="intestazione"><h2>Avvisi</h2>' +
      (avvisi.length ? ui.distintivo(String(avvisi.length), 'pericolo') : '') + '</div>';
    if (!avvisi.length) { return h + '<p class="tenue">Nessun avviso: tutto in ordine.</p></div>'; }
    GC.controlli.perTipo(avvisi).forEach(function (g) {
      h += '<details' + (g.avvisi.length <= 3 ? ' open' : '') + '><summary>' + esc(g.nome) +
        '<span class="conteggio">' + ui.distintivo(String(g.avvisi.length), g.avvisi[0].livello === 'alto' ? 'pericolo' : 'attenzione') + '</span></summary>';
      g.avvisi.forEach(function (av) {
        h += '<a class="avviso ' + esc(av.livello) + '" href="' + esc(av.rotta) + '"><span>' + esc(av.testo) + '</span></a>';
      });
      h += '</details>';
    });
    return h + '</div>';
  }

  function schedaEnergia(a, oggi) {
    if (!GC.forme.riepilogoEnergiaHome) { return ''; }
    return GC.forme.riepilogoEnergiaHome(a, oggi);
  }

  function schedaBackup(a) {
    var ultimo = a.meta.ultimoBackupIl;
    return '<div class="scheda"><div class="intestazione"><h2>Backup</h2>' +
      '<button type="button" class="pulsante piccolo" data-azione="esporta-backup">Fai backup ora</button></div>' +
      '<p>' + (ultimo ? 'Ultimo backup: <strong>' + esc(D.formattaDataOra(ultimo)) + '</strong>' : '<strong>Nessun backup fatto finora.</strong>') + '</p>' +
      '<p class="tenue">I dati sono solo in questo browser: il backup è un file da conservare altrove (es. Google Drive).</p></div>';
  }

  GC.viste.home = {
    titolo: 'Panoramica',
    render: function () {
      var a = stato.archivio;
      var oggi = stato.oggi();
      var h = '';
      if (A.eVuoto(a)) { h += benvenuto(); }
      h += '<div class="griglia due"><div>' + schedaSpeso(a, oggi) + schedaAvvisi(a, oggi) + schedaEnergia(a, oggi) + '</div>' +
        '<div>' + schedaImpegni(a, oggi) + schedaPrevisti(a, oggi) + schedaBackup(a) + '</div></div>';
      return h;
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
