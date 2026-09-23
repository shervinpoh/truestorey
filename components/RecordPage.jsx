'use client';
import { useEffect, useState } from 'react';
import RecordView from './RecordView.jsx';
import Proceeds from './Proceeds.jsx';
import Gate from './Gate.jsx';
import WatchBlock from './WatchBlock.jsx';
import Locator from './Locator.jsx';
import Search from './Search.jsx';
import Masthead from './Masthead.jsx';
import Amenities from './Amenities.jsx';
import LandTrail from './LandTrail.jsx';
import Storey from './Storey.jsx';
import SectionNav from './SectionNav.jsx';
import NearbySales from './NearbySales.jsx';
import SunPath from './SunPath.jsx';
import BlockMop from './BlockMop.jsx';
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
 * The owner's side stops at the evidence. It ends on the proceeds waterfall
 * and one relevant context link — this block's MOP where that evidence exists,
 * otherwise the SSD guide — and does not route into the enquiry form: a form
 * at the end of a funnel that begins "I own this property" is a lead-capture
 * flow wearing a calculator's clothes, and this site's whole argument is that
 * the figures are free. The form stays where it already was, at the bottom,
 * reached by someone who has read the page rather than by someone who followed
 * a path into it. It now has its own pane so it cannot read as the last step of
 * the waterfall.
 *
 * The proceeds waterfall re-anchors when the flat-type filter moves, so the
 * slider is never centred on a median that is no longer on screen.
 */
