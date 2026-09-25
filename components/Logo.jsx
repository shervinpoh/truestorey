/**
 * The mark and the wordmark.
 *
 * ── WHAT WAS THERE, AND WHY IT CHANGED ─────────────────────────────────────
 * "True" in ink and "storey" reversed out of a teal box, at 16.6px. The name
 * is the best asset the site has — a true story, told one storey at a time —
 * and the box read as a label stuck on a word rather than as a name. At that
 * size it was also the smallest thing in the header, which is backwards, and
 * there was no symbol at all: nothing for the browser tab, a phone's home
 * screen or a share card to carry.
 *
 * ── THE MARK ───────────────────────────────────────────────────────────────
 * Three towers cut into storeys, one storey lit — see Mark below for how it
 * got there. It is the site's whole idea in one picture: buildings read floor
 * by floor, one record at a time.
 *
 * The wordmark keeps the old split, "True" in ink and "storey" in the deep
 * teal, set in the heading face at weight 800.
 */
export function Mark({ size = 30 }) {
  /* Three towers cut into storeys: a skyline, and a bar chart, which is the
     site in one picture. One storey of the tallest is lit.

     Two drafts failed on sight and are worth recording. Stacked bars in a
     rounded square read as a hamburger menu at 30px; free-floating floor
     slabs read as an audio equaliser. Solid silhouettes with the floors cut
     into them are what make it read as buildings.

     The lit storey is --acc-lit, the one place that colour appears outside
     data. It is not decoration: the mark depicts a selected storey, which is
     exactly the meaning that teal carries everywhere else on the site. */
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--acc)" />
      <rect x="6.5" y="15.5" width="6" height="11" rx="1" fill="var(--on-acc)" opacity="0.72" />
      <rect x="6.5" y="18.50" width="6" height=".9" fill="var(--acc)" />
      <rect x="6.5" y="21.70" width="6" height=".9" fill="var(--acc)" />
      <rect x="13.5" y="7.0" width="7" height="19.5" rx="1" fill="var(--on-acc)" opacity="1" />
      <rect x="13.5" y="10.00" width="7" height=".9" fill="var(--acc)" />
      <rect x="13.5" y="13.20" width="7" height=".9" fill="var(--acc)" />
      <rect x="13.5" y="16.40" width="7" height=".9" fill="var(--acc)" />
      <rect x="13.5" y="19.60" width="7" height=".9" fill="var(--acc)" />
      <rect x="13.5" y="22.80" width="7" height=".9" fill="var(--acc)" />
      <rect x="21.5" y="12.5" width="5" height="14" rx="1" fill="var(--on-acc)" opacity="0.72" />
      <rect x="21.5" y="15.50" width="5" height=".9" fill="var(--acc)" />
      <rect x="21.5" y="18.70" width="5" height=".9" fill="var(--acc)" />
      <rect x="21.5" y="21.90" width="5" height=".9" fill="var(--acc)" />
      <rect x="13.5" y="17.30" width="7" height="2.3" fill="var(--acc-lit)" />
    </svg>
  );
}

export default function Logo({ size = 30 }) {
  return (
    <span className="logo">
      <Mark size={size} />
      <span className="logo-word">True<b>storey</b></span>
    </span>
  );
}
