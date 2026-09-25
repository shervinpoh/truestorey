import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sanitizeHtml, textOf } from '../../../../lib/sanitize.js';
import { insertArticle, slugTaken, recentTitles, configured } from '../../../../lib/supabase/rest.js';
import { duplicateOf, inventedVoice } from '../../../../lib/compliance.js';
import { findCover, coverId, readCover } from '../../../../lib/cover.js';
import { placeOf } from '../../../../lib/place.js';
import { claude } from '../../../../lib/ai/providers.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/* Choosing a photograph is a handful of Commons requests, six thumbnails and
   one look by a model — ten to twenty-five seconds, against a ten-second
   default. The choice itself is cut off at thirty, so Make is answered well
   inside its own timeout even on a slow morning. */
export const maxDuration = 60;

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

  /* An invented experience is refused at the door, not left for the publish
     button to catch: a draft that says "I have watched couples…" is not a
     draft anybody should have to read to reject. 422 names the phrase, so the
     sender's log says exactly what was wrong. */
  const voice = inventedVoice(`${title} ${body.excerpt || ''} ${html}`);
  if (voice) {
    return NextResponse.json({
      error: 'That piece claims an experience nobody on record had, and cannot be filed.',
      found: voice,
      note: 'Pieces are written by the desk, not in the first person. Address the reader as "you" instead.',
    }, { status: 422 });
  }

  /* ── the same story, filed again ──────────────────────────────────────────
     One GLS tender arrived three times — "Marina Gardens Lane, Orchard
     Boulevard GLS launch 2026", "…GLS tenders" and "URA … GLS 2H2026". Three
     different slugs, so the collision check below saw nothing, and the feed
     advertised its own automation more loudly than it reported the news.

     Compared on TITLE AND SLUG. The three titles share almost no words — "Two
     Prime GLS Sites Open, And The Timeline They Set" against "What the Marina
     Gardens Lane and Orchard Boulevard tenders tell you" scores 0.00 — because
     a headline is meant to vary. The subject does not, and the pipeline puts
     it in the slug, which carries marina-gardens-lane-orchard-boulevard-gls in
     all three.

     Refused at intake rather than at publish, so the queue stays readable: a
     person should not have to notice that three of the five drafts in front
     of them are the same tender. 409 with the slug it duplicates, so the
     pipeline can log which story it already had. */
  const candidateSlug = slugify(body.slug || title);
  const recent = await recentTitles();
  const priorTitle = duplicateOf({ title, slug: candidateSlug }, recent);
  if (priorTitle) {
    return NextResponse.json({
      error: 'That story has already been filed.',
      duplicateOf: { slug: priorTitle.slug, title: priorTitle.title, status: priorTitle.status },
      similarity: Number(priorTitle.score.toFixed(2)),
      note: 'Titles sharing most of their significant words are the same story. '
          + 'Archive the earlier one first if this is meant to replace it.',
    }, { status: 409 });
  }

  let slug = candidateSlug;
  if (!slug) slug = `article-${Date.now()}`;
  // Collisions are resolved rather than rejected: a pipeline that files two
  // pieces on the same town in a week should not need a human to rename one.
  if (await slugTaken(slug)) slug = `${slug}-${new Date().toISOString().slice(0, 10)}`;
  if (await slugTaken(slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  /* ── A PHOTOGRAPH OF THE PLACE, CHOSEN HERE ───────────────────────────────
     The Make pipeline has never sent an image, so every piece it filed arrived
     bare and got a stock photograph of an object later, if anyone ran the
     backfill. It is chosen at intake instead, so the draft Shervin reviews
     already shows the photograph a reader will see, and approving the piece
     approves the picture.

     A sender that supplies its own image keeps it. The desk sends a Commons
     cover it has already chosen; anything else it sends is honoured as
     before. Failure here never costs the article: no photograph, and the
     draft files anyway. */
  let image = String(body.header_image_url || '').trim();
  let photographer = String(body.unsplash_photographer_name || '').trim();
  let coverNote = image ? 'supplied' : null;
  if (!image) {
    const avoid = new Set(recent.map(r => coverId(r.header_image_url)).filter(Boolean));
    const found = await findCover(
      { title, slug: candidateSlug, tags: Array.isArray(body.tags) ? body.tags : [],
        sources: Array.isArray(body.source_urls) ? body.source_urls : [] },
      { placeOf, avoid, claude, signal: AbortSignal.timeout(30000) },
    ).catch(e => ({ url: null, reason: e.name === 'TimeoutError' ? 'timed out' : e.message }));
    if (found.url) { image = found.url; photographer = ''; }
    coverNote = found.url ? `chosen by ${found.how}` : `none: ${found.reason}`;
  }
  // An Unsplash image without its photographer is a licence breach waiting to
  // happen, so the image is dropped rather than the attribution. A Commons
  // image carries its credit in its own URL, and one that does not is dropped
  // for the same reason.
  const commons = readCover(image);
  const keepImage = image && (commons ? !commons.refused : (!/unsplash/i.test(image) || photographer));

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
    cover: coverNote,
    review: '/studio',
    note: 'Filed as a draft. It is not on the site until it is published from /studio.',
  }, { status: 201 });
}

export async function GET() {
  return NextResponse.json({ error: 'POST only.' }, { status: 405 });
}
