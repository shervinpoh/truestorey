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

async function request(pathAndQuery, { method = 'GET', body, service = false, prefer } = {}) {
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
      cache: 'no-store',
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

/** Published articles, newest first. Returns [] on any failure — never throws. */
export async function publishedArticles({ limit = 60 } = {}) {
  const { data, error } = await request(
    `articles?select=${COLUMNS}&status=eq.published&order=published_at.desc&limit=${limit}`);
  return error ? [] : (data || []);
}

export async function articleBySlug(slug) {
  const { data, error } = await request(
    `articles?select=${COLUMNS}&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`);
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
