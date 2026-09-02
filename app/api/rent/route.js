import { rentFor, recordByHref } from '../../../lib/data/query.js';

/**
 * What a home like this actually lets for, from filed tenancy contracts.
 *
 * Small and separate rather than folded into /api/record, because /cost is the
 * only caller and bundling a 700KB rent index into every record lookup to
 * serve one page would be the "passing a whole dataset because a component
 * takes one field off it" failure this repo already has a note about.
 *
 * Degrades to 200 with `{ rent: null }` rather than erroring: a missing rent
 * disables one line on the ledger and says so, and never breaks the page.
 */
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const href = url.searchParams.get('href');
  const beds = url.searchParams.get('beds');
  if (!href) return Response.json({ rent: null, error: 'no href' }, { status: 400 });

  const rec = recordByHref(href);
  if (!rec) return Response.json({ rent: null, error: 'no record' }, { status: 404 });

  const rent = rentFor(href, {
    beds: beds || null,
    district: rec.district || null,
    propertyType: rec.landed ? undefined : 'Non-landed Properties',
  });

  return Response.json({
    href: rec.href,
    label: rec.label,
    kind: rec.kind,
    medianPsf: rec.medianPsf ?? null,
    minPsf: rec.minPsf ?? null,
    maxPsf: rec.maxPsf ?? null,
    n: rec.n ?? null,
    period: rec.period ?? null,
    source: rec.source ?? null,
    rent,
  });
}
