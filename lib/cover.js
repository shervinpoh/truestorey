/**
 * The photograph at the top of an article: a real one, of the place the
 * article is about, with its credit attached.
 *
 * ── WHY THE STOCK PHOTOGRAPHS HAD TO GO ────────────────────────────────────
 * Shervin, 25 Sep: "the photos used are not nice". They were not, and could
 * not be. lib/photo.js searched Unsplash for objects: a crane for a BTO note,
 * an excavator for a land tender, keys for a lease. It was right never to
 * search a stock library for a street name, because a stock photograph cannot
 * show Marina Gardens Lane. So every piece about a real place got a picture of
 * somewhere else, or of nowhere, and three notes on one tender got three
 * interchangeable pictures of machinery.
 *
 * Wikimedia Commons holds photographs of Singapore that record where they were
 * taken, under licences that allow use with credit. Asked for what was
 * photographed within 700m of the Marina Gardens Lane site, it returns a July
 * 2026 photograph of the reclaimed land at Marina Gardens Drive and Central
 * Boulevard: the tender site's own surroundings, two months old.
 *
 * ── WHAT IT MAY SAY ABOUT THE PHOTOGRAPH ───────────────────────────────────
 * Only what the file says about itself: its own description, the date its
 * camera recorded, its author and its licence. The caption ALWAYS says it
 * shows the area and not a particular property, because a coordinate within
 * 700m of a site is not the site. That is the `exact: false` rule from
 * scripts/ingest-photos.mjs, applied to somebody else's photograph.
 *
 * ── WHAT A MODEL DOES HERE, AND WHAT IT MAY NOT ────────────────────────────
 * Every candidate has already passed the licence, date, size, subject and
 * location rules below before a model sees it. The model is then shown the
 * survivors and asked which one is the best photograph — the part a rule
 * cannot do, and the part Shervin's complaint was about. It chooses among
 * photographs; it writes no caption and no figure. With no key, or on any
 * failure, the top-scoring survivor is used and the run says so.
 *
 * ── WHERE THE CREDIT LIVES ─────────────────────────────────────────────────
 * The articles table has columns for an Unsplash credit and none for this,
 * and a schema change needs somebody at the Supabase console. So the credit
 * travels in the image URL's fragment, `#cover=<base64url JSON>`, the way a
 * shared calculator result travels in its link (lib/share.js). A browser
 * never sends a fragment when it fetches an image, so the URL still loads; the
 * row carries its own attribution wherever it is copied; and readCover()
 * refuses to hand back a Commons image whose credit is missing or malformed,
 * so an uncredited photograph cannot reach a page.
 */

const API = 'https://commons.wikimedia.org/w/api.php';
/* Wikimedia asks every client to identify itself with a way to reach the
   operator; anonymous agents are throttled first. */
const UA = 'Truestorey/1.0 (https://truestorey.vercel.app; editorial photographs)';

/* Wikimedia renders thumbnails at fixed steps, and non-standard widths are
   the first thing it rate-limits. 1280 fills the 1600px hero on a phone and a
   laptop; 500 is what the chooser looks at. */
const HERO = 1280, LOOK = 500;

/* ── THE RULES A PHOTOGRAPH MUST PASS BEFORE ANYONE LOOKS AT IT ──────────── */

/* Licences that allow use on a commercial site with credit, and nothing else.
   A non-commercial licence is not on Commons, but a stray one is refused here
   rather than trusted not to exist. */
const LICENCE = /^(cc0( 1\.0)?|public domain|pdm|cc by(-sa)? [1-4]\.\d( [a-z]{2,4})?)$/i;

/* A photograph whose SUBJECT is one of these is not a picture of a place, even
   when it was taken in one: the geosearch around Punggol returned fifty-two
   buses. Matched against the file's own title, description and categories. */
