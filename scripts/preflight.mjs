/**
 * Preflight — is this deployment actually wired up?
 *
 * `npm run preflight`
 *
 * Every integration on this site is optional by design: a missing key disables
 * one feature and says so on the page rather than 500-ing it. That is the right
 * behaviour and it has one cost — a half-configured deployment looks identical
 * to a finished one until someone clicks the thing that is missing. This script
 * is the answer to that. It is the only place that asks every question at once.
 *
 * THREE STATES, AND THE MIDDLE ONE IS THE POINT.
 *
 *   ok       configured, and a live call proved it works
 *   missing  not configured — the feature is off, and the page will say so
 *   BROKEN   configured, and the live call failed
 *
 * `missing` is a decision. `BROKEN` is a fault, and the two must never print
 * the same way, because a key that is present and wrong is the failure that
 * reaches production: `configured()` returns true, the feature switches itself
 * on, and it fails in front of a reader instead of degrading quietly.
 *
 * Nothing here writes. It reads, it asks, it reports. Safe to run against
 * production, and it prints no secret — only the first characters of a key,
 * which is enough to tell two keys apart and not enough to use one.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const OK = 'ok     ', MISS = 'missing', BAD = 'BROKEN ';
const rows = [];
const add = (state, name, detail) => rows.push({ state, name, detail });

const mask = v => !v ? '' : `${v.slice(0, 8)}…(${v.length} chars)`;
// A request that fails before a response has no body. Error reporting is the
// last place that should assume one exists: preflight must distinguish
// unreachable from rejected, not crash while trying to print either.
const brief = body => (JSON.stringify(body) || 'no response body').slice(0, 120);

/* ── env ─────────────────────────────────────────────────────────────────── */
// Read .env.local ourselves rather than requiring --env-file, so the failure
// mode of "you have not made one yet" is a sentence instead of a stack trace.
const envPath = path.join(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} else {
  console.log('\n  No .env.local found. Copy .env.example to .env.local first.\n');
}

const val = k => (process.env[k] || '').trim();

