/**
 * Build a Make.com blueprint for the Truestorey daily article pipeline.
 *
 * Written as a generator rather than by hand because the request bodies are
 * JSON strings living inside a JSON document, and hand-escaping two levels of
 * quotes is how you spend an hour on a typo.
 *
 * Keys are placeholders. Filling them is the user's job, in the Make UI.
 */
import fs from 'node:fs';

const P_SYSTEM = "You index primary sources. You never summarise a news report. Every item you return must be a document published by the agency itself — a press release, a media release, a circular, a data release or a speech on that agency's own site. If your only evidence for something is a news article about it, find the agency page and return that; if there is no agency page, drop the item entirely. Reply with JSON only, no prose and no code fences.";

const P_USER = `What did Singapore government agencies publish in the last 24 hours that materially affects someone buying, owning or selling residential property here? Consider URA, HDB, MND, MAS, IRAS, CPF, LTA, MOE, SingStat and data.gov.sg.

Return:
{"items":[{"agency":"URA","headline":"exact title of the release","url":"https://…","published":"YYYY-MM-DD","what_changed":"one sentence, factual","who_it_affects":"one sentence","is_primary":true}]}

If nothing qualifies, return {"items":[]}. Do not pad the list. An empty answer is a correct answer.`;

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

const GEMINI_PROMPT = `You are the editor. For each item below decide whether it is worth an article on a Singapore property site written for ordinary buyers, owners and sellers.

DROP anything that is: not published by the agency itself; a routine scheduled data release with no change in it; about commercial or industrial property only; a re-announcement of something already in force; or of interest only to the industry rather than to a household.

KEEP something only if a reader could act differently because of it.

Rank what survives and return AT MOST TWO. Returning zero is normal and correct on most days — do not pad.

Return JSON only:
{"chosen":[{"agency":"","headline":"","url":"","published":"","angle":"the one thing a reader needs to understand, in a sentence","category":"policy|note|deep_dive|editorial","why_it_matters":"two sentences, plain"}]}

THE ITEMS:
{{1.data.choices[1].message.content}}`;

const geminiBody = {
  contents: [{ parts: [{ text: GEMINI_PROMPT }] }],
  generationConfig: {
    temperature: 0.1,
    /* 8192, and thinking off. Gemini's thinking tokens count against this
       ceiling, and at 4096 it spent the whole budget reasoning and returned an
       EMPTY text part — module 4 then failed with "got an empty json field".
       CLAUDE.md records the same failure once already: 942 thinking tokens
       plus 498 of answer against a 1600 ceiling, truncating JSON mid-object,
       intermittently. This step triages a list that is already filtered; it
       does not need to think. */
    maxOutputTokens: 8192,
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingBudget: 0 },
  },
};

const CLAUDE_SYSTEM = `You write for Truestorey, a Singapore property site published by Shervin Poh, CEA Reg. No. R066925H, Huttons Asia Pte Ltd. Everything you write goes out under that registration number. Write as him: plain, direct, unhurried, more interested in what a figure does not say than in what it does.

YOU ARE WRITING COMMENTARY ON A LINKED PRIMARY SOURCE. You are not summarising it and you are certainly not retelling anyone's news coverage of it. Assume the reader can click the link. Your job is what it means for someone buying, owning or selling a home — the consequence, the thing that is easy to misread, the question it should make them ask.

HARD RULES. Breaking any of these makes the piece unpublishable:
- Never state a valuation, an estimate of what any property is worth, or a price forecast. Ranges with the evidence shown are fine; a verdict is not.
- Never invent a number. Every figure must be in the source you were given, and must be written with the agency and the period beside it: "URA, Q2 2026". If you want a figure you were not given, describe it in words instead.
- Never use: undervalued, best deal, expert, specialist, guaranteed, hot market, must buy, once in a lifetime.
- Never imply a school place. The MOE 1km band is ballot priority, nothing more.
- Never give a walking time or a distance to anything.
- Never quote or paraphrase Straits Times, Business Times, EdgeProp, Stacked or any other publisher. If a fact is not in the agency release, leave it out.
- Never predict what prices will do. You may say what has happened, with dates.

HOUSE STYLE:
- British spelling. Singapore dollars as S$1,234,567.
- No first-person plural. "I" is allowed sparingly; "we" is not.
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

NEVER put a double quote character inside title or excerpt. Use a single quote if you need one. Those two fields are copied into another request later and a stray double quote breaks it.

content_html RULES — it is sanitised on the way in against an allowlist and anything outside it is silently dropped:
- Allowed: p br hr h2 h3 h4 strong b em i u s sup sub mark ul ol li blockquote figure figcaption cite a img table thead tbody tr th td caption code pre span div small time
- NO <h1>. The page supplies it, and a second one breaks the heading order a screen reader announces.
- On <a>, only href title rel target. No inline styles, no classes, no event handlers — they will be stripped.
- 600 to 900 words for a note, 1,200 to 1,600 for a deep_dive.
- Link the agency release in the first two paragraphs, in the prose, by name.`;