const NOT_A_PLACE = new RegExp([
  'bus', 'buses', 'sbs\\d', 'smrt', 'go-ahead', 'tower transit', 'taxi', 'lorry', 'truck', 'vehicle',
  'train', 'rail motor', 'compartment', 'platform', 'concourse', 'escalator',
  'coffee', 'tea', 'food', 'dish', 'noodles?', 'restaurant', 'cafe', 'hawker stall', 'menu', 'chocolate', 'cake',
  'shop', 'store', 'stall', 'interior', 'inside', 'toilet', 'atrium', 'lobby',
  'portrait', 'selfie', 'people', 'crowd', 'wedding', 'concert', 'festival', 'ceremony', 'protest', 'rally', 'minister',
  'logo', 'map', 'diagram', 'poster', 'signage', 'screenshot', 'document',
  'flood', 'flooding', 'accident', 'fire',
  'cat', 'dog', 'bird', 'insect', 'butterfly', 'orchid', 'flower',
].map(w => `\\b(?:${w})s?\\b`).join('|'), 'i');

/* Commons takes uploads from anyone, property marketers included. The Parc
   Central photograph came with "Introducing Tampines EC, a luxurious brand
   new…" as its description. A photograph captioned by somebody selling the
   thing in it is an advertisement, and this site does not carry them. */
const PROMOTIONAL = /\b(introducing|luxurious|luxury living|brand new|enquire|enquiries|register (now|your)|showflat|show flat|vvip|developer price|call us|whatsapp|hotline|units? (left|available)|limited units)\b/i;

/* The Causeway is inside 1.5km of Woodlands. A photograph of Johor Bahru is
   a photograph of another country. */
const ELSEWHERE = /\b(malaysia|johor|johore|batam|bintan|riau|indonesia)\b/i;

/* Singapore rebuilds quickly. A 2006 photograph of a tender site shows what
   was demolished for it. Older than this is refused; older than PREFER counts
   against a photograph without refusing it. */
const OLDEST = 2010, PREFER = 2017;

const strip = s => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

/* Descriptions in a script other than Latin are left for the title to cover:
   "這張照片在濱海灣花園拍攝" is a good description and not one a reader here can use. */
const LATIN = s => !/[^\u0000-ɏ -⁯⸀-⹿]/.test(s);

/** The year and month the camera recorded, never the upload date. */
export function takenOf(meta) {
  const raw = strip(meta?.DateTimeOriginal?.value);
  const iso = /\b((?:19|20)\d{2})-(\d{2})(?:-\d{2})?/.exec(raw);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) };
  const y = /\b((?:19|20)\d{2})\b/.exec(raw);
  return y ? { year: Number(y[1]), month: null } : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const when = t => !t ? '' : t.month ? `${MONTHS[t.month - 1]} ${t.year}` : String(t.year);

/* Street abbreviations end in a full stop and are followed by a capital:
   "St. Andrew's Road" is one sentence, not two. */
const ABBREV = /\b(st|ave|rd|dr|blk|mt|no|jln|jalan|lor|bt|upp|lt|mr|mrs|dr|ltd|pte|co|vs)$/i;
function firstSentence(s) {
  for (const m of s.matchAll(/\.\s+(?=[A-Z])/g)) {
    const before = s.slice(0, m.index);
    if (/[a-z0-9)\]]$/i.test(before) && !ABBREV.test(before)) return before;
  }
  return s;
}

/** What the photograph shows, in the file's own words. */
export function describe(page) {
  const meta = page.imageinfo?.[0]?.extmetadata || {};
  const desc = strip(meta.ImageDescription?.value);
  /* A description of one or two words ("Architecture", "From Park") says less
     than the file name usually does. */
  if (desc && LATIN(desc) && desc.split(' ').length >= 3) {
    /* The first sentence only. What follows it is history, camera settings or
       an opinion — "Taken with Xperia XZ Premium", "They are part of a series
       of flats collectively known as…" — and none of it is what the reader
       needs under a photograph. */
    const first = firstSentence(desc.replace(/\s+([,.])/g, '$1'));
    const cut = first.length <= 140 ? first : (first.slice(0, 140).replace(/[,;:]?\s+\S*$/, '') + '…');
    return cut.replace(/[.\s]+$/, '');
  }
  return String(page.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s*-\s*panoramio(\s*\(\d+\))?/i, '')
    .replace(/\s*\(\d+\)/g, '')                          // Flickr ids, "(2)"
    .replace(/\s*\d{1,2}-\d{1,2}-\d{4}(\(\d+\))?/g, '')  // 16-05-2024(226)
    .replace(/\s*\b(19|20)\d{6}\b(\s+\d{6}\b)?/g, '')     // 20211012, 20260325 213943
    .replace(/\s+/g, ' ').trim();
}

