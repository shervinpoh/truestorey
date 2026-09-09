import Link from 'next/link';

/**
 * The strip across the top of the editorial front page.
 *
 * ── WHY A FINANCE PAPER LEADS WITH THIS ────────────────────────────────────
 * The FT opens on markets, Bloomberg on tickers. It is not decoration: it
 * tells a reader what kind of publication they have arrived at before they
 * read a word of it. A property blog cannot do this because it has no market
 * data of its own — it has opinions about somebody else's.
 *
 * This site has four published indices, a transaction window, an MOP cohort
 * and the last land award, all with periods and agencies attached, assembled
 * by lib/brief.js for the morning brief. They were going to Shervin's phone
 * and nowhere else.
 *
 * ── WHAT IT IS NOT ─────────────────────────────────────────────────────────
 * Not a ticker. Nothing here moves, blinks or updates on a timer: these are
 * quarterly indices and a monthly register, and animating them would imply a
 * liveness the data does not have. The period is printed on every figure for
 * the same reason.
 *
 * A quarter-on-quarter move is shown where the source publishes one. Green and
 * red are reserved on this site for a price that moved, and that is exactly
 * what these are, so they are allowed here and nowhere else on the page.
 */
export default function MarketStrip({ brief, dateLabel }) {
  const figures = (brief?.figures || []).slice(0, 4);
  if (!figures.length) return null;

  const gls = brief?.gls?.latestAward;
  const mop = brief?.mop?.thisYear;

  return (
    <div className="mstrip">
      <div className="mstriprow">
        <span className="mstripday mono">{dateLabel}</span>
        {figures.map(f => {
          const move = f.qoq ?? f.yoy;
          const unit = f.qoq != null ? 'q/q' : 'y/y';
          return (
            <span className="mfig" key={f.id}>
              <span className="lab">{shortName(f.what)}</span>
              <b className="mono">{f.value}</b>
              {Number.isFinite(move) && (
                <i className={'mmove mono ' + (move > 0 ? 'up' : move < 0 ? 'dn' : '')}>
                  {move > 0 ? '+' : ''}{move}% {unit}
                </i>
              )}
              <span className="mper mono">{f.period}</span>
            </span>
          );
        })}
      </div>

      <div className="mstripsub">
        {mop && (
          <span>
            <b className="mono">{mop.units.toLocaleString('en-SG')}</b> flats reach MOP in {mop.year}
            {' '}&mdash; eligibility to sell, not an intention to.{' '}
            <Link href="/mop">Which blocks</Link>
          </span>
        )}
        {gls && (
          <span>
            Last land award: <b>{gls.site}</b>, {gls.date}, {gls.bids} bid{gls.bids === 1 ? '' : 's'}.{' '}
            <Link href="/land">The trail</Link>
          </span>
        )}
        {brief?.missing?.length > 0 && (
          /* Named, not dropped. A strip that silently omits a figure it could
             not read is a strip that looks complete and is not. */
          <span className="mmiss">Not read today: {brief.missing.join('; ')}.</span>
        )}
      </div>
    </div>
  );
}

/* The full names are correct and unreadable in a 12px strip. Shortened for
   display only — every figure keeps its period beside it, and /methodology
   carries the full name and basis. */
function shortName(what) {
  return String(what)
    .replace('URA Private Residential Property Price Index, all residential', 'URA all')
    .replace('URA private index, non-landed', 'URA non-landed')
    .replace('URA private index, landed', 'URA landed')
    .replace('HDB Resale Price Index', 'HDB resale');
}
