/*
 * Gestionale casa — animali: età, eventi sanitari (vaccini, antiparassitari, visite, farmaci)
 * e richiami. Un richiamo è chiuso quando viene segnato come fatto oppure quando si registra
 * un evento successivo dello stesso tipo e con la stessa descrizione per lo stesso animale.
 */
(function (radice) {
  'use strict';
  var GC = radice.GC = radice.GC || {};
  var B = GC.base || require('./base.js');
  var D = GC.date || require('./date.js');
  var A = GC.archivio || require('./archivio.js');
  var M = GC.movimenti || require('./movimenti.js');

  function eventi(archivio, animaleId) {
    return archivio.collezioni.eventiSanitari.filter(function (e) { return e.animaleId === animaleId; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  }

  function stessoTrattamento(a, b) {
    return a.animaleId === b.animaleId && a.tipo === b.tipo && B.normalizza(a.descrizione) === B.normalizza(b.descrizione);
  }

  function richiamoAperto(archivio, evento) {
    if (!evento.dataRichiamo || evento.richiamoFattoIl) { return false; }
    return !archivio.collezioni.eventiSanitari.some(function (altro) {
      return altro.id !== evento.id && stessoTrattamento(altro, evento) && altro.data > evento.data;
    });
  }

  function richiamiAperti(archivio, animaleId) {
    return archivio.collezioni.eventiSanitari.filter(function (e) {
      return (!animaleId || e.animaleId === animaleId) && richiamoAperto(archivio, e);
    }).sort(function (a, b) { return a.dataRichiamo < b.dataRichiamo ? -1 : 1; });
  }

  // Età in anni e mesi compiuti.
  function eta(dataNascita, oggi) {
    if (!D.valida(dataNascita) || dataNascita > oggi) { return null; }
    var mesi = 0;
    while (D.aggiungiMesi(dataNascita, mesi + 1) <= oggi && mesi < 3000) { mesi++; }
    return { anni: Math.floor(mesi / 12), mesi: mesi % 12 };
  }

  function etaTesto(dataNascita, oggi) {
    var e = eta(dataNascita, oggi);
    if (!e) { return ''; }
    var parti = [];
    if (e.anni) { parti.push(e.anni + (e.anni === 1 ? ' anno' : ' anni')); }
    if (e.mesi || !e.anni) { parti.push(e.mesi + (e.mesi === 1 ? ' mese' : ' mesi')); }
    return parti.join(' e ');
  }

  // Costi per anno (uscite meno rimborsi), solo movimenti effettivi collegati all'animale.
  function costiPerAnno(archivio, animaleId) {
    var per = {};
    A.collegati(archivio, 'movimenti', 'animale', animaleId).forEach(function (m) {
      if (m.stato !== 'effettivo') { return; }
      var anno = m.data.slice(0, 4);
      per[anno] = (per[anno] || 0) + (m.verso === 'uscita' ? m.importoCent : -m.importoCent);
    });
    return per;
  }

  function validaEvento(e) {
    var errori = [];
    if (!D.valida(e.data)) { errori.push('Inserisci la data.'); }
    if (e.dataRichiamo && (!D.valida(e.dataRichiamo) || e.dataRichiamo < e.data)) { errori.push('La data del richiamo non è valida.'); }
    if (!e.tipo) { errori.push('Scegli il tipo di evento.'); }
    return errori;
  }

  /*
   * Registra un evento sanitario; se c'è un costo crea il movimento collegato all'animale.
   * chiudeRichiamoDi: id di un evento il cui richiamo questo evento esegue.
   */
  function registraEvento(archivio, dati, ora) {
    var errori = validaEvento(dati);
    if (errori.length) { throw new Error(errori.join(' ')); }
    var a = archivio;
    var campi = {
      animaleId: dati.animaleId, tipo: dati.tipo, data: dati.data, descrizione: dati.descrizione || '',
      dataRichiamo: dati.dataRichiamo || null, richiamoFattoIl: null, responsabileId: dati.responsabileId || null,
      note: dati.note || '', documento: dati.documento || ''
    };
    if (dati.id) {
      var prima = A.trova(a, 'eventiSanitari', dati.id);
      // Il richiamo resta "fatto" se la sua data non è cambiata.
      if (prima && prima.dataRichiamo === campi.dataRichiamo) { campi.richiamoFattoIl = prima.richiamoFattoIl || null; }
      a = A.aggiorna(a, 'eventiSanitari', dati.id, campi, ora).archivio;
    } else {
      a = A.inserisci(a, 'eventiSanitari', campi, ora).archivio;
    }
    if (dati.costoCent > 0) {
      var ruolo = dati.tipo === 'farmaco' || dati.tipo === 'antiparassitario' ? 'farmaci' : 'veterinario';
      var cat = M.coppiaPerRuolo(a.collezioni.categorie, ruolo);
      if (!cat.categoriaId) { cat = M.coppiaPerRuolo(a.collezioni.categorie, 'animali'); }
      a = A.inserisci(a, 'movimenti', M.nuovoMovimento({
        data: dati.data, importoCent: dati.costoCent, verso: 'uscita', stato: 'effettivo',
        categoriaId: cat.categoriaId, sottocategoriaId: cat.sottocategoriaId,
        controparte: dati.controparte || '', collegamento: { tipo: 'animale', id: dati.animaleId },
        contoId: dati.contoId || null, detraibile: !!dati.detraibile,
        note: dati.descrizione || '', documento: dati.documento || ''
      }), ora).archivio;
    }
    if (dati.chiudeRichiamoDi) {
      a = A.aggiorna(a, 'eventiSanitari', dati.chiudeRichiamoDi, { richiamoFattoIl: dati.data }, ora).archivio;
    }
    return a;
  }

  function eliminaAnimale(archivio, id, ora) {
    var a = A.eliminaDove(archivio, 'eventiSanitari', function (e) { return e.animaleId === id; }, ora);
    a = A.scollega(a, 'animale', id, ora);
    return A.elimina(a, 'animali', id, ora);
  }

  var api = {
    eventi: eventi,
    richiamoAperto: richiamoAperto,
    richiamiAperti: richiamiAperti,
    eta: eta,
    etaTesto: etaTesto,
    costiPerAnno: costiPerAnno,
    validaEvento: validaEvento,
    registraEvento: registraEvento,
    eliminaAnimale: eliminaAnimale
  };

  GC.animali = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
})(typeof window !== 'undefined' ? window : globalThis);
