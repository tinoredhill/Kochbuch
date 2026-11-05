'use strict';
/* Kochbuch v9 – App-Logik (v9: Vorrat-Abteilungen, Menü-Fix; Vorrat in vorrat.js / vorrat-kern.js). Daten nur über Store (store.js). Rezepte aus rezepte/rezepte.json. Icons aus icons.js. */
const $ = s => document.querySelector(s), app = $('#app');
const TAGE = [['mo', 'Montag', 'Mo'], ['di', 'Dienstag', 'Di'], ['mi', 'Mittwoch', 'Mi'], ['do', 'Donnerstag', 'Do'], ['fr', 'Freitag', 'Fr'], ['sa', 'Samstag', 'Sa'], ['so', 'Sonntag', 'So']];
const TAGNAME = Object.fromEntries(TAGE.map(t => [t[0], t[1]]));
let DATA = null, R = {}, GLOBAL = {};
const scaleState = {};
const ui = { suche: '', filter: {}, wissen: '', woche: 0, wahl: null };   // nur Anzeige, wird nicht gespeichert
let route = { v: 'rezepte' };

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* ---------- Ladenabteilungen und Zutaten-Icons ---------- */
const ABT = ['Gemüse & Früchte', 'Fleisch & Fisch', 'Milchprodukte & Eier', 'Brot & Backwaren', 'Vorrat & Gewürze', 'Öl & Saucen', 'Tiefkühl', 'Getränke', 'Diverses'];
const ABT_ICON = { 'Gemüse & Früchte': 'carrot', 'Fleisch & Fisch': 'meat', 'Milchprodukte & Eier': 'milk', 'Brot & Backwaren': 'bread', 'Vorrat & Gewürze': 'jar', 'Öl & Saucen': 'bottle', 'Tiefkühl': 'snow', 'Getränke': 'glass', 'Diverses': 'bag' };
// Wörterliste: Regel siehe bester() (Kopfwort am Wortende, verdeckte Teilwörter zählen nicht, z.B. «kokosmilch» vor «milch»)
const WOERTER = {
  'Gemüse & Früchte': 'gemüse frucht früchte wurzel schwarzwurzel pastinake karotte rüebli kartoffel zwiebel knoblauch lauch ingwer kürbis pilz pilze austernpilze champignon tomate tomaten salat spinat gurke zucchetti peperoni broccoli blumenkohl kohl sellerie fenchel randen limette zitrone zitronensaft limettensaft orange apfel äpfel birne banane bananen beeren trauben passionsfrucht avocado kräuter minze pfefferminze koriander petersilie basilikum schnittlauch thymian rosmarin dill',
  'Fleisch & Fisch': 'fleisch rind rindfleisch rindsplätzli plätzli steak hackfleisch hack poulet huhn hähnchen schwein speck schinken wurst salami lamm kalb lachs fisch forelle crevetten thon',
  'Milchprodukte & Eier': 'milch vollmilch butter käse rahm sauerrahm joghurt quark ei eier mozzarella parmesan feta mascarpone hüttenkäse tofu',
  'Brot & Backwaren': 'brot zopf gipfeli toast fladenbrot brötchen tortilla butterzopf butterbrot buttergipfeli butterbrezel butterzöpfli',
  'Vorrat & Gewürze': 'salz pfeffer zucker mehl reis nudeln pasta spaghetti ramen ramen-nudeln linsen kichererbsen bohnen dose bouillon gewürz gewürze zimt kurkuma kreuzkümmel chili paprika sesam nüsse mandeln honig kaffee tee kokosmilch tomatenpüree gehackte haferflocken',
  'Öl & Saucen': 'öl olivenöl sesamöl erdnussöl rapsöl sauce teriyaki-sauce sojasauce austernsauce essig senf ketchup mayonnaise miso miso-paste chili crunch',
  'Tiefkühl': 'tiefkühl tiefgekühlt glace tk',
  'Getränke': 'wasser mineralwasser saft wein bier sirup',
  'Diverses': 'zahnpasta zahnbürste shampoo seife duschmittel waschmittel wc-papier toilettenpapier haushaltpapier küchenpapier abwaschmittel schwamm alufolie backpapier'
};
const ICON_WOERTER = {
  pumpkin: 'kürbis', mushroom: 'pilze austernpilze pilz champignon', noodles: 'nudeln ramen-nudeln ramen pasta spaghetti', cube: 'tofu', onion: 'zwiebel knoblauch knoblauchzehe knoblauchzehen', can: 'dose kichererbsen gehackte kokosmilch tomatenpüree', bean: 'edamame linsen bohnen', root: 'schwarzwurzel schwarzwurzeln pastinake pastinaken wurzel', carrot: 'karotte rüebli', citrus: 'limette zitrone orange', fruit: 'passionsfrucht frucht beeren',
  apple: 'apfel äpfel', banana: 'banane bananen', herbs: 'kräuter minze pfefferminze koriander petersilie basilikum schnittlauch', meat: 'fleisch rind rindsplätzli plätzli steak poulet speck schinken',
  fish: 'fisch lachs crevetten thon', bottle: 'öl sesamöl olivenöl erdnussöl', sauce: 'sauce teriyaki-sauce sojasauce essig', salt: 'salz pfeffer', milk: 'milch', bread: 'brot zopf',
  egg: 'ei eier', butter: 'butter', cheese: 'käse', yogurt: 'joghurt', coffee: 'kaffee', roll: 'wc-papier toilettenpapier'
};
/* v9.1 – gleiche Regel wie besterWort() in vorrat-kern.js:
   1. Treffer sammeln (Wörter bis 3 Buchstaben nur als ganzes Wort). 2. Treffer, die ganz in einem längeren Treffer an derselben
   Stelle stecken, zählen nicht (milch in kokosmilch). 3. Kopfwort am Wortende gewinnt (Butterzopf = Zopf, Apfelsaft = Saft).
   4. Sonst das längere, bei Gleichstand das hintere Wort. */
const BUCHST = /[a-zäöüéèàâçß]/;
function bester(name, tabelle) {
  const n = String(name || '').toLowerCase(), hits = [];
  const grenze = i => i < 0 || i >= n.length || !BUCHST.test(n[i]);
  for (const [ziel, liste] of Object.entries(tabelle)) for (const w of liste.split(' ')) {
    if (!w) continue;
    for (let i = n.indexOf(w); i >= 0; i = n.indexOf(w, i + 1)) {
      if (w.length <= 3 && !(grenze(i - 1) && grenze(i + w.length))) continue;
      let ende = i + w.length; while (ende < n.length && BUCHST.test(n[ende])) ende++;
      hits.push({ ziel, a: i, b: i + w.length, len: w.length, kopf: ende - (i + w.length) <= 2 });
    }
  }
  const frei = hits.filter(h => !hits.some(g => g.len > h.len && g.a <= h.a && g.b >= h.b));
  frei.sort((x, y) => (y.kopf - x.kopf) || (y.len - x.len) || (y.a - x.a));
  return frei.length ? frei[0].ziel : null;
}
const abteilungVon = (name, fest) => fest || bester(name, WOERTER) || 'Diverses';
const iconVon = (name, abt) => bester(name, ICON_WOERTER) || ABT_ICON[abt] || 'bag';
const SCHNELL = [['Milch', 'milk'], ['Brot', 'bread'], ['Eier', 'egg'], ['Butter', 'butter'], ['Käse', 'cheese'], ['Joghurt', 'yogurt'], ['Äpfel', 'apple'], ['Bananen', 'banana'], ['Kaffee', 'coffee'], ['WC-Papier', 'roll']];

/* ---------- Zahlen ---------- */
function roundUnit(v, einheit) {
  const e = (einheit || '').toLowerCase();
  const step = (e === 'g' || e === 'ml') ? (v < 100 ? 1 : 5) : (['kg', 'l', 'dl', 'cl'].includes(e) ? 0.05 : (v < 0.5 ? 0.125 : 0.25));   // kleine Löffelmengen in Achteln
  const r = Math.round(v / step) * step;
  return r > 0 ? +r.toFixed(3) : +step.toFixed(3);
}
const num = n => String(+(+n).toFixed(3));
const fmtMenge = (m, e) => num(m) + (e ? ' ' + e : '');
const factorOf = (r, wert) => r.portionen_basis ? wert / r.portionen_basis : wert;
const scaled = (m, e, f) => f === 1 ? m : roundUnit(m * f, e);
const defaultScale = r => r.portionen_basis || 1;
const getScale = r => scaleState[r.id] != null ? scaleState[r.id] : defaultScale(r);
const scaleLabel = (r, w) => r.portionen_basis ? `${num(w)} ${w === 1 ? 'Portion' : 'Portionen'}` : `Menge × ${num(w)}`;
function stepScale(r, w, dir) { return r.portionen_basis ? Math.min(30, Math.max(1, w + dir)) : Math.min(6, Math.max(0.5, +(w + dir * 0.5).toFixed(2))); }
const qty = (x, f) => fmtMenge(scaled(x.menge, x.einheit, f), x.einheit);
function zutatTeile(z, f) {
  if (z.menge == null) return ['', esc(z.name) + (z.notiz ? ', ' + esc(z.notiz) : '')];
  let m = (z.je ? 'je ' : '') + esc(qty(z, f));
  if (z.plus) m += ' plus ' + esc(qty(z.plus, f));
  let n = esc(z.name);
  if (z.oder && z.oder.length) { const o = z.oder.map(x => `${qty(x, f)} ${x.name}`); n += esc((o.length > 1 ? ', ' + o.slice(0, -1).join(', ') : '') + ' oder ' + o[o.length - 1]); }
  for (const k of ['alternative', 'zusatz']) if (z[k]) n += esc(`, ${z[k].text} ${qty(z[k], f)}${z[k].text_nach ? ' ' + z[k].text_nach : ''}`);
  if (z.notiz) n += ', ' + esc(z.notiz);
  return [m, n];
}
/* v9.1: Zutat schon im Vorrat (Bestand > 0)? Abgleich in vorrat-kern.js (imVorrat, ohne KI). Mengen-Hinweis nur wenn klar vergleichbar. */
function vorratMarke(z, f, v) {
  const VKx = window.VorratKern; if (!VKx || !v || !Object.keys(v).length) return '';
  const tr = VKx.imVorrat(z.name, v); if (!tr) return '';
  const orte = [...new Set(tr.map(([, e]) => VKx.ORTNAME[e.ort] || ''))].filter(Boolean).join(', ');
  const rr = z.je || z.menge == null ? null : VKx.vorratReicht(scaled(z.menge, z.einheit, f), z.einheit, tr);
  if (rr && !rr.reicht) return `<span class="imv wenig" title="${esc(orte)}">${ico('check')}im Vorrat: nur ${esc(num(rr.hat))} ${esc(rr.einheit)}</span>`;
  return `<span class="imv" title="${esc(orte)}">${ico('check')}im Vorrat</span>`;
}
function zutatenListe(r, f) {
  let g = null, html = '';
  const v = Store.get('vorrat', {});
  for (const z of r.zutaten) {
    if ((z.gruppe || null) !== g) { g = z.gruppe || null; if (g) html += `<li class="gruppe">${esc(g)}</li>`; }
    const [m, n] = zutatTeile(z, f), iv = vorratMarke(z, f, v);
    html += `<li class="${z.gruppe ? 'in-gruppe' : ''}${iv ? ' im-vorrat' : ''}">${z.vor ? `<span class="vor">${esc(z.vor)}</span>` : ''}<span class="m">${m}</span><span class="n">${n}${iv}</span></li>`;   // «vor» steht wie in der Vorlage vor der Menge
  }
  return `<ul class="zut">${html}</ul>`;
}
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

