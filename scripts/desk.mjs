/**
 * The daily desk piece, written from the filed data.
 *
 *   npm run desk            find, write, file as a draft
 *   npm run desk -- --dry   find and write, print it, file nothing
 *
 * ── HOW IT DIFFERS FROM THE NEWS PIPELINE ──────────────────────────────────
 * The Make scenario writes about agency announcements and does it correctly —
 * every article it has filed carries its source. Its ceiling is the
 * government: five pieces on 5 September and nothing for four days after,
 * because URA published nothing. This is the other supply.
 *
 * ── THE MODEL NEVER CHOOSES THE STORY ──────────────────────────────────────
 * lib/findings.js decides what is worth writing, by arithmetic, and hands over
 * a finding whose figures already carry their period and agency. The model
 * receives those as fixed and writes prose around them. If it were asked to
 * find something interesting instead, it would be choosing which number
 * matters and then justifying the choice — which is the thing this site does
 * not do, in Blindspot, in the brief, and here.
 *
 * ── AND IT IS ALLOWED TO FILE NOTHING ──────────────────────────────────────
 * Most days it should. A generator obliged to produce something produces
 * filler, and filler is how a desk becomes a content farm.
 */
/* No dotenv: three npm dependencies is the architecture. The npm script
   passes --env-file-if-exists=.env.local, the way every other ingest does. */
import { findings } from '../lib/findings.js';
import { claude, firstJson } from '../lib/ai/providers.js';
import { photograph, photoId } from '../lib/photo.js';

const DRY = process.argv.includes('--dry');
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://truestorey.vercel.app').replace(/\/$/, '');

/* .env.local points NEXT_PUBLIC_SITE_URL at localhost for development, and
   the chart is embedded in the article as an absolute URL. Filing from a
   laptop would bake http://localhost:3000 into a row that then renders a
   broken image for every reader — visible only after publishing. Dry runs are
   fine; filing is not. */
if (!DRY && /localhost|127\.0\.0\.1/.test(SITE)) {
  console.error(`\nNEXT_PUBLIC_SITE_URL is ${SITE}, so the chart would be filed as a localhost URL.`);
  console.error('Run with --dry, or set NEXT_PUBLIC_SITE_URL to the live site before filing.\n');
  process.exit(1);
}

const SYSTEM = `You write for Truestorey, a Singapore property site published by Shervin Poh, CEA Reg. No. R066925H, Huttons Asia Pte Ltd. Everything you write goes out under that registration number.

YOU ARE GIVEN A FINDING THAT HAS ALREADY BEEN MEASURED. You did not find it and you may not improve on it. Your job is to explain what it means for someone buying, owning or selling a home — the consequence, the thing that is easy to misread, the question it should make them ask.

THE FIGURES ARE FIXED. Use only the numbers in FINDING, written with the period beside them. You may not add, estimate, round differently, annualise or recall any other figure. If you want a number you were not given, say it in words or leave it out. A number that is not in FINDING makes the piece unpublishable.

THE CAVEAT IS NOT OPTIONAL. If the finding carries one, it goes in the piece, near the top, in your own words. It is there because the measurement cannot separate two explanations, and a reader who does not know that is being misled by arithmetic.

HARD RULES — breaking any makes it unpublishable:
- Never state a valuation, an estimate of what any property is worth, or a price forecast.
- Never use: undervalued, best deal, expert, specialist, guaranteed, hot market, must buy, only safe way.
- Never tell a reader to buy or sell. No verdicts.
- Never imply a school place, a walking time, or a distance to anything.
- Never quote or paraphrase Straits Times, Business Times, EdgeProp, Stacked or any publisher.
- Never predict what prices will do. Say what has happened, with its period.
- MOP eligibility is not incoming supply. Do not describe it as supply.

HOUSE STYLE: British spelling. Singapore dollars as S$1,234,567. Plain, direct, unhurried — more interested in what a figure does not say than in what it does. No first-person plural. Short paragraphs. Do not open with "In a move that" or "As Singapore's property market". End on the practical consequence.

OUTPUT. One JSON object, nothing else, no code fences:
{
  "title": "under 70 characters, specific, no colon-subtitle construction",
  "slug": "lowercase-hyphenated",
  "excerpt": "one sentence under 200 characters",
  "content_html": "…"
}
NEVER put a double-quote character inside title or excerpt; use an apostrophe.

content_html: 500 to 800 words. Allowed tags only — p h2 h3 strong em ul ol li blockquote a figure figcaption img table thead tbody tr th td small. No <h1>. No inline styles or classes; they are stripped.
Put {{CHART}} on its own line where the figure belongs, about a third of the way in. It is replaced with the data graphic and its source line. Use it exactly once.`;

