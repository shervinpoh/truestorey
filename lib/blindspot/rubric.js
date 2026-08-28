/**
 * The Blindspot rubric.
 *
 * WHY THIS IS A FUNCTION AND NOT A PROMPT.
 *
 * The competitor sells a Project Scorecard and it was refused here on the
 * grounds that a score assembled by a model is opinion wearing a number's
 * clothes — it reads objective, it cannot be sourced, and it will not give the
 * same answer twice. Shervin wants the score anyway, and he is right that it is
 * the thing that makes the tool spread.
 *
 * So the score is built the only way it can be both useful and defensible: as
 * a PUBLISHED FORMULA over sourced figures. Every rule below is rendered on the
 * page beside the result. A reader can check the arithmetic, disagree with a
 * threshold, and see exactly which filed transactions moved the number.
 *
 * Three consequences, all deliberate:
 *
 *  1. A model never assigns a point. Language models write the prose and fetch
 *     facts that are not in the repo; the number comes from here.
 *  2. The same inputs always produce the same score. No temperature, no drift,
 *     no "it said 7 yesterday".
 *  3. A check with no data SCORES NOTHING AND SAYS SO. It is never quietly
 *     treated as zero risk, because absence of evidence would otherwise read
 *     as evidence of safety — which is the exact failure this rubric exists to
 *     avoid.
 *
 * Higher means MORE to check. This is a risk score, not a rating: 8 does not
 * mean good. Every surface that renders it has to say so.
 *
 * CEA PG 02-11 s3.1 requires market claims to be substantiated. A published
 * rubric over filed transactions is substantiation. A model's impression is not.
 */

/*
 * Bumped when the FORMULA changes, not when data refreshes. v2 moved the
 * `view` check from Master Plan plot ratio to URA planning decisions — a
 * different quantity from a different source — so a score produced under v1 is
 * not comparable to one under v2, and the page prints the version beside it.
 */
export const RUBRIC_VERSION = '2026-08-v2';

/**
 * Bands are named for what the reader should DO, not for how good the property
 * is. "Worth a closer look" is an instruction. "7/10" is a verdict, and the
 * words are what stop it being read as one.
 */
export const BANDS = [
  { upTo: 0.20, label: 'Little flagged', meaning: 'Nothing in the checks below stood out. That is not the same as no risk — it is no risk of the four kinds this tool measures.' },
  { upTo: 0.45, label: 'Worth a closer look', meaning: 'One or two things here deserve a question before you commit.' },
  { upTo: 0.70, label: 'Several things to check', meaning: 'More than one check flagged. None of these is disqualifying on its own; together they are a reason to do the work.' },
  { upTo: 1.01, label: 'A lot flagged', meaning: 'Most of what this tool can measure came back flagged. Worth understanding every one before proceeding.' },
];

/**
 * The four checks. `max` is what a check can contribute when it runs; the
 * denominator is the sum of the maxima of the checks that ACTUALLY RAN, never
 * a fixed ten. A score of 4 out of a possible 6 is an honest 4 out of 6, and
 * calling it 6.7/10 would be inventing two checks that never happened.
 */
