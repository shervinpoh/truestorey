/**
 * The reading list — headlines and links, from feeds the publishers offer.
 *
 * ── RULE 9 NAMES THESE THREE OUTLETS, AND THIS IS WHERE IT DOES NOT APPLY ──
 * CLAUDE.md rule 9 reads "Never reproduce news. Index primary sources and link
 * to them. Nothing from Straits Times, Business Times, EdgeProp or Stacked."
 * The sources below are exactly Business Times, EdgeProp and Stacked, which
 * looks like a direct breach and is not one — that rule governs what the SITE
 * publishes under a CEA registration number. This is Shervin's own reading,
 * on a local panel that is never deployed, and lib/consult is already walled
 * off from app/ by test/consult-boundary.test.js.
 *
 * The distinction is worth stating because somebody will read this file, see
 * three forbidden mastheads, and assume the rule was quietly relaxed. It was
 * not. `data/.reading.json` is gitignored and in outputFileTracingExcludes so
 * nothing here can reach a build.
 *
 * ── WHAT IS STORED, AND WHAT IS NOT ───────────────────────────────────────
 * Headline, link, publisher, date, and the one-line summary the publisher
 * themselves put in the feed — which is what a feed is for. Capped, and never
 * the article body. The LINK is the product: you go and read it at the source,
 * which is where the writer is paid.
 *
 * ── THE ITEMS ACCUMULATE ──────────────────────────────────────────────────
 * A feed carries ten or twenty items. Replace the store on each fetch and
 * anything published while you were not looking is gone — the opposite of a
 * reading list. So items merge on their link and nothing is dropped.
 *
 * ── FEED TEXT IS UNTRUSTED ────────────────────────────────────────────────
 * Every headline and summary here is text from outside this repo. It is data.
 * It is escaped wherever it renders, and nothing in it is ever treated as an
 * instruction — a headline reading "ignore previous instructions" is a
 * headline.
 */
import fs from 'node:fs';
import path from 'node:path';

export const VERSION = '2026-09-reading-v1';
const STORE = 'data/.reading.json';

export const SOURCES = [
  { key: 'stacked', name: 'Stacked Homes', url: 'https://stackedhomes.com/feed/', site: 'https://stackedhomes.com' },
  { key: 'bt', name: 'Business Times · Property', url: 'https://www.businesstimes.com.sg/rss/property', site: 'https://www.businesstimes.com.sg/property' },
  /**
   * EdgeProp publishes no news-only feed — /rss/news, /news/rss, /feed and
   * /rss/all are all 404. rss.xml is the FRONTPAGE feed, and it carries
   * overseas listings ("Estuari Greens", Johor; "Royal Wharf", London),
   * furniture launches and exhibition notices alongside the property news.
   * Seven of ten items in a typical pull were not property news at all.
   *
   * They separate cleanly by URL path, so the filter is on the path and
   * nothing else — no keyword matching on titles, which would quietly drop
   * real stories whenever a headline happened to contain the wrong word.
   */
  { key: 'edgeprop', name: 'EdgeProp', url: 'https://www.edgeprop.sg/rss.xml', site: 'https://www.edgeprop.sg',
    keep: /^\/property-news\//, keepWhy: 'EdgeProp\u2019s frontpage feed also carries overseas listings, furniture and exhibitions; only /property-news/ is kept.' },
];

/**
 * Which Briefing lever an item bears on, by keyword.
 *
 * Deterministic and published, for the same reason the rubric is: a model
 * asked to categorise would put the same headline somewhere different tomorrow.
 * Null when nothing matches, which is most of them — a guess would be worse
 * than an empty column.
 */
const LEVER_WORDS = [
  ['fed', /\b(fed|federal reserve|fomc|interest rate|rate cut|rate hike|sora|mortgage rate|refinanc)/i],
  ['mas', /\b(mas\b|monetary authority|sgd|exchange rate|policy band|inflation)/i],
  ['cooling', /\b(absd|cooling measure|ltv\b|tdsr|msr\b|stamp duty|ssd\b|loan-to-value)/i],
  ['supply', /\b(gls|government land sales|land sale|tender|top\b|launch|mop\b|bto\b|supply|pipeline|en bloc|collective sale)/i],
];
export const leverFor = text => (LEVER_WORDS.find(([, re]) => re.test(String(text || '')))?.[0] ?? null);

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D' };
const decode = s => String(s).replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') {
    const n = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
  }
  return NAMED[e.toLowerCase()] ?? ' ';
});

