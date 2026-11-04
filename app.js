'use strict';
/* Kochbuch – App-Logik. Daten nur über Store (store.js). Rezepte aus rezepte/rezepte.json. */
const $ = s => document.querySelector(s), app = $('#app');
const TAGE = [['mo', 'Montag'], ['di', 'Dienstag'], ['mi', 'Mittwoch'], ['do', 'Donnerstag'], ['fr', 'Freitag'], ['sa', 'Samstag'], ['so', 'Sonntag']];
let DATA = null, R = {}, GLOBAL = {};
const scaleState = {};            // gewählte Portionen/Faktor pro Rezept (nur Anzeige)
let route = { v: 'rezepte' };

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  uhr: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 9v4l3 2M9 2h6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  haken: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  topf: '<svg viewBox="0 0 24 24"><path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="currentColor"/><path d="M2 10h20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 3c-1 1.5 1 2 0 4M14 3c-1 1.5 1 2 0 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
};

/* ---------- Zahlen ---------- */
function roundUnit(v, einheit) {
  const e = (einheit || '').toLowerCase();
  let step;
  if (e === 'g' || e === 'ml') step = v < 100 ? 1 : 5;
  else if (e === 'kg' || e === 'l' || e === 'dl' || e === 'cl') step = 0.05;
  else step = 0.25;
  const r = Math.round(v / step) * step;
  return r > 0 ? +r.toFixed(2) : +(step).toFixed(2);
}
const num = n => String(+(+n).toFixed(2));           // Dezimalpunkt, ohne unnötige Nullen
const fmtMenge = (m, e) => num(m) + (e ? ' ' + e : '');
function factorOf(r, wert) { return r.portionen_basis ? wert / r.portionen_basis : wert; }
function scaled(m, e, f) { return f === 1 ? m : roundUnit(m * f, e); }
function defaultScale(r) { return r.portionen_basis || 1; }
function getScale(r) { return scaleState[r.id] != null ? scaleState[r.id] : defaultScale(r); }
function scaleLabel(r, wert) {
  return r.portionen_basis ? `${num(wert)} ${wert === 1 ? 'Portion' : 'Portionen'}` : `Menge × ${num(wert)}`;
}
function stepScale(r, wert, dir) {
  if (r.portionen_basis) return Math.min(30, Math.max(1, wert + dir));
  return Math.min(6, Math.max(0.5, +(wert + dir * 0.5).toFixed(2)));
}
function zutatHTML(z, f) {
  if (z.menge == null) return `<span>${esc(z.name)}${z.notiz ? ', ' + esc(z.notiz) : ''}</span>`;
  let s = (z.je ? 'je ' : '') + `<b>${esc(fmtMenge(scaled(z.menge, z.einheit, f), z.einheit))}</b>`;
  if (z.plus) s += ` plus <b>${esc(fmtMenge(scaled(z.plus.menge, z.plus.einheit, f), z.plus.einheit))}</b>`;
  s += ' ' + esc(z.name);
  if (z.alternative) s += `, ${esc(z.alternative.text)} ${esc(fmtMenge(scaled(z.alternative.menge, z.alternative.einheit, f), z.alternative.einheit))}`;
  if (z.notiz) s += ', ' + esc(z.notiz);
  return s;
}
const zeitText = min => min == null ? '' : `ca. ${num(min)} Min.`;
const mmss = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };

/* ---------- Begriffe ---------- */
function glossarEintrag(r, id) { return (r && r.glossar && r.glossar[id]) || GLOBAL[id]; }
function schrittHTML(text) {
  return esc(text).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, (m, id, t) => `<button class="begriff" data-g="${id}">${t}</button>`);
}
function zeigeBegriff(rid, id) {
  const g = glossarEintrag(R[rid], id);
  if (!g) return;
  openSheet(`<h3>${esc(g.begriff)}</h3><p>${esc(g.text)}</p>`);
}

