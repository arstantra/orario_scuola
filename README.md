# Orario T. Tasso

App dell'orario settimanale della Scuola secondaria di primo grado "T. Tasso"
(IC "C. Govoni", Ferrara), anno 2026/2027.

PWA statica: HTML/CSS/JS vanilla, nessun framework, nessun backend, nessuna CDN.
Funziona offline, si installa come app, i dati sono cifrati con passphrase.

**In linea:** https://orario.nuovadidattica.eu

## Come è fatta

```
index.html      interfaccia
app.css         stile (mobile first, tema chiaro/scuro automatico)
app.js          logica, crittografia, salvataggio locale
sw.js           service worker — cache offline
manifest.json   PWA: standalone, icone, colori
icons/          192 e 512, normali e maskable
cifra.html      strumento locale per generare data-enc.js
data-enc.js     dati cifrati — unico file dati nel repo
CNAME           dominio custom di GitHub Pages
robots.txt      niente indicizzazione
```

I dati in chiaro (`dati-originali.json`, i backup esportati dall'app) **non stanno nel repo**:
sono nella cartella superiore e sono elencati in `.gitignore`.

## Sicurezza dei dati

`data-enc.js` contiene l'orario di tutti i docenti cifrato con **AES-GCM 256 bit**, chiave derivata
dalla passphrase con **PBKDF2-SHA256, 310.000 iterazioni**. Senza passphrase il file è inutilizzabile,
quindi il repo può restare pubblico. Anche le modifiche salvate in `localStorage` sono cifrate con
la stessa chiave. La passphrase non è recuperabile: se si perde, si rigenera `data-enc.js` dal JSON
in chiaro con `cifra.html`.

## Quando arriva un nuovo tabellone Excel

Il tabellone della scuola è la fonte di verità della griglia.

1. Salva il file in `../tabelloni/` con la data davanti (`2026-09-29_ORARIO....xlsx`). Non sovrascrivere mai
   i tabelloni vecchi.
2. Apri `cifra.html` da questa cartella (doppio clic, lavora offline). Nella sezione **1** scegli l'Excel,
   scrivi la passphrase di sempre e premi il pulsante. La pagina ti dice quante celle sono cambiate, chi è
   entrato e chi è uscito, e cosa cambia nel tuo orario.
3. Sposta il `data-enc.js` scaricato qui al posto del vecchio, alza `CACHE` in `sw.js`, commit e push.
4. Telefono e tablet adottano il nuovo orario da soli alla prima apertura, senza chiedere la passphrase.
   La griglia arriva dall'Excel; restano **fasce orarie, intervalli, materia e ruolo, "io", docenti
   aggiunti a mano, sostituzioni sulle ore rimaste uguali, coordinatori ed eccezioni dei consigli di classe**. Se l'Excel riscrive celle modificate a mano,
   l'app le elenca e offre *Rimetti le mie*. Prima di tutto fa una copia di sicurezza.

`cifra.html` riusa sempre il salt del `data-enc.js` presente: per questo la passphrase deve restare
la stessa. Con la sezione **2** si cifra un JSON in chiaro; con la **3** si apre qualunque `data-enc.js`,
anche preso dalla storia di GitHub, e se ne scarica il JSON in chiaro.

## Copie di sicurezza

- **Sul dispositivo, automatiche:** *Impostazioni → Versioni precedenti*. Una al giorno più una prima di
  ogni azione che cancella (ripristina, importa JSON o CSV, elimina ora, elimina docente, nuovo orario,
  ripristino). Si tengono le ultime 14.
- **Fuori dal dispositivo:** *Esporta backup JSON* (la riga dice la data dell'ultimo; diventa arancione
  dopo 30 giorni). Il file va in `../backup/`.
- **Fuori dall'account Microsoft:** ogni `data-enc.js` pubblicato resta nella storia di GitHub.
- Se un salvataggio locale non si apre più, l'app non lo sovrascrive: lo mette da parte in
  `orario.tasso.orfano`.

## Deploy (GitHub Pages + dominio custom)

- Repo pubblico, questa cartella è la radice del repo.
- Settings → Pages → Source: *Deploy from a branch*, branch `main`, cartella `/ (root)`.
- Custom domain: `orario.nuovadidattica.eu` (il file `CNAME` lo imposta già), poi spunta
  **Enforce HTTPS** appena il certificato è pronto.
- DNS del dominio `nuovadidattica.eu`: record **CNAME**, host `orario`, valore
  `<utente-github>.github.io.` — la propagazione può richiedere da pochi minuti a qualche ora.

## Installazione come app

- **Edge / Chrome su Android:** apri il sito, menu **⋯** → **App** → *Installa questo sito come app*.
- **Safari su iPhone/iPad:** Condividi → *Aggiungi a Home*.
- **Edge su Windows:** icona **⋯** nella barra → *App* → *Installa questo sito come app*.

## Note d'uso

**Classi** (v1.4): quadro orario settimanale di ogni classe (le proprie in cima) e consiglio di classe
ricavato dall'orario, con ore settimanali per docente. Si può segnare il coordinatore e aggiungere o togliere
a mano un docente dal consiglio senza toccare l'orario.

Le modifiche alle celle restano nel `localStorage` del singolo dispositivo e non si sincronizzano
fra telefono e tablet: per spostarle si usa *Esporta backup JSON* e *Importa backup JSON*. Per cambiare
l'orario su tutti i dispositivi si fa il giro del nuovo tabellone (sopra), oppure dall'app *Esporta
data-enc.js*, che pubblica come nuovo orario di base quello del dispositivo.

Dati ricavati da `Docenti- ORARIO PROVVISORIO_con L2- 21settembre-25 settembre.xlsx`
(orario provvisorio, 44 docenti, 13 classi).