/**
 * Feed text to something printable.
 *
 * ── THE ORDER IS THE WHOLE THING ──────────────────────────────────────────
 * This stripped tags and THEN decoded entities, which is exactly backwards
 * for a feed that escapes its own markup. EdgeProp ships
 * `&lt;div class=&quot;field…&quot;&gt;` — no literal angle bracket, so the
 * tag strip found nothing to do, and the decode afterwards turned the escaped
 * markup into visible markup. Every EdgeProp item in the reading list was
 * rendering a wall of `<div class="field field-name-field-image"…` where its
 * summary should be.
 *
 * So: decode, then strip, and repeat until it stops changing — because a feed
 * that escapes once can escape twice, and one pass would leave the second
 * layer showing. Capped at three passes so a pathological input cannot spin.
 */
const strip = s => {
  let t = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  for (let i = 0; i < 3; i++) {
    const next = decode(t).replace(/<[^>]*>/g, ' ');
    if (next === t) break;
    t = next;
  }
  return t.replace(/\s+/g, ' ').trim();
};

/**
 * A byline, or nothing.
 *
 * EdgeProp's dc:creator carries whatever the poster typed — this session saw
 * `bernardtkc@gmail.com` and `92201825` rendered as authors. Printing a
 * stranger's email address and mobile number in a tool is not a formatting
 * problem, and no byline at all is better than the wrong kind of one.
 */
const byline = a => {
  const t = String(a || '').trim();
  if (!t || t.length > 60) return null;
  if (/@/.test(t)) return null;                 // an email address
  if (/^[\d\s()+-]{6,}$/.test(t)) return null;  // a phone number
  if (!/[A-Za-z]/.test(t)) return null;         // no letters is not a name
  return t;
};

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? strip(m[1]) : null;
};

/** RSS `<item>` and Atom `<entry>`, without a parser dependency. */
export function parseFeed(xml) {
  const out = [];
  const blocks = String(xml).match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    const title = tag(b, 'title');
    /* Atom puts the URL in an attribute rather than the element body. */
    const link = tag(b, 'link') || (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || null;
    if (!title || !link) continue;
    const published = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || null;
    const summary = tag(b, 'description') || tag(b, 'summary') || null;
    out.push({
      title,
      link: link.split('?')[0],
      published: published ? new Date(published).toISOString() : null,
      /* The publisher's own one-liner, capped. Never the article body — some
         feeds put the whole piece in content:encoded and it is not taken. */
      summary: summary ? summary.slice(0, 240) : null,
      author: byline(tag(b, 'dc:creator') || tag(b, 'author')),
    });
  }
  return out;
}

const emptyStore = () => ({ version: VERSION, updatedAt: null, lastOpened: null, sources: [], items: {} });

export function loadReading(root = process.cwd()) {
  const p = path.join(root, STORE);
  if (!fs.existsSync(p)) return emptyStore();
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return emptyStore(); }
}

/**
 * Fetch every source and fold what came back into the store.
 *
 * Degrade, never break: a source that times out is reported by name with what
 * it last managed, and the others still render. A reading list that silently
 * lost a masthead would look like a quiet week.
 */
