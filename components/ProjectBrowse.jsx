'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/**
 * Two-level browse for private property.
 *
 * There are 2,980 condo projects and 786 landed streets. Rendering all of
 * them as one column — which is what this page did — is not a list anyone
 * reads, it is a wall they leave. Grouping by district did not help: it just
 * made one long scroll into twenty-eight long scrolls.
 *
 * So: districts first, as a grid shaded by median psf. Twenty-eight tiles fit
 * on one screen and the shading carries information a column cannot. Pick one
 * and you are looking at a few dozen projects, not three thousand.
 *
 * Typing skips both levels and searches everything at once, because someone
 * who knows the project name should never have to know its district.
 *
 * ITEMS ARE TUPLES, NOT OBJECTS, and that is worth the loss of readability.
 * This is a client component, so every project it can search has to reach the
 * browser — all 2,980 of them, serialised into the HTML. As objects that was
 * 492KB of markup on /condo, more than twice the homepage, and about half of
 * it was the same seven key names repeated three thousand times. The href went
 * too: it is `base + slug` on every row, which is twenty bytes of nothing.
 *
 * The alternative was searching over the network, which would mean the second
 * level of this browse could not work offline or before hydration, and would
 * put a request between typing and seeing a project name. This is the cheaper
 * trade.
 */
const P = { SLUG: 0, LABEL: 1, DISTRICT: 2, SEGMENT: 3, N: 4, PSF: 5 };

export default function ProjectBrowse({ items = [], base, noun = 'projects', unit = 'psf' }) {
  const [district, setDistrict] = useState(null);
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();

  /* ── the district lives in the URL ────────────────────────────────────────
     It was React state and nothing else, so there was no address that opened
     District 2. /plan's "where a median home is inside your budget" tiles
     therefore linked every district to /condo — the reader clicked District 2,
     landed on all twenty-eight, and had to find it again. A district view was
     also unshareable, which is its own answer to whether the state belonged
     in the URL.

     Read on mount and written with replaceState rather than through the
     router: /condo and /landed are static pages, and useSearchParams would
     drag them into dynamic rendering for a value only the browser needs.
     replaceState, not pushState — picking a district is a filter, not a
     destination, and back should leave the page rather than walk the reader
     through every district they tried. */
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get('d');
    if (d && items.some(p => p[P.DISTRICT] === d)) setDistrict(d);
  }, [items]);

  const chooseDistrict = d => {
    setDistrict(d);
    try {
      const url = new URL(window.location.href);
      if (d) url.searchParams.set('d', d); else url.searchParams.delete('d');
      window.history.replaceState(null, '', url);
    } catch { /* a URL this browser will not parse is not worth a broken filter */ }
  };

  const districts = useMemo(() => {
    const m = new Map();
    for (const p of items) {
      const d = p[P.DISTRICT];
      if (!m.has(d)) m.set(d, { d, segment: p[P.SEGMENT], n: 0, psf: [] });
      const e = m.get(d);
      e.n++;
      if (Number.isFinite(p[P.PSF])) e.psf.push(p[P.PSF]);
    }
    return [...m.values()].map(e => {
      const s = e.psf.slice().sort((a, b) => a - b);
      return { ...e, median: s.length ? s[Math.floor(s.length / 2)] : null };
    }).sort((a, b) => String(a.d).localeCompare(String(b.d)));
  }, [items]);

  const dRange = useMemo(() => {
    const v = districts.map(d => d.median).filter(Number.isFinite);
    return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1];
  }, [districts]);

  const shown = useMemo(() => {
    if (term) return items.filter(p => (p[P.LABEL] + ' ' + p[P.DISTRICT]).toLowerCase().includes(term));
    if (district) return items.filter(p => p[P.DISTRICT] === district);
    return [];
  }, [items, term, district]);

  const pRange = useMemo(() => {
    const v = shown.map(p => p[P.PSF]).filter(Number.isFinite);
    return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1];
  }, [shown]);

  const heat = (v, [lo, hi]) => !Number.isFinite(v) ? 0.04 : 0.05 + (hi > lo ? (v - lo) / (hi - lo) : 0) * 0.30;

  return (
    <>
      <div className="filt">
        <input type="search" value={q} placeholder={`Search all ${items.length.toLocaleString('en-SG')} ${noun}…`}
          aria-label={`Search ${noun}`} autoComplete="off" spellCheck="false"
          onChange={e => { setQ(e.target.value); if (e.target.value.trim()) chooseDistrict(null); }} />
      </div>

      {term ? (
        <>
          <span className="filtn" aria-live="polite">{shown.length.toLocaleString('en-SG')} matching</span>
          {shown.length === 0
            ? <p className="hint" style={{ marginTop: 16 }}>Nothing matching &ldquo;{q.trim()}&rdquo;.</p>
            : <Tiles list={shown.slice(0, 400)} base={base} range={pRange} heat={heat} unit={unit} showDistrict />}
          {shown.length > 400 && (
            <p className="hint" style={{ marginTop: 12 }}>
              Showing the first 400 of {shown.length.toLocaleString('en-SG')}. Narrow the search to see the rest.
            </p>
          )}
        </>
      ) : district ? (
        <>
          <div className="crumbs" style={{ margin: '14px 0 0' }}>
            <button className="linkish" onClick={() => chooseDistrict(null)}>← All districts</button>
            <span aria-hidden="true"> / </span>District {district}
          </div>
          <span className="filtn">{shown.length.toLocaleString('en-SG')} {noun} in District {district}</span>
          <Tiles list={shown} base={base} range={pRange} heat={heat} unit={unit} />
        </>
      ) : (
        <>
          <span className="filtn">{districts.length} districts · shaded by median {unit}</span>
          <div className="tiles">
            {districts.map(d => (
              <button key={d.d} className="tile" style={{ '--heat': heat(d.median, dRange), textAlign: 'left',
                border: 0, font: 'inherit', cursor: 'pointer' }} onClick={() => chooseDistrict(d.d)}>
                <span className="n">District {d.d}</span>
                <span className="v mono">{d.median ? `$${d.median.toLocaleString('en-SG')} ${unit}` : '—'}</span>
                <span className="b mono">{d.n.toLocaleString('en-SG')} {noun} · {d.segment}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Tiles({ list, base, range, heat, unit, showDistrict = false }) {
  return (
    <div className="tiles">
      {list.map(p => (
        <Link key={p[P.SLUG]} href={base + p[P.SLUG]} className="tile"
          style={{ '--heat': heat(p[P.PSF], range) }}>
          <span className="n">{p[P.LABEL]}</span>
          <span className="v mono">${p[P.PSF]} {unit}</span>
          <span className="b mono">{p[P.N]} sale{p[P.N] > 1 ? 's' : ''}{showDistrict ? ` · D${p[P.DISTRICT]}` : ''}</span>
        </Link>
      ))}
    </div>
  );
}
