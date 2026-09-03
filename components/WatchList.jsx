'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { titleCase } from '../lib/name.js';
import { forget, watching } from '../lib/watching.js';

/**
 * What this browser remembers, and what it cannot know.
 *
 * ── THE TWO THINGS THIS PAGE MUST NOT IMPLY ────────────────────────────────
 * That the list is complete, and that removing something here unsubscribes.
 * Neither is true: the server holds the subscriptions, this holds a note per
 * browser, and the two can disagree in both directions — a watch made on a
 * phone is missing here, and a cleared browser loses the note while the
 * emails carry on. Both are said in words rather than implied by silence,
 * and "Forget" is deliberately not called "Stop".
 *
 * Renders nothing until the browser has been read, so an empty state does not
 * flash for somebody who is watching four blocks.
 */
export default function WatchList({ canWatch = false }) {
  const [list, setList] = useState(null);
  useEffect(() => { setList(watching()); }, []);

  if (list === null) return <p className="hint">Reading this browser…</p>;

  if (!list.length) {
    return (
      <>
        <div className="note">
          <b>Nothing yet in this browser.</b> Open a block and ask for updates — you will get one
          email to confirm, and after that only when something is actually filed there.
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          If you subscribed on another device, or cleared this browser, the subscription is still
          live — it simply is not noted here. Nothing on this page can see the server.
          {!canWatch && ' Updates are not switched on for this deployment at the moment.'}
        </p>
        <ul className="idx" style={{ marginTop: 16 }}>
          <li><Link href="/hdb"><span className="n">Look up a block</span>
            <span className="s">Every town, every block with a filed resale</span></Link></li>
          <li><Link href="/mop"><span className="n">When flats can start selling</span>
            <span className="s">Blocks reaching their fifth year, by town and year</span></Link></li>
        </ul>
      </>
    );
  }

  return (
    <>
      <ul className="idx">
        {list.map(href => (
          <li key={href}>
            <Link href={href}>
              <span className="n">{titleCase(href.split('/').pop().replace(/-/g, ' ').toUpperCase())}</span>
              <span className="s mono">{href}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="note" style={{ marginTop: 16 }}>
        <b>This is a note, not the subscription.</b> The list lives in this browser only, so a
        watch you set up on another device will not appear and clearing this browser will not stop
        any email. To stop updates for a block, use the one-click link in any update — that
        deletes the record rather than flagging it.
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        {list.map(href => (
          <button key={href} type="button" className="linkish" style={{ marginRight: 14 }}
            onClick={() => setList(forget(href))}>
            Forget {href.split('/').pop()}
          </button>
        ))}
      </p>
    </>
  );
}
