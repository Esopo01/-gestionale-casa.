'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/logica/schema.js');
const A = require('../js/logica/archivio.js');
const M = require('../js/logica/movimenti.js');
const BO = require('../js/logica/bollette.js');
const C = require('../js/logica/controlli.js');
const I = require('../js/logica/importi.js');

const ORA = '2026-03-31T10:00:00.000Z';
const SOGLIE = S.impostazioniPredefinite().soglie;

function conBollette(lista) {
  let a = S.nuovoArchivio(ORA);
  lista.forEach((b) => {
    const r = A.inserisci(a, 'bollette', { tipo: b.tipo || 'luce', periodoDal: b.dal, periodoAl: b.al, consumo: b.consumo == null ? null : b.consumo,
      quotaFissaCent: b.quotaFissa == null ? null : b.quotaFissa }, ORA);
    a = r.archivio;
    a = A.inserisci(a, 'movimenti', M.nuovoMovimento({ data: b.al, importoCent: b.importo, categoriaId: 'cat-utenze',
      sottocategoriaId: 'cat-utenze-' + (b.tipo || 'luce'), collegamento: { tipo: 'bolletta', id: r.record.id } }), ORA).archivio;
  });
  return a;
}

function ultima(a) {
  const tutte = BO.conImporti(a);
  return { tutte, b: tutte[tutte.length - 1] };
}

test('caso 5: luce gen-feb 2026 a 135,00 € segnalata rispetto a gen-feb 2025 da 100,00 €', () => {
  const a = conBollette([
    { dal: '2025-01-01', al: '2025-02-28', importo: I.leggiImporto('100,00') },
    { dal: '2026-01-01', al: '2026-02-28', importo: I.leggiImporto('135,00') }
  ]);
  const { tutte, b } = ultima(a);
  const c = BO.confronta(tutte, b, SOGLIE);
  assert.equal(c.riferimento.tipo, 'anno-prima');
  assert.equal(c.superaImporto, true);
  assert.equal(C.bollette(a).length, 1);
});

test('caso 5: luce gen-feb 2026 a 125,00 € non segnalata', () => {
  const a = conBollette([
    { dal: '2025-01-01', al: '2025-02-28', importo: 10000 },
    { dal: '2026-01-01', al: '2026-02-28', importo: 12500 }
  ]);
  const { tutte, b } = ultima(a);
  assert.equal(BO.confronta(tutte, b, SOGLIE).superaImporto, false);
  assert.equal(C.bollette(a).length, 0);
});

test('caso 5: senza l\'anno prima si usa la media delle ultime 6 bollette dello stesso tipo', () => {
  const a = conBollette([
    { dal: '2024-03-01', al: '2024-04-30', importo: 100000 },
    { dal: '2024-11-01', al: '2024-12-31', importo: 10000 },
    { dal: '2025-03-01', al: '2025-04-30', importo: 9000 },
    { dal: '2025-05-01', al: '2025-06-30', importo: 9000 },
    { dal: '2025-07-01', al: '2025-08-31', importo: 11000 },
    { dal: '2025-09-01', al: '2025-10-31', importo: 11000 },
    { dal: '2025-11-01', al: '2025-12-31', importo: 10000 },
    { tipo: 'gas', dal: '2025-11-01', al: '2025-12-31', importo: 99999 },
    { dal: '2026-01-01', al: '2026-02-28', importo: 13500 }
  ]);
  const tutte = BO.conImporti(a);
  const b = tutte.filter((x) => x.tipo === 'luce').pop();
  const rif = BO.riferimento(tutte, b, 6);
  assert.equal(rif.tipo, 'media');
  assert.equal(rif.bollette.length, 6);
  assert.ok(rif.bollette.every((x) => x.tipo === 'luce' && x.periodoDal !== '2024-03-01'), 'esclusi il gas e la settima più vecchia');
  assert.equal(rif.importoCent, 10000);
  assert.equal(BO.confronta(tutte, b, SOGLIE).superaImporto, true, '135 € oltre il 30% della media di 100 €');
});

test('media delle ultime 6: con 5 bollette precedenti si usano quelle', () => {
  const a = conBollette([
    { dal: '2025-03-01', al: '2025-04-30', importo: 9000, consumo: 300000 },
    { dal: '2025-05-01', al: '2025-06-30', importo: 9000, consumo: 300000 },
    { dal: '2025-07-01', al: '2025-08-31', importo: 11000, consumo: 300000 },
    { dal: '2025-09-01', al: '2025-10-31', importo: 11000, consumo: 300000 },
    { dal: '2025-11-01', al: '2025-12-31', importo: 10000, consumo: 300000 },
    { dal: '2026-01-01', al: '2026-02-28', importo: 13500, consumo: 400000 }
  ]);
  const { tutte, b } = ultima(a);
  const c = BO.confronta(tutte, b, SOGLIE);
  assert.equal(c.riferimento.tipo, 'media');
  assert.equal(c.riferimento.bollette.length, 5);
  assert.equal(c.riferimento.importoCent, 10000);
  assert.equal(c.superaImporto, true, '135 > 100 × 1,30');
  assert.equal(c.superaConsumo, true, '400 > 300 × 1,30');
});

test('esattamente +30% non è "oltre il 30%"; si segnala anche il solo consumo', () => {
  const a = conBollette([
    { dal: '2025-01-01', al: '2025-02-28', importo: 10000, consumo: 200000 },
    { dal: '2026-01-01', al: '2026-02-28', importo: 13000, consumo: 270000 }
  ]);
  const { tutte, b } = ultima(a);
  const c = BO.confronta(tutte, b, SOGLIE);
  assert.equal(c.superaImporto, false);
  assert.equal(c.superaConsumo, true);
  assert.equal(C.bollette(a).length, 1);
});

test('periodi che non coincidono: conta la sovrapposizione con l\'anno prima', () => {
  const a = conBollette([
    { dal: '2024-12-15', al: '2025-02-14', importo: 10000 },
    { dal: '2026-01-01', al: '2026-02-28', importo: 14000 }
  ]);
  const { tutte, b } = ultima(a);
  assert.equal(BO.riferimento(tutte, b, 6).tipo, 'anno-prima');
});

test('costo variabile del kWh: dalle bollette con quota fissa, altrimenti dalle Impostazioni', () => {
  let a = conBollette([
    { dal: '2026-01-01', al: '2026-02-28', importo: 13200, quotaFissa: 3200, consumo: 400000 }
  ]);
  const c = BO.costoVariabileKWh(a, '2026-03');
  assert.equal(c.fonte, 'bollette');
  assert.equal(c.valore, 250000, '(132 − 32) € ÷ 400 kWh = 0,25 €/kWh');
  let b = S.nuovoArchivio(ORA);
  assert.deepEqual(BO.costoVariabileKWh(b, '2026-03'), { valore: null, fonte: null, numeroBollette: 0 });
  b = A.conImpostazioni(b, { impianto: Object.assign({}, b.impostazioni.impianto, { costoKWhRiserva: 230000 }) }, ORA);
  assert.equal(BO.costoVariabileKWh(b, '2026-03').fonte, 'impostazioni');
  assert.equal(BO.costoVariabileKWh(b, '2026-03').valore, 230000);
});
