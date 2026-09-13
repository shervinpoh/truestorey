'use client';
import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { f, num } from './fmt.js';
import { titleCase } from '../lib/name.js';

/**
 * 1,441 projects with a gross yield, filterable, free.
 *
 * The competitor charges PRO for this. It is a join, not a model — filed rents
 * over filed prices — and the only judgement in it is refusing to compare a
 * three-bedroom's rent with a one-bedroom's price.
 *
 * The size cohorts are the honest unit and they open on demand: a project's
 * headline is the median ACROSS its cohorts, so a block of fifty studios does
 * not decide the whole building's number, and anyone who wants to see why can
 * open the rows underneath.
 */
const pc = v => `${v.toFixed(2)}%`;

export default function YieldView({ projects, districts, min }) {
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const [open, setOpen] = useState(null);
  /* ── COHORTS ARRIVE WHEN ONE IS OPENED ──────────────────────────────────
     They used to be in the page. All of them, for all 1,441 projects, so a
     collapsed row could print the word "3 sizes" — 884KB against 27–70 for
     every other page on the site, and the third instance of the failure
     CLAUDE.md already records against /mop and /market.

     Cached by href, so opening the same project twice costs one request.
     A failure closes the row and says so rather than leaving a spinner: a
     cohort table that cannot load is one disclosure off, not a broken page. */
  const [cohorts, setCohorts] = useState({});   // href → rows | 'loading' | 'failed'

  async function toggle(href) {
    if (open === href) { setOpen(null); return; }
    setOpen(href);
    if (cohorts[href] && cohorts[href] !== 'failed') return;
    setCohorts(c => ({ ...c, [href]: 'loading' }));
    try {
      const res = await fetch(`/api/yield?href=${encodeURIComponent(href)}`);
      const j = await res.json();
      if (!res.ok || !Array.isArray(j.cohorts)) throw new Error(j.error || 'no cohorts');
      setCohorts(c => ({ ...c, [href]: j.cohorts }));
    } catch {
      setCohorts(c => ({ ...c, [href]: 'failed' }));
    }
  }

  const term = q.trim().toLowerCase();
  const shown = useMemo(() => {
    let list = projects;
    if (district) list = list.filter(p => p.district === district);
    if (term) list = list.filter(p => (p.label + ' D' + p.district).toLowerCase().includes(term));
    return list.slice().sort((a, b) => b.grossYield - a.grossYield);
  }, [projects, district, term]);

  const top = shown.length ? shown[0].grossYield : 1;

  return (
    <>
      <div className="mapctl">
        <label className="mapjump" style={{ flex: '2 1 300px' }}>
          <span className="filtn">Find a project</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Project name…" />
        </label>
        <label className="mapjump">
          <span className="filtn">District</span>
          <select value={district} onChange={e => setDistrict(e.target.value)}>
            <option value="">Every district</option>
            {districts.map(([d, v]) => (
              <option key={d} value={d}>D{d} — {pc(v.grossYield)} across {v.projects}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="filtn" style={{ margin: '14px 0 0' }}>
        {num(shown.length)} project{shown.length === 1 ? '' : 's'} · highest yield first
      </p>

      {shown.length === 0 ? (
        <p className="hint" style={{ marginTop: 14 }}>
          Nothing matches. A project only appears here if it has {min.rents} or more filed rents and{' '}
          {min.sales} or more filed sales <em>of the same size</em>.
        </p>
      ) : (
        <table className="bandtable" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th scope="col">Project</th><th scope="col">Gross yield</th><th scope="col">Sizes</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 200).map(p => (
              <Fragment key={p.href}>
                <tr>
                  <th scope="row" style={{ whiteSpace: 'normal' }}>
                    <Link href={p.href}>{titleCase(p.label)}</Link>{' '}
                    <span className="mono" style={{ color: 'var(--mute)', fontSize: 11 }}>D{p.district}</span>
                  </th>
                  <td>
                    <span className="barwrap"><span className="bar" style={{ width: `${Math.round((p.grossYield / top) * 100)}%` }} /></span>
                    <span className="mono">{pc(p.grossYield)}</span>
                  </td>
                  <td className="mono">
                    <button className="linkish" onClick={() => toggle(p.href)}
                      aria-expanded={open === p.href}>
                      {p.sizes} size{p.sizes === 1 ? '' : 's'}
                    </button>
                  </td>
                </tr>
                {open === p.href && cohorts[p.href] === 'loading' && (
                  <tr className="cohort"><td colSpan={3} className="mono">Reading the cohorts…</td></tr>
                )}
                {open === p.href && cohorts[p.href] === 'failed' && (
                  <tr className="cohort"><td colSpan={3}>
                    The size cohorts for this project could not be read. The yield above is
                    unaffected — it was computed at build time and is on the page already.
                  </td></tr>
                )}
                {open === p.href && Array.isArray(cohorts[p.href]) && cohorts[p.href].map(c => (
                  <tr key={p.href + c.band} className="cohort">
                    <th scope="row" className="mono">
                      {c.areaFrom}–{c.areaTo} sqm{c.beds ? ` · ${c.beds} bed` : ''}
                    </th>
                    <td className="mono">{pc(c.grossYield)}</td>
                    <td className="mono">
                      {f(c.medianRent)}/mo over {f(c.medianPrice)} · {c.rents} rents, {c.sales} sales
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      {shown.length > 200 && (
        <p className="hint" style={{ marginTop: 10 }}>
          Showing the top 200 of {num(shown.length)}. Narrow by district or search a name.
        </p>
      )}
    </>
  );
}
