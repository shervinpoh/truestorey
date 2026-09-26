/**
 * A floor plan report that travels in its own link, and cannot be forged.
 *
 * The plan image is never stored, so a shared report cannot be looked up by
 * id: the report itself goes in the link, compressed. That alone would let
 * anybody write any "report" into a URL and have it render on this domain,
 * beside a CEA registration number — a forged "this layout is a bargain"
 * with Shervin's name under it. So the server signs what it produced, and a
 * shared link is shown only after the server has checked the signature.
 * An altered link is refused, not repaired.
 *
 * Server only (node:crypto, node:zlib). The key is SHARE_SIGNING_KEY, or one
 * derived from ARTICLE_WEBHOOK_SECRET so the feature works on the existing
 * deployment; with neither set, sharing is off and the page says so.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { normaliseReport } from './floorplan.js';

export const MAX_TOKEN = 24_000;

function key(env = process.env) {
  const base = env.SHARE_SIGNING_KEY || env.ARTICLE_WEBHOOK_SECRET;
  return base ? createHmac('sha256', base).update('floorplan-share-v1').digest() : null;
}
const sign = (k, payload) => createHmac('sha256', k).update(payload).digest('base64url').slice(0, 32);

/** The link fragment for a report, or null when sharing is not configured. */
export function seal(report, env) {
  const k = key(env);
  if (!k || !report?.isFloorPlan) return null;
  const payload = deflateRawSync(Buffer.from(JSON.stringify(report)), { level: 9 }).toString('base64url');
  return `${payload}.${sign(k, payload)}`;
}

/** { report } when the link is genuine, { error } otherwise. */
export function open(token, env) {
  const k = key(env);
  if (!k) return { error: 'Shared reports are not available on this site right now.' };
  const t = String(token || '');
  if (t.length > MAX_TOKEN) return { error: 'That link is too long to be a floor plan report.' };
  const [payload, sig] = t.split('.');
  if (!payload || !sig) return { error: 'That link is incomplete.' };
  const want = Buffer.from(sign(k, payload)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    return { error: 'That link has been changed since it was made, so it is not shown.' };
  }
  try {
    const raw = JSON.parse(inflateRawSync(Buffer.from(payload, 'base64url'), { maxOutputLength: 200_000 }).toString('utf8'));
    /* Cleaned again on the way out: a genuine link made before a rule was
       tightened is shown under today's rules. */
    return { report: normaliseReport(raw) };
  } catch {
    return { error: 'That link could not be read.' };
  }
}
