import Link from 'next/link';
import { f, num } from './fmt.js';
import { landRate } from '../lib/land.js';

/**
 * What has been filed on this ground since it was sold.
 *
 * The second half of the arc. The tender above is one year and one number;
 * this is every year since, at the building that came out of it.
 *
 * ── WHY THE TWO ENDS ARE NOT SUBTRACTED ────────────────────────────────────
 * Because the difference is not a margin. Between the tender and the first
 * sale sit construction over a multi-year build, financing, the development
 * charge, marketing and agent commissions, GST, and the cost of holding unsold
 * units — and not one of those is published for a named project by anybody.
 * The gap is named in words instead, in the paragraph at the bottom, which is
 * the same refusal /land makes and for the same reason.
 *
 * ── AND WHY THE RATE COMPARISON IS ONLY EVER A RATIO OF TWO FILED FIGURES ──
 * Land per square foot of gross floor area against today's filed psf is a
 * division of two published numbers, so it is shown. It is NOT a return, a
 * profit or an appreciation: gross floor area includes what nobody buys — the
 * corridors, the void decks, the car park — so the two are not the same square
 * foot, and the caption says so rather than leaving a reader to assume they are.
 */
export default function SinceThen({ site, rec, trend, label }) {
  const rate = landRate(site);
  const awardYear = String(site.award).slice(0, 4);
  const rows = trend?.rows || [];
  const peak = rows.length ? Math.max(...rows.map(r => r.sizedPsf || 0)) : 0;

  return (
    <section className="pane" id="since">
      <h2 className="sh"><span>What has been filed there since</span></h2>

      <div className="arc">
        <div>
          <span className="lab">{awardYear} · the ground</span>
          <b className="mono">{f(site.price)}</b>
          <span className="hint">
            {rate
              ? <>{rate.ceiling ? 'at least ' : ''}{f(rate.psf)} per sq ft of gross floor area</>
              : <>HDB publishes no gross floor area for this parcel, so no rate can be worked out</>}
          </span>
        </div>
        <div className="arcgap" aria-hidden="true"><span /></div>
        <div>
          <span className="lab">Today · the homes on it</span>
          <b className="mono">{rec?.medianPsf ? `$${num(rec.medianPsf)}` : '—'}</b>
          <span className="hint">
            {rec?.n
              ? <>median of {num(rec.n)} filed transactions{rec.period ? `, ${rec.period.from} to ${rec.period.to}` : ''}</>
              : <>nothing filed there yet</>}
          </span>
        </div>
      </div>

      {rate && rec?.medianPsf && (
        <p className="prov">
          Those two are not the same square foot. Gross floor area includes what nobody buys — the
          corridors, the car park, the plant rooms — so the land rate is spread across more area than
          a unit is sold by. The ratio is arithmetic on two published figures and is not a return,
          a profit, or an appreciation.
        </p>
      )}

      {rows.length > 1 && (
        <>
          <div className="sh" style={{ marginTop: 24 }}><span>
            {trend.allSizes ? 'Year by year, every size at this address' : 'Year by year, for a median-sized unit'}
          </span></div>
          <div className="tablewrap">
            <table className="landtable trendtable">
              <caption className="prov">
                {trend.allSizes
                  ? 'Every size that sold, which is why it moves when the mix of sizes moves and not only when prices do — no single size band here has enough years to stand on its own yet.'
                  : `${trend.band} band.`} Counts in brackets; a year with fewer than {trend.min} filed
                sales is kept and marked rather than dropped, because a reader can discount a thin
                year and cannot discount one that was silently removed.
              </caption>
              <thead><tr>
                <th scope="col">Year</th>
                <th scope="col" className="num">Median psf</th>
                <th scope="col">Against the year before</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const prev = i > 0 ? rows[i - 1].sizedPsf : null;
                  const move = prev && r.sizedPsf ? ((r.sizedPsf / prev) - 1) * 100 : null;
                  return (
                    <tr key={r.year} className={r.thin ? 'thinyear' : undefined}>
                      <td className="mono">{r.year}</td>
                      <td className="mono num">${num(r.sizedPsf)} <i>({num(r.sizedN)})</i></td>
                      <td className="mono">
                        <span className="bar2" aria-hidden="true">
                          <i style={{ width: `${peak ? Math.round((r.sizedPsf / peak) * 100) : 0}%` }} />
                        </span>
                        {move === null ? '—' : `${move > 0 ? '+' : ''}${move.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="prov gapnote">
        <b>The two ends of this page are not two ends of one sum.</b> Between the tender and the
        first unit sold sit construction over a multi-year build, financing, the development charge,
        marketing and agent commissions, GST, and the cost of holding unsold stock. None of those is
        published for a named project, so nothing here estimates a developer&rsquo;s cost or margin
        and no figure on this page should be read as one.{' '}
        <Link href="/refused">Why that is refused</Link>.
      </p>
    </section>
  );
}
