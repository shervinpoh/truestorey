/**
 * Two-operation morning source check.
 *
 * This is deliberately separate from the selective article pipeline. The
 * source check always reports what happened, including NONE; the writer still
 * stops rather than manufacture a weak article on a quiet day.
 */
import fs from 'node:fs';

const query = {
  model: 'sonar',
  temperature: 0.1,
  max_tokens: 1500,
  search_recency_filter: 'day',
  search_domain_filter: ['ura.gov.sg', 'hdb.gov.sg', 'mas.gov.sg', 'lta.gov.sg',
    'mnd.gov.sg', 'iras.gov.sg', 'cpf.gov.sg', 'moe.gov.sg',
    'data.gov.sg', 'singstat.gov.sg'],
  messages: [{
    role: 'system',
    content: 'You index Singapore government primary sources. Never return a news report or a publisher summary. Every item must link to the agency document itself.',
  }, {
    role: 'user',
    content: `What did Singapore government agencies publish in the last 24 hours that materially affects someone buying, owning or selling residential property here? Consider URA, HDB, MND, MAS, IRAS, CPF, LTA, MOE, SingStat and data.gov.sg.

Reply with ONE LINE of plain text. No JSON, no line breaks and no double-quote character anywhere. Do not pad the list.

Each item is six fields separated by ~ in this order:
agency ~ exact title ~ agency URL ~ published date YYYY-MM-DD ~ what changed in one sentence ~ who it affects in one sentence

Separate items with ;; and return at most six. If nothing materially relevant was published, reply with exactly NONE.`,
  }],
};

const briefBody = `{"secret":"REPLACE_WITH_MAKE_SECRET","kind":"article_brief","brief":"{{1.data.choices[1].message.content}}"}`;

const http = (id, x, url, headers, data, qs = [], parseResponse = true,
  followAllRedirects = false) => ({
  id,
  module: 'http:ActionSendData',
  version: 3,
  parameters: { handleErrors: true, useNewZLibDeCompress: true },
  mapper: {
    ca: '', qs, url, data, gzip: true, method: 'post', headers,
    timeout: '', useMtls: false, authPass: '', authUser: '',
    bodyType: 'raw', contentType: 'application/json', serializeUrl: false,
    shareCookies: false, parseResponse, followRedirect: true,
    useQuerystring: false, followAllRedirects, rejectUnauthorized: true,
  },
  metadata: { designer: { x, y: 0 } },
});

const flow = [
  http(1, 0, 'https://api.perplexity.ai/chat/completions', [
    { name: 'Authorization', value: 'Bearer REPLACE_WITH_PERPLEXITY_KEY' },
    { name: 'Content-Type', value: 'application/json' },
  ], JSON.stringify(query)),
  http(2, 350, 'REPLACE_WITH_APPS_SCRIPT_EXEC_URL', [
    { name: 'Content-Type', value: 'application/json' },
  ], briefBody, [{ name: 'k', value: 'REPLACE_WITH_WA_WEBHOOK_KEY' }], false, true),
  {
    id: 3,
    module: 'json:ParseJSON',
    version: 1,
    parameters: { type: '' },
    mapper: { json: '{{2.data}}' },
    metadata: { designer: { x: 700, y: 0 } },
  },
];

const blueprint = {
  name: 'Truestorey · daily source brief',
  flow,
  metadata: {
    instant: false,
    version: 1,
    scenario: {
      roundtrips: 1, maxErrors: 3, autoCommit: true, autoCommitTriggerLast: true,
      sequential: false, slots: null, confidential: false, dataloss: false,
      dlq: true, freshVariables: false,
    },
    designer: { orphans: [] },
    zone: 'eu1.make.com',
  },
};

const out = new URL('./truestorey-daily-source-brief.blueprint.json', import.meta.url);
fs.writeFileSync(out, JSON.stringify(blueprint, null, 2));
console.log('wrote', out.pathname);
console.log('modules: Perplexity source check → Apps Script delivery → JSON acknowledgement');
