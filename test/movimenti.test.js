'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/logica/schema.js');
const A = require('../js/logica/archivio.js');
const M = require('../js/logica/movimenti.js');
const I = require('../js/logica/importi.js');
const CSV = require('../js/logica/csv.js');

const ORA = '2026-03-31T10:00:00.000Z';
const NBSP = ' ';

function conMovimenti(lista) {
  let a = S.nuovoArchivio(ORA);
  lista.forEach((m) => { a = A.inserisci(a, 'movimenti', M.nuovoMovimento(m), ORA).archivio; });
  return a;
}

test('caso 3: marzo 2026, speso 200,50 €, previsto 40,00 €, Animali 80,00 €', () => {
  const a = conMovimenti([
    { data: '2026-03-05', importoCent: I.leggiImporto('120,50'), categoriaId: 'cat-utenze', stato: 'effettivo' },
    { data: '2026-03-12', importoCent: I.leggiImporto('80,00'), categoriaId: 'cat-animali', stato: 'effettivo' },
    { data: '2026-03-25', importoCent: I.leggiImporto('40,00'), categoriaId: 'cat-animali', stato: 'previsto' }
  ]);
  const marzo = M.filtra(a.collezioni.movimenti, { mese: '2026-03' });
  const t = M.totali(marzo);
  assert.equal(I.formattaImporto(t.speso), '200,50' + NBSP + '€');
  assert.equal(I.formattaImporto(t.previsto), '40,00' + NBSP + '€');
  const perCategoria = M.totaliPerCategoria(marzo, a.collezioni.categorie);
  assert.equal(I.formattaImporto(perCategoria['cat-animali'].speso), '80,00' + NBSP + '€');
});

test('le entrate non contano nello speso; le sottocategorie si sommano nella categoria', () => {
  const a = conMovimenti([
    { data: '2026-03-05', importoCent: 1000, categoriaId: 'cat-utenze', sottocategoriaId: 'cat-utenze-luce' },
    { data: '2026-03-06', importoCent: 2000, categoriaId: 'cat-utenze', sottocategoriaId: 'cat-utenze-gas' },
    { data: '2026-03-07', importoCent: 5000, verso: 'entrata', categoriaId: 'cat-energia', sottocategoriaId: 'cat-energia-gse' }
  ]);
  const t = M.totali(a.collezioni.movimenti);
  assert.equal(t.speso, 3000);
  assert.equal(t.entrate, 5000);
  const pc = M.totaliPerCategoria(a.collezioni.movimenti, a.collezioni.categorie);
  assert.equal(pc['cat-utenze'].speso, 3000);
  assert.equal(pc['cat-utenze'].sotto['cat-utenze-luce'].speso, 1000);
});

test('confronto con gli stessi giorni dell\'anno prima', () => {
  const a = conMovimenti([
    { data: '2026-03-10', importoCent: 15000, categoriaId: 'cat-spesa' },
    { data: '2026-03-25', importoCent: 9999, categoriaId: 'cat-spesa' },
    { data: '2025-03-10', importoCent: 10000, categoriaId: 'cat-spesa' },
    { data: '2025-03-20', importoCent: 7777, categoriaId: 'cat-spesa', note: 'dopo il 15 dell\'anno prima' },
    { data: '2026-01-02', importoCent: 5000, categoriaId: 'cat-spesa' }
  ]);
  const c = M.confrontoAnnoPrima(a.collezioni.movimenti, '2026-03-15');
  assert.equal(c.mese.attuale, 15000);
  assert.equal(c.mese.precedente, 10000);
  assert.equal(c.mese.variazione, 0.5);
  assert.equal(c.anno.attuale, 20000);
  assert.equal(c.anno.precedente, 10000);
});

test('confronto con il 29 febbraio', () => {
  const a = conMovimenti([
    { data: '2028-02-29', importoCent: 100, categoriaId: 'cat-spesa' },
    { data: '2027-02-28', importoCent: 300, categoriaId: 'cat-spesa' }
  ]);
  const c = M.confrontoAnnoPrima(a.collezioni.movimenti, '2028-02-29');
  assert.equal(c.mese.attuale, 100);
  assert.equal(c.mese.precedente, 300);
});

