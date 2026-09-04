import Link from 'next/link';
import { notFound } from 'next/navigation';
import Masthead from '../../../components/Masthead.jsx';
import LandTrail from '../../../components/LandTrail.jsx';
import SinceThen from '../../../components/SinceThen.jsx';
import { landSite, landSiteSlugs, recordByHref } from '../../../lib/data/query.js';
import { sizeTrend } from '../../../lib/blindspot/measure.js';
import { titleCase } from '../../../lib/name.js';

export const dynamicParams = false;

export function generateStaticParams() {
  return landSiteSlugs().map(site => ({ site }));
}

export async function generateMetadata({ params }) {
  const { site } = await params;
  const l = landSite(site);
  if (!l?.site?.record) return { title: 'Not found — Truestorey' };
  const s = l.site;
  return {
    title: `${titleCase(s.record.label)} — the land it was built on | Truestorey`,
    description: `${s.site} was tendered in ${String(s.award).slice(0, 4)} and won for `
      + `S$${Math.round(s.price).toLocaleString('en-SG')}. What was bid, who lost, and what has been `
      + `filed at ${titleCase(s.record.label)} since. No margin is estimated.`,
    alternates: { canonical: `/land/${site}` },
  };
}

/**
 * One parcel of ground, from the tender to what stands on it.
 *
 * ── THE HALF NOBODY ELSE HOLDS ─────────────────────────────────────────────
 * A record page already looks BACKWARDS: here is a building, here is the
 * tender that created it. This is the same join read forwards, and it is the
 * thing neither comparable property site can copy — one carries no land-sales
 * data at all, and the other's own methodology lists it under what they do not
 * have. 192 parcels resolve to a record here.
 *
 * ── AND THE SUBTRACTION IT STILL WILL NOT DO ───────────────────────────────
 * Both ends of this page are money: what the ground cost in one year, what a
 * unit sells for in another. The obvious thing is to subtract them and call
 * the difference a margin. It is refused here for the same reason it is
 * refused on /land — between those two numbers sit construction over a
 * multi-year build, financing, the development charge, marketing, GST and the
 * cost of holding unsold stock, and not one of those is published for a named
 * project. A figure built from one fact and six guesses is not a margin.
 *
 * What the page does instead is put the two ends beside each other, name what
 * sits between them, and let the reader hold both.
 */
export default async function Page({ params }) {
  const { site } = await params;
  const land = landSite(site);
  if (!land?.site?.record) notFound();

  const s = land.site;
  const rec = recordByHref(s.record.href);
  const label = titleCase(s.record.label);
  // The median unit at that project, so the trend is about a real size rather
  // than about whatever mix happened to sell.
  const areaSqm = rec?.medianPrice && rec?.medianPsf
    ? (rec.medianPrice / rec.medianPsf) / 10.7639 : null;
    // orAllSizes, because a young project has too few years in any one size band
  // and the arc's second half is the point of the page. SinceThen says which
  // it got.
  const trend = areaSqm ? sizeTrend(rec, areaSqm, { orAllSizes: true }) : null;

  return (
    <main className="shell">
      <Masthead
        crumbs={[{ href: '/', label: 'Home' }, { href: '/land', label: 'What the land cost' }]}
        title={label}
        sub={`The ground under it was tendered in ${String(s.award).slice(0, 4)}. Both ends of that are public; nobody puts them together.`} />

      <LandTrail land={land} label={label} rec={rec} />

      <SinceThen site={s} rec={rec} trend={trend} label={label} />

      <section className="pane">
        <div className="sh"><span>The rest of it</span></div>
        <ul className="idx">
          <li><Link href={s.record.href}><span className="n">Every filed transaction at {label}</span>
            <span className="s">The full record — price history, floor premium, what a sale would net</span></Link></li>
          <li><Link href="/land"><span className="n">Every land sale since 1993</span>
            <span className="s">441 URA sites and 216 from HDB, with every losing bid that was published</span></Link></li>
          <li><Link href="/refused"><span className="n">Why there is no margin on this page</span>
            <span className="s">What sits between the two ends, and why none of it is published</span></Link></li>
        </ul>
      </section>
    </main>
  );
}
