/**
 * Build a Make.com blueprint for the Truestorey daily article pipeline.
 *
 * Written as a generator rather than by hand because the request bodies are
 * JSON documents living inside a JSON document, and hand-escaping two levels
 * of quotes is how you spend an hour on a typo. Keys are placeholders; filling
 * them is a job for the Make UI and never for this file.
 *
 * ── THE ESCAPING PROBLEM, AND WHY THE FIX IS IN THE PROMPT ─────────────────
 * Make pastes a mapped value into a raw body WITHOUT escaping it. The body is
 * a JSON document held in a text field, so the first double quote inside any
 * mapped value terminates the string it landed in and the whole request stops
 * being valid JSON. Gemini answers that with:
 *
 *     400 Invalid JSON payload received. Expected , or } after key:value pair.
 *
 * which names neither the field nor the module that caused it.
 *
 * Perplexity's answer was JSON — eleven hundred characters of quotes — so
 * every populated run failed. The empty days passed only because {"items":[]}
 * never reached the next module.
 *
 * Three fixes were tried in the live tool and two of them failed:
 *   · replace(...; /\x22/g; "'")  — Make's regex engine does not interpret
 *     \x22. The expression evaluated, matched nothing, returned the content
 *     unchanged, and the identical 400 came back. A transformation that
 *     silently does nothing is indistinguishable from one that never ran.
 *   · replace(...; /"/g; "'")     — Make's own parser rejects it: "Invalid
 *     reference in parameter". A literal quote cannot appear inside a Make
 *     expression that itself sits inside a JSON string.
 *   · ASK FOR TEXT THAT HAS NO QUOTES IN IT. This one. Nothing to escape.
 *
 * So module 1 asks Perplexity for one line of delimited plain text with no
 * quote characters and no line breaks, and Gemini is told the same about the
 * values it returns. Every mapped value is then safe to drop into a body by
 * construction rather than by transformation.
 *
 * It also removes a module: there is no longer any JSON to parse between
 * Perplexity and Gemini, and the "did we find anything" filter reads the text
 * directly. Eight modules instead of nine, and one less operation per run on
 * a plan that counts them.
 */
import fs from 'node:fs';

/* The delimiters. Chosen because no agency headline will contain them and
   because neither needs escaping anywhere in this pipeline. */
const FIELD_SEP = ' ~ ';
const ITEM_SEP = ' ;; ';
const NOTHING = 'NONE';

const P_SYSTEM = "You index primary sources. You never summarise a news report. Every item you return must be a document published by the agency itself — a press release, a media release, a circular, a data release or a speech on that agency's own site. If your only evidence for something is a news article about it, find the agency page and return that; if there is no agency page, drop the item entirely.";

const P_USER = `What did Singapore government agencies publish in the last 24 hours that materially affects someone buying, owning or selling residential property here? Consider URA, HDB, MND, MAS, IRAS, CPF, LTA, MOE, SingStat and data.gov.sg.

FORMAT — follow this exactly:
Reply with ONE LINE of plain text. No JSON. No line breaks. And never use the double-quote character anywhere in your reply; if a title contains one, replace it with an apostrophe.

Each item is six fields separated by${FIELD_SEP.replace(/ /g, ' ')}in this order:
agency${FIELD_SEP}exact title of the release${FIELD_SEP}url${FIELD_SEP}published date as YYYY-MM-DD${FIELD_SEP}what changed, one sentence${FIELD_SEP}who it affects, one sentence

Separate items with${ITEM_SEP}

If nothing qualifies, reply with exactly:${' ' + NOTHING}

Do not pad the list. An empty answer is a correct answer.`;

const perplexityBody = {
  model: 'sonar',
  temperature: 0.1,
  max_tokens: 1500,
  search_recency_filter: 'day',
  search_domain_filter: ['ura.gov.sg', 'hdb.gov.sg', 'mas.gov.sg', 'lta.gov.sg',
    'mnd.gov.sg', 'iras.gov.sg', 'cpf.gov.sg', 'moe.gov.sg',
    'data.gov.sg', 'singstat.gov.sg'],
  messages: [
    { role: 'system', content: P_SYSTEM },
    { role: 'user', content: P_USER },
  ],
};

