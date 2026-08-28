/**
 * What has actually been approved near a property.
 *
 *   npm run ingest:planning            last 3 years
 *   npm run ingest:planning -- 2024    from 2024 to now
 *
 * URA publishes every planning decision it makes — the application, the
 * address, what was proposed, and whether it was permitted or refused.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A BETTER ANSWER THAN ZONING
 * ─────────────────────────────────────────────────────────────────────────
 *
 * scripts/ingest-zoning.mjs answers what the Master Plan PERMITS within 300m.
 * That is a real thing to know and it is the weaker of the two questions: a
 * plot ratio of 2.8 has been sitting on a piece of land for years and may sit
 * there for years more.
 *
 * A written permission for a 32-storey building is not a permission, it is a
 * decision. Someone applied, URA said yes, and the address is published. That
 * is much closer to "what could be built next door" than a zoning category,
 * and unlike the unit-level products the agent portals sell, it is open data
 * on the same URA Data Service this repo already uses for private
 * transactions.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS KEPT, AND WHAT IS DELIBERATELY THROWN AWAY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Measured on 2026: 5,568 decisions, of which 1,249 are a change of use and
 * 871 are additions and alterations. Those are somebody re-fitting a shop
 * unit. They are noise against the question this answers and they would bury
 * the one decision that matters, so only applications that CREATE OR REMOVE
 * BUILDING are kept — new erection, its amendments and extensions,
 * subdivision, demolition.
 *
 * A REFUSAL IS KEPT AND LABELLED. 108 of the 5,568 were refused. Dropping them
 * would leave a reader who searched a site seeing nothing, and reading that as
 * "nothing was proposed" rather than "it was proposed and turned down" — which
 * is a different and more useful fact.
 *
 * Addresses are geocoded through OneMap because URA publishes a street, not a
 * coordinate. Some cannot be placed: a few rows carry no address at all, and
 * junction descriptions like "NICOLL HIGHWAY / MIDDLE ROAD / BEACH ROAD" are
 * not one point. Those are counted and reported, never silently dropped, and
 * never guessed at.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { geocodeStreet, geocodeProject, loadCache, saveCache, loadPace, savePace } from './lib/onemap.mjs';

const ROOT = process.cwd();
const TOKEN_URL = 'https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1';
const DATA_URL = 'https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1';
const OUT = path.join(ROOT, 'data', 'planning.json');
const RAW = path.join(ROOT, 'data', '.planning-raw.json');

/**
 * Applications that change how much building is on a piece of land.
 *
 * Change of use and A&A are excluded on purpose — see the header. If this list
 * is widened, the count on the page grows by thousands of shop refits and the
 * check stops meaning anything.
 */
const MATERIAL = /new erection|erection of new|subdivision of land|demolition/i;

async function getToken(accessKey) {
  const res = await fetch(TOKEN_URL, { headers: { AccessKey: accessKey, 'User-Agent': 'Mozilla/5.0' } });
  const json = await res.json();
  if (!json?.Result) throw new Error(`No token: ${JSON.stringify(json).slice(0, 200)}`);
  return json.Result;
}

async function fetchYear(accessKey, token, year) {
  const res = await fetch(`${DATA_URL}?service=Planning_Decision&year=${year}`, {
    headers: { AccessKey: accessKey, Token: token, 'User-Agent': 'Mozilla/5.0' },
  });
  const json = await res.json();
  if (json?.Status !== 'Success') {
    throw new Error(`${year}: ${json?.Message || JSON.stringify(json).slice(0, 200)}`);
  }
  return Array.isArray(json.Result) ? json.Result : [];
}

