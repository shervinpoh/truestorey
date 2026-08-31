import Link from 'next/link';
import { f, num } from './fmt.js';
import { landRate } from '../lib/land.js';

/**
 * How this ground was sold, years before anyone lived on it.
 *
 * HDB tenders a parcel, developers bid, one wins, and some years later the
 * building that stands there starts filing transactions. Both ends of that are
 * published and nobody puts them next to each other. This does — the tender
 * dates, the winning price, and every losing bid, on the page for the
 * development that came out of it.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
 * It does not subtract the land price from today's prices and call the
 * difference anything. That sum is the single most requested thing about land
 * data and it cannot be honestly made: between the tender and the first sale
 * sit construction, financing over a five-year build, marketing, agent
 * commissions, the development charge, GST, and the holding cost of unsold
 * stock, and NOT ONE of those is published for a named project by anyone. A
 * figure built from one fact and six guesses is not a margin, and presenting
 * it as one would be a valuation of a developer's business dressed as
 * arithmetic. The section says what sits in the gap and leaves it there.
 *
 * It also does not rank, score or characterise the bidding. "Eight bidders"
 * is a fact; "hotly contested" is a market claim under CEA PG 02-11 s3.1 and
 * would need substantiating against something. The number of bids is on the
 * page and the reader can think whatever they like about it.
 *
 * ── THE RATE ───────────────────────────────────────────────────────────────
 * Price ÷ gross floor area is a division of two figures HDB publishes, so it
 * is shown — but only when the GFA is a real one. Where HDB marks it "(max)"
 * the division gives the lowest the rate could be, not the rate, and it says
 * so in those words. Where there is no GFA at all nothing is shown and the
 * absence is stated, because a missing basis is not a zero.
 *
 * NOT COMPARABLE WITH URA's RATE. URA heads its own column "$psm per GFA or
 * $psm per GPR" without saying which applies to a given site, which is why
 * /land refuses to derive one for HDB rows and put the two in a column
 * together. Here there is one site and one basis, named on the page.
 */

const dt = iso => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${+d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1]} ${y}`;
};

export default function LandTrail({ land, label, rec }) {
  if (!land?.site) return null;
  const s = land.site;
  const rate = landRate(s);
  const bids = (s.bidDetail || []).slice().sort((a, b) => a.rank - b.rank);
  const top = bids[0]?.bid ?? s.price;

  return (
    <section className="pane" id="land">
      <h2 className="sh">The land under {label}</h2>
      <p className="lede">
        HDB put this parcel out to tender and names {label} as what was built on it.
        Everything below is from that tender: the dates, the winning price, and the
        {' '}{bids.length ? `${bids.length} bids that came in` : 'number of bids received'}.
      </p>

      {/* Three dates and a price. The parcel string is HDB's own — it carries
          the tender reference ("Ang Mo Kio S2a"), which is how a reader would
          find the row again on HDB's site. */}
      <ol className="trail">
        <li><span className="tlab">Tender launched</span><b className="mono">{dt(s.launched)}</b></li>
        <li><span className="tlab">Tender closed</span><b className="mono">{dt(s.closed)}</b>
          {s.bids ? <span className="tnote">{num(s.bids)} bid{s.bids === 1 ? '' : 's'} received</span> : null}</li>
        <li><span className="tlab">Awarded</span><b className="mono">{dt(s.award)}</b>
          <span className="tnote">{s.winner}</span></li>
        <li className="twin"><span className="tlab">Winning tender</span><b className="mono">{f(s.price)}</b>
          {rate ? (
            <span className="tnote">
              {rate.ceiling ? 'at least ' : ''}{f(rate.psm)} per sq m of gross floor area
              {' · '}{rate.ceiling ? 'at least ' : ''}{f(rate.psf)} per sq ft
            </span>
          ) : (
            <span className="tnote">
              HDB publishes no gross floor area for this site, so a rate per square foot cannot be
              worked out from what is published
            </span>
          )}
        </li>
      </ol>

      <dl className="parcel">
        <div><dt>Parcel</dt><dd className="mono">{s.site}</dd></div>
        <div><dt>Site area</dt><dd className="mono">{num(s.areaSqm)} sq m</dd></div>
        <div><dt>Lease</dt><dd className="mono">{s.lease || '—'}</dd></div>
        <div><dt>Plot ratio</dt><dd className="mono">{s.gpr ?? '—'}{s.gprNote ? ` (${s.gprNote})` : ''}</dd></div>
        <div><dt>Gross floor area</dt><dd className="mono">
          {s.gfaSqm ? `${num(s.gfaSqm)} sq m` : 'Not published'}{s.gfaIsCeiling ? ' (max)' : ''}
        </dd></div>
        <div><dt>Sold as</dt><dd className="mono">{s.kind}</dd></div>
      </dl>

      {rate?.ceiling && (
        <p className="prov">
          HDB marks this gross floor area as a maximum, so it is the most that could be built and
          not what was built. The rate above is therefore the lowest the land can have cost per
          square foot, not the rate itself.
        </p>
      )}

      {bids.length > 1 && (
        <details className="bidwrap">
          <summary>Every bid — all {bids.length}, as HDB published them</summary>
          <div className="tablewrap">
            <table className="landtable bidtable">
              <caption className="prov">
                Ranked by amount. The gap column is each bid measured against the
                winning one — subtraction, not a judgement about whether anyone
                bid well.
              </caption>
              <thead><tr>
                <th scope="col">#</th><th scope="col">Tenderer</th>
                <th scope="col" className="r">Bid</th><th scope="col" className="r">Behind the winner</th>
              </tr></thead>
              <tbody>
                {bids.map(b => (
                  <tr key={b.rank} className={b.rank === 1 ? 'won' : undefined}>
                    <td className="mono">{b.rank}</td>
                    <td>{b.tenderer}</td>
                    <td className="mono r">{f(b.bid)}</td>
                    <td className="mono r">{b.rank === 1
                      ? '—'
                      : `${f(top - b.bid)} · ${((1 - b.bid / top) * 100).toFixed(1)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* The honest bridge between the two ends of the page. */}
      <p className="prov gapnote">
        <b>What the land cost and what a unit sells for are not two ends of one sum.</b> Between
        them sit construction over a multi-year build, financing, the development charge,
        marketing and agent commissions, GST, and the cost of holding unsold units. None of those
        is published for a named project, so this site does not estimate a developer&rsquo;s cost
        or margin and no figure here should be read as one.
      </p>

      <p className="prov">
        Source: {land.sourcePage
          ? <a href={land.sourcePage} target="_blank" rel="noopener noreferrer">{land.source}</a>
          : land.source}
        {' · '}tender awarded {dt(s.award)}
        {' · '}transcribed from HDB&rsquo;s published tables on {land.transcribed}
        {' · '}prices are nominal and are not adjusted for inflation.
        {' '}HDB names the development on this row as &ldquo;{s.project}&rdquo;.
        {' '}<Link href="/land">Every land sale</Link>
      </p>
    </section>
  );
}
