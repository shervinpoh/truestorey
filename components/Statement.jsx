/**
 * The figures a page exists to give, set as a statement.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Shervin, 26 Sep, on /cost: the ledger "feels like an unwanted piece of
 * information that is there … important information — numbers, data — should
 * make the user feel it is important to read." He was right about why. Every
 * section on every page had the same 14px grey mono label, so the ledger
 * looked exactly like "The rest of it", and its rows were set in grey at the
 * caption size — the page's main figures, styled as secondary text.
 *
 * So the one block per page that holds the answer is a sheet laid on the
 * page: the real surface above the warm ground, a heading a reader reads
 * rather than a label, what it is based on stamped beside it the way a bank
 * statement dates itself, rows at reading size in ink, and — where there is
 * a total — the accountant's double rule under it. Everything else on the
 * page stays as it was, which is what makes this read as the thing to read.
 *
 * Use it once or twice a page, never for commentary, links or forms. A
 * statement on everything is the same as none; globals.css says this about
 * the accent colour for the same reason.
 *
 * Server-safe: no state, no effects.
 */
export default function Statement({ id, title, basis = null, lede = null, children }) {
  const hid = `${id || 'stmt'}-h`;
  return (
    <section className="stmt" id={id} aria-labelledby={hid}>
      <header className="stmt-head">
        <h2 id={hid}>{title}</h2>
        {basis && <span className="stmt-basis">{basis}</span>}
      </header>
      {lede && <p className="stmt-lede">{lede}</p>}
      {children}
    </section>
  );
}
