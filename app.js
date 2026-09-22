/* Orario T. Tasso — app.js  (v1.3)
   Vanilla JS, nessuna dipendenza. Dati cifrati AES-GCM, chiave da passphrase (PBKDF2).
   I dati modificati restano in localStorage, cifrati con la stessa chiave. */
(function () {
'use strict';

/* ============ utilità ============ */
const $ = (s, r) => (r || document).querySelector(s);
const enc = new TextEncoder(), dec = new TextDecoder();
const LS_DATA = 'orario.tasso.data', LS_KEY = 'orario.tasso.key';
const LS_SNAP = 'orario.tasso.snap', LS_ORFANO = 'orario.tasso.orfano', LS_EXPORT = 'orario.tasso.export';
const MAX_SNAP = 14;
const CLASSE = /^[123][ABCDEF]$/;
const DAYNAME = { LUN: 'Lunedì', MAR: 'Martedì', MER: 'Mercoledì', GIO: 'Giovedì', VEN: 'Venerdì' };
const RUOLI = { curricolare: 'Curricolare', l2: 'Italiano L2', sostegno: 'Sostegno', educatore: 'Educatore' };

/* ---- fasce orarie: ore { da, a } + intervalli { dopo, da, a, nome } ---- */
const ORARI_DEF = [['08:00', '08:55'], ['08:55', '09:50'], ['10:00', '10:55'], ['10:55', '11:50'], ['12:00', '12:55'], ['12:55', '13:50']];
const NORE = () => DATA.orari.length;
function mins(v) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v == null ? '' : v).trim()); return m ? (+m[1] * 60 + +m[2]) : null; }
function hhmm(t) { t = ((Math.round(t) % 1440) + 1440) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
function durata(o) { const a = mins(o && o.da), b = mins(o && o.a); return (a == null || b == null) ? null : ((b - a) + 1440) % 1440; }
function fascia(o) { return (!o || !o.da) ? '' : (o.a ? o.da + '–' + o.a : o.da); }
function fasciaHTML(o) { return (!o || !o.da) ? '' : `<span>${esc(o.da)}</span>${o.a ? `<span class="to">${esc(o.a)}</span>` : ''}`; }
function pausaDopo(n) { return (DATA.pause || []).find(p => p.dopo === n) || null; }
function timeline() {
  const out = [];
  for (let i = 0; i < NORE(); i++) {
    out.push({ tipo: 'ora', i: i, o: DATA.orari[i] });
    const p = pausaDopo(i + 1);
    if (p) out.push({ tipo: 'pausa', i: i, o: p });
  }
  return out;
}
function incoerente() {
  let prec = null;
  for (const it of timeline()) {
    const a = mins(it.o.da), b = mins(it.o.a);
    if (a == null || b == null || b < a || (prec != null && a < prec)) return true;
    prec = b;
  }
  return false;
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function b64e(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
function b64d(str) { const s = atob(str), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function norm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'docente'; }
const K = (g, h) => g + '|' + h;

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ============ crypto ============ */
async function deriveKey(pass, salt, iter) {
  const km = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function encryptObj(obj, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, iv: b64e(iv), ct: b64e(ct) };
}
async function decryptObj(p, key) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(p.iv) }, key, b64d(p.ct));
  return JSON.parse(dec.decode(pt));
}

/* ============ stato ============ */
let KEY = null, ORIGINALE = null, DATA = null;
let tab = 'home', giorno = null, schedaId = null, filtro = '';

/* ============ avvio ============ */
async function boot() {
  const box = window.ORARIO_ENC;
  if (!box) {
    $('#lockSub').innerHTML = 'Manca il file <b>data-enc.js</b>.<br>Generalo con <b>cifra.html</b> (vedi README).';
    $('#lockForm').hidden = true;
    return;
  }
  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    try {
      KEY = await crypto.subtle.importKey('raw', b64d(saved), 'AES-GCM', true, ['encrypt', 'decrypt']);
      await apri();
      return;
    } catch (e) { localStorage.removeItem(LS_KEY); }
  }
  $('#pass').focus();
}

$('#lockForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const box = window.ORARIO_ENC, pass = $('#pass').value;
  const btn = $('#lockBtn'); btn.disabled = true; btn.textContent = 'Apro…'; $('#lockErr').hidden = true;
  try {
    KEY = await deriveKey(pass, b64d(box.salt), box.iter || 310000);
    await apri(pass);
    if ($('#remember').checked) {
      const raw = await crypto.subtle.exportKey('raw', KEY);
      localStorage.setItem(LS_KEY, b64e(raw));
    }
  } catch (e) {
    KEY = null;
    $('#lockErr').textContent = 'Passphrase errata.'; $('#lockErr').hidden = false;
    $('#pass').select();
  } finally { btn.disabled = false; btn.textContent = 'Apri'; }
});

async function apri(pass) {
  ORIGINALE = await decryptObj(window.ORARIO_ENC, KEY);
  normalizza(ORIGINALE);
  DATA = await leggiLocale(pass);
  let avviso = null;
  if (!DATA) { DATA = clone(ORIGINALE); DATA.base = baseId(ORIGINALE); }
  else {
    normalizza(DATA);
    if (!DATA.base) DATA.base = (DATA.meta && DATA.meta.generato) || '';
    if (DATA.base !== baseId(ORIGINALE)) {            // e' arrivato un nuovo tabellone
      istantanea('prima del nuovo orario');
      avviso = fondi(ORIGINALE, DATA);
    }
  }
  normalizza(DATA);
  DATA.man = modificheManuali(DATA, ORIGINALE);
  await salva();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  $('#lock').hidden = true; $('#app').hidden = false;
  giorno = oggiOpp();
  render();
  if (avviso) mostraNuovoOrario(avviso);
}

/* Legge i dati salvati sul dispositivo. Se non si aprono con la chiave attuale
   (es. data-enc.js rigenerato con un altro salt) prova la chiave vecchia e, se
   neanche quella va, mette da parte il blob invece di sovrascriverlo. */
async function leggiLocale(pass) {
  const loc = localStorage.getItem(LS_DATA);
  if (!loc) return null;
  let p; try { p = JSON.parse(loc); } catch (e) { return null; }
  try { return await decryptObj(p, KEY); } catch (e) { }
  if (pass && p.salt && p.salt !== window.ORARIO_ENC.salt) {
    try {
      const k = await deriveKey(pass, b64d(p.salt), p.iter || window.ORARIO_ENC.iter || 310000);
      return await decryptObj(p, k);
    } catch (e) { }
  }
  try { if (!localStorage.getItem(LS_ORFANO)) localStorage.setItem(LS_ORFANO, loc); } catch (e) { }
  return null;
}

/* ============ nuovo tabellone: fusione ============ */
const baseId = d => String((d.meta && d.meta.generato) || '');

