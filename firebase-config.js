/* Firebase-Web-Konfiguration für die Synchronisation.
   Leer (null) = keine Synchronisation, die App speichert nur auf diesem Gerät.
   Laut Firebase ist diese Konfiguration kein Geheimnis; geschützt wird über die Sicherheitsregeln
   und den Haushalts-Code (der steht NIE hier, sondern nur lokal auf den Geräten).
   Zum Einschalten den Block aus der Firebase-Konsole einsetzen, z.B.:
   window.FIREBASE_CONFIG = {
     apiKey: "…", authDomain: "kochbuch-tino.firebaseapp.com", projectId: "kochbuch-tino",
     storageBucket: "…", messagingSenderId: "…", appId: "…"
   };
*/
window.FIREBASE_CONFIG = null;
