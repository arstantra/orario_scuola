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

## Generare o aggiornare data-enc.js

1. Doppio clic su `cifra.html` (funziona offline, non manda niente in rete).
2. Scegli il JSON in chiaro — `dati-originali.json` nella cartella superiore, oppure un backup
   esportato dall'app — scrivi due volte la passphrase, premi *Cifra e scarica*.
3. Sposta il `data-enc.js` scaricato in questa cartella, sovrascrivendo il precedente.
4. Alza la versione della cache in `sw.js` (`const CACHE = 'orario-tasso-v2'`, poi v3…) così i
   dispositivi già installati scaricano la versione nuova invece di usare quella in cache.
5. Commit e push.

In alternativa, dall'app: *Impostazioni → Esporta data-enc.js* rigenera il file con la passphrase
già in uso, includendo le modifiche fatte sul dispositivo.

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

Le modifiche alle celle restano nel `localStorage` del singolo dispositivo e non si sincronizzano
fra telefono, tablet e computer: per spostarle si usa *Impostazioni → Esporta backup JSON* e
*Importa backup JSON*. Per cambiare l'orario di partenza su tutti i dispositivi si rigenera
`data-enc.js` e si fa push.

Dati ricavati da `Docenti- ORARIO PROVVISORIO_con L2- 21settembre-25 settembre.xlsx`
(orario provvisorio, 44 docenti, 13 classi).
