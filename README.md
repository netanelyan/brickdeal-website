# BrickDeal — searchable deals site

Catalog of the deals the Telegram bot posts. The home page is client-side and
searchable; the deal pages and archive are static HTML generated from the feed,
so search engines have something real to index.

```
index.html            searchable catalog (client-side); the "most wanted sets" row is
                       the <li data-set> list in here - edit it to change the sets
guide.html            static page: first-time buyer guide (quality, shipping, customs, MOC)
how-it-works.html     static page: how deals are found, how we earn, what "compatible" means
SEO.md                how to get the site into Google — Search Console, sitemap, links
assets/styles.css      brand tokens + layout
assets/app.js          fetch, search, chips, filters, sort, URL state
assets/name.js         splits "<series> | <product>" names — shared with build.js
assets/brand/          logo pack, unpacked as delivered — see its README.txt
assets/brand/og.png    generated link-preview card — tools/make-og-card.js
favicon.ico            root copy, for clients that ask for /favicon.ico blind
build.js               generates deal/*.html, theme/*.html, archive.html, sitemap.xml
tools/                 one-off generators, not part of a build
deals.json             the feed — produced by the bot. NOT in this repo yet.
deals.sample.json      fixture for local rendering. Never deploy.
deal/                  generated — one static page per deal
theme/                 generated — one landing page per theme, linking its deals
archive.html           generated — crawlable index of every deal
robots.txt / sitemap.xml
bot/                   drop-ins for the private bot repo (not part of the site)
```

## ⚠️ The deployed site has no data yet

`deals.json` is produced by the bot export in `bot/`, which **has not been
installed or run**. Until it is, the site has nothing real to show. The fixture
`deals.sample.json` contains real product data but **placeholder affiliate
links** — 11 of its 12 records point at `_PLACEHOLDER…` URLs that will not resolve.

Both the site and `build.js` detect placeholder links and show a red warning band
on every page, so a sample build can't be mistaken for the real thing. That is a
safety net, not permission — do not deploy the fixture.

Note that the fixture reuses 6 images across its 12 records, so names and photos
won't correspond while you're previewing. That's the fixture, not the renderer.

## Running locally

```bash
cp deals.sample.json deals.json     # preview data
node build.js                       # generate deal pages + archive + sitemap
python -m http.server 8000          # then open http://localhost:8000/
```

`fetch` needs HTTP. Opening `index.html` by double-clicking it loads over
`file://`, where the browser blocks the feed request entirely — the page detects
this and says so instead of showing a generic error.

## Feed contract

An array of records (an object with a `deals` array also works). Absent fields
are **omitted**, never `null`:

```json
{
  "productId": "1005012557193590",
  "name": "הארי פוטר | מכונית פורד אנגליה מעופפת",
  "setId": "76470",
  "pieces": 868,
  "price": 129.40,
  "originalPrice": 172.53,
  "currency": "ILS",
  "stars": 4.7,
  "theme": "harry-potter",
  "featured": true,
  "image": "https://ae-pic-a1.aliexpress-media.com/...",
  "link": "https://s.click.aliexpress.com/e/_c3FmQwIP",
  "postedAt": "2026-07-21T09:14:00Z",
  "priceCheckedAt": "2026-07-21T06:00:00Z"
}
```

Dropped on load: `"dead": true` or `"available": false`, and anything missing a
name, price, or link.

`name` is structured `"<series> | <product>"` — the theme the bot filed the
deal under, a pipe, then the product — stored exactly as the channel post reads.
The site splits it (`assets/name.js`): the series becomes a small label above
the product title on cards and deal pages, and the full string stays the name
in `<title>`, alt text and JSON-LD. Older records without a pipe still work;
they simply have no series label. `theme` is derived from the series prefix by
`bot/themes.js`.

### `originalPrice` — a price claim, treat it as one

The struck-through comparison in the hero renders **only** from a real
`originalPrice` reported by AliExpress, and only when it is genuinely above
`price`. It is never derived from a discount percentage, inflated, or carried
over from a previous check. If the API stops reporting a list price, the refresh
job **deletes** the field so an expired discount can't keep advertising itself.

If the feed carries no original prices at all, the hero silently falls back to
the newest deals with no strike-through. That is the intended behaviour — an
empty comparison beats an invented one.

### `image` / `sourceImage` — seller photo or official render

`image` is the AliExpress seller photo until the bot has verified the set
number, at which point it swaps in the official render from Brickset
(`images.brickset.com/sets/images/<setId>-1.jpg`) or BrickLink
(`img.bricklink.com/ItemImage/SN/0/<setId>-1.png`) and keeps the original
under `sourceImage`. So: `sourceImage` present ⇒ `image` is a render.
Absent ⇒ still a seller photo (MOCs, unverified set numbers). Both coexist in
the feed; records are upgraded gradually, so a `setId` alone proves nothing.

Renders are opaque product shots on pure white, so the site gives them a white
tile (`card__media--render`, `fcard__media--render`, `deal__media--render`)
instead of the charcoal inset seller photos get. The deal page and its
`og:image` use Brickset's larger variant (`/sets/large/`), derived in
`build.js`; the grid keeps the small one. `sourceImage` is owned by the bot's
nightly refresh — nothing on the website side writes it.

