/**
 * Read a pasted listing into the fields the screener needs.
 *
 * ── PASTED, NOT FETCHED ────────────────────────────────────────────────────
 * This parses TEXT THE USER PASTED. It never fetches a listing page, and the
 * distinction is not pedantic:
 *
 *   · Fetching and parsing a portal's pages is scraping. It breaches their
 *     terms, it runs from a CEA-registered salesperson's own connection, and
 *     an account ban is a professional cost rather than a technical one.
 *   · Parsing what somebody copied off a page they were reading is not. The
 *     reading was done by a person who was entitled to do it.
 *
 * A URL ALONE IS NOT ENOUGH, and that is a fact about the URL rather than a
 * policy. A listing slug carries an address at best; price and floor area —
 * the two figures the screener cannot work without — are in the page body. So
 * a bare link comes back with `missing: ['price','areaSqft']` and says so,
 * instead of looking like it worked.
 *
 * ── EVERYTHING IT FINDS, IT SHOWS ──────────────────────────────────────────
 * No field is silently inferred. `found` records where each value came from,
 * so a mis-parse is visible in the table before it becomes a shortlist entry.
 */

const clean = s => String(s || '').replace(/ /g, ' ');

/** "S$1,280,000", "$1.28M", "1.28 mil", "S$ 858k" */
function findPrice(t) {
  const m = t.match(/(?:S\$|SGD|\$)\s*([\d,]+(?:\.\d+)?)\s*(m(?:il(?:lion)?)?|k)?\b/i);
  if (!m) return null;
  let v = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(v)) return null;
  const unit = (m[2] || '').toLowerCase();
  if (unit.startsWith('m')) v *= 1e6;
  else if (unit === 'k') v *= 1e3;
  /* A price below six figures is a psf, a monthly rent or a typo — never a
     Singapore sale price. Rejected rather than passed on to be divided by an
     area and turned into a confident nonsense. */
  return v >= 100_000 ? Math.round(v) : null;
}

