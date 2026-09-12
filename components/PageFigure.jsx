/**
 * The number a page is about, before the page starts.
 *
 * ── WHY THESE PAGES NEEDED IT AND RECORD PAGES DID NOT ─────────────────────
 * A record page opens with its median psf at 80px, the observed range beside
 * it and the source line beneath, and it is the best moment on this site. It
 * works because the figure sits in its own section: `.bleed` has something
 * compact to anchor on, and the page gets one change of ground.
 *
 * /market, /mop and /land each turned out to have exactly ONE `.pane`
 * containing the entire page — measured at 5,392, 1,918 and 6,450 characters.
 * So there was nothing to anchor. Wrapping the only pane in a bleed changes
 * the whole page's background, which is a theme rather than a moment, and the
 * pages went on reading as one flat column however good the view inside was.
 *
 * This is the missing piece: the figure each page already computes, lifted out
 * of the view and given the treatment the record pages use. Nothing new is
 * derived. It is the same number the page was always about, said first.
 *
 * ── /cost DOES NOT GET ONE, AND THAT IS NOT AN OVERSIGHT ───────────────────
 * Its headline figure is the break-even a sale must clear, and that is
 * computed from what the reader types. A static number at the top of an
 * input-driven tool would either be a made-up example presented as a fact, or
 * a zero. The page already opens with ToolIntro, which is the right furniture
 * for a calculator.
 *
 * ── THE SOURCE LINE IS NOT OPTIONAL ────────────────────────────────────────
 * Rule 6. A derived figure renders its source and its period, and a figure
 * given this much visual weight is the last place to drop it. `note` is for
 * what the figure does NOT say, which on this site is usually the more
 * important sentence: MOP eligibility is not supply, and an index is not a
 * home.
 */
export default function PageFigure({ value, unit, label, support, note, source }) {
  return (
    <section className="pane bleed pagefig">
      <span className="pagefiglab mono">{label}</span>
      <p className="pagefignum">
        {value}{unit && <em>{unit}</em>}
      </p>
      {support && <p className="pagefigsup">{support}</p>}
      {note && <p className="pagefignote">{note}</p>}
      {source && <p className="prov mono">{source}</p>}
    </section>
  );
}