/* ---------- Sheet / Toast ---------- */
function openSheet(html) { $('#sheetBody').innerHTML = html; $('#sheet').hidden = false; }
function closeSheet() { $('#sheet').hidden = true; }
$('#sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2400); }

/* ---------- Einkaufsliste ---------- */
function einkauf() { return Store.get('einkauf', []); }
function zuEinkauf(r, wert) {
  const f = factorOf(r, wert);
  Store.update('einkauf', [], list => {
    for (const z of r.zutaten) {
      const key = (z.je ? 'je|' : '') + z.name.trim().toLowerCase();
      let it = list.find(i => !i.eigen && !i.erledigt && i.key === key);
      if (!it) { it = { id: uid(), key, name: z.name, je: !!z.je, mengen: {}, notizen: [], rezepte: [], erledigt: false }; list.push(it); }
      const add = (m, e) => { const k = e || ''; it.mengen[k] = roundUnit((it.mengen[k] || 0) + m * f, k); };
      if (z.menge != null) add(z.menge, z.einheit);
      if (z.plus) add(z.plus.menge, z.plus.einheit);
      if (z.alternative) { it.alts = it.alts || {}; const k = z.alternative.text + '|' + (z.alternative.einheit || ''); it.alts[k] = roundUnit((it.alts[k] || 0) + z.alternative.menge * f, z.alternative.einheit); }
      if (z.notiz && !it.notizen.includes(z.notiz)) it.notizen.push(z.notiz);
      if (!it.rezepte.includes(r.titel)) it.rezepte.push(r.titel);
    }
    return list;
  });
}
function zusatzText(it, mitRezept) {
  const alts = Object.entries(it.alts || {}).map(([k, m]) => { const [t, e] = k.split('|'); return `${t} ${fmtMenge(m, e)}`; });
  return [...alts, ...(it.notizen || []), ...(mitRezept ? it.rezepte || [] : [])].join(' · ');
}
function mengenText(it) {
  const ks = Object.keys(it.mengen || {});
  if (!ks.length) return '';
  return (it.je ? 'je ' : '') + ks.map(k => fmtMenge(it.mengen[k], k)).join(' + ');
}
function badge() { const n = einkauf().filter(i => !i.erledigt).length; const b = $('#badge'); b.hidden = !n; b.textContent = n; }

/* ---------- Timer ---------- */
const timers = () => Store.get('timer', []);
function timerLeft(t) { return t.status === 'laeuft' ? t.ende - Date.now() : t.status === 'pause' ? t.rest : 0; }
function startTimer(rid, si, ti) {
  unlockAudio();
  const r = R[rid], def = r.schritte[si].timer[ti];
  const list = timers();
  if (list.some(t => t.rid === rid && t.si === si && t.ti === ti)) return;
  const dauer = Math.round(def.min * 60000);
  list.push({ id: uid(), rid, si, ti, label: def.label, dauer, ende: Date.now() + dauer, rest: null, status: 'laeuft' });
  Store.set('timer', list);
}
function timerAktion(id, a) {
  unlockAudio();
  const list = timers(), t = list.find(x => x.id === id);
  if (!t) return;
  const now = Date.now();
  if (a === 'pause' && t.status === 'laeuft') { t.rest = Math.max(0, t.ende - now); t.ende = null; t.status = 'pause'; }
  else if (a === 'weiter' && t.status === 'pause') { t.ende = now + t.rest; t.rest = null; t.status = 'laeuft'; }
  else if (a === 'plus') {
    if (t.status === 'laeuft') t.ende += 60000;
    else if (t.status === 'pause') t.rest += 60000;
    else { t.status = 'laeuft'; t.ende = now + 60000; t.rest = null; }
  }
  else if (a === 'stop') { list.splice(list.indexOf(t), 1); }
  Store.set('timer', list);
}
function tchipHTML(t, mitName) {
  const r = R[t.rid];
  const name = mitName && r ? `${esc(t.label)} · Schritt ${t.si + 1}` : esc(t.label);
  const pp = t.status === 'laeuft' ? `<button class="icon" data-ta="pause" data-tid="${t.id}" aria-label="Pause">${ICON.pause}</button>`
    : t.status === 'pause' ? `<button class="icon" data-ta="weiter" data-tid="${t.id}" aria-label="Weiter">${ICON.play}</button>` : '';
  return `<div class="tchip ${t.status}" data-chip="${t.id}"><div class="tl"><span>${name}</span><strong data-left="${t.id}">${t.status === 'fertig' ? 'Fertig!' : mmss(timerLeft(t))}</strong></div>
   ${pp}<button class="icon" data-ta="plus" data-tid="${t.id}" aria-label="Eine Minute mehr">+1</button><button class="icon" data-ta="stop" data-tid="${t.id}" aria-label="Abbrechen">${ICON.x}</button></div>`;
}
function stepTimersHTML(r, si) {
  const s = r.schritte[si];
  if (!s.timer || !s.timer.length) return '';
  const list = timers();
  return `<div class="timers">${s.timer.map((d, ti) => {
    const t = list.find(x => x.rid === r.id && x.si === si && x.ti === ti);
    return t ? tchipHTML(t, false)
      : `<button class="btn tstart" data-start="${r.id}|${si}|${ti}">${ICON.uhr}<span>${esc(d.label)}</span><span class="zeit">${mmss(d.min * 60000)}</span></button>`;
  }).join('')}</div>`;
}
function renderTimerbar() {
  const list = timers(), bar = $('#timerbar');
  // In der Rezept-/Kochansicht stehen die Timer dieses Rezepts schon beim Schritt; die Leiste zeigt trotzdem alle laufenden.
  // Im Kochmodus stehen die Timer des aktuellen Schritts schon gross beim Schritt; die Leiste zeigt alle übrigen.
  const zeigen = route.v === 'kochen' ? list.filter(t => !(t.rid === route.id && t.si === route.nr - 1)) : list;
  bar.hidden = !zeigen.length;
  bar.innerHTML = zeigen.map(t => tchipHTML(t, true)).join('');
  requestAnimationFrame(() => document.documentElement.style.setProperty('--tb', (zeigen.length ? bar.offsetHeight : 0) + 'px'));
}
function tick() {
  const list = timers(); let changed = false;
  for (const t of list) if (t.status === 'laeuft' && Date.now() >= t.ende) { t.status = 'fertig'; t.ende = null; changed = true; }
  if (changed) { Store.set('timer', list); return; }
  for (const t of list) document.querySelectorAll(`[data-left="${t.id}"]`).forEach(el => el.textContent = t.status === 'fertig' ? 'Fertig!' : mmss(timerLeft(t)));
  alarmCheck(list);
}
setInterval(tick, 250);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

/* ---------- Alarm: Ton + Vibration ---------- */
let actx = null, alarmLoop = null;
function unlockAudio() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';   // iOS: auch bei Stumm-Schalter hörbar, wo unterstützt
    if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === 'suspended') actx.resume();
  } catch (e) {}
}
document.addEventListener('pointerdown', unlockAudio, { passive: true });
function beep() {
  if (!actx) return;
  const t0 = actx.currentTime;
  [0, 0.28, 0.56].forEach((d, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.value = i === 2 ? 1175 : 880;
    g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.5, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
    o.connect(g); g.connect(actx.destination); o.start(t0 + d); o.stop(t0 + d + 0.25);
  });
}
function alarmCheck(list) {
  const fertig = list.filter(t => t.status === 'fertig');
  const el = $('#alarm');
  if (!fertig.length) { if (!el.hidden) el.hidden = true; if (alarmLoop) { clearInterval(alarmLoop); alarmLoop = null; if (navigator.vibrate) navigator.vibrate(0); } return; }
  const sig = fertig.map(t => t.id).join();
  if (el.dataset.sig !== sig) {
    el.dataset.sig = sig;
    el.innerHTML = `<h2>Zeit abgelaufen</h2>${fertig.map(t => `<div class="al">${esc(t.label)}</div>`).join('')}
      <button class="btn" data-alarm="ok">Ok</button><button class="btn sec" data-alarm="plus">+1 Minute</button>`;
  }
  el.hidden = false;
  if (!alarmLoop) {
    const ring = () => { unlockAudio(); beep(); if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); };
    ring(); alarmLoop = setInterval(ring, 1600);
  }
}
$('#alarm').addEventListener('click', e => {
  const b = e.target.closest('[data-alarm]'); if (!b) return;
  const list = timers();
  if (b.dataset.alarm === 'ok') Store.set('timer', list.filter(t => t.status !== 'fertig'));
  else { list.forEach(t => { if (t.status === 'fertig') { t.status = 'laeuft'; t.ende = Date.now() + 60000; } }); Store.set('timer', list); }
});

