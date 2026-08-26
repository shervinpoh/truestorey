import { notFound } from 'next/navigation';
import { recordAt, getIndex, allUrls, nearby, nearbyManifest, storeyFor } from '../../../../lib/data/query.js';
import { ogForRecord } from '../../../../lib/og.js';
import { titleCase } from '../../../../lib/name.js';
import RecordPage from '../../../../components/RecordPage.jsx';
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
    <RecordPage rec={rec} storey={storeyFor(rec)} near={nearby(rec)} nearManifest={nearbyManifest()} attribution={getIndex().attribution || []}
      posts={[...insightsForBlock(rec.href), ...insightsForTown(town)]
        .filter((p, k, a) => a.findIndex(x => x.slug === p.slug) === k).slice(0, 4)}
      crumbs={[{ href: '/', label: 'Home' }, { href: '/hdb', label: 'HDB' },
               { href: `/hdb/${town}`, label: rec.town }]} />
  );
}