/* ── WHY THE TRIAGE IS PERMISSIVE, NOT STRICT ──────────────────────────────
   The first version dropped a URA Government Land Sales release under "of
   interest only to the industry rather than to a household". That is exactly
   backwards: a site launched at Orchard Boulevard is a launch in that area in
   a couple of years, and the winning land bid is the floor under its price.
   It is the subject of /land and /gls on this site.
   Measured: on the only item the live search returned that week, the strict
   rules chose ZERO and these chose one, with a sound angle. A triage that
   rejects everything is not cautious, it is a pipeline that produces nothing
   and quietly looks like it is working. */
const GEMINI_PROMPT = `You are the editor. Each item below is six fields separated by${FIELD_SEP}— agency, headline, url, published, what changed, who it affects — and items are separated by${ITEM_SEP}

For each one decide whether it is worth an article on a Singapore property site written for ordinary buyers, owners and sellers.

KEEP anything that changes what a household can borrow, buy, sell or wait for. That explicitly includes:
- Government Land Sales: sites launched, tenders closing, sites awarded. A new site is a future launch in that area, and the land price is the floor under it.
- BTO and SBF launches, HDB eligibility, income ceilings, grants, MOP.
- Loan rules, CPF rules, stamp duty, ABSD, TDSR, MSR, LTV.
- Index and transaction releases where a figure actually moved.
- Planning decisions and Master Plan changes affecting where people live.

DROP only: purely administrative notices with no substance for a household; anything about commercial or industrial property alone; a straight re-announcement of something already in force; and anything not published by the agency itself.

When in doubt, KEEP. A quiet week with one modest piece is better than a silent one.

Rank what survives and return AT MOST TWO.

Return JSON only, in this shape:
{"chosen":[{"agency":"","headline":"","url":"","published":"","angle":"the one thing a reader needs to understand, in a sentence","category":"policy|note|deep_dive|editorial","why_it_matters":"two sentences, plain"}]}

NEVER use a double-quote character inside any VALUE. The structural quotes of
the JSON are fine; a quote inside a headline or a sentence is not. Use an
apostrophe instead. Those values are copied into another request later and a
stray double quote breaks it.

THE ITEMS:
{{1.data.choices[1].message.content}}`;

const geminiBody = {
  contents: [{ parts: [{ text: GEMINI_PROMPT }] }],
  generationConfig: {
    temperature: 0.1,
    /* 8192, and no thinkingConfig. Both measured against the live API.
       thinkingConfig.thinkingBudget 0 returns HTTP 400 on gemini-3.6-flash —
       it cannot be switched off, and thinkingLevel is not a field either. But
       thinking tokens DO count against this ceiling (455 of them against a
       264-token probe), so the budget has to absorb them: 4096 against a month
       of items is tight, 8192 is not. responseMimeType stays, because without
       it the answer comes back wrapped in fences that Parse JSON refuses. */
    maxOutputTokens: 8192,
    responseMimeType: 'application/json',
  },
};

