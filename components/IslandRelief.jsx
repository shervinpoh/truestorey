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
 * ── IT TAKES ELEVEN SCALARS, NOT THE GEOMETRY ──────────────────────────────
 * data/render/island.json is 85KB of coordinates and this component must
 * never see it. /mop shipped 2.7MB, /market shipped 2.7MB and /yield shipped
 * 884KB, every one of them because a component took one field off a dataset
 * and App Router put the whole dataset in the RSC payload behind it. The
 * export writes island-meta.json for exactly this, so the mistake is not
 * available to make.
 *
 * ── THE CAPTION STATES A FINDING ───────────────────────────────────────────
 * Rule 6 needs the source and the period, and it gets them. But a caption that
 * only says where a picture came from has left the reader to infer the point,
 * and the point here is a number: the dearest town's median is 1.7 times the
 * cheapest. That is why the relief is gentle rather than dramatic, and saying
 * it out loud is what stops a reader reading the gentleness as a weak render.
 */
const f0 = n => Math.round(n).toLocaleString('en-SG');

export default function IslandRelief({ meta }) {
  /* Degrade, never break. No export, no block — the page is the map, and the
     map does not depend on this. */
  if (!meta?.highest || !meta?.lowest) return null;

  const { highest: hi, lowest: lo, pricedAreas, totalAreas, ratio } = meta;
  const flat = totalAreas - pricedAreas;

  const alt =
    `A relief model of Singapore. Each of the ${totalAreas} planning areas is raised in ` +
    `proportion to its filed median HDB resale price per square foot and shaded on a ` +
    `six-step pale-to-deep teal ramp. ${hi.name} stands highest at S$${f0(hi.psf)} per ` +
    `square foot and ${lo.name} lowest at S$${f0(lo.psf)}. The ${flat} areas with no ` +
    `filed resale — the water catchment, the airbases, the port and the outlying ` +
    `islands — lie flat in grey.`;

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
        <figcaption className="reliefcap">
          <span className="relieflab mono">Every town&rsquo;s median, as one object</span>
          <p className="reliefsup">
            {hi.name} is the dearest town on the island at S${f0(hi.psf)} psf and{' '}
            {lo.name} the cheapest at S${f0(lo.psf)} — a ratio of{' '}
            <b>{ratio.toFixed(2)}&times;</b>. Height here is proportional to the figure
            itself and starts at zero, so that is the ratio you are looking at. Drawn
            against the range instead of against zero, the same gap would stand
            twenty-five times taller and Singapore would appear to have a skyline it
            does not have.
          </p>
          <p className="reliefnote">
            {flat} of the {totalAreas} areas lie flat and grey because no HDB resale has
            been filed in them — the water catchment, the airbases, the port and the
            outlying islands. That is an absence of housing, not an absence of data, and
            a hole in the model would have read as the second.
          </p>
          <p className="prov mono">
            Heights: {meta.psfSource}
            {meta.period?.from ? `, ${meta.period.from} to ${meta.period.to}` : ''}
            {meta.accessedAt ? `, accessed ${meta.accessedAt}` : ''}<br />
            Outlines: {meta.source}<br />
            Median psf per planning area, rendered in Blender from this site&rsquo;s own
            data. Not a valuation, and not a figure for any individual block.
          </p>
        </figcaption>
      </figure>
    </section>
  );
}
