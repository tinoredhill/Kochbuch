'use strict';
/* Kochbuch v9 – Tab «Vorrat»: Strichcode scannen (Kamera), Frischware, Mengen, «Zum Einkauf».
   Logik in vorrat-kern.js, Daten nur über Store unter dem Schlüssel «vorrat» (synchronisiert wie der Wochenplan).
   Wird VOR app.js geladen; verwendet Hilfen aus app.js (esc, ico, openSheet, toast, ich, render …) erst beim Aufruf.
   Keine KI, keine Rezeptvorschläge, keine automatische Abbuchung. Scannen nur mit Internet. */
const VK = window.VorratKern;
const vrUi = { suche: '', offen: {}, offenAbt: {}, frischOrt: 'auto' };   // nur Anzeige; offenAbt keyed «ort|abt»
const VR_OFF = 'https://world.openfoodfacts.org/api/v2/product/';
const VR_FELDER = 'code,product_name,product_name_de,generic_name,generic_name_de,brands,image_front_small_url,image_small_url,quantity,product_quantity,product_quantity_unit,categories_tags';
const VR_FORMATE = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const vrKam = { stream: null, timer: null, detector: null, laeuft: false, kandidat: null, treffer: 0 };

const vrDaten = () => Store.get('vorrat', {}) || {};
const vrOrtWahl = () => { const o = (Store.get('einstellungen', {}) || {}).vorrat_ort; return VK.ORTNAME[o] ? o : 'kuehlschrank'; };
const vrOrtIcon = o => (VK.ORTE.find(x => x[0] === o) || [])[2] || 'box';
const vrFrischIcon = fid => (VK.FRISCH.find(x => x[0] === fid) || [])[2] || 'carrot';
const vrDatum = ms => { const d = new Date(ms); return `${d.getDate()}.${d.getMonth() + 1}.`; };
const vrMengeText = e => e.menge != null && e.einheit ? `${e.menge >= 1000 && e.menge % 100 === 0 ? String(e.menge / 1000).replace('.', ',') + (e.einheit === 'g' ? ' kg' : ' l') : e.menge + ' ' + e.einheit}` : '';
function vrMhd(e) {
  if (!e.mhd) return '';
  const h = isoDatum(heute()), d = ausIso(e.mhd), t = `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`;
  if (e.mhd < h) return `<span class="vr-mhd ab">MHD ${t} vorbei</span>`;
  if (e.mhd <= isoDatum(plusTage(heute(), 3))) return `<span class="vr-mhd bald">MHD ${t}</span>`;
  return `<span class="vr-mhd">MHD ${t}</span>`;
}
const vrWer = () => (typeof ich === 'function' ? ich() : null);
function vrBild(e, gross) {
  const i = e.frisch ? vrFrischIcon(e.frisch) : (typeof iconVon === 'function' ? iconVon(e.name || '', abteilungVon(e.name || '')) : 'bag');
  if (e.bild) return `<span class="vr-bild${gross ? ' gross' : ''}"><img src="${esc(e.bild)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('ohne');this.remove()">${ico(i)}</span>`;
  return `<span class="vr-bild ohne${gross ? ' gross' : ''}">${ico(i)}</span>`;
}
function vrAufListe(e) {   // steht schon (offen) auf der Einkaufsliste? -> kein zweites Mal
  const n = norm(e.name);
  try { return einkaufsListe().some(i => !i.erledigt && norm(i.name) === n); } catch (x) { return false; }
}
const vrStand = () => (typeof keyStand === 'function' ? keyStand('vorrat') : undefined);