/**
 * Does this file pass? Returns the reasons it does not, or [] when it does.
 * Pure, so the rules are testable without a network.
 */
export function refusals(page) {
  const ii = page.imageinfo?.[0];
  if (!ii) return ['no image information'];
  const meta = ii.extmetadata || {};
  const why = [];
  if (!/^image\/(jpeg|png|webp)$/.test(ii.mime || '')) why.push('not a photograph');
  const lic = strip(meta.LicenseShortName?.value);
  if (!LICENCE.test(lic)) why.push(`licence ${lic || 'unknown'}`);
  /* Commons marks files that show identifiable people, or trademarks, with a
     restriction. Either is a permission this site does not have. */
  if (strip(meta.Restrictions?.value)) why.push('carries a restriction');
  if (!(ii.width >= 1600)) why.push('too small');
  const ratio = ii.width / ii.height;
  if (!(ratio >= 1.25 && ratio <= 2.4)) why.push('not landscape');
  const cats = (page.categories || []).map(c => String(c.title || c).replace(/^Category:/, '')).join(' ');
  const text = `${page.title} ${strip(meta.ImageDescription?.value)} ${cats}`;
  if (NOT_A_PLACE.test(text)) why.push('subject is not a place');
  if (ELSEWHERE.test(text)) why.push('outside Singapore');
  if (PROMOTIONAL.test(text)) why.push('promotional');
  const t = takenOf(meta);
  if (t && t.year < OLDEST) why.push(`taken ${t.year}`);
  return why;
}

const BUILT = /\b(hdb|flats?|housing|estate|blocks?|condominiums?|residential|apartments?|terrace|bungalows?|skyline|buildings?|architecture|streets?|road|avenue|drive|park|waterway|waterfront|town|aerial|panorama|view)\b/i;

/** A rough order for the survivors, before anyone looks at them. */
export function score(page, place) {
  const meta = page.imageinfo?.[0]?.extmetadata || {};
  const cats = (page.categories || []).map(c => String(c.title || c)).join(' ');
  const text = `${page.title} ${strip(meta.ImageDescription?.value)} ${cats}`;
  let s = 0;
  if (BUILT.test(text)) s += 2;
  const first = String(place?.name || '').split(/\s+/)[0];
  if (first && new RegExp(`\\b${first}\\b`, 'i').test(text)) s += 2;
  const t = takenOf(meta);
  if (!t) s -= 1; else if (t.year >= PREFER) s += 1; else s -= 1;
  if (/quality images|featured pictures|valued images/i.test(cats)) s += 3;
  /* Taken within the radius beats merely named after the town it is in. */
  if (page.via === 'near') s += 1;
  return s;
}

/* ── THE SEARCH ─────────────────────────────────────────────────────────── */