/* ---------- Wake Lock ---------- */
let wakeLock = null, wakeWanted = false, wakeState = 'aus';
async function requestWake() {
  if (!('wakeLock' in navigator)) { wakeState = 'nein'; showWake(); return; }
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeState = 'ja'; wakeLock.addEventListener('release', () => { if (wakeWanted && !document.hidden) requestWake(); }); }
  catch (e) { wakeState = 'nein'; }
  showWake();
}
function releaseWake() { wakeWanted = false; if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } wakeState = 'aus'; }
function showWake() {
  const el = $('#wach'); if (!el) return;
  el.className = 'wach ' + (wakeState === 'ja' ? 'ja' : 'nein');
  el.textContent = wakeState === 'ja' ? 'Bildschirm bleibt wach' : 'Wach-Halten hier nicht möglich – Bildschirm ggf. antippen';
}
document.addEventListener('visibilitychange', () => { if (wakeWanted && !document.hidden) requestWake(); });

/* ---------- Ansichten ---------- */
function sterneHTML(n) { return n ? `<span class="stars-s" aria-label="${n} von 5 Sternen">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>` : ''; }
function viewListe() {
  const notizen = Store.get('notizen', {});
  const g = Object.entries(GLOBAL);
  app.innerHTML = `<div class="hero"><img src="icons/icon-192.png" alt=""><div><h1>Kochbuch</h1><div class="muted">${DATA.rezepte.length} ${DATA.rezepte.length === 1 ? 'Rezept' : 'Rezepte'}</div></div></div>
   ${DATA.rezepte.map(r => `<button class="card rcard" data-go="#/rezept/${r.id}"><h3>${esc(r.titel)}</h3>
     <div class="meta">${r.zeit_total_min ? `<span>${ICON.uhr.replace('<svg', '<svg width="18" height="18" style="vertical-align:-3px"')} ${zeitText(r.zeit_total_min)}</span>` : ''}${r.untertitel ? `<span>${esc(r.untertitel)}</span>` : ''}${sterneHTML((notizen[r.id] || {}).sterne)}</div>
     <div class="meta" style="margin-top:6px">${(r.kategorien || []).map(k => `<span class="tag">${esc(k)}</span>`).join('')}</div></button>`).join('')}
   ${g.length ? `<h2>Küchen-Grundlagen</h2><div class="chips">${g.map(([id, e]) => `<button class="btn sec" data-gg="${id}">${esc(e.begriff)}</button>`).join('')}</div>` : ''}`;
}
function viewRezept(rid) {
  const r = R[rid]; if (!r) return viewFehlt();
  const w = getScale(r), f = factorOf(r, w);
  const n = Store.get('notizen', {})[rid] || {};
  const tipps = Object.values(r.glossar || {});
  app.innerHTML = `<div class="top"><button class="icon" data-go="#/" aria-label="Zurück">${ICON.back}</button><div class="sp"></div></div>
   <h1>${esc(r.titel)}</h1>
   <div class="meta">${r.zeit_total_min ? `<span>${zeitText(r.zeit_total_min)}</span>` : ''}${r.untertitel ? `<span>${esc(r.untertitel)}</span>` : ''}</div>
   <div class="row" style="margin-top:16px"><button class="btn" data-go="#/kochen/${r.id}/1">${ICON.topf} Kochmodus starten</button></div>
   <h2>Zutaten</h2>
   <div class="stepper"><button class="icon" data-scale="-1" aria-label="Weniger">−</button><div class="val">${scaleLabel(r, w)}${r.portionen_basis ? '' : '<small>Grundmenge laut Rezept = × 1</small>'}</div><button class="icon" data-scale="1" aria-label="Mehr">+</button></div>
   <div class="card"><ul class="zut">${r.zutaten.map(z => `<li>${zutatHTML(z, f)}</li>`).join('')}</ul></div>
   ${f !== 1 ? '<div class="hinweis">Die Mengen in der Zubereitung gelten für die Grundmenge.</div>' : ''}
   <div class="row" style="margin-top:12px"><button class="btn sec" data-ek="${r.id}">In die Einkaufsliste</button><button class="btn sec" data-planadd="${r.id}">Zum Wochenplan</button></div>
   <h2>Zubereitung</h2>
   <div class="card"><ol class="steps">${r.schritte.map((s, i) => `<li><div>${schrittHTML(s.text)}</div>${stepTimersHTML(r, i)}</li>`).join('')}</ol></div>
   ${tipps.length ? `<h2>Tipps</h2><div class="tipps">${tipps.map(t => `<div class="card"><h4>${esc(t.begriff)}</h4><p>${esc(t.text)}</p></div>`).join('')}</div>` : ''}
   <h2>Bewertung und Notizen</h2>
   <div class="card"><div class="stars" role="radiogroup" aria-label="Bewertung">${[1, 2, 3, 4, 5].map(i => `<button class="${i <= (n.sterne || 0) ? 'on' : ''}" data-stern="${i}" aria-label="${i} von 5">★</button>`).join('')}</div>
   <textarea id="notiz" placeholder="Eigene Notizen, z.B. was beim nächsten Mal anders sein soll">${esc(n.text || '')}</textarea></div>
   ${r.quelle && (r.quelle.url || r.quelle.name) ? `<p class="quelle muted">Quelle: ${r.quelle.url ? `<a href="${esc(r.quelle.url)}" target="_blank" rel="noopener">${esc(r.quelle.name || r.quelle.url)}</a>` : esc(r.quelle.name)}</p>` : ''}`;
}
function viewKochen(rid, nr) {
  const r = R[rid]; if (!r) return viewFehlt();
  const total = r.schritte.length; nr = Math.min(Math.max(1, nr), total);
  const s = r.schritte[nr - 1];
  app.innerHTML = `<div class="kochkopf"><button class="icon" data-go="#/rezept/${r.id}" aria-label="Kochmodus beenden">${ICON.x}</button>
     <div class="tt"><div>${esc(r.titel)}</div><small>Schritt ${nr} von ${total}</small></div><button class="btn sec small" data-zutaten="${r.id}" style="min-height:56px">Zutaten</button></div>
   <span id="wach" class="wach"></span>
   <div class="prog"><i style="width:${nr / total * 100}%"></i></div>
   <div class="kochtext">${schrittHTML(s.text)}</div>
   ${stepTimersHTML(r, nr - 1)}
   <div class="kochfuss"><button class="btn ghost" data-go="#/kochen/${r.id}/${nr - 1}" ${nr === 1 ? 'disabled style="opacity:.4"' : ''}>${ICON.back} Zurück</button>
     ${nr < total ? `<button class="btn" data-go="#/kochen/${r.id}/${nr + 1}">Weiter</button>` : `<button class="btn" data-go="#/rezept/${r.id}">Fertig</button>`}</div>`;
  showWake();
}
function viewEinkauf() {
  const list = einkauf(), offen = list.filter(i => !i.erledigt), done = list.filter(i => i.erledigt);
  const mitRezept = new Set(list.flatMap(i => i.rezepte || [])).size > 1;   // Herkunft nur zeigen, wenn mehrere Rezepte
  const li = it => `<li class="${it.erledigt ? 'done' : ''}"><button class="check" data-check="${it.id}" aria-label="${it.erledigt ? 'Nicht erledigt' : 'Erledigt'}">${ICON.haken}</button>
     <div class="txt">${mengenText(it) ? `<span class="menge">${esc(mengenText(it))}</span> ` : ''}${esc(it.name)}${zusatzText(it, mitRezept) ? `<small>${esc(zusatzText(it, mitRezept))}</small>` : ''}</div>
     <button class="icon" data-del="${it.id}" aria-label="Entfernen">${ICON.x}</button></li>`;
  app.innerHTML = `<h1>Einkaufsliste</h1>
   <form class="add" id="addForm"><input type="text" id="addTxt" placeholder="Eigener Eintrag, z.B. Brot" enterkeyhint="done" autocomplete="off"><button class="btn" aria-label="Hinzufügen">+</button></form>
   ${list.length ? '' : '<div class="card leer">Die Liste ist leer. Im Rezept auf «In die Einkaufsliste» tippen oder den Wochenplan übernehmen.</div>'}
   ${offen.length ? `<div class="card"><ul class="ek">${offen.map(li).join('')}</ul></div>` : ''}
   ${done.length ? `<h2>Erledigt</h2><div class="card"><ul class="ek">${done.map(li).join('')}</ul></div>
     <div class="row" style="margin-top:12px"><button class="btn ghost" data-clear="done">Erledigte löschen</button></div>` : ''}
   ${list.length ? `<div class="row" style="margin-top:12px"><button class="btn ghost" data-clear="all">Ganze Liste leeren</button></div>` : ''}`;
}
function viewPlan() {
  const plan = Store.get('wochenplan', {});
  const opts = DATA.rezepte.map(r => `<option value="${r.id}">${esc(r.titel)}</option>`).join('');
  app.innerHTML = `<h1>Wochenplan</h1>
   <div class="tage">${TAGE.map(([k, name]) => `<div class="card tag-k"><h3>${name}</h3>
     ${(plan[k] || []).map((e, i) => { const r = R[e.rid]; if (!r) return ''; return `<div class="pe"><button class="nm begriff" style="border:0;background:none;padding:0;text-align:left" data-go="#/rezept/${r.id}">${esc(r.titel)}</button>
        <div class="mini"><button class="icon" data-pm="${k}|${i}|-1" aria-label="Weniger">−</button><span>${scaleLabel(r, e.wert)}</span><button class="icon" data-pm="${k}|${i}|1" aria-label="Mehr">+</button>
        <button class="icon" data-pdel="${k}|${i}" aria-label="Entfernen">${ICON.x}</button></div></div>`; }).join('')}
     <div class="pe"><select data-padd="${k}" aria-label="Rezept für ${name} wählen"><option value="">+ Rezept wählen …</option>${opts}</select></div></div>`).join('')}</div>
   <div class="row" style="margin-top:16px"><button class="btn" data-plan2ek>Wochenplan in die Einkaufsliste</button><button class="btn ghost" data-planclear>Plan leeren</button></div>`;
}
function viewFehlt() { app.innerHTML = `<div class="card leer">Dieses Rezept gibt es nicht (mehr).<br><br><button class="btn" data-go="#/">Zur Rezeptliste</button></div>`; }

