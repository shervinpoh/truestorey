/**
 * A photograph for the top of the piece.
 *
 * ── WHAT IT MAY NEVER DO, AND WHAT IT USED TO REFUSE BY MISTAKE ────────────
 * A stock photograph cannot show the block, the plot or the project an
 * article is about, and one that looks like it might is worse than none. So
 * the proper noun never reaches the search: no "Marina Gardens Lane", no
 * project name, no street. That rule stands and is the reason for this file's
 * shape.
 *
 * What it got wrong was going further and searching nothing but the city. Five
 * fixed terms — skyline, public housing, architecture — meant a piece on lease
 * decay, a piece on a land tender and a piece on stamp duty were illustrated
 * from the same pool, and the page filled with Marina Bay. Relevance was never
 * the risk; specificity about a named place was.
 *
 * So the query now comes from what the article is ABOUT rather than what it
 * is about the name of. Keys for a lease, a crane for a BTO wait, a contract
 * for stamp duty. None of those claims to be anywhere.
 *
 * ── THE TWO LANES ─────────────────────────────────────────────────────────
 * A photograph either depicts a place or depicts a thing, and the two carry
 * different risks.
 *
 *   place  — an estate, a street, a skyline. It says "here", so it must BE
 *            here. Confirmed Singapore or dropped, exactly as before: on a
 *            site whose whole claim is that its figures come from Singapore's
 *            own agencies, a photograph of Hong Kong is a small lie at the
 *            top of the page, and the kind a reader who knows the city spots
 *            immediately.
 *
 *   thing  — keys, a crane, a contract, light on a wall. It says nothing
 *            about where, so it does not have to be here. But it must not
 *            say somewhere ELSE: anything naming a city or country that is
 *            not Singapore is dropped, so a photograph in this lane either
 *            says Singapore or says nowhere.
 *
 * That is the whole safety argument. A thing lane without the second half
 * would quietly reintroduce the problem the first half was written to stop.
 *
 * ── WHAT UNSPLASH REQUIRES, AND WHERE IT IS HONOURED ───────────────────────
 * The API terms want the photographer credited with a link, and a ping to the
 * photo's download endpoint when it is used. The webhook does both — and drops
 * the image entirely if no photographer name arrives with it, so a broken
 * credit cannot publish. This only has to pass the fields through.
 *
 * No key means no photograph and a piece that still files. An article is not
 * worth losing over its illustration.
 */

/* Ordered: the first match wins, so the specific sit above the general. A
   piece about a BTO waiting period also contains the word "resale"; it is a
   piece about waiting, and the crane is the right picture for it.

   ── EVERY THING-LANE QUERY NAMES AN OBJECT, NEVER A SCENE ────────────────
   This is the rule the first draft got wrong twice, both times the same way.
   "calculator and paperwork" returned a US federal tax return with a flag
   printed on it, for a piece on Singapore stamp duty. "construction site
   fence" returned a street in Myanmar with the sign in Burmese script, for a
   piece on a GLS tender. Neither photograph's metadata said anything about a
   country, so the lane check below passed both — the country was IN THE
   FRAME, and nothing readable from the API can see that.

   A scene is a camera pointed at a place, and places have signage, licence
   plates, flags and writing in them. An object in close-up has none of that:
   keys, a crane, a pen, a stack of boxes belong to nowhere. So a query here
   names a thing, and anything that starts "view from", "street" or "city"
   belongs in the place lane or nowhere. test/photo-subject.test.js fails on
   the obvious relapses. */