function glossarHTML(g) {
  const b = g.bild;
  return `<h3>${esc(g.begriff)}</h3>${b ? `<figure class="zbild"><img src="bilder/${esc(b.datei)}" srcset="bilder/${esc(b.datei)} 320w, bilder/${esc(b.datei.replace(/\.webp$/, '-640.webp'))} 640w" sizes="(min-width: 600px) 240px, 45vw" alt="${esc(b.alt)}" width="320" height="240" decoding="async"><figcaption>${esc(b.nachweis)}</figcaption></figure>` : ''}<p>${esc(g.text)}</p>`;
}
/* ---------- Sheet / Toast ---------- */
function openSheet(html) { $('#sheetBody').innerHTML = html; $('#sheet').hidden = false; }
function closeSheet() { $('#sheet').hidden = true; }
function sheetNeu(k) {   // true = Anzeige im offenen Fenster schon aufgefrischt, Seite dahinter später
  // Auswahl-Sheet: Kacheln NICHT bei jedem Sync neu bauen – sonst verschwindet der Tip auf dem iPhone
  // (Firestore-Snapshots mit includeMetadataChanges ersetzen den DOM mitten im Antippen).
  if ($('#wahlErgebnis')) {
    if (k === 'bewertungen' || k === 'favoriten' || k === 'zuletzt') $('#wahlErgebnis').innerHTML = wahlErgebnis();
    render(true); return true;
  }
  if ($('.gwliste') && k === 'gewohnheiten') { gewohnheitenSheet(); render(true); return true; }
  if ($('.vr-frisch') && k === 'vorrat') { vrFrischZahlen(); render(true); return true; }
  return false;
}
$('#sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
let toastT, toastFn = null;
function toast(t, aktion) {
  const el = $('#toast'); toastFn = aktion ? aktion.fn : null;
  el.innerHTML = `<span>${esc(t)}</span>${aktion ? `<button class="btn small" data-toast>${esc(aktion.label)}</button>` : ''}`;
  el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, aktion ? 6000 : 2600);
}
$('#toast').addEventListener('click', e => { if (e.target.closest('[data-toast]') && toastFn) { $('#toast').hidden = true; toastFn(); } });

/* ---------- Datum (lokale Zeit, Wochen ab Montag, ISO-Kalenderwoche) ---------- */
const pad2 = n => String(n).padStart(2, '0');
const isoDatum = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const ausIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const plusTage = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const heute = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const montagVon = d => plusTage(d, -((d.getDay() + 6) % 7));
const istDatum = k => /^\d{4}-\d{2}-\d{2}$/.test(k);
function kwVon(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); }
function wocheTage(off) { const m = plusTage(montagVon(heute()), 7 * off); return TAGE.map((t, i) => { const d = plusTage(m, i); return { key: isoDatum(d), d, tag: t[0], name: t[1], kurz: t[2], i }; }); }
const datumKurzD = d => `${d.getDate()}.${d.getMonth() + 1}.`;
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function wochenSpanne(tage) { const a = tage[0].d, b = tage[6].d; return a.getMonth() === b.getMonth() ? `${a.getDate()}.–${b.getDate()}. ${MONATE[b.getMonth()]}` : `${a.getDate()}. ${MONATE[a.getMonth()]} – ${b.getDate()}. ${MONATE[b.getMonth()]}`; }
const tagLang = k => { const d = ausIso(k); return `${TAGE[(d.getDay() + 6) % 7][1]}, ${datumKurzD(d)}`; };

/* ---------- Jahreszeit (meteorologisch) und Akzentfarbe ---------- */
const SAISONS = [['fruehling', 'Frühling', 'Kräutergrün'], ['sommer', 'Sommer', 'Tomatenrot'], ['herbst', 'Herbst', 'Kürbisorange'], ['winter', 'Winter', 'Tannengrün']];
const saisonId = d => { const m = d.getMonth() + 1; return m >= 3 && m <= 5 ? 'fruehling' : m >= 6 && m <= 8 ? 'sommer' : m >= 9 && m <= 11 ? 'herbst' : 'winter'; };
const saisonName = id => (SAISONS.find(s => s[0] === id) || [])[1];
const einst = () => Store.get('einstellungen', {}) || {};
function einstSetzen(o) { Store.set('einstellungen', Object.assign(einst(), o)); }
function farbeAnwenden() {
  const f = einst().farbe, s = f && f !== 'auto' ? f : saisonId(new Date());
  document.documentElement.dataset.saison = s;
}

/* ---------- Personen, Likes und Sterne ---------- */
const PERSONEN = [['tino', 'Tino'], ['lili', 'Lili']];
const PNAME = Object.fromEntries(PERSONEN);
const ich = () => PNAME[einst().person] ? einst().person : null;
/* Bis v6 waren Favoriten («favoriten») und Sterne («notizen».sterne) gemeinsam. Entscheid Tino (v7): sie gehören Lili.
   altNachLili() rechnet sie rein (ohne Speichern) in «bewertungen» um; wartung() speichert das Ergebnis.
   - Pro Rezept merkt sich der Eintrag 'rid|_v6' = { f, s } den übernommenen alten Stand -> idempotent, nichts doppelt.
   - Erste Übernahme: nur Felder füllen, die Lili noch nicht selbst gesetzt hat (eigenes Herz/eigene Sterne bleiben).
   - Ändert ein noch nicht aktualisiertes v6-Gerät später die alten Werte, wird nur die Änderung an Lili weitergegeben.
   - Die alten Schlüssel werden nie verändert oder gelöscht. */
const ALT_P = 'lili';
function altNachLili(bIn) {
  const fav = Store.get('favoriten', {}) || {}, notiz = Store.get('notizen', {}) || {};
  const b = Object.assign({}, bIn || {}); let geaendert = false;
  const rids = new Set([...Object.keys(fav), ...Object.keys(notiz), ...Object.keys(b).filter(k => k.endsWith('|_v6')).map(k => k.slice(0, -4))]);
  for (const rid of rids) {
    const f = !!fav[rid], st = (notiz[rid] && +notiz[rid].sterne) || 0, mk = rid + '|_v6', m = b[mk];
    if (m && m.f === f && (m.s || 0) === st) continue;   // schon übernommen, unverändert
    if (!m && !f && !st) continue;                      // nichts zu übernehmen
    const k = rid + '|' + ALT_P, x = Object.assign({}, b[k]);
    if (!m) { if (x.l === undefined && f) x.l = true; if (!x.s && st) x.s = st; }
    else { if (m.f !== f) x.l = f; if ((m.s || 0) !== st) x.s = st; }
    if (!x.l && !x.s) delete b[k]; else b[k] = x;
    b[mk] = { f, s: st }; geaendert = true;
  }
  return { b, geaendert };
}
const bew = () => altNachLili(Store.get('bewertungen', {}) || {}).b;
function bewertungVon(rid) {
  const b = bew(), l = [];
  for (const [p, name] of PERSONEN) { const x = b[rid + '|' + p]; if (x && (x.l || x.s)) l.push({ p, name, like: !!x.l, sterne: x.s || 0 }); }
  return { personen: l };
}
const meine = rid => { const p = ich(); return (p && bew()[rid + '|' + p]) || {}; };
const istFav = rid => { const b = bewertungVon(rid); return b.personen.some(x => x.like); };
function sterneSchnitt(rid) {
  const b = bewertungVon(rid), s = b.personen.filter(x => x.sterne).map(x => x.sterne);
  if (s.length) return s.reduce((a, c) => a + c, 0) / s.length;
  return 0;
}
let personDanach = null;
function personWaehlen(danach, grund) {
  personDanach = danach || null;
  openSheet(`<h3>Wer benutzt dieses Gerät?</h3><p>${esc(grund || 'Likes und Sterne werden dann mit diesem Namen gespeichert, und man sieht, wer was mag.')}</p>
    <div class="personwahl">${PERSONEN.map(([p, n]) => `<button class="btn ${ich() === p ? '' : 'sec'}" data-person="${p}">${ico('user')}${n}</button>`).join('')}</div>
    <p class="klein">Ändern geht jederzeit unter Einstellungen.</p>`);
}
function mitPerson(fn) { if (ich()) return fn(); personWaehlen(fn, 'Damit man sieht, wer ein Rezept mag, zuerst einmal wählen, wem dieses Gerät gehört.'); }
function toggleFav(rid) { mitPerson(() => Store.update('bewertungen', {}, b0 => { const b = altNachLili(b0).b, k = rid + '|' + ich(), x = Object.assign({}, b[k]); x.l = !x.l; if (!x.l && !x.s) delete b[k]; else b[k] = x; return b; })); }
function setzeSterne(rid, n) { mitPerson(() => Store.update('bewertungen', {}, b0 => { const b = altNachLili(b0).b, k = rid + '|' + ich(), x = Object.assign({}, b[k]); x.s = x.s === n ? 0 : n; if (!x.l && !x.s) delete b[k]; else b[k] = x; return b; })); }

