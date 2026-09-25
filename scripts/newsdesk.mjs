/**
 * The news desk: one agency release a day, written from the release itself
 * and from this site's data.
 *
 *   npm run newsdesk            find, write, file as a draft
 *   npm run newsdesk -- --dry   find and write, print it, file nothing
 *   npm run newsdesk -- --url=https://www.ura.gov.sg/news/media/pr26-66/
 *
 * ── WHAT IT REPLACES ───────────────────────────────────────────────────────
 * The Make scenario: Perplexity found a release, Gemini chose an angle, and
 * Claude wrote 900 words from the headline and the angle. The writer never
 * saw the release or any of this site's data, and was told to "write as him".
 * Every note it published carried no figures and two of them invented Shervin
 * watching couples at viewings. That scenario can be switched off in Make;
 * this does its job with the release in hand.
 *
 * ── THE ORDER OF THINGS ────────────────────────────────────────────────────
 *   1. lib/editorial/sources.js reads URA's and HDB's news pages directly.
 *   2. Anything already written about — by URL or by title — is skipped.
 *   3. The most useful uncovered release wins: a rule change over a price
 *      over an award over a closing.
 *   4. lib/editorial/packs.js adds what this site holds about the place.
 *   5. lib/editorial/write.js writes it and verify.js checks it.
 *   6. The webhook files it as a draft, with a photograph of the place.
 *
 * A day with nothing new files nothing and says so.
 */
import { recentReleases, readRelease, weight } from '../lib/editorial/sources.js';
import { releasePack } from '../lib/editorial/packs.js';
import { write } from '../lib/editorial/write.js';
import { recentArticles, fileDraft, notifyBot, refuseLocalhost } from '../lib/editorial/file.js';
import { duplicateOf } from '../lib/compliance.js';

const DRY = process.argv.includes('--dry');
const ONE = (process.argv.find(a => a.startsWith('--url=')) || '').slice(6);
const SITE = refuseLocalhost(DRY);

const filed = await recentArticles(90);
if (!filed) console.warn('  could not read what has been filed; the webhook\'s duplicate check is the backstop');
const covered = new Set((filed || []).flatMap(a => a.source_urls || []));

let release;
if (ONE) {
  const agency = /hdb\.gov\.sg/.test(ONE) ? 'HDB' : 'URA';
  release = await readRelease(agency, ONE);
  if (!release) { console.error(`\nCould not read a release at ${ONE}.\n`); process.exit(1); }
} else {
  console.log('\nReading the agencies\' news pages…');
  const found = await recentReleases({ skip: covered, log: console.log });
  const fresh = found.filter(r => !covered.has(r.url)
    && !duplicateOf({ title: r.title, slug: r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') }, filed || []));
  /* A tender closing is only worth a piece when its award is not also out:
     the award says everything the closing did, and who won. */
  const awarded = new Set(fresh.filter(r => /tender award/i.test(r.title)).map(r => r.title.replace(/^.*?sale site at /i, '')));
  const pool = fresh.filter(r => !(/tender closing/i.test(r.title) && awarded.has(r.title.replace(/^.*?sale site at /i, ''))));
  pool.sort((a, b) => weight(b.title) - weight(a.title) || b.iso.localeCompare(a.iso));
  for (const r of found) if (covered.has(r.url)) console.log(`  already written: ${r.title}`);
  release = pool[0];
  if (!release) { console.log(`\nNothing new and residential in the last three weeks. Filing nothing.\n`); process.exit(0); }
}

console.log(`\nWriting: ${release.agency} — ${release.title} (${release.date})`);
const pack = releasePack(release, { site: SITE });
console.log(`  ${pack.figures.length} figures from this site's data, ${pack.facts.length} facts from the release`);

const out = await write(pack, { log: console.log });
if (out.error) {
  console.error(`\n${out.error}`);
  for (const p of out.problems || []) console.error(`  · ${p}`);
  process.exit(1);
}
const row = out.draft;

if (DRY) {
  console.log(`\n── ${row.title}\n${row.excerpt}\n`);
  console.log(row.content_html.replace(/<\/(p|h2|li)>/g, '\n').replace(/<h2>/g, '\n## ').replace(/<[^>]+>/g, '').slice(0, 3000));
  console.log('\nsources:', row.source_urls.join(' · '), '\n');
  process.exit(0);
}

const res = await fileDraft(row);
if (!res.ok) {
  console.error(`\nThe webhook refused it — HTTP ${res.status}: ${res.body.error || ''}`);
  if (res.body.duplicateOf) console.error(`It repeats "${res.body.duplicateOf.title}".`);
  process.exit(res.status === 409 ? 0 : 1);
}
console.log(`\nFiled as a draft: ${row.title}\n  photograph: ${res.body.cover || 'none'}\n  Read it at ${SITE}/studio\n`);
await notifyBot(res.body, row);
