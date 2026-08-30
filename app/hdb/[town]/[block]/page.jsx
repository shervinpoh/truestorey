import { notFound } from 'next/navigation';
import { recordAt, getIndex, allUrls, nearby, nearbyManifest, storeyFor, town as townOf, boundaries, geoRecords } from '../../../../lib/data/query.js';
import { simplify } from '../../../../lib/geojson.js';
import { ogForRecord } from '../../../../lib/og.js';
import { titleCase } from '../../../../lib/name.js';
import RecordPage from '../../../../components/RecordPage.jsx';
import { configured as mailConfigured } from '../../../../lib/email.js';
import { insightsForBlock, insightsForTown } from '../../../../lib/insights.js';

export const dynamicParams = true;   // the tail renders on demand and is then cached

/** Prerender the busiest blocks; the long tail is built on first request. */
export async function generateStaticParams() {
  return allUrls().urls
    .filter(u => u.href.split('/').length === 4 && u.href.startsWith('/hdb/'))
    .slice(0, 300)
    .map(u => { const p = u.href.split('/'); return { town: p[2], block: p[3] }; });
}

export async function generateMetadata({ params }) {
  const { town, block } = await params;
  const r = recordAt('hdb', town, block);
  if (!r) return { title: 'Not found — Truestorey' };
  return {
    title: `${titleCase(r.label)}, ${titleCase(r.town)} — resale prices and psf | Truestorey`,
    description: `${r.n} filed resale transactions at ${titleCase(r.label)}, ${titleCase(r.town)}: S$${r.minPsf}–S$${r.maxPsf} psf, median S$${r.medianPsf} psf. ${r.remainingLease} of lease left. Source: HDB via data.gov.sg.`,
    alternates: { canonical: r.href },
    openGraph: { images: [{ url: ogForRecord(r), width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', images: [ogForRecord(r)] },
  };
}

export default async function Page({ params }) {
  const { town, block } = await params;
  const rec = recordAt('hdb', town, block);
  if (!rec) notFound();
  return (
    <RecordPage canWatch={mailConfigured()} locator={locatorFor(rec)} rec={rec} storey={storeyFor(rec)} near={nearby(rec)} nearManifest={nearbyManifest()} attribution={getIndex().attribution || []}
      posts={[...insightsForBlock(rec.href), ...insightsForTown(town)]
        .filter((p, k, a) => a.findIndex(x => x.slug === p.slug) === k).slice(0, 4)}
      crumbs={[{ href: '/', label: 'Home' }, { href: '/hdb', label: 'HDB' },
               { href: `/hdb/${town}`, label: rec.town }]} />
  );
}

/**
 * The outline and the neighbours for one block's locator.
 *
 * Resolved here so the client ships coordinates and nothing else — no boundary
 * file, no geocode table. A town of 400 blocks is about 12KB of pairs.
 *
 * The area is matched on the town's own slug, the same join IslandMap makes.
 * Two of twenty-six towns have no planning area of that name and get no
 * outline; that is documented in Locator.jsx and is not a bug.
 */
function locatorFor(rec) {
  const geo = geoRecords();
  const here = geo[rec.href];
  if (!here) return null;                      // rule 12 — no coordinate, no map

  const area = (boundaries().areas || []).find(a => a.slug === rec.townSlug);
  const t = townOf(rec.townSlug);
  const points = [];
  for (const b of t?.blocks || []) {
    if (b.href === rec.href) continue;
    const g = geo[b.href];
    if (g) points.push({ href: b.href, lat: +g.lat.toFixed(5), lon: +g.lon.toFixed(5) });
  }
  return {
    here: { lat: +here.lat.toFixed(5), lon: +here.lon.toFixed(5) },
    points,
    area: area ? { rings: area.rings.map(r => simplify(r, 0.0004).map(([lo, la]) => [+lo.toFixed(5), +la.toFixed(5)])) } : null,
  };
}
