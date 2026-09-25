/**
 * The Truestorey writer: a pack in, a draft that has passed verify() out.
 *
 * One writer for every kind of piece — the daily data note (scripts/desk.mjs),
 * the agency-release note (scripts/newsdesk.mjs) and the longer analysis
 * (scripts/analysis.mjs). They differ in what they are handed, never in the
 * rules they are held to.
 *
 * ── WHY THE HOOKS ARE IN THE PROMPT AND THE RULES ARE NOT ───────────────────
 * Shervin, 26 Sep: the editorial page should be as strong as any newsletter,
 * with hooks that make people read. A hook is craft, and craft is what a
 * model is for: which figure leads, what the reader is really asking, where
 * the tension is. So the prompt spends its words there.
 *
 * What may be SAID is not left to it. verify.js checks every number against
 * the pack, refuses the first person and invented experience, and applies the
 * compliance list. A draft that fails is handed back once with the failures
 * named; one that fails twice is not filed. A quiet day is better than a
 * piece that is almost right under a CEA registration.
 */
import { claude } from '../ai/providers.js';
import { line, numbersPanel, show } from './figures.js';
import { verify } from './verify.js';

/* The strongest writer on the key, measured 26 Sep. Prose is the one place
   on this site where the model's quality is the product. */
export const WRITER_MODEL = 'claude-opus-5-5';

const LENGTH = {
  note: 'Between 550 and 850 words.',
  deep_dive: 'Between 900 and 1,300 words.',
  policy: 'Between 550 and 850 words.',
};
const WORDS = { note: [450, 1000], policy: [450, 1000], deep_dive: [800, 1500] };

export const SYSTEM = `You write for Truestorey, a Singapore property publication. It is published by Shervin Poh, CEA Reg. No. R066925H, Huttons Asia Pte Ltd, and everything you write goes out under that registration number. The byline is "the Truestorey desk".

YOUR MATERIAL IS A PACK: figures, facts from a primary source, caveats and the pages to link. It was measured before you were called. You did not find it and you may not improve on it.

THE FIGURES ARE FIXED
- Every number you write must appear in the pack, written the way the pack writes it. Years, quarters and dates count as numbers.
- Never add, subtract, divide, average, annualise, round differently or recall any other figure. If a comparison needs a number the pack does not give, make it in words ("more than double", "about a quarter", "the highest of the towns measured") or leave it out.
- The first time you use a figure, say what period it covers and whose data it is ("URA's filed transactions", "HDB's resale index").
- The reader never sees your materials. Never write "the pack", "the figures provided" or "the caveat above".
- Write a release's money without trailing zeros: S$208,099,000, not S$208,099,000.00.
- Money is S$1,234,567. Never a bare $. A release that writes $ means S$.

NO FIRST PERSON AND NO INVENTED EXPERIENCE
- Never write I, me, my, we, our or us. The desk has no voice of its own and no experiences.
- Never describe clients, viewings, conversations, anything anyone told anyone, or anything anyone has watched or seen. Never invent a person, a quote, or a scenario presented as real.
- You may address the reader as "you" and describe their decision: "If you own a four-room flat in Punggol…".

HOOKS — a reader decides in eight seconds whether to keep going
- Title: under 70 characters. Lead with the most striking figure in the pack or a sharp, specific tension. Concrete nouns, active verbs. No colon subtitles, no question-bait, no "here's why", no "everything you need to know", no hype words.
- Dek: one sentence under 170 characters that tells the reader what they will understand by the end — the reason to keep reading, not a summary.
- Opening: two or three sentences. Start with the figure or with the reader's own position. No background, no scene-setting, never "In a move that…" or "Singapore's property market…".
- Then {{NUMBERS}} on a line of its own. The key figures are placed there for you, with their sources.
- Three to five <h2> subheads. Each is a specific claim or the question the reader is now asking. Never generic ("Background", "Conclusion", "What it means", "Key takeaways").
- Every paragraph short and earning its place, its most interesting sentence first.
- End with what to check or ask before a decision, and link the Truestorey page in the pack once, by name, as an <a>.

WHAT IT MAY NEVER DO
- No valuation, no estimate of what any property is worth, no forecast of prices or of what a tender will fetch.
- No verdict and no instruction to buy or sell.
- Never use: undervalued, best deal, expert, specialist, guaranteed, hot market, must buy.
- Never state a walking time or a distance to anything, and never imply a school place.
- Never quote, paraphrase or name any publisher. The pack's sources are the only sources.
- Flats reaching MOP are eligible to sell, which is not supply. A land price is not a launch price.
- Every caveat in the pack appears in the first third of the piece, in your own words.

FORM
- British spelling. Plain, direct, confident. No exclamation marks, no emoji, no rhetorical flourishes.
- Allowed tags: p h2 h3 strong em ul ol li blockquote a table thead tbody tr th td. No h1, no classes, no styles.
- If the pack has a graphic, put {{CHART}} on its own line where it belongs, once.

OUTPUT exactly this and nothing else:
<title>…</title>
<dek>…</dek>
<tags>three or four lowercase tags, comma separated</tags>
<body>
…html…
</body>`;