### `featured`

Optional. Deals flagged `"featured": true` fill the hero, in feed order. With
none flagged, the hero picks the three largest **real** discounts; with no
discounts available, the three newest.

Grid cards deliberately show no discount badge or struck-through price — per the
brief, everything except the price stays quiet there. The comparison is the
hero's job.

### Where the feed is looked up

`assets/app.js` tries, in order:

1. `./deals.json` — canonical, what the bot publishes
2. `./data/deals.json` — legacy location
3. `./deals.sample.json` — so a fresh checkout renders before the bot has run

All relative. A leading `/` would break GitHub Pages project sites, which serve
from `https://user.github.io/repo-name/`.

### Themes

`theme` keys are mapped to Hebrew labels in three places that must stay in sync:
`bot/themes.js` (detection), `assets/app.js` (chips), `build.js` (deal pages).
An unrecognised key is not an error — the deal still appears in the unfiltered
grid, it just gets no chip, which beats printing a raw English key into a Hebrew
interface.

## SEO

Setup and ongoing work live in **[SEO.md](SEO.md)**. What the code does:

- **Static page per deal** (`deal/<id>.html`): own `<title>`, description, Open
  Graph `product` tags, `Product` + `BreadcrumbList` JSON-LD, and a
  related-deals block linking four other deal pages.
- **Static page per theme** (`theme/<key>.html`): "הארי פוטר - אבני בנייה
  תואמות מאליאקספרס" and so on — the long-tail landing pages. Lists every deal
  in the theme as a card linking to its deal page, with `ItemList` JSON-LD.
  Only themes that have deals get a page.
- **Static copy pages** `guide.html` and `how-it-works.html`: the catalog is
  client-rendered, so these are most of the prose a crawler gets. The home
  page links both (teaser box + footer).
- `archive.html` and the theme chip rows link everything in plain HTML, so
  crawlers reach every page without JavaScript or the sitemap.
- `sitemap.xml` lists home, archive, the static pages, every theme page and
  every deal page. Static pages are enumerated in `STATIC_PAGES` in `build.js`.

**Copy rule:** the original brand's trademark never appears in site copy
outside the footer disclaimer and the "לפני שקונים" note. The vocabulary is
"אבני בנייה תואמות" / "סטים תואמים" / "המותג המקורי". This costs some keyword
match against what people actually type — see SEO.md — and is deliberate.

Cards on the home page link straight to AliExpress (they must — that's the
affiliate click). Deal pages are reached through theme pages, related-deal
blocks, the archive and the sitemap — not by clicking a card.

Re-run `node build.js` whenever `deals.json` changes; the deploy timer does
this automatically. **Results take months, not weeks.**

## Price freshness

Two independent mechanisms, so a stall in one stays visible:

1. `bot/refresh-deals.js` re-checks the oldest-checked deals nightly.
2. Every card shows **עודכן ב־[date]**; anything unchecked for 14+ days is dimmed
   and its date turns red, and the footer shows the newest check date. If the
   refresh job dies, the grid visibly greys out rather than serving stale prices.

## The `bot/` directory

Drop-ins for `netanelyan/brickdeal-automation`, written against the brief rather
than the actual source — integration points are marked, and `backfill-deals.js`
needs its store parsing checked against the real `store.json` (run `--dry` first).

| File | Goes to | Purpose |
|---|---|---|
| `themes.js` | `src/themes.js` | Hebrew keyword → theme. No LLM call. |
| `deals.js` | `src/deals.js` | `recordDeal(product)` — append-or-update, atomic write. |
| `backfill-deals.js` | `scripts/backfill-deals.js` | One-off seed from `store.json`. |
| `refresh-deals.js` | `scripts/refresh-deals.js` | Nightly price re-check. |
| `publish-deals.sh` | `scripts/publish-deals.sh` | Hourly push + `node build.js`. |

Wire-up is one line in the drip-post path, after a deal is confirmed posted:

```js
import { recordDeal } from './deals.js';
await recordDeal(product);
```

Nothing else changes — ingestion, dedupe, approval and drip are untouched, so
`pm2 restart brickdeal` behaves exactly as before.

### Cron

```
17 3 * * *  cd ~/brickdeal-automation && /usr/bin/node scripts/refresh-deals.js >> logs/refresh.log 2>&1
43 * * * *  cd ~/brickdeal-automation && ./scripts/publish-deals.sh >> logs/publish.log 2>&1
```

### Secrets

In the bot repo's `.env`, never committed:

```
SITE_REPO=netanelyan/brickdeal-site
SITE_TOKEN=github_pat_...      # fine-grained PAT, Contents: read+write, this repo only
SITE_BASE=https://brickdeal.co.il
```

## Deploying

Push to the public repo, then Settings → Pages → Deploy from branch → `main` / root.
If the domain isn't `brickdeal.co.il`, pass `--base` to `build.js` and update the
canonical/`og:url` in `index.html` and the URL in `robots.txt`.