/* ---------- Übersicht ---------- */
function vrZeile(id, e, mitOrt) {
  const w = VK.wenig(e), st = e.stueck || 0;
  const ek = w ? (vrAufListe(e) ? `<span class="vr-ek auf">${ico('check')}Auf der Einkaufsliste</span>` : `<button class="btn small sec vr-ek" data-vr-ek="${esc(id)}">${ico('cart')}Zum Einkauf</button>`) : '';
  const del = st <= 0 ? `<button class="icon vr-delliste" data-vr-del="${esc(id)}" aria-label="${esc(e.name)} löschen">${ico('trash')}</button>` : '';
  const info = [e.marke && esc(e.marke), vrMengeText(e), mitOrt && esc(VK.ORTNAME[e.ort] || ''), vrMhd(e), e.wer && PNAME[e.wer] && `${esc(PNAME[e.wer])}, ${vrDatum(e.zeit)}`].filter(Boolean).join(' · ');
  return `<li class="vr${w ? ' wenig' : ''}" data-id="${esc(id)}"><button class="vr-txt" data-vr-edit="${esc(id)}" aria-label="${esc(e.name)} bearbeiten">${vrBild(e)}<span class="txt"><span class="vr-name">${esc(e.name)}</span>${info ? `<small>${info}</small>` : ''}</span></button>
    <div class="vr-step">${del}<button class="icon" data-vr-pm="${esc(id)}|-1" aria-label="Weniger"${st <= 0 ? ' disabled' : ''}>${ico('minus')}</button><b aria-label="Stück">${st}</b><button class="icon" data-vr-pm="${esc(id)}|1" aria-label="Mehr">${ico('plus')}</button></div>
    ${ek ? `<div class="vr-ekzeile">${ek}</div>` : ''}</li>`;
}
function vrListeHTML() {
  const v = vrDaten(), q = vrUi.suche.trim();
  if (!Object.keys(v).length) return `<p class="leer">Noch nichts im Vorrat.<br>Strichcode scannen oder Obst und Gemüse antippen. Bei wenig Bestand (pro Produkt einstellbar) erscheint «Zum Einkauf».</p>`;
  const gr = VK.gruppiert(v, q), wl = q ? [] : VK.wenigListe(v, '');
  if (q && !gr.some(g => g.eintraege.length)) return '<p class="leer">Nichts gefunden.</p>';
  const wenigHTML = wl.length ? `<section class="abt vr-wenig"><h2>${ico('cart')}Wenig Bestand <span class="vr-zahl">${wl.length}</span></h2><ul class="ek">${wl.map(([id, e]) => vrZeile(id, e, true)).join('')}</ul></section>` : '';
  const abtBlock = (ort, g) => {
    if (!g.gruppen.length) return '<p class="klein vr-leer">Hier ist noch nichts.</p>';
    return g.gruppen.map(ag => {
      const key = ort + '|' + ag.abt, aufA = q ? true : !!vrUi.offenAbt[key];
      const icon = (typeof ABT_ICON !== 'undefined' && ABT_ICON[ag.abt]) || 'bag';
      return `<section class="vr-abt${aufA ? ' auf' : ''}"><h3><button class="vr-kopf vr-abtkopf" data-vr-aufabt="${esc(key)}" aria-expanded="${aufA}">${ico(icon)}<span>${esc(ag.abt)}</span><span class="vr-zahl">${ag.eintraege.length}</span><span class="vr-pfeil">${ico('back')}</span></button></h3>
        ${aufA ? `<ul class="ek">${ag.eintraege.map(([id, e]) => vrZeile(id, e, false)).join('')}</ul>` : ''}</section>`;
    }).join('');
  };
  return wenigHTML + gr.filter(g => !q || g.eintraege.length).map(g => {
    const auf = q ? true : !!vrUi.offen[g.ort], nw = g.eintraege.filter(([, e]) => VK.wenig(e)).length;
    return `<section class="abt vr-ort${auf ? ' auf' : ''}"><h2><button class="vr-kopf" data-vr-auf="${g.ort}" aria-expanded="${auf}">${ico(g.icon)}<span>${esc(g.name)}</span><span class="vr-zahl">${g.eintraege.length}</span>${nw ? `<span class="vr-zahl warn">${nw} wenig</span>` : ''}<span class="vr-pfeil">${ico('back')}</span></button></h2>
      ${auf ? abtBlock(g.ort, g) : ''}</section>`;
  }).join('');
}
function viewVorrat() {
  const v = vrDaten(), n = Object.keys(v).length, nw = VK.wenigListe(v, '').length;
  app.innerHTML = `<header class="kopf"><div class="eyebrow">${n ? `${n} ${n === 1 ? 'Sache' : 'Sachen'}${nw ? ` · ${nw} mit wenig Bestand` : ''}` : 'Kühlschrank, Tiefkühler, Regal, Keller'}</div><h1 class="titel-gross">Vorrat</h1></header>
   ${vrStand() === 'fehler' ? `<p class="hinweis-box">${ico('sync')}<span>Der Vorrat wird noch nicht mit den anderen Geräten geteilt (Firebase-Regeln fehlen noch). Er bleibt so lange sicher auf diesem Gerät.</span></p>` : ''}
   <div class="vr-knoepfe"><button class="btn" data-vr-scan>${ico('barcode')}Scannen</button><button class="btn sec" data-vr-frisch>${ico('apple')}Obst & Gemüse</button><button class="btn ghost" data-vr-hand>${ico('pencil')}Von Hand</button></div>
   <label class="suche">${ico('search')}<input type="search" id="vrSuche" placeholder="Im Vorrat suchen" value="${esc(vrUi.suche)}" autocomplete="off" enterkeyhint="search"></label>
   <div id="vrListe">${vrListeHTML()}</div>`;
}

