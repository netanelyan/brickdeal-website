/* BrickDeal catalog — static, client-side. No build step for the index.
   Feed contract: an array of deal records, or { deals: [...] }.
   Absent fields are omitted, never null. */

(function () {
  'use strict';

  /* Tried in order, all relative — a leading "/" breaks GitHub Pages project
     sites, which serve from https://user.github.io/repo/. The sample fixture is
     last so a checkout renders before the bot export has ever run. */
  var FEED_CANDIDATES = ['./deals.json', './data/deals.json'];

  var PAGE_SIZE = 24;
  var CTA_AFTER = 8;          // insert the Telegram band after this many cards
  var STALE_DAYS = 14;
  var STALE_MS = STALE_DAYS * 864e5;
  var MAX_CHIPS = 8;

  /* Keep in sync with bot/themes.js. An unknown key is not an error: the deal
     still shows in the unfiltered grid, it just gets no chip and no badge —
     better than printing a raw English key into a Hebrew interface. */
  var THEME_LABELS = {
    'harry-potter': 'הארי פוטר',
    'star-wars': 'מלחמת הכוכבים',
    'superheroes': 'גיבורי על',
    'technic': 'טכניק',
    'vehicles': 'רכבים',
    'dinosaurs': 'דינוזאורים',
    'flowers': 'פרחים וצמחים',
    'fantasy': 'פנטזיה',
    'space': 'חלל',
    'pokemon': 'פוקימון',
    'minecraft': 'מיינקראפט',
    'anime': 'אנימה',
    'city': 'עיר',
    'friends': 'חברות',
    'ninjago': 'נינג׳גו',
    'disney': 'דיסני',
    'architecture': 'ארכיטקטורה',
    'trains': 'רכבות',
    'boats': 'ספינות',
    'castle': 'טירות ואבירים',
    'military': 'צבאי',
    'creator': 'קריאייטור',
    'duplo': 'לפעוטות'
  };

  var PLACEHOLDER_IMG =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
      '<path fill="#F5F2EE" d="M8 20h32v20H8z"/>' +
      '<path fill="#F5F2EE" d="M14 14h6v6h-6zm14 0h6v6h-6z"/></svg>'
    );

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    q: $('q'), qClear: $('q-clear'),
    chips: $('chips'), sort: $('sort'),
    priceMin: $('price-min'), priceMax: $('price-max'),
    piecesMin: $('pieces-min'), piecesMax: $('pieces-max'),
    filters: $('filters'), filtersToggle: $('filters-toggle'), filtersCount: $('filters-count'),
    reset: $('reset'), emptyReset: $('empty-reset'),
    grid: $('grid'), count: $('count'), titleCount: $('title-count'),
    featured: $('featured'), heroCount: $('hero-count'), reroll: $('reroll'),
    empty: $('empty'), error: $('error'), errorTitle: $('error-title'), errorSub: $('error-sub'),
    retry: $('retry'), more: $('more'), freshness: $('freshness'), devBanner: $('dev-banner')
  };

  var allDeals = [];
  var visible = [];
  var shown = 0;
  var activeTheme = '';
  var activeSort = 'newest';

  var dateFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' });
  var numFmt = new Intl.NumberFormat('en-US');

  /* ---------- helpers ---------- */

  // Fold Hebrew text so "מק״ט" matches "מקט" and niqqud never blocks a match.
  function fold(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[֑-ׇ]/g, '')
      .replace(/['׳״"`\-–—_.,:;!?()\[\]{}\/\\|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : null;
  }

  function toTime(v) {
    if (!v) return null;
    var t = Date.parse(v);
    return isNaN(t) ? null : t;
  }

  function money(n) {
    return n % 1 === 0 ? numFmt.format(n) : n.toFixed(2);
  }

  function themeLabel(key) { return THEME_LABELS[key] || null; }

  /* ---------- data ---------- */

  /* "<series> | <product>" — see assets/name.js. Falls back to a no-op split
     when the script failed to load, so a missing file costs the eyebrow, not
     the grid. */
  function splitName(name) {
    if (typeof BrickDealName !== 'undefined') return BrickDealName.splitName(name);
    var s = String(name == null ? '' : name).trim();
    return { series: null, title: s, full: s };
  }

  function normalize(raw) {
    var price = num(raw.price);
    var parts = splitName(raw.name);
    var name = parts.full;
    if (!raw || !raw.link || price === null || !name) return null;

    var setId = raw.setId != null && String(raw.setId).trim() !== '' ? String(raw.setId).trim() : null;
    var pieces = num(raw.pieces);
    var stars = num(raw.stars);
    var theme = raw.theme || null;

    /* Only trusted when it is genuinely above the current price. A struck-through
       "original" is a price claim — it is never derived, inflated or guessed
       here; if the feed doesn't carry one, the card simply doesn't show one. */
    var was = num(raw.originalPrice);
    if (was === null || was <= price) was = null;

    return {
      productId: raw.productId != null ? String(raw.productId) : null,
      name: name,               // full structured name — what the channel calls it
      series: parts.series,     // theme prefix, null on legacy names
      title: parts.title,       // the product itself
      setId: setId,
      pieces: pieces !== null && pieces > 0 ? Math.round(pieces) : null,
      price: price,
      originalPrice: was,
      discount: was ? Math.round((1 - price / was) * 100) : null,
      featured: raw.featured === true,
      currency: raw.currency || 'ILS',
      stars: stars !== null && stars > 0 ? stars : null,
      image: raw.image || null,
      link: raw.link,
      theme: theme,
      postedAt: toTime(raw.postedAt),
      checkedAt: toTime(raw.priceCheckedAt) || toTime(raw.postedAt),
      haystack: fold(name + ' ' + (setId || '') + ' ' + (themeLabel(theme) || ''))
    };
  }

  function isDead(raw) { return raw.dead === true || raw.available === false; }

  function looksPlaceholder(list) {
    return list.some(function (d) {
      return /placeholder|example\.invalid/i.test(String(d.link || '') + String(d.productId || ''));
    });
  }

  // Walk the candidate paths; the first one that parses into a non-empty list wins.
  function load() {
    if (location.protocol === 'file:') {
      return Promise.reject({ kind: 'file' });
    }

    var attempts = [];

    function tryAt(i) {
      if (i >= FEED_CANDIDATES.length) {
        return Promise.reject({ kind: 'notfound', attempts: attempts });
      }
      var path = FEED_CANDIDATES[i];

      return fetch(path, { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function (text) {
          var json;
          try {
            json = JSON.parse(text);
          } catch (e) {
            // A 200 that isn't JSON is usually an SPA/404 HTML page being served.
            throw new Error('invalid JSON (' + e.message + ')');
          }
          var list = Array.isArray(json) ? json : (json && Array.isArray(json.deals) ? json.deals : null);
          if (!list) throw new Error('expected an array or { deals: [...] }');
          if (!list.length) throw new Error('feed is empty');
          return { path: path, list: list };
        })
        .catch(function (err) {
          attempts.push(path + ' → ' + err.message);
          return tryAt(i + 1);
        });
    }

    return tryAt(0).then(function (found) {
      console.info('BrickDeal: loaded feed from ' + found.path + ' (' + found.list.length + ' records)');
      if (looksPlaceholder(found.list)) {
        el.devBanner.hidden = false;
        console.warn('BrickDeal: feed contains PLACEHOLDER links — do not deploy this.');
      }
      var out = [];
      for (var i = 0; i < found.list.length; i++) {
        if (isDead(found.list[i])) continue;
        var d = normalize(found.list[i]);
        if (d) out.push(d);
      }
      if (!out.length) throw { kind: 'unusable' };

      /* Collapse duplicate listings of the same set — see assets/collapse.js.
         Applied here, at the one place the feed enters the app, so the grid, the
         theme chips, the hero, the "מציג N מתוך M" line and the heading count
         are all derived from the same collapsed list and cannot disagree. The
         feed itself keeps every listing; this is display-time only. */
      if (typeof BrickDealCollapse === 'undefined') {
        console.warn('BrickDeal: assets/collapse.js not loaded — showing every listing');
        return out;
      }
      var beforeCollapse = out.length;
      out = BrickDealCollapse.collapse(out);
      if (beforeCollapse !== out.length) {
        console.info(
          'BrickDeal: collapsed ' + (beforeCollapse - out.length) +
          ' duplicate listing(s) -> ' + out.length + ' sets'
        );
      }
      return out;
    });
  }

  /* ---------- URL state ---------- */

  function readState() {
    var p = new URLSearchParams(location.search);
    el.q.value = p.get('q') || '';
    el.priceMin.value = p.get('min') || '';
    el.priceMax.value = p.get('max') || '';
    el.piecesMin.value = p.get('pmin') || '';
    el.piecesMax.value = p.get('pmax') || '';
    activeTheme = p.get('theme') || '';
    activeSort = p.get('sort') || 'newest';
    syncSortButtons();
  }

  function writeState() {
    var p = new URLSearchParams();
    if (el.q.value.trim()) p.set('q', el.q.value.trim());
    if (el.priceMin.value.trim()) p.set('min', el.priceMin.value.trim());
    if (el.priceMax.value.trim()) p.set('max', el.priceMax.value.trim());
    if (el.piecesMin.value.trim()) p.set('pmin', el.piecesMin.value.trim());
    if (el.piecesMax.value.trim()) p.set('pmax', el.piecesMax.value.trim());
    if (activeTheme) p.set('theme', activeTheme);
    if (activeSort !== 'newest') p.set('sort', activeSort);
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function activeFilterCount() {
    var n = 0;
    ['priceMin', 'priceMax', 'piecesMin', 'piecesMax'].forEach(function (k) {
      if (el[k].value.trim()) n++;
    });
    return n;
  }

  function hasAnyFilter() {
    return !!(el.q.value.trim() || activeTheme || activeFilterCount());
  }

  /* ---------- chips ---------- */

  function syncSortButtons() {
    Array.prototype.forEach.call(el.sort.children, function (b) {
      var on = b.dataset.sort === activeSort;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function syncChips() {
    Array.prototype.forEach.call(el.chips.children, function (b) {
      var on = b.dataset.theme === activeTheme;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function buildChips() {
    var counts = {};
    allDeals.forEach(function (d) {
      if (d.theme && themeLabel(d.theme)) counts[d.theme] = (counts[d.theme] || 0) + 1;
    });

    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (!keys.length) return;                       // no themes yet — don't show an empty row

    keys = keys.slice(0, MAX_CHIPS);
    if (activeTheme && keys.indexOf(activeTheme) === -1 && counts[activeTheme]) {
      keys.push(activeTheme);                       // keep a deep-linked theme reachable
    }

    var frag = document.createDocumentFragment();
    frag.appendChild(chipEl('', 'הכול', allDeals.length));
    keys.forEach(function (k) { frag.appendChild(chipEl(k, themeLabel(k), counts[k])); });

    el.chips.appendChild(frag);
    el.chips.hidden = false;
    syncChips();
  }

  function chipEl(key, label, n) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.theme = key;
    b.setAttribute('aria-pressed', 'false');
    b.appendChild(document.createTextNode(label + ' '));
    var span = document.createElement('span');
    span.className = 'chip__n';
    span.textContent = n;
    b.appendChild(span);
    return b;
  }

  /* ---------- filter + sort ---------- */

  function apply() {
    var terms = fold(el.q.value).split(' ').filter(Boolean);
    var pMin = num(el.priceMin.value), pMax = num(el.priceMax.value);
    var cMin = num(el.piecesMin.value), cMax = num(el.piecesMax.value);

    visible = allDeals.filter(function (d) {
      if (pMin !== null && d.price < pMin) return false;
      if (pMax !== null && d.price > pMax) return false;
      // A deal with no piece count can't satisfy a piece-count filter — exclude
      // it rather than silently passing it through.
      if (cMin !== null && (d.pieces === null || d.pieces < cMin)) return false;
      if (cMax !== null && (d.pieces === null || d.pieces > cMax)) return false;
      if (activeTheme && d.theme !== activeTheme) return false;
      for (var i = 0; i < terms.length; i++) {
        if (d.haystack.indexOf(terms[i]) === -1) return false;
      }
      return true;
    });

    visible.sort(function (a, b) {
      if (activeSort === 'cheapest') return a.price - b.price;
      if (activeSort === 'pieces') return (b.pieces || 0) - (a.pieces || 0);
      return (b.postedAt || 0) - (a.postedAt || 0);
    });

    shown = 0;
    el.grid.textContent = '';
    render();
    writeState();

    var n = activeFilterCount();
    el.filtersCount.hidden = n === 0;
    el.filtersCount.textContent = String(n);
    el.qClear.hidden = !el.q.value;
    syncChips();
  }

  /* ---------- render ---------- */

  function metaItem(text, starred) {
    var s = document.createElement('span');
    s.className = 'card__meta-item';
    if (starred) {
      var star = document.createElement('span');
      star.className = 'card__star';
      star.textContent = '★';
      s.appendChild(star);
    }
    var bdi = document.createElement('bdi');
    bdi.textContent = text;
    s.appendChild(bdi);
    return s;
  }

  function priceEl(value, cls) {
    var wrap = document.createElement('div');
    wrap.className = cls;
    var amount = document.createElement('span');
    amount.className = 'card__amount';
    amount.textContent = money(value);
    var cur = document.createElement('span');
    cur.className = 'card__currency';
    cur.textContent = '₪';
    wrap.appendChild(amount);
    wrap.appendChild(cur);
    return wrap;
  }

  function buildCard(d, eager) {
    var stale = d.checkedAt !== null && (Date.now() - d.checkedAt) > STALE_MS;

    var a = document.createElement('a');
    a.className = 'card' + (stale ? ' card--stale' : '');
    a.href = d.link;
    a.rel = 'noopener sponsored';
    a.target = '_blank';

    var media = document.createElement('div');
    media.className = 'card__media';

    var img = document.createElement('img');
    img.className = 'card__img';
    img.src = d.image || PLACEHOLDER_IMG;
    img.alt = d.name;
    img.loading = eager ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.width = 400;
    img.height = 400;
    img.addEventListener('error', function () {
      img.src = PLACEHOLDER_IMG;
      img.classList.add('card__img--failed');
    }, { once: true });
    media.appendChild(img);
    a.appendChild(media);

    var body = document.createElement('div');
    body.className = 'card__body';

    body.appendChild(priceEl(d.price, 'card__price'));

    if (d.series) {
      var series = document.createElement('span');
      series.className = 'card__series';
      series.textContent = d.series;
      body.appendChild(series);
    }

    var h = document.createElement('h3');
    h.className = 'card__name';
    h.textContent = d.title;
    body.appendChild(h);

    // Omit the row entirely when there is nothing to put in it.
    var meta = document.createElement('p');
    meta.className = 'card__meta';
    if (d.pieces !== null) meta.appendChild(metaItem(numFmt.format(d.pieces) + ' חלקים'));
    if (d.setId) meta.appendChild(metaItem('מק״ט ' + d.setId));
    if (d.stars !== null) meta.appendChild(metaItem(d.stars.toFixed(1), true));
    if (meta.childNodes.length) body.appendChild(meta);

    if (d.checkedAt !== null) {
      var checked = document.createElement('span');
      checked.className = 'card__checked' + (stale ? ' card__checked--stale' : '');
      checked.textContent = 'עודכן ב־' + dateFmt.format(new Date(d.checkedAt));
      body.appendChild(checked);
    }

    a.appendChild(body);
    return a;
  }

  function ctaBand() {
    var box = document.createElement('div');
    box.className = 'grid-cta';
    var text = document.createElement('p');
    text.className = 'grid-cta__text';
    text.textContent = 'לא רוצים לפספס דיל?';
    var sub = document.createElement('span');
    sub.className = 'grid-cta__sub';
    sub.textContent = 'כל הדילים החדשים נשלחים לערוץ הטלגרם ברגע שהם עולים.';
    text.appendChild(document.createElement('br'));
    text.appendChild(sub);
    var link = document.createElement('a');
    link.className = 'btn btn--tg';
    link.href = 'https://t.me/+juxUyQ49on1mZGRk';
    link.rel = 'noopener';
    link.textContent = 'הצטרפו לערוץ';
    box.appendChild(text);
    box.appendChild(link);
    return box;
  }

  function render() {
    var slice = visible.slice(shown, shown + PAGE_SIZE);
    var frag = document.createDocumentFragment();

    for (var i = 0; i < slice.length; i++) {
      var absolute = shown + i;
      if (absolute === CTA_AFTER) frag.appendChild(ctaBand());
      frag.appendChild(buildCard(slice[i], shown === 0 && i < 4));
    }

    el.grid.appendChild(frag);
    shown += slice.length;

    el.grid.setAttribute('aria-busy', 'false');
    el.empty.hidden = visible.length > 0;
    el.more.hidden = shown >= visible.length;

    var remaining = visible.length - shown;
    el.more.textContent = remaining > 0
      ? 'הצגת ' + Math.min(remaining, PAGE_SIZE) + ' דילים נוספים'
      : 'הצגת דילים נוספים';

    el.count.textContent = visible.length
      ? 'מציג ' + shown + ' מתוך ' + visible.length + (visible.length === 1 ? ' דיל' : ' דילים')
      : '';

    injectStructuredData();
  }

  function skeletons(n) {
    el.grid.textContent = '';
    var frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var s = document.createElement('div');
      s.className = 'card card--skeleton';
      s.setAttribute('aria-hidden', 'true');
      frag.appendChild(s);
    }
    el.grid.appendChild(frag);
    el.grid.setAttribute('aria-busy', 'true');
  }

  function injectStructuredData() {
    var old = document.getElementById('deals-ld');
    if (old) old.remove();

    var items = visible.slice(0, shown).map(function (d, i) {
      var product = {
        '@type': 'Product',
        name: d.name,
        offers: {
          '@type': 'Offer',
          price: d.price.toFixed(2),
          priceCurrency: d.currency,
          availability: 'https://schema.org/InStock',
          url: d.link
        }
      };
      if (d.image) product.image = d.image;
      if (d.setId) product.sku = d.setId;
      if (d.productId) product.productID = d.productId;
      if (d.stars !== null) {
        product.aggregateRating = {
          '@type': 'AggregateRating', ratingValue: d.stars, bestRating: 5, ratingCount: 1
        };
      }
      return { '@type': 'ListItem', position: i + 1, item: product };
    });

    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.id = 'deals-ld';
    s.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: items
    });
    document.body.appendChild(s);
  }

  /* ---------- featured (hero) ---------- */

  /* Editorial picks win. Otherwise: build a pool of every deal with a GENUINE
     discount and draw from it at random, rather than taking the top N.

     Sorting by discount produced a hero that was effectively static and visually
     repetitive — the largest percentages clustered on one product type (three F1
     helmets at 71%, two of them the same listing at the same price), because
     near-identical listings of one popular set all carry near-identical
     discounts. Random sampling from the whole discounted pool surfaces the
     breadth of the catalogue instead, and re-draws per page load so the home
     page changes for repeat visitors.

     d.discount is non-null only when normalize() found a real originalPrice
     above the current price, so the pool can never contain an invented
     comparison. If it cannot fill n slots under the constraints below, we fall
     back to newest rather than relaxing them. */
  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {       // Fisher-Yates
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pickFeatured(n) {
    var flagged = allDeals.filter(function (d) { return d.featured; });
    if (flagged.length) return flagged.slice(0, n);

    var pool = shuffled(allDeals.filter(function (d) { return d.discount !== null; }));

    var picks = [];
    var usedSets = {};
    var usedThemes = {};

    for (var i = 0; i < pool.length && picks.length < n; i++) {
      var d = pool[i];

      /* Same set-level rule the grid collapses on. allDeals is already collapsed
         so this should never trigger, but the hero must not depend on that
         staying true — two cards for one set is exactly the repetition being
         fixed here. */
      if (d.setId && usedSets[d.setId]) continue;

      /* One deal per theme, so the row reads as three different kinds of thing.
         A deal with no theme is left unconstrained: an unknown theme is not
         evidence of a shared theme, and blocking on it would quietly shrink the
         pool and push us into the newest-fallback more often than warranted. */
      if (d.theme && usedThemes[d.theme]) continue;

      picks.push(d);
      if (d.setId) usedSets[d.setId] = true;
      if (d.theme) usedThemes[d.theme] = true;
    }

    if (picks.length === n) return picks;

    return allDeals.slice().sort(function (a, b) {
      return (b.postedAt || 0) - (a.postedAt || 0);
    }).slice(0, n);
  }

  function featuredCard(d) {
    var a = document.createElement('a');
    a.className = 'fcard';
    a.href = d.link;
    a.rel = 'noopener sponsored';
    a.target = '_blank';

    var media = document.createElement('div');
    media.className = 'fcard__media';
    var img = document.createElement('img');
    img.src = d.image || PLACEHOLDER_IMG;
    img.alt = d.name;
    img.loading = 'eager';
    img.decoding = 'async';
    img.width = 200;
    img.height = 200;
    img.addEventListener('error', function () { img.src = PLACEHOLDER_IMG; }, { once: true });
    media.appendChild(img);
    a.appendChild(media);

    var body = document.createElement('div');
    body.className = 'fcard__body';

    var prices = document.createElement('div');
    prices.className = 'fcard__prices';
    prices.appendChild(priceEl(d.price, 'fcard__now'));

    if (d.originalPrice !== null) {
      var was = document.createElement('span');
      was.className = 'fcard__was';
      was.textContent = money(d.originalPrice) + ' ₪';
      prices.appendChild(was);
    }

    if (d.discount !== null) {
      // "30% הנחה" rather than a signed "-30%", which reads ambiguously in RTL.
      var save = document.createElement('span');
      save.className = 'fcard__save';
      save.textContent = d.discount + '% הנחה';
      prices.appendChild(save);
    }
    body.appendChild(prices);

    if (d.series) {
      var series = document.createElement('span');
      series.className = 'fcard__series';
      series.textContent = d.series;
      body.appendChild(series);
    }

    var h = document.createElement('p');
    h.className = 'fcard__name';
    h.textContent = d.title;
    body.appendChild(h);

    a.appendChild(body);
    return a;
  }

  var featuredSig = '';

  function sigOf(picks) {
    return picks.map(function (d) { return d.productId; }).join(',');
  }

  function paintFeatured(picks) {
    el.featured.textContent = '';
    picks.forEach(function (d) { el.featured.appendChild(featuredCard(d)); });
    el.featured.hidden = false;
    featuredSig = sigOf(picks);
  }

  function renderFeatured() {
    var picks = pickFeatured(3);
    if (!picks.length) return;
    paintFeatured(picks);

    /* Offer the re-roll only when the pool can actually produce something else.
       Editorial picks are a fixed list by definition, and a pool of three has
       nothing left to draw — a button that visibly does nothing is worse than
       no button at all. */
    if (!el.reroll) return;
    var hasEditorial = allDeals.some(function (d) { return d.featured; });
    var poolSize = allDeals.filter(function (d) { return d.discount !== null; }).length;
    if (hasEditorial || poolSize <= 3) return;

    el.reroll.hidden = false;
    el.reroll.addEventListener('click', reroll);
  }

  /* Re-runs the same constrained draw and swaps the three cards in place. The
     whole pool is already in memory, so this is a re-render — no fetch, no
     reload, and the grid below is untouched.

     Retries a few times when the draw repeats the current trio: landing on the
     same three is a legitimate random outcome, but pressing "show me others"
     and getting no visible change reads as a broken button. Capped rather than
     looped forever, since with a small pool an identical draw may be the only
     option, and re-painting the same cards is harmless. */
  function reroll() {
    var picks = pickFeatured(3);
    for (var i = 0; i < 8 && sigOf(picks) === featuredSig; i++) picks = pickFeatured(3);
    if (!picks.length) return;

    paintFeatured(picks);

    el.reroll.classList.remove('is-spinning');
    void el.reroll.offsetWidth;   // force reflow so the animation replays
    el.reroll.classList.add('is-spinning');
  }

  function showFreshness() {
    var latest = allDeals.reduce(function (max, d) {
      return d.checkedAt && d.checkedAt > max ? d.checkedAt : max;
    }, 0);
    el.freshness.textContent = latest
      ? 'מחירים עודכנו לאחרונה ב־' + dateFmt.format(new Date(latest))
      : '';
  }

  function showError(err) {
    el.grid.textContent = '';
    el.grid.setAttribute('aria-busy', 'false');
    el.empty.hidden = true;
    el.more.hidden = true;
    el.count.textContent = '';
    el.error.hidden = false;

    if (err && err.kind === 'file') {
      el.errorTitle.textContent = 'הדף נפתח כקובץ מקומי.';
      el.errorSub.textContent = 'הדפדפן חוסם טעינת נתונים מ־file://. הפעילו שרת מקומי, למשל: python -m http.server';
      el.retry.hidden = true;
    } else {
      el.errorTitle.textContent = 'לא הצלחנו לטעון את הדילים.';
      el.errorSub.textContent = 'בדקו את החיבור לאינטרנט ונסו שוב.';
      el.retry.hidden = false;
    }

    if (err && err.attempts) console.error('BrickDeal: feed lookup failed —\n  ' + err.attempts.join('\n  '));
  }

  /* ---------- events ---------- */

  var debounceTimer;
  function debounced() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(apply, 120);
  }

  el.q.addEventListener('input', debounced);
  [el.priceMin, el.priceMax, el.piecesMin, el.piecesMax].forEach(function (i) {
    i.addEventListener('input', debounced);
  });

  el.sort.addEventListener('click', function (e) {
    var btn = e.target.closest('.segmented__btn');
    if (!btn) return;
    activeSort = btn.dataset.sort;
    syncSortButtons();
    apply();
  });

  el.chips.addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (!btn) return;
    // tapping the active chip clears it
    activeTheme = (btn.dataset.theme === activeTheme) ? '' : btn.dataset.theme;
    apply();
  });

  el.qClear.addEventListener('click', function () {
    el.q.value = '';
    el.q.focus();
    apply();
  });

  el.filtersToggle.addEventListener('click', function () {
    var open = el.filters.hidden;
    el.filters.hidden = !open;
    el.filtersToggle.setAttribute('aria-expanded', String(open));
  });

  function clearAll() {
    el.q.value = '';
    ['priceMin', 'priceMax', 'piecesMin', 'piecesMax'].forEach(function (k) { el[k].value = ''; });
    activeTheme = '';
    activeSort = 'newest';
    syncSortButtons();
    apply();
  }

  el.reset.addEventListener('click', clearAll);
  el.emptyReset.addEventListener('click', clearAll);

  el.more.addEventListener('click', function () {
    var first = shown;
    render();
    var cards = el.grid.querySelectorAll('a.card');
    if (cards[first]) cards[first].focus();
  });

  el.retry.addEventListener('click', boot);

  window.addEventListener('popstate', function () {
    readState();
    apply();
  });

  /* ---------- boot ---------- */

  function boot() {
    el.error.hidden = true;
    skeletons(8);
    readState();
    if (activeFilterCount() > 0) {
      el.filters.hidden = false;
      el.filtersToggle.setAttribute('aria-expanded', 'true');
    }

    load()
      .then(function (deals) {
        allDeals = deals;
        el.titleCount.textContent = numFmt.format(deals.length);
        el.heroCount.textContent = numFmt.format(deals.length) + ' דילים פעילים באתר.';
        el.chips.textContent = '';
        el.chips.hidden = true;
        buildChips();
        renderFeatured();
        showFreshness();
        apply();
      })
      .catch(showError);
  }

  boot();
})();
