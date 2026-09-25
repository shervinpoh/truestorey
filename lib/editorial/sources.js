/**
 * Agency releases, read from the agencies' own pages.
 *
 * ── WHY NOT A SEARCH ENGINE ────────────────────────────────────────────────
 * The Make pipeline asked Perplexity what the agencies had said, and handed
 * the writer a headline and an "angle". The writer never saw the release, so
 * it could not use a single figure from it, and the published notes carried
 * none. URA's and HDB's news pages are plain HTML with the date and the full
 * text in them. Reading them directly means the facts in a piece are the
 * agency's own sentences, and a figure from the release can be checked against
 * the release by code.
 *
 * Two agencies, because those two are where Singapore's residential news is
 * published and both serve readable pages. MND's pages render in the browser
 * and return an empty shell to a fetch; they are left out rather than guessed
 * at. Adding an agency is a lister and a date format.
 */

const UA = 'Mozilla/5.0 (compatible; Truestorey/1.0; +https://truestorey.vercel.app)';

async function get(url, signal) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return res.text();
}

const MONTH = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** "18 September 2026" → "2026-09-18". */
export function isoDate(text) {
  const m = /\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* ((?:19|20)\d{2})\b/.exec(String(text || ''));
  return m ? `${m[3]}-${String(MONTH[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** The readable text of a page: its <main>, without navigation or scripts. */
export function textOf(html) {
  const main = (/<main[\s\S]*?<\/main>/i.exec(html) || [html])[0];
  return main
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|li|h[1-6]|tr|div)>/gi, '\n').replace(/<(td|th)\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&#x27;|&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').split('\n').map(l => l.replace(/^[\s|]+|[\s|]+$/g, '')).filter(Boolean).join('\n');
}

/* ── who publishes what ─────────────────────────────────────────────────── */

export const AGENCIES = {
  URA: {
    list: 'https://www.ura.gov.sg/news/media',
    links: html => [...new Set(String(html).match(/pr\d{2}-\d+/g) || [])]
      .map(id => ({ id, url: `https://www.ura.gov.sg/news/media/${id}/` }))
      /* Newest first: pr26-67 after pr26-66. */
      .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true })),
  },
  HDB: {
    list: 'https://www.hdb.gov.sg/hdb-pulse/news',
    links: html => {
      const year = new Date().getUTCFullYear();
      /* HDB lists its news alphabetically, not by date, so the newest cannot be
         taken from the top. The slug carries the headline's words, so the
         irrelevant ones are dropped before anything is fetched. */
      return [...new Set(String(html).match(new RegExp(`/hdb-pulse/news/(?:${year}|${year - 1})/[a-z0-9-]+`, 'gi')) || [])]
        .map(p => ({ id: p, url: `https://www.hdb.gov.sg${p}`, words: p.split('/').pop().replace(/-/g, ' ') }))
        .filter(l => relevant(l.words))
        .sort((a, b) => b.id.localeCompare(a.id));
    },
  },
};

/* Residential, or it is not this site's news. A release about a design award
   or a road closure is real news and not ours. */
const RELEVANT = /\b(residential|housing|flats?|hdb|bto|resale|executive condominium|condominium|sale site|land parcel|government land sales|gls|tender|price index|prices|rental|rents?|stamp duty|absd|loan|ltv|cpf housing|income ceilings?|wait-?out|mop|minimum occupation|en bloc|collective sale|property)\b/i;
const NOT_OURS = /\b(road closure|design award|awards? 20\d\d|exhibition|appointments?|board members|festival|art|heritage|conservation of|carpark|car park|parking|urban farming|rooftop|kiosk|lift upgrading|cycling|construction productivity|automation|standardisation)\b/i;

export const relevant = title => RELEVANT.test(title) && !NOT_OURS.test(title);

/**
 * Which release is most worth a reader's time, when several are uncovered.
 * A change to the rules a buyer lives under outranks a price, a price
 * outranks an award, and an award outranks the closing that preceded it —
 * a closing is only a list of bids until the award says who won.
 */
export function weight(title) {
  const t = String(title);
  if (/\b(income ceilings?|wait-?out|stamp duty|absd|ltv|loan|cooling|eligib|grant|mop|minimum occupation|removal|framework|scheme)\b/i.test(t)) return 4;
  if (/\b(price index|prices|rental|flash estimate|statistics)\b/i.test(t)) return 3;
  if (/\b(tender award|award|bto|launch of|sales launch|flats)\b/i.test(t)) return 2;
  if (/\btender closing\b/i.test(t)) return 1;
  return 1;
}

/**
 * One release: title, date, and its text as facts.
 * @returns { agency, title, date, iso, url, facts } or null
 */
