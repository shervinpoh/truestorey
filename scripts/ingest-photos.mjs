/**
 * Turn photos off a phone into something publishable.
 *
 *   1. drop originals into  photos-in/
 *   2. describe each one in photos-in/photos.json
 *   3. npm run photos
 *
 * WHAT THIS SOLVES, in the order the problems bite.
 *
 * GPS. A photo off a phone carries EXIF, and EXIF carries the coordinates of
 * wherever it was taken — which for photographs of housing is somebody's home,
 * and for photographs taken from a window is the photographer's. Publishing
 * that is a PDPA problem the moment the file is served. Every JPEG written by
 * this script has its APP1/EXIF segment removed and the script verifies the
 * removal rather than assuming it.
 *
 * SIZE. A modern phone writes 4000px and eight megabytes. Committing that is a
 * repo nobody can clone and a page nobody on mobile data will wait for. Source
 * files are resized to 2000px and re-encoded; next/image does the rest at
 * request time, which is why there is no sharp, no imagemin and no new
 * dependency here — Next already carries an image optimiser and Vercel runs it.
 *
 * PROVENANCE. CEA PG 02-11 and the design brief both land in the same place: a
 * photograph on a property page is EVIDENCE, and evidence that does not say
 * what it shows is decoration pretending otherwise. So a file with no entry in
 * photos.json is refused, not published with a blank caption. The required
 * fields are what a caption needs to be honest:
 *
 *   { "IMG_4821.jpeg": {
 *       "slug":  "amk-406-facade",            what it becomes on disk
 *       "alt":   "The east face of Blk 406…",  for a screen reader, always
 *       "place": "Blk 406 Ang Mo Kio Ave 10",  where this actually is
 *       "taken": "2026-08",                    when
 *       "exact": true                          IS this the named block?
 *   } }
 *
 * `exact` is the field that matters. True means this photograph is genuinely
 * the building it will be shown beside. False means it is context — a street,
 * an estate, a covered walkway — and the site must label it as context and
 * must never let it sit where a reader would read it as the property. There is
 * no default: leaving it out is an error, because the failure mode of guessing
 * is a generic HDB photo captioned as somebody's specific home.
 *
 * ORIGINALS ARE NOT COMMITTED. photos-in/ is gitignored. Only the derivatives
 * in public/photos/ and the manifest go into the repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const IN = path.join(ROOT, 'photos-in');
const OUT = path.join(ROOT, 'public', 'photos');
const MANIFEST = path.join(ROOT, 'data', 'photos.json');
const MAX_EDGE = 2000;

const REQUIRED = ['slug', 'alt', 'place', 'taken', 'exact'];

/**
 * Strip every APP1 segment from a JPEG.
 *
 * A JPEG is 0xFFD8 then a run of marker segments. APP1 (0xFFE1) is where EXIF
 * and XMP live, and GPS lives inside EXIF. Everything up to the start-of-scan
 * marker is segment-structured and safe to walk; after SOS the rest is entropy
 * coded and must be copied verbatim.
 *
 * Written out by hand rather than shelled out to exiftool because exiftool is
 * not on a stock Mac, and a step that only works on the machine that wrote it
 * is not a pipeline.
 */
function stripExif(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return buf;      // not a JPEG, leave it
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xFF) break;                            // desynced; stop here
    const marker = buf[i + 1];
    if (marker === 0xDA) { out.push(buf.subarray(i)); break; }   // SOS: copy the rest
    if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD9)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker !== 0xE1) out.push(buf.subarray(i, i + 2 + len));  // keep everything but APP1
    i += 2 + len;
  }
  return Buffer.concat(out);
}

/** True if any APP1 segment survives. Used to verify, not to trust. */
function hasExif(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return false;
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xFF) return false;
    const marker = buf[i + 1];
    if (marker === 0xDA) return false;
    if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD9)) { i += 2; continue; }
    if (marker === 0xE1) return true;
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return false;
}

if (!fs.existsSync(IN)) {
  console.log(`No photos-in/ directory. Create it, drop photos in, describe them in
photos-in/photos.json, then run this again.`);
  process.exit(0);
}

const descPath = path.join(IN, 'photos.json');
if (!fs.existsSync(descPath)) {
  console.error(`✗  photos-in/photos.json is missing.

Every photograph needs to say what it shows before it can be published. Create
that file with one entry per image:

{
  "IMG_4821.jpeg": {
    "slug":  "amk-406-facade",
    "alt":   "The east face of Blk 406 Ang Mo Kio Ave 10, seen from the car park",
    "place": "Blk 406 Ang Mo Kio Ave 10",
    "taken": "2026-08",
    "exact": true
  }
}

"exact": true means this really is that building. false means it is context —
a street, an estate, a walkway — and the site will label it as context.`);
  process.exit(1);
}

const desc = JSON.parse(fs.readFileSync(descPath, 'utf8'));
const files = fs.readdirSync(IN).filter(f => /\.(jpe?g|png|heic)$/i.test(f));
if (!files.length) { console.log('photos-in/ has no images in it yet.'); process.exit(0); }

fs.mkdirSync(OUT, { recursive: true });
const manifest = [];
let failed = 0;

for (const file of files) {
  const d = desc[file];
  if (!d) {
    failed++;
    console.error(`✗  ${file} — no entry in photos.json. Not published.`);
    continue;
  }
  const missing = REQUIRED.filter(k => d[k] === undefined || d[k] === '');
  if (missing.length) {
    failed++;
    console.error(`✗  ${file} — missing ${missing.join(', ')}. Not published.`);
    continue;
  }
  if (typeof d.exact !== 'boolean') {
    failed++;
    console.error(`✗  ${file} — "exact" must be true or false, not a guess. Not published.`);
    continue;
  }

  const dest = path.join(OUT, `${d.slug}.jpg`);
  // sips ships with macOS, so resizing costs no dependency. It also re-encodes,
  // which is what lets the EXIF strip below work on a clean single-frame JPEG.
  try {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80',
      '-Z', String(MAX_EDGE), path.join(IN, file), '--out', dest], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`✗  ${file} — sips could not convert it: ${e.message.split('\n')[0]}`);
    continue;
  }

  const cleaned = stripExif(fs.readFileSync(dest));
  fs.writeFileSync(dest, cleaned);
  if (hasExif(fs.readFileSync(dest))) {
    failed++;
    fs.unlinkSync(dest);
    console.error(`✗  ${d.slug} — EXIF survived the strip. Deleted rather than published.`);
    continue;
  }

  const kb = Math.round(fs.statSync(dest).size / 1024);
  manifest.push({
    slug: d.slug, src: `/photos/${d.slug}.jpg`, alt: d.alt, place: d.place,
    taken: d.taken, exact: d.exact, credit: d.credit || 'Shervin Poh', kb,
  });
  console.log(`✓  ${d.slug}  ${kb}KB  ${d.exact ? 'exact building' : 'context only'}`);
}

manifest.sort((a, b) => a.slug.localeCompare(b.slug));
fs.writeFileSync(MANIFEST, JSON.stringify({
  builtAt: new Date().toISOString(),
  note: 'EXIF stripped at ingest. "exact" false means the image is context, not the named building.',
  photos: manifest,
}, null, 1) + '\n');

console.log(`\n${manifest.length} published to public/photos/, manifest at data/photos.json`);
if (failed) { console.error(`${failed} refused. Nothing was published for those.`); process.exit(1); }