/* ---------- Ändern ---------- */
function vrAendern(id, fn) {
  Store.update('vorrat', {}, v => { if (!v[id]) return v; const e = Object.assign({}, v[id]); const r = fn(e); v[id] = VK.stempel(r || e, vrWer()); return v; });
}
function vrZumEinkauf(id) {
  const e = vrDaten()[id]; if (!e) return;
  if (vrAufListe(e)) return toast(`«${e.name}» steht schon auf der Einkaufsliste.`);
  Store.update('einkauf_eigen', [], l => { l.push({ id: uid(), name: e.name, anzahl: 1, icon: e.frisch ? vrFrischIcon(e.frisch) : null }); return l; });
  toast(`«${e.name}» ist auf der Einkaufsliste.`, { label: 'Ansehen', fn: () => { location.hash = '#/einkauf'; } });
}

/* ---------- Kamera und Strichcode ---------- */
function vrSkript(src) {
  return new Promise((ok, err) => { if (document.querySelector(`script[src="${src}"]`) && window.BarcodeDetectionAPI) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => err(new Error('laden')); document.head.appendChild(s); });
}
async function vrDetector() {
  if (vrKam.detector) return vrKam.detector;
  if ('BarcodeDetector' in window && !window.VORRAT_NUR_ZXING) {   // z.B. Chrome auf Android: eingebaut
    try { const s = await window.BarcodeDetector.getSupportedFormats(); const f = VR_FORMATE.filter(x => s.includes(x)); if (f.includes('ean_13')) return (vrKam.detector = new window.BarcodeDetector({ formats: f })); } catch (e) {}
  }
  // iPhone/iPad (Safari kennt BarcodeDetector nicht): ZXing als WebAssembly, lokal in vendor/barcode (kein CDN)
  await vrSkript('vendor/barcode/barcode-detector-ponyfill.js');
  const api = window.BarcodeDetectionAPI;
  await api.prepareZXingModule({ overrides: { locateFile: (p, prefix) => p.endsWith('.wasm') ? new URL('vendor/barcode/zxing_reader.wasm', document.baseURI).href : prefix + p }, fireImmediately: true });
  return (vrKam.detector = new api.BarcodeDetector({ formats: VR_FORMATE }));
}
function vrKameraStopp() {
  vrKam.laeuft = false; clearTimeout(vrKam.timer); vrKam.timer = null; vrKam.kandidat = null; vrKam.treffer = 0;
  if (vrKam.stream) { vrKam.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); vrKam.stream = null; }
  const vid = document.getElementById('vrVideo'); if (vid) vid.srcObject = null;
}
const vrStatus = (t, cls) => { const el = document.getElementById('vrStatus'); if (el) { el.textContent = t; el.className = 'vr-status ' + (cls || ''); } };
function vrOrtChips(aktiv, attr, mitAuto) {
  return `<div class="chips vr-orte">${mitAuto ? `<button type="button" class="chip ${aktiv === 'auto' ? 'on' : ''}" ${attr}="auto">Passend</button>` : ''}${VK.ORTE.map(([o, n, i]) => `<button type="button" class="chip ${aktiv === o ? 'on' : ''}" ${attr}="${o}" aria-pressed="${aktiv === o}">${ico(i)}${n}</button>`).join('')}</div>`;
}
function vrNurOnline() {
  openSheet(`<h3>Scannen braucht Internet</h3><p>Die Produktdaten kommen von Open Food Facts. Ohne Internet bitte später scannen.</p><p class="klein">Obst und Gemüse und Einträge von Hand gehen auch ohne Internet.</p>
    <div class="aktionen"><button class="btn sec" data-vr-frisch>${ico('apple')}Obst & Gemüse</button><button class="btn ghost" data-vr-hand>${ico('pencil')}Von Hand</button></div>`);
}
async function vrScanStarten() {
  vrKameraStopp();
  if (!navigator.onLine) return vrNurOnline();
  openSheet(`<h3>Strichcode scannen</h3>
    <div class="vr-kamera"><video id="vrVideo" playsinline muted autoplay></video><div class="vr-rahmen"></div></div>
    <p class="vr-status" id="vrStatus">Kamera wird gestartet …</p>
    <div class="sheet-h">${ico('box')}Neue Produkte kommen in</div>${vrOrtChips(vrOrtWahl(), 'data-vr-ort')}
    <p class="klein">Schon vorhandene Produkte: +1 Stück am bisherigen Ort.</p>
    <form class="add" id="vrCodeForm"><input type="text" id="vrCodeTxt" inputmode="numeric" pattern="[0-9]*" placeholder="Oder Code eintippen" autocomplete="off" enterkeyhint="go"><button class="btn" aria-label="Code übernehmen">${ico('check')}</button></form>`);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return vrStatus(location.protocol === 'https:' || location.hostname === 'localhost' ? 'Dieses Gerät erlaubt hier keine Kamera. Bitte den Code eintippen.' : 'Die Kamera geht nur über https (auf der Kochbuch-Seite). Bitte den Code eintippen.', 'fehler');
  vrKam.laeuft = true;
  let det;
  const detP = vrDetector().then(d => ({ d }), e => ({ e }));   // Erkennung lädt parallel zur Kamera-Freigabe
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    if (!vrKam.laeuft || !document.getElementById('vrVideo')) { s.getTracks().forEach(t => t.stop()); return; }
    vrKam.stream = s; const vid = document.getElementById('vrVideo'); vid.srcObject = s; await vid.play().catch(() => {});
    const r = await detP;
    if (r.e) { console.warn('Scanner', r.e); vrKameraStopp(); return vrStatus('Die Strichcode-Erkennung konnte nicht geladen werden (Internet?). Bitte den Code eintippen.', 'fehler'); }
    det = r.d;
    if (!vrKam.laeuft) return;
  } catch (e) {
    vrKameraStopp(); console.warn('Kamera', e);
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return vrStatus('Kamera nicht erlaubt. iPhone/iPad: beim Hinweis «Erlauben» antippen; sonst Einstellungen › Apps › Safari › Kamera › «Fragen», dann das Kochbuch neu öffnen. Oder den Code eintippen.', 'fehler');
    if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') return vrStatus('Keine Kamera gefunden. Bitte den Code eintippen.', 'fehler');
    if (e.name === 'NotReadableError') return vrStatus('Die Kamera wird gerade von einer anderen App gebraucht. Bitte schliessen und nochmals versuchen.', 'fehler');
    return vrStatus('Kamera konnte nicht gestartet werden. Bitte den Code eintippen.', 'fehler');
  }
  vrStatus('Strichcode ins Feld halten …');
  const schritt = async () => {
    if (!vrKam.laeuft) return;
    const vid = document.getElementById('vrVideo');
    if (!vid) return vrKameraStopp();
    try {
      if (vid.readyState >= 2 && vid.videoWidth) {
        const r = await det.detect(vid);
        const c = (r || []).map(x => String(x.rawValue || '').trim()).find(x => /^(\d{8}|\d{12,13})$/.test(x));
        if (c) {   // zweimal derselbe Code hintereinander -> sicher gelesen
          if (c === vrKam.kandidat) vrKam.treffer++; else { vrKam.kandidat = c; vrKam.treffer = 1; }
          if (vrKam.treffer >= 2 && vrKam.laeuft) { vrKameraStopp(); if (navigator.vibrate) navigator.vibrate(60); return vrCode(c); }
        }
      }
    } catch (e) { console.warn('Erkennung', e); }
    if (vrKam.laeuft) vrKam.timer = setTimeout(schritt, 160);
  };
  schritt();
}
async function vrOffHolen(code) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(VR_OFF + encodeURIComponent(code) + '.json?fields=' + VR_FELDER, { signal: ctl.signal });
    if (r.status === 404) return { gefunden: false };
    if (!r.ok) return { fehler: 'HTTP ' + r.status };
    const p = VK.offAuswerten(await r.json());
    return p ? { gefunden: true, produkt: p } : { gefunden: false };
  } catch (e) { return { fehler: e.name === 'AbortError' ? 'Zeitüberschreitung' : (e.message || 'Netz') }; }
  finally { clearTimeout(t); }
}
async function vrCode(roh) {
  vrKameraStopp();
  const code = VK.codeNorm(roh), id = 'c:' + code;
  if (vrDaten()[id]) {   // gleicher Code -> Menge erhöhen
    Store.update('vorrat', {}, v => VK.scanDazu(v, code, null, vrOrtWahl(), vrWer()).v);
    return vrErgebnis(id, false);
  }
  openSheet(`<h3>Produkt wird gesucht …</h3><p class="vr-code">${ico('barcode')}${esc(code)}</p><p class="klein">Open Food Facts</p>`);
  const r = navigator.onLine ? await vrOffHolen(code) : { fehler: 'offline' };
  if (vrDaten()[id]) { Store.update('vorrat', {}, v => VK.scanDazu(v, code, null, vrOrtWahl(), vrWer()).v); return vrErgebnis(id, false); }   // inzwischen von einem anderen Gerät angelegt
  if (r.gefunden) { Store.update('vorrat', {}, v => VK.scanDazu(v, code, r.produkt, vrOrtWahl(), vrWer()).v); return vrErgebnis(id, true); }
  vrNameSheet(code, r.fehler);
}
function vrNameSheet(code, fehler) {
  openSheet(`<h3>${fehler ? 'Produktdaten nicht erreichbar' : 'Produkt nicht gefunden'}</h3>
    <p>${fehler ? 'Open Food Facts hat nicht geantwortet.' : 'Dieses Produkt kennt Open Food Facts noch nicht.'} Bitte den Namen eintippen – beim nächsten Scan erkennt das Kochbuch es dann.</p>
    <p class="vr-code">${ico('barcode')}${esc(code)}</p>
    <form id="vrNameForm" class="vr-form" data-code="${esc(code)}"><label>Name<input type="text" id="vrNName" required placeholder="z.B. Vollmilch" autocomplete="off" enterkeyhint="next"></label>
    <label>Marke (falls bekannt)<input type="text" id="vrNMarke" autocomplete="off" enterkeyhint="done"></label>
    <div class="sheet-h">${ico('box')}Ort</div>${vrOrtChips(vrOrtWahl(), 'data-vr-ort')}
    <button class="btn wide">${ico('check')}Speichern</button></form>`);
  setTimeout(() => { const i = document.getElementById('vrNName'); if (i) i.focus(); }, 50);
}
function vrErgebnis(id, neu) {
  const e = vrDaten()[id]; if (!e) return closeSheet();
  openSheet(`<div class="vr-ergebnis">${vrBild(e, true)}<div><div class="eyebrow">${neu ? 'Neu im Vorrat' : 'Schon im Vorrat · +1'}</div><h3>${esc(e.name)}</h3>
    <p>${[e.marke && esc(e.marke), `<strong>${e.stueck} Stück</strong>`, vrMengeText(e), esc(VK.ORTNAME[e.ort] || '')].filter(Boolean).join(' · ')}</p></div></div>
    <div class="sheet-h">${ico('box')}Ort</div>${vrOrtChips(e.ort, 'data-vr-eort-live')}
    <input type="hidden" id="vrErgId" value="${esc(id)}">
    <div class="sheetknoepfe"><button class="btn" data-vr-scan>${ico('barcode')}Weiter scannen</button><button class="btn sec" data-vr-edit="${esc(id)}">${ico('pencil')}Bearbeiten</button></div>`);
}