/** The pack, as the writer reads it. */
export function brief(pack) {
  const parts = [
    `KIND: ${pack.kindLabel || pack.category || 'note'}`,
    `LENGTH: ${LENGTH[pack.category] || LENGTH.note}`,
    `SUBJECT: ${pack.subject}`,
    `WHAT THIS PIECE IS FOR: ${pack.brief}`,
  ];
  if (pack.angle) parts.push(`THE READER'S QUESTION: ${pack.angle}`);
  if (pack.source) {
    parts.push(`PRIMARY SOURCE: ${pack.source.agency} — "${pack.source.title}", ${pack.source.date}. ${pack.source.url}`);
  }
  if (pack.facts?.length) {
    parts.push('FACTS FROM THE PRIMARY SOURCE (numbers here may be used exactly as written, with S$ for $):\n'
      + pack.facts.map(f => `- ${f}`).join('\n'));
  }
  if (pack.figures?.length) {
    parts.push('FIGURES (use exactly as written):\n' + pack.figures.map(f => `- ${line(f)}`).join('\n'));
  }
  if (pack.caveats?.length) parts.push('CAVEATS (each must appear, early):\n' + pack.caveats.map(c => `- ${c}`).join('\n'));
  if (pack.links?.length) parts.push('LINK ONCE, BY NAME:\n' + pack.links.map(l => `- ${l.label}: ${l.href}`).join('\n'));
  if (pack.chart) parts.push('GRAPHIC: yes — place {{CHART}} once.');
  return parts.join('\n\n');
}

const tag = (text, name) => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i').exec(text || '');
  return m ? m[1].trim() : '';
};

export function parse(text) {
  const tags = tag(text, 'tags').split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 4);
  return { title: tag(text, 'title'), dek: tag(text, 'dek'), tags, content_html: tag(text, 'body') };
}

const slugify = s => String(s).toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

/**
 * Write, verify, retry once. Returns { draft } or { error, problems }.
 * @param call  the model call, injectable so a test can drive it
 */
export async function write(pack, { call = claude, log = () => {}, model = WRITER_MODEL } = {}) {
  const [minWords, maxWords] = WORDS[pack.category] || WORDS.note;
  const messages = [{ role: 'user', content: brief(pack) }];
  let last = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await call(SYSTEM, messages, { model, maxTokens: 6000, timeoutMs: 240_000 });
    if (!reply) return { error: 'ANTHROPIC_API_KEY is not set.' };
    if (reply.error) return { error: `The writer failed: ${reply.error}` };
    const draft = parse(reply.text);
    const { ok, problems, words } = verify(draft, pack, { minWords, maxWords });
    log(`  attempt ${attempt}: ${words} words, ${ok ? 'passed' : `${problems.length} problem(s)`}`);
    if (ok) return { draft: assemble(draft, pack) };
    for (const p of problems) log(`    · ${p}`);
    last = problems;
    messages.push({ role: 'assistant', content: reply.text });
    messages.push({ role: 'user', content: `That draft cannot be filed:\n${problems.map(p => `- ${p}`).join('\n')}\n\nRewrite the whole piece with those fixed, in the same output format.` });
  }
  return { error: 'The draft failed verification twice and was not filed.', problems: last };
}

/**
 * The draft as it is filed: the numbers panel and the graphic put in by code,
 * the pack's sources recorded, the slug made.
 */
export function assemble(draft, pack) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  let html = draft.content_html.replace(/<p>\s*\{\{NUMBERS\}\}\s*<\/p>|\{\{NUMBERS\}\}/, numbersPanel(pack));
  const chart = pack.chart
    ? `<figure><img src="${esc(pack.chart.src)}" alt="${esc(pack.chart.alt)}" /><figcaption>${esc(pack.chart.caption)}</figcaption></figure>`
    : '';
  html = /\{\{CHART\}\}/.test(html)
    ? html.replace(/<p>\s*\{\{CHART\}\}\s*<\/p>|\{\{CHART\}\}/, chart)
    : html + chart;
  return {
    title: draft.title,
    slug: slugify(draft.title),
    excerpt: draft.dek,
    content_html: html,
    category: pack.category || 'note',
    tags: [...new Set([...(pack.tags || []), ...(draft.tags || [])])].slice(0, 6),
    source_urls: [...new Set(pack.sources || [])],
  };
}

export { show };
