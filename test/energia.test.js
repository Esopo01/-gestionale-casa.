'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/logica/schema.js');
const A = require('../js/logica/archivio.js');
const M = require('../js/logica/movimenti.js');
const I = require('../js/logica/importi.js');
const E = require('../js/logica/energia.js');
const IE = require('../js/logica/importa-energia.js');
const C = require('../js/logica/controlli.js');

const ORA = '2026-10-21T10:00:00.000Z';
const OGGI = '2026-10-21';
const NBSP = ' ';
const kWh = (testo) => I.leggiEnergiaKWh(testo);

function impianto(a, modifiche) {
  return A.conImpostazioni(a, { impianto: Object.assign({}, a.impostazioni.impianto, modifiche) }, ORA);
}

function mese(a, periodo, valori) {
  return A.inserisci(a, 'energia', Object.assign({ periodo: periodo, prodottaWh: null, immessaWh: null, prelevataWh: null,
    consumoWh: null, batteriaCaricaWh: null, batteriaScaricaWh: null, origine: 'manuale' }, valori), ORA).archivio;
}

function archivioCaso4(attesaSettembre) {
  let a = S.nuovoArchivio(ORA);
  const attese = [null, null, null, null, null, null, null, null, attesaSettembre == null ? null : attesaSettembre, null, null, null];
  a = impianto(a, { costoKWhRiserva: I.leggiPrezzoKWh('0,25'), produzioneAttesaWh: attese });
  a = mese(a, '2026-09', { prodottaWh: kWh('500'), immessaWh: kWh('200'), prelevataWh: kWh('150') });
  a = A.inserisci(a, 'movimenti', M.nuovoMovimento({ data: '2026-09-25', importoCent: I.leggiImporto('20,00'), verso: 'entrata',
    categoriaId: 'cat-energia', sottocategoriaId: 'cat-energia-gse', controparte: 'GSE' }), ORA).archivio;
  return a;
}

test('caso 4: calcoli del fotovoltaico', () => {
  const r = E.riepilogoMese(archivioCaso4(null), '2026-09');
  const c = r.calcoli;
  assert.equal(I.formattaEnergia(c.autoconsumoWh), '300,0' + NBSP + 'kWh');
  assert.equal(c.autoconsumoWh, 300000);
  assert.equal(c.consumoCasaWh, 450000);
  assert.equal(I.formattaPercentuale(c.quotaAutoconsumata), '60%');
  assert.equal(I.formattaPercentuale(c.autosufficienza), '66,7%');
  assert.equal(I.formattaImporto(c.risparmioCent), '75,00' + NBSP + '€');
  assert.equal(I.formattaImporto(c.beneficioCent), '95,00' + NBSP + '€');
  assert.equal(r.costo.fonte, 'impostazioni', 'senza bollette usa il valore delle Impostazioni');
});

test('caso 4: con produzione attesa di 800 kWh scatta l\'avviso di produzione bassa (62,5%)', () => {
  const a = archivioCaso4(kWh('800'));
  const avvisi = C.produzione(a, OGGI);
  assert.equal(avvisi.length, 1);
  assert.equal(I.formattaPercentuale(avvisi[0].percentuale), '62,5%');
  assert.match(avvisi[0].testo, /62,5%/);
  assert.equal(C.produzione(archivioCaso4(kWh('700')), OGGI).length, 0, '500 su 700 = 71%: nessun avviso');
});

test('produzione bassa: senza produzione attesa si confronta con lo stesso mese dell\'anno prima', () => {
  let a = S.nuovoArchivio(ORA);
  a = mese(a, '2025-09', { prodottaWh: 800000 });
  a = mese(a, '2026-09', { prodottaWh: 500000 });
  const avvisi = C.produzione(a, OGGI);
  assert.equal(avvisi.length, 1);
  assert.match(avvisi[0].testo, /anno prima/);
  let b = S.nuovoArchivio(ORA);
  b = mese(b, '2026-09', { prodottaWh: 500000 });
  assert.equal(C.produzione(b, OGGI).length, 0, 'senza riferimento nessun avviso');
});

test('dato mancante: null, non zero', () => {
  let a = S.nuovoArchivio(ORA);
  a = mese(a, '2026-09', { prodottaWh: 500000 });
  const c = E.riepilogoMese(a, '2026-09').calcoli;
  assert.equal(c.autoconsumoWh, null);
  assert.equal(c.consumoCasaWh, null);
  assert.equal(c.risparmioCent, null);
  assert.equal(c.beneficioCent, null);
  const vuoto = E.riepilogoMese(a, '2026-08');
  assert.equal(vuoto.dati, null);
  assert.equal(vuoto.valori.prodottaWh, null);
  assert.equal(E.calcoli({ prodottaWh: 0, immessaWh: 0, prelevataWh: 0 }, 250000, 0).autosufficienza, null, 'consumo zero: non calcolabile');
});

