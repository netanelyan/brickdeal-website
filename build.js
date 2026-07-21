#!/usr/bin/env node
/**
 * Generates the crawlable half of the site from deals.json:
 *
 *   deal/<productId>.html   one static page per deal, own title/description/OG/JSON-LD
 *   archive.html            plain-HTML index linking every deal page
 *   sitemap.xml             every URL above
 *
 * The home page stays client-side and searchable; these pages exist so Google
 * has real HTML to index instead of an empty shell.
 *
 * Run:  node build.js                    (reads ./deals.json)
 *       node build.js --feed deals.sample.json --base https://brickdeal.co.il
 *
 * No dependencies, no framework. Commit the output.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const FEED = argOf('--feed', 'deals.json');
const BASE = argOf('--base', 'https://brickdeal.co.il').replace(/\/$/, '');
const OUT = argOf('--out', '.');

const TELEGRAM = 'https://t.me/+juxUyQ49on1mZGRk';
const LOGO = 'https://cdn.shopify.com/s/files/1/0707/4938/9043/files/logo12.png?v=1784028153';

const THEME_LABELS = {
  'harry-potter': 'הארי פוטר', 'star-wars': 'מלחמת הכוכבים', 'superheroes': 'גיבורי על',
  technic: 'טכניק', vehicles: 'רכבים', dinosaurs: 'דינוזאורים', flowers: 'פרחים וצמחים',
  fantasy: 'פנטזיה', space: 'חלל', pokemon: 'פוקימון', minecraft: 'מיינקראפט', anime: 'אנימה',
  city: 'עיר', friends: 'חברות', ninjago: 'נינג׳גו', disney: 'דיסני',
  architecture: 'ארכיטקטורה', trains: 'רכבות', boats: 'ספינות', castle: 'טירות ואבירים',
  military: 'צבאי', creator: 'קריאייטור', duplo: 'לפעוטות',
};

/** Escape for HTML text and double-quoted attributes. */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** JSON-LD goes inside <script>; the only sequence that can break out is "</". */
const jsonld = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

const money = (n) => (n % 1 === 0 ? String(n) : n.toFixed(2));

/** Product IDs become filenames — refuse anything that could escape the directory. */
const safeId = (id) => /^[A-Za-z0-9_-]{1,64}$/.test(String(id)) ? String(id) : null;

/* Set when the feed is the sample fixture. Every generated page then carries the
   same warning band as the index, so placeholder output can't be mistaken for
   the real site if it ever gets deployed by accident. */
let PLACEHOLDER_FEED = false;

const DEV_BANNER = '<div class="dev-banner">⚠ נתוני דוגמה — הקישורים אינם אמיתיים. אין להעלות גרסה זו לאוויר.</div>';