/** URA writes dates as dd/mm/yyyy. */
function isoDate(d) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(d || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function main() {
  const accessKey = process.env.URA_ACCESS_KEY;
  if (!accessKey) {
    console.error('\n  URA_ACCESS_KEY is not set. It is free: https://eservice.ura.gov.sg/maps/api/reg.html\n');
    process.exit(1);
  }

  const from = Number(process.argv[2]) || new Date().getFullYear() - 2;
  const to = new Date().getFullYear();
  const years = [];
  for (let y = from; y <= to; y++) years.push(y);

  console.log(`URA planning decisions — ${years.join(', ')}`);
  const token = await getToken(accessKey);

  let all = [];
  for (const y of years) {
    const rows = await fetchYear(accessKey, token, y);
    console.log(`  ${y}: ${rows.length.toLocaleString('en-SG')} decisions`);
    all = all.concat(rows);
  }

  // Raw first, before any filtering. The map ingest failed once on a markup
  // change and could not say what it had actually received.
  await fs.writeFile(RAW, JSON.stringify(all));

  const material = all.filter(r => MATERIAL.test(r.appl_type || ''));
  console.log(`  material applications: ${material.length.toLocaleString('en-SG')} of ${all.length.toLocaleString('en-SG')}`);

  await loadCache();
  await loadPace();

  const out = [];
  const unplaced = { noAddress: 0, junction: 0, notFound: 0 };
  let done = 0;
  for (const r of material) {
    const address = String(r.address || '').trim();
    if (++done % 200 === 0) console.log(`    geocoding ${done}/${material.length}…`);

    if (!address || address === 'undefined') { unplaced.noAddress++; continue; }
    // A junction is not a point. Refusing is better than placing it on one of
    // the three roads and implying a precision the source does not have.
    if (address.includes('/')) { unplaced.junction++; continue; }

    const hit = (await geocodeStreet(address)) || (await geocodeProject(address));
    if (!hit) { unplaced.notFound++; continue; }

    out.push({
      date: isoDate(r.decision_date),
      address,
      lat: Math.round(hit.lat * 1e6) / 1e6,
      lon: Math.round(hit.lon * 1e6) / 1e6,
      what: String(r.submission_desc || '').replace(/\s+/g, ' ').trim(),
      applType: r.appl_type || null,
      // Kept verbatim, including refusals. "Proposed and refused" is a
      // different fact from "never proposed", and only one of them is silence.
      decision: r.decision_type || null,
      permitted: /written permission|authorized work|planning clearance/i.test(r.decision_type || ''),
      ref: r.decision_no || r.submission_no || null,
    });
  }

  await saveCache({ force: true });
  await savePace();

  const refused = out.filter(r => !r.permitted).length;
  const payload = {
    source: 'URA Planning Decisions via the URA Data Service',
    sourceUrl: 'https://eservice.ura.gov.sg/maps/api/reg.html',
    licence: 'URA Data Service. The same service this repo uses for private transactions.',
    years,
    accessedAt: new Date().toISOString(),
    note: 'Applications that create or remove building only — new erection, its '
        + 'amendments and extensions, subdivision, demolition. Changes of use and '
        + 'additions/alterations are excluded as noise. Refusals are included and '
        + 'flagged, because a refused proposal is not the same as no proposal.',
    counts: {
      decisionsFetched: all.length,
      material: material.length,
      placed: out.length,
      refused,
      unplaced,
    },
    decisions: out,
  };

  await fs.writeFile(OUT, JSON.stringify(payload));
  const mb = ((await fs.stat(OUT)).size / 1048576).toFixed(1);

  console.log(`  placed        : ${out.length.toLocaleString('en-SG')}`);
  console.log(`  of which refused: ${refused}`);
  console.log(`  not placed    : ${unplaced.noAddress} no address, ${unplaced.junction} junctions, ${unplaced.notFound} not found by OneMap`);
  console.log(`  written       : ${path.relative(ROOT, OUT)}  (${mb} MB)`);
  console.log('\n  Refresh interval: monthly. URA decides continuously and the current '
            + 'year grows all year.\n');
}

main().catch(e => {
  console.error(`\n  ingest:planning failed — ${e.message}\n`);
  process.exit(1);
});
