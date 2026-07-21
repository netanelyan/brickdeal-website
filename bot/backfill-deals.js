/**
 * One-off backfill: seed data/deals.json from the deals already posted.
 *
 * Drop in at: scripts/backfill-deals.js
 * Run:  node scripts/backfill-deals.js --dry
 *       node scripts/backfill-deals.js
 *
 * Reads store.json `seen`, keeps entries that look posted, and re-fetches each
 * one through the existing AliExpress client so prices and images are current
 * rather than whatever was cached months ago.
 *
 * ADJUST BEFORE RUNNING: `collectPosted()` guesses at the shape of `seen`.
 * Run with --dry first, read what it prints, and fix the field names to match
 * the real store. Everything below that function is shape-independent.
 */

import path from 'node:path';
import { readDeals, writeDeals, toRecord, DEALS_PATH } from '../src/deals.js';
import { readStore } from '../src/store.js';
import { getProductDetail } from '../src/aliClient.js';

const DRY = process.argv.includes('--dry');
const THROTTLE_MS = Number(process.env.BACKFILL_THROTTLE_MS || 1200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Pull { productId, postedAt, link } for every already-posted deal out of the store.
 * @returns {Array<{productId: string, postedAt?: string, link?: string, name?: string}>}
 */
function collectPosted(store) {
  const out = [];
  const seen = store?.seen ?? {};

  const entries = Array.isArray(seen)
    ? seen.map((v, i) => [String(i), v])
    : Object.entries(seen);

  for (const [key, value] of entries) {
    if (!value || typeof value !== 'object') {
      // `seen` may just be a set of ids with truthy values.
      if (value) out.push({ productId: String(key) });
      continue;
    }
    // Skip anything that never made it to the channel.
    if (value.posted === false || value.status === 'rejected') continue;

    out.push({
      productId: String(value.productId ?? value.id ?? key),
      postedAt: value.postedAt ?? value.posted_at ?? value.postedTime,
      link: value.link ?? value.affiliateLink,
      name: value.name ?? value.title,
    });
  }

  return out.filter((d) => /^\d{5,}$/.test(d.productId));
}

async function main() {
  const store = await readStore();
  const posted = collectPosted(store);

  const existing = await readDeals();
  const have = new Set(existing.map((d) => String(d.productId)));
  const todo = posted.filter((d) => !have.has(d.productId));

  console.log(`store: ${posted.length} posted deals · feed: ${existing.length} · to fetch: ${todo.length}`);

  if (DRY) {
    console.log('\n--dry — first 5 candidates as parsed from the store:');
    console.log(JSON.stringify(todo.slice(0, 5), null, 2));
    console.log(`\nWould write to ${DEALS_PATH}. Re-run without --dry once these look right.`);
    return;
  }

  const deals = existing.slice();
  let ok = 0, dead = 0, failed = 0;

  for (const [i, item] of todo.entries()) {
    try {
      const detail = await getProductDetail(item.productId);

      if (!detail) {
        // Listing is gone. Keep a tombstone so the refresh job doesn't retry it
        // forever and the site can filter it out.
        deals.push({
          productId: item.productId,
          name: item.name || item.productId,
          price: 0,
          currency: process.env.TARGET_CURRENCY || 'ILS',
          link: item.link || '',
          dead: true,
          postedAt: item.postedAt || new Date().toISOString(),
          priceCheckedAt: new Date().toISOString(),
        });
        dead++;
      } else {
        const rec = toRecord({ ...detail, link: detail.link || item.link, name: detail.name || item.name });
        // Preserve the original publication date where the store knew it.
        if (item.postedAt) rec.postedAt = new Date(item.postedAt).toISOString();
        deals.push(rec);
        ok++;
      }
    } catch (err) {
      console.warn(`  ! ${item.productId}: ${err.message}`);
      failed++;
    }

    // Checkpoint so a crash at deal 300 doesn't cost the first 299 API calls.
    if ((i + 1) % 25 === 0) {
      await writeDeals(deals);
      console.log(`  … ${i + 1}/${todo.length} (ok ${ok}, dead ${dead}, failed ${failed})`);
    }

    await sleep(THROTTLE_MS);
  }

  await writeDeals(deals);
  console.log(`\ndone — ${ok} added, ${dead} dead, ${failed} failed. feed: ${deals.length} deals at ${DEALS_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
