import { notFound } from 'next/navigation';
import { recordAt, getIndex, allUrls, nearby, nearbyManifest, storeyFor, landForRecord, nearbySalesFor, sunFor, approvalsOnBearing, catalogue } from '../../../lib/data/query.js';
import { configured as crmConfigured } from '../../../lib/crm.js';
import { ldJson, dataset } from '../../../lib/schema.js';
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

  /* Astronomy from the record's own coordinate, and what URA has permitted
     along the bearings it produces. Both at build time; neither needs a
     request. */
  const sun = sunFor(rec);
  const sunApprovals = sun
    ? approvalsOnBearing(rec, { from: sun.arc.from, to: sun.arc.to, within: 400 })
    : null;
  return (
    <>
      <script type="application/ld+json"
        dangerouslySetInnerHTML={ldJson(recordSchema(rec))} />
      <RecordPage sun={sun} sunApprovals={sunApprovals} canCapture={crmConfigured()} rec={rec} land={landForRecord(rec.href)} storey={storeyFor(rec)} near={nearby(rec)} sales={nearbySalesFor(rec)} nearManifest={nearbyManifest()} attribution={getIndex().attribution || []} posts={insightsForBlock(rec.href)}
      crumbs={[{ href: '/', label: 'Home' },
        { href: '/landed', label: 'Landed' },
        /* The district, which is a real destination now that ?d= opens one.
           It read Home / Condos, so the only step up from a project was all
           twenty-eight districts — the same journey the planner's tiles were
           making people repeat. */
        ...(rec.district ? [{ href: `/landed?d=${rec.district}`, label: `District ${rec.district}` }] : []),
      ]} />
    </>
  );
}

/* ── THE RECORD, AS THE DATASET IT IS ─────────────────────────────────────
   Not a Product and not a RealEstateListing. Nothing here is for sale and no
   price is on offer — this is a public register rendered, and Dataset is the
   type that says so without asserting a valuation (rule 2).

   temporalCoverage and isBasedOn carry the two facts an answer engine weights
   most and most property sites cannot supply: how old the figures are, and
   whose they are. The page already prints both, because rule 6 requires it. */
function recordSchema(rec) {
  const cat = catalogue();
  const hdb = rec.kind === 'HDB';
  const period = hdb ? cat.hdbPeriod : cat.privatePeriod;
  const where = hdb ? titleCase(rec.town) : `District ${rec.district}`;
  return dataset({
    name: `${titleCase(rec.label)} — filed transactions`,
    description: `${rec.n} filed ${hdb ? 'HDB resale' : 'private residential'} transactions at `
      + `${titleCase(rec.label)}, ${where}, Singapore, with the observed range and median `
      + `for each size, as registered with the agency named below.`,
    href: rec.href,
    n: rec.n,
    source: hdb ? cat.hdbSource : cat.privateSource,
    from: period && period.from,
    to: period && period.to,
  });
}
