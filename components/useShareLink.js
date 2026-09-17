'use client';
import { useEffect, useRef, useState } from 'react';
import { decodeShare, encodeShare } from '../lib/share.js';

/**
 * One calculator's result, readable from and written to the URL fragment.
 *
 * ONE HOOK, NOT THREE COPIES. /cost, /plan and /progressive each need the same
 * four things — read a shared link once on mount, keep the address bar in step,
 * never touch an anchor that is not ours, and build the link at the click —
 * and this repo already records what two copies of one piece of logic cost
 * (Proceeds.jsx flooring a loss at zero while lib/calc/proceeds.js was right).
 * lib/share.js says why it is the fragment and never the query string.
 *
 * `apply` receives only the fields that validated; the page sets them through
 * its own setters, never through input events, so opening a link somebody sent
 * does not count as using the tool.
 *
 * THE START IS WHAT THE PAGE OPENED WITH, NOT A CONSTANT. /plan arrives from a
 * block page with ?price=&type= already set; compared with fixed defaults, that
 * reader would get a fragment in the address bar for a result they never
 * touched. While the state equals the start, the page carries no fragment.
 */
export default function useShareLink(schema, values, apply) {
  const shareHash = encodeShare(schema, values);
  const start = useRef(null);
  if (start.current === null) start.current = shareHash;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const [fromLink, setFromLink] = useState(null);

  useEffect(() => {
    const got = decodeShare(schema, window.location.hash);
    if (!got) return;
    applyRef.current(got.values);
    setFromLink({ dropped: got.dropped });
  }, [schema]);

  useEffect(() => {
    const t = setTimeout(() => {
      const { pathname, search, hash } = window.location;
      const ours = decodeShare(schema, hash) !== null;
      // Only ever touch a fragment this page wrote. #construction-heading
      // style anchors belong to whoever linked here.
      if (shareHash === start.current) {
        if (ours) window.history.replaceState(null, '', pathname + search);
      } else if (hash !== `#${shareHash}` && (ours || !hash)) {
        window.history.replaceState(null, '', `${pathname}${search}#${shareHash}`);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [schema, shareHash]);

  return {
    fromLink,
    // Pathname only. /plan's ?from= names the page THIS reader came from, which
    // is nothing to do with whoever the link is sent to.
    url: () => `${window.location.origin}${window.location.pathname}#${shareHash}`,
  };
}
