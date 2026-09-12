/**
 * A compass reading, as a bearing.
 *
 * ── WHERE THE READING COMES FROM, AND WHY THAT IS ALLOWED ──────────────────
 * `/api/ai/floorplan` asks a model to read the north arrow off an uploaded
 * plan and report a facing in words. That is the model READING something
 * printed on the drawing, which is what a model is for. It is not the model
 * assigning a number: every angle downstream of this file is computed by
 * `lib/sun.js` from the reading, the date and a latitude. Same split as
 * Blindspot, where the rubric fixes the score and the model writes the prose
 * around it.
 *
 * The route already refuses to guess. If the plan carries no north arrow it
 * returns "cannot tell" rather than inferring one, and this file returns null
 * for anything it cannot parse, so a vague answer cannot become a confident
 * bearing by passing through here.
 *
 * ── SIXTEEN POINTS, NOT EIGHT ──────────────────────────────────────────────
 * The sunset arc over Singapore is 47° wide. Eight points are 45° apart, so
 * an eight-point reading cannot distinguish a facing that takes the sun
 * dead-on in June from one that never sees it — the two would round to the
 * same word. Sixteen is the coarsest grid that still separates them.
 */

const POINTS = {
  n: 0, nne: 22.5, ne: 45, ene: 67.5,
  e: 90, ese: 112.5, se: 135, sse: 157.5,
  s: 180, ssw: 202.5, sw: 225, wsw: 247.5,
  w: 270, wnw: 292.5, nw: 315, nnw: 337.5,
};

/* Longest first. "north-north-east" contains "north east", and matching the
   shorter one first would read NNE as NE — a 22.5° error, which is two
   directness bands at the tight end of the scale. */
const WORDS = [
  ['nne', /north[\s-]*north[\s-]*east/],
  ['nnw', /north[\s-]*north[\s-]*west/],
  ['sse', /south[\s-]*south[\s-]*east/],
  ['ssw', /south[\s-]*south[\s-]*west/],
  ['ene', /east[\s-]*north[\s-]*east/],
  ['wnw', /west[\s-]*north[\s-]*west/],
  ['ese', /east[\s-]*south[\s-]*east/],
  ['wsw', /west[\s-]*south[\s-]*west/],
  ['ne', /north[\s-]*east/],
  ['nw', /north[\s-]*west/],
  ['se', /south[\s-]*east/],
  ['sw', /south[\s-]*west/],
  ['n', /\bnorth\b/],
  ['s', /\bsouth\b/],
  ['e', /\beast\b/],
  ['w', /\bwest\b/],
];

/**
 * @param {string} reading  whatever the model wrote, e.g. "north-east",
 *   "NNE", "faces south west", "the balcony looks WSW".
 * @returns {{point:string, bearing:number}|null}  null when it cannot be read.
 */
export function bearingOf(reading) {
  const raw = String(reading || '').toLowerCase();
  if (!raw.trim()) return null;

  /* ── A REFUSAL MUST NOT PARSE AS A BEARING ──────────────────────────────
     "the plan carries no north arrow" contains the word north, and the first
     version of this file read it as facing north — 0°, full confidence, from
     a sentence saying the opposite. That is the exact failure this file was
     written to prevent, produced by the file itself.

     The caller gates on confidence too, and should. This is here because a
     parser that is only safe when its caller remembers something is not a
     safe parser, and somebody will pass it the note one day. */
  if (/\bno\s+(north|compass|orientation|arrow)|cannot tell|can'?t tell|not\s+(shown|marked|indicated|visible|present)|without\s+a\s+(north|compass)|\bunknown\b|\bunclear\b|no\s+way\s+to\s+tell/.test(raw)) return null;

  /* A reading that names two facings is not a facing. "north-east and
     south-west" is a through-unit, and picking the first would silently
     report half of it as the whole. */
  const hits = WORDS.filter(([, re]) => re.test(raw));
  const worded = hits.length === 1 ? hits[0][0] : null;
  if (hits.length > 1) {
    /* Unless the longer match simply contains the shorter — "north-north-east"
       matches both nne and n. Keep it only when every hit is a substring of
       the longest one. */
    const longest = hits.reduce((a, b) => (a[0].length >= b[0].length ? a : b))[0];
    const nested = hits.every(([id]) => longest.includes(id));
    if (!nested) return null;
    return { point: longest.toUpperCase(), bearing: POINTS[longest] };
  }
  if (worded) return { point: worded.toUpperCase(), bearing: POINTS[worded] };

  /* Bare abbreviations, on their own or as a standalone word. Not a loose
     substring search: "sw" appears inside "answer". */
  const abbr = /(?:^|[^a-z])(nne|nnw|sse|ssw|ene|wnw|ese|wsw|ne|nw|se|sw|n|s|e|w)(?:[^a-z]|$)/.exec(raw);
  if (abbr) return { point: abbr[1].toUpperCase(), bearing: POINTS[abbr[1]] };

  return null;
}