export const SUBJECTS = [
  { id: 'sun', lane: 'thing',
    when: /\bsun\b|sunset|sunlight|afternoon sun|west[- ]facing|orientation|daylight|glare/,
    queries: ['sunlight through window', 'afternoon light on a wall', 'golden hour window'] },

  { id: 'bto', lane: 'thing',
    when: /\bbto\b|build[- ]to[- ]order|waiting period|ballot|queue|completion date/,
    queries: ['construction crane', 'scaffolding', 'hard hat'] },

  { id: 'land', lane: 'thing',
    when: /\bgls\b|government land sales|land tender|tender clos|land parcel|\baward/,
    /* Not "empty plot of land": Unsplash returns nothing at all for it, and
       a subject whose query returns nothing silently becomes the skyline. */
    queries: ['excavator', 'surveying equipment', 'bulldozer'] },

  { id: 'enbloc', lane: 'thing',
    when: /en[- ]bloc|collective sale|\bstrata\b|redevelop/,
    queries: ['moving boxes', 'cardboard boxes', 'empty room'] },

  { id: 'launch', lane: 'thing',
    when: /new launch|showflat|show flat|developer|launch price|uncompleted/,
    /* Not "floor plan drawing": it returns civic plans — the price-gap piece
       drew two auditorium layouts. A model and a blueprint read as "something
       being designed" without claiming to be a home. */
    queries: ['architectural model', 'blueprint', 'drafting tools'] },

  /* Not "tax form", not "calculator and paperwork". Both return a national
     tax return — the 99-to-1 piece drew a US federal form with a flag printed
     on it, which the lane check cannot see because it is in the picture and
     not in the metadata. A pen, a contract and a signature belong to no
     country's revenue authority. */
  { id: 'tax', lane: 'thing',
    when: /absd|bsd|stamp duty|decoupl|99[- ]to[- ]1|loophole|tdsr|\bmsr\b|cooling measure/,
    queries: ['signing a contract', 'fountain pen on document', 'handshake over a desk'] },

  { id: 'lease', lane: 'thing',
    when: /leasehold|freehold|99[- ]year|lease decay|\btenure\b|remaining lease/,
    /* Not "weathered concrete wall". It was meant to evoke a building ageing
       through its lease and returned a flat grey texture swatch — an image
       that says nothing is not better than a skyline, it is just quieter. */
    queries: ['house keys', 'old door lock', 'key in a lock'] },

  { id: 'rent', lane: 'thing',
    when: /\brent\b|rental|landlord|tenant|tenancy|yield/,
    queries: ['apartment keys on a table', 'door handle', 'lease agreement'] },

  { id: 'floor', lane: 'thing',
    when: /high floor|low floor|floor premium|\bstorey\b|\bstack\b|unblocked/,
    queries: ['balcony railing', 'stairwell looking up', 'window frame'] },

  { id: 'money', lane: 'thing',
    when: /\bloan\b|mortgage|interest rate|afford|downpayment|\bcpf\b|refinanc/,
    queries: ['piggy bank', 'notebook and pen on a desk', 'calculator close up'] },

  /* The place lane. These are pieces about somewhere in Singapore, and a
     photograph of Singapore is the honest illustration for them. */
  { id: 'flats', lane: 'place',
    when: /\bhdb\b|\bmop\b|minimum occupation|resale flat|public housing|\bflat\b/,
    queries: ['singapore hdb', 'singapore public housing'] },

  { id: 'market', lane: 'place',
    when: /price index|\bmarket\b|\bpsf\b|median price|transaction|town|neighbourhood|district|estate/,
    queries: ['singapore neighbourhood', 'singapore architecture', 'singapore skyline'] },
];

/* The fallback, and the old behaviour in full. An article that matches nothing
   above is still a Singapore property article. */
const GENERAL = { id: 'general', lane: 'place',
  queries: ['singapore public housing', 'singapore skyline', 'singapore hdb',
            'singapore architecture', 'singapore neighbourhood'] };

/* Somewhere that is not here. The thing lane drops anything naming one of
   these, which is what stops a photograph of keys tagged "hong kong" from
   illustrating a Singapore lease. It does not need to be exhaustive to be
   useful: it needs the places a property photograph plausibly comes from,
   plus the words that mean "this image is of a city". */
const ELSEWHERE = new RegExp([
  'hong kong', 'kuala lumpur', 'malaysia', 'johor', 'bangkok', 'thailand',
  'jakarta', 'indonesia', 'bali', 'manila', 'philippines', 'vietnam', 'hanoi',
  'seoul', 'korea', 'tokyo', 'osaka', 'japan', 'shanghai', 'beijing',
  'shenzhen', 'china', 'taipei', 'taiwan', 'mumbai', 'delhi', 'india',
  'dubai', 'abu dhabi', 'emirates', 'doha', 'qatar', 'riyadh',
  'london', 'paris', 'berlin', 'madrid', 'rome', 'amsterdam', 'lisbon',
  'new york', 'chicago', 'toronto', 'vancouver', 'sydney', 'melbourne',
  'auckland', 'sao paulo', 'mexico city', 'istanbul', 'moscow', 'cairo',
  'skyline', 'cityscape', 'downtown',
  /* Not a place, but the same lie by another route: a nationality, a currency
     or a government document says whose country this is just as loudly as a
     skyline does. */
  'american', 'united states', 'usa', 'irs', 'british', 'britain', 'european',
  'euro', 'sterling', 'dollar bill', 'banknote', 'passport', 'flag',
].map(s => `\\b${s.replace(/ /g, '\\s+')}\\b`).join('|'), 'i');

