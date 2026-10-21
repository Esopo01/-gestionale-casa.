'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/logica/date.js');
const S = require('../js/logica/schema.js');
const A = require('../js/logica/archivio.js');
const M = require('../js/logica/movimenti.js');

const ORA = '2026-01-01T10:00:00.000Z';

test('caso 2: ricorrenza mensile dal 31/01/2026', () => {
  const date = M.dateRicorrenza({ dataInizio: '2026-01-31', ogniMesi: 1 }, '2026-04-30').map(D.formattaData);
  assert.deepEqual(date, ['31/01/2026', '28/02/2026', '31/03/2026', '30/04/2026']);
});

test('date: lettura, validità e formato', () => {
  assert.equal(D.leggiData('15/11/2026'), '2026-11-15');
  assert.equal(D.leggiData('1/9/2026'), '2026-09-01');
  assert.equal(D.leggiData('2026-09-01 00:00:00'), '2026-09-01');
  assert.equal(D.leggiData('31/02/2026'), null);
  assert.equal(D.leggiData('29/02/2028'), '2028-02-29');
  assert.equal(D.leggiData('2026-13-01'), null);
  assert.equal(D.formattaData('2026-11-15'), '15/11/2026');
  assert.equal(D.leggiMese('09/2026'), '2026-09');
  assert.equal(D.differenzaGiorni('2026-10-21', '2026-11-20'), 30);
  assert.equal(D.giornoSettimana('2026-10-19'), 0, 'il 19/10/2026 è lunedì');
});

test('ricorrenza annuale dal 29/02/2024', () => {
  const date = M.dateRicorrenza({ dataInizio: '2024-02-29', ogniMesi: 12 }, '2028-12-31');
  assert.deepEqual(date, ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
});

test('ricorrenze bimestrale, trimestrale e semestrale con data di fine', () => {
  assert.deepEqual(M.dateRicorrenza({ dataInizio: '2026-01-15', ogniMesi: 2 }, '2026-06-30'),
    ['2026-01-15', '2026-03-15', '2026-05-15']);
  assert.deepEqual(M.dateRicorrenza({ dataInizio: '2026-01-31', ogniMesi: 3 }, '2026-12-31'),
    ['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31']);
  assert.deepEqual(M.dateRicorrenza({ dataInizio: '2026-03-10', ogniMesi: 6, dataFine: '2027-03-01' }, '2030-01-01'),
    ['2026-03-10', '2026-09-10']);
});

function archivioConRicorrenza() {
  let a = S.nuovoArchivio(ORA);
  a = M.salvaRicorrenza(a, {
    descrizione: 'Condominio', ogniMesi: 3, dataInizio: '2026-01-10', importoCent: 30000, verso: 'uscita',
    categoriaId: 'cat-casa', sottocategoriaId: 'cat-casa-condominio'
  }, '2026-01-01', ORA);
  return a;
}

test('generare i previsti due volte non li duplica', () => {
  let a = archivioConRicorrenza();
  const primi = a.collezioni.movimenti.length;
  assert.equal(primi, 4, '10/01, 10/04, 10/07, 10/10/2026: il 10/01/2027 è oltre i 12 mesi');
  a = M.generaPrevisti(a, '2026-01-01', ORA).archivio;
  assert.equal(a.collezioni.movimenti.length, primi);
  assert.ok(a.collezioni.movimenti.every((m) => m.stato === 'previsto' && m.importoPrevistoCent === 30000));
});

test('un previsto cancellato non ricompare; il tempo che passa aggiunge i nuovi', () => {
  let a = archivioConRicorrenza();
  const daTogliere = a.collezioni.movimenti.find((m) => m.data === '2026-04-10');
  a = A.elimina(a, 'movimenti', daTogliere.id, ORA);
  a = M.generaPrevisti(a, '2026-01-01', ORA).archivio;
  assert.equal(a.collezioni.movimenti.some((m) => m.data === '2026-04-10'), false);
  a = M.generaPrevisti(a, '2026-04-15', ORA).archivio;
  assert.ok(a.collezioni.movimenti.some((m) => m.data === '2027-04-10'));
  assert.equal(a.collezioni.movimenti.filter((m) => m.data === '2026-04-10').length, 0);
});

test('modificare la ricorrenza aggiorna solo i previsti futuri', () => {
  let a = archivioConRicorrenza();
  const ric = a.collezioni.ricorrenze[0];
  const gennaio = a.collezioni.movimenti.find((m) => m.data === '2026-01-10');
  a = M.conferma(a, gennaio.id, { importoCent: 31000 }, ORA).archivio;
  a = M.salvaRicorrenza(a, Object.assign({}, ric, { importoCent: 35000 }), '2026-03-01', ORA);
  const mov = a.collezioni.movimenti;
  assert.equal(mov.find((m) => m.data === '2026-01-10').importoCent, 31000, 'il confermato non cambia');
  assert.equal(mov.find((m) => m.data === '2026-04-10').importoCent, 35000);
  assert.equal(mov.filter((m) => m.data === '2026-04-10').length, 1);
});

test('conferma: il previsto diventa effettivo e conserva l\'importo previsto', () => {
  let a = archivioConRicorrenza();
  const m = a.collezioni.movimenti[0];
  const r = M.conferma(a, m.id, { importoCent: 29999 }, ORA);
  assert.equal(r.record.stato, 'effettivo');
  assert.equal(r.record.importoCent, 29999);
  assert.equal(r.record.importoPrevistoCent, 30000);
});

test('eliminare una ricorrenza toglie i previsti e lascia gli effettivi', () => {
  let a = archivioConRicorrenza();
  const ric = a.collezioni.ricorrenze[0];
  a = M.conferma(a, a.collezioni.movimenti[0].id, {}, ORA).archivio;
  a = M.eliminaRicorrenza(a, ric.id, ORA);
  assert.equal(a.collezioni.movimenti.length, 1);
  assert.equal(a.collezioni.movimenti[0].ricorrenzaId, null);
  assert.equal(a.collezioni.ricorrenze.length, 0);
});