test('mese da dati giornalieri: completo solo con tutti i giorni; il mese in corso non si controlla', () => {
  let a = S.nuovoArchivio(ORA);
  a = impianto(a, { produzioneAttesaWh: Array(12).fill(900000) });
  for (let g = 1; g <= 20; g++) { a = mese(a, '2026-09-' + String(g).padStart(2, '0'), { prodottaWh: 1000 }); }
  const d = E.datiMese(a, '2026-09');
  assert.equal(d.origine, 'giornaliero');
  assert.equal(d.giorni, 20);
  assert.equal(d.completo, false);
  assert.equal(d.valori.prodottaWh, 20000);
  assert.equal(C.produzione(a, OGGI).length, 0, 'settembre incompleto: non si controlla');
  for (let g = 1; g <= 20; g++) { a = mese(a, '2026-10-' + String(g).padStart(2, '0'), { prodottaWh: 1000 }); }
  assert.equal(C.produzione(a, OGGI).length, 0, 'ottobre è in corso');
});

test('costo del kWh: dalle bollette della luce quando ci sono', () => {
  let a = archivioCaso4(null);
  const b = A.inserisci(a, 'bollette', { tipo: 'luce', periodoDal: '2026-07-01', periodoAl: '2026-08-31', consumo: 400000, quotaFissaCent: 3200 }, ORA);
  a = b.archivio;
  a = A.inserisci(a, 'movimenti', M.nuovoMovimento({ data: '2026-09-20', importoCent: 15200, categoriaId: 'cat-utenze',
    sottocategoriaId: 'cat-utenze-luce', collegamento: { tipo: 'bolletta', id: b.record.id } }), ORA).archivio;
  const r = E.riepilogoMese(a, '2026-09');
  assert.equal(r.costo.fonte, 'bollette');
  assert.equal(r.costo.valore, 300000, '(152 − 32) € ÷ 400 kWh = 0,30 €/kWh');
  assert.equal(r.calcoli.risparmioCent, 9000);
});

test('rientro dell\'investimento: raggiunto, stimato o non stimabile', () => {
  let a = S.nuovoArchivio(ORA);
  a = impianto(a, { costoCent: 30000, dataAttivazione: '2026-01-01', costoKWhRiserva: 250000 });
  for (let m = 1; m <= 9; m++) {
    a = mese(a, '2026-' + String(m).padStart(2, '0'), { prodottaWh: 100000, immessaWh: 60000, prelevataWh: 50000 });
  }
  let r = E.rientro(a, OGGI);
  assert.equal(r.serie.length, 10, 'da gennaio a ottobre');
  assert.equal(r.mesiMancanti, 1, 'ottobre senza dati');
  assert.equal(r.cumulatoCent, 9000, '9 mesi × 40 kWh × 0,25 €');
  assert.equal(r.mediaMensileCent, 1000);
  assert.equal(r.raggiunto, null);
  assert.equal(r.stimato, '2028-07', '(300 − 90) € ÷ 10 € al mese = 21 mesi dopo ottobre 2026');
  a = impianto(a, { costoCent: 5000 });
  r = E.rientro(a, OGGI);
  assert.equal(r.raggiunto, '2026-05');
  let b = impianto(S.nuovoArchivio(ORA), { costoCent: 30000 });
  assert.equal(E.rientro(b, OGGI).stimato, null);
});

// --- Importazione CSV ---

function importa(testo) {
  const analisi = IE.analizza(testo);
  const profilo = IE.creaProfilo(analisi, IE.suggerisci(analisi.intestazioni));
  const risultato = IE.converti(analisi, profilo);
  return { analisi, profilo, risultato, mesi: IE.totaliPerMese(risultato) };
}

const CSV_1 = 'Data;Produzione kWh;Immessa kWh;Prelevata kWh\r\n01/09/2026;24,3;12,1;5,8\r\n02/09/2026;20,0;9,5;6,1\r\n';
const CSV_2 = 'Data,Produzione kWh,Immessa kWh,Prelevata kWh\n2026-09-01,24.3,12.1,5.8\n2026-09-02,20.0,9.5,6.1\n';

