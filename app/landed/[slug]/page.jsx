import { notFound } from 'next/navigation';
import { recordAt, getIndex, allUrls, nearby, nearbyManifest, storeyFor } from '../../../lib/data/query.js';
import { ogForRecord } from '../../../lib/og.js';
import { titleCase } from '../../../lib/name.js';
import RecordPage from '../../../components/RecordPage.jsx';
import { insightsForBlock } from '../../../lib/insights.js';

export const dynamicParams = true;

export async function generateStaticParams() {
  return allUrls().urls
    .filter(u => u.href.startsWith('/landed/'))
    .slice(0, 200)
    .map(u => ({ slug: u.href.split('/')[2] }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const r = recordAt('landed', slug);
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
  const rec = recordAt('landed', slug);
  if (!rec) notFound();
  return (
    <RecordPage rec={rec} storey={storeyFor(rec)} near={nearby(rec)} nearManifest={nearbyManifest()} attribution={getIndex().attribution || []} posts={insightsForBlock(rec.href)}
      crumbs={[{ href: '/', label: 'Home' }, { href: '/landed', label: 'landed' === 'condo' ? 'Condos' : 'Landed' }]} />
  );
}
