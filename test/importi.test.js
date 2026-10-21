'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../js/logica/importi.js');

const NBSP = ' ';

test('caso 1: 0,10 + 0,20 = 30 centesimi, mostrati come 0,30 €', () => {
  const somma = I.leggiImporto('0,10') + I.leggiImporto('0,20');
  assert.equal(somma, 30);
  assert.equal(I.formattaImporto(somma).replace(NBSP, ' '), '0,30 €');
});

test('caso 1: formati italiani e punto decimale', () => {
  assert.equal(I.leggiImporto('1.234,56'), 123456);
  assert.equal(I.leggiImporto('12,5'), 1250);
  assert.equal(I.leggiImporto('12.50'), 1250);
  assert.equal(I.leggiImporto('1.234'), 123400);
});

test('importi: varianti accettate', () => {
  assert.equal(I.leggiImporto('€ 1.234,56'), 123456);
  assert.equal(I.leggiImporto(' 1 234,56 '), 123456);
  assert.equal(I.leggiImporto('1.234.567,89'), 123456789);
  assert.equal(I.leggiImporto('12.345'), 1234500, 'punto seguito da 3 cifre = migliaia');
  assert.equal(I.leggiImporto('7'), 700);
  assert.equal(I.leggiImporto(',5'), 50);
  assert.equal(I.leggiImporto('1,234.56'), 123456);
});

test('importi: valori rifiutati', () => {
  for (const s of ['', 'abc', '12,345', '-5', '1,2,3', '12,', '1.23,4', '1..2']) {
    assert.equal(I.leggiImporto(s), null, 'dovrebbe rifiutare "' + s + '"');
  }
  assert.equal(I.leggiImporto('-5', { negativi: true }), -500);
});

test('importi: formato di visualizzazione', () => {
  assert.equal(I.formattaImporto(123456), '1.234,56' + NBSP + '€');
  assert.equal(I.formattaImporto(123456789), '1.234.567,89' + NBSP + '€');
  assert.equal(I.formattaImporto(0), '0,00' + NBSP + '€');
  assert.equal(I.formattaImporto(-1050), '-10,50' + NBSP + '€');
  assert.equal(I.importoPerCampo(123450), '1234,50');
  assert.equal(I.importoPerCsv(5), '0,05');
});

test('energia: kWh salvati in wattora interi e mostrati con un decimale', () => {
  assert.equal(I.leggiEnergiaKWh('24,3'), 24300);
  assert.equal(I.leggiEnergiaKWh('0,001'), 1);
  assert.equal(I.formattaEnergia(24300), '24,3' + NBSP + 'kWh');
  assert.equal(I.formattaEnergia(1234500), '1.234,5' + NBSP + 'kWh');
  assert.equal(I.energiaPerCampo(24300), '24,3');
  assert.equal(I.energiaPerCampo(24000), '24');
});

test('percentuali: un decimale senza ",0"', () => {
  assert.equal(I.formattaPercentuale(0.6), '60%');
  assert.equal(I.formattaPercentuale(300000 / 450000), '66,7%');
  assert.equal(I.formattaPercentuale(0.625), '62,5%');
  assert.equal(I.formattaPercentuale(0.35, true), '+35%');
  assert.equal(I.rapporto(5, 0), null);
});

test('ore: "7:30", "7,5" e "7.5" valgono 450 minuti', () => {
  assert.equal(I.leggiMinuti('7:30'), 450);
  assert.equal(I.leggiMinuti('7,5'), 450);
  assert.equal(I.leggiMinuti('7.5'), 450);
  assert.equal(I.leggiMinuti('8'), 480);
  assert.equal(I.leggiMinuti('7:75'), null);
  assert.equal(I.formattaOre(450), '7 h 30 min');
  assert.equal(I.formattaOre(1200), '20 h');
});

test('prezzo del kWh in milionesimi di euro', () => {
  assert.equal(I.leggiPrezzoKWh('0,25'), 250000);
  assert.equal(I.leggiPrezzoKWh('0,253712'), 253712);
  assert.equal(I.formattaPrezzoKWh(250000), '0,25' + NBSP + '€/kWh');
  assert.equal(I.formattaPrezzoKWh(253700), '0,2537' + NBSP + '€/kWh');
  assert.equal(I.valoreEnergia(300000, 250000), 7500);
});
