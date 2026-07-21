# Handoff: BrickDeal searchable deals website

## Goal

Turn the deal archive into a searchable, browsable website. Right now every deal the bot posts scrolls away in Telegram and is effectively lost. Hundreds of curated deals are sitting in the channel history earning nothing.

**Why this matters commercially:** affiliate order data shows buyers frequently arrive via a deal link and then purchase unrelated products, which still pays commission. So the click itself has value, independent of whether the specific set sells. A browsable catalog generates far more clicks than a chronological feed.

Secondary goal: rank in Hebrew search for terms like "לגו סיני", "אבני בנייה תואמות", "לגו זול". No Israeli site currently serves this.

---

## Existing system (context)

- **Bot repo:** `netanelyan/brickdeal-automation` (PRIVATE). Node.js ESM, no framework beyond telegraf + GramJS.
- **Running on:** Ubuntu 24.04 VPS, `~/brickdeal-automation`, under pm2 as process `brickdeal`.
- **Storage:** `data/store.json` via `src/store.js` (JSON file, atomic writes: temp file + rename). Holds `seen`, `staging`, `queue`.
- **Pipeline:** source channels → `src/resolve.js` → `src/candidate.js` / `src/engine.js` (AliExpress API: `productdetail.get` + `link.generate` type 2 short links) → `src/polish.js` (Claude Haiku, Hebrew naming) → approval in Telegram DM → queue → drip post to channel.
- **Existing landing page:** a single-page "bridge" already deployed on GitHub Pages from a SEPARATE public repo. The new site should live alongside it or in its own public repo.

**Per-deal data already available** in the product object built by `src/engine.js`:

| Field | Notes |
|---|---|
| Hebrew name | AI-polished, LEGO-store style |
| `setId` | official set number, may be absent |
| `pieces` | piece count, may be absent |
| price | ILS (`TARGET_CURRENCY=ILS`) |
| `stars` | rating, often absent |
| image URL | AliExpress CDN |
| affiliate link | native `s.click.aliexpress.com/e/_...` short link |
| product ID | canonical numeric AliExpress ID |

---

## Part A — Export deals from the bot

Add an export step so every **approved and posted** deal is appended to a `deals.json` feed.

### Requirements

1. When a deal is posted to the channel, append a record to `data/deals.json`:
   ```json
   {
     "productId": "1005012557193590",
     "name": "מכונית פורד אנגליה מעופפת - הארי פוטר",
     "setId": "76470",
     "pieces": 868,
     "price": 129.40,
     "currency": "ILS",
     "stars": 4.7,
     "image": "https://ae-pic-a1.aliexpress-media.com/...",
     "link": "https://s.click.aliexpress.com/e/_c3FmQwIP",
     "postedAt": "2026-07-21T09:14:00Z",
     "priceCheckedAt": "2026-07-21T09:14:00Z"
   }
   ```
2. Omit absent fields rather than writing `null`. The site must handle missing `setId`, `pieces`, and `stars` gracefully, since many listings lack them.
3. Deduplicate by `productId` — update the existing record rather than appending a duplicate.
4. Use the same atomic-write approach as `src/store.js`. Do not risk corrupting the file on crash.
5. **Backfill:** write a one-off script that walks existing `store.json` history (and/or re-fetches by product ID) to seed `deals.json` with what has already been posted. The archive is the whole point; launching with an empty catalog defeats it.

### Publishing the feed

The bot repo is **private**; GitHub Pages needs a **public** repo. Pick one approach and explain the tradeoff before implementing:

- **A:** bot pushes `deals.json` directly to the public site repo using a fine-grained PAT or deploy key stored in `.env` (never committed).
- **B:** bot commits to the private repo; a GitHub Action syncs the file across to the public repo.

Either way: push on a schedule (e.g. hourly) or after N new deals, not on every single post. Avoid a commit per deal.

---

## Part B — The website

**Static site. No backend, no database, no build step required.** One HTML page that fetches `deals.json` and renders client-side. Hosted free on GitHub Pages.

### Core features

- **Deal grid** — card per deal: image, Hebrew name, price in ₪, piece count, set number, rating when present. Whole card links out through the affiliate link.
- **Search** — free-text over Hebrew name and set number. Instant, client-side, no submit button.
- **Filters** — price range, piece count range, and optionally theme (see below).
- **Sort** — newest, cheapest, most pieces.
- **Deep-linkable state** — search and filters reflected in the URL query string so results can be shared.

### Theme detection