const CLAUDE_USER = `Agency: {{5.agency}}
Headline: {{5.headline}}
URL: {{5.url}}
Published: {{5.published}}
Suggested category: {{5.category}}
The angle: {{5.angle}}
Why it matters: {{5.why_it_matters}}`;

const claudeBody = {
  model: 'claude-opus-5',
  max_tokens: 4000,
  temperature: 0.4,
  system: CLAUDE_SYSTEM,
  messages: [{ role: 'user', content: CLAUDE_USER }],
};

/* The notify body. Built as a template string rather than an object because
   the mapped values are Make expressions, not literals. */
const notifyBody = `{"secret":"REPLACE_WITH_MAKE_SECRET","kind":"articles","items":[{"id":"{{7.data.id}}","title":"{{8.title}}","slug":"{{7.data.slug}}","category":"{{8.category}}","excerpt":"{{8.excerpt}}","sources":["{{5.url}}"]}]}`;

const httpMapper = (url, headers, data) => ({
  ca: '',
  qs: [],
  url,
  data,
  gzip: true,
  method: 'post',
  headers,
  timeout: '',
  useMtls: false,
  authPass: '',
  authUser: '',
  bodyType: 'raw',
  contentType: 'application/json',
  serializeUrl: false,
  shareCookies: false,
  parseResponse: true,
  followRedirect: true,
  useQuerystring: false,
  followAllRedirects: false,
  rejectUnauthorized: true,
});

const http = (id, x, url, headers, data, extra = {}) => ({
  id,
  module: 'http:ActionSendData',
  version: 3,
  parameters: { handleErrors: false, useNewZLibDeCompress: true },
  mapper: httpMapper(url, headers, data),
  metadata: { designer: { x, y: 0 } },
  ...extra,
});

const parseJson = (id, x, json, extra = {}) => ({
  id,
  module: 'json:ParseJSON',
  version: 1,
  parameters: { type: '' },
  mapper: { json },
  metadata: { designer: { x, y: 0 } },
  ...extra,
});

const notEmpty = (name, value) => ({
  filter: {
    name,
    conditions: [[{ a: `{{length(${value})}}`, b: '0', o: 'number:greater' }]],
  },
});

const flow = [
  http(1, 0, 'https://api.perplexity.ai/chat/completions', [
    { name: 'Authorization', value: 'Bearer REPLACE_WITH_PERPLEXITY_KEY' },
    { name: 'Content-Type', value: 'application/json' },
  ], JSON.stringify(perplexityBody)),

  parseJson(2, 300, '{{1.data.choices[1].message.content}}'),

  http(3, 600, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=REPLACE_WITH_GEMINI_KEY',
    [{ name: 'Content-Type', value: 'application/json' }],
    JSON.stringify(geminiBody),
    notEmpty('Perplexity found something', '2.items')),

  parseJson(4, 900, '{{3.data.candidates[1].content.parts[1].text}}'),

  {
    id: 5,
    module: 'builtin:BasicFeeder',
    version: 1,
    parameters: {},
    mapper: { array: '{{4.chosen}}' },
    metadata: { designer: { x: 1200, y: 0 } },
    ...notEmpty('The editor chose at least one', '4.chosen'),
  },

  http(6, 1500, 'https://api.anthropic.com/v1/messages', [
    { name: 'x-api-key', value: 'REPLACE_WITH_ANTHROPIC_KEY' },
    { name: 'anthropic-version', value: '2023-06-01' },
    { name: 'Content-Type', value: 'application/json' },
  ], JSON.stringify(claudeBody)),

  /* Claude's own JSON is forwarded VERBATIM as the request body. Rebuilding it
     field by field would mean re-escaping content_html, which is full of
     quotes and angle brackets — the single most likely thing to break. */
  http(7, 1800, 'https://truestorey.vercel.app/api/webhook/article', [
    { name: 'Authorization', value: 'Bearer REPLACE_WITH_ARTICLE_WEBHOOK_SECRET' },
    { name: 'Content-Type', value: 'application/json' },
  ], '{{6.data.content[1].text}}'),

  /* Parsed only to get a title and an excerpt for the notification. */
  parseJson(8, 2100, '{{6.data.content[1].text}}'),

  http(9, 2400, 'REPLACE_WITH_APPS_SCRIPT_EXEC_URL',
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
      roundtrips: 1,
      maxErrors: 3,
      autoCommit: true,
      autoCommitTriggerLast: true,
      sequential: false,
      slots: null,
      confidential: false,
      dataloss: false,
      dlq: false,
      freshVariables: false,
    },
    designer: { orphans: [] },
    zone: 'eu1.make.com',
  },
};

const out = new URL('./truestorey-articles.blueprint.json', import.meta.url);
fs.writeFileSync(out, JSON.stringify(blueprint, null, 2));
console.log('wrote', out.pathname);
console.log('modules:', flow.map(m => `${m.id}:${m.module}`).join(' → '));
console.log('placeholders to fill:',
  [...JSON.stringify(blueprint).matchAll(/REPLACE_WITH_[A-Z_]+/g)]
    .map(m => m[0]).filter((v, i, a) => a.indexOf(v) === i).join(', '));
