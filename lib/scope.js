/**
 * Is this question about Singapore?
 *
 * WHY A LIST AND NOT A PROMPT. The route asks the model to refuse anything
 * outside Singapore, in capitals, with two worked examples. It obeyed on every
 * probe and then answered "what are house prices doing in Manchester?" in full,
 * from the live route, with UK ONS figures and a Rightmove average — published
 * under a CEA registration number on a page whose subheading says Singapore.
 *
 * That is the same principle this repo already applies to figures: a model
 * never assigns a number, because a rule that matters cannot be left to
 * something that follows rules probabilistically. Scope matters here for the
 * same reason, so scope is decided before the model is called.
 *
 * THE RULE, IN ONE LINE. Naming a place outside Singapore, without naming
 * anything in Singapore, is out of scope. So "house prices in Manchester" is
 * refused and "how do Malaysian buyers affect Singapore prices" is not — the
 * second is a question about this market that happens to mention another one.
 *
 * WHAT THIS LIST IS NOT. It is not a gazetteer and it will never be complete;
 * a villa in Provence sails through. The model's own RULE 1 is still there to
 * catch what this misses, and it is genuinely better than nothing — it just
 * cannot be the guarantee. This can. Say which is which rather than let the
 * softer one look like the harder one.
 */

/*
 * Every entry is matched on a word boundary, which is what keeps `china` out of
 * Chinatown and `bali` out of Balestier.
 *
 * WHAT IS DELIBERATELY ABSENT, AND WHY. Half of Singapore's map is named after
 * somewhere else, and each of these was considered and left out:
 *   Queenstown  — a Singapore town before it is a New Zealand one
 *   Holland     — Holland Village; the Netherlands is listed instead
 *   Florence    — The Florence Residences, Hougang
 *   Kensington, Newton, Clementi, Woodlands, Marine Parade, Sixth Avenue
 *   York        — only "new york" is listed
 *   us          — the pronoun; "usa", "u.s." and "united states" are listed
 * Anything added here must survive the same question: is it a Singapore name
 * too? If it might be, it does not go in.
 */
const ELSEWHERE = [
  // the neighbours, which is where the real questions come from
  'malaysia', 'malaysian', 'johor', 'johor bahru', 'jb', 'iskandar', 'kuala lumpur',
  'penang', 'melaka', 'malacca', 'batam', 'bintan', 'indonesia', 'jakarta', 'bali',
  'thailand', 'bangkok', 'phuket', 'chiang mai', 'vietnam', 'hanoi', 'ho chi minh',
  'philippines', 'manila', 'cambodia', 'phnom penh', 'myanmar', 'yangon', 'brunei', 'laos',
  // asia beyond
  'hong kong', 'macau', 'taiwan', 'taipei', 'china', 'shanghai', 'beijing', 'shenzhen',
  'guangzhou', 'japan', 'tokyo', 'osaka', 'kyoto', 'korea', 'korean', 'seoul',
  'india', 'mumbai', 'delhi', 'bangalore', 'bengaluru', 'sri lanka', 'colombo',
  // the gulf
  'dubai', 'abu dhabi', 'uae', 'emirates', 'qatar', 'doha', 'saudi', 'riyadh', 'bahrain',
  // britain and ireland
  'united kingdom', 'britain', 'british', 'england', 'english market', 'scotland',
  'wales', 'northern ireland', 'ireland', 'dublin', 'london', 'manchester',
  'birmingham', 'liverpool', 'leeds', 'sheffield', 'bristol', 'glasgow', 'edinburgh',
  'cardiff', 'belfast', 'nottingham',
  // north america
  'united states', 'usa', 'u.s.', 'u.s.a', 'america', 'american market', 'new york',
  'los angeles', 'san francisco', 'chicago', 'miami', 'seattle', 'austin', 'houston',
  'dallas', 'atlanta', 'denver', 'phoenix', 'california', 'texas', 'florida',
  'canada', 'canadian', 'toronto', 'vancouver', 'montreal', 'calgary', 'ottawa',
  // oceania
  'australia', 'australian', 'sydney', 'melbourne', 'brisbane', 'adelaide',
  'gold coast', 'canberra', 'new zealand', 'auckland', 'wellington', 'christchurch',
  // europe
  'europe', 'european market', 'france', 'french market', 'paris', 'nice', 'marseille',
  'germany', 'german market', 'berlin', 'munich', 'frankfurt', 'hamburg',
  'spain', 'spanish market', 'madrid', 'barcelona', 'valencia', 'portugal', 'lisbon',
  'porto', 'italy', 'italian market', 'rome', 'milan', 'venice', 'florence, italy',
  'netherlands', 'amsterdam', 'rotterdam', 'belgium', 'brussels', 'switzerland',
  'zurich', 'geneva', 'austria', 'vienna', 'sweden', 'stockholm', 'norway', 'oslo',
  'denmark', 'copenhagen', 'finland', 'helsinki', 'poland', 'warsaw', 'greece',
  'athens', 'turkey', 'istanbul', 'russia', 'moscow', 'cyprus', 'malta',
  // elsewhere
  'dubai marina', 'south africa', 'cape town', 'johannesburg', 'brazil', 'sao paulo',
  'mexico', 'argentina', 'chile', 'egypt', 'cairo', 'israel', 'tel aviv', 'nigeria', 'kenya',
];

