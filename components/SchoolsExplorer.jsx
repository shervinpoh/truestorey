'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import SchoolMap from './SchoolMap.jsx';

/**
 * /schools: every primary school, coloured by how far its places reached in
 * the phase chosen, with one school's card beside the map and all of them in
 * a list underneath.
 *
 * The colour is a step read from MOE's own sentence (lib/p1.js), never a
 * ratio threshold, and every chip carries its words — colour alone never
 * carries the finding. The ramp is the site's sequential teal, palest for
 * "every citizen got a place", darkest for "even within 1 km went to a ballot".
 */
const PHASE_TABS = [
  { code: '2A', label: '2A', note: 'Alumni, staff and advisory committee families' },
  { code: '2B', label: '2B', note: 'Parent volunteers and connected community groups' },
  { code: '2C', label: '2C', note: 'Everyone else — no connection needed' },
  { code: '2CS', label: '2C Supp.', note: 'Those who did not get a place in 2C' },
];
const STEP_VAR = { 0: 'var(--w4)', 1: 'var(--dot-1)', 2: 'var(--dot-2)', 3: 'var(--dot-3)', 4: 'var(--dot-4)', 5: 'var(--dot-6)' };

export function ReachChip({ reach }) {
  if (!reach) return <span className="reach">—</span>;
  return (
    <span className="reach">
      <i aria-hidden="true" style={{ background: STEP_VAR[reach.step] ?? 'var(--w4)' }} />
      {reach.short}{reach.pr ? ' · PR ballot' : ''}
    </span>
  );
}

export default function SchoolsExplorer({ schools, land, year, legend }) {
  const [phase, setPhase] = useState('2C');
  const [picked, setPicked] = useState(null);
  const [q, setQ] = useState('');
  const [order, setOrder] = useState('contested');

  const dots = useMemo(() => schools.map(s => ({ slug: s.slug, lat: s.lat, lon: s.lon, step: s.phases[phase]?.reach?.step ?? 0 })), [schools, phase]);
  const one = schools.find(s => s.slug === picked) || null;
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = schools.filter(s => !t || s.name.toLowerCase().includes(t));
    return list.sort(order === 'az' ? (a, b) => a.name.localeCompare(b.name)
      : (a, b) => (b.phases[phase]?.reach?.step ?? -1) - (a.phases[phase]?.reach?.step ?? -1)
        || (b.phases[phase]?.ratio ?? 0) - (a.phases[phase]?.ratio ?? 0));
  }, [schools, q, order, phase]);
  const tab = PHASE_TABS.find(t => t.code === phase);

  return (
    <>
      <div className="seg" role="group" aria-label="Registration phase">
        {PHASE_TABS.map(t => (
          <button key={t.code} aria-pressed={phase === t.code} onClick={() => setPhase(t.code)}>Phase {t.label}</button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>{tab.note}. {year} exercise.</p>

      <div className="schoolsplit">
        <SchoolMap box={land.box} rings={land.rings} schools={dots} selected={picked} onSelect={setPicked}
          label={`Primary schools coloured by how far Phase ${tab.label} places reached in ${year}`} />
        <aside className="schoolcard" aria-live="polite">
          {one ? (() => {
            const p = one.phases[phase];
            return (<>
              <span className="lab">Phase {tab.label} · {year}</span>
              <h2>{one.name}</h2>
              <ReachChip reach={p?.reach} />
              {p?.copy && <p className="schoolcopy">&ldquo;{p.copy}&rdquo; <span className="mono">MOE</span></p>}
              <dl className="schoolfigs">
                <div><dt>Places</dt><dd className="mono">{p?.vacancies ?? '—'}</dd></div>
                <div><dt>Applicants</dt><dd className="mono">{p?.applicants ?? '—'}</dd></div>
                <div><dt>Per place</dt><dd className="mono">{p?.ratio ? `${p.ratio.toFixed(2)}` : '—'}</dd></div>
              </dl>
              <p className="hint" style={{ margin: '10px 0 0' }}>
                Within 1 km, straight-line: <b className="mono">{one.near.hdb1}</b> HDB blocks ·{' '}
                <b className="mono">{one.near.private1}</b> private homes with filed sales.
              </p>
              {one.twoTrack && phase === '2C' && (
                <p className="note" style={{ marginTop: 10 }}><b>Distance stops ordering Phase 2C here from the 2027 exercise.</b></p>
              )}
              <p style={{ margin: '16px 0 0' }}><Link className="cta" href={`/schools/${one.slug}`}>Every phase, and the homes nearby</Link></p>
            </>);
          })() : (
            <p className="hint" style={{ margin: 0 }}>Pick a school on the map or in the list below.</p>
          )}
        </aside>
      </div>

      <ul className="reachkey" aria-label="What the colours mean">
        {legend.map(r => <li key={r.key}><ReachChip reach={r} /></li>)}
      </ul>

      <div className="schoolsfilter">
        <label className="fld"><span className="lab">Find a school</span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name of the school" /></label>
        <label className="fld"><span className="lab">Order</span>
          <select value={order} onChange={e => setOrder(e.target.value)}>
            <option value="contested">Most contested first</option>
            <option value="az">A to Z</option>
          </select></label>
      </div>
      <div className="tablewrap">
        <table className="schooltable">
          <thead><tr><th scope="col">School</th><th scope="col">Phase {tab.label}, {year}</th>
            <th scope="col" className="r">Applicants per place</th><th scope="col" className="r">Homes within 1 km</th></tr></thead>
          <tbody>
            {rows.map(s => {
              const p = s.phases[phase];
              return (
                <tr key={s.slug} className={s.slug === picked ? 'on' : undefined}>
                  <td><Link href={`/schools/${s.slug}`}>{s.name}</Link>
                    <button type="button" className="linkish" onClick={() => setPicked(s.slug)}
                      aria-label={`Show ${s.name} on the map`}>map</button></td>
                  <td><ReachChip reach={p?.reach} /></td>
                  <td className="r mono">{p?.ratio ? p.ratio.toFixed(2) : '—'}</td>
                  <td className="r mono">{s.near.hdb1 + s.near.private1}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
