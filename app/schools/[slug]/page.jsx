import { notFound } from 'next/navigation';
import Link from 'next/link';
import Masthead from '../../../components/Masthead.jsx';
import Statement from '../../../components/Statement.jsx';
import HowWorked from '../../../components/HowWorked.jsx';
import SchoolHomes from '../../../components/SchoolHomes.jsx';
import { ReachChip } from '../../../components/SchoolsExplorer.jsx';
import { primarySchools, schoolBySlug, homesNear, landAround, HDB_TYPES, SIZE_BANDS } from '../../../lib/schools.js';
import { PHASES } from '../../../lib/p1.js';

export function generateStaticParams() {
  return (primarySchools()?.list || []).map(s => ({ slug: s.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const s = schoolBySlug(slug);
  if (!s) return {};
  const c = s.phases['2C'];
  return {
    title: `${s.name} — P1 balloting ${s.year}, and homes within 1 km | Truestorey`,
    description: `${s.name} in MOE's ${s.year} Primary 1 exercise: ${c?.applicants ?? '—'} applicants for ${c?.vacancies ?? '—'} Phase 2C places. ${c?.copy || 'Every applicant was offered a place.'} With the ${s.near.hdb1 + s.near.private1} homes with filed sales within 1 km.`,
    alternates: { canonical: `/schools/${s.slug}` },
  };
}

/**
 * One school: where its places went in MOE's latest exercise, phase by
 * phase, and the homes within 2 km. The phase ladder is the page's statement;
 * the homes are on a map and in the table it draws from.
 */
export default async function Page({ params }) {
  const { slug } = await params;
  const s = schoolBySlug(slug);
  if (!s) notFound();
  const data = primarySchools();
  const homes = homesNear(s).map(h => ({ ...h }));
  const land = landAround(s.lat, s.lon);
  const c = s.phases['2C'];

  return (
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }, { href: '/schools', label: 'Primary schools' }]} title={s.name}
        sub={`Where its Primary 1 places went in MOE's ${s.year} exercise, and the homes within 2 km.`} />

      <Statement id="p1-phases" title={`Where the ${s.year} places went`}
        basis={`MOE · ${s.year} P1 Registration Exercise`}
        lede={<><b className="mono">{s.available ?? '—'}</b> places were available at the start. Phase 1 —
          a sibling already at the school — is not published in figures: MOE says all eligible applicants
          were offered a place.</>}>
        <div className="tablewrap">
          <table className="stmt-rows p1ladder">
            <thead><tr><th scope="col">Phase</th><th scope="col" className="r">Places</th>
              <th scope="col" className="r">Applicants</th><th scope="col" className="r">Per place</th>
              <th scope="col">What happened</th></tr></thead>
            <tbody>
              {PHASES.filter(p => p.code !== '1').map(ph => {
                const p = s.phases[ph.code];
                if (!p) return null;
                return (
                  <tr key={ph.code}>
                    <td><b>{ph.label}</b><span className="q">{ph.who}</span></td>
                    <td className="r">{p.vacancies ?? '—'}</td>
                    <td className="r">{p.applicants ?? '—'}</td>
                    <td className="r">{p.ratio ? p.ratio.toFixed(2) : '—'}</td>
                    <td><ReachChip reach={p.reach} />
                      {(p.copy || p.remarks) && <span className="q">{p.copy || p.remarks}</span>}
                      {p.ballot && p.vacanciesBalloted > 0 && (
                        <span className="q mono">{p.vacanciesBalloted} places balloted among {p.applicantsBalloted}</span>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="stmt-foot">A past exercise, not a place: the lines move every year.
          {c?.reach?.step >= 3 ? ' In Phase 2C, living nearer than 1 km mattered here.' : ''}</p>
      </Statement>

      {s.twoTrack && (
        <div className="note"><b>From the 2027 exercise, distance stops ordering Phase 2C at this school.</b>{' '}
          MOE splits its 2C places equally between homes within 2 km and beyond, with neither track ahead of
          the other. Phases 2A and 2B are unchanged. Announced 10 September 2026.</div>
      )}

      <section className="pane" id="homes">
        <h2 className="sh"><span>Homes around it</span><span>{s.near.hdb1 + s.near.private1} within 1 km</span></h2>
        <SchoolHomes school={{ name: s.name, lat: s.lat, lon: s.lon }} homes={homes}
          land={{ box: land.box, rings: land.rings }} hdbTypes={HDB_TYPES} sizeBands={SIZE_BANDS} />
        <p className="prov" style={{ marginTop: 18 }}>
          {data.source} · {s.year} exercise · read {String(data.accessedAt).slice(0, 10)}<br />
          HDB Resale Flat Prices (data.gov.sg) · URA private residential transactions · medians and ranges of
          filed sales, not a valuation of any home · private sizes from URA&rsquo;s floor area, which records no bedrooms
        </p>
        <HowWorked title="How the distance is measured, and what to check">
          <p>Straight-line from the school&rsquo;s registered coordinate to each block or project&rsquo;s. MOE
            measures from the school&rsquo;s land boundary to the address on the registration, so a home near
            1 km can fall either side for MOE. For a real address, use{' '}
            <a href="https://www.onemap.gov.sg/#/SchoolQueryInfo" target="_blank" rel="noopener noreferrer">OneMap&rsquo;s SchoolQuery</a>.</p>
          <p>From a home instead: every block and project page lists the primary schools within 1 and 2 km of
            it, with the same reading beside each. <Link href="/schools">All primary schools</Link>.</p>
        </HowWorked>
      </section>
    </main>
  );
}