/* ---------- Gruppen für Abwechslung und Schnellfilter ---------- */
const FLEISCH = 'fleisch rind rindfleisch rinds plätzli steak hack hackfleisch poulet huhn hähnchen geflügel truthahn schwein speck schinken wurst salami lamm kalb ente';
const FISCH = 'fisch lachs thon forelle crevetten garnelen dorsch kabeljau zander egli meeresfrüchte muscheln tintenfisch';
function gruppeVon(r) {
  const k = (r.kategorien || []).map(norm);
  if (k.includes('vegan') || k.includes('vegetarisch')) return 'Vegetarisch';
  const h = norm(r.hauptzutat);
  if (FLEISCH.split(' ').some(w => h.includes(norm(w)))) return 'Fleisch';
  if (FISCH.split(' ').some(w => h.includes(norm(w)))) return 'Fisch';
  return 'Vegetarisch';
}

/* ---------- Zuletzt gekocht ---------- */
const zuletztVon = rid => { const z = Store.get('zuletzt', []).find(x => x.rid === rid); return z ? z.ts : null; };

/* ---------- Wochenplan (v7: nach Datum, 2 Wochen; Schlüssel «tagesplan») ----------
   tagesplan = { 'JJJJ-MM-TT': { rid | text, portionen, gekocht: Zeit, vorher: Zeit|null, quelle }, _import: { mo: 'rid|portionen', … } }
   Der alte Plan «plan» (nach Wochentag, v3–v6) wird in die aktuelle Woche übernommen (siehe wartung). */
const tpRoh = () => Store.get('tagesplan', {}) || {};
const gewohnheiten = () => Store.get('gewohnheiten', {}) || {};
function altPlan() { const p = Store.get('plan', {}) || {}; return TAGE.map(([k], i) => [k, i, p[k]]).filter(x => x[2] && x[2].rid); }
function freiAb(tp, ab, bis) { for (let d = ab; d <= bis; d = plusTage(d, 1)) { const k = isoDatum(d); if (!tp[k]) return k; } return null; }
function importPlan(tpIn, alt) {   // rein rechnend, ohne Speichern; gleiche Eingabe -> gleiches Ergebnis (auf allen Geräten)
  const tp = JSON.parse(JSON.stringify(tpIn || {})), imp = Object.assign({}, tp._import), importiert = [];
  const woche = wocheTage(0), ende = wocheTage(1)[6].d;
  const hatRid = rid => [...woche, ...wocheTage(1)].some(t => tp[t.key] && tp[t.key].rid === rid);
  let geaendert = false;
  for (const [k, i, e] of alt) {
    const sig = e.rid + '|' + (e.portionen || '');
    if (imp[k] === sig && hatRid(e.rid)) { importiert.push(k); continue; }   // schon übernommen
    let ziel = woche[i].key;
    if (tp[ziel] && tp[ziel].rid !== e.rid) ziel = freiAb(tp, woche[i].d, ende);
    if (!ziel) continue;   // kein freier Tag: bleibt im alten Plan stehen, nichts geht verloren
    if (!tp[ziel]) tp[ziel] = { rid: e.rid, portionen: e.portionen || null, quelle: 'v6' };
    imp[k] = sig; importiert.push(k); geaendert = true;
  }
  if (geaendert) tp._import = imp;
  return { tp, importiert, geaendert };
}
function tagesplan() { const alt = altPlan(); return alt.length ? importPlan(tpRoh(), alt).tp : tpRoh(); }   // zeigt alte Einträge schon vor der Wartung
const eintragAm = (tp, k) => { const e = tp[k]; return e && ((e.rid && R[e.rid]) || (!e.rid && e.text)) ? e : null; };
function planAendern(fn) { const tp = tagesplan(); const r = fn(tp); Store.set('tagesplan', r === undefined ? tp : r); }
const planTitel = e => e.rid ? R[e.rid].titel : e.text;

/* Wartung beim Öffnen: 1. alten Wochentags-Plan übernehmen (v6 -> v7), 2. Tage vor dem aktuellen Montag entfernen.
   Idempotent und sync-sicher: läuft erst, wenn der Serverstand von «plan» und «tagesplan» bekannt ist;
   der alte Plan wird erst geleert, wenn die Übernahme sicher beim Server ist; «zuletzt gekocht» bleibt. */
let wartungLaeuft = false;
const syncAktiv = () => !!(syncCfg() && syncEinst().code);
const keyStand = k => SYNC.mod && SYNC.mod.keyZustand(k);
const bereit = keys => !syncAktiv() || keys.every(k => ['server', 'fehler'].includes(keyStand(k)));   // Serverstand bekannt (oder Regeln alt)
function wartungMoeglich() {
  if (!syncAktiv()) return { ja: true, loeschen: true };
  return { ja: bereit(['plan', 'tagesplan']), loeschen: keyStand('plan') === 'server' && keyStand('tagesplan') === 'server' };
}
/* Vergangene, nicht abgehakte Rezept-Tage zählen als gekocht (Entscheid Tino, v7).
   Zeitpunkt = jener Tag 19:00 (nicht «jetzt»): zwei Geräte rechnen dasselbe, nichts wird doppelt; Freitext ohne Rezept bleibt unberührt. */
const abendVon = k => { const d = ausIso(k); d.setHours(19, 0, 0, 0); return d.getTime(); };
function autoGekocht(tp) {
  const h = isoDatum(heute()), neu = [];
  for (const k of Object.keys(tp).sort()) {
    const e = tp[k];
    if (!istDatum(k) || k >= h || !e || !e.rid || !R[e.rid] || e.gekocht) continue;
    tp[k] = Object.assign({}, e, { gekocht: abendVon(k), vorher: zuletztVon(e.rid), auto: true }); neu.push([e.rid, abendVon(k)]);
  }
  if (neu.length) Store.update('zuletzt', [], l => { let r = [...l];
    for (const [rid, ts] of neu) { const x = r.find(z => z.rid === rid); if (x && x.ts >= ts) continue; r = [{ rid, ts }, ...r.filter(z => z.rid !== rid)]; }
    return r.sort((a, b) => b.ts - a.ts).slice(0, 12); });
  return neu.length > 0;
}
function wartung() {
  if (!DATA || wartungLaeuft) return;
  const m = wartungMoeglich(); if (!m.ja) return;
  wartungLaeuft = true;
  try {
    if (bereit(['bewertungen', 'favoriten', 'notizen'])) { const r = altNachLili(Store.get('bewertungen', {}) || {}); if (r.geaendert) Store.set('bewertungen', r.b); }
    let tp = tpRoh(), geaendert = false, importiert = [];
    const alt = altPlan();
    if (alt.length) { const r = importPlan(tp, alt); tp = r.tp; importiert = r.importiert; geaendert = r.geaendert; }
    if (m.loeschen && importiert.length && tp._import) { importiert.forEach(k => delete tp._import[k]); geaendert = true; }
    if (tp._import && !Object.keys(tp._import).length) { delete tp._import; geaendert = true; }
    if (bereit(['zuletzt']) && autoGekocht(tp)) geaendert = true;   // zuerst abhaken, dann aufräumen
    const grenze = isoDatum(montagVon(heute()));
    for (const k of Object.keys(tp)) if (istDatum(k) && k < grenze) { delete tp[k]; geaendert = true; }
    if (geaendert) Store.set('tagesplan', tp);
    if (m.loeschen && importiert.length) Store.update('plan', {}, p => { importiert.forEach(k => delete p[k]); return p; });
    if (einst().migration !== 7) einstSetzen({ migration: 7 });
  } finally { wartungLaeuft = false; }
}

