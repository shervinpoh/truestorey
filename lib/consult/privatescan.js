/**
 * The private half of the farming list.
 *
 * Built by scripts/build-private-scan.mjs, where the method and the three
 * things that would make it wrong are written down. Nothing is fitted here at
 * request time — the fit is built, published and then read, same rule as the
 * Blindspot rubric and the land model.
 *
 * ── WHAT EACH NUMBER IS, AND IS NOT ───────────────────────────────────────
 * `gap` — where a project persistently sits against its own district once
 *   size, tenure, remaining lease, storey and property type are held. It is
 *   durable (r=0.72 between early and late halves) and it is mostly ADDRESS:
 *   the two ends of it are Ardmore Park and Wing Fong Court. Read it as a map
 *   of which buildings command a premium, never as a list of mispricings.
 *
 * `districtDrift` — how a district as a whole has moved against the national
 *   index over the window. This is the market story and it is the strongest
 *   thing in the file: CCR and Sentosa down, the outer districts up.
 *
 * `driftVsDistrict` — a project's move once its district's move is removed.
 *   Measured, published, and honestly useless as a forecast: across 591
 *   projects it predicts the next period at r=-0.03. It says what happened.
 *   It says nothing about what happens next, and the tool must not imply it.
 *
 * `per10PctLarger` — the size gradient, straight off each district's fit.
 *   Negative means a bigger unit carries a lower psf there.
 */
import fs from 'node:fs';
import path from 'node:path';

export const VERSION = '2026-09-private-scan-v1';
/* Below this the district fit explains too little for its projects to be
   ranked against each other — D04 sits at 0.06, because Sentosa Cove is not
   described by size, lease and storey in any useful way. */
export const MIN_R2 = 0.25;

let cache = null;
export function model(root = process.cwd()) {
  if (cache && cache.root === root) return cache.data;
  const p = path.join(root, 'data', 'private-scan.json');
  if (!fs.existsSync(p)) return null;
  try { const data = JSON.parse(fs.readFileSync(p, 'utf8')); cache = { root, data }; return data; }
  catch { return null; }
}
export function _clearCache() { cache = null; }

const byDistrict = m => new Map(m.districts.map(d => [d.district, d]));

/**
 * The market story: which districts have moved, and where a big unit is dear.
 */
export function districts({ root = process.cwd() } = {}) {
  const m = model(root);
  if (!m) return { ok: false, reason: 'No private scan has been built. Run `npm run build:private-scan`.' };
  const rows = [...m.districts].sort((a, b) => (a.drift ?? 0) - (b.drift ?? 0));
  const moved = rows.filter(d => d.drift != null);
  const flat = [...rows].sort((a, b) => (b.per10PctLarger ?? -9) - (a.per10PctLarger ?? -9));
  return {
    ok: true, version: m.version, builtAt: m.builtAt, restatedTo: m.restatedTo,
    rows: rows.map(d => ({ ...d, weakFit: d.r2 < MIN_R2 })),
    says: moved.length
      ? `Measured against the national index and holding size, tenure, lease, storey and type constant, `
        + `D${moved[0].district} has moved ${(100 * moved[0].drift).toFixed(1)}% and D${moved.at(-1).district} `
        + `${(100 * moved.at(-1).drift).toFixed(1)}% over the window — a spread of `
        + `${(100 * (moved.at(-1).drift - moved[0].drift)).toFixed(1)} points between two parts of the same island.`
      : 'No district carried enough projects with sales across all three thirds to measure a move.',
    sizeSays: flat.length
      ? `A unit 10% larger carries ${(100 * flat[0].per10PctLarger).toFixed(2)}% more psf in D${flat[0].district} and `
        + `${(100 * flat.at(-1).per10PctLarger).toFixed(2)}% in D${flat.at(-1).district}. `
        + 'Where the figure is near zero a large unit costs the same per foot as a small one; where it is strongly negative, size buys a discount — which is the quantum ceiling, not a view on the building.'
      : null,
  };
}

/**
 * Projects, ranked. `by` is 'gap' (the address map) or 'drift' (what moved).
 */
export function projects({ district = null, by = 'gap', limit = 40, freehold = null, minSales = 0, root = process.cwd() } = {}) {
  const m = model(root);
  if (!m) return { ok: false, reason: 'No private scan has been built. Run `npm run build:private-scan`.' };
  const dm = byDistrict(m);

  let rows = m.projects.filter(p => {
    if (district && p.district !== district) return false;
    if (freehold !== null && p.freehold !== freehold) return false;
    if (p.n < minSales) return false;
    /* A project in a district the fit barely describes is not comparable to
       one in a district it describes well. Excluded rather than ranked
       alongside, and counted so the exclusion is visible. */
    return (dm.get(p.district)?.r2 ?? 0) >= MIN_R2;
  });
  const hidden = m.projects.length - rows.length;

  rows = [...rows].sort(by === 'drift'
    ? (a, b) => (a.driftVsDistrict ?? 0) - (b.driftVsDistrict ?? 0)
    : (a, b) => a.gap - b.gap);

  return {
    ok: true, version: m.version, by, district,
    total: rows.length, hidden,
    rows: rows.slice(0, limit).map(p => ({ ...p, districtR2: dm.get(p.district)?.r2 ?? null })),
    persistence: m.persistence, driftBehaviour: m.driftBehaviour, basis: m.basis,
    says: by === 'drift'
      ? 'Ranked by how far a project has moved against its OWN district. ' + m.driftBehaviour.says
      : 'Ranked by where a project persistently sits against its district. ' + m.persistence.says
        + ' What it is mostly measuring is address and build quality — everything the fit was never given — so read it as a map of which buildings carry a premium, not as a list of mispricings.',
  };
}

/** One project, with its district beside it. */
export function forProject(name, { root = process.cwd() } = {}) {
  const m = model(root);
  if (!m) return null;
  const key = String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const p = m.projects.find(x => x.project.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() === key);
  if (!p) return null;
  return { ...p, districtFit: byDistrict(m).get(p.district) || null };
}
