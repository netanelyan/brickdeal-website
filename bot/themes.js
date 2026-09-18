/**
 * Theme detection from the AI-polished Hebrew name.
 *
 * Names are structured "<series> | <product>" — "מלחמת הכוכבים | ספינת X-Wing
 * אדומה" — so the series is read straight off the prefix and matched against
 * the theme labels first. Keyword matching over the whole name is the fallback
 * for a prefix that is not a known theme and for legacy names with no pipe.
 * No LLM call per deal. Ambiguous names get no theme and simply appear in the
 * unfiltered list, which is the correct failure mode: a wrong theme is worse
 * than a missing one because it hides the deal from the filter it belongs to.
 *
 * Drop in at: src/themes.js
 */

// Separator between the series and the product in a structured name.
export const NAME_SEP = ' | ';

// The site-facing label for each theme, plus the short forms the bot tends to
// use as a series prefix. Keep in sync with THEME_LABELS in assets/app.js.
const LABELS = {
  'star-wars':    ['מלחמת הכוכבים', 'סטאר וורס'],
  'harry-potter': ['הארי פוטר'],
  'superheroes':  ['גיבורי על', 'גיבורי-על', 'מארוול', 'די סי'],
  'minecraft':    ['מיינקראפט'],
  'pokemon':      ['פוקימון'],
  'anime':        ['אנימה'],
  'ninjago':      ['נינג׳גו'],
  'disney':       ['דיסני'],
  'technic':      ['טכניק', 'טכני'],
  'architecture': ['ארכיטקטורה', 'אדריכלות'],
  'trains':       ['רכבות'],
  'boats':        ['ספינות'],
  'space':        ['חלל'],
  'military':     ['צבאי'],
  'dinosaurs':    ['דינוזאורים'],
  'castle':       ['טירות ואבירים', 'טירות', 'אבירים'],
  'fantasy':      ['פנטזיה'],
  'vehicles':     ['רכבים', 'מכוניות'],
  'flowers':      ['פרחים וצמחים', 'פרחים', 'צמחים', 'בוטני'],
  'friends':      ['חברות'],
  'city':         ['עיר'],
  'duplo':        ['לפעוטות', 'פעוטות'],
  'creator':      ['קריאייטור'],
};

