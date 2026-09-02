import Link from 'next/link';

/**
 * The one place on the homepage where a person says why this exists.
 *
 * ── WHY IT IS HERE AT ALL ──────────────────────────────────────────────────
 * Shervin appeared on the homepage in exactly one place: the byline under the
 * lead article, below the fold. Everything above it was institutional — the
 * figures, the island, the sources. That reads as authoritative and it reads
 * as nobody, and "nobody" is a strange thing for a site published under one
 * named agent's registration number to sound like.
 *
 * ── AND WHY IT IS THIS SHORT ───────────────────────────────────────────────
 * Because the argument this site makes is that claims are worth less than
 * disclosed arithmetic, and a long personal statement on the homepage would
 * contradict it in the act of making it. Four sentences, positioned AFTER the
 * search and the figures, so the person who arrived with an address is never
 * made to read about the author before being helped.
 *
 * ── EVERY CLAUSE IS PROVABLE FROM THE PRODUCT ──────────────────────────────
 * Licensed agent: the registration particulars are on every page already, and
 * CEA PG 02-11 s7.1 requires them. No account, nothing held back: there is no
 * auth in the repo and no gated route. Source and period beside every figure:
 * that is rule 6 and test/guides.test.js enforces the rates half of it.
 *
 * NOTHING BIOGRAPHICAL IS ASSERTED — no years in the trade, no track record,
 * no story. Not because it would be uninteresting but because it is not in
 * this repository, and a model writing a person's history from nothing is how
 * a bio becomes a fabrication. This copy is a DRAFT for Shervin to approve or
 * replace; the structure is the contribution, the sentences are a placeholder
 * with his name on them.
 *
 * A portrait belongs at the left of this block. There is none in the repo —
 * photos-in/photos.json is an empty example — so it renders without one
 * rather than with a grey silhouette standing in for a face.
 */
export default function WhoBuilt() {
  const name = process.env.NEXT_PUBLIC_AGENT_NAME || 'Shervin Poh';
  const first = name.split(' ')[0];
  const cea = process.env.NEXT_PUBLIC_CEA_REG;

  return (
    <section className="whobuilt" aria-label="Who built this">
      <p className="wsay">
        <b>I&rsquo;m {first}, and I&rsquo;m a licensed agent.</b> I built Truestorey because you
        should be able to see the filed numbers — and the assumptions sitting on top of them —
        without making an account or sitting through a pitch. Every figure here names the dataset
        it came from and the period it covers. Nothing is held back for people who sign up,
        because there is nothing to sign up to.
      </p>
      <p className="wwho">
        {name}{cea ? ` · CEA Reg. No. ${cea}` : ''}
        {' · '}<Link href="/about">Why this site exists, and what it refuses to do</Link>
      </p>
    </section>
  );
}
