/* Orario T. Tasso — tabellone.js
   Lettura del tabellone della scuola (.xlsx o .csv) e conversione nel modello dati dell'app.
   Usato da index.html (Impostazioni → Carica nuovo orario) e da cifra.html. Nessuna dipendenza. */
// <core> — lettura del tabellone (usata anche dai test)
/* global window */
const TAB = (() => {
  const CLS = /^[123][A-F]$/;
  const LUOGHI = { BOIARDO: 'Boiardo', BAURA: 'Baura', DANTE: 'Dante', PONTE: 'Ponte', DEPISIS: 'De Pisis', ITI: 'ITI', BACHELET: 'Bachelet' };
  const SINGOLI = { P: 'Potenziamento', POT: 'Potenziamento', UFF: 'Ufficio', LAB: 'Laboratorio' };
  const GIORNI = ['LUN', 'MAR', 'MER', 'GIO', 'VEN'];
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'docente';
  const ent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&');

  async function unzip(buf) {
    const u = new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength), out = {};
    let e = u.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('non è un file .xlsx');
    let p = dv.getUint32(e + 16, true);
    const n = dv.getUint16(e + 10, true);
    for (let i = 0; i < n; i++) {
      const met = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const lo = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + xl + cl;
      if (!/^xl\/(workbook\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(name)) continue;
      const d0 = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      const raw = u.subarray(d0, d0 + cs);
      let data = raw;
      if (met === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else if (met !== 0) throw new Error('compressione non supportata');
      out[name] = new TextDecoder().decode(data);
    }
    return out;
  }
  const colN = s => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; };

  async function leggiFoglio(buf) {
    const z = await unzip(buf);
    const ss = [];
    (z['xl/sharedStrings.xml'] || '').replace(/<si>([\s\S]*?)<\/si>/g, (m, si) => {
      let t = ''; si.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, (m2, x) => { t += x; }); ss.push(ent(t)); return m;
    });
    const wb = z['xl/workbook.xml'] || '', rels = z['xl/_rels/workbook.xml.rels'] || '';
    const fogli = []; wb.replace(/<sheet\b[^>]*>/g, m => {
      const nm = (/name="([^"]*)"/.exec(m) || [])[1], id = (/r:id="([^"]*)"/.exec(m) || [])[1];
      fogli.push({ nome: ent(nm || ''), id }); return m;
    });
    const f = fogli.find(x => norm(x.nome) === 'vuoto') || fogli[0];
    if (!f) throw new Error('nessun foglio nel file');
    let target = null;
    rels.replace(/<Relationship\b[^>]*>/g, m => {
      if ((/Id="([^"]*)"/.exec(m) || [])[1] === f.id) target = (/Target="([^"]*)"/.exec(m) || [])[1]; return m;
    });
    target = target ? 'xl/' + target.replace(/^\/?xl\//, '').replace(/^\//, '') : 'xl/worksheets/sheet1.xml';
    const xml = z[target]; if (!xml) throw new Error('foglio non trovato');
    const g = {};
    xml.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (m, c, r, at, body) => {
      if (!body) return m;
      const t = (/\bt="([^"]*)"/.exec(at) || [])[1];
      let v = null;
      if (t === 'inlineStr') { v = ''; body.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, (m2, x) => { v += x; }); v = ent(v); }
      else { const vv = /<v>([\s\S]*?)<\/v>/.exec(body); if (vv) v = t === 's' ? ss[+vv[1]] : ent(vv[1]); }
      if (v != null) (g[+r] = g[+r] || {})[colN(c)] = v;
      return m;
    });
    return { get: (r, c) => { const x = (g[r] || {})[c]; return x == null ? '' : String(x).trim(); }, maxRow: Math.max(0, ...Object.keys(g).map(Number)), nomeFoglio: f.nome };
  }

  function materiaDa(catt) {
    const out = [];
    for (const tok of String(catt || '').toUpperCase().split(/\s+/)) {
      if (!tok) continue;
      if (/^(CORSO|CORSI|TUTTE)$/.test(tok) || !/^([A-ZÀ-Ü]+|L2)$/.test(tok)) break;
      out.push(tok);
    }
    return out.join(' ');
  }
  function ruoloDa(m) {
    const x = norm(m).toUpperCase();
    if (x.indexOf('SOSTEGNO') >= 0) return 'sostegno';
    if (x.indexOf('EDUCAT') >= 0) return 'educatore';
    if (x.indexOf('L2') >= 0) return 'l2';
    return 'curricolare';
  }
  const titolo = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  /* una giornata: ricompone le sigle spezzate su celle consecutive */
  function giornata(raw, strani) {
    const t = raw.map(v => String(v || '').trim()), out = t.map(() => '');
    let i = 0;
    while (i < t.length) {
      const v = t[i], V = v.toUpperCase();
      if (!v) { i++; continue; }
      if (CLS.test(V)) { out[i] = V; i++; continue; }
      if (V === 'X') { out[i] = 'X'; i++; continue; }
      let j = i; while (j < t.length && t[j] && !CLS.test(t[j].toUpperCase()) && t[j].toUpperCase() !== 'X') j++;
      let k = i, ignoto = [];
      const chiudi = () => { if (!ignoto.length) return; const lab = ignoto.length > 1 ? titolo(ignoto.map(x => t[x]).join('')) : t[ignoto[0]]; ignoto.forEach(x => { out[x] = lab; }); strani.add(lab); ignoto = []; };
      while (k < j) {
        let m = -1;
        for (let e = j; e > k; e--) if (LUOGHI[t.slice(k, e).join('').toUpperCase().replace(/\s+/g, '')]) { m = e; break; }
        if (m > 0) { chiudi(); const lab = LUOGHI[t.slice(k, m).join('').toUpperCase().replace(/\s+/g, '')]; for (let x = k; x < m; x++) out[x] = lab; k = m; continue; }
        const s = SINGOLI[t[k].toUpperCase()];
        if (s) { chiudi(); out[k] = s; } else ignoto.push(k);
        k++;
      }
      chiudi();
      i = j;
    }
    return out;
  }

  /* dal foglio al modello dati dell'app */
  function converti(sh, base, nomeFile) {
    let rOre = 0, rDoc = 0;
    for (let r = 1; r <= Math.min(sh.maxRow, 30); r++) {
      const b = norm(sh.get(r, 2));
      if (b === 'ore' && !rOre) rOre = r;
      if (b === 'docenti' && !rDoc) rDoc = r;
    }
    if (!rOre) throw new Error('non trovo la riga "ore" nella colonna B');
    const gruppi = []; let cur = null;
    for (let c = 3; c <= 120; c++) {
      const v = sh.get(rOre, c);
      if (/^\d+(\.0+)?$/.test(v)) { if (!cur) { cur = []; gruppi.push(cur); } cur.push(c); } else cur = null;
    }
    if (gruppi.length < 5) throw new Error('trovo ' + gruppi.length + ' giorni invece di 5 nella riga "ore"');
    const giorni = gruppi.slice(0, 5).map((cols, i) => {
      const h = norm(sh.get(rOre - 1, cols[0])).toUpperCase().slice(0, 3);
      return { g: GIORNI.indexOf(h) >= 0 ? h : GIORNI[i], cols };
    });
    const nOre = Math.max(...giorni.map(x => x.cols.length));
    const strani = new Set(), docenti = [], usati = {};
    let r = (rDoc || rOre + 1) + 1;
    for (; r <= sh.maxRow; r++) {
      const nome = sh.get(r, 2).replace(/\s+/g, ' ');
      if (!nome) { if (docenti.length) break; else continue; }
      const cattedra = sh.get(r, 3);
      let id = slug(nome); if (usati[id]) { let n = 2; while (usati[id + '-' + n]) n++; id += '-' + n; } usati[id] = 1;
      const materia = materiaDa(cattedra);
      const celle = {};
      giorni.forEach(x => {
        const v = giornata(x.cols.map(c => sh.get(r, c)), strani);
        while (v.length < nOre) v.push('');
        celle[x.g] = v;
      });
      docenti.push({ id, nome, cattedra, materia, ruolo: ruoloDa(materia), celle });
    }
    if (!docenti.length) throw new Error('nessun docente trovato sotto la riga "DOCENTI"');
    base = base || {};
    const io = docenti.some(t => t.id === base.io) ? base.io : (docenti.find(t => t.id === 'poletti-andrea') || docenti[0]).id;
    const data = {
      meta: Object.assign({ scuola: 'IC "C. Govoni" — Sec. I grado "T. Tasso"', anno: '2026/2027', nota: 'Orario provvisorio' },
        base.meta || {}, { fonte: nomeFile || '', generato: new Date().toISOString() }),
      giorni: GIORNI.slice(),
      giorniLunghi: base.giorniLunghi || { LUN: 'Lunedì', MAR: 'Martedì', MER: 'Mercoledì', GIO: 'Giovedì', VEN: 'Venerdì' },
      orari: base.orari && base.orari.length ? base.orari : ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00'].slice(0, nOre),
      io, docenti
    };
    if (base.pause) data.pause = base.pause;
    return { data, strani: [...strani], nOre };
  }

  /* cosa cambia rispetto all'orario attuale */
  function confronta(prima, dopo) {
    if (!prima) return null;
    const pm = {}; prima.docenti.forEach(t => { pm[t.id] = t; });
    const nuovi = [], celle = [];
    dopo.docenti.forEach(t => {
      const o = pm[t.id]; if (!o) { nuovi.push(t.nome); return; }
      delete pm[t.id];
      Object.keys(t.celle).forEach(g => t.celle[g].forEach((v, h) => { if ((v || '') !== ((o.celle[g] || [])[h] || '')) celle.push({ nome: t.nome, g, h, da: (o.celle[g] || [])[h] || '', a: v }); }));
    });
    return { nuovi, usciti: Object.values(pm).map(t => t.nome), celle };
  }
  /* ---- CSV: stesso tabellone salvato come testo, oppure elenco semplice ---- */
  function decodifica(buf) {                        // Excel italiano salva in ANSI (windows-1252), non in UTF-8
    const u = new Uint8Array(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('windows-1252').decode(u); }
  }
  function righeCSV(txt) {
    txt = String(txt).replace(/^﻿/, '');
    const prime = txt.split(/\r?\n/).slice(0, 10).join('\n');
    const conta = ch => prime.split(ch).length;
    const sep = [';', ',', '\t'].sort((x, y) => conta(y) - conta(x))[0];
    const out = []; let riga = [], campo = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) {
        if (ch === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else q = false; }
        else campo += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { riga.push(campo); campo = ''; }
      else if (ch === '\n') { riga.push(campo); out.push(riga); riga = []; campo = ''; }
      else if (ch !== '\r') campo += ch;
    }
    if (campo !== '' || riga.length) { riga.push(campo); out.push(riga); }
    return out;
  }
  /* righe (array di array) -> stesso oggetto di leggiFoglio: get(riga, colonna) 1-based */
  function foglioDaRighe(rows) {
    return {
      get: (r, c) => { const x = (rows[r - 1] || [])[c - 1]; return x == null ? '' : String(x).trim(); },
      maxRow: rows.length, nomeFoglio: 'csv'
    };
  }
  /* elenco semplice "nome · materia · ruolo · cattedra" (senza ore) */
  function elenco(rows) {
    rows = rows.filter(r => r.some(c => String(c).trim()));
    if (!rows.length) throw new Error('il file è vuoto');
    let idx = { nome: 0, materia: 1, ruolo: 2, cattedra: 3 };
    const head = rows[0].map(norm);
    if (head.indexOf('nome') >= 0) {
      idx = { nome: head.indexOf('nome'), materia: head.indexOf('materia'), ruolo: head.indexOf('ruolo'), cattedra: head.indexOf('cattedra') };
      rows = rows.slice(1);
    }
    const val = (r, i) => (i >= 0 && r[i] != null) ? String(r[i]).trim() : '';
    const docenti = [], usati = {};
    rows.forEach(r => {
      const nome = val(r, idx.nome).replace(/\s+/g, ' '); if (!nome) return;
      let id = slug(nome); if (usati[id]) { let n = 2; while (usati[id + '-' + n]) n++; id += '-' + n; } usati[id] = 1;
      const cattedra = val(r, idx.cattedra), materia = val(r, idx.materia) || materiaDa(cattedra);
      let ruolo = norm(val(r, idx.ruolo)).replace('educatrice', 'educatore').replace('italiano l2', 'l2');
      if (['curricolare', 'l2', 'sostegno', 'educatore'].indexOf(ruolo) < 0) ruolo = ruoloDa(materia);
      docenti.push({ id, nome, cattedra, materia, ruolo, celle: {} });
    });
    if (!docenti.length) throw new Error('nessun docente nel file');
    return docenti;
  }
  /* un file qualsiasi (xlsx o csv) -> { docenti, nOre, strani, formato } */
  async function leggiFile(buf, nomeFile, base) {
    const u = new Uint8Array(buf);
    if (u[0] === 0x50 && u[1] === 0x4b) {             // "PK": è un .xlsx
      const r = converti(await leggiFoglio(buf), base, nomeFile);
      return { docenti: r.data.docenti, nOre: r.nOre, strani: r.strani, formato: 'Excel' };
    }
    const rows = righeCSV(decodifica(buf));
    const sh = foglioDaRighe(rows);
    let tabellone = false;
    for (let r = 1; r <= Math.min(sh.maxRow, 30); r++) if (norm(sh.get(r, 2)) === 'ore') { tabellone = true; break; }
    if (tabellone) {
      const r = converti(sh, base, nomeFile);
      return { docenti: r.data.docenti, nOre: r.nOre, strani: r.strani, formato: 'CSV (tabellone)' };
    }
    return { docenti: elenco(rows), nOre: 0, strani: [], formato: 'CSV (solo elenco, senza ore)' };
  }
  return { leggiFoglio, converti, confronta, giornata, materiaDa, righeCSV, foglioDaRighe, leggiFile };
})();
// </core>
if (typeof window !== 'undefined') window.TAB = TAB;
if (typeof module !== 'undefined') module.exports = TAB;
