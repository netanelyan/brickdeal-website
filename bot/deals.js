/**
 * deals.json feed writer. Append-or-update, deduplicated by productId,
 * atomic write (temp file + rename) matching src/store.js.
 *
 * Drop in at: src/deals.js
 *
 * Wire-up — in the drip-post path, immediately after a deal is confirmed posted
 * to the channel (NOT at approval time; only posted deals belong in the feed):
 *
 *   import { recordDeal } from './deals.js';
 *   await recordDeal(product);
 *
 * That is the only change to the existing pipeline. Ingestion, dedupe, approval
 * and drip are untouched.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { detectTheme } from './themes.js';

const DEALS_PATH = process.env.DEALS_PATH
  || path.join(process.cwd(), 'data', 'deals.json');

// Serializes concurrent writes. The drip poster is single-threaded today, but a
// read-modify-write on a shared file should not depend on that staying true.
let chain = Promise.resolve();

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v) {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? undefined : s;
}

/** Build a feed record from the product object made by src/engine.js. */
export function toRecord(product, now = new Date()) {
  const productId = str(product.productId ?? product.id);
  const name = str(product.name ?? product.title);
  const link = str(product.link ?? product.affiliateLink ?? product.promotionLink);

  if (!productId || !name || !link) {
    throw new Error(`deals: incomplete product (id=${productId} name=${!!name} link=${!!link})`);
  }

  const price = num(product.price);
  if (price === undefined) throw new Error(`deals: missing price for ${productId}`);

  const iso = now.toISOString();

  // Absent fields are omitted, never written as null — the site treats a missing
  // key and a null the same way, but null bloats the feed and reads as a bug.
  const rec = {
    productId,
    name,
    price,
    currency: str(product.currency) || process.env.TARGET_CURRENCY || 'ILS',
    link,
    postedAt: iso,
    priceCheckedAt: iso,
  };

  const setId  = str(product.setId);
  const pieces = num(product.pieces);
  const stars  = num(product.stars ?? product.rating);
  const image  = str(product.image ?? product.imageUrl);
  const theme  = detectTheme(name);

  /* AliExpress list price, used for the struck-through comparison on the site.
     Written ONLY when the API actually reports one above the sale price — never
     reconstructed from a discount percentage or carried over from an older
     record. A wrong "original" is a false price claim, so absent beats guessed. */
  const was = num(product.originalPrice ?? product.listPrice ?? product.originalPriceValue);
  if (was !== undefined && was > price) rec.originalPrice = was;

  if (setId) rec.setId = setId;
  if (pieces !== undefined && pieces > 0) rec.pieces = Math.round(pieces);
  if (stars !== undefined && stars > 0) rec.stars = Math.round(stars * 10) / 10;
  if (image) rec.image = image;
  if (theme) rec.theme = theme;

  return rec;
}

export async function readDeals() {
  try {
    const raw = await fs.readFile(DEALS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    // A corrupt feed is recoverable (the backfill can rebuild it), but silently
    // starting from [] would throw away the archive. Fail loudly instead.
    throw new Error(`deals: cannot read ${DEALS_PATH}: ${err.message}`);
  }
}

/** Atomic write: temp file in the same directory, then rename. */
export async function writeDeals(deals) {
  await fs.mkdir(path.dirname(DEALS_PATH), { recursive: true });
  const tmp = `${DEALS_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(deals, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, DEALS_PATH);
}

/**
 * Append a posted deal, or update the existing record for the same productId.
 * On update, postedAt is preserved — it marks first publication, not last touch.
 * @returns {Promise<{created: boolean, total: number}>}
 */
export function recordDeal(product, now = new Date()) {
  chain = chain.then(async () => {
    const rec = toRecord(product, now);
    const deals = await readDeals();
    const i = deals.findIndex((d) => String(d.productId) === rec.productId);

    if (i === -1) {
      deals.push(rec);
      await writeDeals(deals);
      return { created: true, total: deals.length };
    }

    deals[i] = { ...deals[i], ...rec, postedAt: deals[i].postedAt || rec.postedAt };
    delete deals[i].dead;  // it posted again, so it is alive
    await writeDeals(deals);
    return { created: false, total: deals.length };
  });

  // Keep the chain alive for the next caller even if this write failed.
  const result = chain;
  chain = chain.catch(() => {});
  return result;
}

export { DEALS_PATH };