test('budget: percentuale usata', () => {
  let a = conMovimenti([
    { data: '2026-02-05', importoCent: 30000, categoriaId: 'cat-animali', sottocategoriaId: 'cat-animali-cibo' },
    { data: '2026-05-05', importoCent: 10000, categoriaId: 'cat-animali', stato: 'previsto' },
    { data: '2025-05-05', importoCent: 99999, categoriaId: 'cat-animali' }
  ]);
  a = A.inserisci(a, 'budget', { anno: 2026, categoriaId: 'cat-animali', importoCent: 120000 }, ORA).archivio;
  const uso = M.usoBudget(a, 2026);
  assert.equal(uso.length, 1);
  assert.equal(uso[0].spesoCent, 30000);
  assert.equal(uso[0].previstoCent, 10000);
  assert.equal(I.formattaPercentuale(uso[0].percentuale), '25%');
});

test('spesa rapida: effettiva, uscita, con la data di oggi ricevuta come parametro', () => {
  const a = S.nuovoArchivio(ORA);
  const r = M.spesaRapida(a, { importoCent: 1250, categoriaId: 'cat-spesa' }, '2026-10-21', ORA);
  assert.equal(r.record.data, '2026-10-21');
  assert.equal(r.record.stato, 'effettivo');
  assert.equal(r.record.verso, 'uscita');
  assert.throws(() => M.spesaRapida(a, { importoCent: 0, categoriaId: 'cat-spesa' }, '2026-10-21', ORA));
});

test('esportazione CSV: BOM, punto e virgola, decimali con la virgola, filtri', () => {
  let a = conMovimenti([
    { data: '2026-03-05', importoCent: 123456, categoriaId: 'cat-lavori', detraibile: true, controparte: 'Ditta "Rossa"; srl', note: 'riga 1\nriga 2' },
    { data: '2026-04-05', importoCent: 500, categoriaId: 'cat-spesa' },
    { data: '2025-04-05', importoCent: 700, categoriaId: 'cat-lavori', detraibile: true }
  ]);
  const r = M.esportaCsv(a, { anno: 2026, detraibile: 'si' });
  assert.equal(r.numero, 1);
  assert.ok(r.testo.startsWith('﻿'));
  const righe = CSV.analizza(r.testo, ';');
  assert.equal(righe[0][0], 'Data');
  assert.equal(righe[0][2], 'Importo');
  assert.equal(righe[1][0], '05/03/2026');
  assert.equal(righe[1][2], '1234,56');
  assert.equal(righe[1][6], 'Ditta "Rossa"; srl');
  assert.equal(righe[1][8], 'sì');
  assert.equal(righe[1][12], 'riga 1\nriga 2');
  assert.ok(r.testo.indexOf('\r\n') > 0);
  const tutti = M.esportaCsv(a, { categoriaId: 'cat-lavori' });
  assert.equal(tutti.numero, 2);
});

test('CSV: separatore riconosciuto e campi tra virgolette', () => {
  assert.equal(CSV.rilevaSeparatore('a;b;c\n1;2;3\n'), ';');
  assert.equal(CSV.rilevaSeparatore('a,b,c\n1,2,3\n'), ',');
  assert.equal(CSV.rilevaSeparatore('"x;y",b\n"1;2",3\n'), ',');
  assert.deepEqual(CSV.analizza('"a""b";c\r\n1;"2\n3"', ';'), [['a"b', 'c'], ['1', '2\n3']]);
});

test('categorie: non si elimina una categoria usata o necessaria al programma', () => {
  let a = conMovimenti([{ data: '2026-03-05', importoCent: 100, categoriaId: 'cat-arredi' }]);
  assert.throws(() => M.eliminaCategoria(a, 'cat-arredi', ORA), /usata/);
  assert.throws(() => M.eliminaCategoria(a, 'cat-utenze', ORA), /serve al programma/);
  a = M.eliminaCategoria(a, 'cat-altro', ORA);
  assert.equal(A.trova(a, 'categorie', 'cat-altro'), null);
  assert.equal(M.coppiaPerRuolo(a.collezioni.categorie, 'stipendi').sottocategoriaId, 'cat-personale-stipendi');
});
