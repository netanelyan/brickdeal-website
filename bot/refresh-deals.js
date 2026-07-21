/**
 * Price refresh. Re-checks the deals whose prices are oldest, updates price and
 * priceCheckedAt, and marks vanished listings dead so the site drops them.
 *
 * Drop in at: scripts/refresh-deals.js
 * Schedule (crontab -e), nightly, offset from the drip poster:
 *   17 3 * * *  cd ~/brickdeal-automation && /usr/bin/node scripts/refresh-deals.js >> logs/refresh.log 2>&1
 *
 * Batched deliberately: a full catalog re-check every night would hammer the API
 * for no benefit. REFRESH_BATCH oldest-first per run means the whole catalog
 * rotates through on a predictable cycle — 200/night clears 1400 deals a week.
 */

import { readDeals, writeDeals, toRecord } from '../src/deals.js';
import { getProductDetail } from '../src/aliClient.js';

const BATCH = Number(process.env.REFRESH_BATCH || 200);
const THROTTLE_MS = Number(process.env.REFRESH_THROTTLE_MS || 1200);
const DEAD_STRIKES = Number(process.env.REFRESH_DEAD_STRIKES || 2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const time = (v) => { const t = Date.parse(v || ''); return Number.isNaN(t) ? 0 : t; };

async function main() {
  const deals = await readDeals();
  if (!deals.length) {
    console.log('refresh: empty feed, nothing to do');
    return;
  }

  const batch = deals
    .map((d, index) => ({ d, index }))
    .filter(({ d }) => !d.dead)
    .sort((a, b) => time(a.d.priceCheckedAt) - time(b.d.priceCheckedAt))
    .slice(0, BATCH);

  console.log(`refresh: ${deals.length} deals in feed, checking ${batch.length} oldest`);

  let changed = 0, same = 0, died = 0, failed = 0;

  for (const { d, index } of batch) {
    const now = new Date().toISOString();

    try {
      const detail = await getProductDetail(d.productId);

      if (!detail || detail.price == null) {
        // One bad response is often a transient API hiccup, not a dead listing.
        // Require consecutive strikes before hiding a deal from the site.
        const strikes = (d.missStrikes || 0) + 1;
        if (strikes >= DEAD_STRIKES) {
          deals[index] = { ...d, dead: true, priceCheckedAt: now };
          delete deals[index].missStrikes;
          died++;
          console.log(`  × ${d.productId} dead after ${strikes} strikes — ${d.name}`);
        } else {
          deals[index] = { ...d, missStrikes: strikes, priceCheckedAt: now };
          console.log(`  ? ${d.productId} strike ${strikes}/${DEAD_STRIKES}`);
        }
      } else {
        const fresh = toRecord({ ...detail, link: detail.link || d.link, name: detail.name || d.name });
        const moved = Number(fresh.price) !== Number(d.price);

        deals[index] = {
          ...d,
          ...fresh,
          postedAt: d.postedAt,       // first publication never changes
          link: d.link || fresh.link, // keep the affiliate link already in circulation
          priceCheckedAt: now,
        };
        delete deals[index].missStrikes;
        delete deals[index].dead;

        /* If the sale ended, the API stops reporting a list price. Spreading
           `fresh` would leave the old originalPrice in place and keep showing a
           discount that no longer exists — drop it explicitly. */
        if (fresh.originalPrice === undefined) delete deals[index].originalPrice;

        if (moved) {
          changed++;
          console.log(`  ₪ ${d.productId} ${d.price} → ${fresh.price}`);
        } else {
          same++;
        }
      }
    } catch (err) {
      failed++;
      console.warn(`  ! ${d.productId}: ${err.message}`);
    }

    await sleep(THROTTLE_MS);
  }

  await writeDeals(deals);
  console.log(`refresh: ${changed} price changes, ${same} unchanged, ${died} dead, ${failed} errors`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
