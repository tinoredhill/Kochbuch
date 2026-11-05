'use strict';
/* Kochbuch v8 – Vorrat: reine Logik ohne Anzeige (auch in Node testbar: tests/vorrat.test.mjs).
   Daten unter dem NEUEN Schlüssel «vorrat» (synchronisiert): { <id>: Eintrag }
     id:  'c:<Strichcode>'  Produkt mit Code (gleicher Code = gleicher Eintrag, auf allen Geräten)
          'f:<frisch-id>'   Frischware aus der Auswahlliste (z.B. f:aepfel)
          'h:<zufall>'      von Hand ohne Code
   Eintrag: { name, marke?, bild? (URL, kein Bild-Inhalt), code?, ort, stueck, menge? (Gesamtmenge), einheit? ('g'|'ml'),
              packung? (g/ml pro Stück laut Open Food Facts), mhd? ('JJJJ-MM-TT'), wer? ('tino'|'lili'), zeit (ms),
              wenigAb? ({ n: number, einheit: 'stueck'|'g'|'ml' }) – Schwelle «wenig Bestand» pro Produkt }
   Bilder werden nur als Adresse gespeichert (Firestore-Grenze: höchstens 3000 Einträge, Dokument max. 1 MB).

   «Wenig Bestand» (Tino 05.11.2026): kein globaler Schwellenwert mehr, sondern wenigAb pro Eintrag.
   Führende Einheit: hat der Eintrag menge + einheit g|ml, zählt die Menge; sonst die Stückzahl.
   Fehlt wenigAb (ältere Sync-Daten): Fallback 2 Stück bzw. 200 g/ml. stueck <= 0 gilt immer als wenig. */