/* celle diverse dal tabellone: { idDocente: { "GIO|3": "1C" } } */
function modificheManuali(d, base) {
  const out = {};
  d.docenti.forEach(t => {
    const b = base.docenti.find(x => x.id === t.id);
    if (!b) return;
    d.giorni.forEach(g => (t.celle[g] || []).forEach((v, h) => {
      const bv = (b.celle[g] || [])[h] || '';
      if ((v || '') !== bv) (out[t.id] = out[t.id] || {})[K(g, h)] = v || '';
    }));
  });
  return out;
}

/* La griglia arriva dal tabellone; resta tutto il resto fatto a mano:
   fasce orarie, intervalli, materia e ruolo, "io", docenti aggiunti a mano,
   sostituzioni sulle ore rimaste uguali. */
function fondi(nuovo, vecchio) {
  const trova = n => vecchio.docenti.find(t => t.id === n.id) ||
    vecchio.docenti.find(t => norm(t.nome) === norm(n.nome));
  const presi = new Set(), lista = [], perse = [];
  const man = vecchio.man || {};
  nuovo.docenti.forEach(n => {
    const o = trova(n);
    if (!o) { const c = clone(n); c.sost = {}; lista.push(c); return; }
    presi.add(o);
    const sost = {};
    Object.keys(o.sost || {}).forEach(k => {
      const q = k.split('|'), h = +q[1];
      if (((o.celle[q[0]] || [])[h] || '') === ((n.celle[q[0]] || [])[h] || '')) sost[k] = 1;
    });
    Object.keys(man[o.id] || {}).forEach(k => {
      const q = k.split('|'), h = +q[1], v = man[o.id][k];
      if (((n.celle[q[0]] || [])[h] || '') !== v) perse.push({ id: o.id, nome: o.nome, g: q[0], h: h, v: v, excel: (n.celle[q[0]] || [])[h] || '' });
    });
    o.celle = clone(n.celle); o.sost = sost; o.cattedra = n.cattedra;
    lista.push(o);
  });
  const vecchiBase = vecchio.baseIds;
  vecchio.docenti.forEach(o => {
    if (presi.has(o)) return;
    if (o.manuale || (vecchiBase && vecchiBase.indexOf(o.id) < 0)) lista.push(o);
  });
  vecchio.docenti = lista;
  vecchio.meta = clone(nuovo.meta);
  vecchio.base = baseId(nuovo);
  vecchio.baseIds = nuovo.docenti.map(t => t.id);
  if (!vecchio.docenti.some(t => t.id === vecchio.io)) vecchio.io = nuovo.io;
  return { data: nuovo.meta.generato, perse: perse };
}

function mostraNuovoOrario(a) {
  const q = new Date(a.data), quando = isNaN(q) ? a.data : q.toLocaleDateString('it-IT');
  if (!a.perse.length) { toast('Nuovo orario del ' + quando + ' caricato'); return; }
  const righe = a.perse.slice(0, 12).map(x =>
    `<li><b>${esc(x.nome)}</b> · ${esc(DAYNAME[x.g] || x.g)} ${x.h + 1}ª: ${esc(x.v || 'vuota')} <span class="muted">→ Excel: ${esc(x.excel || 'vuota')}</span></li>`).join('');
  openModal(`<h3>Nuovo orario del ${esc(quando)}</h3>
    <p class="sub">Il tabellone ha riscritto ${a.perse.length === 1 ? 'una cella che avevi' : a.perse.length + ' celle che avevi'} modificato a mano. Fasce orarie, ruoli e sostituzioni sono rimasti.</p>
    <ul class="perse">${righe}${a.perse.length > 12 ? '<li class="muted">…</li>' : ''}</ul>
    <div class="acts"><button data-a="rimetti">Rimetti le mie</button><button data-a="ok" class="primary">Va bene</button></div>`,
    root => {
      root.querySelector('[data-a="ok"]').onclick = () => { closeModal(); render(); };
      root.querySelector('[data-a="rimetti"]').onclick = () => {
        a.perse.forEach(x => { const t = byId(x.id); if (t && t.celle[x.g]) t.celle[x.g][x.h] = x.v; });
        normalizza(DATA); salva(); closeModal(); render(); toast('Modifiche rimesse');
      };
    });
}

function dataGen(g) {
  const d = new Date(g || '');
  return (!g || isNaN(d)) ? (g || '') : (String(g).length > 10 ? dataOra(g) : d.toLocaleDateString('it-IT'));
}

/* ============ istantanee locali ============ */
function leggiSnap() { try { return JSON.parse(localStorage.getItem(LS_SNAP) || '[]'); } catch (e) { return []; } }
/* copia il salvataggio attuale (gia' cifrato) prima di un'azione che sovrascrive */
function istantanea(motivo) {
  const blob = localStorage.getItem(LS_DATA);
  if (!blob) return;
  const lista = leggiSnap();
  if (lista.length && lista[0].blob === blob) return;       // niente doppioni
  lista.unshift({ t: new Date().toISOString(), motivo: motivo, blob: blob });
  while (lista.length > MAX_SNAP) lista.pop();
  while (lista.length) {
    try { localStorage.setItem(LS_SNAP, JSON.stringify(lista)); return; }
    catch (e) { lista.pop(); }                              // spazio pieno: via la piu' vecchia
  }
}
function istantaneaGiornaliera() {
  const oggi = new Date().toISOString().slice(0, 10);
  if (!leggiSnap().some(x => x.t.slice(0, 10) === oggi)) istantanea('inizio giornata');
}
function dataOra(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) + ' · ' +
    d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
function versioniPrecedenti() {
  const lista = leggiSnap();
  const righe = lista.length ? lista.map((x, i) =>
    `<button class="row" data-i="${i}"><span class="lbl">${esc(dataOra(x.t))}<br><span class="muted small">${esc(x.motivo)}</span></span><span class="val">Ripristina</span></button>`).join('')
    : '<div class="row"><span class="lbl muted">Nessuna versione salvata finora.</span></div>';
  openModal(`<h3>Versioni precedenti</h3>
    <p class="sub">Copie automatiche di questo dispositivo: una al giorno e una prima di ogni azione che cancella. Si tengono le ultime ${MAX_SNAP}.</p>
    <div class="rows">${righe}</div>
    <div class="acts"><button data-a="no">Chiudi</button></div>`,
    root => {
      root.querySelector('[data-a="no"]').onclick = chiudiTop;
      root.querySelectorAll('[data-i]').forEach(b => b.onclick = async () => {
        const x = leggiSnap()[+b.dataset.i]; if (!x) return;
        let d;
        try { d = await decryptObj(JSON.parse(x.blob), KEY); } catch (e) { return toast('Versione non leggibile con questa chiave'); }
        istantanea('prima del ripristino');
        DATA = d; normalizza(DATA); await salva(); closeModal(); render();
        toast('Versione del ' + dataOra(x.t) + ' ripristinata');
      });
    });
}