function dieseWoche(rid) {
  const r = R[rid], tp = tagesplan(), ziel = freiAb(tp, heute(), wocheTage(0)[6].d);
  if (!ziel) return tagWahl(rid, null, 'Diese Woche ist voll – welcher Tag?');
  planAendern(p => { p[ziel] = { rid, portionen: getScale(r) }; });
  toast(`Für ${tagLang(ziel)} eingeplant.`, { label: 'Tag ändern', fn: () => tagWahl(rid, ziel) });
}
function tagWahl(rid, von, titel) {
  const tp = tagesplan(), h = isoDatum(heute());
  const knopf = t => {
    const e = eintragAm(tp, t.key), belegt = e && t.key !== von, alt = t.key < h;
    return `<button class="btn tagbtn ${t.key === von ? 'aktiv' : ''}" data-tagwahl="${t.key}" data-rid="${rid || ''}" data-von="${von || ''}" ${alt ? 'disabled' : ''}><strong>${t.name} <span class="datum">${datumKurzD(t.d)}</span></strong>${belegt ? `<small>${von ? 'tauschen mit: ' : 'ersetzt: '}${esc(planTitel(e))}</small>` : t.key === von ? '<small>aktuell</small>' : `<small>${alt ? 'vorbei' : 'frei'}</small>`}</button>`;
  };
  openSheet(`<h3>${esc(titel || 'An welchem Tag?')}</h3>${[0, 1].map(o => `<h4 class="sheet-h">${o ? 'Nächste Woche' : 'Diese Woche'}</h4><div class="taggrid">${wocheTage(o).map(knopf).join('')}</div>`).join('')}`);
}
function setzeTag(rid, von, nach) {
  planAendern(p => {
    if (von) { const a = p[von], b = p[nach]; p[nach] = a; if (b) p[von] = b; else delete p[von]; }
    else p[nach] = { rid, portionen: getScale(R[rid]) };
  });
  closeSheet(); toast(`Jetzt am ${tagLang(nach)}.`);
}
/* Gekocht: setzt «zuletzt gekocht», hakt den Plan-Eintrag ab (Zutaten verschwinden aus der Einkaufsliste) */
function gekochtMarkieren(rid, datum) {
  const ts = Date.now(), tp = tagesplan();
  if (!datum) {   // passender Eintrag: heute, sonst nächstliegender offener Tag dieser Woche
    const h = isoDatum(heute()), kand = wocheTage(0).map(t => t.key).filter(k => tp[k] && tp[k].rid === rid && !tp[k].gekocht);
    datum = kand.includes(h) ? h : kand.sort((a, b) => Math.abs(ausIso(a) - ausIso(h)) - Math.abs(ausIso(b) - ausIso(h)))[0] || null;
  }
  const vorher = rid ? zuletztVon(rid) : null;
  if (rid) Store.update('zuletzt', [], l => [{ rid, ts }, ...l.filter(x => x.rid !== rid)].slice(0, 12));
  if (datum) planAendern(p => { if (p[datum]) { p[datum].gekocht = ts; p[datum].vorher = vorher; } });
  toast(datum ? (rid ? 'Als gekocht abgehakt – die Zutaten sind von der Einkaufsliste weg.' : 'Als gekocht abgehakt.') : 'Als «zuletzt gekocht» gespeichert.');
}
function gekochtZurueck(datum) {
  const tp = tagesplan(), e = tp[datum]; if (!e || !e.gekocht) return;
  if (e.rid && zuletztVon(e.rid) === e.gekocht) Store.update('zuletzt', [], l => { const r = l.filter(x => x.rid !== e.rid); if (e.vorher) r.push({ rid: e.rid, ts: e.vorher }); return r.sort((a, b) => b.ts - a.ts); });
  planAendern(p => { delete p[datum].gekocht; delete p[datum].vorher; });
}

/* Vorschläge: Favoriten, lange nicht gekocht, Saison */
function vorschlaege(ausser) {
  const s = saisonName(saisonId(new Date())), jetzt = Date.now(), aus = new Set(ausser || []);
  return DATA.rezepte.filter(r => !aus.has(r.id)).map(r => {
    const g = [], z = zuletztVon(r.id);
    let p = 0;
    if (istFav(r.id)) { g.push('Favorit'); p += 3; }
    if (!z) { g.push('Noch nie gekocht'); p += 2.5; } else if (jetzt - z > 14 * 864e5) { g.push('Lange nicht gekocht'); p += Math.min(3, (jetzt - z) / (7 * 864e5) / 2); }
    if ((r.saison || []).includes(s)) { g.push('Saison'); p += 2; }
    return { r, g, p: p + sterneSchnitt(r.id) / 5 };
  }).filter(x => x.g.length).sort((a, b) => b.p - a.p || a.r.titel.localeCompare(b.r.titel, 'de'));
}
/* Abwechslung: Hinweise pro Woche */
function abwechslung(tage, extraRid) {
  const tp = tagesplan(), rs = tage.map(t => eintragAm(tp, t.key)).filter(e => e && e.rid).map(e => R[e.rid]);
  if (extraRid) rs.push(R[extraRid]);
  const zaehle = f => rs.reduce((m, r) => { const k = f(r); if (k) m[k] = (m[k] || 0) + 1; return m; }, {});
  const h = [], gedeckt = new Set();   // kurz halten: pro Thema nur ein Hinweis
  for (const [g, n] of Object.entries(zaehle(gruppeVon))) if (g !== 'Vegetarisch' && n >= 3) { h.push(`${n}× ${g}`); gedeckt.add(g); }
  for (const [z, n] of Object.entries(zaehle(r => r.hauptzutat))) if (n >= 2 && !rs.some(r => r.hauptzutat === z && gedeckt.has(gruppeVon(r)))) { h.push(`${n}× ${z}`); rs.filter(r => r.hauptzutat === z).forEach(r => gedeckt.add('t:' + r.titel)); }
  for (const [t, n] of Object.entries(zaehle(r => r.titel))) if (n >= 2 && !gedeckt.has('t:' + t) && !rs.some(r => r.titel === t && gedeckt.has(gruppeVon(r)))) h.push(`${n}× ${t}`);
  return h;
}
/* Woche füllen: zuerst feste Gewohnheiten, dann Vorschläge mit Abwechslung; nur freie Tage ab heute */
function wocheFuellen(off) {
  const tage = wocheTage(off), h = isoDatum(heute()), tp = tagesplan(), gw = gewohnheiten();
  const frei = tage.filter(t => t.key >= h && !eintragAm(tp, t.key));
  if (!frei.length) return toast('In dieser Woche ist kein Tag mehr frei.');
  const neu = {}, drin = new Set(tage.map(t => eintragAm(tp, t.key)).filter(e => e && e.rid).map(e => e.rid));
  for (const t of frei) { const g = gw[t.tag]; if (g && g.rid && R[g.rid]) { neu[t.key] = { rid: g.rid, portionen: defaultScale(R[g.rid]), quelle: 'gewohnheit' }; drin.add(g.rid); } else if (g && g.text) neu[t.key] = { text: g.text, quelle: 'gewohnheit' }; }
  const zaehl = () => { const c = {}; [...drin].forEach(rid => { const g = gruppeVon(R[rid]); c[g] = (c[g] || 0) + 1; c['z:' + R[rid].hauptzutat] = (c['z:' + R[rid].hauptzutat] || 0) + 1; }); return c; };
  for (const t of frei) {
    if (neu[t.key]) continue;
    const c = zaehl();
    const kand = DATA.rezepte.filter(r => !drin.has(r.id)).map(r => {
      const v = vorschlaege().find(x => x.r.id === r.id), g = gruppeVon(r);
      let p = v ? v.p : 0;
      if (g !== 'Vegetarisch' && (c[g] || 0) >= 2) p -= 4;
      if ((c['z:' + r.hauptzutat] || 0) >= 1) p -= 2;
      return { r, p };
    }).sort((a, b) => b.p - a.p || a.r.titel.localeCompare(b.r.titel, 'de'));
    if (!kand.length) break;
    neu[t.key] = { rid: kand[0].r.id, portionen: defaultScale(kand[0].r), quelle: 'auto' }; drin.add(kand[0].r.id);
  }
  const n = Object.keys(neu).length;
  if (!n) return toast('Keine passenden Rezepte mehr frei für diese Woche.');
  planAendern(p => { Object.assign(p, neu); });
  toast(`${n} ${n === 1 ? 'Tag' : 'Tage'} gefüllt.`, { label: 'Rückgängig', fn: () => planAendern(p => { for (const [k, v] of Object.entries(neu)) if (p[k] && !p[k].gekocht && p[k].rid === v.rid && p[k].text === v.text && p[k].quelle === v.quelle) delete p[k]; }) });
}

