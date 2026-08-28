/**
 * Government Land Sales sites near a property.
 *
 *   npm run ingest:gls
 *
 * Feeds the `gls` check in lib/blindspot/rubric.js: how many units are coming
 * within 1km from land the government has already put up for sale. A site is
 * competition long before it is a comparable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS ONE IS HAND-MAINTAINED AND THE OTHERS ARE NOT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * There is no residential GLS dataset on data.gov.sg. The whole catalogue was
 * searched — 463 pages — and the only Government Land Sales layer is
 * "Industrial Government Land Sales - Sites": 166 features whose attributes
 * are LOT_NO, INC_CRC and FMEL_UPD_D. No unit yields, no launch dates, no
 * residential sites, last updated 2017. It cannot answer this question.
 *
 * URA publishes the programme itself, half-yearly, on its own website. So this
 * reads a hand-transcribed list from data/sources/gls-programme.json and
 * geocodes it, the same way the amenity ingest handles malls and future rail.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE FAILURE MODE THIS FILE EXISTS TO PREVENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A missing mall is a missing dot on a map. A missing GLS site is different:
 * the check would report "No GLS site within 1km", and a reader would take
 * that as a finding rather than as a gap. Absence of evidence reading as
 * evidence of safety is the exact failure the rubric was built to avoid.
 *
 * Three things follow, and none of them is optional:
 *
 *   · An EMPTY list produces no data/gls.json at all. The check then does not
 *     run and says so, which is the honest state. It never runs on zero sites.
 *   · The programme half is recorded and carried through to the page, so the
 *     finding can say WHICH programme it covers. "No GLS site within 1km of
 *     here in the 2026 H2 programme" is a claim. "No GLS site within 1km" is
 *     not.
 *   · A programme older than the current half is refused, not warned about.
 *     A stale list is worse than none, because it looks current.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { geocodeProject, geocodeStreet, loadCache, saveCache, loadPace, savePace } from './lib/onemap.mjs';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'data', 'sources', 'gls-programme.json');
const OUT = path.join(ROOT, 'data', 'gls.json');

/** "2026 H2" -> comparable integer. */
export function halfKey(programme) {
  const m = /^(\d{4})\s*H([12])$/i.exec(String(programme || '').trim());
  if (!m) return null;
  return Number(m[1]) * 2 + (Number(m[2]) - 1);
}

export function currentHalf(now = new Date()) {
  return now.getUTCFullYear() * 2 + (now.getUTCMonth() < 6 ? 0 : 1);
}

async function main() {
  let src;
  try {
    src = JSON.parse(await fs.readFile(SRC, 'utf8'));
  } catch (e) {
    console.error(`\n  Could not read ${path.relative(ROOT, SRC)} — ${e.message}\n`);
    process.exit(1);
  }

  const sites = Array.isArray(src.sites) ? src.sites : [];

  if (!sites.length) {
    // Remove any previous output rather than leaving a stale file behind.
    await fs.rm(OUT, { force: true });
    console.log('\n  No sites listed in data/sources/gls-programme.json.');
    console.log('  data/gls.json removed — the GLS check will not run, and the page says so.');
    console.log('  That is a supported state, not a broken one. See data/sources/README.md.\n');
    return;
  }

  // A list with sites must declare which programme it is, and be current.
  const key = halfKey(src.programme);
  if (key === null) {
    console.error(`\n  "programme" must read like "2026 H2" — got ${JSON.stringify(src.programme)}.`);
    console.error('  The page states which programme the finding covers, so it cannot be blank.\n');
    process.exit(1);
  }
  const now = currentHalf();
  if (key < now) {
    console.error(`\n  The listed programme (${src.programme}) is older than the current half.`);
    console.error('  Refused rather than warned: a stale GLS list looks current and reads as');
    console.error('  a finding. Update it from URA\'s published programme, or empty `sites`');
    console.error('  to switch the check off honestly.\n');
    process.exit(1);
  }

  await loadCache();
  await loadPace();

  const out = [];
  const unplaced = [];
  for (const s of sites) {
    if (!s?.name) continue;
    let lat = Number(s.lat), lon = Number(s.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const hit = (await geocodeProject(s.name, s.street || null))
               || (s.street ? await geocodeStreet(s.street) : null);
      if (hit) { lat = hit.lat; lon = hit.lon; }
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { unplaced.push(s.name); continue; }

    const units = Number(s.units);
    out.push({
      name: s.name,
      lat: Math.round(lat * 1e6) / 1e6,
      lon: Math.round(lon * 1e6) / 1e6,
      // A site with no published yield is kept and counted as zero units, so
      // it still appears on the page — but it must never inflate the total
      // with a guess. NEXT.md's shape expects `units`; null is honest.
      units: Number.isFinite(units) && units > 0 ? units : null,
      status: s.status || null,
      launchDate: s.launchDate || null,
    });
  }

  await saveCache({ force: true });
  await savePace();

  // Every site failed to place. Writing a gls.json with an empty sites array
  // would be worse than writing nothing: glsWithin would still see a file, and
  // a future change that stops guarding on sites.length would start reporting
  // "no GLS nearby" off a list that never resolved.
  if (!out.length) {
    await fs.rm(OUT, { force: true });
    console.error(`\n  None of the ${sites.length} listed sites could be placed: ${unplaced.join(', ')}`);
    console.error('  data/gls.json removed rather than written empty — the check stays off.');
    console.error('  Add lat/lon by hand for these, or correct the names.\n');
    process.exit(1);
  }

  const withUnits = out.filter(s => s.units != null);
  const payload = {
    source: src.publishedBy || 'URA Government Land Sales programme',
    sourceUrl: src.sourceUrl || null,
    programme: src.programme,
    licence: 'Transcribed from URA\'s published programme. Not a data.gov.sg dataset.',
    enteredAt: src.enteredAt || null,
    enteredBy: src.enteredBy || null,
    accessedAt: new Date().toISOString(),
    counts: {
      listed: sites.length,
      placed: out.length,
      withPublishedUnits: withUnits.length,
      unplaced: unplaced.length,
    },
    sites: out,
  };

  await fs.writeFile(OUT, JSON.stringify(payload, null, 1));

  console.log(`\n  programme        : ${src.programme}`);
  console.log(`  sites listed     : ${sites.length}`);
  console.log(`  placed           : ${out.length}`);
  console.log(`  with unit yields : ${withUnits.length}`);
  if (unplaced.length) {
    console.log(`  NOT placed       : ${unplaced.length} — ${unplaced.join(', ')}`);
    console.log('     add lat/lon by hand for these, or correct the name.');
  }
  console.log(`  written          : ${path.relative(ROOT, OUT)}`);
  console.log('\n  Refresh interval: every URA GLS announcement, half-yearly. This is the '
            + 'one file on the site that goes stale on a calendar rather than a feed.\n');
}

main().catch(e => {
  console.error(`\n  ingest:gls failed — ${e.message}\n`);
  process.exit(1);
});
