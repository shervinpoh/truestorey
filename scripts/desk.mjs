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
import { topFinding } from '../lib/findings.js';
import { claude, firstJson } from '../lib/ai/providers.js';

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

const finding = topFinding();
if (!finding) {
  console.log('\nNothing scored high enough to write about today. Filing nothing.\n');
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

const row = {
  ...art,
  category: 'note',
  tags: [finding.kind, String(finding.subject).toLowerCase()].slice(0, 4),
  /* The finding's own subject page is the source: it is where every figure in
     the piece can be checked against the filed record. */
  source_urls: [`${SITE}${finding.href}`],
};

if (DRY) {
  console.log(`\n── ${row.title}\n${row.excerpt}\n`);
  console.log(row.content_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 900) + '…\n');
  console.log('chart:', chart, '\n');
  process.exit(0);
}

const res = await fetch(`${SITE}/api/webhook/article`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ secret: process.env.ARTICLE_WEBHOOK_SECRET, ...row }),
});
const out = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`\nThe webhook refused it — HTTP ${res.status}: ${out.error || ''}`);
  if (out.duplicateOf) console.error(`It repeats "${out.duplicateOf.title}".`);
  process.exit(1);
}
console.log(`\nFiled as a draft: ${row.title}\nRead it at ${SITE}/studio\n`);
