import Masthead from '../../components/Masthead.jsx';
import { JOBS } from '../../lib/datasets.js';
import { getIndex, priceIndices } from '../../lib/data/query.js';

export const metadata = {
  title: 'Methodology — what is measured, from what, and what it cannot tell you',
  description:
    'Every figure on Truestorey, its source, the period it covers, how often it is refreshed, '
    + 'how it is derived, and the limits of what it can support. Nothing here is a valuation.',
};

/**
 * The page the notes were doing badly.
 *
 * ── WHY IT EXISTS ──────────────────────────────────────────────────────────
 * There are 91 `.note` blocks across app/ and components/ and they are doing
 * five different jobs at once — warning, method, privacy, regulatory boundary,
 * and ordinary explanation — in one visual treatment. Two separate reviews
 * arrived at the same conclusion from opposite directions: one counted the
 * notes, the other asked where the methodology page was.
 *
 * The rule this page does NOT break: a caveat that changes a decision stays
 * beside the figure it qualifies. Source and period, "not a valuation", a
 * missing Blindspot check, gross-versus-net yield, straight-line distance, the
 * school ballot wording — all of those belong at the point of use and are not
 * moved here. What moves here is the long-form method behind them.
 *
 * ── WHY THE REFRESH TABLE IS GENERATED ─────────────────────────────────────
 * From lib/datasets.js, the same list the scheduler runs. A freshness table
 * typed by hand drifts from the job that actually runs, and a page claiming a
 * daily refresh over a weekly one would be the precise failure this site was
 * built to refuse.
 */
