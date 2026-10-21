# Gestionale casa

Programma per tenere sotto controllo i costi della casa, i lavori e le manutenzioni, il personale, gli animali, gli impegni e l'impianto fotovoltaico. Funziona nel browser, sul computer e sul telefono, senza installare niente.

## Dove aprirlo

**Link (GitHub Pages):** https://esopo01.github.io/-gestionale-casa./

Il link funziona dopo che il lavoro è stato unito nel ramo `main` e GitHub Pages è attivo. Se il link dà "404", attivalo una volta sola così:
GitHub → repository → **Settings** → **Pages** → *Build and deployment* → Source: **Deploy from a branch** → Branch: **main**, cartella **/ (root)** → **Save**. Dopo un paio di minuti il link funziona.

> Il nome del repository finisce con un punto (`-gestionale-casa.`): quando copi o mandi il link, controlla che il punto prima della barra finale non vada perso.

**In alternativa, senza internet:** sulla pagina del repository premi **Code → Download ZIP**, estrai la cartella e apri `index.html` con un doppio clic (Chrome, Edge, Firefox o Safari). Funziona allo stesso modo, ma ha un archivio dati separato da quello del link (vedi sotto).

Sul telefono: apri il link e, dal menu del browser, scegli **Aggiungi a schermata Home** per averlo come un'app.

## Dove stanno i dati

I dati restano **solo nel browser del dispositivo che li inserisce**: non vengono inviati a nessun server, nemmeno a GitHub.

- Telefono e computer hanno **archivi separati**: quello che inserisci sul telefono non compare sul computer, e viceversa.
- Anche browser diversi sullo stesso dispositivo (es. Chrome ed Edge) hanno archivi separati.
- Il link di GitHub Pages e il file `index.html` aperto dal computer hanno archivi separati.

### Cosa può farli sparire o renderli invisibili

- **Cancellare i dati di navigazione** del browser ("cookie e dati dei siti"): i dati vengono eliminati.
- Usare la **navigazione privata / in incognito**: i dati spariscono alla chiusura della finestra.
- Aprire il programma da **un altro browser, un altro dispositivo o un altro indirizzo** (es. il file scaricato invece del link): i dati ci sono ancora, ma nell'altro posto.
- Su iPhone e iPad, Safari può cancellare i dati dei siti non aperti per diverse settimane: aprilo regolarmente e fai backup.
- Programmi di "pulizia" del telefono o del computer che svuotano i dati dei browser.

Per questo il programma ti avvisa se l'ultimo backup è più vecchio di 7 giorni (valore modificabile).

## Backup, ripristino e passaggio a un altro dispositivo

- **Backup:** Impostazioni → *Backup e dati* → **Esporta backup** (oppure "Fai backup ora" nella Home). Scarica un file `gestionale-casa-backup-AAAA-MM-GG.json` con tutti i dati: conservalo fuori dal browser, ad esempio su Google Drive.
- **Ripristino:** Impostazioni → *Backup e dati* → **Importa un backup…** → scegli il file. Il programma mostra un riepilogo e chiede come procedere; prima di modificare qualsiasi cosa scarica in automatico un backup dei dati attuali.
  - **Sostituisci tutto:** i dati del browser diventano quelli del file.
  - **Unisci:** tiene i dati di entrambi; per ogni elemento vale la modifica più recente e le eliminazioni passano dall'uno all'altro.
- **Passare i dati a un altro dispositivo** (es. dal computer al telefono): sul primo fai *Esporta backup*, porta il file sul secondo (Google Drive, email a te stesso…), sul secondo fai *Importa un backup → Sostituisci tutto*.
- **Usarlo in più persone su dispositivi diversi:** ogni tanto esporta il backup da un dispositivo e importalo sull'altro con **Unisci**, poi fai il contrario. Così entrambi hanno tutti i dati. In futuro l'app per telefono condividerà i dati da sola.

## Dove inserire i dati della casa

Tutto ciò che cambia da casa a casa si inserisce nel programma, non nei file:

- **Impostazioni → Famiglia e conti:** le persone della famiglia (per "chi se ne occupa") e i conti o mezzi di pagamento.
- **Impostazioni → Categorie:** rinomina, aggiungi o archivia categorie e sottocategorie.
- **Impostazioni → Soglie:** le soglie degli avvisi (bollette +30%, produzione sotto il 70%, backup dopo 7 giorni, finestra di 30 giorni, tolleranza sul personale, mesi di ricorrenze generati in anticipo).
- **Impostazioni → Impianto:** potenza, batteria e capacità, regime con il GSE (Scambio sul Posto, Ritiro Dedicato, comunità energetica o nessuno), data di attivazione, costo, produzione attesa mese per mese, costo variabile del kWh di riserva.
- **Movimenti → Ricorrenze:** mutuo o affitto, condominio, assicurazioni, abbonamenti, contributi.
- **Movimenti → Bollette:** per luce, gas e acqua inserisci periodo e consumo; per la luce anche la quota fissa (quote fisse + quota potenza), da cui il programma ricava il costo variabile del kWh.
- **Personale:** una scheda per persona con tipo di rapporto, orario e storico delle paghe. Il programma registra importi e scadenze ma non calcola contributi né importi di legge.
- **Lavori, Animali, Energia:** le rispettive schede. Le percentuali e gli anni di detrazione dei lavori li inserisci tu; i ricavi GSE si registrano come entrate in *Energia › Ricavi GSE*, copiandoli dagli estratti del GSE.

Per provare il programma prima di inserire i dati veri: Impostazioni → *Backup e dati* → **Carica dati di prova** (14 mesi di dati inventati). Quando hai finito, **Cancella tutto** e parti con i tuoi dati.

## Note

- Gli allegati non vengono salvati: in ogni movimento puoi scrivere il nome del file o il link (es. a Google Drive).
- Il programma non usa internet: tutto è nel repository e nel tuo browser.
