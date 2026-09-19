/**
 * The periodic deep dive — where to go looking, across the whole island.
 *
 *   npm run scan                      both halves
 *   npm run scan -- --only hdb --top 30
 *   npm run scan -- --only launch
 *
 * ── WHAT THIS IS, AND THE THING IT IS NOT ──────────────────────────────────
 * It is NOT a list of underpriced listings. This repo holds no listings and
 * there is no lawful free feed of one — `comps.json` holds 13,168 addresses
 * where something SOLD, which is a different thing from something being for
 * sale. Ranking transacted addresses and calling the result "properties for
 * sale" would be a lie in the first column.
 *
 * What it is: a list of BLOCKS trading away from what their own neighbourhood
 * predicts, with the part that visible risk explains already stripped out.
 * That is a farming list — where to knock, whose flats to watch, which
 * project to read up on before the listing appears — and it is arguably the
 * more useful of the two, because every agent on the island sees the same
 * listings and none of them see this.
 *
 * ── THE MEASUREMENT, AND WHY IT IS NOT CIRCULAR ────────────────────────────
 * Pricing a block off its own sales and then comparing the answer to its own
 * sales measures nothing — the gap is zero by construction. So the estimator
 * runs TWICE over DISJOINT cohorts:
 *
 *   self        only sales at this address
 *   neighbours  only sales at other addresses, radius widening as usual
 *
 * Identical floor curve, identical index restatement, identical weighting on
 * both sides. The gap between them is "what this block actually trades at
 * against what its neighbourhood says it should", and because the machinery
 * is shared, the difference cannot be an artefact of the machinery.
 *
 * ── THE THRESHOLD IS CONSERVATIVE ON PURPOSE ───────────────────────────────
 * A gap between two estimates carries both their errors. They are added in
 * quadrature, which ASSUMES INDEPENDENCE and they are not independent — both
 * sides share the floor curve, the index and the weights, so their errors move
 * together and the true gap error is smaller than the figure used. Erring that
 * way produces a shorter list of stronger candidates, which is the right
 * failure mode for something whose output is "spend a Saturday on this".
 */
import fs from 'node:fs';
import { comps, floorMid } from '../lib/blindspot/measure.js';
import { estimate } from '../lib/consult/avm.js';
import { residual, EXPLAINERS } from '../lib/consult/residual.js';
import { recordByHref } from '../lib/data/query.js';
import { analyse } from '../lib/blindspot/analyse.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const ONLY = arg('only', 'both');
const TOP = Number(arg('top', 20));
const MIN_OWN = Number(arg('min-own', 5));
const SQFT_PER_SQM = 10.7639;

const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : null; };
const modal = a => { const c = {}; let b = null; for (const v of a) { c[v] = (c[v] || 0) + 1; if (!b || c[v] > c[b]) b = v; } return b; };
const f = n => Number(n).toLocaleString('en-SG', { maximumFractionDigits: 0 });
const rule = t => console.log(`\n\x1b[2m───\x1b[0m ${t} \x1b[2m${'─'.repeat(Math.max(0, 72 - t.length))}\x1b[0m`);

