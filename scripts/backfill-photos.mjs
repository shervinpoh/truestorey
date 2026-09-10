/**
 * A photograph for the pieces that were filed before there was one.
 *
 *   npm run backfill:photos             add one to every article without
 *   npm run backfill:photos -- --dry    say what it would do, change nothing
 *   npm run backfill:photos -- --replace re-pick for every article, including
 *                                       ones that already have a photograph
 *
 * ── WHY IT IS A ONE-OFF AND NOT A JOB ──────────────────────────────────────
 * Every article the desk files from now on arrives with a picture. The five
 * that came from the Make pipeline predate that and will never get one on
 * their own, because an image is fetched when a piece is written. This closes
 * the gap once; running it again finds nothing and says so.
 *
 * ── IT ONLY EVER ADDS, UNLESS TOLD OTHERWISE ───────────────────────────────
 * An article that already has a photograph is skipped. The point is to fill
 * holes, and quietly swapping somebody's chosen image would be a different
 * and much worse tool.
 *
 * --replace is that other tool, and it is a flag rather than the default for
 * exactly that reason. It exists because the SELECTION RULE can change: every
 * photograph here was picked by five fixed searches for the city, so fourteen
 * articles on leases, tenders and stamp duty were all illustrated with the
 * skyline. Re-picking those is not overriding an editor, because no editor
 * chose them. Once somebody sets an image by hand, this flag is the wrong
 * tool and the right answer is to pass the slugs you mean.
 */
import { photograph } from '../lib/photo.js';
import { configured } from '../lib/supabase/rest.js';

const DRY = process.argv.includes('--dry');
const REPLACE = process.argv.includes('--replace');

if (!configured()) {
  console.error('\nSupabase is not configured here — set SUPABASE_URL and SUPABASE_SECRET_KEY.\n');
  process.exit(1);
}
if (!process.env.UNSPLASH_ACCESS_KEY) {
  console.error('\nUNSPLASH_ACCESS_KEY is not set, so there is nothing to fetch.\n');
  process.exit(1);
}

const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/articles`;
const key = process.env.SUPABASE_SECRET_KEY;
const auth = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' };

/* ── THE READ REPORTS ITS OWN FAILURE ─────────────────────────────────────
   This first used publishedArticles(), which returns [] on any error. In CI
   it printed "0 articles" while the same call found 5 published and 10 drafts
   on a laptop, and there was nothing in the output to say why — a swallowed
   error reads exactly like an empty table.

   Drafts are included: a piece waiting in the queue is one somebody is about
   to look at, and looking at it without its picture is what started this. */
/* Published and draft only. An archived piece is one somebody decided against
   and giving it a photograph is work nobody asked for. */
const res = await fetch(
  `${url}?select=id,slug,title,tags,status,header_image_url&status=in.(published,draft)&limit=200`,
  { headers: auth });
if (!res.ok) {
  console.error(`\nSupabase refused the read — HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  console.error('The key or the URL in this environment is not the one that works.\n');
  process.exit(1);
}
const all = await res.json();
const without = all.filter(a => !a.header_image_url);
const todo = REPLACE ? all : without;

console.log(`\n${all.length} articles, ${without.length} without a photograph.`);
console.log(REPLACE
  ? `--replace: re-picking for all ${todo.length}.\n`
  : `Adding to ${todo.length}.\n`);
if (!todo.length) process.exit(0);

let done = 0, skipped = 0;

for (const a of todo) {
  /* Title, slug and tags: whatever says what the piece is about. The slug
     carries the subject when a title is stylish enough to hide it. */
  const photo = await photograph([a.title, a.slug].filter(Boolean).join(' '),
                                 (a.tags || []).join(' '));
  if (!photo) { skipped++; console.log(`  — ${a.slug}: nothing qualified, left as it was`); continue; }

  if (DRY) {
    console.log(`  would set ${a.slug} → ${photo.unsplash_photographer_name}`);
    done++;
    continue;
  }

  const res = await fetch(`${url}?id=eq.${encodeURIComponent(a.id)}`, {
    method: 'PATCH',
    headers: { ...auth, Prefer: 'return=minimal' },
    body: JSON.stringify({
      header_image_url: photo.header_image_url,
      unsplash_photographer_name: photo.unsplash_photographer_name,
      unsplash_photographer_profile_url: photo.unsplash_photographer_profile_url,
      unsplash_download_location: photo.unsplash_download_location,
    }),
  });
  if (!res.ok) { console.error(`  ! ${a.slug}: PATCH ${res.status}`); continue; }

  /* Unsplash requires a download to be registered on every use. The webhook
     does this for a new article; nothing would do it for a backfilled one, and
     the licence does not care which route the photo arrived by. */
  if (photo.unsplash_download_location) {
    await fetch(photo.unsplash_download_location, {
      headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
    }).catch(() => {});
  }
  console.log(`  ✓ ${a.slug} → ${photo.unsplash_photographer_name}`);
  done++;
}

console.log(`\n${DRY ? 'Would set' : 'Set'} ${done}${skipped ? `, left ${skipped} without one` : ''}.\n`);
