/**
 * What is already published, against the rules that now gate publishing.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM THE GATE ───────────────────────────────
 * lib/compliance.js blocks the publish ACTION. Everything published before it
 * existed bypassed it entirely — the gate guards the door and says nothing
 * about the room. One live article carries "The Final Verdict: Do Not Buy",
 * "The only safe way to purchase an older condominium in 2026 is", and "a
 * mathematical impossibility", under a CEA registration number, and no code
 * on this site would have found it.
 *
 * ── WHY IT READS THE LIVE SITE, NOT THE DATABASE ───────────────────────────
 * Both, if it can. Supabase is the accurate source for source_urls, but its
 * keys are not on every machine — and the live pages are what a reader and a
 * regulator actually see, which is the thing being audited. Reading the site
 * needs no credentials and cannot disagree with what is published, because it
 * IS what is published.
 *
 * ── IT DECIDES NOTHING ─────────────────────────────────────────────────────
 * It prints a list. Archiving an article is a judgement about an argument, and
 * this only reports which phrases are in it and whether sources were shown.
 *
 *   npm run audit:articles
 *   npm run audit:articles -- --site https://truestorey.vercel.app
 */
import { scanLanguage, duplicateOf, similarity } from '../lib/compliance.js';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const SITE = String(arg('--site', 'https://truestorey.vercel.app')).replace(/\/$/, '');

const strip = h => h.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'truestorey-audit' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const index = await get(`${SITE}/insights`);
const slugs = [...new Set([...index.matchAll(/href="\/insights\/([^"#]+)"/g)].map(m => m[1]))];
if (!slugs.length) {
  console.log('No articles listed at /insights. Nothing to audit.');
  process.exit(0);
}
console.log(`Auditing ${slugs.length} published articles at ${SITE}\n`);

const seen = [];
let flagged = 0;

for (const slug of slugs) {
  let html;
  try { html = await get(`${SITE}/insights/${slug}`); }
  catch (e) { console.log(`  ${slug}\n    COULD NOT READ — ${e.message}\n`); continue; }

  const title = (/<title>([^<]*)<\/title>/.exec(html)?.[1] || slug).replace(/\s*\|.*$/, '').trim();
  /* The article body only. The sources panel is a sibling, and scanning the
     whole document would read the site chrome and every footer as prose. */
  const article = (/<article[\s\S]*?<\/article>/.exec(html) || [html])[0];
  const words = strip(article).split(' ').filter(Boolean).length;

  const language = scanLanguage(article);
  /* Sources render under this heading — see components/Insight.jsx. Their
     absence on the page is the reader-facing fact, whatever the row says. */
  const hasSources = /What this was written from/i.test(html);
  const dup = duplicateOf({ title, slug }, seen);

  const problems = [];
  if (!hasSources) problems.push('NO SOURCES SHOWN');
  for (const h of language) problems.push(`${h.id}: "${h.found}"`);
  if (dup) problems.push(`DUPLICATE of "${dup.title}" (${dup.score.toFixed(2)})`);

  if (problems.length) {
    flagged++;
    console.log(`  ✗ ${title}`);
    console.log(`    /insights/${slug} · ${words} words`);
    for (const p of problems) console.log(`      · ${p}`);
    console.log();
  }
  seen.push({ slug, title });
}

console.log(`${flagged} of ${slugs.length} articles flagged.`);
if (flagged) {
  console.log('\nNothing here is a verdict on the argument. Prohibited language and missing');
  console.log('sources are facts about the text; what to do with each is yours. Archive from');
  console.log('/studio, or edit the row and republish — the publish gate will re-check it.');
}
/* Non-zero when something is flagged, so this can gate a release later without
   being rewritten. Not wired into `npm test`: the suite must not depend on the
   network or on what happens to be published today. */
process.exit(flagged ? 1 : 0);