/* ---------- Frischware ---------- */
function vrFrischZahlen() {
  const v = vrDaten();
  document.querySelectorAll('[data-vr-f]').forEach(b => { const e = v['f:' + b.dataset.vrF], z = b.querySelector('.zahl'); const n = e ? e.stueck || 0 : 0;
    if (e && !z) b.insertAdjacentHTML('beforeend', `<b class="zahl">${n}</b>`); else if (z) { if (e) z.textContent = n; else z.remove(); } });
}
function vrFrischSheet() {
  openSheet(`<h3>Obst & Gemüse</h3><p class="klein">Antippen = 1 Stück mehr. Milch, Joghurt, Käse usw. bitte scannen.</p>
    <div class="sheet-h">${ico('box')}Ort</div>${vrOrtChips(vrUi.frischOrt, 'data-vr-fort', true)}
    <div class="schnell vr-frisch">${VK.FRISCH.map(([f, n, i]) => `<button class="sbtn" data-vr-f="${f}">${ico(i)}<span>${n}</span></button>`).join('')}</div>`);
  vrFrischZahlen();
}

/* ---------- Bearbeiten / von Hand ---------- */
function vrAbtChips(aktiv) {
  return `<div class="chips scroll vr-abten">${VK.ABT.map(a => `<button type="button" class="chip ${aktiv === a ? 'on' : ''}" data-vr-eabt="${esc(a)}" aria-pressed="${aktiv === a}">${a}</button>`).join('')}</div>`;
}
function vrBearbeiten(id) {
  const e = id ? vrDaten()[id] : null; if (id && !e) return closeSheet();
  const x = e || { name: '', ort: vrOrtWahl(), stueck: 1 };
  const ab = VK.wenigAbVon(x), rng = VK.wenigAbRange(ab.einheit);
  const abt = VK.abtVon(x);
  openSheet(`<h3>${e ? 'Bearbeiten' : 'Von Hand eintragen'}</h3>
    <form id="vrForm" class="vr-form" data-id="${esc(id || '')}">
      ${e ? `<div class="vr-ergebnis klein">${vrBild(e, true)}<div>${e.code ? `<p class="vr-code">${ico('barcode')}${esc(e.code)}</p>` : ''}${e.wer && PNAME[e.wer] ? `<p class="klein">Zuletzt geändert: ${esc(PNAME[e.wer])}, ${vrDatum(e.zeit)} ${pad2(new Date(e.zeit).getHours())}:${pad2(new Date(e.zeit).getMinutes())}</p>` : ''}</div></div>` : ''}
      <label>Name<input type="text" id="vrName" required value="${esc(x.name)}" autocomplete="off"></label>
      ${x.frisch ? '' : `<label>Marke<input type="text" id="vrMarke" value="${esc(x.marke || '')}" autocomplete="off"></label>`}
      ${!e ? `<label>Strichcode (falls vorhanden)<input type="text" id="vrCode" inputmode="numeric" pattern="[0-9]*" autocomplete="off"></label>` : ''}
      <div class="sheet-h">${ico('box')}Ort</div>${vrOrtChips(x.ort, 'data-vr-eort')}<input type="hidden" id="vrOrt" value="${esc(x.ort)}">
      <div class="sheet-h">${ico('bag')}Abteilung</div>${vrAbtChips(abt)}<input type="hidden" id="vrAbt" value="${esc(abt)}">
      <div class="vr-felder"><label>Stück<span class="vr-step"><button type="button" class="icon" data-vr-fs="-1" aria-label="Weniger">${ico('minus')}</button><input type="number" id="vrStueck" min="0" step="1" inputmode="numeric" value="${x.stueck || 0}"><button type="button" class="icon" data-vr-fs="1" aria-label="Mehr">${ico('plus')}</button></span></label>
      <label>Menge insgesamt<span class="vr-mengefeld"><input type="number" id="vrMenge" min="0" step="1" inputmode="numeric" value="${x.menge != null ? x.menge : ''}" placeholder="–"><select id="vrEinheit">${['g', 'ml'].map(u => `<option ${(x.einheit || 'g') === u ? 'selected' : ''}>${u}</option>`).join('')}</select></span></label>
      <label>MHD (optional)<input type="date" id="vrMhd" value="${esc(x.mhd || '')}"></label></div>
      <label class="vr-wenigab"><span id="vrWenigLabel">${esc(VK.wenigAbText(ab))}</span>
        <input type="range" id="vrWenigAb" min="${rng.min}" max="${rng.max}" step="${rng.step}" value="${ab.n}" data-einheit="${esc(ab.einheit)}" aria-valuetext="${esc(VK.wenigAbText(ab))}">
        <input type="hidden" id="vrWenigEinheit" value="${esc(ab.einheit)}"></label>
      <div class="sheetknoepfe"><button class="btn">${ico('check')}Speichern</button>${e ? `<button type="button" class="btn ghost" data-vr-del="${esc(id)}">${ico('trash')}Löschen</button>` : ''}</div>
    </form>`);
  vrWenigAbSync(false);
}
/* Schieberegler an führende Einheit (Stück vs. g/ml) anpassen und Label «wenig ab …» setzen.
   keepWert=true: aktuellen Zahlenwert behalten, wenn die Einheit gleich bleibt; bei Einheitswechsel Default. */
