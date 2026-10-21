/*
 * Gestionale casa — grafici SVG disegnati a mano (nessuna libreria esterna).
 * Un valore null viene mostrato come "dato mancante" (n.d.), mai come zero.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var esc = GC.ui.esc;

  var L = 640;      // larghezza del disegno, impostata a ogni grafico (o.larghezza)
  var SX = 48;
  var DX = 10;
  var SU = 12;
  var GIU = 30;

  function scala(massimo, minimo) {
    var max = massimo > 0 ? massimo : 1;
    var min = minimo < 0 ? minimo : 0;
    var grezzo = (max - min) / 4;
    var potenza = Math.pow(10, Math.floor(Math.log(grezzo) / Math.LN10));
    var n = grezzo / potenza;
    var passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * potenza;
    return { passo: passo, max: Math.ceil(max / passo) * passo, min: Math.floor(min / passo) * passo };
  }

  function griglia(s, altezza, formato) {
    var h = '';
    var y = function (v) { return SU + (altezza - SU - GIU) * (1 - (v - s.min) / (s.max - s.min)); };
    for (var v = s.min; v <= s.max + s.passo / 1000; v += s.passo) {
      var yy = y(v).toFixed(1);
      h += '<line class="asse" x1="' + SX + '" x2="' + (L - DX) + '" y1="' + yy + '" y2="' + yy + '"' + (v === 0 ? '' : ' stroke-dasharray="2 3"') + '/>';
      h += '<text x="' + (SX - 6) + '" y="' + (Number(yy) + 4) + '" text-anchor="end">' + esc(formato(v)) + '</text>';
    }
    return { html: h, y: y };
  }

  function etichetteX(etichette, larghezzaGruppo) {
    var ogni = Math.max(1, Math.ceil(etichette.length / Math.max(3, Math.floor((L - SX) / 56))));
    return etichette.map(function (e, i) {
      if (i % ogni !== 0) { return ''; }
      var x = SX + larghezzaGruppo * (i + 0.5);
      return '<text x="' + x.toFixed(1) + '" y="' + 0 + '" text-anchor="middle" class="etichetta-x">' + esc(e) + '</text>';
    }).join('');
  }

  /*
   * Barre affiancate per gruppo. o = { etichette, serie: [{ nome, classe, valori }], formato, formatoValore, altezza, titolo }
   */
  // Larghezza adatta allo schermo, così le scritte restano leggibili anche sul telefono.
  function larghezzaPredefinita() {
    var w = radice.innerWidth || 640;
    return Math.max(300, Math.min(760, w - (w >= 900 ? 300 : 56)));
  }

  function barre(o) {
    L = o.larghezza || larghezzaPredefinita();
    var altezza = o.altezza || 240;
    var tutti = [];
    o.serie.forEach(function (s) { s.valori.forEach(function (v) { if (v != null) { tutti.push(v); } }); });
    var s = scala(Math.max.apply(null, tutti.concat([0])), 0);
    var g = griglia(s, altezza, o.formato);
    var n = o.etichette.length;
    var gruppo = (L - SX - DX) / n;
    var larghezza = gruppo * 0.78 / o.serie.length;
    var base = g.y(0);
    var h = g.html;
    o.etichette.forEach(function (etichetta, i) {
      o.serie.forEach(function (serie, j) {
        var v = serie.valori[i];
        var x = SX + gruppo * i + gruppo * 0.11 + larghezza * j;
        if (v == null) {
          var alta = (altezza - SU - GIU) * 0.25;
          h += '<rect class="mancante-barra" x="' + x.toFixed(1) + '" y="' + (base - alta).toFixed(1) + '" width="' + Math.max(1, larghezza - 1).toFixed(1) +
            '" height="' + alta.toFixed(1) + '"><title>' + esc(etichetta + ' – ' + serie.nome + ': dato mancante') + '</title></rect>';
          h += '<text class="mancante-testo" x="' + (x + larghezza / 2).toFixed(1) + '" y="' + (base - alta - 3).toFixed(1) + '" text-anchor="middle">n.d.</text>';
          return;
        }
        var y = g.y(v);
        h += '<rect class="' + serie.classe + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, larghezza - 1).toFixed(1) +
          '" height="' + Math.max(0, base - y).toFixed(1) + '" rx="2"><title>' + esc(etichetta + ' – ' + serie.nome + ': ' + (o.formatoValore || o.formato)(v)) + '</title></rect>';
      });
    });
    h += '<g transform="translate(0,' + (altezza - 10) + ')">' + etichetteX(o.etichette, gruppo) + '</g>';
    return '<svg viewBox="0 0 ' + L + ' ' + altezza + '" role="img" aria-label="' + esc(o.titolo || 'Grafico') + '">' + h + '</svg>' + legenda(o.serie);
  }

  /*
   * Linee. o = { etichette, serie: [{ nome, classe, valori }], soglia: { valore, nome } | null, formato, altezza, titolo }
   * Dove il valore è null la linea si interrompe.
   */
  function linee(o) {
    L = o.larghezza || larghezzaPredefinita();
    var altezza = o.altezza || 240;
    var tutti = [];
    o.serie.forEach(function (s) { s.valori.forEach(function (v) { if (v != null) { tutti.push(v); } }); });
    if (o.soglia && o.soglia.valore != null) { tutti.push(o.soglia.valore); }
    var s = scala(Math.max.apply(null, tutti.concat([0])), Math.min.apply(null, tutti.concat([0])));
    var g = griglia(s, altezza, o.formato);
    var n = o.etichette.length;
    var gruppo = (L - SX - DX) / n;
    var h = g.html;
    if (o.soglia && o.soglia.valore != null) {
      var ys = g.y(o.soglia.valore).toFixed(1);
      h += '<line class="linea-2" x1="' + SX + '" x2="' + (L - DX) + '" y1="' + ys + '" y2="' + ys + '"><title>' + esc(o.soglia.nome + ': ' + o.formato(o.soglia.valore)) + '</title></line>';
    }
    o.serie.forEach(function (serie) {
      var tratti = [];
      var corrente = [];
      serie.valori.forEach(function (v, i) {
        if (v == null) { if (corrente.length) { tratti.push(corrente); } corrente = []; return; }
        corrente.push((SX + gruppo * (i + 0.5)).toFixed(1) + ',' + g.y(v).toFixed(1));
      });
      if (corrente.length) { tratti.push(corrente); }
      tratti.forEach(function (t) {
        h += t.length > 1 ? '<polyline class="' + serie.classe + '" points="' + t.join(' ') + '"/>' :
          '<circle class="' + serie.classe + '" cx="' + t[0].split(',')[0] + '" cy="' + t[0].split(',')[1] + '" r="3"/>';
      });
      serie.valori.forEach(function (v, i) {
        if (v == null) { return; }
        h += '<circle cx="' + (SX + gruppo * (i + 0.5)).toFixed(1) + '" cy="' + g.y(v).toFixed(1) + '" r="7" fill="transparent"><title>' +
          esc(o.etichette[i] + ' – ' + serie.nome + ': ' + (o.formatoValore || o.formato)(v)) + '</title></circle>';
      });
    });
    h += '<g transform="translate(0,' + (altezza - 10) + ')">' + etichetteX(o.etichette, gruppo) + '</g>';
    var voci = o.serie.slice();
    if (o.soglia && o.soglia.valore != null) { voci.push({ nome: o.soglia.nome, classe: 'soglia' }); }
    return '<svg viewBox="0 0 ' + L + ' ' + altezza + '" role="img" aria-label="' + esc(o.titolo || 'Grafico') + '">' + h + '</svg>' + legenda(voci);
  }

  var COLORI_LEGENDA = { 'serie-1': 'var(--grafico-1)', 'serie-2': 'var(--grafico-2)', 'linea-1': 'var(--grafico-1)', 'linea-2': 'var(--grafico-2)', soglia: 'var(--grafico-2)' };

  function legenda(serie) {
    return '<div class="legenda">' + serie.map(function (s) {
      return '<span><i style="background:' + (COLORI_LEGENDA[s.classe] || 'var(--tenue)') + '"></i>' + esc(s.nome) + '</span>';
    }).join('') + '</div>';
  }

  GC.grafici = { barre: barre, linee: linee, scala: scala };
})(typeof window !== 'undefined' ? window : globalThis);
