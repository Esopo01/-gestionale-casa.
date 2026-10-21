'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/logica/schema.js');
const A = require('../js/logica/archivio.js');
const M = require('../js/logica/movimenti.js');
const IM = require('../js/logica/impegni.js');
const ICS = require('../js/logica/ics.js');
const C = require('../js/logica/controlli.js');

const ORA = '2026-10-21T10:00:00.000Z';
const OGGI = '2026-10-21';

function impegno(campi) {
  return Object.assign({ ora: null, ogniMesi: null, ricorrenzaInizio: null, responsabileId: null, stato: 'da_fare',
    fattoIl: null, collegamento: null, note: '' }, campi);
}

function conImpegni(lista) {
  let a = S.nuovoArchivio(ORA);
  lista.forEach((i) => { a = A.inserisci(a, 'impegni', impegno(i), ORA).archivio; });
  return a;
}

test('caso 6: oggi 21/10/2026, prossimi 30 giorni e scaduti', () => {
  const a = conImpegni([
    { titolo: 'Scadenza di novembre', data: '2026-11-15' },
    { titolo: 'Scadenza di dicembre', data: '2026-12-01' },
    { titolo: 'Ieri, non fatto', data: '2026-10-20' }
  ]);
  const v = IM.viste(IM.elenco(a, OGGI), OGGI, 30);
  assert.deepEqual(v.prossimi.map((x) => x.titolo), ['Scadenza di novembre']);
  assert.deepEqual(v.scaduti.map((x) => x.titolo), ['Ieri, non fatto']);
  assert.equal(C.impegniScaduti(a, OGGI).length, 1);
});

test('un impegno fatto non è scaduto; uno di oggi è tra i prossimi', () => {
  const a = conImpegni([
    { titolo: 'Fatto', data: '2026-10-01', stato: 'fatto', fattoIl: '2026-10-01' },
    { titolo: 'Oggi', data: OGGI }
  ]);
  const v = IM.viste(IM.elenco(a, OGGI), OGGI, 30);
  assert.equal(v.scaduti.length, 0);
  assert.deepEqual(v.prossimi.map((x) => x.titolo), ['Oggi']);
  assert.deepEqual(v.fatti.map((x) => x.titolo), ['Fatto']);
});

test('impegno ricorrente: segnato fatto crea il successivo, partendo dalla prima data della serie', () => {
  let a = conImpegni([{ titolo: 'Autolettura', data: '2026-01-31', ogniMesi: 1, ricorrenzaInizio: '2026-01-31' }]);
  a = IM.segnaFatto(a, a.collezioni.impegni[0].id, '2026-01-31', ORA);
  assert.equal(a.collezioni.impegni.length, 2);
  assert.equal(a.collezioni.impegni[0].stato, 'fatto');
  assert.equal(a.collezioni.impegni[1].data, '2026-02-28');
  a = IM.segnaFatto(a, a.collezioni.impegni[1].id, '2026-02-28', ORA);
  assert.equal(a.collezioni.impegni[2].data, '2026-03-31', 'torna al 31, non resta al 28');
});

test('l\'elenco unico comprende previsti, manutenzioni e richiami', () => {
  let a = S.nuovoArchivio(ORA);
  a = A.inserisci(a, 'movimenti', M.nuovoMovimento({ data: '2026-11-05', importoCent: 5000, categoriaId: 'cat-casa', stato: 'previsto', controparte: 'Condominio' }), ORA).archivio;
  a = A.inserisci(a, 'manutenzioni', { nome: 'Caldaia', ogniMesi: 12, ultimaData: '2025-11-10', attiva: true }, ORA).archivio;
  const animale = A.inserisci(a, 'animali', { nome: 'Fido', specie: 'Cane' }, ORA);
  a = animale.archivio;
  a = A.inserisci(a, 'eventiSanitari', { animaleId: animale.record.id, tipo: 'vaccino', data: '2025-11-01', descrizione: 'Polivalente', dataRichiamo: '2026-11-01' }, ORA).archivio;
  const voci = IM.elenco(a, OGGI);
  assert.deepEqual(voci.map((v) => v.tipo + ' ' + v.data), ['richiamo 2026-11-01', 'pagamento 2026-11-05', 'manutenzione 2026-11-10']);
  assert.equal(IM.viste(voci, OGGI, 30).prossimi.length, 3);
});

test('calendario del mese: settimane da lunedì a domenica', () => {
  const a = conImpegni([{ titolo: 'X', data: '2026-10-15' }]);
  const settimane = IM.calendario('2026-10', IM.elenco(a, OGGI));
  assert.equal(settimane[0][0].data, '2026-09-28', 'il primo lunedì in vista');
  assert.equal(settimane[settimane.length - 1][6].data, '2026-11-01');
  assert.ok(settimane.every((s) => s.length === 7));
  const giorno = settimane.flat().find((g) => g.data === '2026-10-15');
  assert.equal(giorno.voci.length, 1);
  assert.equal(giorno.delMese, true);
});

test('caso 8: scadenza del 15/11/2026 senza orario → DTSTART;VALUE=DATE:20261115', () => {
  const testo = ICS.genera([{ uid: 'prova@gestionale-casa', titolo: 'Scadenza', data: '2026-11-15' }], { ora: ORA });
  const righe = testo.split('\r\n');
  assert.ok(righe.includes('DTSTART;VALUE=DATE:20261115'));
  assert.ok(righe.includes('DTEND;VALUE=DATE:20261116'));
  assert.ok(righe.includes('BEGIN:VCALENDAR') && righe.includes('END:VCALENDAR') && righe.includes('VERSION:2.0'));
  assert.ok(righe.includes('DTSTAMP:20261021T100000Z'));
  assert.ok(testo.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(testo), 'tutte le righe finiscono con CRLF');
});

test('.ics: orario, caratteri speciali, righe lunghe, promemoria', () => {
  const titolo = 'Riunione; condominio, scala B\\C\nportare documenti ' + 'è'.repeat(60);
  const testo = ICS.genera([{ uid: 'x@gestionale-casa', titolo: titolo, data: '2026-12-31', ora: '23:30' }], { ora: ORA, promemoria: 'vigilia' });
  assert.ok(testo.includes('DTSTART:20261231T233000'));
  assert.ok(testo.includes('DTEND:20270101T003000'), 'l\'ora di fine passa al giorno dopo');
  assert.ok(testo.includes('SUMMARY:Riunione\\; condominio\\, scala B\\\\C\\nportare'));
  assert.ok(testo.includes('TRIGGER:-P1D'));
  testo.split('\r\n').forEach((r) => assert.ok(Buffer.byteLength(r, 'utf8') <= 75, 'riga troppo lunga: ' + r));
  const ricomposto = testo.replace(/\r\n /g, '');
  assert.ok(ricomposto.includes('è'.repeat(60)), 'la piegatura non spezza i caratteri');
  const giorno = ICS.genera([{ uid: 'y', titolo: 'T', data: '2026-11-15' }], { ora: ORA, promemoria: 'giorno' });
  assert.ok(giorno.includes('TRIGGER:PT9H'));
});

test('.ics da una voce: UID stabile anche se la data cambia', () => {
  const v1 = ICS.daVoce({ chiave: 'manutenzione-abc', titolo: 'Caldaia', data: '2026-11-10' });
  const v2 = ICS.daVoce({ chiave: 'manutenzione-abc', titolo: 'Caldaia', data: '2027-11-10' });
  assert.equal(v1.uid, v2.uid);
});