export const CHECKS = {
  price: {
    key: 'price',
    max: 3,
    title: 'Where the asking price sits',
    needs: 'Filed transactions at this block or project — held in the repo.',
    source: 'HDB via data.gov.sg · URA Data Service',
    /**
     * Percentile of the asking psf within the last 12 months of filed sales at
     * the SAME address. Deliberately not a valuation and deliberately not a
     * comparison with the town: the question is what this building itself has
     * actually transacted at.
     */
    bands: [
      { over: 0.90, points: 3, say: p => `Above ${pcOf(p)} of what has actually sold here in the last 12 months.` },
      { over: 0.75, points: 2, say: p => `Above ${pcOf(p)} of recent filed sales here.` },
      { over: 0.50, points: 1, say: p => `In the upper half of recent filed sales here — above ${pcOf(p)}.` },
      { over: -1,   points: 0, say: p => `At or below the middle of recent filed sales here — above ${pcOf(p)}.` },
    ],
  },

  supply: {
    key: 'supply',
    max: 3,
    title: 'Flats reaching MOP nearby',
    needs: 'HDB Property Information plus geocodes — both held in the repo.',
    source: 'HDB Property Information via data.gov.sg',
    /**
     * Units reaching their fifth year within 2km over the next five years, as a
     * share of the existing stock within the same radius. This is the closest
     * thing to a measurable answer to "who else will be selling when I want to".
     */
    bands: [
      { over: 0.20, points: 3, say: r => `${pct(r)} of nearby flats reach MOP in the next five years. That is a lot of competing sellers.` },
      { over: 0.10, points: 2, say: r => `${pct(r)} of nearby flats reach MOP in the next five years.` },
      { over: 0.05, points: 1, say: r => `${pct(r)} of nearby flats reach MOP in the next five years — a normal amount.` },
      { over: -1,   points: 0, say: r => `Only ${pct(r)} of nearby flats reach MOP in the next five years.` },
    ],
  },

  gls: {
    key: 'gls',
    max: 2,
    title: 'Government Land Sales nearby',
    // `needs` is rendered to READERS on /blindspot, not just to whoever runs
    // the repo. It said "Run `npm run ingest:gls`" and that script has never
    // existed, so the page was telling everyone who looked to run a command
    // that answers "Missing script". Say what is absent and why; do not
    // instruct an action nobody can take.
    needs: 'The URA Government Land Sales programme, which this site does not hold yet.',
    source: 'URA Government Land Sales programme',
    /** New supply within 1km, as units. A site is competition before it is a comparable. */
    bands: [
      { over: 800, points: 2, say: (u, c) => `${Math.round(u).toLocaleString('en-SG')} units are coming within 1km from land already sold or launched${inProgramme(c)}.` },
      { over: 200, points: 1, say: (u, c) => `${Math.round(u).toLocaleString('en-SG')} units are coming within 1km from land in the GLS programme${inProgramme(c)}.` },
      // The zero case is the one that matters. Unqualified, "No GLS site
      // within 1km" reads as a fact about the neighbourhood; it is only ever a
      // fact about one half-yearly programme, transcribed by hand.
      { over: -1,  points: 0, say: (u, c) => u
          ? `${Math.round(u).toLocaleString('en-SG')} units coming within 1km${inProgramme(c)} — small.`
          : `No GLS site within 1km${inProgramme(c) || ' in the programme held here'}.` },
    ],
    caveat: (_u, c) => c?.programme
      ? `Covers the ${c.programme} programme only, transcribed by hand from URA. A site announced since is not in this.`
      : null,
  },

  view: {
    key: 'view',
    max: 2,
    title: 'What has been approved nearby',
    needs: 'URA planning decisions — held in the repo.',
    source: 'URA Planning Decisions via the URA Data Service',
    /**
     * The tallest thing URA has PERMITTED within 300m in the last three years.
     *
     * This was scored on Master Plan plot ratio and is not any more. Zoning
     * says what is allowed and has often said so for a decade; a written
     * permission is a decision, with an applicant, a date and an address.
     * Within 800m of Parc Clematis that is the difference between "zoned to
     * 2.1" and "three blocks of 40-storey public housing, permitted 16 Oct
     * 2025". The zoning figure is still measured and still shown — as the
     * caveat, where it belongs, because a permission nobody has acted on is
     * context rather than a finding.
     *
     * Scored on height because the question is what changes the outlook.
     * 2,842 of the 4,689 decisions held here are three storeys or fewer —
     * landed reconstruction, which is not the thing anyone means by "what
     * could be built next door".
     *
     * A REFUSAL IS NEVER SCORED. Someone proposing a tower and being turned
     * down belongs on the page and is not evidence a tower is coming.
     */
    bands: [
      { over: 20, points: 2, say: (n, c) => `A ${n}-storey development was approved within ${c?.m ?? 300}m — tall enough to change what you look at.` },
      { over: 8,  points: 1, say: (n, c) => `A ${n}-storey development was approved within ${c?.m ?? 300}m.` },
      { over: -1, points: 0, say: (n, c) => n
          ? `Nothing taller than ${n} storeys has been approved within ${c?.m ?? 300}m since ${c?.since ?? 'recently'}.`
          : `Nothing new has been approved within ${c?.m ?? 300}m since ${c?.since ?? 'recently'}.` },
    ],
    /**
     * Three things the number on its own does not say: what was refused, what
     * could not be read, and what the plan would still allow regardless.
     */
    caveat: (_n, c) => {
      if (!c) return null;
      const bits = [];
      if (c.refused) bits.push(`${c.refused} application${c.refused > 1 ? 's were' : ' was'} refused in the same radius — proposed, not permitted`);
      if (c.unparsed) bits.push(`${c.unparsed} approval${c.unparsed > 1 ? 's carry' : ' carries'} no storey figure in URA's description and ${c.unparsed > 1 ? 'are' : 'is'} not counted here`);
      if (c.zonedTo) bits.push(`land within 300m is zoned to a plot ratio of ${c.zonedTo}, whether or not anyone has applied`);
      return bits.length ? bits.map(b => b.replace(/^./, m => m.toUpperCase())).join('. ') + '.' : null;
    },
  },
};