function vrWenigAbSync(keepWert) {
  const mengeEl = document.getElementById('vrMenge'), einhEl = document.getElementById('vrEinheit');
  const range = document.getElementById('vrWenigAb'), hid = document.getElementById('vrWenigEinheit'), lab = document.getElementById('vrWenigLabel');
  if (!range || !hid || !lab) return;
  const mengeT = mengeEl ? mengeEl.value.trim() : '', menge = mengeT === '' ? null : Math.max(0, Math.round(+mengeT || 0));
  const einheitForm = menge == null ? null : ((einhEl && einhEl.value) || 'g');
  const basis = (einheitForm === 'g' || einheitForm === 'ml') ? einheitForm : 'stueck';
  const alt = hid.value;
  const rng = VK.wenigAbRange(basis);
  range.min = rng.min; range.max = rng.max; range.step = rng.step;
  let n;
  if (keepWert && alt === basis) n = +range.value;
  else if (keepWert === false && alt === basis) n = +range.value;
  else n = VK.wenigAbDefault(basis).n;
  const ab = VK.wenigAbNorm(n, basis);
  range.value = ab.n; hid.value = ab.einheit; range.dataset.einheit = ab.einheit;
  const txt = VK.wenigAbText(ab); lab.textContent = txt; range.setAttribute('aria-valuetext', txt);
}
function vrFormSpeichern(f) {
  const id0 = f.dataset.id, val = s => { const el = document.getElementById(s); return el ? el.value.trim() : ''; };
  const nameRoh = val('vrName'); if (!nameRoh) return toast('Bitte einen Namen eingeben.');
  const alt = id0 ? vrDaten()[id0] : null;
  // Frischware-Namen nicht «schön schreiben» (sind schon korrekt); sonst Title-Case für DE/CH
  const name = (alt && alt.frisch) ? nameRoh : VK.nameSchoen(nameRoh);
  const stueck = Math.max(0, Math.round(+val('vrStueck') || 0)), mengeT = val('vrMenge'), menge = mengeT === '' ? null : Math.max(0, Math.round(+mengeT || 0));
  const einheit = menge == null ? null : (val('vrEinheit') || 'g');
  const basis = (einheit === 'g' || einheit === 'ml') ? einheit : 'stueck';
  const wenigAb = VK.wenigAbNorm(document.getElementById('vrWenigAb') ? document.getElementById('vrWenigAb').value : VK.wenigAbDefault(basis).n, basis);
  const abtWahl = val('vrAbt');
  const abt = VK.ABT.includes(abtWahl) ? abtWahl : VK.abtVon({ name, frisch: alt && alt.frisch });
  const felder = { name, ort: VK.ORTNAME[val('vrOrt')] ? val('vrOrt') : 'regal', stueck, menge, einheit, mhd: /^\d{4}-\d{2}-\d{2}$/.test(val('vrMhd')) ? val('vrMhd') : null, wenigAb, abt };
  if (document.getElementById('vrMarke')) felder.marke = val('vrMarke');
  if (id0) {
    vrAendern(id0, e => { const r = Object.assign({}, e, felder); if (r.menge == null) { delete r.menge; delete r.einheit; } if (r.einheit && e.einheit && r.einheit !== e.einheit) delete r.packung; return VK.sauber(r); });
    closeSheet(); return toast('Gespeichert.');
  }
  let code = val('vrCode').replace(/\D/g, '');
  if (code && !VK.codeOk(code)) return toast('Der Strichcode stimmt nicht (Prüfziffer). Bitte prüfen oder leer lassen.');
  code = code ? VK.codeNorm(code) : '';
  const id = code ? 'c:' + code : 'h:' + uid();
  if (code && vrDaten()[id]) { toast('Diesen Strichcode gibt es schon im Vorrat.'); return vrBearbeiten(id); }
  Store.update('vorrat', {}, v => { v[id] = VK.stempel(VK.sauber(Object.assign({ code: code || null }, felder)), vrWer()); return v; });
  closeSheet(); toast(`«${name}» ist im Vorrat.`);
}

