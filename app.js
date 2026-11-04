'use strict';
/* Kochbuch v3 – App-Logik. Daten nur über Store (store.js). Rezepte aus rezepte/rezepte.json. Icons aus icons.js. */
const $ = s => document.querySelector(s), app = $('#app');
const TAGE = [['mo', 'Montag', 'Mo'], ['di', 'Dienstag', 'Di'], ['mi', 'Mittwoch', 'Mi'], ['do', 'Donnerstag', 'Do'], ['fr', 'Freitag', 'Fr'], ['sa', 'Samstag', 'Sa'], ['so', 'Sonntag', 'So']];
const TAGNAME = Object.fromEntries(TAGE.map(t => [t[0], t[1]]));
let DATA = null, R = {}, GLOBAL = {};
const scaleState = {};
const ui = { suche: '', filter: {}, wissen: '' };   // nur Anzeige, wird nicht gespeichert
let route = { v: 'rezepte' };

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* ---------- Ladenabteilungen und Zutaten-Icons ---------- */
const ABT = ['Gemüse & Früchte', 'Fleisch & Fisch', 'Milchprodukte & Eier', 'Brot & Backwaren', 'Vorrat & Gewürze', 'Öl & Saucen', 'Tiefkühl', 'Getränke', 'Diverses'];
const ABT_ICON = { 'Gemüse & Früchte': 'carrot', 'Fleisch & Fisch': 'meat', 'Milchprodukte & Eier': 'milk', 'Brot & Backwaren': 'bread', 'Vorrat & Gewürze': 'jar', 'Öl & Saucen': 'bottle', 'Tiefkühl': 'snow', 'Getränke': 'glass', 'Diverses': 'bag' };
// Wörterliste: das längste passende Wort gewinnt (z.B. «pfefferminze» vor «pfeffer», «kokosmilch» vor «milch»)
const WOERTER = {
  'Gemüse & Früchte': 'gemüse frucht früchte wurzel schwarzwurzel pastinake karotte rüebli kartoffel zwiebel knoblauch lauch ingwer kürbis pilz pilze austernpilze champignon tomate tomaten salat spinat gurke zucchetti peperoni broccoli blumenkohl kohl sellerie fenchel randen limette zitrone orange apfel äpfel birne banane bananen beeren trauben passionsfrucht avocado kräuter minze pfefferminze koriander petersilie basilikum schnittlauch thymian rosmarin dill',
  'Fleisch & Fisch': 'fleisch rind rindfleisch rindsplätzli plätzli steak hackfleisch hack poulet huhn hähnchen schwein speck schinken wurst salami lamm kalb lachs fisch forelle crevetten thon',
  'Milchprodukte & Eier': 'milch vollmilch butter käse rahm sauerrahm joghurt quark ei eier mozzarella parmesan feta mascarpone hüttenkäse tofu',
  'Brot & Backwaren': 'brot zopf gipfeli toast fladenbrot brötchen tortilla',
  'Vorrat & Gewürze': 'salz pfeffer zucker mehl reis nudeln pasta spaghetti ramen ramen-nudeln linsen kichererbsen bohnen dose bouillon gewürz gewürze zimt kurkuma kreuzkümmel chili paprika sesam nüsse mandeln honig kaffee tee kokosmilch tomatenpüree gehackte haferflocken',
  'Öl & Saucen': 'öl olivenöl sesamöl erdnussöl rapsöl sauce teriyaki-sauce sojasauce austernsauce essig senf ketchup mayonnaise miso miso-paste chili crunch',
  'Tiefkühl': 'tiefkühl tiefgekühlt glace tk',
  'Getränke': 'wasser mineralwasser saft wein bier sirup',
  'Diverses': 'zahnpasta zahnbürste shampoo seife duschmittel waschmittel wc-papier toilettenpapier haushaltpapier küchenpapier abwaschmittel schwamm alufolie backpapier'
};
const ICON_WOERTER = {
  root: 'schwarzwurzel schwarzwurzeln pastinake pastinaken wurzel', carrot: 'karotte rüebli', citrus: 'limette zitrone orange', fruit: 'passionsfrucht frucht beeren',
  apple: 'apfel äpfel', banana: 'banane bananen', herbs: 'kräuter minze pfefferminze koriander petersilie basilikum schnittlauch', meat: 'fleisch rind rindsplätzli plätzli steak poulet speck schinken',
  fish: 'fisch lachs crevetten thon', bottle: 'öl sesamöl olivenöl erdnussöl', sauce: 'sauce teriyaki-sauce sojasauce essig', salt: 'salz pfeffer', milk: 'milch', bread: 'brot zopf',
  egg: 'ei eier', butter: 'butter', cheese: 'käse', yogurt: 'joghurt', coffee: 'kaffee', roll: 'wc-papier toilettenpapier'
};
function bester(name, tabelle) {
  const n = name.toLowerCase(), worte = n.split(/[^a-zäöüéèàß-]+/);
  let best = null, len = 0;
  for (const [ziel, liste] of Object.entries(tabelle)) for (const w of liste.split(' ')) {
    const treffer = w.length <= 3 ? worte.includes(w) : n.includes(w);
    if (treffer && w.length > len) { best = ziel; len = w.length; }
  }
  return best;
}
const abteilungVon = (name, fest) => fest || bester(name, WOERTER) || 'Diverses';
const iconVon = (name, abt) => bester(name, ICON_WOERTER) || ABT_ICON[abt] || 'bag';
const SCHNELL = [['Milch', 'milk'], ['Brot', 'bread'], ['Eier', 'egg'], ['Butter', 'butter'], ['Käse', 'cheese'], ['Joghurt', 'yogurt'], ['Äpfel', 'apple'], ['Bananen', 'banana'], ['Kaffee', 'coffee'], ['WC-Papier', 'roll']];