export async function readRelease(agency, url, { signal } = {}) {
  const page = await get(url, signal);
  const titleTag = (/<title>([^<]*)<\/title>/i.exec(page) || [])[1] || '';
  /* HDB's pages send the release body as escaped HTML inside a script and
     render it in the browser; the <main> a fetch sees holds only the title
     and date. The body is still in the page, so it is read from there. */
  const embedded = embeddedHtml(page);
  const html = embedded ? `${page}<main>${embedded}</main>` : page;
  const tables = tablesOf(embedded || html);
  const text = [textOf(page.replace(/<table[\s\S]*?<\/table>/gi, ' ')),
    embedded ? textOf(`<main>${embedded.replace(/<table[\s\S]*?<\/table>/gi, ' ')}</main>`) : ''].join('\n');
  const title = titleTag.split('|')[0].replace(/\s+/g, ' ').trim()
    || (text.split('\n').find(l => l.length > 20) || '').trim();
  const iso = isoDate(text);
  /* The facts are the release's own lines, minus breadcrumbs and one-word
     table headings. Their figures are what a piece may quote from it. */
  const lines = text.split('\n').map(l => l.trim())
    .filter(l => l.length >= 25 && !/^(home|news|media|press releases?|back to top)\b/i.test(l) && l !== title);
  const facts = [...lines, ...tables].slice(0, 45);
  if (facts.join(' ').length < 200) return null;   // an empty shell, not a release
  return { agency, title, date: iso ? humanDate(iso) : '', iso, url, facts };
}

/**
 * A release's tables, as sentences: "SITE AREA: 4,283.4 m²".
 *
 * URA sets an award out as a table, a heading row and a value row. Read as
 * loose text, "4,283.4 m²" is a number with nothing to say what it measures —
 * and the first attempt to re-pair headings with values from the loose lines
 * got one heading wrong ("TENDERED PRICE ($PSM of GFA)" has a lowercase word)
 * and produced "SUCCESSFUL TENDERER: 11,994 m²", a false fact. So tables are
 * read as tables: cells by row, zipped with the header row only when every
 * row has the same number of cells. Anything irregular is read as plain lines.
 */
export function tablesOf(html) {
  const cell = c => textOf(`<main>${c}</main>`).replace(/\n/g, ' ').trim();
  const out = [];
  for (const [table] of String(html).matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
      .map(([r]) => [...r.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(m => cell(m[1])));
    if (rows.length < 2) continue;
    const [head, ...body] = rows;
    if (body.every(r => r.length === head.length) && head.every(Boolean)) {
      for (const r of body) out.push(head.map((h, k) => `${h}: ${r[k]}`).join('; '));
    } else {
      for (const r of rows) out.push(r.filter(Boolean).join(' · '));
    }
  }
  return out;
}

/** The longest JSON-escaped HTML string in a page's scripts, decoded, or null. */
export function embeddedHtml(page) {
  let best = null;
  for (const m of String(page).matchAll(/"((?:[^"\\]|\\.){200,})"/g)) {
    if (!/\\u003cp\\u003e|\\u003cp /.test(m[1])) continue;
    try {
      const html = JSON.parse(`"${m[1]}"`);
      if (!best || html.length > best.length) best = html;
    } catch { /* not a JSON string after all */ }
  }
  return best;
}

const humanDate = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`;
};

/**
 * Recent, residential releases from each agency, newest first.
 * @param days   how far back a release is still news
 * @param skip   Set of URLs already written about
 */
export async function recentReleases({ days = 21, skip = new Set(), perAgency = 8, now = new Date(), log = () => {} } = {}) {
  const cutoff = new Date(now.getTime() - days * 864e5).toISOString().slice(0, 10);
  const out = [];
  for (const [agency, a] of Object.entries(AGENCIES)) {
    let links = [];
    try { links = a.links(await get(a.list)).slice(0, perAgency * 4); }
    catch (e) { log(`  ${agency}: could not read the news page — ${e.message}`); continue; }
    let read = 0;
    for (const { url } of links) {
      if (read >= perAgency * (agency === 'HDB' ? 3 : 1)) break;
      if (skip.has(url)) continue;
      let r;
      try { r = await readRelease(agency, url); } catch (e) { log(`  ${agency}: ${url} — ${e.message}`); continue; }
      read++;
      if (!r?.iso) continue;
      if (r.iso < cutoff) continue;
      if (!relevant(r.title)) { log(`  ${agency}: not residential — ${r.title}`); continue; }
      out.push(r);
    }
    log(`  ${agency}: ${links.length} listed, ${read} read`);
  }
  return out.sort((a, b) => b.iso.localeCompare(a.iso));
}