/* ---------- Eingaben (eigene data-vr-*-Attribute, kollidieren nicht mit app.js) ---------- */
function vrLoeschen(id) {
  const e = vrDaten()[id]; if (!e || !confirm(`«${e.name}» aus dem Vorrat löschen?`)) return false;
  Store.update('vorrat', {}, v => { delete v[id]; return v; });
  try { closeSheet(); } catch (err) {}
  toast('Gelöscht.'); return true;
}
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-vr-scan],[data-vr-frisch],[data-vr-hand],[data-vr-edit],[data-vr-pm],[data-vr-ek],[data-vr-auf],[data-vr-aufabt],[data-vr-ort],[data-vr-fort],[data-vr-eort],[data-vr-eort-live],[data-vr-eabt],[data-vr-f],[data-vr-fs],[data-vr-del]');
  if (!t) return;
  const d = t.dataset;
  if ('vrScan' in d) return vrScanStarten();
  if ('vrFrisch' in d) return vrFrischSheet();
  if ('vrHand' in d) return vrBearbeiten(null);
  if (d.vrEdit) return vrBearbeiten(d.vrEdit);
  if (d.vrPm) {
    const i = d.vrPm.lastIndexOf('|'), id = d.vrPm.slice(0, i), n = +d.vrPm.slice(i + 1);
    const e = vrDaten()[id]; if (!e) return;
    if (n < 0 && (e.stueck || 0) <= 0) return vrLoeschen(id);
    return vrAendern(id, x => VK.plus(x, n));
  }
  if (d.vrEk) return vrZumEinkauf(d.vrEk);
  if (d.vrAuf) { vrUi.offen[d.vrAuf] = !vrUi.offen[d.vrAuf]; const l = document.getElementById('vrListe'); if (l) l.innerHTML = vrListeHTML(); return; }
  if (d.vrAufabt) { vrUi.offenAbt[d.vrAufabt] = !vrUi.offenAbt[d.vrAufabt]; const l = document.getElementById('vrListe'); if (l) l.innerHTML = vrListeHTML(); return; }
  const chips = (attr, wert) => t.parentNode.querySelectorAll(`[${attr}]`).forEach(b => { const on = b.getAttribute(attr) === wert; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  if (d.vrOrt) { chips('data-vr-ort', d.vrOrt); einstSetzen({ vorrat_ort: d.vrOrt }); return; }
  if (d.vrFort) { chips('data-vr-fort', d.vrFort); vrUi.frischOrt = d.vrFort; return; }
  if (d.vrEort) { chips('data-vr-eort', d.vrEort); const h = document.getElementById('vrOrt'); if (h) h.value = d.vrEort; return; }
  if (d.vrEortLive) {
    chips('data-vr-eort-live', d.vrEortLive);
    const id = (document.getElementById('vrErgId') || {}).value;
    if (id && VK.ORTNAME[d.vrEortLive]) vrAendern(id, e => { e.ort = d.vrEortLive; return e; });
    return;
  }
  if (d.vrEabt) { chips('data-vr-eabt', d.vrEabt); const h = document.getElementById('vrAbt'); if (h) h.value = d.vrEabt; return; }
  if (d.vrF) { const r = VK.frischDazu(vrDaten(), d.vrF, vrUi.frischOrt === 'auto' ? null : vrUi.frischOrt, vrWer()); if (r.id) Store.set('vorrat', r.v); vrFrischZahlen(); return; }
  if (d.vrFs) { const i = document.getElementById('vrStueck'); if (i) i.value = Math.max(0, (Math.round(+i.value) || 0) + +d.vrFs); return; }
  if (d.vrDel) return vrLoeschen(d.vrDel);
});
document.addEventListener('submit', ev => {
  const f = ev.target;
  if (f.id === 'vrCodeForm') { ev.preventDefault(); const c = document.getElementById('vrCodeTxt').value.replace(/\D/g, ''); if (!VK.codeOk(c)) return toast('Der Code stimmt nicht (8, 12 oder 13 Ziffern mit Prüfziffer).'); return vrCode(c); }
  if (f.id === 'vrNameForm') {
    ev.preventDefault(); const name = VK.nameSchoen(document.getElementById('vrNName').value.trim()), marke = document.getElementById('vrNMarke').value.trim(), code = f.dataset.code;
    if (!name) return toast('Bitte einen Namen eingeben.');
    Store.update('vorrat', {}, v => VK.scanDazu(v, code, { name, marke }, vrOrtWahl(), vrWer()).v);
    return vrErgebnis('c:' + VK.codeNorm(code), true);
  }
  if (f.id === 'vrForm') { ev.preventDefault(); return vrFormSpeichern(f); }
});
document.addEventListener('input', ev => {
  const id = ev.target.id;
  if (id === 'vrSuche') {
    vrUi.suche = ev.target.value; const l = document.getElementById('vrListe'); if (l) l.innerHTML = vrListeHTML();
    return;
  }
  if (id === 'vrWenigAb') {
    const hid = document.getElementById('vrWenigEinheit'), lab = document.getElementById('vrWenigLabel');
    const ab = VK.wenigAbNorm(ev.target.value, hid ? hid.value : 'stueck');
    ev.target.value = ab.n; if (hid) hid.value = ab.einheit;
    const txt = VK.wenigAbText(ab); if (lab) lab.textContent = txt; ev.target.setAttribute('aria-valuetext', txt);
    return;
  }
  if (id === 'vrMenge' || id === 'vrEinheit') vrWenigAbSync(true);
});
/* Kamera aus, sobald das Fenster zugeht, die App in den Hintergrund geht oder die Seite wechselt */
new MutationObserver(() => { if (document.getElementById('sheet').hidden || !document.getElementById('vrVideo')) vrKameraStopp(); })
  .observe(document.getElementById('sheet'), { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && vrKam.laeuft) { vrKameraStopp(); vrStatus('Kamera pausiert.'); }
  else if (!document.hidden && !vrKam.laeuft && document.getElementById('vrVideo') && !document.getElementById('sheet').hidden) vrScanStarten();
});
window.addEventListener('offline', () => { if (vrKam.laeuft) { vrKameraStopp(); vrStatus('Kein Internet – Scannen geht nur mit Internet.', 'fehler'); } });