function chartFor(f) {
  const p = new URLSearchParams();
  if (f.kind === 'town-move') {
    p.set('t', `Median psf, ${f.subject} against the quarter before`);
    p.set('d', `${f.figures[0].period}:${f.figures[0].value},${f.figures[2].period}:${f.figures[2].value}`);
    p.set('u', ' psf'); p.set('hi', f.figures[0].period);
  } else if (f.kind === 'mop') {
    const [lead, whole, next] = f.figures;
    p.set('t', `Flats reaching their fifth year, ${lead.period}`);
    p.set('d', `${f.subject}:${lead.value},${String(next.value).split(', ')[0]}:${String(next.value).split(', ')[1] || 0},Everywhere else:${whole.value - lead.value}`);
    p.set('hi', f.subject);
  } else {
    p.set('t', f.claim.slice(0, 80));
    p.set('d', f.figures.filter(x => Number.isFinite(Number(x.value)))
      .map(x => `${x.what.slice(0, 24)}:${Number(x.value)}`).join(','));
  }
  p.set('s', `${f.figures[0].source} · ${f.figures[0].period}`);
  return `${SITE}/chart?${p.toString()}`;
}


/* ── IT WALKS THE LIST, IT DOES NOT TAKE THE HEAD ─────────────────────────
   On 11 September the desk wrote about CENTRAL AREA for the second time. The
   webhook refused it — HTTP 409, the duplicate check doing exactly its job —
   and the run failed having filed nothing. Nobody was told, because the
   Apps Script bot messages when a draft ARRIVES, so a morning with no draft
   is indistinguishable from a morning nobody looked at.

   The cause is that the top finding does not change. CENTRAL AREA scored 1.00
   off a quarterly figure, and a quarterly figure is still there in December.
   Ranked second at 0.57, PUNGGOL had never been written about at all.

   So a finding whose subject page is already the source of a recent article
   is skipped and the next one is written instead. COVER_DAYS is 45 because
   the figures here are quarterly: less and the same quarter gets written
   twice, much more and a town that genuinely moved again goes unreported. */
const COVER_DAYS = 45;

/* One read, two answers: what has been written about, and which photographs
   are already on the site. A second round trip for the second question would
   be the same rows again. */
async function recentlyFiled() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) return null;
  const since = new Date(Date.now() - COVER_DAYS * 864e5).toISOString();
  try {
    const r = await fetch(
      `${base}/rest/v1/articles?select=title,source_urls,header_image_url,created_at`
      + `&created_at=gte.${since}&limit=200`,
      { headers: { apikey: key, authorization: `Bearer ${key}` } });
    /* A failed read must not read as an empty table. Returning null says "not
       known", and the caller writes the top finding anyway — the webhook's own
       duplicate check is still there as the backstop. Returning an empty set
       would claim nothing has ever been filed and re-file all of it. */
    if (!r.ok) {
      console.warn(`  could not check what has been filed — HTTP ${r.status}`);
      return null;
    }
    const rows = await r.json();
    const covered = new Map();
    const photos = new Set();
    for (const a of rows) {
      for (const u of a.source_urls || []) {
        try { covered.set(new URL(u).pathname, a.title); } catch { /* not a URL */ }
      }
      const id = photoId(a.header_image_url);
      if (id) photos.add(id);
    }
    return { covered, photos };
  } catch (e) {
    console.warn(`  could not check what has been filed — ${e.name}`);
    return null;
  }
}

