# Handoff #2: BrickDeal site — fix data loading, then improve

The site shell is built and the brand carries over well. RTL is clean, the disclosure section is honest and clear. Two problems: **it shows no deals**, and the page has nothing to hold a visitor who arrives from Instagram.

Work in this order. Do not start on polish until data loads.

---

## Priority 1 — The site cannot load `deals.json`

The page renders "לא הצלחנו לטעון את הדילים כרגע". Diagnose before changing code. Open DevTools → Network, reload, find the `deals.json` request:

- **404** — most likely cause. GitHub Pages project sites serve from `https://username.github.io/repo-name/`, so `fetch('/deals.json')` resolves to the domain root and misses. Use a relative path: `fetch('./deals.json')`. Verify by loading `<site-url>/deals.json` directly in the browser.
- **200 but still errors** — malformed JSON, or the shape does not match the render code (bare array vs `{ "deals": [...] }`). Console shows the parse error.
- **CORS failure** — the page is fetching cross-origin (raw.githubusercontent.com, or the private repo). Serve `deals.json` from the same repo as the site.
- **No request fired** — fetch never ran, or the page is being opened over `file://`.

**Then check whether the file exists at all.** Handoff #1 specified a bot-side export plus a backfill of the existing archive. If that was not completed, the site is working correctly and there is simply no data. In that case, finish Part A first: append every posted deal to `deals.json`, backfill from the existing history, and publish it to the public repo.

A `deals.sample.json` fixture is provided alongside this brief. Use it to verify rendering independently of the export. It contains real product data but **placeholder affiliate links** — never deploy it.

### Also fix the failure state itself

Right now a failed load produces a single red line and an otherwise empty page. Replace with:
- Skeleton cards while loading, not a blank gap.
- On failure: a clear message plus a "נסו שוב" button that retries, and the Telegram CTA so a visitor still has somewhere to go.
- An empty search result is not an error. "לא נמצאו דילים. נסו חיפוש אחר" with a button to clear filters.

---

## Priority 2 — The page gives a visitor nothing above the fold

Currently: a small logo, a tagline, a heading, a search box, and then a large empty region. Someone arriving from an Instagram ad sees no product, no prices, no reason to stay. The whole value proposition is invisible until they type something.

**Lead with deals, not with a search box.** Search is for people who know what they want; most arrivals do not.

- Show a grid of deals immediately on load, newest first.
- Put the deal count in the heading: "247 דילים" is proof the catalog is real.
- Add browsable theme chips below the search bar so people can explore without typing: הארי פוטר · סטאר וורס · טכניק · פרחים · דינוזאורים · רכבים. These are derived from the `theme` field.
- The "סינון ומיון" control appears collapsed and empty. Either show sort options inline (חדשים · הזול ביותר · הכי הרבה חלקים) or remove the control until it does something.

---

## Priority 3 — Card design

The price is the brand's signature element. It works on Instagram and in the Telegram cards because a large amber number dominates a dark, uncluttered frame. Carry that through:

- Product image on `#17181C`, generous padding.
- Price large, `#F5B41E`, the loudest thing on the card.
- Hebrew name below, `#F5F2EE`, two lines maximum with ellipsis.
- Piece count and set number small, in `#9A9A92`. Omit the row entirely when absent — never render an empty label.
- Whole card is one `<a href>` to the affiliate link, `target="_blank"`, `rel="noopener sponsored"`.
- Lazy-load images. AliExpress CDN images are large and there will be hundreds.

Keep everything except the price quiet. Resist adding badges, ribbons, or gradients.

---

## Priority 4 — SEO needs a structural decision

A single page that renders everything client-side will index poorly, which undermines the "לגו סיני" search goal from Handoff #1. Google may see an empty shell.

Recommended: **generate a static page per deal at build time** from `deals.json` (a small Node script, committed output, no framework needed). Each page gets its own title, description, image, and `Product` JSON-LD. The main page stays the client-side searchable index.

If you disagree, say why and propose an alternative before building. Either way:
- Real `<a href>` links throughout, never JS-only click handlers.
- `sitemap.xml`, `robots.txt`.
- Open Graph tags — links get shared in WhatsApp and Telegram constantly, and a bare preview wastes the share.

---

## Priority 5 — Performance and housekeeping

- Paginate or infinite-scroll past ~50 cards. Do not render hundreds at once on a phone.
- Reflect search, theme, and sort in the URL query string so results can be shared and the back button works.
- Confirm the layout holds on a 360px-wide phone. Most traffic is mobile from Instagram.
- `prefers-reduced-motion` respected, visible keyboard focus.

---

## Keep as-is

The footer disclosure and the "לפני שקונים" section are well written and honest. Do not water them down. Keep the affiliate disclosure, the 2-4 week shipping expectation, and the LEGO trademark note.

The Telegram CTA band is good. Make it sticky or repeat it once mid-grid — the site's job is both outbound affiliate clicks and channel subscribers.

---

## Acceptance criteria

1. Deals render on load with no interaction required.
2. Deal count is visible.
3. Theme chips filter the grid.
4. Search returns correct results as you type; empty results show a helpful state, not an error.
5. Failed load shows skeletons then a retry button, never a bare red line.
6. Missing `setId` / `pieces` / `stars` degrade cleanly — no "undefined", no empty rows.
7. Works on a 360px phone.
8. Every card links to the correct AliExpress product through the affiliate link.
9. `pm2 restart brickdeal` still works; the Telegram pipeline is untouched.

## Before you build

Report what the Network tab showed for `deals.json`, whether the export from Handoff #1 was actually completed, and your decision on the SEO question. Then build.
