/**
 * Supabase over its REST interface, with no SDK.
 *
 * PostgREST is an ordinary HTTP API and the repo ships three dependencies on
 * purpose. `@supabase/supabase-js` would add a client, a realtime transport
 * and an auth layer for what is, here, four queries against one table.
 *
 * Two keys, two very different powers, and they must never be confused:
 *   SERVICE ROLE  bypasses row-level security. Server only. Never in a client
 *                 component, never in NEXT_PUBLIC_, never in a response body.
 *   ANON          read-only under RLS, safe to expose.
 *
 * Every function returns { data, error } and never throws, so a database
 * outage degrades a page rather than 500-ing the site.
 */

/*
 * Supabase now issues `sb_publishable_…` and `sb_secret_…` in place of the old
 * anon and service_role JWTs, and is phasing the legacy pair out. Both namings
 * are accepted so an existing deploy keeps working and a new one can use the
 * current keys without a code change.
 *
 * The new names are checked first because that is what a project created today
 * hands you.
 */
const url = () => process.env.SUPABASE_URL?.replace(/\/$/, '') || null;
const serviceKey = () =>
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const anonKey = () =>
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || null;

export const configured = () => Boolean(url() && (serviceKey() || anonKey()));

/**
 * How long a PAGE-facing read of a published article may be cached.
 *
 * This is a backstop, not the mechanism: publishing from /studio calls
 * revalidatePath, so the real answer appears immediately. The TTL only covers
 * the case where that call does not land.
 */
const ARTICLE_TTL = 300;

/**
 * `revalidate` is the difference between a page that renders and a 500.
 *
 * Every call here used to be `cache: 'no-store'`, which is right for a write,
 * for /studio, and for a slug collision check — none of those may ever read a
 * stale answer. It is WRONG for the read behind /insights/[slug], and wrong in
 * a way that only appears in a production build.
 *
 * That route sets `dynamicParams = true` so an article published from /studio
 * renders the first time it is asked for, with no rebuild. Next can only do
 * that if the render is cacheable. A no-store fetch inside it turns the page
 * dynamic at runtime, and a statically-exported page is not allowed to become
 * dynamic — so Next throws and every pipeline article 500s instead of
 * appearing. In dev it works perfectly, which is why this survived until the
 * first production build.
 *
 * So: no-store stays the default, because the unsafe direction here is a stale
 * write. A read that feeds a page opts in.
 */
async function request(pathAndQuery, { method = 'GET', body, service = false, prefer, revalidate = null, signal } = {}) {
  const base = url();
  const key = service ? serviceKey() : (anonKey() || serviceKey());
  if (!base || !key) return { data: null, error: 'Supabase is not configured.' };

  try {
    const res = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      ...(signal ? { signal } : {}),
      ...(revalidate === null ? { cache: 'no-store' } : { next: { revalidate } }),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) return { data: null, error: data?.message || `Supabase ${res.status}` };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e.message };
  }
}

const COLUMNS = 'id,title,slug,category,excerpt,content_html,header_image_url,' +
  'unsplash_photographer_name,unsplash_photographer_profile_url,tags,status,' +
  'source_urls,published_at,created_at';

/**
 * Published articles, newest first. Returns [] on any failure — never throws.
 *
 * Cacheable: this feeds the /insights index and nothing that must be current
 * to the second. Publishing revalidates the path.
 */
export async function publishedArticles({ limit = 60 } = {}) {
  const { data, error } = await request(
    `articles?select=${COLUMNS}&status=eq.published&order=published_at.desc&limit=${limit}`,
    { revalidate: ARTICLE_TTL });
  return error ? [] : (data || []);
}

/**
 * One published article. Cacheable, and it has to be — this is the read inside
 * /insights/[slug], which renders on demand for anything the pipeline
 * published after the last build. See the note on `request`: a no-store fetch
 * here makes that page dynamic at runtime and Next 500s it.
 */
export async function articleBySlug(slug) {
  const { data, error } = await request(
    `articles?select=${COLUMNS}&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`,
    { revalidate: ARTICLE_TTL });
  return error ? null : (data?.[0] || null);
}

/** Drafts. Service role only — these are not public. */
export async function draftArticles({ limit = 50 } = {}) {
  const { data, error } = await request(
    `articles?select=${COLUMNS}&status=eq.draft&order=created_at.desc&limit=${limit}`,
    { service: true });
  return error ? [] : (data || []);
}

export async function insertArticle(row) {
  return request('articles', {
    method: 'POST', body: row, service: true, prefer: 'return=representation',
  });
}