function ruoloDaMateria(m) {
  const x = norm(m).toUpperCase();
  if (!x) return 'curricolare';
  if (x.indexOf('SOSTEGNO') >= 0) return 'sostegno';
  if (x.indexOf('EDUCAT') >= 0) return 'educatore';
  if (x.indexOf('L2') >= 0) return 'l2';
  return 'curricolare';
}

/* Le ore erano un array di stringhe ("08:00"), ora sono { da, a }:
   i dati gia' salvati sui dispositivi e i vecchi backup restano importabili. */
function migraOrari(v) {
  if (!Array.isArray(v) || !v.length) return ORARI_DEF.map(x => ({ da: x[0], a: x[1] }));
  if (typeof v[0] === 'string') return v.map((s, i) => {
    const a = mins(s), b = (i + 1 < v.length ? mins(v[i + 1]) : (a == null ? null : a + 60));
    return { da: a == null ? '' : hhmm(a), a: (a == null || b == null) ? '' : hhmm(b) };
  });
  return v.map(o => ({ da: (o && o.da) || '', a: (o && o.a) || '' }));
}

function migraPause(p, orari) {
  if (Array.isArray(p)) {
    const out = p.map(x => ({
      dopo: Math.max(1, Math.round(+x.dopo) || 1),
      da: x.da || '', a: x.a || '', nome: x.nome || 'Intervallo'
    })).filter(x => x.dopo < orari.length);
    out.sort((a, b) => a.dopo - b.dopo);
    return out;
  }
  const out = [];                                  // prima volta: intervallo dopo la 2ª e la 4ª ora
  [2, 4].forEach(n => {
    if (n >= orari.length) return;
    const o = orari[n - 1], d = durata(o), f = mins(o && o.a);
    if (f == null || d == null || d < 25) return;
    o.a = hhmm(f - 10);
    out.push({ dopo: n, da: hhmm(f - 10), a: hhmm(f), nome: 'Intervallo' });
  });
  return out;
}

function normalizza(d) {
  d.giorni = d.giorni || ['LUN', 'MAR', 'MER', 'GIO', 'VEN'];
  d.orari = migraOrari(d.orari);
  d.pause = migraPause(d.pause, d.orari);
  d.docenti = d.docenti || [];
  d.docenti.forEach(t => {
    if (t.ruolo === 'educatrice') t.ruolo = 'educatore';
    if (!RUOLI[t.ruolo]) t.ruolo = ruoloDaMateria(t.materia);
    if (!t.sost || typeof t.sost !== 'object') t.sost = {};   // sostituzioni: { "LUN|2": 1 }
    if (!t.celle || typeof t.celle !== 'object') t.celle = {};
    d.giorni.forEach(g => {
      if (!Array.isArray(t.celle[g])) t.celle[g] = [];
      while (t.celle[g].length < d.orari.length) t.celle[g].push('');
    });
  });
  if (!d.docenti.some(t => t.id === d.io) && d.docenti.length) d.io = d.docenti[0].id;
}

function oggiOpp() {
  const n = new Date().getDay();            // 0 dom … 6 sab
  return (n >= 1 && n <= 5) ? DATA.giorni[n - 1] : DATA.giorni[0];
}

async function salva() {
  try {
    istantaneaGiornaliera();
    if (ORIGINALE) DATA.man = modificheManuali(DATA, ORIGINALE);
    const p = await encryptObj(DATA, KEY);
    p.salt = window.ORARIO_ENC.salt; p.iter = window.ORARIO_ENC.iter;   // per riaprirlo anche se cambia il salt
    localStorage.setItem(LS_DATA, JSON.stringify(p));
  }
  catch (e) { toast('Salvataggio non riuscito'); }
}

/* ============ query sui dati ============ */
const io = () => DATA.docenti.find(t => t.id === DATA.io) || DATA.docenti[0];
const byId = id => DATA.docenti.find(t => t.id === id);
function idUnico(base) {
  let id = base, n = 2;
  while (DATA.docenti.some(t => t.id === id)) id = base + '-' + (n++);
  return id;
}
function classi() {
  const s = new Set();
  DATA.docenti.forEach(t => DATA.giorni.forEach(g => t.celle[g].forEach(v => { if (CLASSE.test(v)) s.add(v); })));
  return [...s].sort();
}
/** chi altro è in quella classe, quel giorno, quell'ora */
function compresenze(classe, g, h, esclusoId) {
  const out = { cur: [], l2: [], sos: [], edu: [] };
  DATA.docenti.forEach(t => {
    if (t.id === esclusoId) return;
    if (t.celle[g][h] !== classe) return;
    if (t.ruolo === 'sostegno') out.sos.push(t);
    else if (t.ruolo === 'educatore') out.edu.push(t);
    else if (t.ruolo === 'l2') out.l2.push(t);
    else out.cur.push(t);
  });
  return out;
}
const cognome = t => t.nome;
const ETICHETTE = {
  'LETTERE': 'Lettere', 'MATEMATICA': 'Matematica', 'ITALIANO L2': 'Italiano L2',
  'ED FISICA': 'Ed. fisica', 'TECNOLOGIA': 'Tecnologia', 'ARTE': 'Arte', 'MUSICA': 'Musica',
  'INGLESE': 'Inglese', 'SPAGNOLO': 'Spagnolo', 'FRANCESE': 'Francese', 'TEDESCO': 'Tedesco',
  'RELIGIONE': 'Religione', 'SOSTEGNO': 'Sostegno', 'EDUCATRICE': 'Educatrice', 'EDUCATORE': 'Educatore'
};
function materiaBreve(t) {
  const m = (t.materia || '').trim().toUpperCase();
  if (ETICHETTE[m]) return ETICHETTE[m];
  if (m) return m.charAt(0) + m.slice(1).toLowerCase();
  return RUOLI[t.ruolo] || '';
}
function materie() {
  const s = new Set();
  DATA.docenti.forEach(t => { if (t.materia) s.add(t.materia.trim()); });
  return [...s].sort();
}

/* ============ render ============ */
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const back = $('#backBtn');
  back.hidden = !(tab === 'colleghi' && schedaId);
  if (tab === 'home') { $('#title').textContent = 'Il mio orario'; viewHome(); }
  else if (tab === 'colleghi') {
    if (schedaId) { $('#title').textContent = 'Scheda'; viewScheda(); }
    else { $('#title').textContent = 'Colleghi'; viewColleghi(); }
  } else { $('#title').textContent = 'Impostazioni'; viewImpostazioni(); }
  if (!$('#modalRoot').firstElementChild) window.scrollTo(0, 0);
}

