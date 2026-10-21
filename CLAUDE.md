# CLAUDE.md — istruzioni per le sessioni di Claude Code

## Scopo del progetto

Gestionale della casa per una famiglia italiana: registro unico di ogni euro che entra o esce (movimenti, ricorrenze, bollette, budget), lavori e manutenzioni, personale, animali, impegni e scadenze (con esportazione .ics), energia e fotovoltaico, controlli automatici con avvisi in dashboard, backup JSON.
L'utente lavora solo da questo repository con sessioni di Claude Code nel cloud: non ha file sul suo computer. Il sito è pubblicato con GitHub Pages dal ramo `main` e viene aperto da computer e telefono. Scrivi all'utente in italiano.

## Struttura dei file

```
index.html                 pagina unica; carica gli script in ordine (logica → salvataggio → interfaccia)
.nojekyll                  GitHub Pages non rielabora i file
css/stile.css              stile; prima il telefono (380 px), poi gli schermi larghi
js/logica/                 funzioni pure, senza DOM, testate con Node
  base.js                  id univoci, utilità
  importi.js               importi (centesimi), energia (Wh), percentuali, ore (minuti), prezzo kWh
  date.js                  date AAAA-MM-GG, mesi, aggiunta di mesi con fine mese
  schema.js                struttura dei dati, valori predefiniti, schemaVersion e migrazioni
  archivio.js              inserisci/aggiorna/elimina record, backup, unione di archivi
  csv.js                   lettura e scrittura CSV
  movimenti.js             categorie, totali, budget, ricorrenze, spesa rapida, esportazione CSV
  bollette.js              confronto bollette, costo variabile del kWh
  lavori.js                lavori, preventivi, manutenzioni periodiche
  personale.js             paghe, ore, dovuto e pagato per mese
  animali.js               eventi sanitari, richiami
  impegni.js               elenco unico delle scadenze, viste, calendario
  ics.js                   esportazione .ics
  energia.js               dati mensili, calcoli del fotovoltaico, rientro dell'investimento
  importa-energia.js       importazione CSV dell'inverter
  controlli.js             controlli automatici → avvisi
  demo.js                  dati di prova (inventati, ripetibili)
js/salvataggio.js          L'UNICO file che usa localStorage
js/interfaccia/            schermate (DOM)
  ui.js                    finestre, messaggi, campi dei moduli, file, icone
  stato.js                 archivio in memoria, applica le modifiche e salva
  grafici.js               grafici SVG fatti a mano
  app.js                   navigazione (#/sezione/scheda?parametri), azioni comuni, avvio
  viste/*.js               una schermata per sezione
test/*.test.js             test eseguibili con node --test
README.md                  istruzioni per l'utente
```

Ogni file di `js/logica` è uno script classico che si registra in `window.GC.<nome>` nel browser e in `module.exports` in Node; le dipendenze si prendono con `GC.x || require('./x.js')`.

## Regole tecniche (valgono sempre)