const CLAUDE_SYSTEM = `You write for Truestorey, a Singapore property site published by Shervin Poh, CEA Reg. No. R066925H, Huttons Asia Pte Ltd. Everything you write goes out under that registration number. Write as him: plain, direct, unhurried, more interested in what a figure does not say than in what it does.

YOU ARE WRITING COMMENTARY ON A LINKED PRIMARY SOURCE. You are not summarising it and you are certainly not retelling anyone's news coverage of it. Assume the reader can click the link. Your job is what it means for someone buying, owning or selling a home — the consequence, the thing that is easy to misread, the question it should make them ask.

HARD RULES. Breaking any of these makes the piece unpublishable:
- Never state a valuation, an estimate of what any property is worth, or a price forecast. Ranges with the evidence shown are fine; a verdict is not.
- Never invent a number. Every figure must be in the source you were given, and must be written with the agency and the period beside it: URA, Q2 2026. If you want a figure you were not given, describe it in words instead.
- Never use: undervalued, best deal, expert, specialist, guaranteed, hot market, must buy, once in a lifetime.
- Never imply a school place. The MOE 1km band is ballot priority, nothing more.
- Never give a walking time or a distance to anything.
- Never quote or paraphrase Straits Times, Business Times, EdgeProp, Stacked or any other publisher. If a fact is not in the agency release, leave it out.
- Never predict what prices will do. You may say what has happened, with dates.

HOUSE STYLE:
- British spelling. Singapore dollars as S$1,234,567.
- No first-person plural. I is allowed sparingly; we is not.
- Short paragraphs. No bullet list longer than five items.
- Do not open with "In a move that" or "As Singapore's property market".
- End on the practical consequence, not a summary of what you just said.

OUTPUT. Return one JSON object and nothing else — no prose, no code fences. This object is POSTed verbatim as a request body, so it must be valid JSON on its own:
{
  "title": "under 70 characters, specific, no colon-subtitle construction",
  "slug": "lowercase-hyphenated",
  "category": "policy | note | deep_dive | editorial",
  "excerpt": "one sentence under 200 characters",
  "content_html": "…",
  "tags": ["three or four lowercase tags"],
  "source_urls": ["the agency URL you were given, and nothing else"]
}

NEVER put a double-quote character inside title or excerpt. Use an apostrophe. Those two fields are copied into another request later and a stray double quote breaks it. content_html may contain quotes; it is forwarded verbatim and never rebuilt.

content_html RULES — it is sanitised on the way in against an allowlist and anything outside it is silently dropped:
- Allowed: p br hr h2 h3 h4 strong b em i u s sup sub mark ul ol li blockquote figure figcaption cite a img table thead tbody tr th td caption code pre span div small time
- NO <h1>. The page supplies it, and a second one breaks the heading order a screen reader announces.
- On <a>, only href title rel target. No inline styles, no classes, no event handlers — they will be stripped.
- 600 to 900 words for a note, 1,200 to 1,600 for a deep_dive.
- Link the agency release in the first two paragraphs, in the prose, by name.`;

/* Every one of these is a mapped value landing inside a JSON string. They are
   safe without transformation because Gemini was told not to put a quote in
   any of them — which is the whole point of the redesign. */
const CLAUDE_USER = `Agency: {{4.agency}}
Headline: {{4.headline}}
URL: {{4.url}}
Published: {{4.published}}
Suggested category: {{4.category}}
The angle: {{4.angle}}
Why it matters: {{4.why_it_matters}}`;

const claudeBody = {
  model: 'claude-opus-5',
  max_tokens: 4000,
  /* THINKING OFF, AND THIS IS ABOUT INDEXES, NOT ABOUT QUALITY.
     With thinking on, Opus 5 returns TWO content blocks — a thinking block
     and then the text — and Make is 1-indexed, so content[1] resolves to the
     thinking block, which has no .text field at all. Module 6 then POSTs an
     empty body and /api/webhook/article answers 400 "Could not read that
     JSON.", while Make paints module 6 green because it reports any status as
     success. Two articles were written and both were thrown away, silently.
     content[2] would also work today and would break the day a response comes
     back without a thinking block. Disabled gives exactly one block, so
     content[1] is right by construction. */
  thinking: { type: 'disabled' },
  /* No temperature. Opus 5 rejects it outright: "`temperature` is deprecated
     for this model." Caught by running the chain rather than by reading a
     changelog, which is the only reason it was caught before the first live
     morning run. */
  system: CLAUDE_SYSTEM,
  messages: [{ role: 'user', content: CLAUDE_USER }],
};

const notifyBody = `{"secret":"REPLACE_WITH_MAKE_SECRET","kind":"articles","items":[{"id":"{{6.data.id}}","title":"{{7.title}}","slug":"{{6.data.slug}}","category":"{{7.category}}","excerpt":"{{7.excerpt}}","sources":["{{4.url}}"]}]}`;

const httpMapper = (url, headers, data) => ({
  ca: '', qs: [], url, data, gzip: true, method: 'post', headers,
  timeout: '', useMtls: false, authPass: '', authUser: '',
  bodyType: 'raw', contentType: 'application/json',
  serializeUrl: false, shareCookies: false, parseResponse: true,
  followRedirect: true, useQuerystring: false,
  followAllRedirects: false, rejectUnauthorized: true,
});

const http = (id, x, url, headers, data, extra = {}) => ({
  id, module: 'http:ActionSendData', version: 3,
  parameters: { handleErrors: false, useNewZLibDeCompress: true },
  mapper: httpMapper(url, headers, data),
  metadata: { designer: { x, y: 0 } },
  ...extra,
});