function pausaHTML(i) {
  const p = pausaDopo(i + 1);
  return p ? `<li class="pausa"><span>${esc(p.nome || 'Intervallo')}</span><span>${esc(fascia(p))}</span></li>` : '';
}

function viewHome() {
  const me = io(), oggi = oggiOpp();
  if (!me) { $('#view').innerHTML = '<p class="hint">Nessun docente in elenco.</p>'; return; }
  let h = '<div class="days">' + DATA.giorni.map(g =>
    `<button data-g="${g}" class="${g === giorno ? 'on' : ''} ${g === oggi ? 'today' : ''}">${g}</button>`).join('') + '</div>';

  h += '<ul class="ore">';
  for (let i = 0; i < NORE(); i++) {
    const v = me.celle[giorno][i] || '', ora = fasciaHTML(DATA.orari[i]);
    const solo = !!me.sost[K(giorno, i)];
    if (!v) {
      h += `<li><button class="ora vuota" data-cell="${giorno}|${i}|${me.id}">
        <span class="ora-n"><b>${i + 1}ª</b>${ora}</span>
        <span class="ora-body"><span class="muted">libera</span></span></button></li>`;
      h += pausaHTML(i);
      continue;
    }
    if (!CLASSE.test(v)) {
      h += `<li><button class="ora" data-cell="${giorno}|${i}|${me.id}">
        <span class="ora-n"><b>${i + 1}ª</b>${ora}</span>
        <span class="ora-body"><span class="ora-top"><span class="cls alt">${esc(v)}</span></span></span></button></li>`;
      h += pausaHTML(i);
      continue;
    }
    const c = compresenze(v, giorno, i, me.id);
    const titolari = c.cur.concat(c.l2);
    const altri = c.sos.concat(c.edu).map(t => esc(cognome(t)) + (t.ruolo === 'educatore' ? ' (educ.)' : ' (sost.)'));
    let principale, mat;
    if (solo) {
      principale = '<span class="sost">sostituzione</span>';
      mat = 'da solo';
    } else if (titolari.length) {
      principale = titolari.map(t => esc(cognome(t))).join(' + ');
      mat = titolari.map(t => esc(materiaBreve(t))).join(' + ');
    } else {
      principale = '<span class="nocur">nessun curricolare</span>';
      mat = '';
    }
    h += `<li><button class="ora${solo ? ' is-sost' : ''}" data-cell="${giorno}|${i}|${me.id}">
      <span class="ora-n"><b>${i + 1}ª</b>${ora}</span>
      <span class="ora-body">
        <span class="ora-top"><span class="cls">${esc(v)}</span><span class="cur">${principale}</span></span>
        <span class="ora-sub">${mat}${altri.length ? (mat ? ' · ' : '') + 'anche ' + altri.join(', ') : ''}</span>
      </span></button></li>`;
    h += pausaHTML(i);
  }
  h += '</ul>';

  const n = DATA.giorni.reduce((a, g) => a + me.celle[g].filter(v => v).length, 0);
  h += `<p class="hint">${esc(me.nome)} — ${n} ore in griglia · ${esc(me.cattedra || '')}<br>Tocca una cella per modificarla.</p>`;
  $('#view').innerHTML = h;
  document.querySelectorAll('.days button').forEach(b => b.onclick = () => { giorno = b.dataset.g; render(); });
  bindCelle();
}

function viewColleghi() {
  const f = filtro.trim().toLowerCase();
  const lista = DATA.docenti.filter(t => {
    if (!f) return true;
    const cls = DATA.giorni.map(g => t.celle[g].join(' ')).join(' ');
    return (t.nome + ' ' + (t.cattedra || '') + ' ' + (t.materia || '') + ' ' + cls).toLowerCase().includes(f);
  });
  let h = `<input class="search" id="q" type="search" placeholder="Cerca docente, materia o classe" value="${esc(filtro)}">`;
  h += '<ul class="list">' + lista.map(t => `<li><button data-id="${t.id}">
      <span class="nm">${esc(t.nome)}</span>
      <span class="tag ${t.ruolo !== 'curricolare' ? 's' : ''}">${esc(materiaBreve(t))}</span></button></li>`).join('') + '</ul>';
  if (!lista.length) h += '<p class="hint">Nessun risultato.</p>';
  h += '<button class="addbtn" id="nuovoDoc">+ Aggiungi docente</button>';
  $('#view').innerHTML = h;
  const q = $('#q');
  q.oninput = () => { filtro = q.value; const p = q.selectionStart; viewColleghi(); const n = $('#q'); n.focus(); n.setSelectionRange(p, p); };
  document.querySelectorAll('.list button').forEach(b => b.onclick = () => { schedaId = b.dataset.id; render(); });
  $('#nuovoDoc').onclick = () => editDocente(null);
}

function viewScheda() {
  const t = byId(schedaId); if (!t) { schedaId = null; return render(); }
  const me = io();
  let conMe = 0;
  let h = `<div class="card"><h2>${esc(t.nome)}</h2>
    <div class="sub">${esc(materiaBreve(t))}${t.cattedra ? ' · ' + esc(t.cattedra) : ''}</div></div>`;
  h += '<div class="card"><table class="grid"><thead><tr><th></th>' +
    DATA.giorni.map(g => `<th>${g}</th>`).join('') + '</tr></thead><tbody>';
  for (let i = 0; i < NORE(); i++) {
    h += `<tr><td class="h" title="${esc(fascia(DATA.orari[i]))}">${i + 1}ª</td>`;
    for (const g of DATA.giorni) {
      const v = t.celle[g][i];
      const insieme = v && CLASSE.test(v) && me.id !== t.id && me.celle[g][i] === v;
      if (insieme) conMe++;
      const cls = 'cell' + (v ? ' has' : '') + (insieme ? ' me' : '') + (t.sost[K(g, i)] ? ' sos' : '');
      const inner = !v ? '' : (CLASSE.test(v) ? `<b>${esc(v)}</b>` : `<small>${esc(v)}</small>`);
      h += `<td><button class="${cls}" data-cell="${g}|${i}|${t.id}" title="${esc(v)}">${inner}</button></td>`;
    }
    h += '</tr>';
    const pz = pausaDopo(i + 1);
    if (pz) h += `<tr class="rpausa"><td></td><td colspan="${DATA.giorni.length}">${esc((pz.nome || 'Intervallo') + ' · ' + fascia(pz))}</td></tr>`;
  }
  h += '</tbody></table></div>';
  const n = DATA.giorni.reduce((a, g) => a + t.celle[g].filter(v => v).length, 0);
  h += `<p class="hint">${n} ore in griglia${t.id !== me.id ? ` · ${conMe} ore in classe con te` : ''}<br>Tocca una cella per modificarla.</p>`;
  h += `<div class="rows" style="margin-top:16px">
    <button class="row" id="modDoc"><span class="lbl">Modifica docente</span><span class="val">›</span></button>
    <button class="row danger" id="delDoc"><span class="lbl">Elimina docente</span><span class="val">›</span></button></div>`;
  $('#view').innerHTML = h;
  bindCelle();
  $('#modDoc').onclick = () => editDocente(t.id);
  $('#delDoc').onclick = () => eliminaDocente(t.id);
}

