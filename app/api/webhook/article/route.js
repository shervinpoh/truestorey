import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sanitizeHtml, textOf } from '../../../../lib/sanitize.js';
import { insertArticle, slugTaken, configured } from '../../../../lib/supabase/rest.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The article intake, from the Make.com pipeline.
 *
 * IT ALWAYS WRITES A DRAFT. Never published, not with a flag, not on request.
 * A Perplexity → Gemini → Claude chain reaching a live page with nobody in
 * between is how rule 9 gets broken by accident, and everything on this site
 * carries a CEA registration number. The bot asks; Shervin answers; /studio
 * publishes. That approval step is the feature, not friction in front of it.
 *
 * Three other things happen here and each has a reason:
 *
 *   · The HTML is sanitised before it is stored, not before it is rendered.
 *     Storing it clean means a future page that forgets to sanitise is still
 *     safe, and it means the stored row matches what a reader will see.
 *   · The Unsplash download endpoint is pinged. It is a condition of their API
 *     licence and it is the one thing here that is not optional.
 *   · The secret is compared in constant time. A plain === leaks the length
 *     and the position of the first wrong byte to anyone patient enough.
 */

const MAX_BODY = 512 * 1024;

function authorised(req) {
  const expected = process.env.ARTICLE_WEBHOOK_SECRET;
  if (!expected) return false;                       // unset means closed, not open
  const header = req.headers.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : (req.headers.get('x-webhook-secret') || '');
  const a = Buffer.from(given), b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

const CATEGORIES = new Set(['deep_dive', 'note', 'policy', 'editorial']);

const slugify = s => String(s).toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

/**
 * Unsplash requires a download to be registered when a photo is used. Failing
 * to do it is a licence breach; failing the whole article because their API
 * had a bad minute would be worse. It is fired, awaited briefly, and its
 * outcome recorded rather than thrown.
 */
async function pingUnsplash(location) {
  if (!location || !/^https:\/\/api\.unsplash\.com\//.test(location)) return 'skipped';
  const key = process.env.UNSPLASH_ACCESS_KEY;
  try {
    const res = await fetch(location, {
      headers: key ? { Authorization: `Client-ID ${key}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? 'ok' : `failed ${res.status}`;
  } catch (e) {
    return `failed ${e.name}`;
  }
}

export async function POST(req) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }
  if (!configured()) {
    return NextResponse.json({ error: 'Supabase is not configured on this deployment.' }, { status: 503 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: 'That article was too large.' }, { status: 413 });
  }
  let body;
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ error: 'Could not read that JSON.' }, { status: 400 }); }

  const title = String(body.title || '').trim();
  const html = sanitizeHtml(String(body.content_html || ''));
  if (!title) return NextResponse.json({ error: 'An article needs a title.' }, { status: 422 });
  if (textOf(html).length < 200) {
    return NextResponse.json({ error: 'That came through with almost no body text — check the pipeline.' }, { status: 422 });
  }

  const category = CATEGORIES.has(body.category) ? body.category : 'note';

  let slug = slugify(body.slug || title);
  if (!slug) slug = `article-${Date.now()}`;
  // Collisions are resolved rather than rejected: a pipeline that files two
  // pieces on the same town in a week should not need a human to rename one.
  if (await slugTaken(slug)) slug = `${slug}-${new Date().toISOString().slice(0, 10)}`;
  if (await slugTaken(slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const image = String(body.header_image_url || '').trim();
  const photographer = String(body.unsplash_photographer_name || '').trim();
  // An Unsplash image without its photographer is a licence breach waiting to
  // happen, so the image is dropped rather than the attribution.
  const keepImage = image && (!/unsplash/i.test(image) || photographer);

  const download = await pingUnsplash(body.unsplash_download_location);

  const row = {
    title: title.slice(0, 200),
    slug,
    category,
    excerpt: String(body.excerpt || textOf(html).slice(0, 220)).trim().slice(0, 400),
    content_html: html,
    header_image_url: keepImage ? image : null,
    unsplash_photographer_name: keepImage ? (photographer || null) : null,
    unsplash_photographer_profile_url: keepImage ? (String(body.unsplash_photographer_profile_url || '') || null) : null,
    unsplash_download_location: String(body.unsplash_download_location || '') || null,
    tags: Array.isArray(body.tags) ? body.tags.map(t => String(t).slice(0, 40)).slice(0, 12) : [],
    source_urls: Array.isArray(body.source_urls) ? body.source_urls.map(u => String(u).slice(0, 500)).slice(0, 20) : [],
    status: 'draft',            // not negotiable, see the note at the top
    published_at: null,
  };

  const { data, error } = await insertArticle(row);
  if (error) return NextResponse.json({ error }, { status: 502 });

  return NextResponse.json({
    ok: true,
    id: data?.[0]?.id || null,
    slug,
    status: 'draft',
    unsplashDownload: download,
    imageKept: Boolean(keepImage),
    review: '/studio',
    note: 'Filed as a draft. It is not on the site until it is published from /studio.',
  }, { status: 201 });
}

export async function GET() {
  return NextResponse.json({ error: 'POST only.' }, { status: 405 });
}
