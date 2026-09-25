/**
 * Filing a written piece, the one way every script does it.
 *
 * Through the site's own webhook, never straight into the table: the webhook
 * sanitises, refuses a story already filed, chooses the photograph and writes
 * a DRAFT. Nothing a script writes reaches a reader until Shervin publishes it.
 * The desk's notification to the WhatsApp bot moved here from scripts/desk.mjs
 * so the news desk tells him about its drafts the same way.
 */
import { textOf } from './sources.js';

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://truestorey.vercel.app').replace(/\/$/, '');

/* A chart is embedded in the article as an absolute URL. Filing from a laptop
   with .env.local pointing at localhost would bake http://localhost:3000 into
   a stored row, visible only once published. */
export function refuseLocalhost(dry) {
  const site = siteUrl();
  if (!dry && /localhost|127\.0\.0\.1/.test(site)) {
    console.error(`\nNEXT_PUBLIC_SITE_URL is ${site}, so links and charts would be filed as localhost URLs.`);
    console.error('Run with --dry, or set NEXT_PUBLIC_SITE_URL to the live site before filing.\n');
    process.exit(1);
  }
  return site;
}

const db = () => {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  return base && key ? { url: `${base}/rest/v1/articles`, headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' } } : null;
};

/**
 * Articles filed in the last `days`, any status. null when it cannot be read —
 * which is "not known", never "nothing filed".
 */
export async function recentArticles(days = 60) {
  const d = db();
  if (!d) return null;
  const since = new Date(Date.now() - days * 864e5).toISOString();
  try {
    const r = await fetch(`${d.url}?select=id,slug,title,status,source_urls,header_image_url,created_at&created_at=gte.${since}&limit=300`, { headers: d.headers });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function articlesBySlug(slugs) {
  const d = db();
  if (!d || !slugs.length) return [];
  const r = await fetch(`${d.url}?select=id,slug,title,status,header_image_url&slug=in.(${slugs.map(encodeURIComponent).join(',')})`, { headers: d.headers });
  return r.ok ? r.json() : [];
}

export async function patchArticle(id, patch) {
  const d = db();
  if (!d) return { ok: false, error: 'Supabase is not configured' };
  const r = await fetch(`${d.url}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { ...d.headers, Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
  return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status} ${await r.text()}` };
}

export async function slugInUse(slug, exceptId = null) {
  const d = db();
  if (!d) return false;
  const r = await fetch(`${d.url}?select=id&slug=eq.${encodeURIComponent(slug)}`, { headers: d.headers });
  const rows = r.ok ? await r.json() : [];
  return rows.some(x => x.id !== exceptId);
}

/** POST to the webhook. Returns { ok, status, body }. */
export async function fileDraft(row) {
  const res = await fetch(`${siteUrl()}/api/webhook/article`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.ARTICLE_WEBHOOK_SECRET || ''}` },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/**
 * Tell the WhatsApp bot a draft exists. Never fails the run; loud when it
 * cannot send, because a quiet notification failure is what hid two desk
 * drafts for two mornings in September.
 */
export async function notifyBot(filed, row) {
  const url = process.env.APPS_SCRIPT_URL, k = process.env.WA_WEBHOOK_KEY, secret = process.env.MAKE_SECRET;
  if (!url || !k || !secret) {
    console.warn('  NOT NOTIFIED. ' + [!url && 'APPS_SCRIPT_URL', !k && 'WA_WEBHOOK_KEY', !secret && 'MAKE_SECRET']
      .filter(Boolean).join(', ') + ' is not set, so the article is filed and nothing will say so.\n');
    return;
  }
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}k=${encodeURIComponent(k)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'articles', secret, items: [{
        id: filed.id || '', slug: filed.slug || row.slug, title: row.title,
        category: row.category, excerpt: row.excerpt, sources: row.source_urls || [] }] }),
      signal: AbortSignal.timeout(15000),
    });
    const reply = await res.json().catch(() => ({}));
    if (!res.ok || !reply.ok) console.warn(`  NOT NOTIFIED. Apps Script ${res.status}: ${reply.error || 'no delivery acknowledgement'}.`);
    else if (reply.notified) console.log(`  Bot delivery confirmed via ${reply.channel || 'configured fallback'}.`);
    else console.log(`  Bot acknowledged the article; no new message was needed (${reply.reason || 'duplicate'}).`);
  } catch (e) {
    console.warn(`  NOT NOTIFIED. ${e.name === 'TimeoutError' ? 'The Apps Script timed out' : e.message}.`);
  }
}

/** Lines of an agency page that pass `keep`, as facts. */
export async function fetchFacts(url, keep = () => true, limit = 14) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Truestorey/1.0; +https://truestorey.vercel.app)' } });
    if (!res.ok) return [];
    return textOf(await res.text()).split('\n').filter(l => l.length >= 40 && keep(l)).slice(0, limit);
  } catch { return []; }
}
