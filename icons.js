'use strict';
/* Eigene feine Linien-Icons (24×24, Strich 1.6, runde Enden). Verwendung: ico('name') */
const ICONS = {
  // Bedienung
  back: '<path d="M15 5l-7 7 7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  pause: '<path d="M9 5.5v13M15 5.5v13"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  move: '<path d="M8 4v16M4.5 7.5L8 4l3.5 3.5M16 20V4M12.5 16.5L16 20l3.5-3.5"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  // Navigation
  book: '<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  cart: '<path d="M3.5 5h2.2l2 10.5h10l2-7.5H6.6"/><circle cx="9" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
  bulb: '<path d="M9 17h6M10 20h4M12 3.5a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-.7c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5z"/>',
  // Rezept-Kennzahlen (Stil wie Kochbuch-Vorlage)
  whisk: '<path d="M14.5 9.5L20 4"/><path d="M14.8 9.2c-1.6-1.6-5.4-.4-8.1 2.3s-3.6 6.1-2 7.7 5-.6 7.7-3.3 4-6.1 2.4-6.7z"/><path d="M13.5 10.5c-2 .8-4.6 3.5-5.4 5.4M12 9.6c-2.6 1-5.4 4-6 6"/>',
  pot: '<path d="M5 10h14v6a3.5 3.5 0 0 1-3.5 3.5h-7A3.5 3.5 0 0 1 5 16z"/><path d="M3 10h18M2.5 12.5H5M19 12.5h2.5"/><path d="M9.5 3.5c-.8 1.2.8 1.8 0 3M12 3c-.8 1.2.8 1.8 0 3M14.5 3.5c-.8 1.2.8 1.8 0 3"/>',
  clock: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 1.8M9.5 3h5M18.5 6l1.5-1.5"/>',
  plate: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/>',
  hat: '<path d="M7.5 14.5v5h9v-5"/><path d="M7.5 14.5A4 4 0 0 1 6.8 6.7a4.5 4.5 0 0 1 10.4 0 4 4 0 0 1-.7 7.8z"/><path d="M7.5 17h9"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 10v3.5l2.2 1.4M10 3.5h4M12 3.5v3"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19c3-4 6-7 10-10"/>',
  // Zutaten / Abteilungen
  carrot: '<path d="M14.5 9.5L5 19.5c-.6.6-1.5-.3-.9-.9l9.9-9.5"/><path d="M14 9a3 3 0 0 1 4.2 4.2L9 19.5"/><path d="M16.5 7.5c.5-2 2-3.5 4-3.5M16.5 7.5c-1-1.8-.8-3.6.5-5M16.5 7.5c1.8-1 3.6-.8 5 .5"/>',
  root: '<path d="M12 21c-1-3-3-6-3-10a3 3 0 0 1 6 0c0 4-2 7-3 10z"/><path d="M12 8V3M10 4l2 2 2-2M10.5 13h3M11 16.5h2"/>',
  citrus: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5.5"/><path d="M12 6.5v11M6.5 12h11M8.1 8.1l7.8 7.8M15.9 8.1l-7.8 7.8"/>',
  fruit: '<circle cx="12" cy="13" r="7"/><path d="M12 6c0-1.5.5-2.5 2-3M9 9.5c.8-.6 1.8-.9 3-.9"/><circle cx="10" cy="13" r=".6"/><circle cx="14" cy="12" r=".6"/><circle cx="12.5" cy="15.5" r=".6"/>',
  herbs: '<path d="M12 21V9"/><path d="M12 14c-3 0-5-2-5-5 3 0 5 2 5 5zM12 11c3 0 5-2 5-5-3 0-5 2-5 5zM12 18c2.5 0 4.5-1.6 4.5-4-2.5 0-4.5 1.6-4.5 4z"/>',
  meat: '<path d="M5.5 15.5c-2-3 .5-9 6-10.5s9 2 7.5 6.5-6 6.5-9.5 6.5c-1.6 0-3-.9-4-2.5z"/><circle cx="14" cy="10" r="2"/>',
  fish: '<path d="M3 12c3-4 8-5.5 12-3.5l4-3v13l-4-3C11 17.5 6 16 3 12z"/><circle cx="8" cy="11" r=".8"/>',
  bottle: '<path d="M10 3h4M10.5 3v4.5L8.5 10v10h7V10l-2-2.5V3"/><path d="M8.5 13h7"/>',
  sauce: '<path d="M9.5 3h5v3l2 3v11h-9V9l2-3z"/><path d="M7.5 12h9"/>',
  salt: '<path d="M8 9h8l-1 11H9z"/><path d="M8.5 9a3.5 4 0 0 1 7 0"/><circle cx="11" cy="6.3" r=".5"/><circle cx="13" cy="6.3" r=".5"/>',
  jar: '<rect x="6" y="7" width="12" height="13" rx="2.5"/><path d="M7 4h10v3H7zM6 12h12"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M10 4.5l2 2 2-2M10 19.5l2-2 2 2"/>',
  glass: '<path d="M6 4h12l-1.5 16h-9z"/><path d="M6.6 10h10.8"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  // Schnellknöpfe
  milk: '<path d="M8 8l2-3.5h4L16 8v12H8z"/><path d="M8 8h8M10 4.5V3h4v1.5M8 12h8"/>',
  bread: '<path d="M5 11a7 4.5 0 0 1 14 0c0 1.2-.8 1.8-1.5 2v6.5h-11V13c-.7-.2-1.5-.8-1.5-2z"/><path d="M9.5 9.5l1.2 2M13 9l1.2 2"/>',
  egg: '<path d="M12 3.5c3 0 6 5 6 9.5a6 6 0 0 1-12 0c0-4.5 3-9.5 6-9.5z"/>',
  butter: '<path d="M3.5 15l4-6h13l-4 6z"/><path d="M3.5 15v3h13v-3M16.5 18l4-6V9"/>',
  cheese: '<path d="M3.5 17V11l12-6 5 6v6z"/><path d="M3.5 11h17"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="15" r=".8"/>',
  yogurt: '<path d="M5.5 8h13l-1.5 12H7z"/><path d="M5 8h14M8 5h8l1 3H7z"/>',
  apple: '<path d="M12 8c-1.5-1-5.5-1.5-6.5 2.5S7 20 10 20c1 0 1.2-.5 2-.5s1 .5 2 .5c3 0 5.5-5.5 4.5-9.5S13.5 7 12 8z"/><path d="M12 8c0-2 .5-3.5 2-4.5"/>',
  banana: '<path d="M4 9c1 6 6 10 12 9 2-.3 3.5-1.5 4-3-5 1.5-10-1-12.5-6.5z"/><path d="M4 9l-.5-2.5"/>',
  coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c-.6 1 .6 1.5 0 2.5M12 3.5c-.6 1 .6 1.5 0 2.5"/>',
  roll: '<ellipse cx="9" cy="8" rx="4.5" ry="4.5"/><circle cx="9" cy="8" r="1.4"/><path d="M9 3.5h7a4.5 4.5 0 0 1 4.5 4.5v12H13.5V8M13.5 20H9"/>'
};
function ico(n, cls) { return `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ICONS.bag}</svg>`; }
