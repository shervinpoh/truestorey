/**
 * URA's residential development pipeline — what is coming, and where.
 *
 *   npm run ingest:pipeline
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ───────────────────────────────────────
 * This was reached for as "developer sales" and that endpoint does not exist.
 * URA's Data Service carries no PMI_Resi_Developer_Sales — it answers "Invalid
 * input" — so the monthly units-launched / units-sold / unsold-inventory
 * survey is not available here, and the launch half of `npm run scan` still
 * cannot see how much of a project is left unsold. That limitation stands.
 *
 * What PMI_Resi_Pipeline does carry is the pipeline itself: 78 projects,
 * 28,730 units, by developer, district and street, with a unit breakdown by
 * property type. That is future supply, which is a different question from
 * how a launch is selling and a better one for `outlook` and `scan` — a
 * project's own sales pace is about the project, but what is being built
 * within a kilometre is about every home near it.
 *
 * ── THE TOP YEAR IS MOSTLY MISSING AND THAT IS THE HEADLINE CAVEAT ─────────
 * 23,395 of the 28,730 units carry `expectedTOPYear: "na"` — 81%. So this
 * says what is coming and roughly where, and for four fifths of it says
 * nothing about when. `datedUnits` and `undatedUnits` are stored separately
 * rather than summed, because a supply timeline built by quietly treating
 * "na" as "soon" or as "never" would be wrong in whichever direction it chose.
 */
import fs from 'node:fs/promises';

const TOKEN_URL = 'https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1';
const DATA_URL = 'https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1';
const SERVICE = 'PMI_Resi_Pipeline';

const n = v => Number(v) || 0;

export async function ingestPipeline() {
  const accessKey = process.env.URA_ACCESS_KEY;
  if (!accessKey) {
    console.error('URA_ACCESS_KEY is not set. Free key: https://eservice.ura.gov.sg/maps/api/reg.html');
    process.exit(1);
  }
  const accessedAt = new Date().toISOString();

  const t = await (await fetch(TOKEN_URL, { headers: { AccessKey: accessKey } })).json();
  const token = t.Result;
  if (!token) throw new Error(`no token: ${JSON.stringify(t).slice(0, 200)}`);

  const res = await fetch(`${DATA_URL}?service=${SERVICE}`, {
    headers: { AccessKey: accessKey, Token: token, 'User-Agent': 'Mozilla/5.0' },
  });
  const json = await res.json();
  if (json.Status !== 'Success' || !Array.isArray(json.Result)) {
    /* Say what arrived rather than "the schema may have changed", which is not
       a diagnosis — the note in CLAUDE.md about the map ingest is why. */
    throw new Error(`URA returned ${json.Status}: ${String(json.Message || '').slice(0, 200)}`);
  }

  const projects = json.Result.map(r => ({
    project: r.project,
    developer: r.developerName || null,
    street: r.street || null,
    district: r.district || null,
    /* "na" is preserved as null, never coerced to a year. */
    expectedTOP: /^\d{4}$/.test(String(r.expectedTOPYear)) ? Number(r.expectedTOPYear) : null,
    units: {
      apartment: n(r.noOfApartment), condo: n(r.noOfCondo), terrace: n(r.noOfTerrace),
      semiDetached: n(r.noOfSemiDetached), detached: n(r.noOfDetachedHouse),
    },
    totalUnits: n(r.totalUnits),
  })).sort((a, b) => b.totalUnits - a.totalUnits);

  const dated = projects.filter(p => p.expectedTOP);
  const byYear = {};
  for (const p of dated) byYear[p.expectedTOP] = (byYear[p.expectedTOP] || 0) + p.totalUnits;

  const out = {
    source: 'URA Residential Development Pipeline (URA Data Service)',
    service: SERVICE,
    licence: 'URA Data Service — attribution required, see https://www.ura.gov.sg/maps/api/',
    accessedAt,
    projects: projects.length,
    totalUnits: projects.reduce((s, p) => s + p.totalUnits, 0),
    datedProjects: dated.length,
    datedUnits: dated.reduce((s, p) => s + p.totalUnits, 0),
    undatedProjects: projects.length - dated.length,
    undatedUnits: projects.filter(p => !p.expectedTOP).reduce((s, p) => s + p.totalUnits, 0),
    byExpectedTOP: byYear,
    caveat: 'Expected TOP is missing on most of this pipeline and is stored as null rather than '
          + 'guessed. Any supply timeline built from it covers only the dated share and must say so.',
    list: projects,
  };

  await fs.writeFile(new URL('../data/pipeline.json', import.meta.url), JSON.stringify(out, null, 1));
  console.log(`Wrote data/pipeline.json — ${out.projects} projects, ${out.totalUnits.toLocaleString()} units`);
  console.log(`  ${out.datedUnits.toLocaleString()} units carry an expected TOP year (${(100 * out.datedUnits / out.totalUnits).toFixed(0)}%)`);
  console.log(`  ${out.undatedUnits.toLocaleString()} do not, and are not guessed at`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestPipeline().catch(e => { console.error('\nINGEST FAILED:', e.message); process.exit(1); });
}
