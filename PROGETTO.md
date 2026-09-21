# PROGETTO.md — Orario T. Tasso

Documento di consegna per riprendere il progetto in una chat nuova.
Allega questo file (o aprilo nel progetto Claude "Orario scolastico") prima di chiedere modifiche.

---

## 1. Cos'è

App web dell'orario settimanale della **Scuola secondaria di primo grado "T. Tasso"**
(IC "C. Govoni", Ferrara), anno **2026/2027**, fatta per **Andrea Poletti, docente di sostegno**
(cattedra 1D + 1C + 2B).

Serve a due cose: vedere giorno per giorno il proprio orario **con il docente curricolare in
compresenza**, e trovare al volo l'orario di un collega.

- **Online:** https://orario.nuovadidattica.eu
- **Repo:** https://github.com/arstantra/orario_scuola — pubblico, branch `main`
- **Repo locale:** `...\Area_Istruzione\AA 2026 - 2027\040_Orario scolastico\orario_scuola\`
- **Fuori dal repo,** nella cartella superiore: il tabellone `.xlsx` e `dati-originali.json`

## 2. Vincoli di progetto (da rispettare in ogni modifica)

- **Statica pura:** HTML/CSS/JS vanilla. Niente framework, niente backend, niente CDN, niente
  build step. Deve funzionare aperta da file locale e da GitHub Pages.
- **PWA completa:** manifest `standalone`, service worker con cache offline, icone 192/512
  normali e maskable. Deve restare installabile da Edge/Chrome Android, Safari iOS, Edge Windows.
- **Mobile first:** celle leggibili senza zoom, target touch ampi, nessuna tabella che sfora
  lateralmente. Buona anche su tablet (contenuto centrato, `max-width: 760px`).
- **Grafica minimale:** poche cose ben leggibili, non un cruscotto. Tema chiaro/scuro automatico.
- **Tutto modificabile dall'app:** l'orario è provvisorio, nessuna variazione deve richiedere
  di toccare il codice.
- **Repo sempre pulito:** solo i file elencati al §4, nessun dato in chiaro, nessun file di lavoro.
- **Lingua dell'interfaccia: italiano.**

## 3. Sicurezza dei dati

Il repo è pubblico ma contiene l'orario di 44 docenti, quindi i dati stanno solo in `data-enc.js`:

- **AES-GCM 256 bit**, chiave derivata dalla passphrase con **PBKDF2-SHA256, 310.000 iterazioni**,
  salt 16 byte, IV 12 byte, tutto in base64 dentro `window.ORARIO_ENC`.
- È un file `.js` e non `.json` apposta: così si carica con `<script src>` e l'app funziona anche
  da `file://`, dove `fetch()` sarebbe bloccato dalla CORS.
- Le modifiche dell'utente stanno in `localStorage`, **cifrate con la stessa chiave**
  (`orario.tasso.data`). Con "ricorda su questo dispositivo" la chiave esportata sta in
  `orario.tasso.key`.
- La passphrase non è nel codice e non va mai chiesta né scritta da nessuna parte.
- `robots.txt` (Disallow) e `<meta name="robots" content="noindex, nofollow">` tengono il sito
  fuori dai motori di ricerca — e fanno anche sì che alcuni strumenti di fetch automatico non
  riescano a leggerlo: non è un errore.

## 4. File del repo

```
index.html      schermata di sblocco + guscio dell'app (topbar, main, tab bar)
app.css         stile completo; variabili colore su :root + blocco prefers-color-scheme: dark
app.js          tutta la logica (IIFE, 'use strict'): crypto, stato, render, modifica, impostazioni
sw.js           service worker, strategia stale-while-revalidate, const CACHE = 'orario-tasso-vN'
manifest.json   PWA
icons/          icon-192.png, icon-512.png, icon-192-maskable.png, icon-512-maskable.png
cifra.html      strumento locale autonomo: JSON in chiaro + passphrase -> data-enc.js
data-enc.js     i dati cifrati
CNAME           orario.nuovadidattica.eu
robots.txt      Disallow: /
.nojekyll       disattiva Jekyll su Pages
.gitignore      blocca dati-originali.json, orario-tasso-*.json, *.backup.json, file di sistema
.gitattributes  creato da GitHub Desktop (* text=auto)
README.md       istruzioni d'uso e di deploy
PROGETTO.md     questo file
```

