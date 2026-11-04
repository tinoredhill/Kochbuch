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
// Eingesetzt 04.11.2026 (Projekt kochbuch-tino)
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCRBwHbmGeVWpvpxuQwrIIX6O2U40_AvAM",
  authDomain: "kochbuch-tino.firebaseapp.com",
  projectId: "kochbuch-tino",
  storageBucket: "kochbuch-tino.firebasestorage.app",
  messagingSenderId: "61454944385",
  appId: "1:61454944385:web:7eb86ec5ffc67e398c6580"
};