export async function setArticleStatus(id, status) {
  const patch = { status };
  if (status === 'published') patch.published_at = new Date().toISOString();
  return request(`articles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', body: patch, service: true, prefer: 'return=representation',
  });
}

export async function slugTaken(slug) {
  const { data } = await request(
    `articles?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`, { service: true });
  return Boolean(data?.length);
}

/* ── events ───────────────────────────────────────────────────────────────── */

/**
 * One analytics event. Service role, because the events table has RLS on with
 * no policies and nothing else can reach it.
 *
 * Split into the three fixed columns plus a jsonb bag: `t`, `e` and `s` are on
 * every event and are what the funnel groups by; everything else is whitelisted
 * per event type in lib/analytics.js and varies, so it goes in `props` rather
 * than forcing a migration each time an event is added.
 *
 * Never throws. An analytics outage must not be visible to a reader, so the
 * caller returns 204 whatever this says.
 */
export async function insertEvent(ev) {
  if (!ev || !ev.e || !ev.s) return { data: null, error: 'empty event' };
  const { t, e, s, ...props } = ev;
  return request('events', {
    method: 'POST', service: true,
    body: { t: t || new Date().toISOString(), e, s, props },
    prefer: 'return=minimal',
    // A visitor is waiting on this response. A hung connection must not hold a
    // page open, and a lost event is a far better outcome than a slow site.
    signal: AbortSignal.timeout(2500),
  });
}

/**
 * Events for the stats report, newest first. Read by scripts/stats.mjs.
 * Returns [] on any failure rather than throwing — a report that cannot reach
 * the database should say so, not crash.
 */
export async function recentEvents({ limit = 5000 } = {}) {
  const { data, error } = await request(
    `events?select=t,e,s,props&order=t.desc&limit=${limit}`, { service: true });
  if (error) return { rows: [], error };
  // Flatten props back to the shape sanitise() produced, so every reader after
  // this point is identical whether the events came from Supabase or the file.
  return { rows: (data || []).map(r => ({ t: r.t, e: r.e, s: r.s, ...(r.props || {}) })), error: null };
}

/* ─────────────────────────────── block watch ────────────────────────────── */
/*
 * Every function here is SERVICE-ROLE ONLY. block_watch has RLS on with no
 * policies, so the anon key can read nothing — which is the point: the table
 * pairs an email address with a home address, and that pairing is the most
 * sensitive thing this site stores. None of these may ever be called from a
 * client component.
 */

const WATCH_COLS = 'id,email,href,label,mark_month,mark_n,confirmed_at,unsub_token,last_sent_at';

/**
 * Start or renew a watch. Upserts on (lower(email), href), so submitting twice
 * updates the row rather than posting a second copy of the same digest.
 *
 * Consent travels as evidence — the exact wording and its version — because a
 * boolean cannot answer "what did they agree to". PDPA s14(2).
 */
export async function upsertWatch(row) {
  const { data, error } = await request('block_watch?on_conflict=email,href', {
    method: 'POST',
    service: true,
    body: [row],
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  return { data: data?.[0] || null, error };
}

/** Confirmed watches for one block, or for every block when href is null. */
export async function watchesFor(href = null) {
  const q = href
    ? `block_watch?select=${WATCH_COLS}&href=eq.${encodeURIComponent(href)}&confirmed_at=not.is.null`
    : `block_watch?select=${WATCH_COLS}&confirmed_at=not.is.null`;
  const { data, error } = await request(q, { service: true });
  return { data: data || [], error };
}

/** Move the watermark on after a digest goes out. */
export async function markWatchSent(id, mark) {
  return request(`block_watch?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    service: true,
    body: { mark_month: mark.month, mark_n: mark.n, last_sent_at: new Date().toISOString() },
  });
}

/** Turn a confirmation token into a live subscription. */
export async function confirmWatch(token) {
  const { data, error } = await request(
    `block_watch?confirm_token=eq.${encodeURIComponent(token)}`,
    { method: 'PATCH', service: true, body: { confirmed_at: new Date().toISOString() },
      prefer: 'return=representation' });
  return { data: data?.[0] || null, error };
}

/**
 * Withdraw. The row is DELETED, not flagged.
 *
 * PDPA s16 — on withdrawal the personal data must stop being used, and the
 * only way to be sure of that is for it not to be there. A soft-deleted row is
 * an email address and a home address still sitting in a table, waiting for
 * the next query that forgets to filter.
 */
export async function deleteWatch(token) {
  const { data, error } = await request(
    `block_watch?unsub_token=eq.${encodeURIComponent(token)}`,
    { method: 'DELETE', service: true, prefer: 'return=representation' });
  return { data: data?.[0] || null, error };
}
