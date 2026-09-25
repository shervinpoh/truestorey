/**
 * Give the articles already filed a photograph of the place they are about.
 *
 *   npm run backfill:covers               every article, published and draft
 *   npm run backfill:covers -- --dry      say what it would choose, change nothing
 *   npm run backfill:covers -- --only=a-slug,b-slug
 *
 * New articles get one at intake (app/api/webhook/article) and from the desk.
 * This is for the ones filed before lib/cover.js existed, all of which carry a
 * stock photograph of an object chosen by lib/photo.js.
 *
 * ── IT REPLACES A STOCK PHOTOGRAPH, NEVER A CHOSEN ONE ─────────────────────
 * An Unsplash image, or none, is replaced when a Commons photograph passes.
 * A Commons cover already on the row is left alone unless --only names it:
 * that one was chosen by this same rule or by a person, and rerunning a
 * selection should not quietly change what readers have already seen.
 *
 * When nothing passes, the row is left exactly as it was. A stock photograph
 * is a worse picture than a photograph of the place, and a better one than a
 * grey rectangle.
 *
 * ── WHAT IT KEEPS ──────────────────────────────────────────────────────────
 * Every row it changes is written first to data/.covers-undo.json, with the
 * image and credit it had, so a run can be put back by hand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { findCover, coverId, readCover } from '../lib/cover.js';
import { placeOf } from '../lib/place.js';
import { claude } from '../lib/ai/providers.js';
import { configured } from '../lib/supabase/rest.js';

const DRY = process.argv.includes('--dry');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '')
  .slice(7).split(',').map(s => s.trim()).filter(Boolean);

if (!configured() || !process.env.SUPABASE_SECRET_KEY) {
  console.error('\nSupabase is not configured here — set SUPABASE_URL and SUPABASE_SECRET_KEY.\n');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('\nANTHROPIC_API_KEY is not set: each photograph will be the top-scoring one, unseen.\n');
}

const base = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/articles`;
const key = process.env.SUPABASE_SECRET_KEY;
const auth = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' };

const res = await fetch(`${base}?select=id,slug,title,status,tags,source_urls,header_image_url,`
  + 'unsplash_photographer_name,unsplash_photographer_profile_url,unsplash_download_location'
  + '&status=in.(published,draft)&order=created_at.asc&limit=200', { headers: auth });
if (!res.ok) { console.error(`Could not read the articles — HTTP ${res.status}`); process.exit(1); }
const rows = await res.json();

/* Seeded with every Commons photograph already in use, and grown as this run
   chooses, so three notes on one tender get three photographs. */
const avoid = new Set(rows.map(r => coverId(r.header_image_url)).filter(Boolean));
const undoFile = path.join(process.cwd(), 'data', '.covers-undo.json');
const undo = fs.existsSync(undoFile) ? JSON.parse(fs.readFileSync(undoFile, 'utf8')) : [];

let changed = 0, kept = 0;
for (const r of rows) {
  if (ONLY.length && !ONLY.includes(r.slug)) continue;
  if (!ONLY.length && readCover(r.header_image_url)) { kept++; continue; }

  console.log(`\n${r.status.padEnd(9)} ${r.slug}`);
  const found = await findCover(
    { title: r.title, slug: r.slug, tags: r.tags || [], sources: r.source_urls || [] },
    { placeOf, avoid, claude, log: console.log });
  if (!found.url) { console.log(`  kept as it is — ${found.reason}`); kept++; continue; }

  const id = coverId(found.url);
  if (id) avoid.add(id);
  const c = readCover(found.url);
  console.log(`  → ${c.shows}${c.taken ? `, ${c.taken}` : ''} · ${c.by} · ${c.licence}`);
  if (DRY) continue;

  undo.push({ at: new Date().toISOString(), id: r.id, slug: r.slug,
    header_image_url: r.header_image_url, unsplash_photographer_name: r.unsplash_photographer_name,
    unsplash_photographer_profile_url: r.unsplash_photographer_profile_url,
    unsplash_download_location: r.unsplash_download_location });
  fs.writeFileSync(undoFile, JSON.stringify(undo, null, 1));

  const patch = await fetch(`${base}?id=eq.${encodeURIComponent(r.id)}`, {
    method: 'PATCH', headers: { ...auth, Prefer: 'return=minimal' },
    /* The Unsplash credit goes with the Unsplash image. Left behind, it would
       credit a stranger for a photograph they did not take. */
    body: JSON.stringify({ header_image_url: found.url, unsplash_photographer_name: null,
      unsplash_photographer_profile_url: null, unsplash_download_location: null }),
  });
  if (!patch.ok) { console.error(`  NOT SAVED — HTTP ${patch.status}`); continue; }
  changed++;
}
console.log(`\n${DRY ? 'Would change' : 'Changed'} ${DRY ? rows.length - kept : changed}; left ${kept} as they were.\n`);
