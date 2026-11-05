'use strict';
/* Kochbuch v9.1 – Vorrat: reine Logik ohne Anzeige (auch in Node testbar: tests/vorrat.test.mjs).
   Daten unter dem NEUEN Schlüssel «vorrat» (synchronisiert): { <id>: Eintrag }
     id:  'c:<Strichcode>'  Produkt mit Code (gleicher Code = gleicher Eintrag, auf allen Geräten)
          'f:<frisch-id>'   Frischware aus der Auswahlliste (z.B. f:aepfel)
          'h:<zufall>'      von Hand ohne Code
   Eintrag: { name, marke?, bild? (URL, kein Bild-Inhalt), code?, ort, stueck, menge? (Gesamtmenge), einheit? ('g'|'ml'),
              packung? (g/ml pro Stück laut Open Food Facts), mhd? ('JJJJ-MM-TT'), wer? ('tino'|'lili'), zeit (ms),
              wenigAb? ({ n: number, einheit: 'stueck'|'g'|'ml' }) – Schwelle «wenig Bestand» pro Produkt,
              abt? (Ladenabteilung, gleiche Namen wie Einkaufsliste ABT; fehlt bei alten Sync-Daten → Fallback) }
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

  /* Ladenabteilungen – dieselben Namen wie ABT in app.js (Einkaufsliste). */
  const ABT = ['Gemüse & Früchte', 'Fleisch & Fisch', 'Milchprodukte & Eier', 'Brot & Backwaren', 'Vorrat & Gewürze', 'Öl & Saucen', 'Tiefkühl', 'Getränke', 'Diverses'];
  /* Open-Food-Facts categories_tags → Abteilung (erste passende gewinnt, Reihenfolge = Spezifität). */
  const OFF_ABT = [
    ['en:frozen-foods', 'Tiefkühl'], ['en:frozen-vegetables', 'Tiefkühl'], ['en:frozen-meats', 'Tiefkühl'], ['en:ice-creams', 'Tiefkühl'],
    ['en:beverages', 'Getränke'], ['en:waters', 'Getränke'], ['en:sodas', 'Getränke'], ['en:fruit-juices', 'Getränke'], ['en:beers', 'Getränke'], ['en:wines', 'Getränke'], ['en:hot-beverages', 'Getränke'],
    ['en:oils', 'Öl & Saucen'], ['en:sauces', 'Öl & Saucen'], ['en:vinegars', 'Öl & Saucen'], ['en:mustards', 'Öl & Saucen'], ['en:dressings', 'Öl & Saucen'],
    ['en:meats', 'Fleisch & Fisch'], ['en:meats-and-their-products', 'Fleisch & Fisch'], ['en:fish', 'Fleisch & Fisch'], ['en:fishes', 'Fleisch & Fisch'], ['en:seafood', 'Fleisch & Fisch'], ['en:poultry', 'Fleisch & Fisch'],
    ['en:dairies', 'Milchprodukte & Eier'], ['en:milks', 'Milchprodukte & Eier'], ['en:cheeses', 'Milchprodukte & Eier'], ['en:yogurts', 'Milchprodukte & Eier'], ['en:eggs', 'Milchprodukte & Eier'], ['en:butters', 'Milchprodukte & Eier'], ['en:creams', 'Milchprodukte & Eier'],
    ['en:breads', 'Brot & Backwaren'], ['en:breads-and-pastries', 'Brot & Backwaren'], ['en:pastries', 'Brot & Backwaren'], ['en:biscuits-and-cakes', 'Brot & Backwaren'],
    ['en:vegetables', 'Gemüse & Früchte'], ['en:fruits', 'Gemüse & Früchte'], ['en:fresh-vegetables', 'Gemüse & Früchte'], ['en:fresh-fruits', 'Gemüse & Früchte'], ['en:legumes', 'Gemüse & Früchte'], ['en:herbs', 'Vorrat & Gewürze'],
    ['en:spices', 'Vorrat & Gewürze'], ['en:condiments', 'Vorrat & Gewürze'], ['en:groceries', 'Vorrat & Gewürze'], ['en:cereals', 'Vorrat & Gewürze'], ['en:pastas', 'Vorrat & Gewürze'], ['en:rices', 'Vorrat & Gewürze'], ['en:flours', 'Vorrat & Gewürze'], ['en:sugars', 'Vorrat & Gewürze'], ['en:salts', 'Vorrat & Gewürze'], ['en:nuts', 'Vorrat & Gewürze'], ['en:canned-foods', 'Vorrat & Gewürze']
  ];
  /* Namens-Wörter (gleicher Inhalt wie WOERTER in app.js) – Fallback ohne Browser. */
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
  /* v9.1 Zuordnung – gleiche Regel wie bester() in app.js:
     1. Treffer sammeln: Wörter bis 3 Buchstaben nur als ganzes Wort, längere auch in Zusammensetzungen.
     2. Verdeckt: steckt ein Treffer an derselben Stelle ganz in einem längeren Treffer, zählt er nicht (milch in kokosmilch).
     3. Kopfwort: im Deutschen bestimmt das letzte Glied (Butterzopf = Zopf). Ein Treffer am Wortende
        (danach höchstens 2 Buchstaben, z.B. Mehrzahl «-n») schlägt Treffer vorne oder in der Mitte.
     4. Sonst das längere Wort, bei Gleichstand das weiter hinten. */
  const BUCHST = /[a-zäöüéèàâçß]/;
  function besterWort(name, tabelle) {
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
  /* Regel bis v9 (längstes Wort gewinnt blind) – nur um alte, automatisch gespeicherte abt zu erkennen. */
  const NEU_V91 = new Set(['butterzopf', 'butterbrot', 'buttergipfeli', 'butterbrezel', 'butterzöpfli']);
  function besterWortV9(name) {
    const n = String(name || '').toLowerCase(), worte = n.split(/[^a-zäöüéèàß-]+/);
    let best = null, len = 0;
    for (const [ziel, liste] of Object.entries(WOERTER)) for (const w of liste.split(' ')) {
      if (NEU_V91.has(w)) continue;
      const treffer = w.length <= 3 ? worte.includes(w) : n.includes(w);
      if (treffer && w.length > len) { best = ziel; len = w.length; }
    }
    return best;
  }
  function abtAusTags(tags) {
    if (!tags || !tags.length) return null;
    const set = new Set(tags.map(t => String(t).toLowerCase()));
    for (const [tag, abt] of OFF_ABT) if (set.has(tag)) return abt;
    return null;
  }
  /* Abteilung für einen Eintrag: gespeichertes abt > Frischware > OFF-Tags > Namenswörter > Diverses.
     fest=true: manuell gesetzt, nicht überschreiben (Aufrufer entscheidet). */
  function abtVon(e, tags) {
    if (!e) return 'Diverses';
    if (e.abt && ABT.includes(e.abt)) {
      // Von Hand gewählt (abtHand, ab v9.1) oder Frischware: immer behalten.
      if (e.abtHand || e.frisch) return e.abt;
      // v9 hat abt ohne Kennzeichen automatisch gespeichert. Nur wenn es GENAU dem alten Namens-Ergebnis entspricht,
      // war es automatisch -> neue Regel anzeigen (z.B. Butterzopf). Alles andere (von Hand korrigiert, aus OFF-Kategorien) bleibt.
      if (e.abt === (besterWortV9(e.name) || 'Diverses')) return besterWort(e.name, WOERTER) || 'Diverses';
      return e.abt;
    }
    if (e.frisch) return 'Gemüse & Früchte';
    const ausTags = abtAusTags(tags || e.categories_tags);
    if (ausTags) return ausTags;
    // Browser: app.js abteilungVon bevorzugen (gleiche Liste wie Einkauf)
    if (typeof global.abteilungVon === 'function') {
      const a = global.abteilungVon(e.name || '');
      if (a && ABT.includes(a)) return a;
    }
    return besterWort(e.name, WOERTER) || 'Diverses';
  }
  /* Encoding-Fehler aus Open Food Facts (UTF-8 als Latin-1 gelesen, «Ã¼» statt «ü») zurückbiegen. */
  const MOJI = [['Ã¼', 'ü'], ['Ã¶', 'ö'], ['Ã¤', 'ä'], ['Ãœ', 'Ü'], ['Ã–', 'Ö'], ['Ã„', 'Ä'], ['Ã©', 'é'], ['Ã¨', 'è'], ['Ã¢', 'â'], ['Ã§', 'ç'], ['ÃŸ', 'ß'], ['Ã\u00a0', 'à']];
  function textFix(s) { s = String(s == null ? '' : s); if (s.includes('Ã')) for (const [a, b] of MOJI) s = s.split(a).join(b); return s; }
  /* Marke säubern (nicht aggressiv): Encoding-Fehler, Leerzeichen, «Cooü»/«coop» -> «Coop». Andere Marken bleiben wie sie sind. */
  function markeSchoen(s) {
    s = textFix(s).replace(/\s+/g, ' ').trim();
    return s.replace(/(^|[^a-zäöüéèàâçß])coo(?:[üÜ]|p)(?=$|[^a-zäöüéèàâçß])/gi, '$1Coop');
  }
  /* Namen schön schreiben: bei komplett kleinem Text jedes Wort gross; sonst nur ersten Buchstaben.
     Umlaute bleiben; Marken mit Grossbuchstaben werden nicht umgeschrieben. Frischware-Namen nicht hier durchjagen. */
  function nameSchoen(s) {
    s = String(s || '').trim();
    if (!s) return s;
    const komplettKlein = s === s.toLocaleLowerCase('de-CH');
    if (!komplettKlein) return s.charAt(0).toLocaleUpperCase('de-CH') + s.slice(1);
    return s.split(/(\s+|-)/).map(w => {
      if (!w || /^\s+$/.test(w) || w === '-') return w;
      return w.charAt(0).toLocaleUpperCase('de-CH') + w.slice(1);
    }).join('');
  }

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
    const nameRoh = textFix(p.product_name_de || p.product_name || p.generic_name_de || p.generic_name || '').trim();
    const marke = markeSchoen(String(p.brands || '').split(',')[0]);
    const bild = /^https:\/\//.test(p.image_front_small_url || '') ? p.image_front_small_url : (/^https:\/\//.test(p.image_small_url || '') ? p.image_small_url : '');
    let packung = null, einheit = null;
    const q = Number(p.product_quantity), u = String(p.product_quantity_unit || '').toLowerCase();
    if (q > 0 && (u === 'g' || u === 'ml')) { packung = Math.round(q); einheit = u; }
    else {   // Ersatz: «quantity» als Text, z.B. «500 g», «1 l», «0,5 kg»
      const m = String(p.quantity || '').toLowerCase().replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|dl|l)\b/);
      if (m) { const f = { kg: [1000, 'g'], g: [1, 'g'], ml: [1, 'ml'], cl: [10, 'ml'], dl: [100, 'ml'], l: [1000, 'ml'] }[m[2]]; packung = Math.round(parseFloat(m[1]) * f[0]); einheit = f[1]; }
    }
    if (!nameRoh && !marke) return null;   // leerer Eintrag -> wie «nicht gefunden»
    const tags = Array.isArray(p.categories_tags) ? p.categories_tags.map(String) : [];
    const name = nameSchoen(nameRoh || marke);
    const abt = abtVon({ name, categories_tags: tags }, tags);
    return sauber({ name, marke: nameRoh ? marke : '', bild, packung, einheit, abt, categories_tags: tags.length ? tags : undefined });
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
    const name = nameSchoen(p.name || 'Unbekanntes Produkt');
    const abt = p.abt && ABT.includes(p.abt) ? p.abt : abtVon({ name, categories_tags: p.categories_tags }, p.categories_tags);
    const e = sauber({ code, name, marke: p.marke ? markeSchoen(p.marke) : p.marke, bild: p.bild, ort: ORTNAME[ort] ? ort : 'kuehlschrank', stueck: 1,
      packung: p.packung, einheit: hatPack ? p.einheit : null, menge: hatPack ? p.packung : null, abt,
      wenigAb: wenigAbDefault(hatPack && (p.einheit === 'g' || p.einheit === 'ml') ? p.einheit : 'stueck') });
    v[id] = stempel(e, wer, jetzt); return { v, id, neu: true };
  }
  function frischDazu(v, fid, ort, wer, jetzt) {
    const f = FRISCH.find(x => x[0] === fid); if (!f) return { v, id: null, neu: false };
    v = Object.assign({}, v || {}); const id = 'f:' + fid;
    if (v[id]) { v[id] = stempel(plus(Object.assign({}, v[id]), 1), wer, jetzt); return { v, id, neu: false }; }
    v[id] = stempel({ name: f[1], frisch: fid, ort: ORTNAME[ort] ? ort : (FRISCH_ORT[fid] || 'regal'), stueck: 1, abt: 'Gemüse & Früchte', wenigAb: wenigAbDefault('stueck') }, wer, jetzt); return { v, id, neu: true };
  }
  const vergleich = (a, b) => (wenig(b[1]) - wenig(a[1])) || String(a[1].name || '').localeCompare(String(b[1].name || ''), 'de');
  const normT = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function trifft(e, q) { q = normT(q).trim(); if (!q) return true; return normT([e.name, e.marke, e.code, ORTNAME[e.ort], e.abt].join(' ')).includes(q); }
  /* Übersicht: pro Ort, darunter Abteilungen (nur nicht-leere), wenig Bestand zuerst, dann nach Name */
  function gruppiert(v, q) {
    const liste = Object.entries(v || {}).filter(([, e]) => e && trifft(e, q));
    return ORTE.map(([o, name, icon]) => {
      const eintraege = liste.filter(([, e]) => (ORTNAME[e.ort] ? e.ort : 'regal') === o).sort(vergleich);
      const gruppen = ABT.map(a => ({ abt: a, eintraege: eintraege.filter(([, e]) => abtVon(e) === a) })).filter(g => g.eintraege.length);
      return { ort: o, name, icon, eintraege, gruppen };
    });
  }
  /* v9.1 Rezept-Zutat schon im Vorrat? Ohne KI, nur Wortvergleich:
     Wörter klein, ohne Akzente/Umlaute, einfache Mehrzahl-Endung weg (Kartoffeln = Kartoffel, Äpfel = Apfel).
     Treffer, wenn ein Wort gleich ist (alle Wörter gleich = bester Treffer) ODER das kürzere Wort (mind. 4 Buchstaben) mit einer
     harmlosen Vorsilbe am Ende des längeren steht UND beide in derselben Abteilung landen (Vollmilch ↔ Milch ja, Kokosmilch ↔ Milch nein).
     Nur Einträge mit Bestand > 0 (stueck > 0). */
  const STOPP = new Set('und oder mit ohne von vom zum zur fur frisch frische frischer frisches fein feine gross grosse klein kleine bio rot rote roter gelb gelbe grun grune gruner weiss weisse etwas nach belieben servieren gemahlen gemahlener getrocknet getrocknete'.split(' '));
  /* Kopf-Treffer nur mit harmloser Vorsilbe (Vollmilch ↔ Milch, Cherrytomaten ↔ Tomaten), nicht Knoblauch ↔ Lauch. */
  const VORSILBE = new Set('voll halb mager magermilch vollrahm halbrahm bio weiss ruch dinkel vollkorn roh frisch extra cherry cocktail rispen jung alpen berg land'.split(' '));
  const NACHSILBE = new Set('zeh zehe zehen knoll knolle stang stange stangen wurfel scheib scheibe scheiben'.split(' '));
  const stamm = w => w.length > 4 ? w.replace(/(en|n|e|s)$/, '') : w;
  const worteVon = s => normT(textFix(s)).split(/[^a-z]+/).filter(w => w.length >= 3 && !STOPP.has(w)).map(stamm);
  function passt(zName, e) {
    const zw = worteVon(zName), ew = worteVon(e.name);
    if (!zw.length || !ew.length) return 0;
    if (zw.some(a => ew.includes(a))) return zw.every(a => ew.includes(a)) && ew.every(b => zw.includes(b)) ? 3 : 2;
    const za = besterWort(zName, WOERTER), ea = abtVon(e);
    if (!za || za !== ea) return 0;
    const kopf = (a, b) => a.length >= 4 && b.endsWith(a) && VORSILBE.has(b.slice(0, -a.length));
    const teil = (a, b) => a.length >= 4 && b.startsWith(a) && NACHSILBE.has(b.slice(a.length));   // Knoblauchzehe ↔ Knoblauch
    return zw.some(a => ew.some(b => kopf(a, b) || kopf(b, a) || teil(a, b) || teil(b, a))) ? 1 : 0;
  }
  function imVorrat(zName, v) {
    const liste = Object.entries(v || {}).filter(([, e]) => e && (e.stueck || 0) > 0).map(([id, e]) => [id, e, passt(zName, e)]).filter(x => x[2]);
    if (!liste.length) return null;
    const best = Math.max(...liste.map(x => x[2]));
    return liste.filter(x => x[2] === best).map(([id, e]) => [id, e]);
  }
  /* Mengen-Hinweis nur wenn klar vergleichbar: Rezept in g/kg bzw. ml/cl/dl/l und alle Treffer mit Gesamtmenge derselben Art,
     oder Rezept in Stück (ohne Einheit) und kein Treffer mit Gesamtmenge. Sonst null (kein Warntext). */
  const UMR = { g: [1, 'g'], kg: [1000, 'g'], ml: [1, 'ml'], cl: [10, 'ml'], dl: [100, 'ml'], l: [1000, 'ml'] };
  function vorratReicht(menge, einheit, treffer) {
    if (!treffer || !treffer.length || typeof menge !== 'number' || !(menge > 0)) return null;
    const u = String(einheit || '').trim().toLowerCase();
    if (!u) {
      if (treffer.some(([, e]) => e.menge != null)) return null;
      const hat = treffer.reduce((s, [, e]) => s + (e.stueck || 0), 0);
      return { reicht: hat >= menge, hat, einheit: 'Stück' };
    }
    const k = UMR[u]; if (!k) return null;
    if (!treffer.every(([, e]) => e.menge != null && e.einheit === k[1])) return null;
    const hat = treffer.reduce((s, [, e]) => s + (e.menge || 0), 0);
    return { reicht: hat >= menge * k[0], hat, einheit: k[1] };
  }
  /* v9.1 Nach dem Kochen: welche Vorrats-Einträge passen zu den Rezept-Zutaten (Bestand > 0)? Jeder Eintrag nur einmal.
     f = Portionen-Faktor; need = benötigte Menge, wenn vergleichbar (sonst null). */
  function kochTreffer(zutaten, v, f) {
    const aus = [], ids = new Set(); f = f || 1;
    for (const z of zutaten || []) {
      const tr = imVorrat(z.name, v); if (!tr) continue;
      for (const [id, e] of tr) {
        if (ids.has(id)) continue; ids.add(id);
        const rr = z.je || z.menge == null ? null : vorratReicht(z.menge * f, z.einheit, [[id, e]]);
        let need = null;
        if (rr) { const u = String(z.einheit || '').trim().toLowerCase(); need = Math.round(z.menge * f * (UMR[u] ? UMR[u][0] : 1)); }
        aus.push({ id, e, zutat: z.name, need, basis: (e.menge != null && (e.einheit === 'g' || e.einheit === 'ml')) ? e.einheit : 'stueck' });
      }
    }
    return aus;
  }
  /* Vorschlag für «Rest»: Bestand minus Rezeptmenge, wenn vergleichbar; sonst der jetzige Bestand. */
  function restVorschlag(t) {
    const hat = t.basis === 'stueck' ? (t.e.stueck || 0) : (t.e.menge || 0);
    return t.need != null ? Math.max(0, hat - t.need) : hat;
  }
  /* Wahl anwenden: { id: 'aus' } -> Eintrag löschen (Bestand 0 = weg, Entscheid Tino);
     { id: { rest: n } } -> Rest setzen (Stück, oder Gesamtmenge g/ml; Stück dann aus Packung gerundet); n <= 0 -> löschen. */
  function nachKochen(v, wahl, wer, jetzt) {
    v = Object.assign({}, v || {});
    for (const [id, w] of Object.entries(wahl || {})) {
      const e = v[id]; if (!e) continue;
      if (w === 'aus') { delete v[id]; continue; }
      if (!w || typeof w.rest !== 'number' || !Number.isFinite(w.rest)) continue;
      const r = Math.max(0, Math.round(w.rest));
      if (r <= 0) { delete v[id]; continue; }
      const x = Object.assign({}, e);
      if (x.menge != null && (x.einheit === 'g' || x.einheit === 'ml')) { x.menge = r; x.stueck = x.packung ? Math.max(1, Math.ceil(r / x.packung)) : Math.max(1, x.stueck || 0); }
      else x.stueck = r;
      v[id] = stempel(x, wer, jetzt);
    }
    return v;
  }
  function wenigListe(v, q) { return Object.entries(v || {}).filter(([, e]) => e && wenig(e) && trifft(e, q)).sort(vergleich); }
  const api = { ORTE, ORTNAME, FRISCH, FRISCH_ORT, ABT, WOERTER, WENIG_STUECK, WENIG_MENGE, codeOk, codeNorm, offAuswerten, nameSchoen, markeSchoen, textFix, besterWort, abtVon, abtAusTags,
    wenigBasis, wenigAbDefault, wenigAbVon, wenig, wenigAbText, wenigAbRange, wenigAbNorm, plus, stempel, scanDazu, frischDazu, gruppiert, wenigListe, trifft, sauber, imVorrat, vorratReicht, kochTreffer, restVorschlag, nachKochen };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.VorratKern = api;
})(typeof window !== 'undefined' ? window : globalThis);
