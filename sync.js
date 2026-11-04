/* Kochbuch – Live-Synchronisation über Firebase Firestore (wird nur geladen, wenn firebase-config.js gefüllt ist).
   Datenmodell:  haushalte/{code}/daten/{schluessel}  =  { e: { <eintrag>: { <geraet>: { v: Wert, t: Zeit, x: gelöscht } } } }
   - Jeder Eintrag (z.B. ein Haken, ein Wochentag, eine Notiz) wird einzeln gespeichert.
   - Jedes Gerät schreibt nur in sein eigenes Unterfeld; gelesen wird pro Eintrag der Wert mit der jüngsten Zeit
     («zuletzt geändert gewinnt»). Gleichzeitiges Abhaken auf zwei Geräten verliert dadurch nichts.
   - Offline: Firestore-Zwischenspeicher (IndexedDB) + lokale Kopie in localStorage. */
import { initializeApp, getApps } from './vendor/firebase/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from './vendor/firebase/firebase-auth.js';
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, doc, setDoc, onSnapshot, connectFirestoreEmulator } from './vendor/firebase/firebase-firestore.js';

const KEYS = ['plan', 'einkauf_eigen', 'einkauf_haken', 'einkauf_weg', 'notizen', 'favoriten', 'zuletzt'];
const local = Store.localAdapter;

/* ---- Werte <-> Einträge ---- */
function zuEintraegen(key, wert) {
  const m = {};
  if (wert == null) return m;
  if (key === 'einkauf_eigen') (wert || []).forEach(x => { m[x.id] = x; });
  else if (key === 'zuletzt') (wert || []).forEach(x => { m[x.rid] = x.ts; });
  else Object.entries(wert).forEach(([k, v]) => { if (v !== undefined && v !== null) m[k] = v; });
  return m;
}
function ausEintraegen(key, m) {
  if (key === 'einkauf_eigen') return Object.keys(m).sort().map(k => m[k]);
  if (key === 'zuletzt') return Object.entries(m).map(([rid, ts]) => ({ rid, ts })).sort((a, b) => b.ts - a.ts).slice(0, 12);
  return m;
}
const enc = id => encodeURIComponent(id).replace(/\./g, '%2E');
const dec = id => decodeURIComponent(id);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function gewinner(geraete) {   // pro Eintrag: jüngste Zeit gewinnt, bei Gleichstand die grössere Geräte-id
  let best = null, bestDev = '';
  for (const [dev, w] of Object.entries(geraete || {})) if (w && (best == null || w.t > best.t || (w.t === best.t && dev > bestDev))) { best = w; bestDev = dev; }
  return best;
}
export function zusammenfuehren(e) {
  const m = {};
  for (const [id, geraete] of Object.entries(e || {})) { const w = gewinner(geraete); if (w && !w.x) m[dec(id)] = w.v; }
  return m;
}
export const _test = { zuEintraegen, ausEintraegen, enc, dec };

/* ---- Verbindung ---- */
let status = { zustand: 'aus', text: 'Nicht verbunden' }, statusCbs = [];
function setStatus(zustand, text) { status = { zustand, text }; statusCbs.forEach(cb => { try { cb(status); } catch (e) {} }); }