/* ---------- Einkaufsliste (automatisch aus dem Wochenplan, ohne gekochte Rezepte) ---------- */
function planEintraegeFuerEinkauf() {   // immer diese und nächste Woche (Entscheid Tino, v7)
  const tp = tagesplan(), tage = [...wocheTage(0), ...wocheTage(1)];
  return tage.map(t => eintragAm(tp, t.key)).filter(e => e && e.rid && !e.gekocht);
}
function planZutaten() {
  const map = new Map();
  for (const e of planEintraegeFuerEinkauf()) {
    const r = R[e.rid], f = factorOf(r, e.portionen || defaultScale(r));
    for (const z of r.zutaten) {
      if (z.einkaufen === false) continue;   // z.B. Wasser
      const key = 'z:' + (z.je ? 'je|' : '') + z.name.trim().toLowerCase();
      if (!map.has(key)) { const abt = abteilungVon(z.name, z.abteilung); map.set(key, { key, name: z.name, je: !!z.je, mengen: {}, alts: {}, notizen: [], rezepte: [], abt, icon: iconVon(z.name, abt) }); }
      const it = map.get(key);
      const add = (m, ei) => { const u = ei || ''; it.mengen[u] = roundUnit((it.mengen[u] || 0) + m * f, u); };
      if (z.menge != null) add(z.menge, z.einheit);
      if (z.plus) add(z.plus.menge, z.plus.einheit);
      if (z.zusatz) add(z.zusatz.menge, z.zusatz.einheit);
      if (z.oder && z.oder.length) { const o = 'oder ' + z.oder.map(x => `${qty(x, f)} ${x.name}`).join(' oder '); if (!it.notizen.includes(o)) it.notizen.push(o); }
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

/* ---------- Migration von v1/v2 (in den Wochentags-Plan «plan»; v7 übernimmt ihn danach in «tagesplan») ---------- */
function heuteIdx() { return (new Date().getDay() + 6) % 7; }
function naechsterFreierTag(p) { for (let i = 0; i < 7; i++) { const k = TAGE[(heuteIdx() + i) % 7][0]; if (!p[k]) return k; } return null; }
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
const timers = () => { const l = Store.get('timer', []); return Array.isArray(l) ? l : []; };
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
  const name = mitName && R[t.rid] ? `${esc(t.label)} <i class="sn">· Schritt ${t.si + 1}</i>` : esc(t.label);
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


/* ---------- Synchronisation (Firebase, optional) ---------- */
const B32 = '0123456789abcdefghjkmnpqrstvwxyz';
const zufall = n => { const b = new Uint8Array(n); crypto.getRandomValues(b); return [...b].map(x => B32[x & 31]).join(''); };   // 5 Bit pro Zeichen
const neuerCode = () => zufall(28);                                   // 28 × 5 = 140 Bit
function codeNorm(t) { const c = String(t || '').toLowerCase().replace(/[^0-9a-z]/g, '').replace(/[il]/g, '1').replace(/o/g, '0').replace(/u/g, 'v'); return /^[0-9a-hjkmnp-tv-z]{28}$/.test(c) ? c : null; }
const codeAnzeige = c => c.toUpperCase().match(/.{1,4}/g).join('-');
const syncCfg = () => (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.projectId) ? window.FIREBASE_CONFIG : null;
const syncEinst = () => Store.get('sync', {});
const SYNC = { mod: null, handle: null, status: null, laeuft: false };
function syncStatus() {
  if (!syncCfg()) return { zustand: 'aus', text: 'Nur auf diesem Gerät – Synchronisation ist noch nicht eingeschaltet' };
  if (!syncEinst().code) return { zustand: 'aus', text: 'Nur auf diesem Gerät – noch kein Haushalts-Code' };
  return SYNC.status || { zustand: 'verbinde', text: 'Verbinde …' };
}
async function syncStarten() {
  const s = syncEinst();
  if (!syncCfg() || !s.code || SYNC.laeuft) return;
  SYNC.laeuft = true;
  try {
    if (!SYNC.mod) { SYNC.mod = await import('./sync.js'); SYNC.mod.aufStatus(st => { SYNC.status = st; if (route.v === 'einstellungen') render(true); }); SYNC.mod.aufKeyZustand(k => { wartung(); if (k === 'vorrat' && route.v === 'vorrat') render(true); }); }
    SYNC.handle = await SYNC.mod.starten(syncCfg(), s.code, s.geraet);
  } catch (e) {
    console.warn('Synchronisation', e); SYNC.laeuft = false;
    SYNC.status = { zustand: 'fehler', text: 'Verbindung fehlgeschlagen: ' + (e.code || e.message) };
    if (route.v === 'einstellungen') render(true);
  }
}
function syncStoppen() { if (SYNC.handle) SYNC.handle.stoppen(); SYNC.handle = null; SYNC.laeuft = false; SYNC.status = null; }
function codeSetzen(code) {
  syncStoppen();
  Store.set('sync', { code, geraet: syncEinst().geraet || zufall(12) });
  syncStarten(); render(true);
}
const haushaltLink = c => location.origin + location.pathname + '#haushalt=' + codeAnzeige(c);
function linkPruefen() {
  const m = location.hash.match(/^#haushalt=([0-9A-Za-z-]+)/);
  if (!m) return false;
  const code = codeNorm(m[1]);
  history.replaceState(null, '', location.pathname + '#/einstellungen');
  if (!code) { toast('Der Haushalts-Link ist ungültig.'); return true; }
  if (syncEinst().code === code) { toast('Dieses Gerät ist schon mit dem Haushalt verbunden.'); return true; }
  openSheet(`<h3>Haushalt beitreten?</h3><p>Dieses Gerät mit dem Haushalt <strong class="code">${codeAnzeige(code)}</strong> verbinden. Wochenplan, Einkaufsliste, Notizen, Sterne, Likes, Gewohnheiten und «Zuletzt gekocht» werden dann geteilt; was schon auf diesem Gerät ist, wird dazugenommen.</p>
    <button class="btn wide" data-beitreten="${code}">${ico('sync')}Beitreten</button>`);
  return true;
}
function qrZeigen() {
  const c = syncEinst().code; if (!c) return;
  const zeigen = () => { const q = qrcode(0, 'M'); q.addData(haushaltLink(c)); q.make();
    openSheet(`<h3>Haushalts-Code teilen</h3><div class="qr">${q.createSvgTag({ cellSize: 6, margin: 4, scalable: true })}</div><p>Mit der Kamera des anderen Geräts scannen und den Link öffnen. Den Code nur im eigenen Haushalt weitergeben.</p>`); };
  if (window.qrcode) return zeigen();
  const sc = document.createElement('script'); sc.src = 'vendor/qrcode/qrcode.js'; sc.onload = zeigen; sc.onerror = () => toast('QR-Code konnte nicht geladen werden.'); document.head.appendChild(sc);
}

/* ---------- Ansichten ---------- */
const sterneHTML = n => { const g = Math.round(n || 0); return g ? `<span class="stars-s" aria-label="${String(Math.round(n * 10) / 10).replace('.', ',')} von 5 Sternen">${'★'.repeat(g)}${'☆'.repeat(5 - g)}</span>` : ''; };
const herzBtn = (rid, cls) => { const m = !!meine(rid).l; return `<button class="herz ${m ? 'on' : ''} ${cls || ''}" data-fav="${rid}" aria-label="${m ? 'Gefällt mir nicht mehr' : 'Gefällt mir'}" aria-pressed="${m}">${ico('heart')}</button>`; };
function likesHTML(rid) { const b = bewertungVon(rid), n = b.personen.filter(x => x.like).map(x => x.name); return n.length ? `<span class="likes">${ico('heart')}${esc(n.join(', '))}</span>` : ''; }
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
  return `<article class="karte"><a href="#/rezept/${r.id}" class="karte-link" aria-label="${esc(r.titel)}"></a>
    <div class="karte-bild">${bildHTML(r, '(min-width: 760px) 400px, 100vw', '')}</div>${herzBtn(r.id, 'auf-bild')}
    <div class="karte-text">${r.kueche ? `<div class="eyebrow">${esc(r.kueche)}${r.saison && r.saison.length ? ' · ' + esc(r.saison.join(', ')) : ''}</div>` : ''}
    <h3>${esc(r.titel)}</h3>
    <div class="meta">${r.zeit_total_min ? `<span>${ico('clock')}${minText(r.zeit_total_min)}</span>` : ''}${r.portionen_basis ? `<span>${ico('plate')}${r.portionen_basis} Portionen</span>` : ''}${sterneHTML(sterneSchnitt(r.id))}${likesHTML(r.id)}</div></div></article>`;
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
  app.innerHTML = `<header class="kopf mit-knopf"><div><div class="eyebrow">${DATA.rezepte.length} ${DATA.rezepte.length === 1 ? 'Rezept' : 'Rezepte'}</div><h1 class="titel-gross">Kochbuch</h1></div><button class="icon" data-go="#/einstellungen" aria-label="Einstellungen, Person und Synchronisation">${ico(syncEinst().code && syncCfg() ? 'sync' : 'gear')}</button></header>
   <label class="suche">${ico('search')}<input type="search" id="suche" placeholder="Suchen: Rezept, Zutat, Stichwort" value="${esc(ui.suche)}" autocomplete="off" enterkeyhint="search"></label>
   <div class="filter">
     <div class="fgruppe"><div class="flabel">Merkliste</div><div class="chips"><button class="chip ${ui.filter.fav ? 'on' : ''}" data-filter="fav" data-wert="1" aria-pressed="${!!ui.filter.fav}">${ico('heart')}Favoriten</button></div></div>
     ${filterGruppen().map(([g, label, werte]) => `<div class="fgruppe"><div class="flabel">${label}</div><div class="chips">${werte.map(w => chip(g, w)).join('')}</div></div>`).join('')}
   </div>
   <div id="ergebnis">${listeErgebnis()}</div>`;
}
function naehrHTML(nw) {
  if (!nw) return '';
  const ca = nw.geschaetzt ? 'ca. ' : '';
  const prot = nw.protein_g_min != null && nw.protein_g_max != null ? `${nw.protein_g_min}–${nw.protein_g_max} g` : (nw.protein_g != null ? `${nw.protein_g} g` : '');
  const z = [['Energie', nw.kcal != null ? `${nw.kcal} kcal` : ''], ['Protein', prot], ['Kohlenhydrate', nw.kohlenhydrate_g != null ? `${nw.kohlenhydrate_g} g` : ''], ['Fett', nw.fett_g != null ? `${nw.fett_g} g` : '']].filter(x => x[1]);
  if (!z.length) return '';
  return `<section class="naehr"><h2>Nährwerte pro Portion${nw.geschaetzt ? ' <small>(geschätzt)</small>' : ''}</h2><dl>${z.map(([l, v]) => `<div><dt>${l}</dt><dd>${ca}${esc(v)}</dd></div>`).join('')}</dl>${nw.geschaetzt ? '<p class="hinweis">Richtwerte, aus den Zutatenmengen geschätzt.</p>' : ''}</section>`;
}
function bewertungHTML(rid) {
  const p = ich(), m = meine(rid), b = bewertungVon(rid);
  const zeilen = b.personen.filter(x => x.p !== p);
  return `<div class="meinebew"><div class="wer">${p ? `${ico('user')}<span>Deine Bewertung · <strong>${esc(PNAME[p])}</strong></span>` : `${ico('user')}<span>Wer bewertet? Bitte einmal wählen.</span>`}<button class="btn ghost small" data-personwahl>${p ? 'Wechseln' : 'Wählen'}</button></div>
     <div class="stars" role="radiogroup" aria-label="Deine Bewertung">${[1, 2, 3, 4, 5].map(i => `<button class="${i <= (m.s || 0) ? 'on' : ''}" data-stern="${i}" aria-label="${i} von 5">★</button>`).join('')}<button class="herz inline ${m.l ? 'on' : ''}" data-fav="${rid}" aria-pressed="${!!m.l}" aria-label="${m.l ? 'Gefällt mir nicht mehr' : 'Gefällt mir'}">${ico('heart')}</button></div></div>
   ${zeilen.length ? `<ul class="bewliste">${zeilen.map(x => `<li><span class="bname">${esc(x.name)}</span>${x.like ? `<span class="likes">${ico('heart')}mag es</span>` : ''}${x.sterne ? sterneHTML(x.sterne) : ''}</li>`).join('')}</ul>` : ''}`;
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
     ${naehrHTML(r.naehrwerte)}
    </aside>
    <section class="rechts">
     <h2>Zubereitung</h2>
     <ol class="steps">${r.schritte.map((s, i) => `<li><span class="nr">${i + 1}.</span><div><p>${schrittHTML(s.text)}</p>${stepTimersHTML(r, i)}</div></li>`).join('')}</ol>
     ${tipps.length ? `<h2>Tipps</h2><ul class="tipps">${tipps.map(t => `<li><h4>${esc(t.begriff)}</h4><p>${esc(t.text)}</p></li>`).join('')}</ul>` : ''}
     <h2>Bewertung und Notizen</h2>
     ${bewertungHTML(r.id)}
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
     ${nr < total ? `<button class="btn" data-go="#/kochen/${r.id}/${nr + 1}">Weiter</button>` : `<button class="btn" data-fertig="${r.id}">${ico('check')}Gekocht</button>`}</div>`;
  showWake();
}
function viewPlan() {
  const off = ui.woche || 0, tage = wocheTage(off), tp = tagesplan(), h = isoDatum(heute()), gw = gewohnheiten();
  const anzahl = tage.filter(t => eintragAm(tp, t.key)).length;
  const hinweise = abwechslung(tage);
  const freiAbHeute = tage.filter(t => t.key >= h && !eintragAm(tp, t.key)).length;
  const zeile = t => {
    const e = eintragAm(tp, t.key), r = e && e.rid && R[e.rid], ist = t.key === h, vorbei = t.key < h;
    const tagname = `<div class="tagname"><strong>${t.name}</strong><span class="kurz">${t.kurz}</span><span class="datum">${datumKurzD(t.d)}</span>${ist ? '<small>heute</small>' : ''}</div>`;
    if (!e) {
      const g = gw[t.tag], gText = g ? (g.rid && R[g.rid] ? R[g.rid].titel : g.text) : '';
      return `<li class="${ist ? 'heute' : ''} ${vorbei ? 'vorbei' : ''}">${tagname}<div class="wbild"><div class="foto ph mini leerbild"></div></div><div class="winfo"><span class="frei">Noch frei${gText ? `<small class="gw">${ico('repeat')}${esc(gText)}</small>` : ''}</span><button class="btn ghost small wahlbtn" data-wahl="${t.key}" aria-label="Rezept für ${t.name} wählen">${ico('plus')}<span>Rezept wählen</span></button></div></li>`;
    }
    const titel = r ? `<a class="wtitel" href="#/rezept/${r.id}">${esc(r.titel)}</a>` : `<span class="wtitel">${esc(e.text)}</span>`;
    const bild = r ? `<a class="wbild" href="#/rezept/${r.id}">${bildHTML(r, '160px', 'mini')}</a>` : `<div class="wbild"><div class="foto ph mini">${ico('pot')}</div></div>`;
    const gk = !!e.gekocht;
    const checkBtn = `<button class="icon gkbtn ${gk ? 'on' : ''}" data-gk="${t.key}" aria-pressed="${gk}" aria-label="${gk ? 'Gekocht – zurücknehmen' : 'Als gekocht abhaken'}">${ico('check')}</button>`;
    return `<li class="voll ${ist ? 'heute' : ''} ${vorbei ? 'vorbei' : ''} ${gk ? 'gekocht' : ''}">${tagname}${bild}
      <div class="winfo">${titel}${gk ? `<span class="gkmarke">${ico('check')}gekocht</span>` : ''}
        <div class="wknoepfe">${r ? `<div class="mini"><button class="icon" data-pm="${t.key}|-1" aria-label="Weniger">${ico('minus')}</button><span>${scaleLabel(r, e.portionen || defaultScale(r))}</span><button class="icon" data-pm="${t.key}|1" aria-label="Mehr">${ico('plus')}</button></div>` : ''}
        ${checkBtn}<button class="icon" data-verschieben="${t.key}" aria-label="Verschieben">${ico('move')}</button><button class="icon" data-pdel="${t.key}" aria-label="Entfernen">${ico('trash')}</button></div></div>
      <div class="wkompakt"><span class="portkurz">${r ? esc(r.portionen_basis ? `${num(e.portionen || defaultScale(r))} Port.` : scaleLabel(r, e.portionen || defaultScale(r))) : ''}</span>${checkBtn}<button class="icon" data-eintrag="${t.key}" aria-label="Mehr zu ${esc(planTitel(e))}">${ico('dots')}</button></div></li>`;
  };
  app.innerHTML = `<header class="kopf"><div class="eyebrow">KW ${kwVon(tage[0].d)} · ${wochenSpanne(tage)} · ${anzahl} von 7 Tagen geplant</div><h1 class="titel-gross">Wochenplan</h1></header>
   <div class="wochenleiste"><div class="segment" role="tablist">${['Diese Woche', 'Nächste Woche'].map((l, i) => `<button class="chip ${off === i ? 'on' : ''}" data-woche-off="${i}" role="tab" aria-selected="${off === i}">${l}</button>`).join('')}</div>
     ${freiAbHeute ? `<button class="btn sec" data-fuellen="${off}">${ico('wand')}Woche füllen</button>` : ''}</div>
   ${hinweise.length ? `<p class="abw">${ico('leaf')}<span>${off ? 'Nächste Woche' : 'Diese Woche'} schon ${hinweise.map(esc).join(', ')} – vielleicht etwas anderes dazwischen?</span></p>` : ''}
   <ul class="woche">${tage.map(zeile).join('')}</ul>
   <div class="aktionen">${anzahl ? `<button class="btn sec" data-go="#/einkauf">${ico('cart')}Zur Einkaufsliste</button>` : ''}<button class="btn ghost" data-gewohnheiten>${ico('repeat')}Gewohnheiten</button>${anzahl ? `<button class="btn ghost" data-planclear="${off}">Woche leeren</button>` : ''}</div>
   ${anzahl ? '' : '<p class="leer">Im Rezept auf «Diese Woche kochen» tippen, mit «+» einen Tag wählen oder «Woche füllen» – mit Vorschlägen und euren Gewohnheiten.</p>'}`;
}
function eintragSheet(k) {
  const tp = tagesplan(), e = eintragAm(tp, k); if (!e) return;
  const r = e.rid && R[e.rid];
  openSheet(`<h3>${esc(planTitel(e))}</h3><p class="klein">${esc(tagLang(k))}${e.gekocht ? ' · gekocht' : ''}</p>
    ${r ? `<div class="stepper"><button class="icon" data-pm="${k}|-1" aria-label="Weniger">${ico('minus')}</button><div class="val">${scaleLabel(r, e.portionen || defaultScale(r))}</div><button class="icon" data-pm="${k}|1" aria-label="Mehr">${ico('plus')}</button></div>` : ''}
    <div class="sheetknoepfe">${r ? `<button class="btn" data-go="#/rezept/${r.id}">${ico('book')}Rezept öffnen</button>` : ''}
      <button class="btn sec" data-gk="${k}">${ico('check')}${e.gekocht ? 'Doch nicht gekocht' : 'Gekocht'}</button>
      <button class="btn sec" data-verschieben="${k}">${ico('move')}Verschieben</button>
      <button class="btn ghost" data-pdel="${k}">${ico('trash')}Entfernen</button></div>`);
}
/* Rezept-Auswahl in 3 Stufen: Vorschläge – Schnellfilter + Suche – Kacheln */
function wahlKachel(r, extra) {
  const s = sterneSchnitt(r.id), b = bewertungVon(r.id), likes = b.personen.filter(x => x.like).map(x => x.name);
  return `<button class="kachel" data-setze="${r.id}"><span class="kbild">${bildHTML(r, '(min-width: 600px) 200px, 45vw', 'mini')}</span>
    <span class="ktext"><strong>${esc(r.titel)}</strong><span class="kmeta">${r.zeit_total_min ? `${ico('clock')}${num(r.zeit_total_min)} Min.` : ''}${s ? ` <span class="stars-s">★ ${String(Math.round(s * 10) / 10).replace('.', ',')}</span>` : ''}${likes.length ? ` <span class="likes">${ico('heart')}${esc(likes.join(', '))}</span>` : ''}</span>${extra || ''}</span></button>`;
}
const WAHLFILTER = [['fav', 'Favoriten', r => istFav(r.id)], ['schnell', 'bis 30 Min.', r => r.zeit_total_min != null && r.zeit_total_min <= 30], ['vegi', 'Vegetarisch', r => gruppeVon(r) === 'Vegetarisch'], ['fleisch', 'Fleisch & Fisch', r => gruppeVon(r) !== 'Vegetarisch'], ['saison', 'Saison', r => (r.saison || []).includes(saisonName(saisonId(new Date())))]];
function wahlErgebnis() {
  const w = ui.wahl, f = WAHLFILTER.find(x => x[0] === w.filter);
  const q = norm(w.suche);
  const liste = DATA.rezepte.filter(r => (!f || f[2](r)) && (!q || q.split(/\s+/).every(t => norm([r.titel, r.untertitel, r.kueche, r.hauptzutat, ...(r.kategorien || []), ...r.zutaten.map(z => z.name)].join(' ')).includes(t))));
  const tage = w.datum ? wocheTage(w.datum >= wocheTage(1)[0].key ? 1 : 0) : null;
  const warn = r => { if (!tage) return ''; const h = abwechslung(tage, r.id).filter(x => !abwechslung(tage).includes(x)); return h.length ? `<span class="kwarn">dann ${esc(h[0])}</span>` : ''; };
  return liste.length ? `<div class="kacheln">${liste.map(r => wahlKachel(r, warn(r))).join('')}</div>` : '<p class="leer">Nichts gefunden.</p>';
}
function wahlSheet(ziel) {   // ziel: { datum } oder { tag } (Gewohnheit)
  ui.wahl = Object.assign({ filter: null, suche: '' }, ziel);
  const titel = ziel.datum ? `Rezept für ${tagLang(ziel.datum)}` : `Gewohnheit am ${TAGNAME[ziel.tag]}`;
  const tp = tagesplan(), drin = ziel.datum ? wocheTage(ziel.datum >= wocheTage(1)[0].key ? 1 : 0).map(t => eintragAm(tp, t.key)).filter(e => e && e.rid).map(e => e.rid) : [];
  const vs = vorschlaege(drin).slice(0, 6);
  openSheet(`<h3>${esc(titel)}</h3>
    ${vs.length ? `<h4 class="sheet-h">${ico('star')}Vorschläge</h4><div class="vorschlaege">${vs.map(v => wahlKachel(v.r, `<span class="grund">${esc(v.g.join(' · '))}</span>`)).join('')}</div>` : ''}
    <h4 class="sheet-h">${ico('search')}Suchen und filtern</h4>
    <div class="chips scroll">${WAHLFILTER.map(([k, l]) => `<button class="chip" data-wfilter="${k}" aria-pressed="false">${l}</button>`).join('')}</div>
    <label class="suche">${ico('search')}<input type="search" id="wahlsuche" placeholder="Rezept oder Zutat" autocomplete="off" enterkeyhint="search"></label>
    <h4 class="sheet-h">${ico('book')}Alle Rezepte</h4><div id="wahlErgebnis">${wahlErgebnis()}</div>
    <form class="add frei-eintrag" id="freiForm"><input type="text" id="freiTxt" placeholder="${ziel.datum ? 'Eigener Eintrag, z.B. Pizza, Reste' : 'Freier Text, z.B. Pizza'}" autocomplete="off" enterkeyhint="done"><button class="btn" aria-label="Übernehmen">${ico('check')}</button></form>
    ${ziel.tag && gewohnheiten()[ziel.tag] ? `<button class="btn ghost wide" data-gwweg="${ziel.tag}">${ico('trash')}Keine Gewohnheit am ${TAGNAME[ziel.tag]}</button>` : ''}`);
}
function gewohnheitenSheet() {
  const gw = gewohnheiten();
  openSheet(`<h3>Gewohnheiten</h3><p>Feste Tage, z.B. Freitag = Pizza. «Woche füllen» setzt sie zuerst ein; freie Tage zeigen sie als Hinweis.</p>
    <ul class="gwliste">${TAGE.map(([k, n]) => { const g = gw[k], t = g ? (g.rid && R[g.rid] ? R[g.rid].titel : g.text) : ''; return `<li><strong>${n}</strong><span class="${t ? '' : 'frei'}">${t ? esc(t) : 'keine'}</span><button class="icon" data-gwtag="${k}" aria-label="${n} ändern">${ico(t ? 'move' : 'plus')}</button></li>`; }).join('')}</ul>`);
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
  const ausPlan = planEintraegeFuerEinkauf().length;
  app.innerHTML = `<header class="kopf"><div class="eyebrow">${ausPlan ? `Diese und nächste Woche · ${ausPlan} ${ausPlan === 1 ? 'Rezept' : 'Rezepte'}` : 'Keine offenen Rezepte im Wochenplan'}</div><h1 class="titel-gross">Einkaufsliste</h1></header>
   <div class="schnell">${SCHNELL.map(([n, i]) => { const a = anz(n); return `<button class="sbtn" data-schnell="${n}" data-icon="${i}">${ico(i)}<span>${n}</span>${a ? `<b class="zahl">${a}</b>` : ''}</button>`; }).join('')}</div>
   <form class="add" id="addForm"><input type="text" id="addTxt" placeholder="Weiteres, z.B. Zahnpasta" enterkeyhint="done" autocomplete="off"><button class="btn" aria-label="Hinzufügen">${ico('plus')}</button></form>
   ${!list.length ? `<p class="leer">Die Liste füllt sich automatisch mit den Zutaten der Rezepte im Wochenplan. Gekochte Rezepte fallen weg.</p>` : ''}
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
function viewEinstellungen() {
  const s = syncEinst(), st = syncStatus(), cfg = syncCfg(), e = einst(), auto = saisonId(new Date());
  app.innerHTML = `<div class="top"><button class="icon" data-go="#/" aria-label="Zurück">${ico('back')}</button></div>
   <header class="kopf"><div class="eyebrow">Einstellungen</div><h1 class="titel-gross">Einstellungen</h1></header>
   <div class="einst"><h2>Dieses Gerät</h2>
   <p class="erkl">Wem gehört dieses Gerät? Likes und Sterne werden mit diesem Namen gespeichert.</p>
   <div class="chips">${PERSONEN.map(([p, n]) => `<button class="chip ${ich() === p ? 'on' : ''}" data-person="${p}" aria-pressed="${ich() === p}">${ico('user')}${n}</button>`).join('')}</div>
   <h2>Farbe</h2>
   <p class="erkl">Die Akzentfarbe wechselt automatisch mit der Jahreszeit (jetzt: ${saisonName(auto)}).</p>
   <div class="chips">${[['auto', 'Automatisch'], ...SAISONS.map(x => [x[0], x[1] + ' · ' + x[2]])].map(([k, l]) => `<button class="chip ${(e.farbe || 'auto') === k ? 'on' : ''}" data-farbe="${k}" aria-pressed="${(e.farbe || 'auto') === k}">${k === 'auto' ? '' : `<i class="farbpunkt" data-s="${k}"></i>`}${l}</button>`).join('')}</div>
   <h2>Synchronisieren</h2>
   <p class="status ${st.zustand}"><span class="punkt"></span>${esc(st.text)}</p>
   <p class="erkl">Mit einem gemeinsamen Haushalts-Code sehen alle Geräte im Haushalt denselben Wochenplan, dieselbe Einkaufsliste, den Vorrat, Notizen, Sterne, Likes, Gewohnheiten und «Zuletzt gekocht» – live. Stoppuhren und diese Einstellungen bleiben auf jedem Gerät für sich.</p>
   ${!cfg ? `<p class="hinweis-box">${ico('key')}<span>Die Synchronisation ist noch nicht eingeschaltet (Firebase-Konfiguration fehlt). Einen Code kann man trotzdem schon erstellen oder eingeben; verbunden wird, sobald die Konfiguration eingetragen ist.</span></p>` : ''}
   <h3 class="h3klein">Haushalts-Code</h3>
   ${s.code ? `<p class="code gross">${codeAnzeige(s.code)}</p>
     <div class="aktionen"><button class="btn sec" data-qr>${ico('qr')}QR-Code anzeigen</button><button class="btn sec" data-linkkopie>${ico('link')}Link kopieren</button></div>
     <div class="aktionen"><button class="btn ghost" data-trennen>Dieses Gerät trennen</button></div>
     <p class="klein">Der Code ist wie ein Schlüssel: Wer ihn kennt, sieht die geteilten Daten. Er ist nur auf diesem Gerät gespeichert.</p>`
   : `<div class="aktionen"><button class="btn" data-neucode>${ico('key')}Neuen Haushalts-Code erstellen</button></div>
     <form class="add" id="codeForm"><input type="text" id="codeTxt" placeholder="Haushalts-Code eingeben" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn" aria-label="Verbinden">${ico('check')}</button></form>
     <p class="klein">Auf dem ersten Gerät einen Code erstellen, auf den weiteren Geräten den QR-Code scannen oder den Code eingeben. Daten, die schon auf einem Gerät sind, werden beim ersten Verbinden dazugenommen.</p>`}</div>`;
}
function viewFehlt() { app.innerHTML = `<p class="leer">Dieses Rezept gibt es nicht (mehr).<br><br><button class="btn" data-go="#/">Zur Rezeptliste</button></p>`; }

/* ---------- Navigation / Router ---------- */
const NAV = [['rezepte', 'Rezepte', 'book'], ['plan', 'Wochenplan', 'calendar'], ['einkauf', 'Einkauf', 'cart'], ['vorrat', 'Vorrat', 'fridge'], ['wissen', 'Küchenwissen', 'bulb']];
$('#nav').innerHTML = NAV.map(([v, l, i]) => `<button data-v="${v}" aria-label="${l}">${ico(i)}<span>${v === 'wissen' ? '<i class="lang">Küchenwissen</i><i class="kurz">Wissen</i>' : l}</span>${v === 'einkauf' ? '<b id="badge" hidden></b>' : ''}</button>`).join('');
function parse() {
  const p = location.hash.replace(/^#\/?/, '').split('/');
  if (p[0] === 'rezept') return { v: 'rezept', id: p[1] };
  if (p[0] === 'kochen') return { v: 'kochen', id: p[1], nr: +p[2] || 1 };
  if (['einkauf', 'plan', 'vorrat', 'wissen', 'einstellungen'].includes(p[0])) return { v: p[0] };
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
  ({ rezepte: viewListe, rezept: () => viewRezept(route.id), kochen: () => viewKochen(route.id, route.nr), einkauf: viewEinkauf, plan: viewPlan, vorrat: viewVorrat, wissen: viewWissen, einstellungen: viewEinstellungen })[route.v]();
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === (route.v === 'rezept' ? 'rezepte' : route.v)));
  renderTimerbar(); badge();
  if (fokus && ['suche', 'wsuche', 'addTxt', 'codeTxt'].includes(fokus) && $('#' + fokus)) { const i = $('#' + fokus); i.focus(); try { i.setSelectionRange(sel, sel); } catch (e) {} }
  if (keepScroll && prev.v === route.v && prev.id === route.id && prev.nr === route.nr) window.scrollTo(0, y); else window.scrollTo(0, 0);
}
let nachKochenOffen = null;   // v9.1: nach «Gekocht» im Kochmodus das Sheet «Vorrat nachführen» zeigen (nur wenn Zutaten im Vorrat)
window.addEventListener('hashchange', () => { if (linkPruefen()) { render(); return; } closeSheet(); $('#toast').hidden = true; render();
  if (nachKochenOffen) { const n = nachKochenOffen; nachKochenOffen = null; if (route.v === 'rezept' && typeof vrNachKochenSheet === 'function') vrNachKochenSheet(n.r, n.f); } });
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) location.hash = b.dataset.v === 'rezepte' ? '#/' : '#/' + b.dataset.v; });
['plan', 'tagesplan', 'gewohnheiten', 'bewertungen', 'vorrat', 'einkauf_eigen', 'einkauf_haken', 'einkauf_weg', 'notizen', 'favoriten', 'zuletzt', 'timer', 'einstellungen'].forEach(k => Store.subscribe(k, () => {
  if (k === 'plan' || k === 'favoriten' || k === 'notizen') wartung();   // v6-Gerät hat etwas geändert -> übernehmen   // ein v6-Gerät hat etwas eingeplant -> übernehmen
  if (k === 'einstellungen') farbeAnwenden();
  if (k === 'notizen' && document.activeElement && document.activeElement.id === 'notiz') return;
  if (!$('#sheet').hidden && sheetNeu(k)) return;
  if (k === 'timer' && route.v !== 'kochen' && route.v !== 'rezept') { renderTimerbar(); tick(); return; }
  render(true); tick();
}));