export default function RecordPage({ rec, attribution, crumbs, posts = [], near = null, nearManifest = null, storey = null, canWatch = false, canCapture = false, locator = null, land = null, sales = null, sun = null, sunApprovals = null, mop = null }) {
  const [median, setMedian] = useState(rec.medianPrice);

  useEffect(() => { track(EVENTS.RECORD, { href: rec.href, kind: rec.kind }); }, [rec.href]);

  const hdb = rec.kind === 'HDB';
  const price = Math.round(median || rec.medianPrice);
  const planHref = `/plan?price=${price}&type=${hdb ? 'HDB' : 'PRIVATE'}&from=${encodeURIComponent(rec.href)}`;
  // Only offer an anchor to a section that is actually on the page. A fork link
  // that scrolls nowhere is worse than one fewer option.
  const hasFloor = Boolean(storey);
  const hasNear = Boolean(near);
  const hasSales = Boolean(sales);
  const hasSun = Boolean(sun);
  /* The bar is a set of landmarks, not a second rendering of the whole page.
     Eleven chips made the navigation itself something a reader had to explore,
     and the final ones were hidden behind a horizontal edge on ordinary
     desktop widths. The deeper modules still name themselves in the page. */
  const sectionIds = [
    'overview',
    rec.recent?.length > 0 && 'transactions',
    hdb && mop && 'mop',
    hasFloor && 'floor',
    hasNear ? 'nearby' : (locator && 'place'),
    'proceeds',
  ].filter(Boolean);

  return (
    <main className="shell">
      {/* A landed street names the estates on it. Houses are addressed by
          street because that is what a buyer searches and what URA files, but
          "Cashew Crescent" alone loses the fact that its eighteen sales are
          Cashew Villas — a name the reader may well have been given by an
          agent, and the name this site used to file them under. */}
      <Masthead crumbs={crumbs} title={titleCase(rec.label)}
        sub={[
          hdb
            ? `${rec.n} filed resale transactions · ${titleCase(rec.town)} · ${rec.remainingLease} of lease left`
            : `${rec.n} filed transactions · District ${rec.district} · ${rec.segment}`,
          rec.estates?.length
            ? `${rec.estates.length === 1 ? 'Houses here are in' : 'Estates on this street:'} ${rec.estates.map(titleCase).join(', ')}`
            : null,
        ].filter(Boolean).join(' · ')} />

      <SectionNav ids={sectionIds} />

      {/* A reader arrives here from "22 Cashew Crescent" — search sets the
          house number aside, and OneMap resolves a full address to its road.
          The page must not let that read as a page about house 22. */}
      {rec.landed && (
        <p className="note">
          <b>Filed by street, not by house.</b> URA publishes a landed sale&rsquo;s street and never
          its house number, so every sale on {titleCase(rec.street)} is counted together here. This
          page cannot say which house sold, or what any one house fetched.
        </p>
      )}

      {/* The one section on this page that changes ground. See .bleed. */}
      <section className="pane bleed" id="overview">
        <RecordView rec={rec} attribution={attribution}
          onType={(t, rv) => setMedian(rv.medianPrice)}
          afterSummary={
            <Fork planHref={planHref} href={rec.href}
              hdb={hdb} hasMop={Boolean(mop)} />
          } />
      </section>

      {hdb && mop && <BlockMop data={mop} rec={rec} />}

      {/* ── THE MAP GETS ITS OWN SECTION ──────────────────────────────────
          It was a slot inside RecordView's afterSummary, wedged between a
          summary and the fork, and it read as a diagram illustrating the text
          rather than as the thing it is: this block's place in its town's
          price landscape, which is the question a reader on this page has
          after "what did it go for".

          Its own section, in the nav, at full width. */}
      {locator && (
        <section className="pane" id="place">
          <Locator {...locator} label={titleCase(rec.label)} town={titleCase(rec.town)} />
        </section>
      )}

      {(hasFloor || hasNear || hasSales || hasSun || land) && (
        <header className="record-chapter">
          <p className="lab">Deeper checks</p>
          <h2>What changes from one home to the next.</h2>
          <p>Floor, surroundings, nearby sales, afternoon sun and the history of the land—shown
            only where the public record carries enough to say something.</p>
        </header>
      )}

      {hasFloor && <div id="floor"><Storey data={storey} label={titleCase(rec.label)} /></div>}

      {hasNear
        ? <div id="nearby"><Amenities near={near} manifest={nearManifest} /></div>
        : <Amenities near={near} manifest={nearManifest} />}

      {/* Where the ground came from, after what is on it and around it.
          Only ever present for a development HDB tendered the land for and
          then named — see lib/land.js. Everything else renders nothing. */}
      {/* After the amenities panel, which answers "what is around here",
          and before the land trail. Same question, different noun: what has
          CHANGED HANDS around here. */}
      {hasSales && <NearbySales data={sales} label={rec.label} />}

      {/* After what has sold nearby: same neighbourhood, different question —
          not what it costs but what it will be like to sit in at six o'clock. */}
      {hasSun && <SunPath sun={sun} approvals={sunApprovals} label={titleCase(rec.label)} />}

      {land && <LandTrail land={land} label={titleCase(rec.label)} rec={rec} />}

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

      {/*
          Gated for the reason written ten lines above about WatchBlock, which
          this form did not follow. It rendered on every record page whether or
          not a CRM existed to write to, took a reader's name and address, and
          answered with a 503 telling them to WhatsApp instead. The address had
          already been collected by then — the same objection that deleted the
          mobile field. The Property CRM transport variables were never set
          in production, so that is what every reader who used it got. */}
      {canCapture && (
        <section className="pane">
          <Gate context={rec} />
        </section>
      )}

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
function Fork({ planHref, href, hdb, hasMop }) {
  return (
    <div className="forkwrap">
      <h2 className="sh"><span>What are you here to work out?</span></h2>
      <div className="fork">
        <div className="forkcol">
          <span className="lab">I&rsquo;m thinking of buying it</span>
          <ul>
            <li><a href={`/blindspot?from=${encodeURIComponent(href)}`}>
              <b>Run Blindspot on the asking price</b>
              <span>Six checks against the filed record. You add the unit type, actual price and floor area.</span></a></li>
            <li><a href={planHref}>
              <b>See what the purchase needs upfront</b>
              <span>The filed median starts as an example. Replace it with the asking price.</span></a></li>
          </ul>
        </div>
        <div className="forkcol">
          <span className="lab">I own it</span>
          <ul>
            <li><a href="#proceeds">
              <b>What a sale would actually net</b>
              <span>Every deduction in order, with CPF taken back before you see a cent</span></a></li>
            {hdb && hasMop ? <li><a href="#mop">
              <b>See this block&rsquo;s MOP context</b>
              <span>Its earliest possible fifth year and the filings held after the previous wave.</span></a></li>
              : <li><a href="/guides/absd-tdsr-ssd">
                <b>Check what selling early costs</b>
                <span>Seller&rsquo;s Stamp Duty by year held, and the rules behind it.</span></a></li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
