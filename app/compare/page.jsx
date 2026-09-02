import Link from 'next/link';
import { recordByHref, getIndex } from '../../lib/data/query.js';
import { titleCase } from '../../lib/name.js';
import Masthead from '../../components/Masthead.jsx';
import ToolIntro from '../../components/ToolIntro.jsx';
import ToolUse from '../../components/ToolUse.jsx';
import ComparePicker from '../../components/ComparePicker.jsx';

export const metadata = {
  title: 'Compare — two or three blocks side by side | Truestorey',
  description: 'Put any blocks or projects next to each other: median price and psf, the observed range, the spread, filed transactions and lease left. Free, no sign-up, and the comparison is in the URL.',
  alternates: { canonical: '/compare' },
};

/**
 * Two or three records, side by side.
 *
 * Every figure here already renders on a record page. This is a layout, not a
 * feature — which is exactly why it was worth building: the answer to "which
 * of these two" was on the site the whole time and needed two tabs and a
 * memory to get at.
 *
 * THE COMPARISON IS THE URL. No account, no cookie, no saved list — the site
 * does not have any of those and this was not going to be the first. ?a=&b=&c=
 * carries hrefs, which means a comparison can be sent to whoever else is
 * deciding, which is the actual use: nobody buys a flat alone.
 *
 * WHAT IS NOT COMPARED, and why. Not a winner, not a score, not a
 * recommendation — rule 2. Two columns of filed figures and the reader draws
 * the conclusion. Psf across an HDB flat and a condo is flagged rather than
 * silently ranked, because they are different markets and the number invites a
 * comparison the data does not support.
 */
const KEYS = ['a', 'b', 'c'];

/** A field that renders the same way whatever kind of record it came from. */
const money = v => (Number.isFinite(v) ? `S$${v.toLocaleString('en-SG')}` : '—');
const psf = v => (Number.isFinite(v) ? `$${v.toLocaleString('en-SG')}` : '—');

export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const hrefs = KEYS.map(k => (typeof sp?.[k] === 'string' ? sp[k] : null)).filter(Boolean);
  const recs = hrefs.map(h => recordByHref(h)).filter(Boolean);
  const missing = hrefs.length - recs.length;
  const i = getIndex();

  const kinds = new Set(recs.map(r => r.kind));
  const mixed = kinds.size > 1;

  const rows = [
    ['Median price', r => money(r.medianPrice)],
    ['Median psf', r => `${psf(r.medianPsf)} psf`],
    ['Observed range, psf', r => `${psf(r.minPsf)} — ${psf(r.maxPsf)}`],
    ['Observed range, price', r => `${money(r.minPrice)} — ${money(r.maxPrice)}`],
    ['Spread, low to high', r => (Number.isFinite(r.medianPsf)
      ? `${Math.round(((r.maxPsf - r.minPsf) / r.medianPsf) * 100)}%` : '—')],
    ['Filed transactions', r => (Number.isFinite(r.n) ? r.n.toLocaleString('en-SG') : '—')],
    ['Against 12 months ago', r => (Number.isFinite(r.yoy)
      ? `${r.yoy >= 0 ? '▲' : '▼'} ${Math.abs(r.yoy).toFixed(1)}%` : 'not enough sales')],
    ['Lease', r => (r.kind === 'HDB'
      ? `to ${r.leaseCommence + 99} · ${r.remainingLease} left`
      : (Array.isArray(r.tenure) ? 'mixed tenure' : r.tenure || '—'))],
    ['Where', r => (r.kind === 'HDB'
      ? titleCase(r.town)
      : `District ${r.district}${r.segment ? ` · ${r.segment}` : ''}`)],
    ['Sizes filed', r => ((r.flatTypes || r.propertyTypes || []).join(', ') || '—')],
  ];

  return (
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]}
        title="Compare"
        sub="Put two or three blocks or projects next to each other. Every figure here is the same filed figure its own page shows — nothing is scored, ranked or recommended." />
      <ToolIntro href="/compare" />
      <ToolUse id="compare" />

      <section className="pane">
        <ComparePicker selected={recs.map(r => ({ href: r.href, label: titleCase(r.label) }))} />
      </section>

      {missing > 0 && (
        <div className="warn">
          <p style={{ margin: 0 }}>
            {missing === 1 ? 'One address in that link' : `${missing} addresses in that link`} could
            not be found. A block only has a page once a sale has actually been filed there.
          </p>
        </div>
      )}

      {recs.length === 0 ? (
        <section className="pane">
          <p className="hint">Add a block or project above to start. Two is usually enough; three fits.</p>
        </section>
      ) : (
        <section className="pane">
          {mixed && (
            <div className="note">
              <b>These are different markets.</b> Price per square foot for an HDB flat and for
              private property are not measured against the same buyers, the same tenure or the same
              supply, so the psf rows below are worth reading down each column rather than across.
            </div>
          )}

          <div className="tablewrap">
            <table className="cmp">
              <thead>
                <tr>
                  <th scope="col"><span className="lab">Field</span></th>
                  {recs.map(r => (
                    <th scope="col" key={r.href}>
                      <Link href={r.href}>{titleCase(r.label)}</Link>
                      <span className="lab">{r.kind === 'HDB' ? 'HDB' : 'Private'}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, get]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {recs.map(r => <td key={r.href} className="mono">{get(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="note">
            <b>No verdict, on purpose.</b> There is no score here and no "better" column. The
            figures are what was filed at each address over the period below; which of them suits
            you depends on your floor, your lease, your financing and what you intend to do next,
            and none of that is in a public dataset.
          </div>

          <p className="prov">
            {i.hdb?.source} · {i.hdb?.period?.from} to {i.hdb?.period?.to}<br />
            {i.private?.source} · {i.private?.period?.from} to {i.private?.period?.to}<br />
            Accessed {i.hdb?.accessedAt}. Medians and ranges are of filed transactions at each
            address over its own period, not a valuation of any unit in it.
          </p>
        </section>
      )}
    </main>
  );
}