export default function Page() {
  const idx = getIndex();
  const { hdb, ppi } = priceIndices();

  return (
    <main className="shell">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/about', label: 'About' }]}
        title="Methodology"
        sub="What each figure measures, what it is derived from, and where it stops." />

      <section className="pane">
        <p className="lede">
          Every number here comes from a published government dataset, moved through arithmetic
          that is written down. Nothing is estimated, modelled or scored by a language model.
          Where a figure cannot be produced honestly, the page says so instead of producing one.
        </p>

        <h2 className="sh"><span>The one rule everything else follows</span></h2>
        <div className="note">
          <b>A model never assigns a number.</b> Blindspot&rsquo;s score comes from a published
          formula in <code>lib/blindspot/rubric.js</code>. Language models on this site write prose
          around figures that are already fixed, and are told which figures they may use. If a
          feature needs a model to produce a number, that is treated as evidence the feature is
          wrong rather than evidence the rule should bend.
        </div>

        <h2 className="sh"><span>How often each dataset is refreshed</span></h2>
        <p className="hint">
          The interval is how often the <em>source</em> publishes, not how often it is convenient to
          ask. This table is generated from the same list the scheduler runs, so it cannot drift
          from what actually happens.
        </p>
        <div className="tablewrap">
          <table className="ledgertable">
            <thead>
              <tr><th scope="col">Dataset</th><th scope="col">Checked</th><th scope="col">Why that interval</th></tr>
            </thead>
            <tbody>
              {JOBS.map(j => (
                <tr key={j.key}>
                  <td className="mono">{j.key}</td>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                    {j.every === 1 ? 'daily' : `every ${j.every} days`}
                  </td>
                  <td>{j.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          A dataset is only re-downloaded when it is past due, and the deploy happens only when the
          data actually changed — so a quiet day produces no commit rather than a timestamp with
          nothing behind it.
        </p>

        <h2 className="sh"><span>What &ldquo;filed&rdquo; means</span></h2>
        <p>
          A transaction appears here once it has been <b>filed with the authority and published by
          it</b> &mdash; a lodged caveat for private property, a registered resale for HDB. That is
          not the day the deal was agreed. A caveat is typically lodged some weeks after the option
          is exercised, and the agency publishes it after that.
        </p>
        <p className="hint">
          So the most recent weeks are always thinner than they will eventually be, on this site and
          on every other. A month that looks quiet may simply not have finished arriving. Nothing
          here back-fills silently: the period covered is printed beside the figures it produced.
        </p>

        <h2 className="sh"><span>What each derived figure is</span></h2>
        <dl className="mdef">
          <dt>Median price, and median psf</dt>
          <dd>
            The middle of the filed transactions for that address over the period shown &mdash;
            calculated here, not supplied by the agency. Per square foot uses the area as filed
            (strata area for private, floor area for HDB), which is not the same as usable space.
            <b> A median of one sale is not a median</b>, and a record with a single filed
            transaction says so rather than printing a range with identical ends.
          </dd>

          <dt>Observed range and spread</dt>
          <dd>
            The cheapest and dearest psf actually filed, not a confidence interval and not a
            forecast. Where a home sits inside it depends on floor, facing, renovation and lease,
            none of which the transaction record contains.
          </dd>

          <dt>Floor premium</dt>
          <dd>
            Measured <em>within a single building</em> by comparing filed sales in different storey
            bands, never by applying a national curve to a specific address. A curve that does not
            rise with height is refused rather than applied. Both agencies publish a storey
            <em> band</em>, not a floor.
          </dd>

          <dt>Gross rental yield</dt>
          <dd>
            Filed annual rent over filed price, matched on unit size band. <b>Gross, not net</b>
            &mdash; it carries no maintenance, tax, insurance, vacancy, agent fee or financing cost,
            and those are the difference between a yield and an income.
          </dd>

          <dt>Blindspot score</dt>
          <dd>
            Six checks scored against a published rubric. A check that cannot run scores nothing and
            says so; it is never counted as zero risk, and the denominator shown is the number that
            actually ran.
          </dd>

          <dt>Price indices</dt>
          <dd>
            Published quarterly by the agencies and used unrebased.
            {hdb?.name && <> HDB&rsquo;s runs from {hdb.series?.from}.</>}
            {ppi?.name && <> URA&rsquo;s runs from {ppi.series?.from}.</>}
            {' '}Both share a 1Q2009 = 100 base, which is what lets them sit beside each other.
            <b> An index is a market and a home is one home</b>: applying one to a single address
            says what the market did, not what that address did.
          </dd>

          <dt>Historical windows</dt>
          <dd>
            Every holding period of the reader&rsquo;s own length that has run in the index, counted
            rather than turned into a probability &mdash; overlapping windows are not independent
            trials. Where the record holds fewer than four <em>non-overlapping</em> stretches of
            that length, the section refuses to read rather than reporting a count that is one
            history read many times.
          </dd>

          <dt>Distances</dt>
          <dd>
            Straight-line, always labelled as such. What sits between two points &mdash; a canal, an
            expressway, a fence &mdash; is in no dataset held here, so a walking time would be a
            guess presented as a measurement. The 1km school band is ballot priority, not a place.
          </dd>
        </dl>

        <h2 className="sh"><span>What is deliberately absent</span></h2>
        <p>
          A valuation of any specific home. A projection of a launch price. A score for a project. A
          walking time. A school place. Any use of REALIS, which is licensed for personal research
          and not for commercial use. The reasons are set out, one by one, on{' '}
          <a href="/refused">what this site will not do</a>.
        </p>

        <h2 className="sh"><span>Where a figure is wrong</span></h2>
        <p>
          Two different things get confused here. If a <b>filed transaction</b> looks wrong, it is
          wrong at the agency &mdash; nothing on this site can correct a caveat, and it is not
          edited on the way through. If a <b>derivation, a name, a coordinate or a match</b> looks
          wrong, that is this site&rsquo;s to fix. Say which, at{' '}
          <a href="/about">the contact on the about page</a>, with the page you were on.
        </p>

        {idx.attribution?.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 10, borderTop: '1px solid var(--line2)' }}>
            {idx.attribution.map((a, i) => <span className="lab" key={i} style={{ display: 'block' }}>{a}</span>)}
          </div>
        )}
      </section>
    </main>
  );
}