/* Names the half-year a GLS finding covers. Without it the zero case reads as
 * a fact about the neighbourhood rather than about one transcribed list. */
const inProgramme = c => (c && c.programme ? ` (${c.programme})` : '');

const pcOf = p => `${Math.round(p * 100)}%`;
const pct = r => `${(r * 100).toFixed(1)}%`;

/** Apply one check's bands to its measured value. Returns null if it did not run. */
/**
 * `context` is the measurement's own detail object, passed so a check can
 * state the limits of its own answer.
 *
 * The zoning check is why this exists. It returns the highest plot ratio
 * within 300m, and at Parc Clematis 163 of the 171 parcels in that radius
 * carry no fixed ratio at all — landed, or left open by the plan. "The highest
 * nearby is 2.1" is true and, on its own, misleading: it sounds like a ceiling
 * when most of the neighbourhood was never measured. A check that quietly
 * drops what it could not read is telling the reader the property is safer
 * than anyone knows.
 */
export function scoreCheck(key, value, context = null) {
  const check = CHECKS[key];
  if (!check) throw new Error(`Unknown check: ${key}`);
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const band = check.bands.find(b => value > b.over);
  const caveat = check.caveat ? check.caveat(value, context) : null;
  return {
    key,
    title: check.title,
    source: check.source,
    value,
    points: band.points,
    max: check.max,
    finding: band.say(value, context),
    ...(caveat ? { caveat } : {}),
  };
}

/**
 * Total the checks that ran.
 *
 * `max` is the sum of the maxima of those checks only. `ran` and `skipped` are
 * both returned so the page can say what it could not measure — a tool that
 * silently drops a check it could not run is telling the reader the property is
 * safer than it has any way of knowing.
 */
export function score(measurements = {}, contexts = {}) {
  const results = [];
  const skipped = [];
  for (const key of Object.keys(CHECKS)) {
    const r = scoreCheck(key, measurements[key], contexts[key] ?? null);
    if (r) results.push(r);
    else skipped.push({ key, title: CHECKS[key].title, needs: CHECKS[key].needs });
  }

  const points = results.reduce((n, r) => n + r.points, 0);
  const max = results.reduce((n, r) => n + r.max, 0);
  const ratio = max > 0 ? points / max : null;
  const band = ratio === null ? null : BANDS.find(b => ratio <= b.upTo);

  return {
    version: RUBRIC_VERSION,
    points,
    max,
    ratio,
    band: band ? band.label : null,
    meaning: band ? band.meaning : null,
    /** Only ever set when every check ran. A ten-point score off six points of
     *  evidence would be a bigger lie than showing six. */
    outOfTen: max === totalPossible() ? points : null,
    checks: results,
    skipped,
    direction: 'Higher means more to check. This is not a rating.',
  };
}

export function totalPossible() {
  return Object.values(CHECKS).reduce((n, c) => n + c.max, 0);
}
