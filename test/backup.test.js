'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/logica/schema.js');
const A = require('../js/logica/archivio.js');
const DEMO = require('../js/logica/demo.js');
const salvataggio = require('../js/salvataggio.js');

const ORA = '2026-10-21T10:00:00.000Z';

// Deposito finto con la stessa interfaccia di localStorage.
function depositoFinto(limite) {
  const dati = new Map();
  return {
    get length() { return dati.size; },
    key(i) { return Array.from(dati.keys())[i] || null; },
    getItem(k) { return dati.has(k) ? dati.get(k) : null; },
    setItem(k, v) {
      if (limite != null && String(v).length > limite) {
        const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
      }
      dati.set(k, String(v));
    },
    removeItem(k) { dati.delete(k); },
    chiavi() { return Array.from(dati.keys()); }
  };
}

test('caso 9: esporta, svuota, reimporta → dati identici', async () => {
  const deposito = depositoFinto();
  salvataggio.usaDeposito(deposito);
  const partenza = DEMO.genera('2026-10-21', ORA);
  await salvataggio.salva(partenza);

  const caricato = (await salvataggio.carica()).archivio;
  const esportato = A.esporta(caricato, ORA);
  await salvataggio.salva(esportato.archivio);
  const statoAlBackup = (await salvataggio.carica()).archivio;

  await salvataggio.cancella();
  assert.equal((await salvataggio.carica()).stato, 'vuoto');

  const letto = A.leggiBackup(esportato.testo, ORA);
  assert.equal(letto.ok, true, letto.errori.join(' '));
  await salvataggio.salva(letto.archivio);
  const finale = (await salvataggio.carica()).archivio;
  assert.deepEqual(finale, statoAlBackup);
  assert.deepEqual(finale.collezioni, partenza.collezioni);
  assert.deepEqual(finale.impostazioni, partenza.impostazioni);
  assert.equal(finale.meta.ultimoBackupIl, ORA);
  salvataggio.usaDeposito(null);
});

test('le chiavi del browser iniziano con "gestionale-casa:"', async () => {
  const deposito = depositoFinto();
  salvataggio.usaDeposito(deposito);
  await salvataggio.salva(S.nuovoArchivio(ORA));
  salvataggio.scriviPreferenze({ scheda: 'registro' });
  assert.ok(deposito.chiavi().length >= 2);
  assert.ok(deposito.chiavi().every((k) => k.startsWith('gestionale-casa:')));
  salvataggio.usaDeposito(null);
});

test('spazio esaurito: il salvataggio fallisce con un motivo chiaro e i dati restano leggibili', async () => {
  const deposito = depositoFinto(1000);
  salvataggio.usaDeposito(deposito);
  const r = await salvataggio.salva(DEMO.genera('2026-10-21', ORA));
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'spazio');
  assert.match(r.messaggio, /spazio/);
  assert.equal((await salvataggio.carica()).stato, 'vuoto', 'non resta un salvataggio a metà');
  salvataggio.usaDeposito(null);
});

test('dati salvati illeggibili: vengono segnalati, non sovrascritti', async () => {
  const deposito = depositoFinto();
  deposito.setItem('gestionale-casa:archivio', '{rotto');
  salvataggio.usaDeposito(deposito);
  const r = await salvataggio.carica();
  assert.equal(r.stato, 'illeggibile');
  assert.equal(r.testo, '{rotto');
  salvataggio.usaDeposito(null);
});

test('importazione: rifiuta file non validi o di una versione più recente', () => {
  assert.equal(A.leggiBackup('non json', ORA).ok, false);
  assert.equal(A.leggiBackup(JSON.stringify({ app: 'altro', collezioni: {} }), ORA).ok, false);
  const futuro = S.nuovoArchivio(ORA);
  futuro.schemaVersion = S.VERSIONE + 1;
  const r = A.leggiBackup(JSON.stringify(futuro), ORA);
  assert.equal(r.ok, false);
  assert.match(r.errori[0], /più recente/);
  const doppio = S.nuovoArchivio(ORA);
  doppio.collezioni.familiari = [{ id: 'x' }, { id: 'x' }];
  assert.equal(A.leggiBackup(JSON.stringify(doppio), ORA).ok, false);
});