function slotsHTML() {
  return timeline().map(it => {
    const o = it.o, pausa = it.tipo === 'pausa', key = (pausa ? 'pausa|' : 'ora|') + it.i, d = durata(o);
    const testa = pausa
      ? `<input type="text" class="sn" data-slot="${key}|nome" value="${esc(o.nome || 'Intervallo')}" maxlength="14">`
      : `<span class="sn">${it.i + 1}ª ora</span>`;
    return `<div class="slot${pausa ? ' int' : ''}">${testa}
      <input type="time" data-slot="${key}|da" value="${esc(o.da)}">
      <input type="time" data-slot="${key}|a" value="${esc(o.a)}">
      <span class="sm">${d == null ? '' : d + '\''}</span>
      <button class="sx" data-del="${key}" aria-label="Rimuovi">\u00d7</button></div>`;
  }).join('');
}

function ricalcolaCatena() {
  const t = timeline();
  if (!t.length) return;
  let cur = mins(t[0].o.da);
  if (cur == null) { toast('Imposta l\'inizio della 1ª ora'); return; }
  t.forEach(it => {
    const d = durata(it.o), dur = (d == null || d === 0) ? (it.tipo === 'pausa' ? 10 : 55) : d;
    it.o.da = hhmm(cur); it.o.a = hhmm(cur + dur); cur += dur;
  });
  salva(); viewImpostazioni(); toast('Orari messi in sequenza');
}

function confermaRimuoviOra(i) {
  openModal(`<h3>Eliminare la ${i + 1}ª ora?</h3>
    <p class="sub">Quello che è scritto in quell'ora sparisce da tutti i docenti e le ore successive scalano di una posizione.</p>
    <div class="acts"><button data-a="no">Annulla</button><button data-a="si" class="primary del">Elimina</button></div>`,
    root => {
      root.querySelector('[data-a="no"]').onclick = chiudiTop;
      root.querySelector('[data-a="si"]').onclick = () => { istantanea('prima di elimina ' + (i + 1) + 'ª ora'); rimuoviOra(i); closeModal(); render(); toast('Ora eliminata'); };
    });
}

function rimuoviOra(i) {
  if (NORE() <= 1) { toast('Deve restare almeno un\'ora'); return; }
  DATA.orari.splice(i, 1);
  DATA.pause = (DATA.pause || []).filter(x => x.dopo !== i + 1);
  DATA.pause.forEach(x => { if (x.dopo > i + 1) x.dopo--; });
  DATA.pause = DATA.pause.filter(x => x.dopo < DATA.orari.length);
  DATA.docenti.forEach(t => {
    DATA.giorni.forEach(g => { if (Array.isArray(t.celle[g])) t.celle[g].splice(i, 1); });
    const s2 = {};
    Object.keys(t.sost || {}).forEach(k => {
      const q = k.split('|'), n = +q[1];
      if (n === i) return;
      s2[q[0] + '|' + (n > i ? n - 1 : n)] = 1;
    });
    t.sost = s2;
  });
  normalizza(DATA); salva();
}

function viewImpostazioni() {
  const m = DATA.meta || {};
  let h = '<div class="sec">Docente principale</div><div class="rows"><div class="row"><span class="lbl">Home mostra</span>' +
    '<select id="selIo">' + DATA.docenti.map(t => `<option value="${t.id}" ${t.id === DATA.io ? 'selected' : ''}>${esc(t.nome)}</option>`).join('') + '</select></div></div>';

  h += '<div class="sec">Orario delle lezioni</div><div class="rows"><div class="slots">' + slotsHTML() + '</div></div>';
  if (incoerente()) h += '<p class="hint warn">Qualche orario manca o si sovrappone al successivo.</p>';
  h += '<div class="rows" style="margin-top:8px">' +
    '<button class="row" data-act="oraAdd"><span class="lbl">Aggiungi un\'ora</span><span class="val">+</span></button>' +
    '<button class="row" data-act="pausaAdd"><span class="lbl">Aggiungi un intervallo</span><span class="val">+</span></button>' +
    '<button class="row" data-act="catena"><span class="lbl">Ricalcola in sequenza</span><span class="val">\u203a</span></button></div>' +
    '<p class="hint">Ogni ora ha inizio e fine; gli intervalli stanno fra un\'ora e l\'altra e si possono aggiungere, spostare o togliere.<br>«Ricalcola in sequenza» rimette tutto in fila dall\'inizio della 1ª ora, mantenendo le durate.</p>';

  h += '<div class="sec">Colleghi</div><div class="rows">' +
    '<button class="row" data-act="nuovo"><span class="lbl">Aggiungi docente</span><span class="val">›</span></button>' +
    '<button class="row" data-act="csvin"><span class="lbl">Importa elenco da CSV</span><span class="val">›</span></button>' +
    '<button class="row" data-act="csvout"><span class="lbl">Esporta elenco in CSV</span><span class="val">›</span></button>' +
    '</div><p class="hint">Il CSV aggiorna chi c\'è già e aggiunge i nuovi: nessuno viene rimosso.<br>Colonne: nome · materia · ruolo · cattedra.</p>';

  h += '<div class="sec">Dati</div><div class="rows">' +
    `<button class="row" data-act="export"><span class="lbl">Esporta backup JSON</span><span class="val${vecchioBackup() ? ' warn' : ''}">${esc(ultimoBackup())} ›</span></button>` +
    '<button class="row" data-act="import"><span class="lbl">Importa backup JSON</span><span class="val">›</span></button>' +
    '<button class="row" data-act="enc"><span class="lbl">Esporta data-enc.js (per GitHub)</span><span class="val">›</span></button>' +
    '<button class="row" data-act="versioni"><span class="lbl">Versioni precedenti</span><span class="val">' + leggiSnap().length + ' ›</span></button>' +
    '<button class="row danger" data-act="reset"><span class="lbl">Ripristina orario originale</span><span class="val">›</span></button>' +
    '</div>';

  const ric = !!localStorage.getItem(LS_KEY);
  h += '<div class="sec">Sicurezza</div><div class="rows">' +
    `<div class="row"><span class="lbl">Ricorda su questo dispositivo</span><input type="checkbox" id="ric" ${ric ? 'checked' : ''}></div>` +
    '<button class="row" data-act="lock"><span class="lbl">Blocca adesso</span><span class="val">›</span></button></div>';

  h += `<div class="sec">Info</div><div class="rows">
    <div class="row"><span class="lbl">Scuola</span><span class="val">${esc(m.scuola || '')}</span></div>
    <div class="row"><span class="lbl">Anno</span><span class="val">${esc(m.anno || '')}</span></div>
    <div class="row"><span class="lbl">Dati generati il</span><span class="val">${esc(dataGen(m.generato))}</span></div>
    <div class="row"><span class="lbl">Versione app</span><span class="val">1.3</span></div></div>`;
  h += '<p class="hint">Orario provvisorio: le modifiche fatte qui restano su questo dispositivo.</p>';
  $('#view').innerHTML = h;

  $('#selIo').onchange = e => { DATA.io = e.target.value; salva(); toast('Aggiornato'); };
  document.querySelectorAll('[data-slot]').forEach(inp => inp.onchange = () => {
    const parti = inp.dataset.slot.split('|'), i = +parti[1];
    const o = parti[0] === 'ora' ? DATA.orari[i] : pausaDopo(i + 1);
    if (!o) return;
    o[parti[2]] = inp.value;
    salva(); viewImpostazioni();
  });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const parti = b.dataset.del.split('|'), i = +parti[1];
    if (parti[0] === 'pausa') {
      DATA.pause = DATA.pause.filter(x => x.dopo !== i + 1);
      salva(); viewImpostazioni(); toast('Intervallo rimosso');
    } else confermaRimuoviOra(i);
  });
  $('#ric').onchange = async e => {
    if (e.target.checked) { const raw = await crypto.subtle.exportKey('raw', KEY); localStorage.setItem(LS_KEY, b64e(raw)); toast('Passphrase memorizzata'); }
    else { localStorage.removeItem(LS_KEY); toast('Passphrase dimenticata'); }
  };
  document.querySelectorAll('[data-act]').forEach(b => b.onclick = () => azione(b.dataset.act));
}

