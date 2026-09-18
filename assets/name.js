/**
 * Structured deal names.
 *
 * The bot now names every deal "<series> | <product>" — the theme it belongs to,
 * a pipe, then the product itself — and that string is stored verbatim in the
 * feed so the site and the Telegram channel always call a deal the same thing.
 *
 *   "מלחמת הכוכבים | ספינת X-Wing אדומה"
 *   "פרחים | עץ בונסאי בוורוד"
 *
 * The site splits it at display time: the series becomes a small label above
 * the title, the product becomes the title itself, and the full string stays
 * the name in <title>, alt text and JSON-LD. Older records that predate the
 * convention have no separator and come back with a null series.
 *
 * Loaded by BOTH assets/app.js (browser) and build.js (Node), so the client
 * grid and the generated deal pages split the same way.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BrickDealName = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Spaces around the pipe are not required: "a|b" and "a | b" split the same.
  var SEP = /\s*\|\s*/;

  /**
   * @param {string} name feed name, structured or legacy
   * @returns {{ series: string|null, title: string, full: string }}
   */
  function splitName(name) {
    var full = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    var i = full.search(SEP);
    if (i <= 0) return { series: null, title: full, full: full };

    var series = full.slice(0, i).trim();
    var title = full.slice(i).replace(SEP, '').trim();
    // A pipe with nothing meaningful on one side is not a structured name.
    if (!series || !title) return { series: null, title: full, full: full };
    return { series: series, title: title, full: full };
  }

  return { splitName: splitName, SEP: ' | ' };
});
