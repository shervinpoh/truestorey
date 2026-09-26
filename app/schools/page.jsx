import { shareCard } from '../../lib/og.js';
import Masthead from '../../components/Masthead.jsx';
import HowWorked from '../../components/HowWorked.jsx';
import SchoolsExplorer from '../../components/SchoolsExplorer.jsx';
import { primarySchools, islandLand } from '../../lib/schools.js';
import { REACH, PHASES } from '../../lib/p1.js';

export const metadata = {
  ...shareCard('/schools'),
  title: 'Primary schools — how far P1 places reached, and the homes nearby | Truestorey',
  description: 'Every primary school in Singapore, coloured by how far its Primary 1 places reached in MOE’s latest registration exercise, phase by phase, in MOE’s own words — with the HDB blocks and private homes within 1 and 2 km.',
  alternates: { canonical: '/schools' },
};

/**
 * The school finder.
 *
 * ── WHAT IT ANSWERS ────────────────────────────────────────────────────────
 * "How hard was it to get into this school, and what is there to live near
 * it?" — from MOE's own vacancies and balloting data (lib/p1.js reads it) and
 * the site's filed transactions. It works from the school here; from a home,
 * every block and project page lists the schools within 1 and 2 km with the
 * same reach beside each.
 *
 * Ships the 179 schools and the island's outline, nothing else. The homes
 * around a school are on that school's page.
 */
export default function Page() {
  const data = primarySchools();
  if (!data) {
    return (
      <main className="shell">
        <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Primary schools"
          sub="MOE's registration data is not loaded on this deployment." />
        <p className="hint"><code>npm run ingest:p1</code></p>
      </main>
    );
  }
  const land = islandLand();
  const box = land.bbox;
  const schools = data.list.map(s => ({
    slug: s.slug, name: s.name, lat: s.lat, lon: s.lon, twoTrack: s.twoTrack, near: s.near,
    phases: Object.fromEntries(Object.entries(s.phases).map(([k, p]) => [k,
      { vacancies: p.vacancies, applicants: p.applicants, ratio: p.ratio, copy: p.copy, reach: p.reach }])),
  }));
  const ballotedWithin1 = data.list.filter(s => s.phases['2C']?.reach?.step === 5).length;

  return (
    <main className="shell wide">
      <Masthead crumbs={[{ href: '/', label: 'Home' }]} title="Primary schools"
        sub={`How far each school's Primary 1 places reached in MOE's ${data.year} exercise, in MOE's own words — and the homes within 1 and 2 km.`} />
      <p className="egline"><b>{ballotedWithin1} of {data.list.length} schools</b> balloted even for citizens
        living within 1 km in Phase 2C of the {data.year} exercise. A past exercise, not a place.</p>

      <section className="pane">
        <SchoolsExplorer schools={schools} year={data.year}
          land={{ box: [box[0], box[1], box[2], box[3]], rings: land.rings }}
          legend={REACH.filter(r => r.step > 0)} />
        <p className="prov" style={{ marginTop: 18 }}>
          {data.source} · {data.year} exercise · <a href={data.url} target="_blank" rel="noopener noreferrer">moe.gov.sg</a> ·
          {' '}read {String(data.accessedAt).slice(0, 10)}<br />
          {data.locations} · accessed {data.locationsAccessed}<br />
          Distances and counts are straight-line from the school&rsquo;s registered point. Homes are those with a filed sale.
        </p>
        <HowWorked title="How to read this, and what it cannot tell you">
          <p><b>The colour is MOE&rsquo;s sentence, not a ratio.</b> For every phase MOE says who was
            balloted — &ldquo;Singapore Citizen children residing between 1km and 2km of the school&rdquo;
            means everyone nearer got a place and everyone further did not. That is what each colour
            reads. The applicants-per-place figure beside it is MOE&rsquo;s two numbers divided.</p>
          <ul>{PHASES.map(p => <li key={p.code}><b>{p.label}:</b> {p.who}.</li>)}</ul>
          <p><b>A past exercise, not a place.</b> Vacancies, applicants and the lines they fall at change
            every year. Nothing here says your child will or will not get a place.</p>
          <p><b>The distance is not MOE&rsquo;s.</b> MOE measures from the school&rsquo;s land boundary to the
            address on the registration; this site measures straight-line from the school&rsquo;s registered
            point, so a home near 1 km can fall either side for MOE. Check an actual address with{' '}
            <a href="https://www.onemap.gov.sg/#/SchoolQueryInfo" target="_blank" rel="noopener noreferrer">OneMap&rsquo;s SchoolQuery</a>.</p>
          <p><b>One year so far.</b> MOE publishes only its most recent exercise. This site keeps each year
            as MOE publishes it, so the history grows from {data.years[0]}; earlier years are not filled in
            from anywhere else.</p>
        </HowWorked>
      </section>
    </main>
  );
}
