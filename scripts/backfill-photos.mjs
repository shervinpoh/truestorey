/**
 * A photograph for the pieces that were filed before there was one.
 *
 *   npm run backfill:photos          add one to every published article without
 *   npm run backfill:photos -- --dry say what it would do, change nothing
 *
 * ── WHY IT IS A ONE-OFF AND NOT A JOB ──────────────────────────────────────
 * Every article the desk files from now on arrives with a picture. The five
 * that came from the Make pipeline predate that and will never get one on
 * their own, because an image is fetched when a piece is written. This closes
 * the gap once; running it again finds nothing and says so.
 *
 * ── IT ONLY EVER ADDS ──────────────────────────────────────────────────────
 * An article that already has a photograph is skipped, never replaced. The
 * point is to fill holes, and quietly swapping somebody's chosen image would
 * be a different and much worse tool.
 */
import { photograph } from '../lib/photo.js';
import { publishedArticles, draftArticles, configured } from '../lib/supabase/rest.js';

const DRY = process.argv.includes('--dry');

if (!configured()) {
  console.error('\nSupabase is not configured here — set SUPABASE_URL and SUPABASE_SECRET_KEY.\n');
  process.exit(1);
}
if (!process.env.UNSPLASH_ACCESS_KEY) {
  console.error('\nUNSPLASH_ACCESS_KEY is not set, so there is nothing to fetch.\n');
  process.exit(1);
}

/* Drafts too: a piece waiting in the queue is one somebody is about to look
   at, and looking at it without its picture is what started this. */
const all = [...await publishedArticles({ limit: 100 }), ...await draftArticles({ limit: 100 })];
const missing = all.filter(a => !a.header_image_url);

console.log(`\n${all.length} articles, ${missing.length} without a photograph.\n`);
if (!missing.length) process.exit(0);

const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/articles`;
const key = process.env.SUPABASE_SECRET_KEY;
let done = 0, skipped = 0;

for (const a of missing) {
  const photo = await photograph();
  if (!photo) { skipped++; console.log(`  — ${a.slug}: no Singapore photograph found, left as it was`); continue; }

  if (DRY) {
    console.log(`  would set ${a.slug} → ${photo.unsplash_photographer_name}`);
    done++;
    continue;
  }

  const res = await fetch(`${url}?id=eq.${encodeURIComponent(a.id)}`, {
    method: 'PATCH',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'content-type': 'application/json', Prefer: 'return=minimal',
    },
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
