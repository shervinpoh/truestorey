/**
 * What may not be published, decided before anything is published.
 *
 * ── WHY THIS IS NOT A PROMPT ───────────────────────────────────────────────
 * Every one of these rules already existed, written into the system prompts of
 * lib/ai/*, app/api/ai/* and the Make blueprint. A model complies with them
 * most of the time, and "most of the time" is exactly the failure rate that
 * gets one article published under a CEA registration number. This repo has
 * already learned that once: /neighbourhood's RULE 1 refused Manchester on
 * every probe and then answered it from the live route, which is why scope is
 * decided in lib/scope.js BEFORE the model is called.
 *
 * So the same shape as lib/blindspot/rubric.js. A published list, applied by
 * code, at the one moment it matters — the press of the publish button.
 *
 * ── WHAT IS BLOCKED, AND WHY EACH ──────────────────────────────────────────
 * Rule 7 forbids "undervalued", "best deal", "expert" and "specialist"
 * outright. The rest are the directive and absolute registers: a licensed
 * salesperson telling a reader what to do, or asserting a certainty that no
 * dataset supports. CEA PG 02-11 s3.1 requires a market claim to be
 * substantiated, and "guaranteed" cannot be.
 *
 * This does not read minds and does not try. It catches the phrases that make
 * a piece unpublishable on sight, so that the judgement left to a human is
 * about the argument rather than about whether the words were allowed.
 */

/** Each entry: the pattern, what a reader would see, and the reason. */
export const PROHIBITED = [
  { id: 'undervalued', re: /\bunder[-\s]?valued\b/i,
    why: 'Rule 7. A verdict on price is not publishable; a percentile is.' },
  { id: 'best-deal', re: /\bbest (?:deal|buy|value|price)\b/i,
    why: 'Rule 7. A superlative about price is a verdict, and no dataset here ranks one home against every other.' },
  { id: 'expert', re: /\b(?:the |an? )?(?:property |real estate |market )?expert\b/i,
    why: 'Rule 7. CEA restricts claims of expertise.' },
  { id: 'specialist', re: /\bspecialists?\b/i,
    why: 'Rule 7. CEA restricts claims of specialisation.' },
  { id: 'directive', re: /\b(?:do not buy|don't buy|must buy|you should buy|you should sell|avoid this)\b/i,
    why: 'A directive to transact. This site reports what is filed; it does not instruct.' },
  { id: 'guarantee', re: /\bguarantee(?:d|s)?\b/i,
    why: 'Nothing about a property market is guaranteed, and CEA PG 02-11 s3.1 wants it substantiated.' },
  { id: 'only-safe', re: /\bthe only (?:safe|sure|smart) way\b/i,
    why: 'An absolute claim no dataset supports.' },
  { id: 'certainty', re: /\b(?:mathematical(?:ly)? (?:impossib|certain)|cannot possibly|is certain to)\w*/i,
    why: 'A certainty about a market. Say what has happened, with its period.' },
  { id: 'hot-market', re: /\bhot market\b/i,
    why: 'Rule 7 register. It asserts a market condition with nothing behind it; say what moved, over what period.' },
  { id: 'realis', re: /\bREALIS\b/i,
    why: 'Rule 1. REALIS is licensed for personal research, not commercial use (CEA PG 02-11 s6).' },
];

/** Strip tags so a phrase split by markup is still caught, and vice versa. */
const plain = html => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

/** Every prohibited phrase in a piece of text, with what matched. */
export function scanLanguage(text) {
  const s = plain(text);
  const out = [];
  for (const p of PROHIBITED) {
    const m = p.re.exec(s);
    if (m) out.push({ id: p.id, found: m[0], why: p.why });
  }
  return out;
}

/**
 * Why this article may not go out. Empty array means it may.
 *
 * Sources are not advisory. An article filed with none has nothing behind it
 * that a reader — or a regulator — can check, and rule 6 says every derived
 * figure renders its source. The queue used to warn and publish anyway.
 */
export function publishBlockers(article) {
  const blockers = [];
  const urls = Array.isArray(article?.source_urls) ? article.source_urls.filter(Boolean) : [];
  if (urls.length === 0) {
    blockers.push({ id: 'no-sources', why:
      'No source URLs were recorded. Nothing published under a CEA registration '
      + 'number may rest on an unsourced claim (PG 02-11 s3.1).' });
  }
  for (const hit of scanLanguage(`${article?.title || ''} ${article?.content_html || article?.body_html || ''}`)) {
    blockers.push({ id: hit.id, why: `${hit.why} Found: “${hit.found}”.` });
  }
  return blockers;
}

/* ── the same story, filed three times ──────────────────────────────────────
   The pipeline covered one GLS tender as "Marina Gardens Lane, Orchard
   Boulevard GLS launch 2026", "…GLS tenders" and "URA … GLS 2H2026". Three
   different slugs, so the existing slug check saw nothing, and the feed
   advertised its own automation.

   Jaccard over significant tokens, because the titles a pipeline produces for
   one story share their nouns and differ in their framing. 0.5 was picked by
   measuring it against the fourteen articles already filed: the three Marina
   Gardens pieces score 0.60, 0.67 and 0.67 against each other, and no
   unrelated pair in the set scores above 0.15. The gap is wide enough that
   the threshold is not doing delicate work. */
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for',
  'is', 'are', 'was', 'were', 'by', 'with', 'from', 'as', 'that', 'this', 'it', 'its',
  'vs', 'versus', 'new', 'what', 'why', 'how', 'singapore', 'sg', 'property', 'market']);

export const DUPLICATE_AT = 0.5;

export function tokens(title) {
  return new Set(String(title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
}

export function similarity(a, b) {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

/** The first existing article this one substantially repeats, or null. */
export function duplicateOf(title, existing = [], at = DUPLICATE_AT) {
  let best = null;
  for (const e of existing) {
    const score = similarity(title, e.title);
    if (score >= at && (!best || score > best.score)) best = { ...e, score };
  }
  return best;
}