Deriving a theme from the Hebrew name (Star Wars, Harry Potter, Technic, flowers, cars, etc.) would make browsing far better. Do this with simple keyword matching at export time, stored as a `theme` field. Do not call an LLM per deal for this. If confidence is low, leave it unset and let the deal appear only in the unfiltered list.

### Price freshness — do not skip this

AliExpress prices move constantly and listings die. A catalog full of wrong prices and dead links is worse than no catalog, because it burns trust the channel has already earned.

Required, in order of preference:
1. A refresh job that re-runs `productdetail.get` over stored deals on a schedule, updates `price` and `priceCheckedAt`, and flags or removes dead listings. The API client (`src/aliClient.js`) and rate-limit handling already exist. Respect the existing throttling; do not hammer the API.
2. At minimum, show a visible "עודכן ב־[date]" on each card and a site-wide note that prices are indicative and confirmed on AliExpress.

Also: sort or visually de-emphasize deals whose price has not been checked in over ~14 days.

---

## Design direction

The brand identity is already established across Instagram, the deal cards, and the landing page. **Follow it exactly** — this is not an open aesthetic brief. Consistency with the existing assets matters more than novelty here.

**Palette**
- Background: `#17181C` charcoal
- Accent / prices: `#F5B41E` amber-gold
- Text: `#F5F2EE` off-white
- Secondary text: `#9A9A92` grey
- Alert / sale emphasis, sparingly: `#EE4B3C` red

**Type:** Heebo (already used everywhere). Set a real type scale. Prices are the loudest element on a card, exactly as they are in the Instagram creatives and Telegram deal cards.

**Layout:** `dir="rtl"`, `lang="he"`. Hebrew throughout. Mobile-first — the overwhelming majority of traffic arrives from Instagram on a phone.

**Logo:** `https://cdn.shopify.com/s/files/1/0707/4938/9043/files/logo12.png?v=1784028153`

**Signature element:** spend the boldness in one place — the price. Everything else stays quiet and disciplined. The existing creatives work because a huge amber number dominates a dark, uncluttered frame. Carry that into the card design rather than inventing a new device.

**Quality floor, without announcing it:** responsive to small phones, visible keyboard focus, `prefers-reduced-motion` respected, images lazy-loaded, fast on a 4G connection.

**Copy:** plain, active, specific. Hebrew sentence case. Empty search results are an invitation to act ("לא נמצאו דילים. נסו חיפוש אחר") not an apology.

---

## Required page furniture

- **Header:** logo, one-line positioning, links to the Telegram channel (`https://t.me/+juxUyQ49on1mZGRk`) and Instagram (`@brickdealil`).
- **Persistent CTA to Telegram.** The site's job is clicks to AliExpress *and* subscribers to the channel. Do not bury the channel link.
- **Affiliate disclosure** in the footer, plainly worded. Required and expected.
- **Shipping expectation** somewhere visible: משלוח 2-4 שבועות מסין. Setting this expectation up front prevents complaints later.
- Make clear these are compatible/clone sets, not the genuine article. The brand is honest about this and it should stay that way.

---

## SEO

- Hebrew `<title>` and meta description targeting לגו סיני / אבני בנייה תואמות.
- Semantic headings, real `<a href>` links (not JS-only click handlers) so crawlers can follow them.
- `Product` structured data (JSON-LD) per deal.
- `sitemap.xml` and `robots.txt`.
- Open Graph tags so shared links preview well in WhatsApp and Telegram.

Note honestly in your summary that SEO results take months, not weeks. This is a long-horizon play.

---

## Explicitly out of scope

- No backend, no database, no user accounts, no cart or checkout. Purchases happen on AliExpress.
- No price-history charts, no wishlists, no comments. Ship the catalog first.
- Do not restructure the existing bot pipeline. Add the export alongside it; leave ingestion, dedupe, approval, and drip untouched.

---

## Acceptance criteria

1. `deals.json` is generated, deduplicated by product ID, backfilled with existing deals, and published to the public repo automatically.
2. The site loads on a phone, renders the full catalog, and search returns correct results as you type.
3. Every card links out through the correct affiliate link, and clicking one reaches the right AliExpress product.
4. Missing `setId` / `pieces` / `stars` degrade cleanly — no "undefined" anywhere.
5. Hebrew renders right-to-left correctly throughout. Check this carefully; RTL bugs have bitten this project repeatedly.
6. A price-freshness mechanism exists and is visible to the user.
7. `pm2 restart brickdeal` still works and the Telegram pipeline is unaffected.

---

## Before you build

State your plan first: which publishing approach (A or B) you chose and why, how you will handle price refresh, and a one-paragraph description of the card and grid design. Then build.
