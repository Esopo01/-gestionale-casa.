'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DEMO = require('../js/logica/demo.js');
const C = require('../js/logica/controlli.js');
const A = require('../js/logica/archivio.js');
const S = require('../js/logica/schema.js');

const ORA = '2026-10-21T10:00:00.000Z';
const TUTTI_I_CONTROLLI = ['impegno-scaduto', 'previsto-scaduto', 'bolletta', 'lavoro', 'personale', 'backup'];

for (const oggi of ['2026-10-21', '2027-03-01', '2026-07-31', '2028-02-29']) {
  test('dati di prova con oggi = ' + oggi + ': almeno un avviso per ogni controllo', () => {
    const a = DEMO.genera(oggi, ORA);
    const tipi = new Set(C.esegui(a, oggi).map((x) => x.tipo));
    for (const t of TUTTI_I_CONTROLLI) { assert.ok(tipi.has(t), 'manca l\'avviso: ' + t); }
  });
}

test('dati di prova: 14 mesi, struttura valida, ripetibili', () => {
  const a = DEMO.genera('2026-10-21', ORA);
  assert.deepEqual(S.controlla(a), []);
  const date = a.collezioni.movimenti.filter((m) => m.stato === 'effettivo').map((m) => m.data).sort();
  assert.ok(date[0] >= '2025-09-01');
  assert.ok(date[date.length - 1] < '2026-10-21');
  const b = DEMO.genera('2026-10-21', ORA);
  const importi = (x) => x.collezioni.movimenti.map((m) => m.data + m.importoCent).sort().join();
  assert.equal(importi(a), importi(b));
  assert.equal(A.eVuoto(a), false);
});