test('migrazione: un archivio senza versione e incompleto viene completato', () => {
  const vecchio = {
    app: 'gestionale-casa',
    collezioni: { movimenti: [{ id: 'm1', data: '2026-01-01', importoCent: 100 }] },
    impostazioni: { soglie: { bollettaPct: 40 } }
  };
  const a = S.migra(vecchio, ORA);
  assert.equal(a.schemaVersion, S.VERSIONE);
  assert.equal(a.collezioni.movimenti.length, 1);
  assert.deepEqual(a.collezioni.energia, []);
  assert.equal(a.impostazioni.soglie.bollettaPct, 40, 'i valori presenti restano');
  assert.equal(a.impostazioni.soglie.backupGiorni, 7, 'i mancanti prendono il predefinito');
  assert.equal(a.impostazioni.impianto.produzioneAttesaWh.length, 12);
  assert.deepEqual(a.eliminati, []);
});

test('riepilogo dell\'importazione', () => {
  const a = DEMO.genera('2026-10-21', ORA);
  const r = A.riepilogo(a);
  assert.ok(r.conteggi.movimenti > 100);
  assert.equal(r.schemaVersion, S.VERSIONE);
  assert.ok(r.movimentiDal < r.movimentiAl);
});

test('unisci: vince la modifica più recente e le eliminazioni si propagano', () => {
  let base = S.nuovoArchivio('2026-01-01T00:00:00.000Z');
  base = A.inserisci(base, 'familiari', { id: 'f1', nome: 'Uno' }, '2026-01-01T00:00:00.000Z').archivio;
  base = A.inserisci(base, 'familiari', { id: 'f2', nome: 'Due' }, '2026-01-01T00:00:00.000Z').archivio;
  base = A.inserisci(base, 'familiari', { id: 'f3', nome: 'Tre' }, '2026-01-01T00:00:00.000Z').archivio;

  let telefono = A.aggiorna(base, 'familiari', 'f1', { nome: 'Uno (telefono)' }, '2026-02-01T00:00:00.000Z').archivio;
  telefono = A.elimina(telefono, 'familiari', 'f2', '2026-02-01T00:00:00.000Z');
  telefono = A.inserisci(telefono, 'familiari', { id: 'f4', nome: 'Quattro' }, '2026-02-01T00:00:00.000Z').archivio;

  let computer = A.aggiorna(base, 'familiari', 'f1', { nome: 'Uno (computer, prima)' }, '2026-01-15T00:00:00.000Z').archivio;
  computer = A.aggiorna(computer, 'familiari', 'f3', { nome: 'Tre (computer)' }, '2026-02-05T00:00:00.000Z').archivio;

  const r = A.unisci(computer, telefono);
  const nomi = r.archivio.collezioni.familiari.map((f) => f.nome).sort();
  assert.deepEqual(nomi, ['Quattro', 'Tre (computer)', 'Uno (telefono)']);
  assert.deepEqual(r.resoconto, { aggiunti: 1, aggiornati: 1, eliminati: 1 });
  assert.equal(r.archivio.collezioni.categorie.length, base.collezioni.categorie.length, 'categorie predefinite non duplicate');

  const ancora = A.unisci(r.archivio, telefono);
  assert.deepEqual(ancora.resoconto, { aggiunti: 0, aggiornati: 0, eliminati: 0 });
});

test('archivio vuoto: solo le categorie predefinite', () => {
  const a = S.nuovoArchivio(ORA);
  assert.equal(A.eVuoto(a), true);
  assert.equal(A.eVuoto(A.inserisci(a, 'familiari', { nome: 'X' }, ORA).archivio), false);
  assert.equal(A.eVuoto(DEMO.genera('2026-10-21', ORA)), false);
});

test('id univoci', () => {
  const B = require('../js/logica/base.js');
  const visti = new Set();
  for (let i = 0; i < 5000; i++) { visti.add(B.nuovoId()); }
  assert.equal(visti.size, 5000);
});