test('caso 10: CSV con punto e virgola, decimali con la virgola, date gg/mm/aaaa', () => {
  const { analisi, profilo, risultato, mesi } = importa(CSV_1);
  assert.equal(analisi.separatore, ';');
  assert.equal(analisi.decimale, ',');
  assert.deepEqual(profilo.colonne, { data: 'Data', prodottaWh: 'Produzione kWh', immessaWh: 'Immessa kWh', prelevataWh: 'Prelevata kWh' });
  assert.equal(risultato.granularita, 'giornaliera');
  const set = mesi['2026-09'];
  assert.equal(I.formattaEnergia(set.prodottaWh), '44,3' + NBSP + 'kWh');
  assert.equal(I.formattaEnergia(set.immessaWh), '21,6' + NBSP + 'kWh');
  assert.equal(I.formattaEnergia(set.prelevataWh), '11,9' + NBSP + 'kWh');
  assert.equal(set.prodottaWh, 44300);
  assert.equal(set.immessaWh, 21600);
  assert.equal(set.prelevataWh, 11900);
});

test('caso 10: lo stesso file con virgola come separatore, punto decimale e date AAAA-MM-GG dà lo stesso risultato', () => {
  const uno = importa(CSV_1);
  const due = importa(CSV_2);
  assert.equal(due.analisi.separatore, ',');
  assert.equal(due.analisi.decimale, '.');
  assert.deepEqual(due.mesi, uno.mesi);
  assert.deepEqual(due.risultato.periodi, uno.risultato.periodi);
});

test('importazione salvata nell\'archivio: per giorno, reimportando non duplica', () => {
  const { risultato } = importa(CSV_1);
  let a = S.nuovoArchivio(ORA);
  a = IE.applica(a, risultato, ORA);
  assert.equal(a.collezioni.energia.length, 2);
  assert.equal(E.datiMese(a, '2026-09').valori.prodottaWh, 44300);
  assert.equal(IE.sostituzioni(a, risultato).giorni, 2);
  a = IE.applica(a, risultato, ORA);
  assert.equal(a.collezioni.energia.length, 2);
  assert.equal(E.datiMese(a, '2026-09').valori.prodottaWh, 44300);
});

test('importazione: righe con orario sommate nel giorno, Wh, celle vuote e righe non valide', () => {
  const testo = '﻿Impianto di prova\r\n' +
    '"Data e ora";"Energia prodotta (Wh)";"Energia immessa (Wh)";"Prelevata (Wh)"\r\n' +
    '01/09/2026 10:00;1.200;500;\r\n' +
    '01/09/2026 10:15;1.300;600;-\r\n' +
    '02/09/2026 10:00;900;;100\r\n' +
    'Totale;3.400;1.100;100\r\n' +
    '03/09/2026 10:00;abc;1;1\r\n';
  const { analisi, profilo, risultato } = importa(testo);
  assert.equal(analisi.rigaIntestazione, 1, 'salta la riga di titolo');
  assert.equal(profilo.unita.prodottaWh, 'Wh');
  assert.equal(analisi.decimale, ',', '"1.200" con punto e virgola: punto delle migliaia');
  assert.equal(risultato.valide, 3);
  assert.equal(risultato.scartate.length, 2);
  assert.match(risultato.scartate[0].motivo, /data non valida/);
  assert.match(risultato.scartate[1].motivo, /numero non valido/);
  assert.deepEqual(Object.keys(risultato.periodi), ['2026-09-01', '2026-09-02']);
  assert.equal(risultato.periodi['2026-09-01'].prodottaWh, 2500);
  assert.equal(risultato.periodi['2026-09-01'].prelevataWh, null, 'celle vuote: dato mancante');
  assert.equal(risultato.periodi['2026-09-02'].immessaWh, null);
});

test('importazione: righe mensili e profilo ricordato', () => {
  const testo = 'Mese;Produzione [kWh];Consumo [kWh];Carica batteria [kWh];Scarica batteria [kWh]\n' +
    '01/08/2026;612,4;480;90;82\n01/09/2026;501,2;455;80;74\n';
  const { analisi, profilo, risultato } = importa(testo);
  assert.equal(risultato.granularita, 'mensile');
  assert.equal(profilo.colonne.batteriaCaricaWh, 'Carica batteria [kWh]');
  assert.equal(profilo.colonne.batteriaScaricaWh, 'Scarica batteria [kWh]');
  assert.equal(risultato.periodi['2026-09'].prodottaWh, 501200);
  assert.ok(IE.profiloAdatto(profilo, IE.analizza(testo)));
  assert.equal(IE.profiloAdatto(profilo, IE.analizza(CSV_1)), false);
  let a = S.nuovoArchivio(ORA);
  a = mese(a, '2026-09-15', { prodottaWh: 1 });
  a = IE.applica(a, risultato, ORA);
  assert.equal(E.datiMese(a, '2026-09').origine, 'mensile');
  assert.equal(a.collezioni.energia.filter((e) => e.periodo.startsWith('2026-09')).length, 1, 'i giornalieri del mese sono sostituiti');
  assert.equal(analisi.separatore, ';');
});
