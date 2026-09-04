/**
 * Which piece of land a project was built on.
 *
 * HDB's "Sites Sold by HDB" tables name the development that a tendered
 * parcel became — 207 of 216 rows do. That is the only published join between
 * a land sale and a project anywhere in this repo, and it is what lets a
 * record page show the ground under it: the tender that was launched, every
 * bid that came in, and what the winner paid, years before the first unit was
 * filed. URA's sheet carries no project column at all, so no URA site is
 * linked here and none is guessed at.
 *
 * ── WHY THE MATCHING IS DELIBERATELY STUPID ────────────────────────────────
 * These names are transcribed from a PDF and they contain real typos —
 * "Regetn Park", "Babriel Villas", "Herigate View". A fuzzy matcher would
 * link every one of them, and would also link "Parkview" to "Park View" and
 * "The Eden" to "Eden", and nobody would ever find out which of those was
 * wrong. So: exact match on the normalised name, or nothing. Thirty-odd sites
 * stay unlinked and are shown with the name HDB printed and no link, which is
 * the honest rendering of "HDB says this became X and we cannot confirm X".
 *
 * The single exception is a name joined by "&", because HDB names a mixed
 * development by both of its halves — "Woodleigh Mall & Woodleigh Residences",
 * "Pasir Ris Mall & Pasir Ris 8". Only the residential half is ever a record
 * here. Splitting on "&" and accepting the match ONLY when exactly one half
 * resolves is not a guess: it is reading a compound label the way its author
 * wrote it. If both halves match, or neither does, the site stays unlinked.
 *
 * ── AND WHY AMBIGUITY LOSES ────────────────────────────────────────────────
 * Two different records can normalise to the same string. Linking to whichever
 * one happened to be indexed first would be wrong roughly half the time and
 * would look exactly like being right, so a name that resolves to more than
 * one record resolves to none.
 */

/** Uppercase, alphanumeric, single-spaced. Everything else is punctuation
 *  noise that differs between a PDF and URA's project field.
 *
 *  "@" becomes "AT" because it is a word here and both sources spell it both
 *  ways — HDB prints "Arc @Tampines", URA files "ARC AT TAMPINES". Applied to
 *  both sides, so it resolves a spelling difference rather than creating a
 *  match that was not there. */
export function norm(s) {
  return String(s || '').toUpperCase().replace(/@/g, ' AT ')
    .replace(/[^A-Z0-9]+/g, ' ').trim();
}

/**
 * The same name with the parts that are not the name taken off.
 *
 * A leading "The" is an English article, and a trailing category word is what
 * URA files a development AS, not what anyone calls it: HDB writes "Bishan
 * Park", URA writes "BISHAN PARK CONDOMINIUM"; HDB writes "The Miltonia", URA
 * writes "THE MILTONIA RESIDENCES". Stripping both from both sides matches
 * those without inventing anything.
 *
 * This is only ever consulted after an exact match fails, and only when the
 * relaxed key is unique — see indexProjects. Relaxing makes collisions more
 * likely, not less, which is why the collision rule is what keeps it safe.
 */
const GENERIC_TAIL = /\s+(CONDOMINIUM|CONDO|APARTMENTS|APARTMENT|RESIDENCES|RESIDENCE|ESTATE)$/;
export function relax(s) {
  let k = norm(s).replace(/^THE\s+/, '');
  while (GENERIC_TAIL.test(k)) k = k.replace(GENERIC_TAIL, '');
  return k;
}

/**
 * Names HDB printed wrong.
 *
 * Every one of these is a transcription error in the source PDF where the
 * development it means is unambiguous and already a record here — a
 * transposition ("Regetn"), a dropped letter ("Herigate"), a wrong first
 * letter ("Babriel"), a spelling ("Blu"/"Blue"), a plural ("Height").
 *
 * A hand table rather than a fuzzy matcher ON PURPOSE. Edit distance would
 * link all five of these and would also link "Parkview" to "Park View" and
 * "The Eden" to "Eden Park", silently and with the same confidence. Each line
 * below was checked against the project list one at a time and shows in a
 * diff; a matcher's mistakes show nowhere. If a sixth turns up, it gets a line
 * here, not a threshold.
 */
export const ERRATA = new Map([
  ['REGETN PARK', 'REGENT PARK'],
  ['HERIGATE VIEW', 'HERITAGE VIEW'],
  ['BABRIEL VILLAS', 'GABRIEL VILLAS'],
  ['BLU HORIZON', 'BLUE HORIZON'],
  ['COMPASS HEIGHT', 'COMPASS HEIGHTS'],
]);

/* HDB writes these where there is no project. They are prose, not names, and
 * a normalised "NA" would otherwise be a perfectly good map key. */
const NOT_A_NAME = new Set([
  'NA', 'N A', 'NIL', 'NONE',
  'LANDED HOUSING', 'LANDED PROPERTIES NO PROJECT NAME', 'LANDED PROPERTY',
  'TO BE ADVISED', 'TBA',
]);