// Order matters: the first theme with a keyword hit wins, so put the specific
// franchises above the generic categories they'd otherwise be swallowed by
// (e.g. an X-Wing is star-wars, not space; a Batmobile is dc, not cars).
const THEMES = [
  ['star-wars',    ['מלחמת הכוכבים', 'סטאר וורס', 'סטار', 'טיי פייטר', 'אקס ווינג', 'מילניום', 'פאלקון', 'דארת', 'ווידר', 'יודה', 'מנדלוריאן', 'סטורמטרופר', 'חרב אור', 'ג׳דיי', 'גדיי', 'קלון']],
  ['harry-potter', ['הארי פוטר', 'הוגוורטס', 'הוגוארטס', 'וולדמורט', 'הרמיוני', 'דמבלדור', 'קוידיץ', 'קווידיץ', 'הוגסמיד', 'תלתן']],
  ['superheroes',  ['מארוול', 'מרוול', 'ספיידרמן', 'איש העכביש', 'אוונג׳רס', 'אוונג', 'איירון מן', 'איש הברזל', 'הענק הירוק', 'האלק', 'ת׳ור', 'קפטן אמריקה', 'ונום', 'גרוט', 'גיבור',
                    'באטמן', 'סופרמן', 'וונדר וומן', 'ג׳וקר', 'הג׳וקר', 'באטמוביל', 'גות׳אם', 'גותאם', 'אקווהמן', 'פלאש', 'גיבורי על']],
  ['minecraft',    ['מיינקראפט', 'מיינקרפט', 'קריפר', 'סטיב ואלכס']],
  ['pokemon',      ['פוקימון', 'פיקאצ׳ו', 'פיקאצו', 'צ׳ריזארד']],
  ['anime',        ['אנימה', 'נארוטו', 'דרגון בול', 'וואן פיס', 'גונדם', 'סיילור מון']],
  ['ninjago',      ['נינג׳גו', 'נינגגו', 'נינג׳ה', 'נינגה', 'דרקון נינ']],
  ['disney',       ['דיסני', 'מיקי מאוס', 'פרוזן', 'אלזה', 'נסיכות', 'ארמון הנסיכות', 'ווינטר', 'סטיץ', 'טוי סטורי']],
  ['technic',      ['טכניק', 'טכני', 'מנוע', 'שלט רחוק', 'גיר', 'מלגזה', 'מנוף', 'טרקטור', 'באגי', 'שנאי', 'הידראול']],
  ['architecture', ['ארכיטקטורה', 'אדריכלות', 'מגדל אייפל', 'טאג׳ מאהל', 'טאג מאהל', 'קולוסאום', 'קו רקיע', 'בית לבן', 'פסל החירות', 'נוטרדאם', 'ביג בן']],
  ['trains',       ['רכבת', 'רכבות', 'קטר', 'מסילה', 'תחנת רכבת']],
  ['boats',        ['ספינה', 'ספינת', 'אונייה', 'אוניית', 'פיראט', 'סירה', 'מפרשית', 'טיטאניק', 'נמל']],
  ['space',        ['חללית', 'חלל', 'נאס״א', 'נאסא', 'אפולו', 'רקטה', 'טיל חלל', 'אסטרונאוט', 'מאדים', 'ירח', 'מעבורת']],
  ['military',     ['טנק', 'צבאי', 'חייל', 'מסוק קרב', 'נגמ״ש', 'נגמש', 'מטוס קרב', 'צוללת', 'רובה']],
  ['dinosaurs',    ['דינוזאור', 'דינוזאורים', 'טי רקס', 'טירנוזאורוס', 'רפטור', 'פארק היורה', 'עולם היורה', 'טרודון', 'ברכיוזאורוס']],
  ['castle',       ['טירה', 'טירת', 'אביר', 'אבירים', 'ימי הביניים', 'מבצר', 'קסטל']],
  ['fantasy',      ['דרקון', 'קוסם', 'קסם', 'אלף', 'גמד', 'שר הטבעות', 'הוביט', 'משחקי הכס', 'חד קרן', 'פיה', 'מכשפה']],
  ['vehicles',     ['מכונית', 'מכוניות', 'רכב', 'פורשה', 'פרארי', 'למבורגיני', 'בוגאטי', 'מוסטנג', 'ג׳יפ', 'ג׳יפים', 'אופנוע', 'מרוץ', 'מרוצ', 'פורמולה', 'משאית', 'קורבט', 'מרצדס', 'ב.מ.וו', 'במוו', 'מכונית הזמן']],
  ['flowers',      ['פרח', 'פרחים', 'זר ', 'בונסאי', 'סחלב', 'ורדים', 'צמח', 'עציץ', 'קקטוס', 'חמנייה', 'חמניות', 'עץ ']],
  ['friends',      ['חברות', 'פרנדס', 'סלון יופי', 'בית קפה', 'חנות', 'קניון', 'מספרה', 'ספא']],
  ['city',         ['עיר', 'תחנת משטרה', 'משטרה', 'מכבי אש', 'כבאית', 'אמבולנס', 'בית חולים', 'בניין', 'שדה תעופה', 'תחנת דלק', 'אוטובוס']],
  ['duplo',        ['פעוטות', 'לפעוט', 'גיל הרך', 'קוביות גדולות', 'דופלו']],
  ['creator',      ['קריאייטור', 'קריאטור', 'שלושה באחד', '3 באחד']],
];

// Longest keyword first inside each theme so "מטוס קרב" beats a bare "מטוס".
for (const [, words] of THEMES) words.sort((a, b) => b.length - a.length);

/** Normalize Hebrew for matching: strip niqqud and unify apostrophe variants. */
function fold(s) {
  return String(s || '')
    .replace(/[֑-ׇ]/g, '')
    .replace(/['`׳’]/g, '׳')  // geresh variants
    .replace(/["״“”]/g, '״')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

const LABEL_TO_KEY = new Map();
for (const [key, labels] of Object.entries(LABELS)) {
  for (const l of labels) LABEL_TO_KEY.set(fold(l), key);
}

/**
 * Split a structured name into its series and product. Legacy names without a
 * separator come back with series = undefined and the whole name as the product.
 * @param {string} name
 * @returns {{ series: string|undefined, product: string }}
 */
export function splitName(name) {
  const full = String(name || '').replace(/\s+/g, ' ').trim();
  const m = full.match(/^(.+?)\s*\|\s*(.+)$/);
  if (!m) return { series: undefined, product: full };
  return { series: m[1].trim(), product: m[2].trim() };
}

function keywordTheme(hay) {
  for (const [key, words] of THEMES) {
    for (const w of words) {
      if (hay.includes(fold(w))) return key;
    }
  }
  return undefined;
}

/**
 * @param {string} name Hebrew product name, "<series> | <product>" or legacy
 * @returns {string|undefined} theme key, or undefined when nothing matches
 */
export function detectTheme(name) {
  const { series } = splitName(name);

  // The series prefix is the bot telling us the theme outright: exact label
  // first, then keywords over the prefix alone so "מלחמת הכוכבים: הקלאסיקה"
  // still lands. Only the prefix is trusted at this stage — the product half
  // can mention a Batmobile inside a Technic set.
  if (series) {
    const s = fold(series);
    const exact = LABEL_TO_KEY.get(s);
    if (exact) return exact;
    const byWord = keywordTheme(s);
    if (byWord) return byWord;
  }

  const hay = fold(name);
  return hay ? keywordTheme(hay) : undefined;
}

export const THEME_KEYS = THEMES.map(([k]) => k);