async function ask(params, signal) {
  const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`,
    { headers: { 'user-agent': UA }, signal });
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  return res.json();
}

/* ── THE FIRST RUN LOST HALF ITS CANDIDATES TO PAGING ─────────────────────
   A generator returns a hundred files, and imageinfo with extmetadata is
   answered for fifty of them per response. The rest arrive with no imageinfo
   and a `continue` token. Read once, they looked like fifty broken files and
   were refused as such, and Punggol lost its best photographs that way. So
   the query is followed until the properties are complete, merged by title. */
async function askAll(params, signal) {
  const pages = new Map();
  let cont = {};
  for (let round = 0; round < 4; round++) {
    const j = await ask({ ...params, ...cont }, signal);
    for (const p of j.query?.pages || []) {
      const had = pages.get(p.title) || {};
      pages.set(p.title, { ...had, ...p,
        imageinfo: p.imageinfo || had.imageinfo,
        categories: [...(had.categories || []), ...(p.categories || [])] });
    }
    if (!j.continue) break;
    cont = j.continue;
  }
  return [...pages.values()];
}

const INFO = {
  prop: 'imageinfo|categories', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(HERO),
  cllimit: 'max', clshow: '!hidden',
};

/**
 * Candidates for a place: what was photographed near it, what is named after
 * it, and — for a site or a block, whose own name few photographs carry —
 * what is named after the planning area it stands in. For a subject with no
 * place, a named search alone.
 */
export async function candidates({ place = null, query = null, signal } = {}) {
  const found = new Map();
  const add = (pages, via) => { for (const p of pages || []) if (!found.has(p.title)) found.set(p.title, { ...p, via }); };
  if (place) {
    add(await askAll({ action: 'query', generator: 'geosearch', ggscoord: `${place.lat}|${place.lon}`,
      ggsradius: String(Math.min(10000, place.radius || 1000)), ggslimit: '100', ggsnamespace: '6', ...INFO }, signal), 'near');
  }
  const names = query ? [query]
    : place ? [`"${place.name}" Singapore`, ...(place.area && place.area !== place.name ? [`"${place.area}" Singapore`] : [])]
    : [];
  for (const q of names) {
    add(await askAll({ action: 'query', generator: 'search', gsrsearch: `${q} filetype:bitmap`,
      gsrnamespace: '6', gsrlimit: '50', ...INFO }, signal), 'named');
  }
  return [...found.values()];
}

/* ── THE CHOICE ─────────────────────────────────────────────────────────── */

const CHOOSER = `You choose the header photograph for an article on a Singapore property website. You are shown numbered photographs. Every one is freely licensed and was taken in or near the place the article discusses.

Choose the one that best shows the built environment of that place — housing blocks, streets, buildings, open land, a waterfront — in daylight, sharp, level and well composed. A reader should see where the article is about.

Refuse any photograph whose main subject is a person or people, a vehicle, food, a shop or mall interior, an advertisement or sign, a station platform or interior, or that looks as if it could be outside Singapore. If none is good enough to lead an article, choose none.

Think it through briefly if you need to, then end your reply with one line of JSON: {"pick": <the photograph's number, or null>}`;

async function asBase64(url, signal) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal });
  if (!res.ok) return null;
  const type = res.headers.get('content-type') || 'image/jpeg';
  if (!/^image\/(jpeg|png|webp)/.test(type)) return null;
  return { type: type.split(';')[0], data: Buffer.from(await res.arrayBuffer()).toString('base64') };
}

const smaller = u => String(u).replace(new RegExp(`/${HERO}px-`), `/${LOOK}px-`);

/**
 * Which survivor leads. The model looks; the rules have already decided what
 * it may look at. Returns { page, how }.
 */