const textOf = p => [p.alt_description, p.description, p.location?.name,
                     p.location?.city, p.location?.country,
                     ...(p.tags || []).map(t => t.title)].filter(Boolean).join(' ');

const isSingapore = p =>
  /singapore/i.test(p.location?.country || '') ||
  /\bsingapore\b|\bhdb\b|marina bay|sentosa/i.test(textOf(p));

/**
 * Which subject a piece belongs to. Exported so a test can pin the mapping
 * without a network call, and so the desk can print it.
 */
export function subjectFor(about = '', also = '') {
  /* What arrives here is hyphenated: the finding kinds are town-move,
     land-award, floor-premium and sun-approval, and a slug is kebab all the
     way down. Every pattern below is written in words, so without the split
     they match nothing at all — silently — and every piece falls through to
     the general lane looking exactly as it did before. camelCase is split
     too, because nothing stops the next kind or tag being written that way. */
  const norm = t => String(t)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase().replace(/[-_/]+/g, ' ');

  /* The title decides, and the tags only get a say if it did not. A tag list
     is a bag of related terms rather than a statement of subject: the en bloc
     piece carries an ABSD tag, and matching the whole bag at once illustrated
     a collective sale with a photograph of somebody signing a contract. */
  const primary = norm(about);
  return SUBJECTS.find(s => s.when.test(primary))
      || SUBJECTS.find(s => s.when.test(`${primary} ${norm(also)}`))
      || GENERAL;
}

async function search(key, query) {
  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}`
    + '&orientation=landscape&content_filter=high&per_page=30',
    { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) { console.warn(`  Unsplash ${res.status} for "${query}"`); return []; }
  const { results = [] } = await res.json();
  return results;
}

function qualify(results, lane) {
  if (lane === 'place') return results.filter(isSingapore);
  /* Says Singapore, or says nowhere. Nothing in between. */
  return results.filter(p => isSingapore(p) || !ELSEWHERE.test(textOf(p)));
}

/**
 * @param {string} about  the title and slug: what the piece is about.
 * @param {string} also   tags and anything weaker, consulted only if the
 *   title matched no subject at all.
 *
 * A proper noun in either is only ever matched against, never searched for.
 */
export async function photograph(about = '', also = '') {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  const subject = subjectFor(about, also);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  /* Two searches at most. The backfill runs this once per article and
     Unsplash allows fifty requests an hour, so a third try would put a
     fourteen-article run inside the rate limit's shadow for no real gain. */
  const attempts = [[subject, pick(subject.queries)]];
  if (subject !== GENERAL) attempts.push([GENERAL, pick(GENERAL.queries)]);

  try {
    for (const [s, query] of attempts) {
      /* Search, not /photos/random. Random with a query is a lottery: it
         returns one loosely-matched photo and there is no way to look at it
         before accepting it. Search returns thirty with their metadata, which
         is what makes the lane check possible. */
      const results = await search(key, query);
      const ok = qualify(results, s.lane);
      if (!ok.length) {
        console.warn(`  nothing usable in "${query}" (${s.lane} lane, ${results.length} results)`);
        continue;
      }
      const p = pick(ok);
      if (!p?.urls?.regular || !p?.user?.name) continue;

      console.log(`  photograph by ${p.user.name} — ${s.id}/${s.lane} "${query}"`
        + ` (${ok.length} of ${results.length} qualified)`);
      return {
        header_image_url: p.urls.regular,
        unsplash_photographer_name: p.user.name,
        unsplash_photographer_profile_url: p.user.links?.html || null,
        /* The webhook pings this. Unsplash requires it on every use and it is
           the one term people forget, which is why it travels as a field
           rather than being left to whoever calls the API. */
        unsplash_download_location: p.links?.download_location || null,
        alt: p.alt_description || query,
        subject: s.id,
      };
    }
    /* Better no photograph than the wrong one: the typographic tile already
       handles an unillustrated piece, and handles it well. */
    console.warn('  no photograph: nothing qualified');
    return null;
  } catch (e) {
    console.warn(`  no photograph: ${e.name}`);
    return null;
  }
}
