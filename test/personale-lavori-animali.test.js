'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/logica/schema.js');
const A = require('../js/logica/archivio.js');
const M = require('../js/logica/movimenti.js');
const P = require('../js/logica/personale.js');
const L = require('../js/logica/lavori.js');
const AN = require('../js/logica/animali.js');
const C = require('../js/logica/controlli.js');
const I = require('../js/logica/importi.js');

const ORA = '2026-10-21T10:00:00.000Z';
const OGGI = '2026-10-21';
const NBSP = ' ';

function conPersona(paghe) {
  let a = S.nuovoArchivio(ORA);
  const r = A.inserisci(a, 'persone', { nome: 'Persona di prova', paghe: paghe, dataInizio: '2026-01-01', attiva: true }, ORA);
  return { a: r.archivio, persona: r.record };
}

function pagamento(a, persona, importoCent, data, competenza) {
  return A.inserisci(a, 'movimenti', M.nuovoMovimento({ data: data, importoCent: importoCent, categoriaId: 'cat-personale',
    sottocategoriaId: 'cat-personale-stipendi', collegamento: { tipo: 'persona', id: persona.id }, competenza: competenza || null }), ORA).archivio;
}

test('caso 7: 20 ore a 9,50 €/ora = 190,00 €; pagati 180,00 € → differenza di 10,00 € segnalata', () => {
  let { a, persona } = conPersona([{ dal: '2026-01-01', tipo: 'oraria', importoCent: I.leggiImporto('9,50') }]);
  for (let g = 1; g <= 5; g++) {
    a = A.inserisci(a, 'ore', { personaId: persona.id, data: '2026-09-0' + g, minuti: I.leggiMinuti('4') }, ORA).archivio;
  }
  a = pagamento(a, persona, I.leggiImporto('180,00'), '2026-10-05', '2026-09');
  const r = P.riepilogoMese(a, persona, '2026-09');
  assert.equal(r.minuti, 1200);
  assert.equal(I.formattaImporto(r.dovuto), '190,00' + NBSP + '€');
  assert.equal(r.pagato, 18000);
  assert.equal(I.formattaImporto(r.differenza), '10,00' + NBSP + '€');
  const avvisi = C.personale(a, OGGI);
  assert.equal(avvisi.length, 1);
  assert.match(avvisi[0].testo, /10,00/);
});

test('personale: il pagamento di ottobre con competenza settembre conta per settembre', () => {
  let { a, persona } = conPersona([{ dal: '2026-01-01', tipo: 'mensile', importoCent: 50000 }]);
  a = pagamento(a, persona, 50000, '2026-10-05', '2026-09');
  assert.equal(P.pagato(a, persona.id, '2026-09'), 50000);
  assert.equal(P.pagato(a, persona.id, '2026-10'), 0);
  assert.deepEqual(P.differenze(a, persona, OGGI, 0), [], 'settembre pareggia; ottobre non è ancora concluso');
});

test('personale: cambio di paga a metà mese e correzione del dovuto', () => {
  let { a, persona } = conPersona([
    { dal: '2026-01-01', tipo: 'oraria', importoCent: 900 },
    { dal: '2026-09-16', tipo: 'oraria', importoCent: 1200 }
  ]);
  a = A.inserisci(a, 'ore', { personaId: persona.id, data: '2026-09-10', minuti: 60 }, ORA).archivio;
  a = A.inserisci(a, 'ore', { personaId: persona.id, data: '2026-09-20', minuti: 60 }, ORA).archivio;
  assert.equal(P.dovuto(a, persona, '2026-09').importo, 2100);
  a = A.inserisci(a, 'rettifiche', { personaId: persona.id, mese: '2026-09', dovutoCent: 2500, note: 'rimborso' }, ORA).archivio;
  const d = P.dovuto(a, persona, '2026-09');
  assert.equal(d.importo, 2500);
  assert.equal(d.origine, 'rettifica');
});

test('personale: contributi e tredicesima non contano come pagato dello stipendio', () => {
  let { a, persona } = conPersona([{ dal: '2026-01-01', tipo: 'mensile', importoCent: 50000 }]);
  a = pagamento(a, persona, 50000, '2026-09-30');
  a = A.inserisci(a, 'movimenti', M.nuovoMovimento({ data: '2026-09-30', importoCent: 9999, categoriaId: 'cat-personale',
    sottocategoriaId: 'cat-personale-contributi', collegamento: { tipo: 'persona', id: persona.id } }), ORA).archivio;
  assert.equal(P.pagato(a, persona.id, '2026-09'), 50000);
});