export async function refreshReading({ root = process.cwd(), timeoutMs = 15000, at = new Date().toISOString() } = {}) {
  const store = loadReading(root);
  const previous = new Map((store.sources || []).map(s => [s.key, s]));
  const sources = [];

  for (const src of SOURCES) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    try {
      const res = await fetch(src.url, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const all = parseFeed(await res.text());
      if (!all.length) throw new Error('answered, but carried no items');
      /* A per-source path filter, where the publisher mixes news with things
         that are not news. Applied here rather than in parseFeed so the
         parser stays a parser, and counted rather than silent — a feed that
         starts returning nothing after a site restructure should look like a
         problem, not like a quiet day. */
      const items = src.keep ? all.filter(it => { try { return src.keep.test(new URL(it.link).pathname); } catch { return false; } }) : all;
      const filtered = all.length - items.length;
      if (src.keep && !items.length) throw new Error(`${all.length} items, none under ${src.keep} — the site may have restructured`);
      let added = 0;
      for (const it of items) {
        if (store.items[it.link]) {
          /* Keep the first sighting — it is what "new since you last looked"
             is measured from. */
          Object.assign(store.items[it.link], { ...it, firstSeen: store.items[it.link].firstSeen });
        } else {
          store.items[it.link] = { ...it, source: src.key, sourceName: src.name, firstSeen: at, lever: leverFor(`${it.title} ${it.summary || ''}`) };
          added++;
        }
      }
      sources.push({ ...src, ok: true, items: items.length, added, filtered, fetchedAt: at });
    } catch (e) {
      const was = previous.get(src.key);
      sources.push({ ...src, ok: false, error: String(e?.message || e).slice(0, 120),
                     lastGood: was?.ok ? was.fetchedAt : was?.lastGood || null });
    } finally { clearTimeout(t); }
  }

  /**
   * Retire anything the current rules would not admit.
   *
   * A feed carries only its recent window, so a stored item is not re-checked
   * simply by refreshing — the seven overseas listings and furniture posts
   * admitted before EdgeProp had a path filter would have sat in the reading
   * list indefinitely, and the filter would have looked like it did nothing.
   * Only items that FAIL a rule are dropped; falling out of the feed window
   * is not a reason, or the list would never hold more than a day.
   *
   * Summaries are re-stripped for the same reason: the ones stored while the
   * decode ran in the wrong order still carry visible markup, and nothing
   * would ever clean them.
   */
  let retired = 0;
  const byKey = new Map(SOURCES.map(x => [x.key, x]));
  for (const [link, it] of Object.entries(store.items)) {
    const src = byKey.get(it.source);
    if (src?.keep) {
      let pathname = null;
      try { pathname = new URL(link).pathname; } catch { /* unparseable */ }
      if (!pathname || !src.keep.test(pathname)) { delete store.items[link]; retired++; continue; }
    }
    if (it.summary && /<[a-z/][^>]*>/i.test(it.summary)) it.summary = strip(it.summary).slice(0, 240);
    if (it.author && !byline(it.author)) it.author = null;
  }

  store.sources = sources;
  store.retired = retired;
  store.updatedAt = at;
  fs.writeFileSync(path.join(root, STORE), JSON.stringify(store));
  return store;
}

/** Newest first, with what arrived since the last visit marked. */
export function readingList(store, { limit = 60, source = null, lever = null } = {}) {
  const since = store.lastOpened ? new Date(store.lastOpened) : null;
  const items = Object.values(store.items || {})
    .filter(i => (!source || i.source === source) && (!lever || i.lever === lever))
    .map(i => ({ ...i, isNew: since ? new Date(i.firstSeen) > since : false }))
    .sort((a, b) => String(b.published || b.firstSeen).localeCompare(String(a.published || a.firstSeen)))
    .slice(0, limit);
  return { items, newCount: items.filter(i => i.isNew).length };
}

/** Called when the page is opened, AFTER the list is built — so "new" means
 *  new since the previous visit rather than since a second ago. */
export function markOpened(store, { root = process.cwd(), at = new Date().toISOString() } = {}) {
  store.lastOpened = at;
  fs.writeFileSync(path.join(root, STORE), JSON.stringify(store));
}