/*
 * Naming any of these makes the question ours, whatever else it mentions. The
 * towns are here because "is Sengkang cheaper than Johor" is a Singapore
 * question — a comparison anchored on this market — and refusing it would be a
 * worse failure than answering it.
 */
const HERE = [
  'singapore', 'singaporean', 'sg', 'spore', 's.pore', 'sgd',
  'hdb', 'bto', 'sbf', 'ura', 'cpf', 'absd', 'bsd', 'ssd', 'mop', 'coe', 'cea',
  'resale flat', 'executive condo', 'sers', 'vers', 'lease buyback', 'town council',
  'ang mo kio', 'bedok', 'bishan', 'bukit batok', 'bukit merah', 'bukit panjang',
  'bukit timah', 'central area', 'choa chu kang', 'clementi', 'geylang', 'hougang',
  'jurong', 'kallang', 'whampoa', 'marine parade', 'pasir ris', 'punggol',
  'queenstown', 'sembawang', 'sengkang', 'serangoon', 'tampines', 'tengah',
  'toa payoh', 'woodlands', 'yishun', 'novena', 'newton', 'orchard', 'sentosa',
  'katong', 'joo chiat', 'holland village', 'tiong bahru', 'east coast', 'west coast',
  'changi', 'paya lebar', 'tanjong pagar', 'river valley', 'thomson', 'braddell',
  'farrer', 'dover', 'bugis', 'lavender', 'redhill', 'commonwealth', 'telok blangah',
  'harbourfront', 'buona vista', 'one north', 'jalan besar', 'balestier', 'potong pasir',
  'macpherson', 'ubi', 'eunos', 'siglap', 'bayshore', 'tanah merah', 'simei', 'loyang',
];

const word = t => new RegExp(`(?:^|[^a-z0-9])(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![a-z0-9])`, 'i');
const ELSEWHERE_RE = ELSEWHERE.map(t => [t, word(t)]);
const HERE_RE = HERE.map(word);

/**
 * The foreign place this question is about, or null if it is ours to answer.
 *
 * Gives back the words AS THE READER TYPED THEM, not the list entry that
 * matched. Being told "this covers Singapore only" is unhelpful; being shown
 * which of your own words put the question out of scope tells you what to
 * change. It also keeps the casing right without a title-caser that would turn
 * "u.s." into "U.s." and "usa" into "Usa".
 */
export function offIslandSubject(question) {
  const q = String(question || '');
  if (!q.trim()) return null;
  if (HERE_RE.some(re => re.test(q))) return null;

  // Longest term wins, so "johor bahru" is named back rather than "johor".
  let best = null;
  for (const [term, re] of ELSEWHERE_RE) {
    const m = re.exec(q);
    if (m && (!best || term.length > best.term.length)) best = { term, text: m[1] };
  }
  return best ? best.text : null;
}