/* ---------- Router ---------- */
function parse() {
  const p = location.hash.replace(/^#\/?/, '').split('/');
  if (p[0] === 'rezept') return { v: 'rezept', id: p[1] };
  if (p[0] === 'kochen') return { v: 'kochen', id: p[1], nr: +p[2] || 1 };
  if (p[0] === 'einkauf') return { v: 'einkauf' };
  if (p[0] === 'plan') return { v: 'plan' };
  return { v: 'rezepte' };
}
function render(keepScroll) {
  if (!DATA) return;
  const prev = route; route = parse();
  const y = window.scrollY;
  document.body.classList.toggle('koch', route.v === 'kochen');
  if (route.v === 'kochen') { if (!wakeWanted) { wakeWanted = true; requestWake(); } } else releaseWake();
  ({ rezepte: viewListe, rezept: () => viewRezept(route.id), kochen: () => viewKochen(route.id, route.nr), einkauf: viewEinkauf, plan: viewPlan })[route.v]();
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === (route.v === 'rezept' ? 'rezepte' : route.v)));
  renderTimerbar(); badge();
  if (keepScroll && prev.v === route.v && prev.id === route.id && prev.nr === route.nr) window.scrollTo(0, y); else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { closeSheet(); $('#toast').hidden = true; render(); });
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) location.hash = b.dataset.v === 'rezepte' ? '#/' : '#/' + b.dataset.v; });
['einkauf', 'wochenplan', 'notizen', 'timer'].forEach(k => Store.subscribe(k, () => {
  if (k === 'notizen' && document.activeElement && document.activeElement.id === 'notiz') return;   // Tippen nicht stören
  if (k === 'timer' && route.v !== 'kochen' && route.v !== 'rezept') { renderTimerbar(); tick(); return; }
  render(true); tick();
}));

