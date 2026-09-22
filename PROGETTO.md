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
- **Fuori dal repo,** nella cartella superiore: `tabelloni/` (ogni Excel ricevuto, datato, mai sovrascritto),
  `backup/` (backup JSON esportati) e `dati-originali.json`

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
- `salva()` scrive anche `salt` e `iter` accanto al blob: se un giorno `data-enc.js` venisse rigenerato con
  un salt diverso, all'inserimento della passphrase i dati locali si riaprono lo stesso. Se non si aprono,
  `leggiLocale()` li mette in `orario.tasso.orfano` invece di sovrascriverli.
- **Istantanee locali** in `orario.tasso.snap` (lista, ultime 14): copia del blob cifrato una volta al
  giorno e prima di ogni azione distruttiva. *Impostazioni → Versioni precedenti*.
- `orario.tasso.export` = data dell'ultimo *Esporta backup JSON* (riga arancione dopo 30 giorni).
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
cifra.html      strumento locale autonomo: tabellone .xlsx (o JSON) + passphrase -> data-enc.js,
                stesso salt del data-enc.js presente; apre anche vecchi data-enc.js
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
  "orari": [ { "da": "08:00", "a": "08:55" }, { "da": "08:55", "a": "09:50" } ],
  "pause": [ { "dopo": 2, "da": "09:50", "a": "10:00", "nome": "Intervallo" } ],
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

- `orari` sono le **ore di lezione**, una per riga della griglia: inizio e fine. Il numero di ore
  **non è più fisso a 6**, si aggiungono e si tolgono dalle Impostazioni; le viste ciclano su
  `NORE()` (= `DATA.orari.length`).
- `pause` sono gli **intervalli fra un'ora e l'altra**: `dopo` è il numero (1-based) dell'ora che
  li precede ed è sempre < numero di ore. Non occupano una colonna della griglia, si disegnano
  soltanto (home e scheda docente).
- **Migrazione automatica in `normalizza()`:** `migraOrari()` converte il vecchio array di stringhe
  (`["08:00", …]`, ogni ora finiva dove cominciava la successiva) e `migraPause()`, la prima volta,
  ritaglia 10 minuti in coda alla 2ª e alla 4ª ora per creare i due intervalli. Vecchi backup e dati
  già salvati sui dispositivi restano importabili.
- `celle[giorno]` è **sempre** un array lungo quanto `orari` (`normalizza()` lo garantisce).
- Una cella è una **classe** se corrisponde a `/^[123][ABCDEF]$/`; altrimenti è testo libero
  (`"Boiardo"`, `"Potenziamento"`, `"Ufficio"`, `"Laboratorio"`, `"X"`, una nota…) o vuota.
- `ruolo` ∈ `curricolare` | `l2` | `sostegno` | `educatore`. Si deriva da `materia`
  (`ruoloDaMateria()`) ma è un campo proprio, modificabile dall'app. Il vecchio valore
  `educatrice` viene convertito in `educatore` da `normalizza()`.
- `sost` è la mappa delle **sostituzioni**: chiave `"GIORNO|ORA"` (ora 0-based), valore `1`.
  Segna le ore in cui quel docente è **da solo** in classe. `normalizza()` la crea vuota se manca,
  quindi i dati e i backup precedenti restano importabili.
- `io` è l'`id` del docente mostrato in home (cambiabile da Impostazioni).
- Campi solo locali (mai in `data-enc.js`): `base` (= `meta.generato` dell'orario da cui derivano i dati),
  `baseIds` (docenti di quel tabellone), `man` (celle diverse dal tabellone, ricalcolate a ogni `salva()`),
  `manuale: true` sui docenti aggiunti dall'app o da CSV.
- **Nuovo tabellone = nuovo `meta.generato`** (timestamp ISO scritto da `cifra.html`). In `apri()`, se
  `DATA.base` è diverso, `fondi()` prende la griglia e la cattedra dall'Excel e conserva fasce orarie,
  intervalli, materia, ruolo, `io`, docenti manuali e sostituzioni sulle ore rimaste uguali. I docenti
  usciti dal tabellone vengono tolti. Le celle in `man` riscritte dall'Excel si mostrano in un modale con
  *Rimetti le mie*. Prima fa un'istantanea.
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
Lo fa `cifra.html` (sezione 1), nel browser, senza Python: il blocco `// <core>` legge l'xlsx
(unzip con `DecompressionStream`, XML con regex) secondo questa mappa, che si ricava da sola dal foglio:

- foglio `vuoto` (o il primo); la riga con `ore` in colonna B dà i numeri d'ora, la riga sopra i giorni;
  i docenti partono dalla riga dopo `DOCENTI` e finiscono alla prima riga con B vuota
- colonna `B` = nome, colonna `C` = cattedra; materia = parole iniziali della cattedra fino a
  `CORSO`/`CORSI`/`TUTTE` o a una sigla
- le sigle degli altri plessi **spezzate su celle consecutive** (`BO|IAR|DO`) si ricompongono cercando il
  nome più lungo noto (Boiardo, Baura, Dante, Ponte, De Pisis, ITI, Bachelet); le sconosciute vengono
  ricomposte e segnalate
- `P`/`POT` = Potenziamento, `UFF` = Ufficio, `Lab` = Laboratorio, `X` = **ignoto**
- verificato: sul tabellone del 21-25 settembre riproduce `dati-originali.json` cella per cella
- il `sw.js` serve `data-enc.js` **prima dalla rete** (4 s, poi cache): il nuovo orario arriva alla
  prima apertura

**Cambiare le fasce orarie**
Tutto da *Impostazioni → Orario delle lezioni*: ogni riga ha inizio, fine e durata calcolata.
Si aggiunge un'ora in coda, si aggiunge un intervallo scegliendo dopo quale ora, si rinomina
l'intervallo scrivendoci dentro, si toglie una riga con la ×. *Ricalcola in sequenza* rimette
tutto in fila dall'inizio della 1ª ora mantenendo le durate: serve quando gli orari si
sovrappongono (l'app lo segnala). **Eliminare un'ora cancella quella colonna per tutti i
docenti** e fa scalare le successive, comprese le sostituzioni: c'è una conferma.

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
- **Copie di sicurezza (set 2026):** scelta semplice, niente Drive. Fonte di verità = tabelloni in
  `tabelloni/`; storia datata = commit di `data-enc.js` su GitHub; errori = istantanee locali; perdita del
  dispositivo = backup JSON manuale (le correzioni fatte a mano fra un tabellone e l'altro sono l'unica
  cosa esposta).
- **Nessuna sincronizzazione fra dispositivi:** le modifiche restano sul singolo apparecchio,
  si spostano con export/import JSON. Se un giorno servisse la sincronia vera servirebbe un
  backend, che è fuori dai vincoli attuali.

## 10. Idee non implementate

Vista per classe; evidenza dell'ora corrente in home; note per cella (oltre al testo libero);
stampa/PDF della settimana; confronto fra due versioni dell'orario; elenco delle sole ore
segnate come sostituzione.
