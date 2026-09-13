import { yields } from '../../../lib/data/query.js';

/**
 * One project's size cohorts, on demand.
 *
 * ── WHY THIS ROUTE EXISTS ──────────────────────────────────────────────────
 * /yield was 884KB. Every other page on the site is between 27 and 70. The
 * route already trimmed the dataset before handing it over — and kept
 * `cohorts`, which is the whole of the bulk: 1,441 projects averaging 2.7
 * cohorts each, every one carrying a band, an area range, a bed count, two
 * medians and a yield, all serialised into the RSC payload so that a
 * collapsed row could print the word "3 sizes".
 *
 * That is the third instance of the failure already written down in
 * CLAUDE.md against /mop and /market: passing a whole dataset because a
 * component takes one field off it. The trim was attempted here and stopped
 * one field short, which is worse than not trimming at all, because it looks
 * like the problem was dealt with.
 *
 * The list now carries a COUNT. The cohorts arrive when a reader opens one
 * project, which is the only time they are on screen.
 *
 * Small and separate rather than folded into /api/record, for the reason
 * /api/rent gives at the top of its own file: bundling a rent or yield index
 * into every record lookup to serve one page is the same failure wearing a
 * different hat.
 *
 * ── IT IS IN outputFileTracingIncludes ─────────────────────────────────────
 * A route that reads data/ at request time is invisible to the tracer, which
 * follows imports statically and cannot see `path.join(cwd, 'data', f)` with
 * a runtime f. Left out, this works perfectly in dev and returns nothing for
 * every project in production. CLAUDE.md says that has been forgotten twice.
 */
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const href = new URL(request.url).searchParams.get('href');
  if (!href) return Response.json({ cohorts: null, error: 'no href' }, { status: 400 });

  const y = yields();
  /* Degrade, never break. A missing build or an unknown project closes one
     disclosure and says so; it does not error the page the reader is on. */
  if (!y?.projects) return Response.json({ cohorts: null, error: 'not built' }, { status: 503 });

  const p = Object.values(y.projects).find(x => x.href === href);
  if (!p) return Response.json({ cohorts: null, error: 'no project' }, { status: 404 });

  return Response.json({
    href: p.href,
    label: p.label,
    cohorts: p.cohorts || [],
    /* Rule 6 travels with the figures rather than being left on the page that
       asked for them — these rows carry medians, and a median with no source
       beside it is not a claim this site makes. */
    basis: y.basis ?? null,
    min: y.min ?? null,
    source: y.source ?? null,
  });
}
