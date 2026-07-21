/**
 * Display-time collapsing of duplicate listings.
 *
 * The same physical set is sold by several AliExpress sellers, each with its own
 * product id, its own AI-generated Hebrew name and its own photo. Product-id
 * dedupe is correct to keep them — they ARE different listings — so the feed
 * keeps every record and the collapsing happens here, at render/build time. That
 * way the rule can change without rebuilding deals.json from Telegram again.
 *
 * Rule:
 *   1. Records sharing a setId are one group.
 *   2. Records with no setId fall back to normalised name + piece count.
 *   3. Anything that cannot be keyed confidently — no setId AND no piece count —
 *      is left completely alone, one card each. Showing a duplicate is a much
 *      smaller error than hiding a genuinely different set behind one that only
 *      looked similar.
 *   Within a group the cheapest record wins; ties break on the newest posting,
 *   then on product id, so the choice is deterministic across the client grid
 *   and the static build.
 *
 * Loaded by BOTH assets/app.js (browser) and build.js (Node), deliberately: the
 * grid, the "מציג N מתוך M" count, the heading count, the hero, the generated
 * deal pages, archive.html and sitemap.xml must all agree on how many deals
 * exist. Two copies of this rule would drift and the numbers would stop matching.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BrickDealCollapse = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Hebrew niqqud/cantillation, then punctuation that AI naming varies freely
     (quotes, dashes, brackets), then whitespace. Deliberately conservative: this
     only ever runs for records with NO setId, where a false merge is the risk. */
  function normName(s) {
    return String(s == null ? '' : s)
      .replace(/[֑-ׇ]/g, '')
      .replace(/["'׳״`.,\-–—()[\]:!?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function groupKey(d, index) {
    var setId = d && d.setId != null ? String(d.setId).trim() : '';
    if (setId) return 'set:' + setId;

    var pieces = Number(d && d.pieces);
    var name = normName(d && d.name);
    if (name && Number.isFinite(pieces) && pieces > 0) return 'np:' + name + '|' + pieces;

    // Ambiguous — never merged with anything. Unique key per record.
    return 'solo:' + index;
  }

  function price(d) {
    var n = Number(d && d.price);
    return Number.isFinite(n) ? n : Infinity;
  }

  function posted(d) {
    var t = Date.parse((d && d.postedAt) || '');
    return isNaN(t) ? 0 : t;
  }

  /** Returns the winner of a group: cheapest, then newest, then lowest id. */
  function better(a, b) {
    if (price(a) !== price(b)) return price(a) < price(b) ? a : b;
    if (posted(a) !== posted(b)) return posted(a) > posted(b) ? a : b;
    return String(a.productId) <= String(b.productId) ? a : b;
  }

  /**
   * @param  {Array}  deals
   * @return {Array}  one record per set, input order of first appearance
   */
  function collapse(deals) {
    if (!deals || !deals.length) return [];
    var order = [];
    var winners = {};

    for (var i = 0; i < deals.length; i++) {
      var d = deals[i];
      var k = groupKey(d, i);
      if (!Object.prototype.hasOwnProperty.call(winners, k)) {
        winners[k] = d;
        order.push(k);
      } else {
        winners[k] = better(winners[k], d);
      }
    }

    var out = [];
    for (var j = 0; j < order.length; j++) out.push(winners[order[j]]);
    return out;
  }

  /** How many records a given collapse absorbed — for logging only. */
  function stats(deals) {
    var kept = collapse(deals);
    return { input: deals ? deals.length : 0, kept: kept.length, removed: (deals ? deals.length : 0) - kept.length };
  }

  return { collapse: collapse, stats: stats, groupKey: groupKey, normName: normName };
});