(function (global) {
  const ORTE = [['kuehlschrank', 'Kühlschrank', 'fridge'], ['tiefkuehl', 'Tiefkühlschrank', 'snow'], ['regal', 'Vorratsregal', 'jar'], ['keller', 'Keller', 'box']];
  const ORTNAME = Object.fromEntries(ORTE.map(o => [o[0], o[1]]));
  // Frischware ohne Strichcode (Entscheid Tino, v8). Milch, Joghurt, Käse usw. werden gescannt.
  const FRISCH = [['aepfel', 'Äpfel', 'apple'], ['birnen', 'Birnen', 'pear'], ['bananen', 'Bananen', 'banana'], ['trauben', 'Trauben', 'grapes'], ['zitronen', 'Zitronen', 'citrus'],
    ['tomaten', 'Tomaten', 'tomato'], ['gurken', 'Gurken', 'cucumber'], ['karotten', 'Karotten', 'carrot'], ['kartoffeln', 'Kartoffeln', 'potato'], ['zwiebeln', 'Zwiebeln', 'onion'],
    ['knoblauch', 'Knoblauch', 'garlic'], ['paprika', 'Paprika', 'pepper'], ['salat', 'Salat', 'lettuce'], ['broccoli', 'Broccoli', 'broccoli'], ['spinat', 'Spinat', 'herbs']];
  const FRISCH_ORT = { aepfel: 'regal', birnen: 'regal', bananen: 'regal', trauben: 'kuehlschrank', zitronen: 'regal', tomaten: 'regal', gurken: 'kuehlschrank', karotten: 'kuehlschrank',
    kartoffeln: 'keller', zwiebeln: 'keller', knoblauch: 'regal', paprika: 'kuehlschrank', salat: 'kuehlschrank', broccoli: 'kuehlschrank', spinat: 'kuehlschrank' };
  const WENIG_STUECK = 2, WENIG_MENGE = 200;   // nur noch Defaults / Fallback für Einträge ohne wenigAb

  /* Strichcode prüfen: EAN-13, EAN-8, UPC-A (12), UPC-E (8) mit Prüfziffer */
  function codeOk(c) {
    c = String(c || '').trim();
    if (!/^(\d{8}|\d{12}|\d{13})$/.test(c)) return false;
    const z = c.split('').map(Number), p = z.pop();
    let s = 0; z.reverse().forEach((d, i) => { s += d * (i % 2 === 0 ? 3 : 1); });
    return (10 - (s % 10)) % 10 === p;
  }
  /* UPC-A (12) als EAN-13 mit führender 0 speichern -> derselbe Artikel hat immer dieselbe id */
  const codeNorm = c => { c = String(c || '').trim(); return c.length === 12 ? '0' + c : c; };

  /* Antwort von Open Food Facts (api/v2/product/<code>.json) -> Produktdaten oder null */
  function offAuswerten(j) {
    if (!j || j.status !== 1 || !j.product) return null;
    const p = j.product;
    const name = String(p.product_name_de || p.product_name || p.generic_name_de || p.generic_name || '').trim();
    const marke = String(p.brands || '').split(',')[0].trim();
    const bild = /^https:\/\//.test(p.image_front_small_url || '') ? p.image_front_small_url : (/^https:\/\//.test(p.image_small_url || '') ? p.image_small_url : '');
    let packung = null, einheit = null;
    const q = Number(p.product_quantity), u = String(p.product_quantity_unit || '').toLowerCase();
    if (q > 0 && (u === 'g' || u === 'ml')) { packung = Math.round(q); einheit = u; }
    else {   // Ersatz: «quantity» als Text, z.B. «500 g», «1 l», «0,5 kg»
      const m = String(p.quantity || '').toLowerCase().replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|dl|l)\b/);
      if (m) { const f = { kg: [1000, 'g'], g: [1, 'g'], ml: [1, 'ml'], cl: [10, 'ml'], dl: [100, 'ml'], l: [1000, 'ml'] }[m[2]]; packung = Math.round(parseFloat(m[1]) * f[0]); einheit = f[1]; }
    }
    if (!name && !marke) return null;   // leerer Eintrag -> wie «nicht gefunden»
    return sauber({ name: name || marke, marke: name ? marke : '', bild, packung, einheit });
  }
  function sauber(o) { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') r[k] = v; return r; }

  /* Führende Einheit für «wenig»: g/ml wenn Gesamtmenge bekannt, sonst Stück. */
  function wenigBasis(e) {
    if (e && e.menge != null && (e.einheit === 'g' || e.einheit === 'ml')) return e.einheit;
    return 'stueck';
  }
  /* Default-Schwelle für eine Einheit (Neuanlage / Fallback). */
  function wenigAbDefault(einheit) {
    if (einheit === 'g' || einheit === 'ml') return { n: WENIG_MENGE, einheit };
    return { n: WENIG_STUECK, einheit: 'stueck' };
  }
  /* Gespeicherte Schwelle lesen; passt die Einheit nicht zur führenden Basis, greifen die Defaults
     (Zahl einer anderen Einheit nicht umdeuten). Alte Einträge ohne Feld: gleiche Defaults. */
  function wenigAbVon(e) {
    const basis = wenigBasis(e);
    const w = e && e.wenigAb;
    if (w && typeof w.n === 'number' && w.n >= 0 && Number.isFinite(w.n) && w.einheit === basis) {
      return { n: Math.round(w.n), einheit: basis };
    }
    return wenigAbDefault(basis);
  }
  /* Wenig Bestand: stueck <= 0 immer; sonst Bestand < wenigAb (führende Einheit). */
  function wenig(e) {
    if (!e) return false;
    if ((e.stueck || 0) <= 0) return true;
    const ab = wenigAbVon(e);
    if (ab.einheit === 'g' || ab.einheit === 'ml') return (e.menge || 0) < ab.n;
    return (e.stueck || 0) < ab.n;
  }
  /* Anzeige-Text «wenig ab 2 Stück» / «wenig ab 200 g» */
  function wenigAbText(ab) {
    ab = ab || wenigAbDefault('stueck');
    if (ab.einheit === 'g' || ab.einheit === 'ml') return `wenig ab ${ab.n} ${ab.einheit}`;
    return `wenig ab ${ab.n} Stück`;
  }
  /* Schieberegler-Bereich je Einheit */
  function wenigAbRange(einheit) {
    if (einheit === 'g' || einheit === 'ml') return { min: 50, max: 2000, step: 50 };
    return { min: 1, max: 20, step: 1 };
  }
  /* wenigAb aus Formularwert säubern (oder Default) */
  function wenigAbNorm(n, einheit) {
    einheit = (einheit === 'g' || einheit === 'ml') ? einheit : 'stueck';
    const r = wenigAbRange(einheit);
    let x = Math.round(+n);
    if (!Number.isFinite(x)) return wenigAbDefault(einheit);
    if (x < r.min) x = r.min;
    if (x > r.max) x = r.max;
    // auf step runden
    x = Math.round(x / r.step) * r.step;
    if (x < r.min) x = r.min;
    return { n: x, einheit };
  }
  function stempel(e, wer, jetzt) { e.zeit = jetzt || Date.now(); if (wer) e.wer = wer; else delete e.wer; return e; }

  /* +n Stück; bei bekannter Packungsgrösse wächst die Gesamtmenge mit */
  function plus(e, n) {
    const alt = e.stueck || 0, neu = Math.max(0, alt + n);
    if (e.packung && e.menge != null) e.menge = Math.max(0, e.menge + (neu - alt) * e.packung);
    e.stueck = neu; return e;
  }
  /* Gescannt: gleicher Code -> Menge +1 (dort, wo er schon liegt), sonst neuer Eintrag am gewählten Ort */
  function scanDazu(v, code, produkt, ort, wer, jetzt) {
    v = Object.assign({}, v || {}); code = codeNorm(code);
    const id = 'c:' + code;
    if (v[id]) { v[id] = stempel(plus(Object.assign({}, v[id]), 1), wer, jetzt); return { v, id, neu: false }; }
    const p = produkt || {};
    const hatPack = !!p.packung;
    const e = sauber({ code, name: p.name || 'Unbekanntes Produkt', marke: p.marke, bild: p.bild, ort: ORTNAME[ort] ? ort : 'kuehlschrank', stueck: 1,
      packung: p.packung, einheit: hatPack ? p.einheit : null, menge: hatPack ? p.packung : null,
      wenigAb: wenigAbDefault(hatPack && (p.einheit === 'g' || p.einheit === 'ml') ? p.einheit : 'stueck') });
    v[id] = stempel(e, wer, jetzt); return { v, id, neu: true };
  }
  function frischDazu(v, fid, ort, wer, jetzt) {
    const f = FRISCH.find(x => x[0] === fid); if (!f) return { v, id: null, neu: false };
    v = Object.assign({}, v || {}); const id = 'f:' + fid;
    if (v[id]) { v[id] = stempel(plus(Object.assign({}, v[id]), 1), wer, jetzt); return { v, id, neu: false }; }
    v[id] = stempel({ name: f[1], frisch: fid, ort: ORTNAME[ort] ? ort : (FRISCH_ORT[fid] || 'regal'), stueck: 1, wenigAb: wenigAbDefault('stueck') }, wer, jetzt); return { v, id, neu: true };
  }
  const vergleich = (a, b) => (wenig(b[1]) - wenig(a[1])) || String(a[1].name || '').localeCompare(String(b[1].name || ''), 'de');
  const normT = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function trifft(e, q) { q = normT(q).trim(); if (!q) return true; return normT([e.name, e.marke, e.code, ORTNAME[e.ort]].join(' ')).includes(q); }
  /* Übersicht: pro Ort, wenig Bestand zuerst, dann nach Name */
  function gruppiert(v, q) {
    const liste = Object.entries(v || {}).filter(([, e]) => e && trifft(e, q));
    return ORTE.map(([o, name, icon]) => ({ ort: o, name, icon, eintraege: liste.filter(([, e]) => (ORTNAME[e.ort] ? e.ort : 'regal') === o).sort(vergleich) }));
  }
  function wenigListe(v, q) { return Object.entries(v || {}).filter(([, e]) => e && wenig(e) && trifft(e, q)).sort(vergleich); }
  const api = { ORTE, ORTNAME, FRISCH, FRISCH_ORT, WENIG_STUECK, WENIG_MENGE, codeOk, codeNorm, offAuswerten, wenigBasis, wenigAbDefault, wenigAbVon, wenig, wenigAbText, wenigAbRange, wenigAbNorm, plus, stempel, scanDazu, frischDazu, gruppiert, wenigListe, trifft, sauber };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.VorratKern = api;
})(typeof window !== 'undefined' ? window : globalThis);