const ranked = findings();
if (!ranked.length) {
  console.log('\nNothing scored high enough to write about today. Filing nothing.\n');
  process.exit(0);
}

const filed = await recentlyFiled();
const covered = filed?.covered || null;
const fresh = covered ? ranked.filter(f => !covered.has(f.href)) : ranked;

for (const f of ranked) {
  if (covered?.has(f.href)) {
    console.log(`  skipping [${f.score.toFixed(2)}] ${f.kind} — ${f.subject}: `
      + `already written up as "${covered.get(f.href)}"`);
  }
}

const finding = fresh[0];
if (!finding) {
  console.log(`\nAll ${ranked.length} findings above the threshold have been written about`
    + ` in the last ${COVER_DAYS} days. Filing nothing.\n`);
  process.exit(0);
}

console.log(`\nFinding [${finding.score.toFixed(2)}] ${finding.kind} — ${finding.subject}`);
console.log(`  ${finding.claim}`);
if (finding.caveat) console.log(`  caveat: ${finding.caveat}`);

const user = [
  `FINDING\n${finding.claim}`,
  finding.caveat ? `\nCAVEAT (must appear in the piece)\n${finding.caveat}` : '',
  `\nFIGURES — these and no others\n` + finding.figures
    .map(x => `· ${x.what}: ${x.value} (${x.period}, ${x.source})`).join('\n'),
  `\nThe page for this subject is ${SITE}${finding.href} — link it once, in the prose, by name.`,
].join('\n');

/* claude() returns { text } or { error }, never a bare string — and null when
   no key is set. Each is a different thing to tell somebody. */
const reply = await claude(SYSTEM, [{ role: 'user', content: user }], { maxTokens: 2600 });
if (!reply) {
  console.error('\nANTHROPIC_API_KEY is not set, so nothing can be written.\n');
  process.exit(1);
}
if (reply.error) {
  console.error(`\nThe writer failed: ${reply.error}. Nothing filed.\n`);
  process.exit(1);
}
const art = firstJson(reply.text);
if (!art?.title || !art?.content_html) {
  console.error('\nThe writer did not return usable JSON. Nothing filed.\n');
  console.error(String(reply.text).slice(0, 400));
  process.exit(1);
}

/* The graphic is substituted here, not by the model: it is a URL carrying
   measured values, and a model asked to build one would be writing figures
   into a query string. */
const chart = chartFor(finding);
const figure = `<figure><img src="${chart}" alt="${finding.claim.replace(/"/g, "'")}" />`
  + `<figcaption>${finding.figures[0].source} · ${finding.figures[0].period}</figcaption></figure>`;
art.content_html = String(art.content_html).includes('{{CHART}}')
  ? art.content_html.replace('{{CHART}}', figure)
  : art.content_html + figure;

/* The title and the finding, never the subject's name. photo.js only ever
   matches against this text; the proper noun in it is not searched for. */
const photo = await photograph(art.title, `${finding.kind} ${finding.claim || ''}`,
                               filed?.photos || new Set());

const row = {
  ...art,
  ...(photo ? {
    header_image_url: photo.header_image_url,
    unsplash_photographer_name: photo.unsplash_photographer_name,
    unsplash_photographer_profile_url: photo.unsplash_photographer_profile_url,
    unsplash_download_location: photo.unsplash_download_location,
  } : {}),
  category: 'note',
  tags: [finding.kind, String(finding.subject).toLowerCase()].slice(0, 4),
  /* The finding's own subject page is the source: it is where every figure in
     the piece can be checked against the filed record. */
  source_urls: [`${SITE}${finding.href}`],
};

if (DRY) {
  console.log(`\n── ${row.title}\n${row.excerpt}\n`);
  console.log('photograph:', row.header_image_url || 'none', '\n');
  console.log(row.content_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 900) + '…\n');
  console.log('chart:', chart, '\n');
  process.exit(0);
}