/* ── HALF ONE: HDB BLOCKS AGAINST THEIR NEIGHBOURHOOD ──────────────────── */
function scanHdb() {
  /* Collected as well as printed. The scan takes minutes over ten thousand
     blocks, so it is a batch job and not something a web request can wait on —
     the panel reads the file this writes and shows when it was built. */
  const index = comps();
  const all = Object.entries(index.records).filter(([, r]) => r.kind === 'HDB' && Number.isFinite(r.lat));
  console.log(`Scanning ${all.length.toLocaleString()} HDB addresses with a coordinate…`);

  const candidates = [];
  let tooThin = 0, noSelf = 0, noNear = 0, done = 0;

  for (const [href, meta] of all) {
    if (++done % 500 === 0) process.stdout.write(`\r  ${done}/${all.length}  candidates ${candidates.length}`);
    const sales = meta.sales || [];
    if (sales.length < MIN_OWN) { tooThin++; continue; }

    /* Describe the block by what it actually is: its commonest flat type, the
       median size of that type, and the middle of its filed storeys. Anything
       else would be pricing a unit the block does not contain. */
    const type = modal(sales.map(s => s[3]));
    const ofType = sales.filter(s => s[3] === type);
    const areaSqm = med(ofType.map(s => s[2]));
    if (!(areaSqm > 0)) { tooThin++; continue; }
    const areaSqft = areaSqm * SQFT_PER_SQM;

    /**
     * ── BOTH COHORTS ARE RESTATED ONTO THE SAME FLOOR ────────────────────
     * The first cut passed an area and no storey, so neither side was moved
     * onto a common floor. That is consistent — the same non-adjustment on
     * both — and it is still wrong, because the two cohorts have DIFFERENT
     * floor mixes. A block whose own recent sales happened to be low-floor,
     * compared against neighbours whose recent sales happened to be high,
     * reports a gap that is entirely a floor artefact wearing a block's name.
     * And it would rank at the top, because the biggest artefacts make the
     * biggest gaps.
     *
     * The block's own median storey is the reference: it is the floor this
     * block actually is, and restating both sides onto it cancels the mix.
     */
    const floors = sales.map(s => floorMid(s[4])).filter(Number.isFinite);
    const floor = floors.length ? med(floors) : null;

    const rec = recordByHref(href);
    if (!rec?.recent?.length) { tooThin++; continue; }

    /* A stricter effective-sample floor than a lookup uses. Answering a
       question with a thin cohort and a wide error band is reasonable; putting
       a thin cohort at the top of a ranked list is not, because nobody reads
       the error band on row one before driving to Ang Mo Kio. */
    const self = estimate(rec, { areaSqft, floor, cohort: 'self', index, minEffectiveN: 1.0 });
    if (!self.ok) { noSelf++; continue; }
    const near = estimate(rec, { areaSqft, floor, cohort: 'neighbours', index, minEffectiveN: 1.0 });
    if (!near.ok) { noNear++; continue; }

    const gap = (self.psf - near.psf) / near.psf;
    /* Quadrature — see the header. Conservative, because the two sides share
       their machinery and therefore their errors. */
    const e1 = self.error?.medianPct, e2 = near.error?.medianPct;
    const threshold = (e1 != null && e2 != null) ? Math.sqrt(e1 * e1 + e2 * e2) : null;
    if (threshold == null || Math.abs(gap) <= threshold) continue;

    candidates.push({ href, label: meta.label, town: rec.town, type, areaSqft, floor, gap, threshold,
                      selfPsf: self.psf, nearPsf: near.psf, nSelf: self.evidence.sample,
                      nNear: near.evidence.sample });
  }
  console.log(`\r  ${done}/${all.length}  ${candidates.length} survived the noise threshold` + ' '.repeat(20));
  console.log(`  ${tooThin} too thin · ${noSelf} no self cohort · ${noNear} no neighbour cohort`);

  /* ── TEST 2, ON THE SHORTLIST ONLY ──────────────────────────────────────
   * Blindspot is not cheap and it is only relevant to gaps that survived Test
   * 1. Running it on all ten thousand would cost minutes to answer a question
   * about blocks that were never going to be listed. */
  console.log(`  Running Blindspot on ${candidates.length}…`);
  for (const c of candidates) {
    const a = analyse({ href: c.href, areaSqft: c.areaSqft, floor: c.floor });
    const checks = (a?.checks || []).filter(x => EXPLAINERS.includes(x.key));
    c.flagged = checks.filter(x => Number(x.points) > 0).map(x => ({ key: x.key, points: x.points, max: x.max, finding: x.finding }));
    c.ranChecks = checks.length;
    c.couldNotRun = (a?.skipped || []).filter(x => EXPLAINERS.includes(x.key)).map(x => x.key);
  }

  const show = (title, rows, note) => {
    rule(title);
    console.log(`  \x1b[2m${note}\x1b[0m\n`);
    console.log(`  ${'block'.padEnd(30)} ${'town'.padEnd(15)} ${'gap'.padStart(7)}  own/near psf   n    flagged`);
    for (const c of rows.slice(0, TOP)) {
      console.log(`  ${String(c.label).slice(0, 29).padEnd(30)} ${String(c.town).slice(0, 14).padEnd(15)} `
        + `\x1b[1m${(c.gap > 0 ? '+' : '') + (100 * c.gap).toFixed(1)}%\x1b[0m`.padStart(16)
        + `  ${c.selfPsf}/${c.nearPsf}`.padEnd(14)
        + ` ${String(c.nSelf)}/${c.nNear}`.padEnd(8)
        + ` ${c.flagged.length ? c.flagged.map(x => x.key).join(',') : '\x1b[1mnothing\x1b[0m'}`
        + (c.couldNotRun.length ? ` \x1b[33m(${c.couldNotRun.length} n/a)\x1b[0m` : ''));
    }
  };

  const unexplainedDown = candidates.filter(c => c.gap < 0 && !c.flagged.length).sort((a, b) => a.gap - b.gap);
  const explainedDown = candidates.filter(c => c.gap < 0 && c.flagged.length).sort((a, b) => a.gap - b.gap);
  const unexplainedUp = candidates.filter(c => c.gap > 0 && !c.flagged.length).sort((a, b) => b.gap - a.gap);

  show('BLOCKS TRADING BELOW THEIR NEIGHBOURHOOD — NOTHING VISIBLE EXPLAINS IT',
    unexplainedDown,
    'The residual. Every check that ran came back clear, so what is left is not in the filed data — '
    + 'condition, facing, layout, noise, or a story the market knows and the record does not.');

  show('BELOW, BUT A VISIBLE RISK ARGUES THE SAME WAY',
    explainedDown,
    'Partly explained rather than cheap. The market may be pricing exactly what is flagged.');

  show('ABOVE THEIR NEIGHBOURHOOD, UNEXPLAINED',
    unexplainedUp,
    'Worth as much as the column above and nobody builds it. Either the block carries something '
    + 'genuinely better, or its recent sales are running ahead of the evidence around them.');

  console.log(`\n  \x1b[2mA block trading low is not a flat for sale. This says where to look, not what to buy —`);
  console.log(`  and a block can trade below its neighbours for a reason no dataset holds.\x1b[0m`);

  const slim = c => ({ href: c.href, label: c.label, town: c.town, type: c.type,
                       areaSqft: Math.round(c.areaSqft), floor: c.floor, gap: c.gap,
                       selfPsf: c.selfPsf, nearPsf: c.nearPsf, nSelf: c.nSelf, nNear: c.nNear,
                       flagged: c.flagged, couldNotRun: c.couldNotRun });
  return {
    scanned: all.length,
    unexplainedDown: unexplainedDown.map(slim),
    explainedDown: explainedDown.map(slim),
    unexplainedUp: unexplainedUp.map(slim),
  };
}