/* ============ modifica ora ============ */
function bindCelle() {
  document.querySelectorAll('[data-cell]').forEach(b => b.onclick = () => {
    const [g, h, id] = b.dataset.cell.split('|');
    editCella(g, +h, id);
  });
}

function editCella(g, h, id) {
  const t = byId(id); if (!t) return;
  const k = K(g, h);
  let libero = !!(t.celle[g][h] && !CLASSE.test(t.celle[g][h]));

  function disegna() {
    const v = t.celle[g][h];
    const isCl = CLASSE.test(v);
    const cl = classi();
    if (isCl && cl.indexOf(v) < 0) cl.push(v);

    let x = `<h3>${DAYNAME[g] || g} · ${h + 1}ª ora</h3>
      <p class="sub">${esc(t.nome)}${DATA.orari[h] ? ' · ' + esc(fascia(DATA.orari[h])) : ''}</p>
      <div class="chips">` +
      cl.map(c => `<button data-c="${c}" class="${c === v && !libero ? 'on' : ''}">${c}</button>`).join('') +
      `<button data-a="altro" class="alt${libero ? ' on' : ''}">Altro…</button></div>`;

    if (libero) {
      x += `<label class="fld">Testo libero (altro plesso, potenziamento, nota…)
        <input id="free" value="${esc(isCl ? '' : v)}" placeholder="es. Boiardo, Potenziamento, Riunione"></label>`;
    }

    if (isCl && !libero) {
      const c = compresenze(v, g, h, t.id);
      const tutti = c.cur.concat(c.l2, c.sos, c.edu);
      x += `<div class="sec2">In classe, quest'ora</div><ul class="who">`;
      if (!tutti.length) x += `<li class="empty">Nessun altro docente in ${esc(v)}</li>`;
      tutti.forEach(o => {
        x += `<li><span class="nm">${esc(o.nome)}</span>
          <span class="tag ${o.ruolo !== 'curricolare' ? 's' : ''}">${esc(materiaBreve(o))}</span>
          <button class="x" data-del="${o.id}" aria-label="Togli">×</button></li>`;
      });
      x += `</ul><button class="addbtn" data-a="add">+ Aggiungi collega</button>`;
      x += `<label class="sw"><input type="checkbox" id="solo" ${t.sost[k] ? 'checked' : ''}>
        <span>Sostituzione — sono da solo</span></label>`;
    }

    x += `<div class="acts">
      <button data-a="clear" class="del">Svuota</button>
      <button data-a="done" class="primary">Fatto</button></div>`;
    return x;
  }

  function bind(sc) {
    sc.querySelectorAll('.chips button[data-c]').forEach(b => b.onclick = () => {
      t.celle[g][h] = b.dataset.c; libero = false; salva(); render(); aggiorna();
    });
    const alt = sc.querySelector('[data-a="altro"]');
    if (alt) alt.onclick = () => {
      if (CLASSE.test(t.celle[g][h])) { t.celle[g][h] = ''; delete t.sost[k]; salva(); render(); }
      libero = true; aggiorna();
      const f = $('#modalRoot #free'); if (f) f.focus();
    };
    const free = sc.querySelector('#free');
    if (free) {
      free.oninput = () => { t.celle[g][h] = free.value; salva(); render(); };
      free.onblur = () => { t.celle[g][h] = free.value.trim(); salva(); render(); };
    }
    sc.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const o = byId(b.dataset.del); if (!o) return;
      o.celle[g][h] = ''; delete o.sost[k];
      salva(); render(); aggiorna(); toast(o.nome + ' tolto da quest\'ora');
    });
    const add = sc.querySelector('[data-a="add"]');
    if (add) add.onclick = () => pickCollega(g, h, t, aggiorna);
    const sw = sc.querySelector('#solo');
    if (sw) sw.onchange = () => {
      if (sw.checked) t.sost[k] = 1; else delete t.sost[k];
      salva(); render();
    };
    sc.querySelector('[data-a="clear"]').onclick = () => {
      t.celle[g][h] = ''; delete t.sost[k]; libero = false;
      salva(); chiudiTop(); render();
    };
    sc.querySelector('[data-a="done"]').onclick = () => { chiudiTop(); render(); };
  }

  function aggiorna() {
    const sc = $('#modalRoot .mask:last-child .sheet');
    if (!sc) return;
    sc.innerHTML = disegna();
    bind(sc);
  }

  openModal(disegna(), root => bind(root.querySelector('.sheet')));
}

