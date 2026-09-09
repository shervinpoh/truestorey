import { notFound } from 'next/navigation';
import { recordAt, getIndex, allUrls, nearby, nearbyManifest, storeyFor, landForRecord, nearbySalesFor, sunFor, approvalsOnBearing} from '../../../lib/data/query.js';
import { ogForRecord } from '../../../lib/og.js';
import { titleCase } from '../../../lib/name.js';
import RecordPage from '../../../components/RecordPage.jsx';
import { insightsForBlock } from '../../../lib/insights.js';

export const dynamicParams = true;

export async function generateStaticParams() {
  return allUrls().urls
    .filter(u => u.href.startsWith('/condo/'))
    .slice(0, 200)
    .map(u => ({ slug: u.href.split('/')[2] }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const r = recordAt('condo', slug);
  if (!r) return { title: 'Not found — Truestorey' };
  return {
    title: `${titleCase(r.label)} — transacted prices and psf | Truestorey`,
    description: `${r.n} filed transactions at ${titleCase(r.label)}, District ${r.district} (${r.segment}): S$${r.minPsf}–S$${r.maxPsf} psf, median S$${r.medianPsf} psf. Source: URA Data Service.`,
    alternates: { canonical: r.href },
    openGraph: { images: [{ url: ogForRecord(r), width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', images: [ogForRecord(r)] },
  };
}

export default async function Page({ params }) {
  const { slug } = await params;
  const rec = recordAt('condo', slug);
  if (!rec) notFound();

  /* Astronomy from the record's own coordinate, and what URA has permitted
     along the bearings it produces. Both at build time; neither needs a
     request. */
  const sun = sunFor(rec);
  const sunApprovals = sun
    ? approvalsOnBearing(rec, { from: sun.arc.from, to: sun.arc.to, within: 400 })
    : null;
  return (
    <RecordPage sun={sun} sunApprovals={sunApprovals} rec={rec} land={landForRecord(rec.href)} storey={storeyFor(rec)} near={nearby(rec)} sales={nearbySalesFor(rec)} nearManifest={nearbyManifest()} attribution={getIndex().attribution || []} posts={insightsForBlock(rec.href)}
      crumbs={[{ href: '/', label: 'Home' },
        { href: '/condo', label: 'Condos' },
        /* The district, which is a real destination now that ?d= opens one.
           It read Home / Condos, so the only step up from a project was all
           twenty-eight districts — the same journey the planner's tiles were
           making people repeat. */
        ...(rec.district ? [{ href: `/condo?d=${rec.district}`, label: `District ${rec.district}` }] : []),
      ]} />
  );
}
