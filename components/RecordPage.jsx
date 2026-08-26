'use client';
import { useEffect, useState } from 'react';
import RecordView from './RecordView.jsx';
import Proceeds from './Proceeds.jsx';
import Gate from './Gate.jsx';
import Search from './Search.jsx';
import Masthead from './Masthead.jsx';
import Amenities from './Amenities.jsx';
import Storey from './Storey.jsx';
import { titleCase } from '../lib/name.js';
import { track } from './Track.jsx';
import { EVENTS } from '../lib/analytics.js';

/**
 * A record at its own URL: the numbers, then what you'd net, then the ask.
 * The proceeds waterfall re-anchors when the flat-type filter moves, so the
 * slider is never centred on a median that is no longer on screen.
 */
export default function RecordPage({ rec, attribution, crumbs, posts = [], near = null, nearManifest = null, storey = null }) {
  const [median, setMedian] = useState(rec.medianPrice);

  useEffect(() => { track(EVENTS.RECORD, { href: rec.href, kind: rec.kind }); }, [rec.href]);
  return (
    <main className="shell">
      <Masthead crumbs={crumbs} title={titleCase(rec.label)}
        sub={rec.kind === 'HDB'
          ? `${rec.n} filed resale transactions · ${titleCase(rec.town)} · ${rec.remainingLease} of lease left`
          : `${rec.n} filed transactions · District ${rec.district} · ${rec.segment}`} />

      <section className="pane">
        <RecordView rec={rec} attribution={attribution} onType={(t, rv) => setMedian(rv.medianPrice)} />
      </section>

      {storey && <Storey data={storey} label={titleCase(rec.label)} />}

      <Amenities near={near} manifest={nearManifest} />

      <section className="pane">
        <Proceeds median={median} onEngage={() => track(EVENTS.PROCEEDS, { href: rec.href })} />
        <Gate context={rec} />
      </section>

      {/* The guide is free and complete; what needs a person is this block's
          version of it. So the link out carries the block's own median into the
          planner rather than dropping the reader on a blank form. */}
      <section className="pane">
        <div className="sh"><span>What this would cost you, at this block</span></div>
        <ul className="idx">
          <li>
            <a href={`/plan?price=${Math.round(median || rec.medianPrice)}&type=${rec.kind === 'HDB' ? 'HDB' : 'PRIVATE'}&from=${encodeURIComponent(rec.href)}`}>
              <span className="n">Run the whole purchase at ${(median || rec.medianPrice).toLocaleString('en-SG')}</span>
              <span className="s">Loan, downpayment, the cash CPF cannot cover, and both stamp duties</span>
            </a>
          </li>
          <li>
            <a href="/guides/absd-tdsr-ssd">
              <span className="n">The guide behind those numbers</span>
              <span className="s">Every duty and every financing rule, complete and free</span>
            </a>
          </li>
        </ul>
      </section>

      {posts.length > 0 && (
        <section className="pane">
          <h2 style={{fontSize:'1.05rem'}}>Reading on this area</h2>
          <ul className="idx">
            {posts.map(p => (
              <li key={p.slug}>
                <a href={p.href}>
                  <span className="n">{p.title}</span>
                  <span className="s mono">{p.date} · {p.minutes} min</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pane">
        <h2 style={{fontSize:'1.05rem'}}>Look up somewhere else</h2>
        <p className="hint">Any HDB block or private project in Singapore.</p>
        <Search />
      </section>
    </main>
  );
}