/** elenco per aggiungere un collega alla stessa classe/ora */
function pickCollega(g, h, t, done) {
  const classe = t.celle[g][h];
  let f = '';

  function disegna() {
    const q = norm(f);
    const lista = DATA.docenti
      .filter(o => o.id !== t.id && o.celle[g][h] !== classe)
      .filter(o => !q || norm(o.nome + ' ' + (o.materia || '')).includes(q));
    let x = `<h3>Aggiungi collega</h3>
      <p class="sub">${DAYNAME[g] || g} · ${h + 1}ª ora · ${esc(classe)}</p>
      <input class="search" id="qc" type="search" placeholder="Cerca nome o materia" value="${esc(f)}">
      <ul class="list">` +
      lista.map(o => `<li><button data-id="${o.id}">
        <span class="nm">${esc(o.nome)}</span>
        ${o.celle[g][h] ? `<span class="busy">già in ${esc(o.celle[g][h])}</span>` : ''}
        <span class="tag ${o.ruolo !== 'curricolare' ? 's' : ''}">${esc(materiaBreve(o))}</span></button></li>`).join('') +
      '</ul>';
    if (!lista.length) x += '<p class="hint">Nessun risultato.</p>';
    x += '<div class="acts"><button data-a="chiudi">Chiudi</button></div>';
    return x;
  }

  function bind(sc) {
    const q = sc.querySelector('#qc');
    q.oninput = () => {
      f = q.value; const p = q.selectionStart;
      sc.innerHTML = disegna(); bind(sc);
      const n = sc.querySelector('#qc'); n.focus(); n.setSelectionRange(p, p);
    };
    sc.querySelectorAll('.list button').forEach(b => b.onclick = () => {
      const o = byId(b.dataset.id); if (!o) return;
      const prima = o.celle[g][h];
      o.celle[g][h] = classe; delete o.sost[K(g, h)];
      salva(); chiudiTop(); render(); if (done) done();
      toast(o.nome + (prima ? ' spostato in ' : ' aggiunto in ') + classe);
    });
    sc.querySelector('[data-a="chiudi"]').onclick = chiudiTop;
  }

  openModal(disegna(), root => bind(root.querySelector('.sheet')));
}

/* ============ anagrafica docenti ============ */
function editDocente(id) {
  const nuovo = !id;
  const t = nuovo ? { nome: '', materia: '', cattedra: '', ruolo: 'curricolare' } : byId(id);
  if (!t) return;
  const html = `<h3>${nuovo ? 'Nuovo docente' : 'Modifica docente'}</h3>
    <label class="fld">Nome<input id="dn" value="${esc(t.nome)}" placeholder="Cognome Nome"></label>
    <label class="fld">Materia<input id="dm" list="dmL" value="${esc(t.materia || '')}" placeholder="es. Matematica, Sostegno, Educatore"></label>
    <datalist id="dmL">${materie().map(m => `<option value="${esc(m)}">`).join('')}</datalist>
    <label class="fld">Ruolo<select id="dr">${Object.keys(RUOLI).map(r =>
      `<option value="${r}" ${r === t.ruolo ? 'selected' : ''}>${RUOLI[r]}</option>`).join('')}</select></label>
    <label class="fld">Cattedra<input id="dc" value="${esc(t.cattedra || '')}" placeholder="es. 1D (6) + 1C (6)"></label>
    <div class="acts"><button data-a="cancel">Annulla</button><button data-a="save" class="primary">Salva</button></div>`;
  openModal(html, root => {
    const dn = root.querySelector('#dn'), dm = root.querySelector('#dm'), dr = root.querySelector('#dr');
    let tocco = !nuovo;
    dr.onchange = () => { tocco = true; };
    dm.oninput = () => { if (!tocco) dr.value = ruoloDaMateria(dm.value); };
    root.querySelector('[data-a="cancel"]').onclick = chiudiTop;
    root.querySelector('[data-a="save"]').onclick = () => {
      const nome = dn.value.trim();
      if (!nome) { dn.focus(); return toast('Serve il nome'); }
      const campi = {
        nome, materia: dm.value.trim(), ruolo: dr.value,
        cattedra: root.querySelector('#dc').value.trim()
      };
      if (nuovo) {
        const n = Object.assign({ id: idUnico(slug(nome)), celle: {}, sost: {}, manuale: true }, campi);
        DATA.docenti.push(n);
        schedaId = n.id; tab = 'colleghi';
      } else Object.assign(t, campi);
      normalizza(DATA); salva(); chiudiTop(); render();
      toast(nuovo ? 'Docente aggiunto' : 'Docente aggiornato');
    };
    dn.focus();
  });
}

function eliminaDocente(id) {
  const t = byId(id); if (!t) return;
  openModal(`<h3>Eliminare ${esc(t.nome)}?</h3>
    <p class="sub">Il docente e il suo orario vengono rimossi da questo dispositivo.</p>
    <div class="acts"><button data-a="no">Annulla</button><button data-a="si" class="primary del">Elimina</button></div>`,
    root => {
      root.querySelector('[data-a="no"]').onclick = chiudiTop;
      root.querySelector('[data-a="si"]').onclick = () => {
        istantanea('prima di elimina ' + t.nome);
        DATA.docenti = DATA.docenti.filter(d => d.id !== id);
        if (schedaId === id) schedaId = null;
        normalizza(DATA); salva(); chiudiTop(); render(); toast('Docente eliminato');
      };
    });
}

