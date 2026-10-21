/*
 * Gestionale casa — personale: paghe (con storico), registro ore, dovuto e pagato per mese.
 * Il programma registra importi e scadenze ma non calcola contributi né importi di legge.
 *  dovuto del mese: paga oraria × ore registrate, oppure paga mensile, oppure la
 *                   correzione inserita per quel mese;
 *  pagato del mese: movimenti effettivi della persona nella sottocategoria Stipendi
 *                   con quel mese di competenza (contributi, tredicesima, TFR esclusi).
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var D = GC.date || require('./date.js');
  var A = GC.archivio || require('./archivio.js');
  var M = GC.movimenti || require('./movimenti.js');

  function pagaAlla(persona, data) {
    var valide = (persona.paghe || []).filter(function (p) { return p.dal && p.dal <= data; })
      .sort(function (a, b) { return a.dal < b.dal ? 1 : -1; });
    return valide.length ? valide[0] : null;
  }

  function pagaAttuale(persona, oggi) {
    return pagaAlla(persona, oggi) || ((persona.paghe || []).slice().sort(function (a, b) { return a.dal < b.dal ? -1 : 1; })[0] || null);
  }

  function oreDelMese(archivio, personaId, mese) {
    return archivio.collezioni.ore.filter(function (o) { return o.personaId === personaId && D.mese(o.data) === mese; })
      .sort(function (a, b) { return a.data < b.data ? -1 : 1; });
  }

  function rettifica(archivio, personaId, mese) {
    return archivio.collezioni.rettifiche.filter(function (r) { return r.personaId === personaId && r.mese === mese; })[0] || null;
  }

  function idStipendi(archivio) {
    return archivio.collezioni.categorie.filter(function (c) { return c.ruolo === 'stipendi'; }).map(function (c) { return c.id; });
  }

  function attivaNelMese(persona, mese) {
    if (persona.dataInizio && persona.dataInizio > D.ultimoGiorno(mese)) { return false; }
    if (persona.dataFine && persona.dataFine < D.primoGiorno(mese)) { return false; }
    return true;
  }

  function dovuto(archivio, persona, mese) {
    var minuti = oreDelMese(archivio, persona.id, mese);
    var totaleMinuti = minuti.reduce(function (t, o) { return t + o.minuti; }, 0);
    var r = rettifica(archivio, persona.id, mese);
    if (r) { return { importo: r.dovutoCent, minuti: totaleMinuti, origine: 'rettifica', rettifica: r }; }
    var paga = pagaAlla(persona, D.ultimoGiorno(mese));
    if (!paga || !attivaNelMese(persona, mese)) { return { importo: null, minuti: totaleMinuti, origine: null }; }
    if (paga.tipo === 'mensile') { return { importo: paga.importoCent, minuti: totaleMinuti, origine: 'mensile' }; }
    // A ore: ogni giornata usa la paga valida in quel giorno; si arrotonda una sola volta.
    var centesimiPerMinuti = minuti.reduce(function (t, o) {
      var p = pagaAlla(persona, o.data) || paga;
      return t + o.minuti * (p.tipo === 'oraria' ? p.importoCent : 0);
    }, 0);
    return { importo: Math.round(centesimiPerMinuti / 60), minuti: totaleMinuti, origine: 'ore' };
  }

  function pagamenti(archivio, personaId) {
    return M.ordina(A.collegati(archivio, 'movimenti', 'persona', personaId), true);
  }

  function pagato(archivio, personaId, mese) {
    var stipendi = idStipendi(archivio);
    var movimenti = A.collegati(archivio, 'movimenti', 'persona', personaId).filter(function (m) {
      return m.stato === 'effettivo' && M.meseCompetenza(m) === mese &&
        (stipendi.indexOf(m.sottocategoriaId) >= 0 || stipendi.indexOf(m.categoriaId) >= 0);
    });
    return M.costoNetto(movimenti);
  }

  function riepilogoMese(archivio, persona, mese) {
    var d = dovuto(archivio, persona, mese);
    var p = pagato(archivio, persona.id, mese);
    return {
      mese: mese,
      minuti: d.minuti,
      dovuto: d.importo,
      origine: d.origine,
      rettifica: d.rettifica || null,
      pagato: p,
      differenza: d.importo != null ? d.importo - p : null
    };
  }

  /*
   * Mesi da controllare: dal primo mese con ore, pagamenti o correzioni della persona
   * fino al mese prima di oggi (il mese in corso non è ancora concluso).
   */
  function mesiDaControllare(archivio, persona, oggi) {
    var date = [];
    archivio.collezioni.ore.forEach(function (o) { if (o.personaId === persona.id) { date.push(D.mese(o.data)); } });
    A.collegati(archivio, 'movimenti', 'persona', persona.id).forEach(function (m) { date.push(M.meseCompetenza(m)); });
    archivio.collezioni.rettifiche.forEach(function (r) { if (r.personaId === persona.id) { date.push(r.mese); } });
    if (!date.length) { return []; }
    date.sort();
    var fine = D.spostaMese(D.mese(oggi), -1);
    if (persona.dataFine && D.mese(persona.dataFine) < fine) { fine = D.mese(persona.dataFine); }
    return date[0] <= fine ? D.elencoMesi(date[0], fine) : [];
  }

  // Mesi in cui dovuto e pagato differiscono più della tolleranza.
  function differenze(archivio, persona, oggi, tolleranzaCent) {
    return mesiDaControllare(archivio, persona, oggi).map(function (mese) {
      return riepilogoMese(archivio, persona, mese);
    }).filter(function (r) {
      return r.differenza != null && Math.abs(r.differenza) > (tolleranzaCent || 0);
    });
  }

  function validaPersona(p) {
    var errori = [];
    if (!String(p.nome || '').trim()) { errori.push('Scrivi il nome.'); }
    (p.paghe || []).forEach(function (pg) {
      if (!D.valida(pg.dal)) { errori.push('Ogni paga deve avere una data "dal".'); }
      if (!(pg.importoCent > 0)) { errori.push('Ogni paga deve avere un importo.'); }
    });
    return errori;
  }

  function eliminaPersona(archivio, id, ora) {
    var a = A.eliminaDove(archivio, 'ore', function (o) { return o.personaId === id; }, ora);
    a = A.eliminaDove(a, 'rettifiche', function (r) { return r.personaId === id; }, ora);
    a = A.scollega(a, 'persona', id, ora);
    a = A.azzeraRiferimenti(a, 'responsabileId', id, ora);
    return A.elimina(a, 'persone', id, ora);
  }

  var api = {
    pagaAlla: pagaAlla,
    pagaAttuale: pagaAttuale,
    oreDelMese: oreDelMese,
    rettifica: rettifica,
    dovuto: dovuto,
    pagato: pagato,
    pagamenti: pagamenti,
    riepilogoMese: riepilogoMese,
    mesiDaControllare: mesiDaControllare,
    differenze: differenze,
    validaPersona: validaPersona,
    eliminaPersona: eliminaPersona
  };

  GC.personale = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