export function isProjectName(s) {
  const k = norm(s);
  if (!k || k.length < 3) return false;
  if (NOT_A_NAME.has(k)) return false;
  return /[A-Z]/.test(k);
}

/**
 * A name → href map from data/projects.json's light lists.
 * A key that would collide is deleted rather than overwritten, so an ambiguous
 * name resolves to nothing at all. Landed labels carry a "Landed · " prefix
 * that is display furniture and not part of the name.
 */
export function indexProjects({ condo = [], landed = [] } = {}) {
  const map = new Map();
  const loose = new Map();
  const dead = new Set();
  const deadLoose = new Set();
  for (const r of [...condo, ...landed]) {
    const name = String(r.label).replace(/^Landed\s*·\s*/i, '');
    const k = norm(name);
    if (!k) continue;
    const hit = { href: r.href, label: r.label, n: r.n, medianPsf: r.medianPsf };
    if (map.has(k) && map.get(k).href !== r.href) dead.add(k); else map.set(k, hit);
    const rk = relax(name);
    if (!rk) continue;
    if (loose.has(rk) && loose.get(rk).href !== r.href) deadLoose.add(rk); else loose.set(rk, hit);
  }
  for (const k of dead) map.delete(k);
  for (const k of deadLoose) loose.delete(k);
  map.loose = loose;
  return map;
}

/**
 * Resolve one HDB project string against that map.
 * Returns the record, or null. `via` says which rule fired, so a caller can
 * show "HDB names this site's development as X" without implying we verified
 * more than we did.
 */
export function resolveProject(name, map) {
  if (!isProjectName(name)) return null;
  const loose = map.loose || new Map();

  // Each half of a compound is tried under every rule below, because HDB
  // writes "Woodleigh Mall & Woodleigh Residences" and only the second half is
  // ever a record. Exactly one half may resolve; two means it is ambiguous and
  // nothing is linked.
  const parts = name.includes('&') ? name.split('&') : [name];
  const only = (fn) => {
    const hits = [...new Set(parts.map(fn).filter(Boolean).map(h => h.href))];
    return hits.length === 1 ? parts.map(fn).find(h => h && h.href === hits[0]) : null;
  };

  const exact = only(p => map.get(norm(p)));
  if (exact) return { ...exact, via: parts.length > 1 ? 'half' : 'exact' };

  const fixed = only(p => map.get(ERRATA.get(norm(p)) || '\u0000'));
  if (fixed) return { ...fixed, via: 'errata' };

  const relaxed = only(p => loose.get(relax(p)));
  if (relaxed) return { ...relaxed, via: 'relaxed' };

  return null;
}

/**
 * Both directions at once.
 *   sites  — each HDB site with `record` attached (null when unlinked)
 *   byHref — record href → the site it was built on
 * A record href appearing twice keeps the LATER award, because a parcel can be
 * re-tendered and the development that stands there came from the last sale.
 */
export function linkSites(sites, map) {
  const out = [];
  const byHref = new Map();
  for (const s of sites) {
    const record = resolveProject(s.project, map);
    out.push({ ...s, record });
    if (!record) continue;
    const prev = byHref.get(record.href);
    if (!prev || s.award > prev.award) byHref.set(record.href, { ...s, record });
  }
  return { sites: out, byHref };
}

/**
 * Land cost per square metre and per square foot of gross floor area.
 *
 * HDB publishes the tender price and the GFA, so this is a division of two
 * published figures and not an estimate. Two things make it refusable:
 *
 *  - No GFA. HDB writes "N.A." on older rows. Nothing is computed and the
 *    caller says so, because a missing basis is not a zero.
 *  - A GFA marked "(max)". That is a ceiling the winner may build up to, not
 *    what was built, so price ÷ ceiling is the LOWEST the rate can be and not
 *    the rate. `ceiling: true` says the figure is "at most".
 *
 * This is NOT comparable with URA's rate column, which its own heading admits
 * may be per GFA or per GPR without saying which. Callers must not put them in
 * the same table, and /land does not.
 */
const SQM_PER_SQFT = 0.09290304;

/**
 * A stable URL for one tendered parcel.
 *
 * HDB's own site string is the identifier — "Sengkang E20 Anchorvale Lane"
 * carries the tender reference, which is how anyone would find the row again
 * on HDB's page. Slugged rather than indexed, so a URL survives the list being
 * re-parsed in a different order.
 *
 * The award date is appended because a parcel CAN be tendered twice, decades
 * apart, and two pages at one address would silently shadow each other.
 */
export const siteSlug = site =>
  `${String(site?.site || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()}`
  + `-${String(site?.award || '').slice(0, 4)}`;

export function landRate(site) {
  const { price, gfaSqm, gfaIsCeiling } = site || {};
  if (!price || !gfaSqm) return null;
  return {
    psm: price / gfaSqm,
    psf: (price / gfaSqm) * SQM_PER_SQFT,
    ceiling: Boolean(gfaIsCeiling),
    gfaSqm,
    price,
  };
}