/* ============ CSV colleghi ============ */
function csvDocenti() {
  const q = c => /[;"\n\r]/.test(c) ? '"' + String(c).replace(/"/g, '""') + '"' : c;
  const righe = [['nome', 'materia', 'ruolo', 'cattedra']];
  DATA.docenti.forEach(t => righe.push([t.nome, t.materia || '', t.ruolo, t.cattedra || '']));
  return righe.map(r => r.map(q).join(';')).join('\r\n');
}

function leggiCSV(txt) {
  txt = String(txt).replace(/^﻿/, '');
  const prima = txt.split(/\r?\n/)[0] || '';
  const sep = (prima.split(';').length >= prima.split(',').length) ? ';' : ',';
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
  return out.filter(r => r.some(c => c.trim()));
}

function importaCSV(txt) {
  const rows = leggiCSV(txt);
  if (!rows.length) return toast('CSV vuoto');
  let idx = { nome: 0, materia: 1, ruolo: 2, cattedra: 3 };
  const head = rows[0].map(c => norm(c));
  if (head.indexOf('nome') >= 0) {
    idx = { nome: head.indexOf('nome'), materia: head.indexOf('materia'), ruolo: head.indexOf('ruolo'), cattedra: head.indexOf('cattedra') };
    rows.shift();
  }
  const val = (r, i) => (i >= 0 && r[i] != null) ? String(r[i]).trim() : '';
  let agg = 0, upd = 0;
  rows.forEach(r => {
    const nome = val(r, idx.nome); if (!nome) return;
    const materia = val(r, idx.materia), cattedra = val(r, idx.cattedra);
    let ruolo = norm(val(r, idx.ruolo)).replace('educatrice', 'educatore').replace('italiano l2', 'l2');
    if (!RUOLI[ruolo]) ruolo = '';
    const ex = DATA.docenti.find(t => norm(t.nome) === norm(nome));
    if (ex) {
      if (materia) ex.materia = materia;
      if (cattedra) ex.cattedra = cattedra;
      ex.ruolo = ruolo || ruoloDaMateria(ex.materia);
      upd++;
    } else {
      DATA.docenti.push({
        id: idUnico(slug(nome)), nome, materia, cattedra,
        ruolo: ruolo || ruoloDaMateria(materia), celle: {}, sost: {}, manuale: true
      });
      agg++;
    }
  });
  DATA.docenti.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  normalizza(DATA); salva(); render();
  toast(agg + ' aggiunti · ' + upd + ' aggiornati');
}

/* ============ modali ============ */
function openModal(html, onMount) {
  const root = document.createElement('div');
  root.className = 'mask';
  root.innerHTML = `<div class="sheet">${html}</div>`;
  root.addEventListener('click', e => { if (e.target === root) { root.remove(); render(); } });
  $('#modalRoot').appendChild(root);
  if (onMount) onMount(root);
}
function chiudiTop() { const r = $('#modalRoot'); if (r.lastElementChild) r.lastElementChild.remove(); }
function closeModal() { $('#modalRoot').innerHTML = ''; }

/* ============ azioni impostazioni ============ */
function ultimoBackup() {
  let t = null; try { t = localStorage.getItem(LS_EXPORT); } catch (e) { }
  return t ? 'ultimo ' + new Date(t).toLocaleDateString('it-IT') : 'mai fatto';
}
function vecchioBackup() {
  let t = null; try { t = localStorage.getItem(LS_EXPORT); } catch (e) { }
  return !t || (Date.now() - new Date(t).getTime()) > 30 * 864e5;
}
function download(nome, testo, tipo) {
  const b = new Blob([testo], { type: tipo || 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function leggiFile(accept, cb) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept;
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => cb(fr.result);
    fr.readAsText(f);
  };
  inp.click();
}

async function azione(a) {
  if (a === 'nuovo') editDocente(null);
  if (a === 'oraAdd') {
    const ult = DATA.orari[DATA.orari.length - 1], f = mins(ult && ult.a);
    DATA.orari.push({ da: f == null ? '' : hhmm(f), a: f == null ? '' : hhmm(f + 55) });
    normalizza(DATA); salva(); viewImpostazioni(); toast('Ora aggiunta');
  }
  if (a === 'catena') ricalcolaCatena();
  if (a === 'pausaAdd') {
    const liberi = [];
    for (let i = 1; i < NORE(); i++) if (!pausaDopo(i)) liberi.push(i);
    if (!liberi.length) { toast('Non c\'è spazio per un altro intervallo'); return; }
    openModal(`<h3>Nuovo intervallo</h3>
      <label class="fld">Dopo quale ora<select id="pDopo">${liberi.map(n => `<option value="${n}">${n}ª ora</option>`).join('')}</select></label>
      <div class="acts"><button data-a="no">Annulla</button><button data-a="si" class="primary">Aggiungi</button></div>`,
      root => {
        root.querySelector('[data-a="no"]').onclick = chiudiTop;
        root.querySelector('[data-a="si"]').onclick = () => {
          const n = +root.querySelector('#pDopo').value, f = mins(DATA.orari[n - 1] && DATA.orari[n - 1].a);
          DATA.pause.push({ dopo: n, da: f == null ? '' : hhmm(f), a: f == null ? '' : hhmm(f + 10), nome: 'Intervallo' });
          DATA.pause.sort((x, y) => x.dopo - y.dopo);
          salva(); closeModal(); render(); toast('Intervallo aggiunto');
        };
      });
  }
  if (a === 'csvout') {
    download('colleghi-' + new Date().toISOString().slice(0, 10) + '.csv', csvDocenti(), 'text/csv');
    toast('CSV esportato');
  }
  if (a === 'csvin') leggiFile('.csv,text/csv,text/plain', txt => {
    try { istantanea('prima di importa CSV'); importaCSV(txt); } catch (e) { toast('CSV non valido'); }
  });
  if (a === 'export') {
    download('orario-tasso-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(DATA, null, 1));
    try { localStorage.setItem(LS_EXPORT, new Date().toISOString()); } catch (e) { }
    toast('Backup esportato'); viewImpostazioni();
  }
  if (a === 'import') leggiFile('.json,application/json', txt => {
    try {
      const d = JSON.parse(txt);
      if (!d.docenti) throw 0;
      istantanea('prima di importa backup');
      DATA = d; normalizza(DATA); salva(); render(); toast('Dati importati');
    } catch (e) { toast('File non valido'); }
  });
  if (a === 'enc') {
    const box = window.ORARIO_ENC;
    const pub = clone(DATA);                     // diventa il nuovo orario di base per tutti i dispositivi
    delete pub.man; delete pub.base; delete pub.baseIds;
    pub.docenti.forEach(t => { delete t.manuale; });
    pub.meta = Object.assign({}, pub.meta, { generato: new Date().toISOString(), fonte: 'app (modifiche pubblicate)' });
    const p = await encryptObj(pub, KEY);
    const out = { v: 1, kdf: 'PBKDF2-SHA256', iter: box.iter, salt: box.salt, iv: p.iv, ct: p.ct };
    download('data-enc.js', 'window.ORARIO_ENC = ' + JSON.stringify(out) + ';\n', 'application/javascript');
    toast('data-enc.js esportato');
  }
  if (a === 'reset') {
    openModal(`<h3>Ripristinare l'orario originale?</h3>
      <p class="sub">Tutte le modifiche salvate su questo dispositivo verranno perse.</p>
      <div class="acts"><button data-a="no">Annulla</button><button data-a="si" class="primary del">Ripristina</button></div>`,
      root => {
        root.querySelector('[data-a="no"]').onclick = chiudiTop;
        root.querySelector('[data-a="si"]').onclick = () => {
          istantanea('prima di ripristina originale');
          DATA = clone(ORIGINALE); DATA.base = baseId(ORIGINALE); normalizza(DATA); salva(); closeModal(); giorno = oggiOpp(); render(); toast('Orario ripristinato');
        };
      });
  }
  if (a === 'versioni') versioniPrecedenti();
  if (a === 'lock') {
    localStorage.removeItem(LS_KEY); KEY = null; DATA = null;
    closeModal();
    $('#app').hidden = true; $('#lock').hidden = false; $('#pass').value = ''; $('#pass').focus();
  }
}

/* ============ navigazione ============ */
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  if (b.dataset.tab === 'colleghi' && tab === 'colleghi') schedaId = null;
  tab = b.dataset.tab; render();
});
$('#backBtn').onclick = () => { schedaId = null; render(); };

/* ============ service worker ============ */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}

boot();
})();