- Sito statico: `index.html` e i suoi file nella radice, **nessun passaggio di build**. Deve funzionare anche aprendo `index.html` scaricato sul computer: **script classici, mai `type="module"`**.
- **Solo percorsi relativi** (es. `css/stile.css`), mai che iniziano con `/`. Il file `.nojekyll` resta nella radice.
- **Nessuna risorsa esterna e nessuna chiamata di rete** (fetch, XMLHttpRequest, script o fogli di stile da altri siti, font esterni). Le librerie approvate vanno salvate nel repository. Ad oggi nessuna libreria: i grafici sono SVG fatti a mano.
- Il repository è **pubblico**: nei file non devono finire dati personali o della casa (nomi, importi reali, dati dell'impianto). Dati di prova e test usano solo valori inventati.
- **Tre strati separati:** interfaccia (`js/interfaccia`); logica in funzioni pure senza DOM (`js/logica`), testabili con Node; salvataggio in un solo file (`js/salvataggio.js`), l'unico che usa localStorage. Il passaggio ad app o database deve cambiare solo lo strato di salvataggio.
- Chiavi di localStorage con prefisso **`gestionale-casa:`** (tutti i siti GitHub Pages dello stesso account condividono lo stesso spazio). Se un salvataggio fallisce (es. spazio esaurito) mostrare un avviso chiaro, tenere i dati in memoria e proporre l'esportazione. Dati salvati illeggibili non vanno mai sovrascritti senza conferma.
- Ogni record ha **`id` univoco** (UUID) e **`creatoIl` / `modificatoIl`**; l'archivio ha **`schemaVersion`** e una **funzione di migrazione** (`schema.js`). Le eliminazioni lasciano una riga in `eliminati` (servono per unire archivi e per la sincronizzazione futura).
- **Importi in centesimi interi, energia in wattora interi** (24,3 kWh = 24300 Wh). Consumi delle bollette in millesimi dell'unità, ore in minuti, prezzo del kWh in milionesimi di euro. L'inserimento accetta il formato italiano; la visualizzazione è "1.234,56 €" e "24,3 kWh" (formattazione fatta a mano: `Intl` in italiano non mette il punto delle migliaia a 4 cifre).
- **Date salvate come AAAA-MM-GG**, mostrate come gg/mm/aaaa. Le funzioni che dipendono dalla data di oggi la **ricevono come parametro**; anche i timestamp ("ora") sono parametri.
- **Nessun valore di legge o di tariffa nel codice** (aliquote, contributi, regole GSE, percentuali di detrazione): sono campi che l'utente inserisce.
- **Allegati:** solo nome o link del documento.
- Interfaccia **in italiano**, comoda su uno schermo largo **380 px** con pulsanti adatti al tocco (almeno 44 px).
- **Eliminazioni, "Cancella tutto" e importazioni chiedono conferma.** L'importazione mostra un riepilogo e prima scarica un backup dei dati attuali.
- Non cambiare un risultato atteso di un test per farlo passare: se sembra sbagliato, fermarsi e spiegarlo all'utente.

## Test

```
node --test
```

Esegue tutti i file `test/*.test.js`. `test/regole.test.js` controlla in automatico le regole: niente `type="module"`, niente percorsi assoluti, niente chiamate di rete, localStorage solo in `js/salvataggio.js`, tutti gli script caricati da `index.html`, niente dati personali evidenti, logica senza DOM e senza `new Date()`.
A fine lavoro esegui anche `node --check` su ogni file JavaScript:

```
for f in $(find js test -name '*.js'); do node --check "$f" || echo "ERRORE $f"; done
```

Per provare la pagina vera c'è Chromium con Playwright (vedi l'ambiente): apri `index.html` con `file://`, larghezza 380 px, carica i dati di prova e verifica che la console non mostri errori.

## Come aggiungere una sezione

1. **Dati e migrazione** (`js/logica/schema.js`): aggiungi la collezione a `COLLEZIONI` e a `NOMI_COLLEZIONI`, alza `VERSIONE` e aggiungi in `PASSI` la funzione che porta i dati vecchi alla nuova versione (es. crea la collezione vuota). Mai rimuovere o rinominare campi senza migrazione. Se serve un collegamento da movimenti o impegni, aggiungi il tipo in `COLLEGAMENTI`.
2. **Funzioni pure con test** (`js/logica/<sezione>.js` + `test/<sezione>.test.js`): calcoli senza DOM, "oggi" e "ora" come parametri, importi in centesimi. Le modifiche restituiscono un nuovo archivio usando `GC.archivio` (`inserisci`, `aggiorna`, `elimina`).
3. **Schermata** (`js/interfaccia/viste/<sezione>.js`): registra `GC.viste.<id>` con `titolo` e `render(rotta)`; gestori in `GC.azioni`, `GC.moduli`, `GC.cambi`; dati sempre passati da `ui.esc()`. Aggiungi la voce di navigazione in `app.js` e lo script in `index.html` (dopo la logica, prima di `app.js`).
4. **Collegamento a registro e impegni:** i costi sono movimenti con `collegamento: { tipo, id }` (usa `GC.forme.movimento` per il modulo); le date da ricordare entrano nell'elenco di `js/logica/impegni.js` (`elenco`), i controlli in `js/logica/controlli.js` (`CONTROLLI`), e se serve aggiungi dati inventati in `demo.js`.
5. Aggiorna README.md (dove l'utente inserisce i dati) e questo file.

## Flusso di lavoro

- Ogni sessione lavora sul **proprio ramo** (mai direttamente su `main`).
- A fine di ogni fase: tutti i test, `node --check` su ogni file JS, verifica delle regole; poi **commit e push** del ramo, così il lavoro è salvo anche se la sessione si interrompe.
- La sessione si chiude con una **pull request verso `main`**; dopo l'unione GitHub Pages pubblica il sito.
- Le idee nuove non richieste vanno proposte all'utente (o tra i prossimi passi del report), non scritte nel codice.

## Direzione futura

1. Oggi: sito statico su GitHub Pages, dati nel browser di ogni dispositivo, backup JSON e importazione "Unisci" per allineare due dispositivi.
2. Poi: **app per telefono con dati condivisi in famiglia**. Per questo i dati hanno già id univoci generati sul dispositivo, date di modifica, `eliminati` per propagare le cancellazioni, collezioni piatte con collegamenti per id (corrispondono a tabelle di un database) e uno strato di salvataggio asincrono (Promise) da sostituire con un database sincronizzato, lasciando invariate logica e interfaccia.
