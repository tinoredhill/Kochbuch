'use strict';
/* Speicher-Schicht des Kochbuchs.
   Die App liest und schreibt Daten NUR über Store.get / Store.set / Store.update / Store.subscribe.
   Heute: lokaler Adapter (localStorage). Später: Store.useAdapter(firestoreAdapter) – die App bleibt unverändert.

   Ein Adapter ist ein Objekt mit:
     load(key)              -> Wert oder undefined (synchron, z.B. aus lokalem Zwischenspeicher)
     save(key, value)       -> speichert (darf asynchron weiterreichen, z.B. an Firestore)
     remove(key)            -> löscht einen Schlüssel
     watch(key, onChange)   -> optional: meldet Änderungen von anderen Geräten (onChange(value)); gibt Abmelde-Funktion zurück
   Geteilte Schlüssel (synchronisierbar): plan, einkauf_eigen, einkauf_haken, einkauf_weg, notizen, favoriten, zuletzt
   ab v7 zusätzlich: tagesplan (Wochenplan nach Datum; «wochenplan» war der v1-Name und bleibt für die alte Migration reserviert), gewohnheiten, bewertungen (Likes/Sterne pro Person)
   ab v8 zusätzlich: vorrat (Vorratsschrank: { id: Eintrag }, siehe vorrat-kern.js)
   («plan» nach Wochentag wird von v7 in «tagesplan» übernommen; favoriten und Sterne in notizen bleiben als «früher, gemeinsam» lesbar)
   (bis v1: wochenplan, einkauf – werden beim ersten Start von v3 übernommen und gelöscht)
   Nur auf diesem Gerät: timer, einstellungen (Person, Farbe, Einkaufs-Zeitraum), sync (Haushalts-Code), sync_meta  (siehe LOCAL_ONLY)
   Der Firestore-Adapter steht in sync.js und wird nur geladen, wenn firebase-config.js gefüllt ist.
   Zugangsdaten gehören NICHT in diese Datei. */
(function (global) {
  const PREFIX = 'kochbuch-v1:';   // Präfix bleibt, damit gespeicherte Daten (Notizen, Sterne) erhalten bleiben
  const LOCAL_ONLY = new Set(['timer', 'einstellungen', 'sync', 'sync_meta']);   // nie synchronisiert
  const subs = new Map();
  const cache = new Map();

  const localAdapter = {
    load(key) { try { const s = localStorage.getItem(PREFIX + key); return s == null ? undefined : JSON.parse(s); } catch (e) { return undefined; } },
    save(key, value) { try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { console.warn('Speichern nicht möglich', e); } },
    remove(key) { try { localStorage.removeItem(PREFIX + key); } catch (e) {} },
    watch(key, onChange) {
      const h = ev => { if (ev.key === PREFIX + key) { try { onChange(ev.newValue == null ? undefined : JSON.parse(ev.newValue)); } catch (e) {} } };
      global.addEventListener('storage', h);
      return () => global.removeEventListener('storage', h);
    }
  };
  let shared = localAdapter;           // austauschbar für Synchronisation
  const unwatch = new Map();

  function adapterFor(key) { return LOCAL_ONLY.has(key) ? localAdapter : shared; }
  function emit(key, value) { (subs.get(key) || []).forEach(cb => { try { cb(value); } catch (e) { console.error(e); } }); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function ensureWatch(key) {
    if (unwatch.has(key)) return;
    const a = adapterFor(key);
    if (a.watch) unwatch.set(key, a.watch(key, v => { cache.set(key, v); emit(key, clone(v)); }));
  }

  const Store = {
    get(key, fallback) {
      if (!cache.has(key)) { cache.set(key, adapterFor(key).load(key)); ensureWatch(key); }
      const v = cache.get(key);
      return v === undefined ? clone(fallback) : clone(v);
    },
    set(key, value) { cache.set(key, clone(value)); adapterFor(key).save(key, clone(value)); emit(key, clone(value)); },
    remove(key) { cache.set(key, undefined); const a = adapterFor(key); if (a.remove) a.remove(key); emit(key, undefined); },
    update(key, fallback, fn) { const v = Store.get(key, fallback); const r = fn(v); Store.set(key, r === undefined ? v : r); return Store.get(key); },
    subscribe(key, cb) {
      ensureWatch(key);
      if (!subs.has(key)) subs.set(key, []);
      subs.get(key).push(cb);
      return () => subs.set(key, subs.get(key).filter(f => f !== cb));
    },
    /* Späterer Anschluss, z.B. Firestore:  Store.useAdapter(createFirestoreAdapter(db, 'haushalt/tino-lili')) */
    useAdapter(adapter) {
      unwatch.forEach((off, key) => { if (!LOCAL_ONLY.has(key) && off) off(); if (!LOCAL_ONLY.has(key)) unwatch.delete(key); });
      shared = adapter || localAdapter;
      [...cache.keys()].filter(k => !LOCAL_ONLY.has(k)).forEach(k => { const v = shared.load(k); if (v !== undefined) { cache.set(k, v); emit(k, clone(v)); } ensureWatch(k); });
    },
    localAdapter
  };
  global.Store = Store;
})(window);