/* ── THE SECRET IS A HEADER, NOT A FIELD ──────────────────────────────────
   This sent it in the body and the first scheduled run came back 401. The
   shape was copied from the Make blueprint's notify call, which posts
   {"secret": …} to a DIFFERENT endpoint — /api/webhook/article reads
   Authorization: Bearer, and reads nothing from the body but the article.

   Had it been accepted it would have been worse: a body field is stored, so
   the secret would have been written onto the article row. */
const res = await fetch(`${SITE}/api/webhook/article`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${process.env.ARTICLE_WEBHOOK_SECRET || ''}`,
  },
  body: JSON.stringify(row),
});
const out = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`\nThe webhook refused it — HTTP ${res.status}: ${out.error || ''}`);
  if (out.duplicateOf) console.error(`It repeats "${out.duplicateOf.title}".`);
  /* 409 is the duplicate check, and a repeated story is a normal morning
     rather than a breakage — the run above has already skipped everything it
     knew was covered, so this is the title check catching something the
     subject page could not. Every other refusal is a real failure. */
  process.exit(res.status === 409 ? 0 : 1);
}
console.log(`\nFiled as a draft: ${row.title}\nRead it at ${SITE}/studio\n`);

/* ── AND THEN TELL SOMEBODY ────────────────────────────────────────────────
   The desk filed drafts on 10 and 11 September and nobody was told about
   either. Both runs were green, because filing is what they were asked to do
   and filing is what they did.

   The notification was only ever wired for the OTHER supply. Make.com posts
   kind:'articles' straight to the Apps Script, which appends a row to the
   Articles tab and WhatsApps the title — see artFromMake_ in
   scripts/10_Articles.gs. The desk posts to this site's webhook instead,
   which stores the row in Supabase and makes exactly one outbound call, to
   Unsplash, for the licence ping. The bot reads a Google Sheet. It has never
   had any way of knowing a desk article exists.

   Which is also why /drafts in WhatsApp would have shown nothing: it reads
   the same sheet.

   So this posts the same shape Make posts, to the same endpoint, and
   artFromMake_ does the rest — the row lands on the Articles tab, the message
   goes out, and /pub N and /skip N work on a desk piece exactly as they work
   on a pipeline one. No Apps Script change.

   IT NEVER FAILS THE RUN. The article is filed by the time this is called and
   a notification is not worth losing it over. But it is LOUD when it cannot
   send, because a quiet notification failure is the bug this exists to fix. */
async function notifyBot(filed) {
  /* The same /exec as CRM_WEBHOOK_URL — one Apps Script deployment serves
     both. Set them to the same value. */
  const url = process.env.APPS_SCRIPT_URL;
  const k = process.env.WA_WEBHOOK_KEY;
  const secret = process.env.MAKE_SECRET;
  if (!url || !k || !secret) {
    console.warn('  NOT NOTIFIED. '
      + [!url && 'APPS_SCRIPT_URL', !k && 'WA_WEBHOOK_KEY', !secret && 'MAKE_SECRET']
        .filter(Boolean).join(', ')
      + ' is not set, so the article is filed and nothing will say so.\n');
    return;
  }
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}k=${encodeURIComponent(k)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'articles',
        secret,
        items: [{
          id: filed.id || '', slug: filed.slug || row.slug, title: row.title,
          category: row.category, excerpt: row.excerpt,
          sources: row.source_urls || [],
        }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    /* Apps Script answers 200 with ok_() whatever happens, including when
       verifyRequest_ rejects the URL key — so a 200 is not evidence a message
       was sent, and this must not claim it was. The only honest thing to
       report is that the endpoint answered. */
    console.log(res.ok
      ? `  Bot notified — the Apps Script answered ${res.status}. If no message arrives,\n`
        + '  the ?k= key did not match WA_WEBHOOK_KEY: doPost returns OK and does nothing.'
      : `  NOT NOTIFIED. The Apps Script answered ${res.status}.`);
  } catch (e) {
    console.warn(`  NOT NOTIFIED. ${e.name === 'TimeoutError' ? 'The Apps Script timed out' : e.message}.`);
  }
}
await notifyBot(out);