## 5. Modello dati

Un unico oggetto, uguale in `dati-originali.json`, dentro `data-enc.js` e nei backup esportati:

```json
{
  "meta": { "scuola": "...", "anno": "2026/2027", "fonte": "...xlsx",
            "generato": "2026-09-20", "nota": "Orario provvisorio" },
  "giorni": ["LUN","MAR","MER","GIO","VEN"],
  "giorniLunghi": { "LUN": "Lunedì", "...": "..." },
  "orari": ["08:00","09:00","10:00","11:00","12:00","13:00"],
  "io": "poletti-andrea",
  "docenti": [
    { "id": "poletti-andrea",
      "nome": "Poletti Andrea",
      "cattedra": "SOSTEGNO 1D (6) + 1C (6) + 2B (6)",
      "materia": "SOSTEGNO",
      "ruolo": "sostegno",
      "celle": { "LUN": ["","2B","1D","2B","",""], "MAR": [...], "...": [...] },
      "sost":  { "MAR|3": 1 } }
  ]
}
```

- `celle[giorno]` è **sempre** un array di 6 stringhe (`normalizza()` lo garantisce).
- Una cella è una **classe** se corrisponde a `/^[123][ABCDEF]$/`; altrimenti è testo libero
  (`"Boiardo"`, `"Potenziamento"`, `"Ufficio"`, `"Laboratorio"`, `"X"`, una nota…) o vuota.
- `ruolo` ∈ `curricolare` | `l2` | `sostegno` | `educatore`. Si deriva da `materia`
  (`ruoloDaMateria()`) ma è un campo proprio, modificabile dall'app. Il vecchio valore
  `educatrice` viene convertito in `educatore` da `normalizza()`.
- `sost` è la mappa delle **sostituzioni**: chiave `"GIORNO|ORA"` (ora 0-based), valore `1`.
  Segna le ore in cui quel docente è **da solo** in classe. `normalizza()` la crea vuota se manca,
  quindi i dati e i backup precedenti restano importabili.
- `io` è l'`id` del docente mostrato in home (cambiabile da Impostazioni).
- **Le compresenze non sono memorizzate:** `compresenze(classe, giorno, ora)` in `app.js` scorre
  tutti i docenti a ogni render. È il punto chiave del progetto — così restano corrette dopo
  qualunque modifica alle celle.
- Di conseguenza **aggiungere un collega a un'ora = scrivere quella classe nella sua griglia**.
  La regola della scuola è: l'orario curricolare guida, sostegno ed educatori si agganciano.
  La materia non si scrive mai sull'ora: arriva sempre dall'anagrafica del docente presente.
  Se in un'ora la materia cambia, si cambia il collega che occupa quell'ora.

## 6. Come è organizzato `app.js`

Sezioni, nell'ordine: utilità → crypto → stato → avvio/sblocco → query sui dati → render
(`viewHome`, `viewColleghi`, `viewScheda`, `viewImpostazioni`) → modifica ora
(`editCella`, `pickCollega`) → anagrafica docenti (`editDocente`, `eliminaDocente`) →
CSV colleghi (`csvDocenti`, `leggiCSV`, `importaCSV`) → modali → azioni impostazioni →
navigazione → service worker.

- Stato globale: `KEY` (CryptoKey), `ORIGINALE` (dati da `data-enc.js`), `DATA` (dati correnti),
  più `tab`, `giorno`, `schedaId`, `filtro`.
- `render()` riscrive `#view` per intero, nessun diffing.
- Ogni cella modificabile ha `data-cell="GIORNO|ORA|IDDOCENTE"`; `bindCelle()` la collega a
  `editCella()`.
- `salva()` cifra `DATA` e scrive in `localStorage` a ogni modifica.
- **Il foglio "modifica ora" applica subito**, senza pulsante Salva: ogni tocco scrive in `DATA`,
  chiama `salva()` e `render()`, e ridisegna solo il proprio contenuto (`aggiorna()`). La classe
  scelta resta selezionata mentre si aggiungono colleghi o si segna la sostituzione.