/* ── HALF TWO: NEW LAUNCHES AGAINST NEARBY RESALE ──────────────────────── */

/**
 * ── WHY A RAW GAP WOULD BE MEANINGLESS ─────────────────────────────────────
 * A new launch sells at a premium to nearby resale, always, and it should: a
 * fresh 99-year lease against one part-run, new fittings, a developer's
 * warranty, and nobody's cooking in the kitchen. Printing "this launch is 38%
 * above resale in the district" says nothing except that it is a new launch.
 *
 * What carries information is whether THAT PREMIUM IS UNUSUAL. So each project
 * is measured against the median premium of every project in its own market
 * segment, and what is ranked is the difference between the two. A launch
 * priced at a 20% premium where the segment norm is 35% is asking less of a
 * buyer than its peers are — which is a fact about relative pricing and still
 * not a verdict about value.
 *
 * ── WHAT IT CANNOT SEE ─────────────────────────────────────────────────────
 * URA files what was PAID, not what was asked, and only after the fact. Units
 * still unsold are invisible, so a project that launched badly and has sat for
 * a year looks identical to one that sold out in a weekend at the same price.
 * Unit mix is not controlled beyond property type — a project skewed to small
 * units carries a higher psf for that reason alone. Both limits are printed.
 */
function scanLaunch() {
  const priv = JSON.parse(fs.readFileSync('data/private.json', 'utf8'));
  const MONTHS = Number(arg('months', 12));

  /* contractDate is MMYY. Turned into YYYY-MM so months sort lexically, the
     same spelling every other date in this repo uses. */
  const key = d => `20${String(d).slice(2, 4)}-${String(d).slice(0, 2)}`;
  const all = priv.rows.map(r => ({ ...r, m: key(r.contractDate) })).filter(r => Number.isFinite(r.psf) && r.psf > 0);
  const latest = all.map(r => r.m).sort().at(-1);
  const [ly, lm] = latest.split('-').map(Number);
  const from = new Date(ly, lm - 1 - MONTHS, 1);
  const cutoff = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;

  const fam = t => (/freehold|999/i.test(String(t)) ? 'freehold' : 'leasehold');

  /**
   * ── LANDED IS EXCLUDED, AND SO IS URA'S PLACEHOLDER FOR IT ───────────────
   * "LANDED HOUSING DEVELOPMENT" is not a project. It is the label URA files
   * landed transactions under when there is no development name, and it turned
   * up in the first run ranked eighth — 40 "new sales" pooled from unrelated
   * houses across a district, presented as a launch.
   *
   * Landed is dropped entirely rather than just renamed. New-launch-against-
   * resale is a non-landed comparison: a new terrace is a rebuild on a plot
   * somebody already owned, the premium means something different, and the
   * plot is most of the price either way.
   */
  const LANDED = /terrace|semi|detached|house/i;
  const recent = all.filter(r => r.m > cutoff
    && !LANDED.test(String(r.propertyType))
    && !/^LANDED HOUSING/i.test(String(r.project)));

  /* Resale benchmark per district × property type × tenure family. */
  const resale = new Map();
  for (const r of recent) {
    if (r.typeOfSale !== '3') continue;
    const k = `${r.district}|${r.propertyType}|${fam(r.tenure)}`;
    if (!resale.has(k)) resale.set(k, []);
    resale.get(k).push(r.psf);
  }

  const launches = new Map();
  for (const r of recent) {
    if (r.typeOfSale !== '1') continue;
    if (!launches.has(r.project)) launches.set(r.project, []);
    launches.get(r.project).push(r);
  }

  const MIN_NEW = 10, MIN_RESALE = 10;
  const rows = [];
  for (const [project, rs] of launches) {
    if (rs.length < MIN_NEW) continue;
    const r0 = rs[0];
    const k = `${r0.district}|${r0.propertyType}|${fam(r0.tenure)}`;
    const base = resale.get(k);
    if (!base || base.length < MIN_RESALE) continue;
    const newPsf = med(rs.map(x => x.psf));
    const resalePsf = med(base);
    rows.push({ project, district: r0.district, segment: r0.marketSegment, type: r0.propertyType,
                tenure: fam(r0.tenure), n: rs.length, nBase: base.length,
                newPsf: Math.round(newPsf), resalePsf: Math.round(resalePsf),
                premium: newPsf / resalePsf - 1, areaSqm: Math.round(med(rs.map(x => x.areaSqm))) });
  }

  /* The norm each project is judged against is its own segment's. */
  const bySeg = {};
  for (const r of rows) (bySeg[r.segment] ||= []).push(r.premium);
  const norm = {};
  for (const [seg, v] of Object.entries(bySeg)) norm[seg] = med(v);
  for (const r of rows) r.vsNorm = r.premium - (norm[r.segment] ?? 0);

  rule(`NEW LAUNCHES AGAINST NEARBY RESALE — last ${MONTHS} months to ${latest}`);
  console.log(`  \x1b[2m${rows.length} projects with ${MIN_NEW}+ new sales and a resale benchmark of ${MIN_RESALE}+ in the same`);
  console.log(`  district, property type and tenure family. Segment norms: `
    + Object.entries(norm).map(([s, v]) => `${s} ${(100 * v).toFixed(0)}%`).join(' · ') + `\x1b[0m\n`);
  console.log(`  ${'project'.padEnd(28)} ${'seg'.padEnd(4)} ${'D'.padEnd(3)} ${'ten'.padEnd(5)} ${'new'.padStart(6)} ${'resale'.padStart(7)} ${'prem'.padStart(6)} ${'vs norm'.padStart(8)}   n`);
  for (const r of [...rows].sort((a, b) => a.vsNorm - b.vsNorm).slice(0, TOP)) {
    console.log(`  ${r.project.slice(0, 27).padEnd(28)} ${String(r.segment).padEnd(4)} ${String(r.district).padEnd(3)} ${r.tenure.slice(0, 5).padEnd(5)} `
      + `${String(r.newPsf).padStart(6)} ${String(r.resalePsf).padStart(7)} `
      + `${((100 * r.premium).toFixed(0) + '%').padStart(6)} `
      + `\x1b[1m${((r.vsNorm > 0 ? '+' : '') + (100 * r.vsNorm).toFixed(0) + 'pp').padStart(8)}\x1b[0m   ${r.n}/${r.nBase}`);
  }
  /**
   * ── A DISTRICT THAT DOMINATES THE LIST IS ITSELF THE FINDING ─────────────
   * Six of the first ten rows came back District 05, every one measured
   * against the same 2,033 psf benchmark from the same 387 resale sales. When
   * one district fills a ranking, the likelier explanation is that its RESALE
   * POOL is unrepresentative — older leasehold stock, short leases dragging
   * the median down — than that six separate launches are all priced softly.
   * The comparison is only as good as its denominator, and a denominator
   * shared by six rows is one number pretending to be six.
   */
  const shown = [...rows].sort((a, b) => a.vsNorm - b.vsNorm).slice(0, TOP);
  const byD = {};
  for (const r of shown) byD[r.district] = (byD[r.district] || 0) + 1;
  const heavy = Object.entries(byD).filter(([, n]) => n >= Math.max(3, Math.ceil(shown.length / 3)));
  if (heavy.length) {
    console.log(`\n  \x1b[33mCONCENTRATION: ${heavy.map(([d, n]) => `${n} of ${shown.length} rows are District ${d}`).join('; ')}.`);
    console.log(`  They share one resale benchmark, so this may be a finding about that district's`);
    console.log(`  resale pool rather than about the projects. Check the denominator first.\x1b[0m`);
  }

  console.log(`\n  \x1b[2mA premium below the segment norm is a fact about relative pricing, not a verdict`);
  console.log(`  about value. URA files what was PAID and only after the fact — unsold units are`);
  console.log(`  invisible, so a project that has sat for a year looks identical to one that sold`);
  console.log(`  out in a weekend. Unit mix beyond property type is not controlled.\x1b[0m`);
  return { months: MONTHS, latest, norm, rows: [...rows].sort((a, b) => a.vsNorm - b.vsNorm) };
}

const saved = { builtAt: new Date().toISOString(), minOwn: MIN_OWN };
if (ONLY === 'hdb' || ONLY === 'both') saved.hdb = scanHdb();
if (ONLY === 'launch' || ONLY === 'both') saved.launch = scanLaunch();

/**
 * ── WRITTEN, SO THE PANEL DOES NOT HAVE TO RE-RUN IT ──────────────────────
 * Regenerable from data/ in a few minutes, so it is a cache rather than a
 * source: gitignored, and in outputFileTracingExcludes because the tracer
 * reads the disk and not the index. The panel shows `builtAt` beside the
 * table — a farming list whose age is not visible is one somebody will act on
 * a month after the market moved.
 */
fs.writeFileSync('data/.scan.json', JSON.stringify(saved));
console.log(`\n  Wrote data/.scan.json — npm run consult will show it.`);