/* ---------- Eingaben ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-go]'); if (!t) return;
  const d = t.dataset;
  if (d.go) { location.hash = d.go; return; }
  if (d.g) { const g = glossarEintrag(R[route.id], d.g); return g && openSheet(glossarHTML(g)); }
  if (d.start) { const [rid, si, ti] = d.start.split('|'); return startTimer(rid, +si, +ti); }
  if (d.ta) return timerAktion(d.tid, d.ta);
  if (d.fav) { e.preventDefault(); return toggleFav(d.fav); }
  if (d.person) { einstSetzen({ person: d.person, person_gefragt: true }); const f = personDanach; personDanach = null; if (!$('#sheet').hidden && $('.personwahl')) closeSheet(); toast(`Dieses Gerät gehört jetzt ${PNAME[d.person]}.`); if (f) f(); return render(true); }
  if ('personwahl' in d) return personWaehlen();
  if (d.farbe) { einstSetzen({ farbe: d.farbe }); return render(true); }
  if (d.wocheOff) { ui.woche = +d.wocheOff; return render(); }
  if (d.fuellen) return wocheFuellen(+d.fuellen);
  if ('gewohnheiten' in d) return gewohnheitenSheet();
  if (d.gwtag) return wahlSheet({ tag: d.gwtag });
  if (d.gwweg) { Store.update('gewohnheiten', {}, g => { delete g[d.gwweg]; return g; }); return gewohnheitenSheet(); }
  if (d.gk) { const tp = tagesplan(), en = tp[d.gk]; if (!en) return; const war = !$('#sheet').hidden; if (en.gekocht) gekochtZurueck(d.gk); else gekochtMarkieren(en.rid || null, d.gk); if (war) closeSheet(); return; }
  if (d.eintrag) return eintragSheet(d.eintrag);
  if (d.wfilter) { ui.wahl.filter = ui.wahl.filter === d.wfilter ? null : d.wfilter; document.querySelectorAll('[data-wfilter]').forEach(b => { const on = b.dataset.wfilter === ui.wahl.filter; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); $('#wahlErgebnis').innerHTML = wahlErgebnis(); return; }
  if (d.filter) { ui.filter[d.filter] === d.wert ? delete ui.filter[d.filter] : ui.filter[d.filter] = d.wert; return render(true); }
  if ('filterweg' in d) { ui.filter = {}; return render(true); }
  if (d.scale) { const r = R[route.id]; scaleState[r.id] = stepScale(r, getScale(r), +d.scale); return render(true); }
  if (d.woche) return dieseWoche(d.woche);
  if (d.gekocht) return gekochtMarkieren(d.gekocht);
  if (d.fertig) { gekochtMarkieren(d.fertig); const r = R[d.fertig]; nachKochenOffen = r ? { r, f: factorOf(r, getScale(r)) } : null; location.hash = '#/rezept/' + d.fertig; return; }   // v9.1: danach Vorrat nachführen
  if (d.tagwahl) return setzeTag(d.rid || null, d.von || null, d.tagwahl);
  if (d.verschieben) { const en = tagesplan()[d.verschieben]; return en && tagWahl(en.rid || null, d.verschieben, 'Auf welchen Tag verschieben?'); }
  if (d.wahl) return wahlSheet({ datum: d.wahl });
  if (d.setze) {
    const w = ui.wahl || {}, rid = d.setze, datum = w.datum, tag = w.tag;
    if (!rid || !R[rid]) return;
    // Sheet zuerst schliessen, dann speichern – sonst baut sheetNeu/Sync die Kacheln neu und der Tip geht verloren
    if (datum) {
      closeSheet();
      planAendern(p => { p[datum] = { rid, portionen: defaultScale(R[rid]) }; });
      return toast(`${R[rid].titel} am ${tagLang(datum)}.`);
    }
    if (tag) { Store.update('gewohnheiten', {}, g => { g[tag] = { rid }; return g; }); return gewohnheitenSheet(); }
    return;
  }
  if (d.pm) { const [k, dir] = d.pm.split('|'); planAendern(p => { const r = R[p[k].rid]; p[k].portionen = stepScale(r, p[k].portionen || defaultScale(r), +dir); }); if (!$('#sheet').hidden && $('.sheetknoepfe')) eintragSheet(k); return; }
  if (d.pdel) { planAendern(p => { delete p[d.pdel]; }); return closeSheet(); }
  if (d.planclear) { const tage = wocheTage(+d.planclear); if (confirm(`${+d.planclear ? 'Nächste' : 'Diese'} Woche leeren?`)) planAendern(p => { tage.forEach(t => delete p[t.key]); }); return; }
  if (d.zutaten) { const r = R[d.zutaten], f = factorOf(r, getScale(r)); return openSheet(`<h3>Zutaten · ${esc(scaleLabel(r, getScale(r)))}</h3>${zutatenListe(r, f)}`); }
  if (d.stern) return setzeSterne(route.id, +d.stern);
  if (d.check) return Store.update('einkauf_haken', {}, h => { if (h[d.check]) delete h[d.check]; else h[d.check] = true; return h; });
  if (d.edel) return Store.update('einkauf_eigen', [], l => l.filter(x => x.id !== d.edel));
  if (d.schnell) return eigenDazu(d.schnell, d.icon);
  if ('neucode' in d) { codeSetzen(neuerCode()); return toast('Haushalts-Code erstellt.'); }
  if (d.beitreten) { closeSheet(); codeSetzen(d.beitreten); return toast('Mit dem Haushalt verbunden.'); }
  if ('qr' in d) return qrZeigen();
  if ('linkkopie' in d) { const l = haushaltLink(syncEinst().code); if (navigator.share) { navigator.share({ title: 'Kochbuch – Haushalt', url: l }).catch(() => {}); return; } (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(() => toast('Link kopiert.'), () => openSheet(`<h3>Link</h3><p class="code url klein">${esc(l)}</p>`)); return; }
  if ('trennen' in d) { if (!confirm('Dieses Gerät vom Haushalt trennen? Die Daten bleiben auf diesem Gerät, werden aber nicht mehr geteilt.')) return; syncStoppen(); Store.set('sync', { geraet: syncEinst().geraet }); wartung(); return render(true); }
  if ('clear' in d) {
    const list = einkaufsListe().filter(i => i.erledigt), haken = Store.get('einkauf_haken', {}), weg = Store.get('einkauf_weg', {});
    list.forEach(i => { delete haken[i.key]; if (!i.eigen) weg[i.key] = mengenText(i); });
    const ids = list.filter(i => i.eigen).map(i => i.id);
    Store.set('einkauf_weg', weg); Store.set('einkauf_eigen', Store.get('einkauf_eigen', []).filter(x => !ids.includes(x.id))); Store.set('einkauf_haken', haken);
  }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'codeForm') { e.preventDefault(); const c = codeNorm($('#codeTxt').value); if (!c) return toast('Der Code ist nicht vollständig oder enthält Tippfehler.'); codeSetzen(c); return toast('Mit dem Haushalt verbunden.'); }
  if (e.target.id === 'freiForm') {
    e.preventDefault(); const txt = $('#freiTxt').value.trim(), w = ui.wahl || {}, datum = w.datum, tag = w.tag; if (!txt) return;
    if (datum) { closeSheet(); planAendern(p => { p[datum] = { text: txt }; }); return toast(`«${txt}» am ${tagLang(datum)}.`); }
    if (tag) { Store.update('gewohnheiten', {}, g => { g[tag] = { text: txt }; return g; }); return gewohnheitenSheet(); }
    return;
  }
  if (e.target.id !== 'addForm') return; e.preventDefault();
  eigenDazu($('#addTxt').value); const i = $('#addTxt'); if (i) i.value = '';
});
let notizT;
document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'suche') { ui.suche = e.target.value; $('#ergebnis').innerHTML = listeErgebnis(); return; }
  if (id === 'wsuche') { ui.wissen = e.target.value; $('#wergebnis').innerHTML = wissenErgebnis(); return; }
  if (id === 'wahlsuche') { ui.wahl.suche = e.target.value; $('#wahlErgebnis').innerHTML = wahlErgebnis(); return; }
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
    farbeAnwenden();
    wartung();   // ohne Synchronisation sofort, sonst sobald der Serverstand da ist
    if (!linkPruefen()) { closeSheet(); if (!ich() && !einst().person_gefragt) personFragen(); }
    render();
    syncStarten();
  } catch (e) {
    console.warn(e);
    app.innerHTML = '<p class="leer">Die Rezepte konnten nicht geladen werden. Bitte Internetverbindung prüfen und neu öffnen.</p>';
  }
}
function personFragen() { einstSetzen({ person_gefragt: true }); personWaehlen(null); }   // nur einmal fragen; «Schliessen» = später
/* Tageswechsel (z.B. App über Nacht offen): Farbe, Aufräumen, Anzeige */
let letzterTag = isoDatum(heute());
setInterval(() => { const t = isoDatum(heute()); if (t !== letzterTag) { letzterTag = t; farbeAnwenden(); wartung(); if ($('#sheet').hidden) render(true); } }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { const t = isoDatum(heute()); if (t !== letzterTag) { letzterTag = t; farbeAnwenden(); wartung(); render(true); } } });
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