function shell({ title, description, canonical, ogImage, body, extraHead = '' }) {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="theme-color" content="#17181C">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BrickDeal">
<meta property="og:locale" content="he_IL">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage || LOGO)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${esc(LOGO)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900&display=swap">
<link rel="stylesheet" href="${esc(canonical.includes('/deal/') ? '../assets/styles.css' : 'assets/styles.css')}">
${extraHead}
</head>
<body>
${PLACEHOLDER_FEED ? DEV_BANNER : ''}
<header class="site-header">
  <div class="wrap site-header__inner">
    <a class="brand" href="${esc(canonical.includes('/deal/') ? '../' : './')}">
      <img class="brand__logo" src="${esc(LOGO)}" alt="BrickDeal" width="120" height="40">
    </a>
    <nav class="site-nav" aria-label="ניווט ראשי">
      <a class="site-nav__link" href="https://www.instagram.com/brickdealil/" rel="noopener">אינסטגרם</a>
      <a class="btn btn--tg" href="${TELEGRAM}" rel="noopener">ערוץ הטלגרם</a>
    </nav>
  </div>
</header>
<main><div class="wrap">
${body}
</div></main>
<aside class="cta">
  <div class="wrap cta__inner">
    <div>
      <p class="cta__title">דילים חדשים כל יום בטלגרם</p>
      <p class="cta__sub">אנחנו סורקים את אליאקספרס ושולחים רק את מה ששווה.</p>
    </div>
    <a class="btn btn--tg btn--lg" href="${TELEGRAM}" rel="noopener">הצטרפו לערוץ</a>
  </div>
</aside>
<footer class="site-footer">
  <div class="wrap">
    <p class="site-footer__links">
      <a href="${TELEGRAM}" rel="noopener">טלגרם</a>
      <a href="https://www.instagram.com/brickdealil/" rel="noopener">אינסטגרם</a>
      <a href="${esc(canonical.includes('/deal/') ? '../archive.html' : 'archive.html')}">ארכיון הדילים</a>
    </p>
    <p class="site-footer__disclosure">
      גילוי נאות: הקישורים באתר הם קישורי שותפים לאליאקספרס. אם תרכשו דרכם, נקבל עמלה מאליאקספרס.
      המחיר שאתם משלמים זהה — העמלה משולמת על ידי המוכר ולא על ידכם.
    </p>
    <p class="site-footer__disclosure">
      LEGO® הוא סימן מסחרי רשום של קבוצת LEGO, שאינה מקושרת לאתר זה ואינה מעורבת בו.
      המוצרים המוצגים הם אבני בנייה תואמות מיצרנים אחרים.
    </p>
  </div>
</footer>
</body>
</html>
`;
}

function dealPage(d, id) {
  const canonical = `${BASE}/deal/${id}.html`;
  const themeName = d.theme ? THEME_LABELS[d.theme] : null;

  // Trusted only when genuinely above the sale price — never derived.
  const was = Number(d.originalPrice) > Number(d.price) ? Number(d.originalPrice) : null;
  const discount = was ? Math.round((1 - d.price / was) * 100) : null;

  const specs = [];
  if (d.setId) specs.push(['מספר סט', d.setId]);
  if (d.pieces) specs.push(['מספר חלקים', new Intl.NumberFormat('en-US').format(d.pieces)]);
  if (d.stars) specs.push(['דירוג באליאקספרס', `${d.stars} מתוך 5`]);
  if (themeName) specs.push(['ערכת נושא', themeName]);
  if (d.priceCheckedAt) {
    specs.push(['המחיר נבדק', new Intl.DateTimeFormat('he-IL', {
      day: 'numeric', month: 'numeric', year: '2-digit',
    }).format(new Date(d.priceCheckedAt))]);
  }

  // Description leads with the facts a searcher scans for: price, pieces, set number.
  const descBits = [`${money(d.price)} ₪`];
  if (d.pieces) descBits.push(`${d.pieces} חלקים`);
  if (d.setId) descBits.push(`מק״ט ${d.setId}`);
  const description = `${d.name} — ${descBits.join(' · ')}. אבני בנייה תואמות מאליאקספרס, משלוח 2-4 שבועות. ${themeName ? themeName + '. ' : ''}`.trim();

  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: d.name,
    description,
    offers: {
      '@type': 'Offer',
      price: Number(d.price).toFixed(2),
      priceCurrency: d.currency || 'ILS',
      availability: 'https://schema.org/InStock',
      url: d.link,
    },
  };
  if (d.image) product.image = d.image;
  if (d.setId) product.sku = d.setId;
  if (d.productId) product.productID = String(d.productId);
  if (d.stars) {
    product.aggregateRating = {
      '@type': 'AggregateRating', ratingValue: d.stars, bestRating: 5, ratingCount: 1,
    };
  }

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דילים', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: d.name, item: canonical },
    ],
  };

  const body = `<nav class="breadcrumb" aria-label="מיקום"><a href="../">דילים</a> › ${esc(d.name)}</nav>

<article class="deal">
  <div class="deal__media">
    <img src="${esc(d.image || LOGO)}" alt="${esc(d.name)}" width="600" height="600" loading="eager" decoding="async">
  </div>
  <div>
    <h1 class="deal__title">${esc(d.name)}</h1>
    <div class="deal__price"><span class="card__amount">${esc(money(d.price))}</span><span class="card__currency">₪</span></div>
    ${was ? `<p class="deal__was"><span class="fcard__was">${esc(money(was))} ₪</span> <span class="fcard__save">${discount}% הנחה</span></p>` : ''}
    <p class="page-sub">המחיר באליאקספרס, כולל משלוח לישראל.</p>

    ${specs.length ? `<ul class="deal__specs">
      ${specs.map(([k, v]) => `<li><span>${esc(k)}</span><strong>${esc(v)}</strong></li>`).join('\n      ')}
    </ul>` : ''}

    <p><a class="btn btn--tg btn--lg" href="${esc(d.link)}" target="_blank" rel="noopener sponsored">לצפייה באליאקספרס</a></p>
    <p class="page-sub">זהו סט אבני בנייה <strong>תואם</strong>, לא מוצר LEGO® מקורי. משלוח 2-4 שבועות מסין.
    המחיר משתנה — המחיר המחייב הוא זה שמופיע בדף המוצר.</p>
  </div>
</article>`;

  return shell({
    title: `${d.name} – ${money(d.price)} ₪ | BrickDeal`,
    description,
    canonical,
    ogImage: d.image,
    body,
    extraHead: `<script type="application/ld+json">${jsonld(product)}</script>\n<script type="application/ld+json">${jsonld(breadcrumb)}</script>`,
  });
}

function archivePage(rows) {
  const body = `<h1 class="page-title">ארכיון הדילים</h1>
<p class="page-sub">כל ${rows.length} הדילים שפורסמו, מהחדש לישן. לחיפוש וסינון עברו <a href="./">לדף הראשי</a>.</p>
<ul class="archive__list">
${rows.map(({ d, id }) => `  <li><a href="deal/${esc(id)}.html"><span>${esc(d.name)}</span><span class="archive__price">${esc(money(d.price))} ₪</span></a></li>`).join('\n')}
</ul>`;

  return shell({
    title: `ארכיון הדילים – ${rows.length} סטים של אבני בנייה תואמות | BrickDeal`,
    description: `רשימת כל ${rows.length} הדילים על לגו סיני ואבני בנייה תואמות שפורסמו ב־BrickDeal.`,
    canonical: `${BASE}/archive.html`,
    body,
  });
}

function sitemap(rows) {
  const urls = [
    { loc: `${BASE}/`, freq: 'daily', pri: '1.0' },
    { loc: `${BASE}/archive.html`, freq: 'daily', pri: '0.8' },
    ...rows.map(({ d, id }) => ({
      loc: `${BASE}/deal/${id}.html`,
      freq: 'weekly',
      pri: '0.6',
      lastmod: d.priceCheckedAt ? String(d.priceCheckedAt).slice(0, 10) : null,
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${esc(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

function main() {
  if (!fs.existsSync(FEED)) {
    console.error(`build: ${FEED} not found.`);
    console.error('The bot export (Handoff #1 Part A) has to run first, or pass --feed deals.sample.json to preview.');
    process.exit(1);
  }

  const parsed = JSON.parse(fs.readFileSync(FEED, 'utf8'));
  const raw = Array.isArray(parsed) ? parsed : parsed.deals;
  if (!Array.isArray(raw)) {
    console.error(`build: ${FEED} must be an array or { deals: [...] }`);
    process.exit(1);
  }

  PLACEHOLDER_FEED = raw.some((d) => /placeholder|example\.invalid/i.test(String(d.link) + String(d.productId)));

  const skipped = [];
  const rows = [];

  for (const d of raw) {
    if (d.dead === true || d.available === false) { skipped.push(`${d.productId}: dead`); continue; }
    if (!d.name || !d.link || d.price == null) { skipped.push(`${d.productId}: missing name/link/price`); continue; }
    const id = safeId(d.productId);
    if (!id) { skipped.push(`${d.productId}: unusable id`); continue; }
    rows.push({ d, id });
  }

  rows.sort((a, b) => new Date(b.d.postedAt || 0) - new Date(a.d.postedAt || 0));

  const dealDir = path.join(OUT, 'deal');
  fs.mkdirSync(dealDir, { recursive: true });

  // Clear stale pages so a delisted deal doesn't linger as an orphan URL.
  for (const f of fs.readdirSync(dealDir)) {
    if (f.endsWith('.html')) fs.unlinkSync(path.join(dealDir, f));
  }

  for (const { d, id } of rows) {
    fs.writeFileSync(path.join(dealDir, `${id}.html`), dealPage(d, id), 'utf8');
  }

  fs.writeFileSync(path.join(OUT, 'archive.html'), archivePage(rows), 'utf8');
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap(rows), 'utf8');

  console.log(`build: ${rows.length} deal pages + archive.html + sitemap.xml → ${path.resolve(OUT)}`);
  if (skipped.length) {
    console.log(`build: skipped ${skipped.length}:`);
    skipped.forEach((s) => console.log(`  - ${s}`));
  }
  if (PLACEHOLDER_FEED) {
    console.warn('\nbuild: ⚠ feed contains PLACEHOLDER links — this output must not be deployed.');
    console.warn('build:   every generated page carries a visible warning band.');
  }
}

main();