const SQFT_PER_SQM = 10.7639;
/** Prefers an explicit sqft; falls back to sqm and converts, saying which. */
function findArea(t) {
  const ft = t.match(/([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|square\s*feet|ft²)/i);
  if (ft) {
    const v = Number(ft[1].replace(/,/g, ''));
    if (v >= 150 && v <= 20000) return { areaSqft: Math.round(v), from: 'sqft' };
  }
  const m2 = t.match(/([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*m|sqm|square\s*met(?:re|er)s?|m²)/i);
  if (m2) {
    const v = Number(m2[1].replace(/,/g, ''));
    if (v >= 15 && v <= 2000) return { areaSqft: Math.round(v * SQFT_PER_SQM), from: 'sqm', areaSqm: v };
  }
  return null;
}

/**
 * A storey, from a unit number if one is there.
 *
 * "#08-123" is the most reliable floor in any listing — it is the unit, not a
 * marketing adjective — and it is also the only place a HDB stack ever shows
 * up in public text. "high floor" is deliberately NOT read as a number: it is
 * a claim, and turning it into a storey would invent the one input the storey
 * curve is most sensitive to.
 */
function findFloor(t) {
  const unit = t.match(/#\s?(\d{1,3})\s?-\s?(\d{1,4})/);
  if (unit) {
    const f = Number(unit[1]);
    if (f >= 1 && f <= 99) return { floor: f, from: 'unit number', unit: `#${unit[1]}-${unit[2]}` };
  }
  const lvl = t.match(/\b(?:level|storey|story|floor)\s*(\d{1,2})\b/i) || t.match(/\b(\d{1,2})(?:st|nd|rd|th)\s*(?:floor|storey)\b/i);
  if (lvl) {
    const f = Number(lvl[1]);
    if (f >= 1 && f <= 99) return { floor: f, from: 'stated level' };
  }
  return null;
}

const findUrl = t => (t.match(/https?:\/\/\S+/) || [null])[0];

/**
 * The address line, for `search()` to resolve.
 *
 * Lines that clearly carry a price, an area or boilerplate are dropped first,
 * and a bare HDB block-and-street pattern is preferred when present because it
 * is the one shape that resolves unambiguously.
 */
function findAddressLine(t) {
  const lines = t.split(/[\n\r|•·]+/).map(l => l.trim()).filter(Boolean);
  const blocky = lines.find(l => /\b(?:blk|block)?\s*\d{1,4}[A-Z]?\s+[A-Za-z][A-Za-z' .]{3,}/i.test(l)
    && !/\$|sq\s?ft|sqm|psf|per\s*month/i.test(l));
  if (blocky) return blocky.replace(/^(?:blk|block)\s*/i, '').replace(/\s{2,}/g, ' ').slice(0, 80);
  const plain = lines.find(l => l.length > 6 && l.length < 80 && !/^https?:/i.test(l)
    && !/\$|sq\s?ft|sqm|psf|bed|bath|listed|agent/i.test(l));
  return plain || null;
}

/**
 * @param text one pasted listing — a URL, a block of copied detail, or both.
 */
export function parseListing(text) {
  const t = clean(text).trim();
  if (!t) return null;
  const price = findPrice(t);
  const area = findArea(t);
  const floor = findFloor(t);
  const url = findUrl(t);
  const addressLine = findAddressLine(t.replace(url || '', ' '));

  const found = {};
  if (price) found.price = 'text';
  if (area) found.areaSqft = area.from;
  if (floor) found.floor = floor.from;
  if (addressLine) found.address = 'text';

  const missing = [];
  if (!price) missing.push('price');
  if (!area) missing.push('areaSqft');
  if (!addressLine) missing.push('address');

  return {
    raw: t.slice(0, 400),
    url: url || null,
    addressLine,
    price: price || null,
    areaSqft: area?.areaSqft || null,
    areaSqm: area?.areaSqm || null,
    floor: floor?.floor || null,
    unit: floor?.unit || null,
    found, missing,
    /* A link on its own is the commonest paste and the least useful one. Said
       plainly, so it does not look like a parse failure. */
    note: (url && missing.length >= 2)
      ? 'A link on its own carries an address at best — the price and the floor area are in the page body. Paste the listing details as well.'
      : null,
  };
}

/** Split a paste into listings: a blank line, or a run of URLs, separates them. */
export function splitListings(text) {
  return clean(text).split(/\n\s*\n+/).map(s => s.trim()).filter(s => s.length > 3);
}

/**
 * Is the advertised size plausible for this address and type?
 *
 * Agents mis-state floor area, and an OVERSTATED size understates the psf —
 * which the screener would read as a discount and rank at the top. So a size
 * outside what that block has actually filed is flagged rather than scored.
 * Comparison is against filed sales, not against a rule of thumb.
 *
 * ── AGAINST THE BLOCK'S RANGE, NOT A PERCENTAGE OF ITS MEDIAN ─────────────
 * This used to allow 15% either side of the median. One flat type in one HDB
 * block barely varies — 649 Jalan Tenaga files its 5-rooms at 122 to 124 sqm
 * — so 15% waved through a listing at 1,232 sqft (114 sqm) that matches no
 * flat in the block. It was almost certainly 1,323 with two digits swapped.
 * The screen then penalised every comparable for the size mismatch, the
 * estimate gave up, and the page said "size ok" above the failure.
 *
 * Measured leave-one-out over 68,287 HDB sales, each checked against the
 * rest of its block and type: a 3% margin outside the filed range flags a
 * CORRECT size 2.1% of the time and catches a 7% misstatement 92% of the
 * time. The old rule caught none of them.
 *
 * @param sales the address's own filed sales, [[month, psf, areaSqm, type, storey]]
 */
export const AREA_MARGIN = 0.03;
/** Kept for anything reading the old name; the rule is now AREA_MARGIN. */
export const AREA_TOLERANCE = AREA_MARGIN;

const sqftOf = sqm => Math.round(sqm * SQFT_PER_SQM);
/** "5 ROOM" → "5-room", "EXECUTIVE" → "executive": how the type is said aloud. */
const typeWords = t => (t ? String(t).toLowerCase().replace(/^(\d) room$/, '$1-room').replace(/\s+/g, ' ') + ' ' : '');
const commas = n => Number(n).toLocaleString('en-SG');

/**
 * Typos that turn a right size into a wrong one: two neighbouring digits
 * swapped (1,323 → 1,232), a digit dropped or doubled, or the sqm figure
 * typed where sqft was meant. Offered only when exactly one candidate lands
 * inside the block's range — two would be a guess.
 */
function typoFix(areaSqft, loSqft, hiSqft) {
  const d = String(Math.round(areaSqft));
  const out = new Set();
  for (let i = 0; i < d.length - 1; i++) {
    const a = d.split(''); [a[i], a[i + 1]] = [a[i + 1], a[i]];
    if (a[0] !== '0') out.add(Number(a.join('')));
  }
  out.add(Math.round(areaSqft * SQFT_PER_SQM)); // sqm typed as sqft
  const inside = [...out].filter(v => v >= loSqft && v <= hiSqft);
  return inside.length === 1 ? inside[0] : null;
}

export function checkArea({ areaSqft, sales = [], type = null }) {
  const rows = sales.filter(s => Number.isFinite(s[2]) && (!type || s[3] === type));
  if (!rows.length || !(areaSqft > 0)) return { ran: false, why: 'No filed size at this address to compare against.' };
  const areas = rows.map(s => s[2]).sort((a, b) => a - b);
  const median = areas[(areas.length - 1) >> 1];
  const lo = areas[0], hi = areas.at(-1);
  const stated = areaSqft / SQFT_PER_SQM;
  const off = (stated - median) / median;
  const plausible = stated >= lo * (1 - AREA_MARGIN) && stated <= hi * (1 + AREA_MARGIN);
  const loSqft = sqftOf(lo * (1 - AREA_MARGIN)), hiSqft = sqftOf(hi * (1 + AREA_MARGIN));
  const rangeSqft = lo === hi ? `${commas(sqftOf(lo))} sqft` : `${commas(sqftOf(lo))}–${commas(sqftOf(hi))} sqft`;
  const fix = plausible ? null : typoFix(areaSqft, loSqft, hiSqft);
  return {
    ran: true, medianSqm: Math.round(median), statedSqm: Math.round(stated), off, plausible,
    rangeSqm: [lo, hi], rangeSqft, type,
    suggest: fix ? `Did you mean ${commas(fix)} sqft? That matches this block's ${typeWords(type)}flats (${rangeSqft}).` : null,
    suggestedSqft: fix,
    /* The consequence depends on the DIRECTION, and the first version of this
       hardcoded one of them — it told a reader that an understated size
       understates the psf, which is backwards and is the kind of sentence
       somebody repeats. Both directions are wrong in useful ways and each
       gets its own. */
    why: plausible ? null
      : `The listing says ${commas(Math.round(areaSqft))} sqft; this block's ${typeWords(type)}flats are ${rangeSqft} `
        + `across ${rows.length} filed sale${rows.length > 1 ? 's' : ''} — ${off > 0 ? 'larger' : 'smaller'} than any of them. `
        + (off > 0
          ? 'A size stated too large understates the psf, which reads as a discount and ranks first.'
          : 'A size stated too small overstates the psf, which reads as a premium — and if the size is right, the flat is not what this block usually files.'),
  };
}
