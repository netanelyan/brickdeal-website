# SEO — getting BrickDeal to show up for "aliexpress lego"

The goal: when someone in Israel searches **לגו אליאקספרס**, **לגו סיני**,
**aliexpress lego** or **לגו זול**, BrickDeal is on the first page.

One constraint shapes everything below: **the trademarked brand name does not
appear in site copy** (only in the footer disclaimer). So the site cannot
literally say the word people type. It ranks by being the obvious answer to
the *question* — "compatible building-brick sets from AliExpress, in Hebrew,
in shekels" — and by other sites linking to it with the words we don't use.
Google matches on meaning far more than it used to, and the disclaimer plus
"תואם" / "אבני בנייה תואמות" give it the association. But expect this to be
slower and harder than it would be otherwise. Links matter even more.

This file is in two halves. The first is a one-time setup you do by hand, in
roughly an hour. The second is what moves the needle afterwards — which is
mostly links and patience, not code.

Be honest with yourself about the timeline: a new domain takes **weeks to get
indexed and months to rank**. Nothing here is a switch you flip.

---

## Part 1 — one-time setup

### 0. Confirm the site is live and consistent

Everything below assumes `https://brickdealil.com` is the one and only address.
From any machine:

```bash
curl -sI https://brickdealil.com/ | head -5             # 200, text/html
curl -sI https://www.brickdealil.com/ | grep -i location  # 301 → https://brickdealil.com/
curl -sI http://brickdealil.com/ | grep -i location       # 301 → https://
curl -s https://brickdealil.com/robots.txt                # Allow: / + Sitemap line
curl -s https://brickdealil.com/sitemap.xml | head        # real deal URLs, not just the stub
curl -s https://brickdealil.com/deals.json | head -c 300  # the live feed, no placeholder ids
```

If the sitemap only lists the home page, the build timer has not run against a
real feed yet — see `deploy/README.md`. Do not continue until the sitemap has
deal and theme URLs in it; there is no point asking Google to crawl an empty site.

Also make sure the hand-written pages made it to the web root (the build
timer does not copy them):

```bash
curl -sI https://brickdealil.com/guide.html | head -1          # 200
curl -sI https://brickdealil.com/how-it-works.html | head -1   # 200
```

### 1. Google Search Console (GSC)

This is the only tool that tells you what Google actually sees. Free.

1. Go to <https://search.google.com/search-console> and sign in with the
   Google account that should own the site.
2. **Add property → Domain** (the left option, not "URL prefix"). Enter
   `brickdealil.com`. A Domain property covers http/https and www/apex in one
   go, so the redirects above never split your data.
3. Google shows a TXT record. Add it at your DNS provider — wherever the
   `brickdealil.com` A record lives (the registrar, or Cloudflare if you moved
   DNS there):

   ```
   Type: TXT   Name: @ (or brickdealil.com)   Value: google-site-verification=XXXXXXXX
   ```

   Click **Verify**. DNS can take a few minutes to a few hours to propagate;
   if it fails, wait and retry — do not re-add the record.

   *Fallback:* if you can't touch DNS, add a **URL-prefix** property for
   `https://brickdealil.com/` instead and pick the **HTML tag** method. Paste
   the tag into `index.html` where the comment in `<head>` says to, copy
   `index.html` to the web root, then verify.

4. Once verified: **Sitemaps** (left menu) → enter `sitemap.xml` → **Submit**.
   Status should become "Success" within a day. If it says "Couldn't fetch",
   check `curl -s https://brickdealil.com/sitemap.xml` returns valid XML.

5. **URL Inspection** (top search bar): paste `https://brickdealil.com/`,
   wait for the report, click **Request indexing**. Do the same for
   `https://brickdealil.com/guide.html`, `https://brickdealil.com/how-it-works.html`
   and two or three theme pages
   (`https://brickdealil.com/theme/harry-potter.html` etc.). This is a nudge,
   not a guarantee, and there is a daily quota — a handful is enough.

