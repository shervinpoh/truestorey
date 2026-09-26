import Link from 'next/link';
import { num } from './fmt.js';

/**
 * Every town's median, as one object.
 *
 * ── WHY THIS IS ON /map AND NOT SOMEWHERE PRETTIER ─────────────────────────
 * It is the only page about where things are that does not already show this.
 * The homepage and the block pages carry IslandMap, which is the same 55
 * planning areas banded by the same ramp — in two dimensions, interactive, and
 * better at its job than a picture could be. Putting a render above it would
 * be one view competing with a stronger one.
 *
 * /map is the dot map: 13,115 individual blocks and projects, each at its own
 * coordinate. That answers "where is this block" and cannot answer "what does
 * a town come to", because thirteen thousand dots do not add up by eye. This
 * is the aggregate, and height is the thing a flat map has no room for — the
 * two views are about different questions on the same geography.
 *
 * ── IT SHIPPED WITHOUT A KEY, AND THAT WAS THE WHOLE PROBLEM ───────────────
 * The first version of this carried a caption naming Queenstown as the dearest
 * town and Choa Chu Kang as the cheapest, above a picture in which neither can
 * be found: no legend, no town names, no scale. Six colours and a range of
 * heights, and nothing anywhere saying what either one meant. A reader could
 * admire it and learn nothing, which is the definition of decoration — and
 * this site's own PriceMap says in its header that the relief for its two
 * palest bands IS the legend carrying the psf figure for each one.
 *
 * So the key is the same `.ramp` strip the map below uses, built from the same
 * breaks, because two keys that look different imply two scales. What the
 * picture cannot do — name a town — is handed to the map that can, in a
 * sentence, rather than left for the reader to notice is missing.
 *
 * Height and colour carry the SAME figure on purpose. That is redundant
 * encoding, not a wasted channel: the colour survives being small on a phone
 * and the height survives being colourblind, and either one alone would be the
 * only way in for somebody.
 *
 * ── IT TAKES THIRTEEN SCALARS, NOT THE GEOMETRY ────────────────────────────
 * data/render/island.json is 85KB of coordinates and this component must
 * never see it. /mop shipped 2.7MB, /market shipped 2.7MB and /yield shipped
 * 884KB, every one of them because a component took one field off a dataset
 * and App Router put the whole dataset in the RSC payload behind it. The
 * export writes island-meta.json for exactly this, so the mistake is not
 * available to make.
 */
export default function IslandRelief({ meta }) {
  /* Degrade, never break. No export, no block — the page is the map, and the
     map does not depend on this. */
  if (!meta?.highest || !meta?.lowest) return null;

  const { highest: hi, lowest: lo, pricedAreas, totalAreas, ratio } = meta;
  const ramp = meta.ramp || [];
  const breaks = meta.breaks || [];
  const flat = totalAreas - pricedAreas;

  const alt =
    `A relief model of Singapore. Each of the ${totalAreas} planning areas is raised in ` +
    `proportion to its filed median HDB resale price per square foot and shaded on a ` +
    `six-step pale-to-deep teal ramp, so the tallest and darkest areas are the dearest. ` +
    `${hi.name} stands highest at S$${num(hi.psf)} per square foot and ${lo.name} lowest ` +
    `at S$${num(lo.psf)}. The ${flat} areas with no filed resale — the water catchment, ` +
    `the airbases, the port and the outlying islands — lie flat in grey.`;

  return (
    <section className="pane bleed relief">
      <figure className="reliefig">
        {/* AVIF first, WebP second, and no PNG third. Both come out of the same
            Cycles render — Blender writes both formats itself, so the delivery
            cost no converter and no fourth dependency. 24KB and 40KB at
            2400px; the PNG of this is 3.3MB.

            width and height are the real pixels so the box is reserved before
            the bytes arrive, and the stylesheet sets height:auto because an
            HTML height attribute outranks aspect-ratio and has already shipped
            one image on this site at 120x360. */}
        <picture>
          <source type="image/avif" srcSet="/editorial/island-a.avif" />
          <source type="image/webp" srcSet="/editorial/island-a.webp" />
          <img src="/editorial/island-a.webp" alt={alt}
            width="2400" height="1200" decoding="async" />
        </picture>
        {/* OUTSIDE THE CAPTION, AND UNDER THE PICTURE ON PURPOSE.
            Inside the caption column it was 375px wide, so six steps at a 96px
            flex basis wrapped to two rows of three — and a ramp broken across
            two rows stops reading as one continuous scale, which is the only
            thing a ramp has to do. Under the image it gets the full 582px and
            stays one strip.

            It is also the first thing after the picture in source order, so a
            phone reader meets the key immediately after the thing it explains
            rather than four paragraphs later. */}
        {ramp.length > 0 && breaks.length > 0 && (
          <div className="maplegend reliefkey">
            {/* NOT just "Median psf", which is what the map's own key below
                says. That key re-bands itself when a reader switches to Condo
                or Landed — a flat and a bungalow do not share a scale — so two
                keys with the same label and different figures would sit on one
                page looking like a contradiction. This one is HDB resale only,
                aggregated to the town, and says so. */}
            <span className="lab">Median psf &middot; HDB resale, by town</span>
            <div className="ramp">
              {ramp.map((c, i) => (
                <div key={c} className="step">
                  <i style={{ background: c }} />
                  <span className="mono">
                    {i === 0 ? `under $${num(breaks[0])}`
                      : i === ramp.length - 1 ? `$${num(breaks[breaks.length - 1])}+`
                      : `$${num(breaks[i - 1])}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <figcaption className="reliefcap">
          <span className="relieflab mono">Every town&rsquo;s median, as one object</span>
          <p className="reliefsup">
            Singapore&rsquo;s {totalAreas} planning areas, each raised by what a square foot
            sold for in it. <b>Taller and darker is dearer.</b>
          </p>


          <p className="reliefsup">
            {hi.name} is the dearest town on the island at S${num(hi.psf)} psf and{' '}
            {lo.name} the cheapest at S${num(lo.psf)} — a ratio of{' '}
            <b>{ratio.toFixed(2)}&times;</b>. Height starts at zero, so that is the ratio you see.
          </p>

          {/* What a picture cannot do, said plainly, next to the thing that can.
              A reader told that Queenstown is the dearest town, above a render
              in which no town is named, has been given a fact and no way to use
              it. */}
          <p className="reliefnote">
            <b>No town is named here</b> &mdash; <Link href="#map">the map below</Link> labels every
            one. {flat} of the {totalAreas} areas lie flat and grey because no HDB resale is filed
            in them: catchment, airbases, port and islands.
          </p>

          <p className="prov mono">
            Heights: {meta.psfSource}
            {meta.period?.from ? `, ${meta.period.from} to ${meta.period.to}` : ''}
            {meta.accessedAt ? `, accessed ${meta.accessedAt}` : ''}<br />
            Outlines: {meta.source}<br />
            Six equal-sized groups, not six equal price steps. Median psf per planning area,
            rendered in Blender from this site&rsquo;s own data. Not a valuation, and not a
            figure for any individual block.
          </p>
        </figcaption>
      </figure>
    </section>
  );
}