test('lavori: speso solo effettivo, preventivi scelti sommati, avviso se si supera', () => {
  let a = S.nuovoArchivio(ORA);
  const r = A.inserisci(a, 'lavori', { titolo: 'Bagno', stato: 'in_corso', detrazionePct: 50, detrazioneAnni: 10 }, ORA);
  a = r.archivio;
  const id = r.record.id;
  a = A.inserisci(a, 'preventivi', { lavoroId: id, fornitore: 'Idraulico', importoCent: 300000, scelto: true }, ORA).archivio;
  a = A.inserisci(a, 'preventivi', { lavoroId: id, fornitore: 'Piastrellista', importoCent: 200000, scelto: true }, ORA).archivio;
  a = A.inserisci(a, 'preventivi', { lavoroId: id, fornitore: 'Altro', importoCent: 999999, scelto: false }, ORA).archivio;
  const pag = (importo, stato) => { a = A.inserisci(a, 'movimenti', M.nuovoMovimento({ data: '2026-10-01', importoCent: importo,
    categoriaId: 'cat-lavori', stato: stato, detraibile: true, collegamento: { tipo: 'lavoro', id: id } }), ORA).archivio; };
  pag(400000, 'effettivo');
  pag(150000, 'previsto');
  let s = L.riepilogo(a, r.record);
  assert.equal(s.preventivoScelto, 500000);
  assert.equal(s.speso, 400000);
  assert.equal(s.previsto, 150000);
  assert.equal(s.differenza, -100000);
  assert.equal(s.supera, false);
  assert.equal(s.detrazione, 200000);
  assert.equal(s.rata, 20000);
  assert.equal(C.lavori(a).length, 0);
  pag(150000, 'effettivo');
  s = L.riepilogo(a, r.record);
  assert.equal(s.supera, true);
  assert.equal(s.differenza, 50000);
  assert.equal(C.lavori(a).length, 1);
});

test('manutenzioni: prossima scadenza e registrazione di un intervento con costo', () => {
  let a = S.nuovoArchivio(ORA);
  const r = A.inserisci(a, 'manutenzioni', { nome: 'Caldaia', ogniMesi: 12, ultimaData: '2025-10-31', fornitore: 'Tecnico',
    costoAbitualeCent: 12000, attiva: true }, ORA);
  a = r.archivio;
  assert.equal(L.prossimaScadenza(a, r.record), '2026-10-31');
  a = L.registraIntervento(a, r.record.id, { data: '2026-10-21', costoCent: 12500 }, ORA);
  const man = A.trova(a, 'manutenzioni', r.record.id);
  assert.equal(man.ultimaData, '2026-10-21');
  assert.equal(L.prossimaScadenza(a, man), '2027-10-21');
  assert.equal(a.collezioni.interventi.length, 1);
  const mov = A.collegati(a, 'movimenti', 'manutenzione', man.id);
  assert.equal(mov.length, 1);
  assert.equal(mov[0].importoCent, 12500);
  assert.equal(mov[0].sottocategoriaId, 'cat-lavori-manutenzioni');
});

test('animali: richiamo chiuso da un evento successivo dello stesso tipo, età, costi per anno', () => {
  let a = S.nuovoArchivio(ORA);
  const r = A.inserisci(a, 'animali', { nome: 'Fido', specie: 'Cane', dataNascita: '2022-08-21' }, ORA);
  a = r.archivio;
  a = AN.registraEvento(a, { animaleId: r.record.id, tipo: 'vaccino', data: '2025-10-01', descrizione: 'Polivalente',
    dataRichiamo: '2026-10-01', costoCent: 5500 }, ORA);
  assert.equal(AN.richiamiAperti(a).length, 1);
  assert.equal(C.impegniScaduti(a, OGGI).length, 1, 'il richiamo del 01/10/2026 è scaduto');
  a = AN.registraEvento(a, { animaleId: r.record.id, tipo: 'vaccino', data: '2026-10-15', descrizione: 'polivalente ',
    dataRichiamo: '2027-10-15', costoCent: 6000 }, ORA);
  assert.equal(AN.richiamiAperti(a).length, 1);
  assert.equal(AN.richiamiAperti(a)[0].dataRichiamo, '2027-10-15');
  assert.equal(AN.etaTesto('2022-08-21', OGGI), '4 anni e 2 mesi');
  assert.deepEqual(AN.costiPerAnno(a, r.record.id), { 2025: 5500, 2026: 6000 });
  assert.equal(A.collegati(a, 'movimenti', 'animale', r.record.id)[0].sottocategoriaId, 'cat-animali-veterinario');
  assert.throws(() => AN.registraEvento(a, { animaleId: r.record.id, tipo: 'visita', data: '2026-10-15', dataRichiamo: '2026-01-01' }, ORA));
});

test('eliminare un lavoro lascia i pagamenti nel registro senza collegamento', () => {
  let a = S.nuovoArchivio(ORA);
  const r = A.inserisci(a, 'lavori', { titolo: 'Cancello', stato: 'idea' }, ORA);
  a = r.archivio;
  a = A.inserisci(a, 'movimenti', M.nuovoMovimento({ data: '2026-10-01', importoCent: 100, categoriaId: 'cat-lavori',
    collegamento: { tipo: 'lavoro', id: r.record.id } }), ORA).archivio;
  a = L.eliminaLavoro(a, r.record.id, ORA);
  assert.equal(a.collezioni.lavori.length, 0);
  assert.equal(a.collezioni.movimenti.length, 1);
  assert.equal(a.collezioni.movimenti[0].collegamento, null);
});