const parseJson = (id, x, json, extra = {}) => ({
  id, module: 'json:ParseJSON', version: 1,
  parameters: { type: '' },
  mapper: { json },
  metadata: { designer: { x, y: 0 } },
  ...extra,
});

const flow = [
  http(1, 0, 'https://api.perplexity.ai/chat/completions', [
    { name: 'Authorization', value: 'Bearer REPLACE_WITH_PERPLEXITY_KEY' },
    { name: 'Content-Type', value: 'application/json' },
  ], JSON.stringify(perplexityBody)),

  /* The filter reads Perplexity's text directly. There is no JSON to parse any
     more, which is the module this redesign removed. */
  http(2, 300, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=REPLACE_WITH_GEMINI_KEY',
    [{ name: 'Content-Type', value: 'application/json' }],
    JSON.stringify(geminiBody),
    {
      filter: {
        name: 'Perplexity found something',
        conditions: [[{
          a: '{{1.data.choices[1].message.content}}',
          b: NOTHING,
          o: 'text:notcontain',
        }]],
      },
    }),

  parseJson(3, 600, '{{2.data.candidates[1].content.parts[1].text}}'),

  {
    id: 4,
    module: 'builtin:BasicFeeder',
    version: 1,
    parameters: {},
    mapper: { array: '{{3.chosen}}' },
    metadata: { designer: { x: 900, y: 0 } },
    filter: {
      name: 'The editor chose at least one',
      conditions: [[{ a: '{{length(3.chosen)}}', b: '0', o: 'number:greater' }]],
    },
  },

  http(5, 1200, 'https://api.anthropic.com/v1/messages', [
    { name: 'x-api-key', value: 'REPLACE_WITH_ANTHROPIC_KEY' },
    { name: 'anthropic-version', value: '2023-06-01' },
    { name: 'Content-Type', value: 'application/json' },
  ], JSON.stringify(claudeBody)),

  /* Claude's own JSON is forwarded VERBATIM. Rebuilding it field by field
     would mean re-escaping content_html, which is full of quotes and angle
     brackets — the exact failure this whole redesign exists to avoid. */
  http(6, 1500, 'https://truestorey.vercel.app/api/webhook/article', [
    { name: 'Authorization', value: 'Bearer REPLACE_WITH_ARTICLE_WEBHOOK_SECRET' },
    { name: 'Content-Type', value: 'application/json' },
  ], '{{5.data.content[1].text}}'),

  /* Parsed only to get a title and an excerpt for the notification. */
  parseJson(7, 1800, '{{5.data.content[1].text}}'),

  http(8, 2100, 'REPLACE_WITH_APPS_SCRIPT_EXEC_URL',
    [{ name: 'Content-Type', value: 'application/json' }],
    notifyBody),
];

const blueprint = {
  name: 'Truestorey · daily articles',
  flow,
  metadata: {
    instant: false,
    version: 1,
    scenario: {
      roundtrips: 1, maxErrors: 3, autoCommit: true, autoCommitTriggerLast: true,
      sequential: false, slots: null, confidential: false, dataloss: false,
      dlq: false, freshVariables: false,
    },
    designer: { orphans: [] },
    zone: 'eu1.make.com',
  },
};

const out = new URL('./truestorey-articles.blueprint.json', import.meta.url);
fs.writeFileSync(out, JSON.stringify(blueprint, null, 2));

/* A body that cannot survive its own mapped values is the bug this file was
   rewritten to remove, so the check runs on every build. */
const stray = [];
for (const m of flow) {
  if (m.module !== 'http:ActionSendData') continue;
  const withValues = m.mapper.data.replace(/\{\{[^}]*\}\}/g, 'SUBSTITUTED');
  if (withValues.trim().startsWith('{')) {
    try { JSON.parse(withValues); } catch (e) { stray.push(`${m.id}: ${e.message}`); }
  }
}
console.log('wrote', out.pathname);
console.log('modules:', flow.map(m => `${m.id}:${m.module.replace(/^.*:/, '')}`).join(' → '));
console.log('bodies still valid once every mapping is substituted:',
  stray.length ? 'NO — ' + stray.join('; ') : 'yes');
console.log('placeholders:', [...new Set([...JSON.stringify(blueprint)
  .matchAll(/REPLACE_WITH_[A-Z_]+/g)].map(m => m[0]))].join(', '));