async function choose(pool, { article, place, claude, signal }) {
  const fallback = { page: pool[0], how: 'score' };
  if (!claude || pool.length < 2) return fallback;
  const shown = [];
  const content = [{ type: 'text', text: `Article: ${article}\nPlace: ${place?.name || 'Singapore'}` }];
  const images = await Promise.all(pool.map(p => asBase64(smaller(p.imageinfo[0].thumburl), signal).catch(() => null)));
  images.forEach((img, i) => {
    if (!img) return;
    shown.push(pool[i]);
    content.push({ type: 'text', text: `Photograph ${shown.length}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } });
  });
  if (shown.length < 2) return fallback;
  /* Room to look before answering, and the LAST pick in the reply is the
     answer. At 60 tokens the model described photograph one and was cut off
     before it chose — three of the first sixteen runs came back that way. */
  const reply = await claude(CHOOSER, [{ role: 'user', content }], { maxTokens: 700, signal });
  if (!reply || reply.error) return { ...fallback, how: `score (chooser ${reply?.error || 'unavailable'})` };
  const m = [...String(reply.text || '').matchAll(/"pick"\s*:\s*(null|\d+)/g)].at(-1);
  if (!m) return { ...fallback, how: 'score (chooser unreadable)' };
  if (m[1] === 'null') return { page: null, how: 'chooser refused every candidate' };
  const n = Number(m[1]);
  return shown[n - 1] ? { page: shown[n - 1], how: 'chooser' } : { ...fallback, how: 'score (chooser out of range)' };
}

/* ── THE CREDIT, AND WHERE IT TRAVELS ───────────────────────────────────── */

const HOSTS = {
  src: /^(upload|thumb)\.wikimedia\.org$/,
  page: /^commons\.wikimedia\.org$/,
  licence: /^(creativecommons\.org|commons\.wikimedia\.org|en\.wikipedia\.org)$/,
};
/* base64url over UTF-8, without Buffer, so a client component can read a
   cover as well as the server can write one. */
const toB64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = s => new TextDecoder().decode(Uint8Array.from(
  atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

const safe = (u, host) => {
  try { const x = new URL(u); return x.protocol === 'https:' && host.test(x.hostname) ? x.toString() : null; }
  catch { return null; }
};

export const RELATION = {
  area: 'The area this piece discusses, not a photograph of any particular property.',
  subject: 'A general view, not a photograph of any property this piece discusses.',
};

/** What gets stored: the image URL with its credit in the fragment. */
export function coverFrom(page, { relation = 'area', place = null } = {}) {
  const ii = page.imageinfo[0];
  const meta = ii.extmetadata || {};
  const cover = {
    v: 1,
    shows: describe(page),
    taken: when(takenOf(meta)),
    by: strip(meta.Artist?.value).slice(0, 80) || 'Wikimedia Commons contributor',
    licence: strip(meta.LicenseShortName?.value),
    licenceUrl: safe(strip(meta.LicenseUrl?.value), HOSTS.licence),
    page: safe(ii.descriptionurl, HOSTS.page),
    relation: RELATION[relation] ? relation : 'area',
    place: place?.name || null,
  };
  const src = String(ii.thumburl || ii.url).split('#')[0];
  return `${src}#cover=${toB64(JSON.stringify(cover))}`;
}

/**
 * The image and its credit, from a stored header URL. Null for anything that
 * is not a Commons image. { refused: true } for a Commons image whose credit
 * cannot be read — the caller must then show no image at all, because an
 * uncredited photograph is a licence breach on every page it appears.
 */
export function readCover(url) {
  const s = String(url || '');
  const [src, frag] = [s.split('#')[0], s.split('#')[1] || ''];
  if (!safe(src, HOSTS.src)) return null;
  const m = /(?:^|&)cover=([A-Za-z0-9_-]+)/.exec(frag);
  if (!m) return { refused: true };
  let c;
  try { c = JSON.parse(fromB64(m[1])); } catch { return { refused: true }; }
  const page = safe(c?.page, HOSTS.page);
  const licence = String(c?.licence || '');
  if (!page || !LICENCE.test(licence)) return { refused: true };
  const clip = (x, n) => String(x ?? '').slice(0, n);
  const shows = clip(c.shows, 200);
  return {
    src,
    alt: shows ? `Photograph: ${shows}` : 'Photograph',
    shows,
    taken: clip(c.taken, 12),
    by: clip(c.by, 80) || 'Wikimedia Commons contributor',
    licence,
    licenceUrl: safe(c.licenceUrl, HOSTS.licence),
    page,
    relation: RELATION[c.relation] || RELATION.area,
    place: c.place ? clip(c.place, 80) : null,
  };
}

/**
 * The photo's identity, so two articles are not given the same one.
 *
 * Not the file name as it stands. Commons holds "497A and 497D, Tampines
 * Street 45.jpg" and "… Tampines Street 45 (2).jpg" — two frames of one scene
 * — and the first run gave one to each of two articles. So the name loses its
 * extension, bracketed numbers and camera timestamps before it is compared.
 */
export const coverId = url => {
  const m = /\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/.exec(String(url || ''));
  if (!m) return null;
  return decodeURIComponent(m[1]).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/_/g, ' ')
    .replace(/\(\d+\)/g, ' ').replace(/\b(19|20)\d{6}\b(\s+\d{6}\b)?/g, ' ')
    .replace(/\s+/g, ' ').trim();
};

/* ── THE WHOLE STEP ─────────────────────────────────────────────────────── */

/* A named search for a piece with no place, by what kind of housing it is
   about. Real Singapore housing, captioned as a general view. A piece that
   matches none of these keeps whatever lib/photo.js and the illustrations
   would have given it. */
const SUBJECT_QUERIES = [
  [/\b(hdb|bto|flats?|mop|public housing)\b/i, 'HDB flats Singapore'],
  [/\b(condo|condominium|private|new launch|en bloc|freehold|showflat)\b/i, 'condominium Singapore'],
  [/\b(landed|terrace|semi detached|bungalow|good class)\b/i, 'terrace houses Singapore'],
];

/* The kind named FIRST decides. "New launch vs resale" is a piece about
   condominiums that happens to say resale; "HDB-private decoupling" is about
   both and leads with HDB. A fixed order got the first of those wrong. */
export function subjectQuery(words) {
  const hits = SUBJECT_QUERIES.map(([re, q]) => ({ i: String(words).search(re), q })).filter(h => h.i >= 0);
  return hits.sort((a, b) => a.i - b.i)[0]?.q || null;
}

/**
 * @param article   { title, slug, tags, sources }
 * @param placeOf   lib/place.js's resolver, passed in so this file needs no data
 * @param avoid     Set of coverId()s already used by other articles
 * @param claude    lib/ai/providers.js's claude, or null to use the score alone
 * @returns { url, place, how, considered, passed } or { url: null, reason }
 */
export async function findCover(article, { placeOf, avoid = new Set(), claude = null, log = () => {}, signal } = {}) {
  const place = placeOf ? placeOf(article) : null;
  const words = `${article.title || ''} ${String(article.slug || '').replace(/-/g, ' ')}`;
  const query = place ? null : subjectQuery(words);
  if (!place && !query) return { url: null, reason: 'names no place and no kind of housing' };

  let pages;
  try { pages = await candidates({ place, query, signal }); }
  catch (e) { return { url: null, reason: `Commons unavailable: ${e.message}` }; }

  const passed = pages.filter(p => !refusals(p).length && !avoid.has(coverId(p.imageinfo?.[0]?.thumburl)));
  const tally = {};
  for (const p of pages) for (const r of refusals(p)) { const k = r.split(' ')[0]; tally[k] = (tally[k] || 0) + 1; }
  log(`  ${place ? `${place.name} (${place.kind})` : `"${query}"`}: ${pages.length} photographs, ${passed.length} pass`
    + (Object.keys(tally).length ? ` · refused ${Object.entries(tally).map(([k, n]) => `${k} ${n}`).join(', ')}` : ''));
  if (!passed.length) return { url: null, place, reason: 'no photograph passed the rules' };

  const ranked = passed.map(p => ({ p, s: score(p, place) }))
    .sort((a, b) => b.s - a.s || a.p.title.localeCompare(b.p.title)).map(x => x.p);
  /* Six at a time, twice. Refusing six is a fair verdict on six; it is not a
     verdict on the hundred and forty behind them. Two rounds and no more: a
     place whose best twelve photographs are all refused is a place with no
     photograph worth leading on, and the piece keeps what it had. */
  let page = null, how = '';
  for (const pool of [ranked.slice(0, 6), ranked.slice(6, 12)]) {
    if (!pool.length) break;
    ({ page, how } = await choose(pool, { article: article.title, place, claude, signal }));
    if (page) break;
  }
  if (!page) return { url: null, place, reason: how };
  log(`  chose ${page.title} — by ${how}`);
  return {
    url: coverFrom(page, { relation: place ? 'area' : 'subject', place }),
    place, how, considered: pages.length, passed: passed.length,
  };
}
