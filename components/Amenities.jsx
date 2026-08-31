'use client';
import { fmtDistance, nearBoundary } from '../lib/geo.js';
import { titleCase } from '../lib/name.js';

/**
 * What is around a block or project.
 *
 * Two facts lead, because two facts are what actually move a decision here:
 * the nearest station, and how many primary schools fall inside a 1km
 * priority band. Everything else — hawker, park, preschool, mall — is real
 * but secondary, so it sits in one compact strip below rather than competing
 * for the top of the page.
 *
 * Three things this component must never do:
 *
 *   · turn a straight line into a walking time. We do not know what is
 *     between the two points.
 *   · imply a school place. The 1km band is priority in a ballot, not entry.
 *   · print a figure without its source. Every layer carries its own
 *     attribution and access date, and they render.
 *
 * Renders nothing at all when the record has no usable coordinate. A blank
 * section is the honest state; a guessed one is not.
 */
export default function Amenities({ near, manifest }) {
  if (!near || !manifest) return null;

  const rail = near.rail || [];
  const p1 = near.primary?.within1 || [];
  const p2 = near.primary?.within2 || [];
  const hasAny = rail.length || p1.length || p2.length
    || near.hawker?.length || near.parks?.length || near.malls?.length || near.childcare?.length;
  if (!hasAny) return null;

  const L = manifest.layers || {};
  const station = rail[0];
  const future = s => /announced|construction|planned|future/i.test(s?.status || '');

  return (
    <section className="pane">
      <h2>What&apos;s around</h2>
      <p className="hint">
        Straight-line distance from the {near.at?.match === 'street' ? 'middle of the street' : 'building'} —
        the walk is longer, and how much longer depends on what is in the way.
      </p>

      {/* ---------- the two that matter ---------- */}
      <div className="kpi2">
        <div>
          <span className="lab">Nearest station</span>
          {station ? (
            <>
              <div className="v">{tidyStation(station.name)}</div>
              <span className="amsub mono">
                {[station.line, fmtDistance(station.m)].filter(Boolean).join(' · ')}
                {future(station) ? ' · not open yet' : ''}
              </span>
            </>
          ) : (
            <><div className="v">—</div><span className="amsub mono">none within {fmtRadius(L.rail?.within ?? 2000)}</span></>
          )}
        </div>
        <div>
          <span className="lab">Primary schools within 1km</span>
          <div className="v">{p1.length}</div>
          <span className="amsub mono">
            {p1.length ? `nearest ${fmtDistance(p1[0].m)}` : p2.length ? `nearest ${fmtDistance(p2[0].m)} — outside the band` : 'none within 2km'}
          </span>
        </div>
      </div>

      {/* ---------- the primary school band ---------- */}
      {(p1.length > 0 || p2.length > 0) && (
        <>
          <span className="lab" style={{ display: 'block', margin: '18px 0 6px' }}>Primary schools · straight-line distance</span>
          {p1.length > 0 && (
            <ul className="amlist">
              {p1.map(s => (
                <li key={s.name}>
                  <span className="n">{titleCase(s.name)}</span>
                  <span className="d mono">
                    {fmtDistance(s.m)}
                    {nearBoundary(s.m) && <em className="edge"> on the 1km line</em>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {p2.length > 0 && (
            <details className="amfold">
              <summary>{p2.length} more between 1km and 2km</summary>
              <ul className="amlist">
                {p2.map(s => (
                  <li key={s.name}><span className="n">{titleCase(s.name)}</span><span className="d mono">{fmtDistance(s.m)}</span></li>
                ))}
              </ul>
            </details>
          )}

          <div className="note">
            <b>A band is priority, not a place — and this is an indication, not MOE&apos;s answer.</b>{' '}
            MOE measures home to school in a straight line, which is what is measured here. But it
            measures to the school&apos;s <em>land boundary</em> and this measures to the school&apos;s
            single registered coordinate, so a large campus reads as further away than MOE would find
            it. It also measures from the address on your child&apos;s registration, not from the
            block. A school near the line can fall either side of it once MOE measures it, and an
            oversubscribed school still ballots within a band. For the official category for a
            specific address, use{' '}
            <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap&apos;s
            SchoolQuery</a>.
          </div>
        </>
      )}

      {/* ---------- rail, when there is more than one ---------- */}
      {rail.length > 1 && (
        <>
          <span className="lab" style={{ display: 'block', margin: '18px 0 6px' }}>Stations</span>
          <ul className="amlist">
            {rail.map(s => (
              <li key={s.name + s.m}>
                <span className="n">
                  {tidyStation(s.name)}
                  {future(s) && <em className="edge"> {s.status}{s.opening ? ` · target ${s.opening}` : ''}</em>}
                </span>
                <span className="d mono">{[s.line, fmtDistance(s.m)].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
          {rail.some(future) && (
            <p className="hint" style={{ marginTop: 6 }}>
              A station marked not open yet is one LTA has announced. The year is their target and has moved before.
            </p>
          )}
        </>
      )}

      {/* ---------- everything else, compact ---------- */}
      <Strip near={near} layers={L} />

      {/* ---------- provenance ---------- */}
      <p className="prov" style={{ marginTop: 16 }}>
        {manifest.geo?.attribution}
        {Object.entries(L)
          .filter(([k]) => shown(k, near))
          .map(([k, v]) => <span key={k}><br />{v.attribution} Accessed {v.accessedAt}.</span>)}
      </p>
    </section>
  );
}

function Strip({ near, layers }) {
  const rows = [];
  const one = (key, label) => {
    const hit = near[key]?.[0];
    if (hit) rows.push({ key, label, name: titleCase(hit.name), meta: fmtDistance(hit.m) });
  };
  one('hawker', 'Hawker centre');
  one('parks', 'Park');
  one('malls', 'Mall');
  if (near.childcare?.length) {
    rows.push({
      key: 'childcare', label: 'Preschools',
      name: `${near.childcare.length} within ${fmtRadius(layers.childcare?.within ?? 1000)}`,
      meta: `nearest ${fmtDistance(near.childcare[0].m)}`,
    });
  }
  if (near.schools?.length) {
    const s = near.schools[0];
    rows.push({ key: 'schools', label: 'Other schools', name: titleCase(s.name), meta: fmtDistance(s.m) });
  }
  if (!rows.length) return null;
  return (
    <>
      <span className="lab" style={{ display: 'block', margin: '18px 0 6px' }}>Also nearby</span>
      <ul className="amlist">
        {rows.map(r => (
          <li key={r.key}>
            <span className="n"><em className="amtag">{r.label}</em>{r.name}</span>
            <span className="d mono">{r.meta}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** A search radius is a round number we chose, not something measured. */
const fmtRadius = m => (m % 1000 === 0 ? `${m / 1000}km` : fmtDistance(m));

const shown = (k, near) => k === 'schools' ? Boolean(near.primary || near.schools?.length) : Boolean(near[k]?.length);

/** "BISHAN MRT STATION" reads better as "Bishan". The line code says the rest. */
function tidyStation(name) {
  const s = String(name || '')
    .replace(/\b(MRT|LRT)\b/gi, '')
    .replace(/\bSTATION\b/gi, '')
    .replace(/\bEXIT\s*\w*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return titleCase(s || name);
}
