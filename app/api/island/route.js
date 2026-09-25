import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const revalidate = 86400;

/**
 * The homepage map's points, compact.
 *
 * data/map.json carries 12,934 points with their page, label and a few more
 * fields — about a megabyte, which is what /map is for. The homepage only has
 * to DRAW them, so this sends kind, position and median psf as integers
 * (roughly a fifth of the size) and the labels separately, fetched only when
 * a reader first points at the map.
 *
 * The lesson it follows is in CLAUDE.md: two pages once shipped a whole
 * dataset to print four numbers. The points ARE this picture, so they are
 * sent — but not a byte the picture does not use.
 */
let cache = null;
function load() {
  if (cache) return cache;
  const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'map.json'), 'utf8'));
  const [s, w, n, e] = m.bbox;          // [minLat, minLon, maxLat, maxLon]
  const pts = [], labels = [];
  for (const p of m.points) {
    const [kind, lat, lon, psf, href, label] = p;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(psf)) continue;
    pts.push([kind, Math.round((lat - s) * 1e5), Math.round((lon - w) * 1e5), Math.round(psf)]);
    labels.push([label, href]);
  }
  cache = {
    base: { lat: s, lon: w, n, e },
    breaks: m.breaks, counts: m.counts,
    source: m.source?.points || m.source || null,
    pts, labels,
  };
  return cache;
}

export async function GET(req) {
  try {
    const d = load();
    const wantLabels = new URL(req.url).searchParams.get('labels') === '1';
    const body = wantLabels ? { labels: d.labels } : { base: d.base, breaks: d.breaks, counts: d.counts, source: d.source, pts: d.pts };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } });
  } catch {
    return NextResponse.json({ error: 'The map points are not available.' }, { status: 503 });
  }
}