/* ---------- Klicks ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-go]'); if (!t) return;
  const d = t.dataset;
  if (d.go) { location.hash = d.go; return; }
  if (d.g) return zeigeBegriff(route.id, d.g);
  if (d.gg) { const g = GLOBAL[d.gg]; return openSheet(`<h3>${esc(g.begriff)}</h3><p>${esc(g.text)}</p>`); }
  if (d.start) { const [rid, si, ti] = d.start.split('|'); return startTimer(rid, +si, +ti); }
  if (d.ta) return timerAktion(d.tid, d.ta);
  if (d.scale) { const r = R[route.id]; scaleState[r.id] = stepScale(r, getScale(r), +d.scale); return render(true); }
  if (d.ek) { const r = R[d.ek]; zuEinkauf(r, getScale(r)); return toast('Zutaten sind in der Einkaufsliste.'); }
  if (d.planadd) return openSheet(`<h3>An welchem Tag?</h3><div class="daylist">${TAGE.map(([k, n]) => `<button class="btn sec" data-plantag="${k}|${d.planadd}">${n}</button>`).join('')}</div>`);
  if (d.plantag) {
    const [k, rid] = d.plantag.split('|'), r = R[rid];
    Store.update('wochenplan', {}, p => { (p[k] = p[k] || []).push({ rid, wert: getScale(r) }); return p; });
    closeSheet(); return toast(`Im Wochenplan: ${TAGE.find(x => x[0] === k)[1]}`);
  }
  if (d.zutaten) { const r = R[d.zutaten], f = factorOf(r, getScale(r)); return openSheet(`<h3>Zutaten · ${esc(scaleLabel(r, getScale(r)))}</h3><ul class="zut">${r.zutaten.map(z => `<li>${zutatHTML(z, f)}</li>`).join('')}</ul>`); }
  if (d.stern) { const rid = route.id, n = +d.stern; return Store.update('notizen', {}, o => { const x = o[rid] || {}; x.sterne = x.sterne === n ? 0 : n; o[rid] = x; return o; }); }
  if (d.check) return Store.update('einkauf', [], l => { const i = l.find(x => x.id === d.check); if (i) i.erledigt = !i.erledigt; return l; });
  if (d.del) return Store.update('einkauf', [], l => l.filter(x => x.id !== d.del));
  if (d.clear) { if (d.clear === 'all' && !confirm('Ganze Einkaufsliste leeren?')) return; return Store.update('einkauf', [], l => d.clear === 'all' ? [] : l.filter(x => !x.erledigt)); }
  if (d.pm) { const [k, i, dir] = d.pm.split('|'); return Store.update('wochenplan', {}, p => { const en = p[k][+i]; en.wert = stepScale(R[en.rid], en.wert, +dir); return p; }); }
  if (d.pdel) { const [k, i] = d.pdel.split('|'); return Store.update('wochenplan', {}, p => { p[k].splice(+i, 1); return p; }); }
  if ('plan2ek' in d) {
    const p = Store.get('wochenplan', {}); let n = 0;
    TAGE.forEach(([k]) => (p[k] || []).forEach(en => { if (R[en.rid]) { zuEinkauf(R[en.rid], en.wert); n++; } }));
    return toast(n ? `${n} ${n === 1 ? 'Rezept' : 'Rezepte'} in die Einkaufsliste übernommen.` : 'Der Wochenplan ist noch leer.');
  }
  if ('planclear' in d) { if (confirm('Ganzen Wochenplan leeren?')) Store.set('wochenplan', {}); return; }
});
document.addEventListener('change', e => {
  const s = e.target.closest('select[data-padd]'); if (!s || !s.value) return;
  const k = s.dataset.padd, rid = s.value, r = R[rid];
  Store.update('wochenplan', {}, p => { (p[k] = p[k] || []).push({ rid, wert: defaultScale(r) }); return p; });
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'addForm') return; e.preventDefault();
  const v = $('#addTxt').value.trim(); if (!v) return;
  Store.update('einkauf', [], l => { l.push({ id: uid(), key: 'eigen|' + v.toLowerCase(), name: v, eigen: true, je: false, mengen: {}, notizen: [], rezepte: [], erledigt: false }); return l; });
  setTimeout(() => { const i = $('#addTxt'); if (i) i.focus(); }, 0);
});
let notizT;
document.addEventListener('input', e => {
  if (e.target.id !== 'notiz') return;
  const rid = route.id, v = e.target.value;
  clearTimeout(notizT); notizT = setTimeout(() => Store.update('notizen', {}, o => { o[rid] = Object.assign(o[rid] || {}, { text: v }); return o; }), 400);
});

/* ---------- Start ---------- */
async function laden() {
  try {
    const res = await fetch('rezepte/rezepte.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
    R = {}; DATA.rezepte.forEach(r => R[r.id] = r); GLOBAL = DATA.grundlagen || {};
    render();
  } catch (e) {
    app.innerHTML = '<div class="card leer">Die Rezepte konnten nicht geladen werden. Bitte Internetverbindung prüfen und neu öffnen.</div>';
  }
}
laden();

/* ---------- Service Worker + Update-Hinweis ---------- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    const zeige = w => { if (!w) return; $('#update').hidden = false; $('#updateBtn').onclick = () => w.postMessage('SKIP_WAITING'); };
    if (reg.waiting && navigator.serviceWorker.controller) zeige(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) zeige(w); }); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloaded = false; const hatteSW = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded || !hatteSW) return; reloaded = true; location.reload(); });
}