6. Come back in **a week**. Look at:
   - **Pages** (under Indexing): how many URLs are indexed vs. "Discovered –
     currently not indexed". The second bucket is normal for a new site and
     shrinks over weeks.
   - **Performance**: queries that already show impressions. Filter by query
     containing `לגו` and `aliexpress`.
   - **Enhancements / Shopping**: Product snippets and Breadcrumbs should show
     valid items and zero errors. If there are errors, the Rich Results Test
     below tells you which field.

### 2. Bing Webmaster Tools

Bing powers DuckDuckGo and a share of Windows search. Ten minutes:

1. <https://www.bing.com/webmasters> → sign in → **Import from Google Search
   Console**. It copies the verification and the sitemap.
2. That's it. Check back in a month.

### 3. Sanity-check what crawlers see

Run each once now, and again whenever `build.js`, `index.html`, `guide.html`
or `how-it-works.html` changes:

| Check | Where | What "good" looks like |
|---|---|---|
| Rich results | <https://search.google.com/test/rich-results> — paste a deal URL | `Product` detected, no errors; `Breadcrumbs` detected. Warnings about missing `review`/`brand` are fine. |
| Rich results | same tool — paste `https://brickdealil.com/` | `Organization` and `Sitelinks searchbox` detected |
| Mobile speed | <https://pagespeed.web.dev> — home page and a deal page | Performance ≥ 80 on mobile. The home page loads fonts and a feed; that's the floor, not a target. |
| Rendered HTML | GSC → URL Inspection → **View crawled page** on `/` | The hero, the guide teaser and the "לפני שקונים" note are present. The deal grid may or may not be — Google renders JavaScript on a second pass, hours to days later. |
| Link preview | <https://www.opengraph.xyz> or paste a URL into a Telegram chat | Title, description and image show. Deal pages show the product image. |

### 4. Point the socials at the site

Each of these is a link Google counts, and they're the only ones you fully control:

- **Telegram channel**: put `brickdealil.com` in the channel description and in
  a pinned post. When the bot posts a deal, its message should include the
  deal-page URL (`https://brickdealil.com/deal/<productId>.html`) alongside the
  affiliate link — that is one new inbound link per deal, forever.
- **Instagram bio** and **TikTok bio**: the site URL. In every post/video
  caption, mention the site by name (captions aren't links, but brand searches
  for "brickdeal" tell Google the name means something).
- If you make YouTube videos, put the theme page or deal page URL in the
  description.

---

## Part 2 — what actually moves the ranking

Google's decision for "לגו אליאקספרס" comes down to three things. In order of
weight:

### 1. Links from other sites

This is the whole game for a new domain. The site's pages are fine; nobody
links to them yet. Ideas that fit BrickDeal, roughly in order of effort:

- **Israeli LEGO communities.** Facebook groups (לגו ישראל, קונים בסין,
  אליאקספרס ישראל and the like), the Israeli LEGO user group, Reddit threads
  asking whether the AliExpress sets are any good. Answer the actual question
  and link to `guide.html`, the relevant theme page or `how-it-works.html`,
  not to the home page. Other people writing the brand name next to your link
  is exactly the association the site itself can't create.
  One useful reply per week beats ten spammy ones.
- **Deal-sharing sites and forums** (Zap forums, HWzone, Tapuz-style boards):
  post a specific deal with its deal-page URL when it is genuinely good.
- **Israeli LEGO YouTubers / TikTokers / bloggers**: a short message offering
  the site as a resource. Some will link, most won't; the ones that do are
  worth more than everything above combined.
- **Your own other properties**: the BlackZ network footer badge already links
  out — make sure the network links back.

What not to do: buy links, exchange links in bulk, post the URL in unrelated
groups. It doesn't work in 2026 and can get the domain flagged.

### 2. Content that matches what people mean

Already in place (nothing to do unless you change copy):

- Home page title/H1/description say **אבני בנייה תואמות**, **אליאקספרס**,
  **AliExpress**. Both scripts matter: Israelis type "aliexpress" in Latin
  letters as often as in Hebrew.
