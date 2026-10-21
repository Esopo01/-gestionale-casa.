'use strict';
// Controlla in automatico le regole tecniche del progetto su tutti i file pubblicati.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');

function file(dir, estensioni) {
  const out = [];
  for (const nome of fs.readdirSync(path.join(RADICE, dir))) {
    const rel = path.join(dir, nome);
    const stat = fs.statSync(path.join(RADICE, rel));
    if (stat.isDirectory()) { out.push(...file(rel, estensioni)); }
    else if (estensioni.some((e) => nome.endsWith(e))) { out.push(rel); }
  }
  return out;
}

const PUBBLICATI = ['index.html'].concat(file('js', ['.js']), file('css', ['.css']));
const leggi = (rel) => fs.readFileSync(path.join(RADICE, rel), 'utf8');

test('nessuno script di tipo module', () => {
  for (const f of PUBBLICATI) {
    assert.doesNotMatch(leggi(f), /type\s*=\s*["']module["']/, f);
  }
});

test('solo percorsi relativi (niente che inizi con "/")', () => {
  for (const f of PUBBLICATI) {
    const testo = leggi(f);
    assert.doesNotMatch(testo, /\b(?:src|href)\s*=\s*["']\/(?!\/)/, f + ': src/href assoluto');
    assert.doesNotMatch(testo, /url\(\s*["']?\//, f + ': url() assoluto');
  }
});

test('nessuna chiamata di rete né risorsa esterna', () => {
  const vietati = [/\bfetch\s*\(/, /XMLHttpRequest/, /\bWebSocket\b/, /\bEventSource\b/, /sendBeacon/, /\bimport\s*\(/,
    /https?:\/\//, /\bsrc\s*=\s*["']\/\//, /\bhref\s*=\s*["']\/\//];
  for (const f of PUBBLICATI) {
    const testo = leggi(f);
    for (const re of vietati) { assert.doesNotMatch(testo, re, f + ': ' + re); }
  }
});

test('localStorage solo nello strato di salvataggio', () => {
  for (const f of PUBBLICATI) {
    if (f === path.join('js', 'salvataggio.js')) { continue; }
    assert.doesNotMatch(leggi(f), /localStorage|sessionStorage|indexedDB/, f);
  }
});

test('index.html carica tutti gli script esistenti e solo quelli', () => {
  const html = leggi('index.html');
  const caricati = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
  for (const s of caricati) { assert.ok(fs.existsSync(path.join(RADICE, s)), 'manca ' + s); }
  for (const f of file('js', ['.js'])) {
    assert.ok(caricati.includes(f.split(path.sep).join('/')), 'non caricato in index.html: ' + f);
  }
  assert.ok(fs.existsSync(path.join(RADICE, '.nojekyll')), 'manca .nojekyll');
});

test('nessun dato personale evidente nei file pubblicati', () => {
  for (const f of PUBBLICATI) {
    const testo = leggi(f);
    assert.doesNotMatch(testo, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, f + ': indirizzo email');
    assert.doesNotMatch(testo, /\b(?:IT\d{2}[A-Z]\d{10}[0-9A-Z]{12})\b/, f + ': IBAN');
    assert.doesNotMatch(testo, /\b3\d{2}[ ]?\d{6,7}\b/, f + ': numero di cellulare');
  }
});

test('la logica non usa il DOM e riceve "oggi" come parametro', () => {
  for (const f of file(path.join('js', 'logica'), ['.js'])) {
    const testo = leggi(f);
    assert.doesNotMatch(testo, /\bdocument\b|\bwindow\.(?!GC)/, f + ': usa il DOM');
    assert.doesNotMatch(testo, /new Date\(\)|Date\.now\(\)/, f + ': legge da sola la data di oggi');
  }
});