/* ---------- Zahlen ---------- */
function roundUnit(v, einheit) {
  const e = (einheit || '').toLowerCase();
  const step = (e === 'g' || e === 'ml') ? (v < 100 ? 1 : 5) : (['kg', 'l', 'dl', 'cl'].includes(e) ? 0.05 : 0.25);
  const r = Math.round(v / step) * step;
  return r > 0 ? +r.toFixed(2) : +step.toFixed(2);
}
const num = n => String(+(+n).toFixed(2));
const fmtMenge = (m, e) => num(m) + (e ? ' ' + e : '');
const factorOf = (r, wert) => r.portionen_basis ? wert / r.portionen_basis : wert;
const scaled = (m, e, f) => f === 1 ? m : roundUnit(m * f, e);
const defaultScale = r => r.portionen_basis || 1;
const getScale = r => scaleState[r.id] != null ? scaleState[r.id] : defaultScale(r);
const scaleLabel = (r, w) => r.portionen_basis ? `${num(w)} ${w === 1 ? 'Portion' : 'Portionen'}` : `Menge × ${num(w)}`;
function stepScale(r, w, dir) { return r.portionen_basis ? Math.min(30, Math.max(1, w + dir)) : Math.min(6, Math.max(0.5, +(w + dir * 0.5).toFixed(2))); }
function zutatTeile(z, f) {
  if (z.menge == null) return ['', esc(z.name) + (z.notiz ? ', ' + esc(z.notiz) : '')];
  let m = (z.je ? 'je ' : '') + esc(fmtMenge(scaled(z.menge, z.einheit, f), z.einheit));
  if (z.plus) m += ' plus ' + esc(fmtMenge(scaled(z.plus.menge, z.plus.einheit, f), z.plus.einheit));
  let n = esc(z.name);
  if (z.alternative) n += `, ${esc(z.alternative.text)} ${esc(fmtMenge(scaled(z.alternative.menge, z.alternative.einheit, f), z.alternative.einheit))}`;
  if (z.notiz) n += ', ' + esc(z.notiz);
  return [m, n];
}
const zutatenListe = (r, f) => `<ul class="zut">${r.zutaten.map(z => { const [m, n] = zutatTeile(z, f); return `<li><span class="m">${m}</span><span class="n">${n}</span></li>`; }).join('')}</ul>`;
const minText = m => m == null ? '' : `ca. ${num(m)} Min.`;
const mmss = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
const datumKurz = ts => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`; };

/* ---------- Bilder ---------- */
function bildHTML(r, sizes, cls, lazy) {
  if (!r.bild) return `<div class="foto ph ${cls || ''}" role="img" aria-label="Noch kein Foto">${ico('pot')}</div>`;
  const st = 'bilder/' + r.bild.datei.replace(/\.[a-z]+$/i, '');
  return `<img class="foto ${cls || ''}" src="${st}-1200.webp" srcset="${st}-600.webp 600w, ${st}-1200.webp 1200w, ${st}-1800.webp 1800w" sizes="${sizes}" alt="${esc(r.bild.alt)}" ${lazy === false ? '' : 'loading="lazy"'} decoding="async">`;
}
document.addEventListener('error', e => {   // Bild fehlt (z.B. offline) -> ruhiger Platzhalter
  const img = e.target;
  if (img.tagName === 'IMG' && img.classList.contains('foto')) { const d = document.createElement('div'); d.className = img.className + ' ph'; d.setAttribute('role', 'img'); d.setAttribute('aria-label', 'Kein Foto'); d.innerHTML = ico('pot'); img.replaceWith(d); }
}, true);

/* ---------- Begriffe / Küchenwissen ---------- */
const glossarEintrag = (r, id) => (r && r.glossar && r.glossar[id]) || GLOBAL[id];
const schrittHTML = text => esc(text).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, (m, id, t) => `<button class="begriff" data-g="${id}">${t}</button>`);
function wissenListe() {
  const map = new Map();
  const add = (id, e, rid, grund) => { const k = norm(e.begriff); if (!map.has(k)) map.set(k, { begriff: e.begriff, text: e.text, rezepte: [], grund: false }); const x = map.get(k); if (rid && !x.rezepte.includes(rid)) x.rezepte.push(rid); if (grund) x.grund = true; };
  for (const r of DATA.rezepte) {
    for (const [id, e] of Object.entries(r.glossar || {})) add(id, e, r.id, false);
    for (const s of r.schritte) for (const [, id] of s.text.matchAll(/\[\[([a-z0-9-]+)\|/g)) if (!(r.glossar || {})[id] && GLOBAL[id]) add(id, GLOBAL[id], r.id, true);
  }
  for (const [id, e] of Object.entries(GLOBAL)) add(id, e, null, true);
  return [...map.values()].sort((a, b) => a.begriff.localeCompare(b.begriff, 'de'));
}

/* ---------- Sheet / Toast ---------- */
function openSheet(html) { $('#sheetBody').innerHTML = html; $('#sheet').hidden = false; }
function closeSheet() { $('#sheet').hidden = true; }
$('#sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
let toastT, toastFn = null;
function toast(t, aktion) {
  const el = $('#toast'); toastFn = aktion ? aktion.fn : null;
  el.innerHTML = `<span>${esc(t)}</span>${aktion ? `<button class="btn small" data-toast>${esc(aktion.label)}</button>` : ''}`;
  el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, aktion ? 6000 : 2600);
}
$('#toast').addEventListener('click', e => { if (e.target.closest('[data-toast]') && toastFn) { $('#toast').hidden = true; toastFn(); } });

/* ---------- Favoriten, zuletzt gekocht ---------- */
const istFav = rid => !!Store.get('favoriten', {})[rid];
function toggleFav(rid) { Store.update('favoriten', {}, o => { if (o[rid]) delete o[rid]; else o[rid] = true; return o; }); }
function gekocht(rid) { Store.update('zuletzt', [], l => [{ rid, ts: Date.now() }, ...l.filter(x => x.rid !== rid)].slice(0, 12)); toast('Als «zuletzt gekocht» gespeichert.'); }

/* ---------- Wochenplan ---------- */
const plan = () => Store.get('plan', {});
function heuteIdx() { return (new Date().getDay() + 6) % 7; }
function naechsterFreierTag(p) { for (let i = 0; i < 7; i++) { const k = TAGE[(heuteIdx() + i) % 7][0]; if (!p[k]) return k; } return null; }
function dieseWoche(rid) {
  const r = R[rid], p = plan(), tag = naechsterFreierTag(p);
  if (!tag) return tagWahl(rid, null, 'Die Woche ist voll – welcher Tag?');
  Store.update('plan', {}, q => { q[tag] = { rid, portionen: getScale(r) }; return q; });
  toast(`Für ${TAGNAME[tag]} eingeplant.`, { label: 'Tag ändern', fn: () => tagWahl(rid, tag) });
}
function tagWahl(rid, von, titel) {
  const p = plan();
  openSheet(`<h3>${esc(titel || 'An welchem Tag?')}</h3><div class="taggrid">${TAGE.map(([k, n]) => {
    const e = p[k], belegt = e && k !== von && R[e.rid];
    return `<button class="btn tagbtn ${k === von ? 'aktiv' : ''}" data-tagwahl="${k}" data-rid="${rid}" data-von="${von || ''}"><strong>${n}</strong>${belegt ? `<small>${von ? 'tauschen mit: ' : 'ersetzt: '}${esc(R[e.rid].titel)}</small>` : k === von ? '<small>aktuell</small>' : '<small>frei</small>'}</button>`;
  }).join('')}</div>`);
}
function setzeTag(rid, von, nach) {
  Store.update('plan', {}, p => {
    if (von) { const a = p[von], b = p[nach]; p[nach] = a; p[von] = b || null; if (!p[von]) delete p[von]; }
    else p[nach] = { rid, portionen: getScale(R[rid]) };
    return p;
  });
  closeSheet(); toast(`Jetzt am ${TAGNAME[nach]}.`);
}

/* ---------- Einkaufsliste (automatisch aus dem Wochenplan) ---------- */
function planZutaten() {
  const p = plan(), map = new Map();
  for (const [k] of TAGE) {
    const e = p[k]; if (!e || !R[e.rid]) continue;
    const r = R[e.rid], f = factorOf(r, e.portionen);
    for (const z of r.zutaten) {
      const key = 'z:' + (z.je ? 'je|' : '') + z.name.trim().toLowerCase();
      if (!map.has(key)) { const abt = abteilungVon(z.name, z.abteilung); map.set(key, { key, name: z.name, je: !!z.je, mengen: {}, alts: {}, notizen: [], rezepte: [], abt, icon: iconVon(z.name, abt) }); }
      const it = map.get(key);
      const add = (m, ei) => { const u = ei || ''; it.mengen[u] = roundUnit((it.mengen[u] || 0) + m * f, u); };
      if (z.menge != null) add(z.menge, z.einheit);
      if (z.plus) add(z.plus.menge, z.plus.einheit);
      if (z.alternative) { const a = z.alternative.text + '|' + (z.alternative.einheit || ''); it.alts[a] = roundUnit((it.alts[a] || 0) + z.alternative.menge * f, z.alternative.einheit); }
      if (z.notiz && !it.notizen.includes(z.notiz)) it.notizen.push(z.notiz);
      if (!it.rezepte.includes(r.titel)) it.rezepte.push(r.titel);
    }
  }
  return [...map.values()];
}
const mengenText = it => { const ks = Object.keys(it.mengen || {}); return ks.length ? (it.je ? 'je ' : '') + ks.map(k => fmtMenge(it.mengen[k], k)).join(' + ') : ''; };
function einkaufsListe() {
  const haken = Store.get('einkauf_haken', {}), weg = Store.get('einkauf_weg', {});
  const auto = planZutaten().filter(it => weg[it.key] !== mengenText(it)).map(it => Object.assign(it, { erledigt: !!haken[it.key] }));
  const eigen = Store.get('einkauf_eigen', []).map(e => { const abt = abteilungVon(e.name); return { key: 'e:' + e.id, id: e.id, name: e.name, anzahl: e.anzahl || 1, eigen: true, abt, icon: e.icon || iconVon(e.name, abt), erledigt: !!haken['e:' + e.id] }; });
  return [...auto, ...eigen];
}
function eigenDazu(name, icon) {
  name = name.trim(); if (!name) return;
  const haken = Store.get('einkauf_haken', {});
  Store.update('einkauf_eigen', [], l => {
    const x = l.find(e => norm(e.name) === norm(name) && !haken['e:' + e.id]);
    if (x) x.anzahl = (x.anzahl || 1) + 1; else l.push({ id: uid(), name, anzahl: 1, icon: icon || null });
    return l;
  });
}
function badge() { const n = DATA ? einkaufsListe().filter(i => !i.erledigt).length : 0; const b = $('#badge'); if (b) { b.hidden = !n; b.textContent = n; } }

/* ---------- Migration von v1/v2 ---------- */
function migrieren() {
  const alt = Store.get('wochenplan');
  if (alt !== undefined) {
    const p = Store.get('plan', {});
    for (const [k] of TAGE) for (const e of (alt && alt[k]) || []) {
      const r = R[e.rid]; if (!r) continue;
      const port = r.portionen_basis && Number.isInteger(e.wert) && e.wert >= 1 ? e.wert : defaultScale(r);
      const tag = !p[k] ? k : naechsterFreierTag(p);
      if (tag) p[tag] = { rid: e.rid, portionen: port };
    }
    Store.set('plan', p); Store.remove('wochenplan');
  }
  const altEk = Store.get('einkauf');
  if (altEk !== undefined) {
    const eig = Store.get('einkauf_eigen', []), haken = Store.get('einkauf_haken', {});
    (altEk || []).filter(i => i.eigen).forEach(i => { const id = i.id || uid(); eig.push({ id, name: i.name, anzahl: 1 }); if (i.erledigt) haken['e:' + id] = true; });
    Store.set('einkauf_eigen', eig); Store.set('einkauf_haken', haken); Store.remove('einkauf');   // Rezeptzutaten kommen neu automatisch aus dem Wochenplan
  }
}

/* ---------- Timer ---------- */
const timers = () => Store.get('timer', []);
const timerLeft = t => t.status === 'laeuft' ? t.ende - Date.now() : t.status === 'pause' ? t.rest : 0;
function startTimer(rid, si, ti) {
  unlockAudio();
  const def = R[rid].schritte[si].timer[ti], list = timers();
  if (list.some(t => t.rid === rid && t.si === si && t.ti === ti)) return;
  const dauer = Math.round(def.min * 60000);
  list.push({ id: uid(), rid, si, ti, label: def.label, dauer, ende: Date.now() + dauer, rest: null, status: 'laeuft' });
  Store.set('timer', list);
}
function timerAktion(id, a) {
  unlockAudio();
  const list = timers(), t = list.find(x => x.id === id); if (!t) return;
  const now = Date.now();
  if (a === 'pause' && t.status === 'laeuft') { t.rest = Math.max(0, t.ende - now); t.ende = null; t.status = 'pause'; }
  else if (a === 'weiter' && t.status === 'pause') { t.ende = now + t.rest; t.rest = null; t.status = 'laeuft'; }
  else if (a === 'plus') { if (t.status === 'laeuft') t.ende += 60000; else if (t.status === 'pause') t.rest += 60000; else { t.status = 'laeuft'; t.ende = now + 60000; t.rest = null; } }
  else if (a === 'stop') list.splice(list.indexOf(t), 1);
  Store.set('timer', list);
}
function tchipHTML(t, mitName) {
  const name = mitName && R[t.rid] ? `${esc(t.label)} · Schritt ${t.si + 1}` : esc(t.label);
  const pp = t.status === 'laeuft' ? `<button class="icon" data-ta="pause" data-tid="${t.id}" aria-label="Pause">${ico('pause')}</button>`
    : t.status === 'pause' ? `<button class="icon" data-ta="weiter" data-tid="${t.id}" aria-label="Weiter">${ico('play')}</button>` : '';
  return `<div class="tchip ${t.status}">${ico('timer', 'ti')}<div class="tl"><span>${name}</span><strong data-left="${t.id}">${t.status === 'fertig' ? 'Fertig!' : mmss(timerLeft(t))}</strong></div>
   ${pp}<button class="icon" data-ta="plus" data-tid="${t.id}" aria-label="Eine Minute mehr">+1</button><button class="icon" data-ta="stop" data-tid="${t.id}" aria-label="Abbrechen">${ico('x')}</button></div>`;
}
function stepTimersHTML(r, si) {
  const s = r.schritte[si]; if (!s.timer || !s.timer.length) return '';
  const list = timers();
  return `<div class="timers">${s.timer.map((d, ti) => {
    const t = list.find(x => x.rid === r.id && x.si === si && x.ti === ti);
    return t ? tchipHTML(t, false) : `<button class="btn tstart" data-start="${r.id}|${si}|${ti}">${ico('timer')}<span>${esc(d.label)}</span><span class="zeit">${mmss(d.min * 60000)}</span></button>`;
  }).join('')}</div>`;
}
function renderTimerbar() {
  const list = timers(), bar = $('#timerbar');
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
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
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
  const fertig = list.filter(t => t.status === 'fertig'), el = $('#alarm');
  if (!fertig.length) { if (!el.hidden) el.hidden = true; if (alarmLoop) { clearInterval(alarmLoop); alarmLoop = null; if (navigator.vibrate) navigator.vibrate(0); } return; }
  const sig = fertig.map(t => t.id).join();
  if (el.dataset.sig !== sig) {
    el.dataset.sig = sig;
    el.innerHTML = `${ico('timer', 'gross')}<h2>Zeit abgelaufen</h2>${fertig.map(t => `<div class="al">${esc(t.label)}</div>`).join('')}
      <button class="btn" data-alarm="ok">Ok</button><button class="btn sec" data-alarm="plus">+1 Minute</button>`;
  }
  el.hidden = false;
  if (!alarmLoop) { const ring = () => { unlockAudio(); beep(); if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); }; ring(); alarmLoop = setInterval(ring, 1600); }
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
const sterneHTML = n => n ? `<span class="stars-s" aria-label="${n} von 5 Sternen">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>` : '';
const herzBtn = (rid, cls) => `<button class="herz ${istFav(rid) ? 'on' : ''} ${cls || ''}" data-fav="${rid}" aria-label="${istFav(rid) ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}" aria-pressed="${istFav(rid)}">${ico('heart')}</button>`;
const ZEITEN = [['bis30', 'bis 30 Min.', m => m <= 30], ['30bis60', '30–60 Min.', m => m > 30 && m <= 60], ['ueber60', 'über 60 Min.', m => m > 60]];
function filterGruppen() {
  const werte = f => [...new Set(DATA.rezepte.flatMap(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  return [['kueche', 'Küche', werte(r => [r.kueche])], ['hauptzutat', 'Hauptzutat', werte(r => [r.hauptzutat])], ['saison', 'Saison', werte(r => r.saison || [])], ['zeit', 'Zeitaufwand', ZEITEN.map(z => z[1])]]
    .filter(g => g[2].length);
}
function passt(r) {
  const f = ui.filter;
  if (f.fav && !istFav(r.id)) return false;
  if (f.kueche && r.kueche !== f.kueche) return false;
  if (f.hauptzutat && r.hauptzutat !== f.hauptzutat) return false;
  if (f.saison && !(r.saison || []).includes(f.saison)) return false;
  if (f.zeit) { const z = ZEITEN.find(x => x[1] === f.zeit); if (r.zeit_total_min == null || !z[2](r.zeit_total_min)) return false; }
  if (ui.suche) {
    const heu = norm([r.titel, r.untertitel, r.kueche, r.hauptzutat, ...(r.saison || []), ...(r.kategorien || []), ...r.zutaten.map(z => z.name)].join(' '));
    if (!norm(ui.suche).split(/\s+/).every(w => heu.includes(w))) return false;
  }
  return true;
}
function karteHTML(r) {
  const n = Store.get('notizen', {})[r.id] || {};
  return `<article class="karte"><a href="#/rezept/${r.id}" class="karte-link" aria-label="${esc(r.titel)}"></a>
    <div class="karte-bild">${bildHTML(r, '(min-width: 760px) 400px, 100vw', '')}</div>${herzBtn(r.id, 'auf-bild')}
    <div class="karte-text">${r.kueche ? `<div class="eyebrow">${esc(r.kueche)}${r.saison && r.saison.length ? ' · ' + esc(r.saison.join(', ')) : ''}</div>` : ''}
    <h3>${esc(r.titel)}</h3>
    <div class="meta">${r.zeit_total_min ? `<span>${ico('clock')}${minText(r.zeit_total_min)}</span>` : ''}${r.portionen_basis ? `<span>${ico('plate')}${r.portionen_basis} Portionen</span>` : ''}${sterneHTML(n.sterne)}</div></div></article>`;
}
function listeErgebnis() {
  const liste = DATA.rezepte.filter(passt);
  const zuletzt = Store.get('zuletzt', []).filter(z => R[z.rid]);
  return `${zuletzt.length && !ui.suche && !Object.keys(ui.filter).length ? `<h2 class="abschnitt">Zuletzt gekocht</h2><div class="zuletzt">${zuletzt.slice(0, 6).map(z => `<a class="zl" href="#/rezept/${z.rid}">${bildHTML(R[z.rid], '96px', 'mini')}<span><strong>${esc(R[z.rid].titel)}</strong><small>gekocht am ${datumKurz(z.ts)}</small></span></a>`).join('')}</div>` : ''}
   <h2 class="abschnitt">${ui.suche || Object.keys(ui.filter).length ? `${liste.length} ${liste.length === 1 ? 'Treffer' : 'Treffer'}` : 'Alle Rezepte'}</h2>
   ${liste.length ? `<div class="karten">${liste.map(karteHTML).join('')}</div>` : `<p class="leer">Keine Rezepte gefunden.${Object.keys(ui.filter).length ? '<br><button class="btn ghost" data-filterweg>Filter zurücksetzen</button>' : ''}</p>`}`;
}
function viewListe() {
  const chip = (g, w, label) => `<button class="chip ${ui.filter[g] === w ? 'on' : ''}" data-filter="${g}" data-wert="${esc(w)}" aria-pressed="${ui.filter[g] === w}">${label || esc(w)}</button>`;
  app.innerHTML = `<header class="kopf"><div class="eyebrow">${DATA.rezepte.length} ${DATA.rezepte.length === 1 ? 'Rezept' : 'Rezepte'}</div><h1 class="titel-gross">Kochbuch</h1></header>
   <label class="suche">${ico('search')}<input type="search" id="suche" placeholder="Suchen: Rezept, Zutat, Stichwort" value="${esc(ui.suche)}" autocomplete="off" enterkeyhint="search"></label>
   <div class="filter">
     <div class="fgruppe"><div class="flabel">Merkliste</div><div class="chips"><button class="chip ${ui.filter.fav ? 'on' : ''}" data-filter="fav" data-wert="1" aria-pressed="${!!ui.filter.fav}">${ico('heart')}Favoriten</button></div></div>
     ${filterGruppen().map(([g, label, werte]) => `<div class="fgruppe"><div class="flabel">${label}</div><div class="chips">${werte.map(w => chip(g, w)).join('')}</div></div>`).join('')}
   </div>
   <div id="ergebnis">${listeErgebnis()}</div>`;
}
function viewRezept(rid) {
  const r = R[rid]; if (!r) return viewFehlt();
  const w = getScale(r), f = factorOf(r, w);
  const n = Store.get('notizen', {})[rid] || {};
  const tipps = Object.values(r.glossar || {});
  const fakten = [['whisk', 'Vorbereitung', minText(r.zeit_vorbereitung_min)], ['pot', 'Kochzeit', minText(r.zeit_kochen_min)], ['clock', 'Gesamtzeit', minText(r.zeit_total_min)],
    ['plate', 'Portionen', r.portionen_basis ? String(r.portionen_basis) : ''], ['hat', 'Schwierigkeit', r.schwierigkeit ? r.schwierigkeit[0].toUpperCase() + r.schwierigkeit.slice(1) : '']].filter(x => x[2]);
  const eyebrow = [r.kueche, (r.saison || []).join(', ')].filter(Boolean).join(' · ');
  app.innerHTML = `<figure class="hero">${bildHTML(r, '(min-width: 900px) 900px, 100vw', '', false)}
     <button class="rund zurueck" data-go="#/" aria-label="Zurück">${ico('back')}</button>${herzBtn(r.id, 'rund rechts')}</figure>
   <div class="blatt">
   ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}
   <div class="titelzeile"><span class="kreis">${ico('leaf')}</span><h1>${esc(r.titel)}</h1></div>
   ${r.untertitel ? `<p class="unter">${esc(r.untertitel)}</p>` : ''}
   <hr class="linie">
   <div class="aktionen"><button class="btn" data-go="#/kochen/${r.id}/1">${ico('pot')}Kochmodus starten</button><button class="btn sec" data-woche="${r.id}">${ico('calendar')}Diese Woche kochen</button><button class="btn ghost" data-gekocht="${r.id}">${ico('check')}Gekocht</button></div>
   <div class="layout">
    <aside class="links">
     <ul class="fakten">${fakten.map(([i, l, v]) => `<li>${ico(i)}<span><small>${l}</small><strong>${esc(v)}</strong></span></li>`).join('')}</ul>
     <h2>Zutaten</h2>
     <div class="stepper"><button class="icon" data-scale="-1" aria-label="Weniger">${ico('minus')}</button><div class="val">${scaleLabel(r, w)}</div><button class="icon" data-scale="1" aria-label="Mehr">${ico('plus')}</button></div>
     ${zutatenListe(r, f)}
     ${f !== 1 ? '<p class="hinweis">Die Mengen in der Zubereitung gelten für die Grundmenge.</p>' : ''}
    </aside>
    <section class="rechts">
     <h2>Zubereitung</h2>
     <ol class="steps">${r.schritte.map((s, i) => `<li><span class="nr">${i + 1}.</span><div><p>${schrittHTML(s.text)}</p>${stepTimersHTML(r, i)}</div></li>`).join('')}</ol>
     ${tipps.length ? `<h2>Tipps</h2><ul class="tipps">${tipps.map(t => `<li><h4>${esc(t.begriff)}</h4><p>${esc(t.text)}</p></li>`).join('')}</ul>` : ''}
     <h2>Bewertung und Notizen</h2>
     <div class="stars" role="radiogroup" aria-label="Bewertung">${[1, 2, 3, 4, 5].map(i => `<button class="${i <= (n.sterne || 0) ? 'on' : ''}" data-stern="${i}" aria-label="${i} von 5">★</button>`).join('')}</div>
     <textarea id="notiz" placeholder="Eigene Notizen, z.B. was beim nächsten Mal anders sein soll">${esc(n.text || '')}</textarea>
     ${r.quelle && (r.quelle.url || r.quelle.name) ? `<p class="quelle">Quelle: ${r.quelle.url ? `<a href="${esc(r.quelle.url)}" target="_blank" rel="noopener">${esc(r.quelle.name || r.quelle.url)}</a>` : esc(r.quelle.name)}</p>` : ''}
    </section>
   </div></div>`;
}
function viewKochen(rid, nr) {
  const r = R[rid]; if (!r) return viewFehlt();
  const total = r.schritte.length; nr = Math.min(Math.max(1, nr), total);
  const s = r.schritte[nr - 1];
  app.innerHTML = `<div class="kochkopf"><button class="icon" data-go="#/rezept/${r.id}" aria-label="Kochmodus beenden">${ico('x')}</button>
     <div class="kthumb">${bildHTML(r, '64px', 'mini', false)}</div>
     <div class="tt"><div>${esc(r.titel)}</div><small>Schritt ${nr} von ${total}</small></div></div>
   <div class="kochzeile"><span id="wach" class="wach"></span><button class="btn sec small" data-zutaten="${r.id}">${ico('bag')}Zutaten</button></div>
   <div class="prog"><i style="width:${nr / total * 100}%"></i></div>
   <div class="schrittkopf"><span class="kreis">${ico(s.timer && s.timer.length ? 'pot' : 'whisk')}</span><span class="nr-gross">Schritt ${nr}</span></div>
   <div class="kochtext">${schrittHTML(s.text)}</div>
   ${stepTimersHTML(r, nr - 1)}
   <div class="kochfuss"><button class="btn ghost" data-go="#/kochen/${r.id}/${nr - 1}" ${nr === 1 ? 'disabled' : ''}>${ico('back')}Zurück</button>
     ${nr < total ? `<button class="btn" data-go="#/kochen/${r.id}/${nr + 1}">Weiter</button>` : `<button class="btn" data-fertig="${r.id}">${ico('check')}Fertig</button>`}</div>`;
  showWake();
}
function viewPlan() {
  const p = plan(), hi = heuteIdx();
  const anzahl = TAGE.filter(([k]) => p[k] && R[p[k].rid]).length;
  app.innerHTML = `<header class="kopf"><div class="eyebrow">Diese Woche · ${anzahl} von 7 Tagen geplant</div><h1 class="titel-gross">Wochenplan</h1></header>
   <ul class="woche">${TAGE.map(([k, name], i) => {
     const e = p[k], r = e && R[e.rid];
     return `<li class="${i === hi ? 'heute' : ''}"><div class="tagname"><strong>${name}</strong>${i === hi ? '<small>heute</small>' : ''}</div>
      ${r ? `<a class="wbild" href="#/rezept/${r.id}">${bildHTML(r, '160px', 'mini')}</a>
        <div class="winfo"><a class="wtitel" href="#/rezept/${r.id}">${esc(r.titel)}</a>
          <div class="wknoepfe"><div class="mini"><button class="icon" data-pm="${k}|-1" aria-label="Weniger">${ico('minus')}</button><span>${scaleLabel(r, e.portionen)}</span><button class="icon" data-pm="${k}|1" aria-label="Mehr">${ico('plus')}</button></div>
          <button class="icon" data-verschieben="${k}" aria-label="Verschieben">${ico('move')}</button><button class="icon" data-pdel="${k}" aria-label="Entfernen">${ico('trash')}</button></div></div>`
        : `<div class="wbild">${'<div class="foto ph mini leerbild"></div>'}</div><div class="winfo"><span class="frei">Noch frei</span><button class="btn ghost small" data-wahl="${k}">${ico('plus')}Rezept wählen</button></div>`}</li>`;
   }).join('')}</ul>
   ${anzahl ? `<div class="aktionen"><button class="btn sec" data-go="#/einkauf">${ico('cart')}Zur Einkaufsliste</button><button class="btn ghost" data-planclear>Woche leeren</button></div>` : '<p class="leer">Im Rezept auf «Diese Woche kochen» tippen – es kommt automatisch auf den nächsten freien Tag.</p>'}`;
}
function viewEinkauf() {
  const list = einkaufsListe(), offen = list.filter(i => !i.erledigt), done = list.filter(i => i.erledigt);
  const mitRezept = new Set(list.flatMap(i => i.rezepte || [])).size > 1;
  const eig = Store.get('einkauf_eigen', []), haken = Store.get('einkauf_haken', {});
  const anz = name => { const x = eig.find(e => norm(e.name) === norm(name) && !haken['e:' + e.id]); return x ? x.anzahl || 1 : 0; };
  const li = it => {
    const zus = it.eigen ? '' : [...Object.entries(it.alts || {}).map(([k, m]) => { const [t, ei] = k.split('|'); return `${t} ${fmtMenge(m, ei)}`; }), ...(it.notizen || []), ...(mitRezept ? it.rezepte : [])].join(' · ');
    const menge = it.eigen ? (it.anzahl > 1 ? it.anzahl + '×' : '') : mengenText(it);
    return `<li class="${it.erledigt ? 'done' : ''}"><button class="check" data-check="${esc(it.key)}" aria-label="${it.erledigt ? 'Nicht erledigt' : 'Erledigt'}">${ico('check')}</button>
     <span class="zico">${ico(it.icon)}</span><div class="txt">${menge ? `<span class="menge">${esc(menge)}</span> ` : ''}${esc(it.name)}${zus ? `<small>${esc(zus)}</small>` : ''}</div>
     ${it.eigen ? `<button class="icon leise" data-edel="${it.id}" aria-label="Entfernen">${ico('x')}</button>` : ''}</li>`;
  };
  const gruppen = ABT.map(a => [a, offen.filter(i => i.abt === a)]).filter(g => g[1].length);
  const ausPlan = TAGE.filter(([k]) => plan()[k] && R[plan()[k].rid]).length;
  app.innerHTML = `<header class="kopf"><div class="eyebrow">${ausPlan ? `Aus dem Wochenplan · ${ausPlan} ${ausPlan === 1 ? 'Rezept' : 'Rezepte'}` : 'Wochenplan ist leer'}</div><h1 class="titel-gross">Einkaufsliste</h1></header>
   <div class="schnell">${SCHNELL.map(([n, i]) => { const a = anz(n); return `<button class="sbtn" data-schnell="${n}" data-icon="${i}">${ico(i)}<span>${n}</span>${a ? `<b class="zahl">${a}</b>` : ''}</button>`; }).join('')}</div>
   <form class="add" id="addForm"><input type="text" id="addTxt" placeholder="Weiteres, z.B. Zahnpasta" enterkeyhint="done" autocomplete="off"><button class="btn" aria-label="Hinzufügen">${ico('plus')}</button></form>
   ${!list.length ? `<p class="leer">Die Liste füllt sich automatisch mit den Zutaten der Rezepte im Wochenplan.</p>` : ''}
   ${gruppen.map(([a, items]) => `<section class="abt"><h2>${ico(ABT_ICON[a])}${esc(a)}</h2><ul class="ek">${items.map(li).join('')}</ul></section>`).join('')}
   ${done.length ? `<section class="abt erledigt"><h2>${ico('check')}Erledigt</h2><ul class="ek">${done.map(li).join('')}</ul></section>
     <div class="aktionen"><button class="btn ghost" data-clear>Erledigte entfernen</button></div>` : ''}`;
}
function wissenErgebnis() {
  const alle = wissenListe(), q = norm(ui.wissen);
  const liste = q ? alle.filter(e => norm(e.begriff + ' ' + e.text).includes(q)) : alle;
  return `${liste.length ? `<ul class="wissen">${liste.map(e => `<li><h3>${esc(e.begriff)}</h3><p>${esc(e.text)}</p>
     <div class="vorkommen"><small>Kommt vor in:</small>${e.rezepte.map(rid => `<a class="link" href="#/rezept/${rid}">${esc(R[rid].titel)}</a>`).join('')}${e.grund ? '<span class="grund">Küchen-Grundlagen</span>' : ''}</div></li>`).join('')}</ul>` : '<p class="leer">Nichts gefunden.</p>'}`;
}
function viewWissen() {
  const alle = wissenListe();
  app.innerHTML = `<header class="kopf"><div class="eyebrow">${alle.length} Begriffe und Tipps</div><h1 class="titel-gross">Küchenwissen</h1></header>
   <label class="suche">${ico('search')}<input type="search" id="wsuche" placeholder="Suchen, z.B. Limette oder andämpfen" value="${esc(ui.wissen)}" autocomplete="off" enterkeyhint="search"></label>
   <div id="wergebnis">${wissenErgebnis()}</div>`;
}
function viewFehlt() { app.innerHTML = `<p class="leer">Dieses Rezept gibt es nicht (mehr).<br><br><button class="btn" data-go="#/">Zur Rezeptliste</button></p>`; }

/* ---------- Navigation / Router ---------- */
const NAV = [['rezepte', 'Rezepte', 'book'], ['plan', 'Wochenplan', 'calendar'], ['einkauf', 'Einkauf', 'cart'], ['wissen', 'Küchenwissen', 'bulb']];
$('#nav').innerHTML = NAV.map(([v, l, i]) => `<button data-v="${v}">${ico(i)}<span>${l}</span>${v === 'einkauf' ? '<b id="badge" hidden></b>' : ''}</button>`).join('');
function parse() {
  const p = location.hash.replace(/^#\/?/, '').split('/');
  if (p[0] === 'rezept') return { v: 'rezept', id: p[1] };
  if (p[0] === 'kochen') return { v: 'kochen', id: p[1], nr: +p[2] || 1 };
  if (['einkauf', 'plan', 'wissen'].includes(p[0])) return { v: p[0] };
  return { v: 'rezepte' };
}
function render(keepScroll) {
  if (!DATA) return;
  const prev = route; route = parse();
  const y = window.scrollY, fokus = document.activeElement && document.activeElement.id;
  const sel = fokus && document.activeElement.selectionStart;
  document.body.classList.toggle('koch', route.v === 'kochen');
  document.body.classList.toggle('mit-hero', route.v === 'rezept');
  if (route.v === 'kochen') { if (!wakeWanted) { wakeWanted = true; requestWake(); } } else releaseWake();
  ({ rezepte: viewListe, rezept: () => viewRezept(route.id), kochen: () => viewKochen(route.id, route.nr), einkauf: viewEinkauf, plan: viewPlan, wissen: viewWissen })[route.v]();
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === (route.v === 'rezept' ? 'rezepte' : route.v)));
  renderTimerbar(); badge();
  if (fokus && ['suche', 'wsuche', 'addTxt'].includes(fokus) && $('#' + fokus)) { const i = $('#' + fokus); i.focus(); try { i.setSelectionRange(sel, sel); } catch (e) {} }
  if (keepScroll && prev.v === route.v && prev.id === route.id && prev.nr === route.nr) window.scrollTo(0, y); else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { closeSheet(); $('#toast').hidden = true; render(); });
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) location.hash = b.dataset.v === 'rezepte' ? '#/' : '#/' + b.dataset.v; });
['plan', 'einkauf_eigen', 'einkauf_haken', 'einkauf_weg', 'notizen', 'favoriten', 'zuletzt', 'timer'].forEach(k => Store.subscribe(k, () => {
  if (k === 'notizen' && document.activeElement && document.activeElement.id === 'notiz') return;
  if (k === 'timer' && route.v !== 'kochen' && route.v !== 'rezept') { renderTimerbar(); tick(); return; }
  render(true); tick();
}));

/* ---------- Eingaben ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-go]'); if (!t) return;
  const d = t.dataset;
  if (d.go) { location.hash = d.go; return; }
  if (d.g) { const g = glossarEintrag(R[route.id], d.g); return g && openSheet(`<h3>${esc(g.begriff)}</h3><p>${esc(g.text)}</p>`); }
  if (d.start) { const [rid, si, ti] = d.start.split('|'); return startTimer(rid, +si, +ti); }
  if (d.ta) return timerAktion(d.tid, d.ta);
  if (d.fav) { e.preventDefault(); return toggleFav(d.fav); }
  if (d.filter) { ui.filter[d.filter] === d.wert ? delete ui.filter[d.filter] : ui.filter[d.filter] = d.wert; return render(true); }
  if ('filterweg' in d) { ui.filter = {}; return render(true); }
  if (d.scale) { const r = R[route.id]; scaleState[r.id] = stepScale(r, getScale(r), +d.scale); return render(true); }
  if (d.woche) return dieseWoche(d.woche);
  if (d.gekocht) return gekocht(d.gekocht);
  if (d.fertig) { gekocht(d.fertig); location.hash = '#/rezept/' + d.fertig; return; }
  if (d.tagwahl) return setzeTag(d.rid, d.von || null, d.tagwahl);
  if (d.verschieben) return tagWahl(plan()[d.verschieben].rid, d.verschieben, 'Auf welchen Tag verschieben?');
  if (d.wahl) return openSheet(`<h3>Rezept für ${TAGNAME[d.wahl]}</h3><div class="rwahl">${DATA.rezepte.map(r => `<button class="btn ghost" data-setze="${d.wahl}|${r.id}">${bildHTML(r, '64px', 'mini')}<span>${esc(r.titel)}</span></button>`).join('')}</div>`);
  if (d.setze) { const [k, rid] = d.setze.split('|'); Store.update('plan', {}, p => { p[k] = { rid, portionen: defaultScale(R[rid]) }; return p; }); return closeSheet(); }
  if (d.pm) { const [k, dir] = d.pm.split('|'); return Store.update('plan', {}, p => { p[k].portionen = stepScale(R[p[k].rid], p[k].portionen, +dir); return p; }); }
  if (d.pdel) return Store.update('plan', {}, p => { delete p[d.pdel]; return p; });
  if ('planclear' in d) { if (confirm('Ganze Woche leeren?')) Store.set('plan', {}); return; }
  if (d.zutaten) { const r = R[d.zutaten], f = factorOf(r, getScale(r)); return openSheet(`<h3>Zutaten · ${esc(scaleLabel(r, getScale(r)))}</h3>${zutatenListe(r, f)}`); }
  if (d.stern) { const rid = route.id, n = +d.stern; return Store.update('notizen', {}, o => { const x = o[rid] || {}; x.sterne = x.sterne === n ? 0 : n; o[rid] = x; return o; }); }
  if (d.check) return Store.update('einkauf_haken', {}, h => { if (h[d.check]) delete h[d.check]; else h[d.check] = true; return h; });
  if (d.edel) return Store.update('einkauf_eigen', [], l => l.filter(x => x.id !== d.edel));
  if (d.schnell) return eigenDazu(d.schnell, d.icon);
  if ('clear' in d) {
    const list = einkaufsListe().filter(i => i.erledigt), haken = Store.get('einkauf_haken', {}), weg = Store.get('einkauf_weg', {});
    list.forEach(i => { delete haken[i.key]; if (!i.eigen) weg[i.key] = mengenText(i); });
    const ids = list.filter(i => i.eigen).map(i => i.id);
    Store.set('einkauf_weg', weg); Store.set('einkauf_eigen', Store.get('einkauf_eigen', []).filter(x => !ids.includes(x.id))); Store.set('einkauf_haken', haken);
  }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'addForm') return; e.preventDefault();
  eigenDazu($('#addTxt').value); const i = $('#addTxt'); if (i) i.value = '';
});
let notizT;
document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'suche') { ui.suche = e.target.value; $('#ergebnis').innerHTML = listeErgebnis(); return; }
  if (id === 'wsuche') { ui.wissen = e.target.value; $('#wergebnis').innerHTML = wissenErgebnis(); return; }
  if (id !== 'notiz') return;
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
    migrieren();
    render();
  } catch (e) {
    console.warn(e);
    app.innerHTML = '<p class="leer">Die Rezepte konnten nicht geladen werden. Bitte Internetverbindung prüfen und neu öffnen.</p>';
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