- **`guide.html`** is the first-time-buyer page: what "compatible" means,
  quality, shipping, customs, finding a set by number, MOC. It's the page most
  likely to rank for question-shaped searches, and the one to link to from
  forums. The home page carries a teaser box that links to it.
- **Theme pages** (`theme/<key>.html`) are the long-tail: "הארי פוטר
  אליאקספרס", "טכניק תואם זול". They're generated from the feed and exist for
  every theme that has at least one deal.
- **Deal pages** carry the set name, set number, price and pieces — which is
  what someone searching "76470 aliexpress" wants. Set numbers are the one
  exact-match keyword the site can use freely.
- `how-it-works.html` answers the trust questions ("is it a scam", "is it the
  real thing", "how do they make money") that people search before buying.

To add to it over time, write a static page in the style of
`how-it-works.html` and register it in `STATIC_PAGES` in `build.js` so the
sitemap lists it. Worthwhile topics, each of which is a real search:

- סטים תואמים מול המקור — the honest comparison (quality, price, legality)
- הסטים הכי שווים באליאקספרס לפי נושא (update quarterly)
- איך לבדוק מוכר באליאקספרס לפני שקונים סט
- MOC מומלצים: Mould King / CaDA / Reobrix — מה ההבדל

Keep every page honest about "compatible, not the original". It is a legal
necessity and, as it happens, what searchers want to know. And keep the
trademark out of the copy — the rule above applies to new pages too.

### 3. The site keeping working

Google re-crawls and quietly demotes sites that decay. The build timer and the
nightly price refresh are doing this work for you; watch that they keep
running (`deploy/README.md`). In GSC, glance at **Pages** monthly for a spike
in "Not found (404)" — that means deal pages disappeared without the sitemap
updating, i.e. the build broke.

---

## Things to know

**Hebrew site, English query.** The site is Hebrew with prices in shekels. It
can rank in Israel for "aliexpress lego" typed in English — "AliExpress" is on
the page in Latin letters for that reason — but it will not rank in the US or
UK for the same query, and it shouldn't try: those visitors can't use shekel
prices or Israeli shipping. If you ever want English traffic, that's a separate
English version with `hreflang` tags, not a tweak.

**Don't block `deals.json` in `robots.txt`.** It looks like something to hide
from crawlers. It isn't: Google renders the home page with JavaScript, and the
grid only appears if it can fetch the feed. Blocking it turns the home page
into an empty shell in Google's eyes.

**The `aggregateRating` on deal pages** uses the AliExpress star rating with
`ratingCount: 1`, because the feed doesn't carry the real review count. Google
may ignore it or flag it as a warning; it will not hurt the page. If the bot
ever exports the review count, put it in `ratingCount` and this becomes a real
rich result.

**The customs claim** on `guide.html` and `how-it-works.html` ("orders up to
$75 are tax-free") reflects the rule at time of writing. Check it against
the tax authority once in a while; if it changes, both pages need editing.

**Three pages are hand-written, not generated.** `index.html`, `guide.html`
and `how-it-works.html` must be copied to the web root after editing —
`deploy/README.md` has the exact command. Forgetting this is the most likely
way for the live site to drift from the repo.

## Not done yet (ideas, in rough order of value)

1. **Deal-page URL in every Telegram post.** One line in the bot. Biggest
   single source of links available.
2. **Static "latest deals" block in `index.html`**, injected by `build.js`
   between marker comments, so the home page has real deals in its HTML before
   JavaScript runs. Needs `deploy/brickdeal-build.sh` to promote `index.html`
   too. Worth doing once traffic proves the site matters.
3. **A "details" link on home-page cards** to the deal page. Cards are a single
   `<a>` to AliExpress today; a second link needs the card restructured.
4. **Custom 404 page** via Caddy `handle_errors` — cosmetic, but a crawler
   hitting a bare 404 on a dead deal URL looks worse than a branded one.
5. **English version** with `hreflang`, only if there's a reason to want
   non-Israeli traffic.