- I modali si impilano (`openModal` aggiunge, `chiudiTop()` toglie l'ultimo, `closeModal()` tutti):
  serve per il selettore colleghi aperto sopra il foglio dell'ora.
- "Ripristina orario originale" = `DATA = clone(ORIGINALE)`, quindi `ORIGINALE` non va mai mutato.

## 7. Operazioni ricorrenti

**Aggiornare l'orario dopo una variazione della scuola**
Se è una modifica piccola: si fa dall'app, cella per cella. Per renderla permanente su tutti i
dispositivi: *Impostazioni → Esporta data-enc.js*, sostituire il file nel repo, alzare `CACHE`
in `sw.js`, commit e push.

**Rigenerare tutto da un nuovo tabellone .xlsx**
Il JSON si ricava con uno script Python (openpyxl) secondo questa mappa, da verificare ogni volta
perché il file della scuola può cambiare forma:

- foglio `vuoto`; riga 5 = numeri d'ora; riga 6 = intestazioni; docenti dalla riga 7 alla 50
- colonna `B` = nome, colonna `C` = cattedra
- giorni → colonne: LUN `D:I`, MAR `K:P`, MER `R:W`, GIO `Y:AD`, VEN `AF:AK`
- le sigle degli altri plessi sono **spezzate lettera per lettera su celle consecutive**
  (`BO|IAR|DO` → `BOIARDO`): vanno ricomposte per blocchi contigui, spezzando su `X`, e poi
  mappate a etichetta leggibile (Boiardo, Baura, Dante, Ponte, De Pisis, ITI)
- `P` ripetuta = Potenziamento, `UFF` = Ufficio, `Lab`/`lab` = Laboratorio, `X` = **ignoto**
- il JSON in chiaro va nella cartella superiore, **mai** nel repo; poi `cifra.html`

**Caricare o correggere l'elenco dei colleghi**
Da *Impostazioni → Colleghi*: si aggiunge un docente a mano, oppure si importa un CSV
(`nome · materia · ruolo · cattedra`, separatore `;` o `,`, intestazione facoltativa).
L'import **aggiorna chi c'è già** — confronto sul nome normalizzato — **aggiunge i nuovi e non
rimuove nessuno**; i nuovi nascono con la griglia vuota. `ruolo` vuoto viene dedotto dalla materia.
Da *Esporta elenco in CSV* si ottiene il file già nel formato giusto, da usare come modello.
Il singolo docente si modifica o si elimina dalla sua scheda in *Colleghi*.

**Aggiungere un campo ai dati**
Aggiornare lo script di generazione, `normalizza()` in `app.js` (per i dati già salvati sui
dispositivi, che non lo avranno) e il render. I backup vecchi devono continuare a importarsi.

**Dopo ogni modifica al codice**
Alzare `const CACHE` in `sw.js`, altrimenti i dispositivi già installati restano sulla versione
in cache.

## 8. Deploy

GitHub Desktop: commit su `main` → push. Pages è configurato su branch `main`, cartella `/ (root)`;
il `CNAME` imposta il dominio. DNS di `nuovadidattica.eu`: record CNAME, host `orario`, valore
`arstantra.github.io.` — già in funzione, con HTTPS. Il repo vive dentro OneDrive: se la
sincronizzazione litiga con `.git`, mettere OneDrive in pausa durante i push.

## 9. Questioni aperte

- **Manca un'ora di 1C** nell'orario di Andrea: la cattedra dichiara 18 ore, il tabellone ne
  riporta 17 (2B 6, 1D 6, 1C 5). Cella lasciata vuota apposta, si compila dall'app.
- **Sigla `X`**: 15 occorrenze nelle righe dei colleghi, quasi sempre accanto ai blocchi "altro
  plesso". Significato non confermato dalla scuola, lasciata com'è.
- **3F martedì 5ª ora**: tre curricolari nella stessa ora (Soriani lettere, Nasci tecnologia,
  Casula L2). Probabile refuso del tabellone, non corretto.
- Le doppie presenze curricolari in generale (39 celle) sono quasi tutte normali affiancamenti di
  **Italiano L2** (Casula, Ori) o **tedesco** (Zen): l'app le mostra entrambe con il `+`.
- **Nessuna sincronizzazione fra dispositivi:** le modifiche restano sul singolo apparecchio,
  si spostano con export/import JSON. Se un giorno servisse la sincronia vera servirebbe un
  backend, che è fuori dai vincoli attuali.

## 10. Idee non implementate

Vista per classe; evidenza dell'ora corrente in home; note per cella (oltre al testo libero);
stampa/PDF della settimana; confronto fra due versioni dell'orario; elenco delle sole ore
segnate come sostituzione.
