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
  { key: 'edgeprop', name: 'EdgeProp', url: 'https://www.edgeprop.sg/rss.xml', site: 'https://www.edgeprop.sg' },
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

const strip = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, m => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#8211;': '–', '&#8217;': '’', '&nbsp;': ' ' }[m.toLowerCase()] ?? ' '))
  .replace(/\s+/g, ' ').trim();

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
      author: tag(b, 'dc:creator') || tag(b, 'author') || null,
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
      const items = parseFeed(await res.text());
      if (!items.length) throw new Error('answered, but carried no items');
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
      sources.push({ ...src, ok: true, items: items.length, added, fetchedAt: at });
    } catch (e) {
      const was = previous.get(src.key);
      sources.push({ ...src, ok: false, error: String(e?.message || e).slice(0, 120),
                     lastGood: was?.ok ? was.fetchedAt : was?.lastGood || null });
    } finally { clearTimeout(t); }
  }

  store.sources = sources;
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