export async function starten(config, code, geraet, optionen = {}) {
  setStatus('verbinde', 'Verbinde …');
  const name = 'kochbuch-' + code.slice(0, 8);
  const vorhanden = getApps().find(a => a.name === name);
  const app = vorhanden || initializeApp(config, name);
  const auth = getAuth(app);
  let db;
  if (vorhanden) db = getFirestore(app);
  else {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });   // offline-fähig (IndexedDB)
    if (config.emulator) {   // nur für Tests mit dem Firebase-Emulator
      connectFirestoreEmulator(db, config.emulator.host, config.emulator.firestore);
      connectAuthEmulator(auth, `http://${config.emulator.host}:${config.emulator.auth}`, { disableWarnings: true });
    }
  }
  await new Promise((ok, err) => { const off = onAuthStateChanged(auth, u => { if (u) { off(); ok(u); } }, err); signInAnonymously(auth).catch(err); });

  const letzter = {}, gesehen = {}, ersterSnapshot = {};
  const meta = local.load('sync_meta') || {};
  const zusammengefuehrt = meta[code] || {};
  const onChange = {};
  const ref = key => doc(db, 'haushalte', code, 'daten', key);

  function schreibe(key, alt, neu) {
    const a = zuEintraegen(key, alt), b = zuEintraegen(key, neu), t = Date.now(), e = {};
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(id in b)) e[enc(id)] = { [geraet]: { x: true, t } };
      else if (!(id in a) || !gleich(a[id], b[id])) e[enc(id)] = { [geraet]: { v: b[id], t } };
    }
    if (!Object.keys(e).length) return Promise.resolve();
    return setDoc(ref(key), { e }, { merge: true }).catch(err => { console.warn('Sync-Schreibfehler', err); setStatus('fehler', 'Fehler beim Speichern: ' + (err.code || err.message)); });
  }

  const adapter = {
    load(key) { if (!KEYS.includes(key)) return local.load(key); if (!(key in letzter)) letzter[key] = local.load(key); return letzter[key]; },
    save(key, value) {
      if (!KEYS.includes(key)) return local.save(key, value);
      const alt = key in letzter ? letzter[key] : local.load(key);
      letzter[key] = value; local.save(key, value);
      schreibe(key, alt, value);
    },
    remove(key) { if (!KEYS.includes(key)) return local.remove(key); adapter.save(key, undefined); },
    watch(key, cb) { if (!KEYS.includes(key)) return local.watch(key, cb); onChange[key] = cb; return () => { delete onChange[key]; }; }
  };

  let offen = KEYS.length;
  const abmelden = KEYS.map(key => onSnapshot(ref(key), { includeMetadataChanges: true }, snap => {
    const e = (snap.exists() && snap.data().e) || {};
    let wert = ausEintraegen(key, zusammenfuehren(e));
    if (!zusammengefuehrt[key]) {
      // Erstes Verbinden dieses Geräts: lokale Einträge, die es im Haushalt noch nicht gibt, hochladen.
      // Erst wenn der Server geantwortet hat (sonst könnte ein leerer Zwischenspeicher lokale Daten verdrängen);
      // bis dahin bleiben die lokalen Daten sichtbar.
      const lokal = zuEintraegen(key, local.load(key)), remote = zuEintraegen(key, wert);
      if (snap.metadata.fromCache) wert = ausEintraegen(key, Object.assign({}, lokal, remote));
      else {
        const neu = {};
        for (const [id, v] of Object.entries(lokal)) if (!(id in remote) && !(enc(id) in e)) neu[id] = v;
        if (Object.keys(neu).length) { schreibe(key, ausEintraegen(key, remote), ausEintraegen(key, Object.assign({}, remote, neu))); wert = ausEintraegen(key, Object.assign({}, remote, neu)); }
        zusammengefuehrt[key] = true; meta[code] = zusammengefuehrt; local.save('sync_meta', meta);
      }
    }
    if (!ersterSnapshot[key]) {
      ersterSnapshot[key] = true;
      if (--offen === 0) setStatus(snap.metadata.fromCache ? 'offline' : 'verbunden', snap.metadata.fromCache ? 'Offline – Änderungen werden später übertragen' : 'Verbunden');
    } else if (offen === 0) {
      setStatus(snap.metadata.fromCache ? 'offline' : 'verbunden', snap.metadata.fromCache ? 'Offline – Änderungen werden später übertragen' : 'Verbunden');
    }
    if (!gleich(wert, letzter[key])) { letzter[key] = wert; local.save(key, wert); if (onChange[key]) onChange[key](wert); }
  }, err => { console.warn('Sync-Lesefehler', err); setStatus('fehler', 'Keine Berechtigung oder Fehler: ' + (err.code || err.message)); }));

  KEYS.forEach(k => adapter.load(k));
  Store.useAdapter(adapter);
  window.addEventListener('online', () => status.zustand === 'offline' && setStatus('verbinde', 'Verbinde …'));
  window.addEventListener('offline', () => setStatus('offline', 'Offline – Änderungen werden später übertragen'));
  return { stoppen: () => { abmelden.forEach(f => f()); Store.useAdapter(null); setStatus('aus', 'Nicht verbunden'); } };
}
export function aufStatus(cb) { statusCbs.push(cb); cb(status); }
export function aktuellerStatus() { return status; }
