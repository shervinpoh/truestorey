'use client';
import { useEffect, useState } from 'react';
import RecordView from './RecordView.jsx';
import Proceeds from './Proceeds.jsx';
import Gate from './Gate.jsx';
import WatchBlock from './WatchBlock.jsx';
import Search from './Search.jsx';
import Masthead from './Masthead.jsx';
import Amenities from './Amenities.jsx';
import Storey from './Storey.jsx';
import SectionNav from './SectionNav.jsx';
import { titleCase } from '../lib/name.js';
import { track } from './Track.jsx';
import { EVENTS } from '../lib/analytics.js';

/**
 * A record at its own URL: the numbers, then the fork, then everything the
 * fork points at.
 *
 * WHY THE FORK. Everything a reader could do with this block already existed
 * on this page and all of it was below the fold, in an order nobody could
 * guess: the sale-proceeds waterfall was two sections down, and the prefilled
 * planner link was two sections below THAT, under a heading about cost. So the
 * page answered "what did this block sell for" and then left the reader to
 * work out for themselves that it also answers "what would I need on the day"
 * and "what would I walk away with".
 *
 * Those are the only two reasons anyone is on this page, and which one you are
 * is the single fact the page cannot derive. So it asks, immediately under the
 * figures, and each side links down to the section that answers it. Nothing
 * new is computed — this is signposting for work the page was already doing.
 *
 * It goes in through RecordView's `afterSummary` slot rather than as the next
 * section, because RecordView is one long run — figures, chart, every filed
 * transaction, the range note — and appending the fork after all of that put
 * it nine hundred pixels down, which is the burial it exists to fix.
 *
 * The owner's side stops at the numbers. It ends on the proceeds waterfall and
 * the SSD guide and does not route into the enquiry form: a form at the end of
 * a funnel that begins "I own this property" is a lead-capture flow wearing a
 * calculator's clothes, and this site's whole argument is that the figures are
 * free. The form stays where it already was, at the bottom, reached by someone
 * who has read the page rather than by someone who followed a path into it.
 * It now has its own pane so it cannot read as the last step of the waterfall.
 *
 * The proceeds waterfall re-anchors when the flat-type filter moves, so the
 * slider is never centred on a median that is no longer on screen.
 */
export default function RecordPage({ rec, attribution, crumbs, posts = [], near = null, nearManifest = null, storey = null, canWatch = false }) {
  const [median, setMedian] = useState(rec.medianPrice);

  useEffect(() => { track(EVENTS.RECORD, { href: rec.href, kind: rec.kind }); }, [rec.href]);

  const hdb = rec.kind === 'HDB';
  const price = Math.round(median || rec.medianPrice);
  const planHref = `/plan?price=${price}&type=${hdb ? 'HDB' : 'PRIVATE'}&from=${encodeURIComponent(rec.href)}`;
  // Only offer an anchor to a section that is actually on the page. A fork link
  // that scrolls nowhere is worse than one fewer option.
  const hasFloor = Boolean(storey);
  const hasNear = Boolean(near);

  return (
    <main className="shell">
      <Masthead crumbs={crumbs} title={titleCase(rec.label)}
        sub={hdb
          ? `${rec.n} filed resale transactions · ${titleCase(rec.town)} · ${rec.remainingLease} of lease left`
          : `${rec.n} filed transactions · District ${rec.district} · ${rec.segment}`} />

      <SectionNav />

      <section className="pane" id="overview">
        <RecordView rec={rec} attribution={attribution}
          onType={(t, rv) => setMedian(rv.medianPrice)}
          afterSummary={<Fork price={price} planHref={planHref} href={rec.href}
            hdb={hdb} hasFloor={hasFloor} hasNear={hasNear} />} />
      </section>

      {hasFloor && <div id="floor"><Storey data={storey} label={titleCase(rec.label)} /></div>}

      {hasNear
        ? <div id="nearby"><Amenities near={near} manifest={nearManifest} /></div>
        : <Amenities near={near} manifest={nearManifest} />}

      {/* HDB only: the digest is built on HDB's monthly resale register, and
          there is no equivalent per-project feed for private transactions.
          Offering it on a condo page would promise a thing that cannot be
          delivered — see scripts/send-digest.mjs. */}
      {/*
          `canWatch` is resolved on the server from whether a sending key
          actually exists. Follow.jsx set the precedent and the reasoning is
          its: "an empty promise is worse than no promise". A form that takes
          an address and then says email is not switched on has already
          collected the address — which is the same objection that removed the
          mobile field from the lead form. */}
      {hdb && canWatch && (
        <section className="pane">
          <WatchBlock href={rec.href} label={titleCase(rec.label)} />
        </section>
      )}

      <section className="pane" id="proceeds">
        <Proceeds median={median} onEngage={() => track(EVENTS.PROCEEDS, { href: rec.href })} />
      </section>

      <section className="pane">
        <Gate context={rec} />
      </section>

      {posts.length > 0 && (
        <section className="pane">
          <h2 style={{ fontSize: '1.05rem' }}>Reading on this area</h2>
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
        <h2 style={{ fontSize: '1.05rem' }}>Look up somewhere else</h2>
        <p className="hint">Any HDB block or private project in Singapore.</p>
        <Search />
      </section>
    </main>
  );
}

/** The two questions, and where on this page each one is answered. */
function Fork({ price, planHref, href, hdb, hasFloor, hasNear }) {
  return (
    <div className="forkwrap">
      <div className="sh"><span>Which of these are you</span></div>
      <div className="fork">
        <div className="forkcol">
          <span className="lab">I&rsquo;m considering buying this</span>
          <ul>
            <li><a href={planHref}>
              <b>What it costs on the day, at ${price.toLocaleString('en-SG')}</b>
              <span>Loan, downpayment, the cash CPF cannot cover, and both stamp duties</span></a></li>
            {hasFloor && <li><a href="#floor">
              <b>What a higher floor is worth here</b>
              <span>Measured within this building, not across the country</span></a></li>}
            {hasNear && <li><a href="#nearby">
              <b>What is within reach of it</b>
              <span>Schools, stations and shops, at straight-line distance</span></a></li>}
            <li><a href={`/compare?a=${encodeURIComponent(href)}`}>
              <b>Put it beside another block</b>
              <span>Two or three side by side, in a link you can send to whoever else is deciding</span></a></li>
          </ul>
        </div>
        <div className="forkcol">
          <span className="lab">I own this</span>
          <ul>
            <li><a href="#proceeds">
              <b>What a sale would actually net</b>
              <span>Every deduction in order, with CPF taken back before you see a cent</span></a></li>
            <li><a href="/guides/absd-tdsr-ssd">
              <b>What selling early costs</b>
              <span>Seller&rsquo;s Stamp Duty by year held, and the rules behind it</span></a></li>
            {hdb && <li><a href="/mop">
              <b>Which flats can start selling, and when</b>
              <span>Blocks reaching their fifth year, by town and year</span></a></li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