/* ── supabase ────────────────────────────────────────────────────────────── */
async function supabase() {
  const url = val('SUPABASE_URL').replace(/\/$/, '');
  const secret = val('SUPABASE_SECRET_KEY') || val('SUPABASE_SERVICE_ROLE_KEY');
  const pub = val('SUPABASE_PUBLISHABLE_KEY') || val('SUPABASE_ANON_KEY');

  if (!url) return add(MISS, 'Supabase', 'SUPABASE_URL not set — /studio and the article webhook are off');
  if (!secret && !pub) {
    return add(MISS, 'Supabase', `project ${new URL(url).host} is set but both keys are empty`);
  }

  const call = async (key, q) => {
    try {
      const res = await fetch(`${url}/rest/v1/${q}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(12000),
      });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    } catch (e) { return { status: 0, error: e.message }; }
  };

  if (secret) {
    const r = await call(secret, 'articles?select=id,status&limit=1');
    if (r.status === 0) add(BAD, 'Supabase reachable', r.error);
    else if (r.status === 200) add(OK, 'Supabase · articles', `table exists · secret key ${mask(secret)}`);
    else if (r.status === 404 || /does not exist|relation/i.test(JSON.stringify(r.body))) {
      add(BAD, 'Supabase · articles',
        'project reachable but the table is missing — run scripts/supabase-schema.sql in the SQL editor');
    } else {
      add(BAD, 'Supabase · articles', `${r.status} ${brief(r.body)}`);
    }
  } else {
    add(MISS, 'Supabase · secret key', 'SUPABASE_SECRET_KEY empty — the webhook cannot write');
  }

  // The events table. Separate migration, so it is entirely possible to have
  // articles working and analytics quietly going nowhere — which is the exact
  // failure /api/track was moved off the filesystem to end, arriving by a
  // different route. The route still returns 204 with this missing, by design,
  // so nothing else will ever tell you.
  if (secret) {
    const r = await call(secret, 'events?select=id&limit=1');
    if (r.status === 0) add(BAD, 'Supabase · events reachable', r.error);
    else if (r.status === 200) add(OK, 'Supabase · events', 'table exists — analytics are being recorded');
    else if (r.status === 404 || /does not exist|schema cache/i.test(JSON.stringify(r.body))) {
      add(BAD, 'Supabase · events',
        'MISSING — every event is being dropped. /api/track still answers 204, so ' +
        'nothing else reports this. Run scripts/supabase-events.sql in the SQL editor');
    } else {
      add(BAD, 'Supabase · events', `${r.status} ${brief(r.body)}`);
    }
  }

  // The RLS check. The anon key must not be able to see a draft. This is the
  // one assertion here that is about the SHAPE of the data rather than its
  // presence, and it is worth the extra call: the whole approval step in
  // /studio rests on a draft being invisible to the public key.
  if (pub) {
    const r = await call(pub, 'articles?select=id,status&status=eq.draft&limit=1');
    if (r.status === 200 && Array.isArray(r.body) && r.body.length === 0) {
      add(OK, 'Supabase · RLS', 'drafts are invisible to the publishable key');
    } else if (r.status === 200 && Array.isArray(r.body) && r.body.length > 0) {
      add(BAD, 'Supabase · RLS',
        'THE PUBLISHABLE KEY CAN READ DRAFTS. Unpublished articles are public. ' +
        'Re-run the row-level security section of scripts/supabase-schema.sql');
    } else if (r.status === 0) {
      add(BAD, 'Supabase · RLS', r.error);
    } else {
      add(MISS, 'Supabase · RLS', `could not be checked (${r.status}) — not the same as passing`);
    }
  } else {
    add(MISS, 'Supabase · publishable key', 'SUPABASE_PUBLISHABLE_KEY empty — RLS not checked');
  }
}

/* ── the model providers ─────────────────────────────────────────────────── */
/**
 * A REAL CALL EACH, AND ONLY A 200 COUNTS.
 *
 * The first version of this sent deliberately degenerate requests — max_tokens
 * of 1 — so a success could never come back as 200, and it had to treat
 * "anything that is not 401, 403 or 429" as working. That reasoning let a dead
 * model through and reported it as ok: Google had closed gemini-2.5-flash to
 * new keys, /floorplan was returning 404 on every request, and preflight said
 * "Everything wired". A check that cannot fail is not a check.
 *
 * So these are ordinary requests that should genuinely succeed, and anything
 * other than 200 is reported with the status and the API's own message. The
 * cost is a few tokens per run, which is the correct price for the difference
 * between "the key was not rejected" and "this feature works".
 */
const PING = 'Reply with exactly: OK';

const providers = [
  {
    name: 'Perplexity', env: 'PERPLEXITY_API_KEY', feature: '/neighbourhood',
    probe: key => fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'sonar', max_tokens: 16, messages: [{ role: 'user', content: PING }] }),
      signal: AbortSignal.timeout(30000),
    }),
  },
  {
    name: 'Anthropic', env: 'ANTHROPIC_API_KEY', feature: 'Blindspot prose',
    probe: key => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 16, messages: [{ role: 'user', content: PING }] }),
      signal: AbortSignal.timeout(30000),
    }),
  },
  {
    // Keep this model in step with lib/ai/providers.js. If they drift, this
    // reports a working deployment that is not, or a broken one that is fine.
    name: 'Gemini', env: 'GEMINI_API_KEY', feature: '/floorplan',
    probe: key => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: PING }] }] }),
        signal: AbortSignal.timeout(30000),
      }),
  },
];

/** The provider's own words, which are usually the actual diagnosis. */
async function reason(res) {
  try {
    const j = JSON.parse(await res.text());
    return (j.error?.message || j.error?.type || j.message || '').slice(0, 150);
  } catch { return ''; }
}

async function models() {
  for (const p of providers) {
    const key = val(p.env);
    if (!key) { add(MISS, p.name, `${p.env} not set — ${p.feature} is off and says so`); continue; }
    try {
      const res = await p.probe(key);
      if (res.status === 200) { add(OK, p.name, `live — ${mask(key)} answered`); continue; }

      const why = await reason(res);
      const lead =
        res.status === 401 || res.status === 403 ? 'key rejected'
        : res.status === 404 ? 'MODEL GONE — the key is fine, the model id is not'
        : res.status === 429 ? 'rate limited or out of credit'
        : res.status >= 500 ? 'provider error — may be transient, run again'
        : 'refused';
      add(BAD, p.name, `${lead} (${res.status})${why ? ' — ' + why : ''}`);
    } catch (e) {
      add(BAD, p.name, `could not reach the API — ${e.message}`);
    }
  }
}

/* ── local secrets ───────────────────────────────────────────────────────── */
function secrets() {
  const w = val('ARTICLE_WEBHOOK_SECRET');
  if (!w) add(MISS, 'Article webhook', 'ARTICLE_WEBHOOK_SECRET empty — Make.com cannot post; the route refuses every call');
  else if (w.length < 24) add(BAD, 'Article webhook', `secret is only ${w.length} characters — this is a bearer token on a public endpoint`);
  else add(OK, 'Article webhook', `secret set ${mask(w)}`);

  const s = val('STUDIO_PASSWORD');
  if (!s) add(MISS, 'Studio gate', 'STUDIO_PASSWORD empty — /studio is unreachable');
  else if (s.length < 12) add(BAD, 'Studio gate', `password is only ${s.length} characters`);
  else add(OK, 'Studio gate', 'password set');

  const u = val('URA_ACCESS_KEY');
  add(u ? OK : MISS, 'URA access key', u ? 'set — ingest:ura and ingest:rental can run' : 'not set — those two ingests cannot run');
}

/* ── report ──────────────────────────────────────────────────────────────── */
const run = async () => {
  await Promise.all([supabase(), models()]);
  secrets();

  const width = Math.max(...rows.map(r => r.name.length));
  console.log('\n  TRUESTOREY · PREFLIGHT\n');
  for (const r of rows) console.log(`  ${r.state}  ${r.name.padEnd(width)}  ${r.detail}`);

  const broken = rows.filter(r => r.state === BAD);
  const missing = rows.filter(r => r.state === MISS);
  console.log('');
  if (broken.length) {
    console.log(`  ${broken.length} BROKEN — configured and failing. These reach readers.`);
  }
  if (missing.length) {
    console.log(`  ${missing.length} missing — those features are off and each page says so.`);
  }
  if (!broken.length && !missing.length) console.log('  Everything wired.');
  console.log('');
  // Non-zero only for BROKEN. A deliberately unconfigured feature must not fail
  // a CI step, or nobody will run this before a deploy.
  process.exit(broken.length ? 1 : 0);
};

run();
