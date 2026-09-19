/**
 * The listings store — what is for sale, and what it has been doing.
 *
 * ── A LISTING IS NOT A ROW, IT IS AN EVENT STREAM ──────────────────────────
 * Every other dataset in this repo is a record of something that already
 * happened: a filed sale does not change. A listing does. It appears, it sits,
 * its price is cut, it vanishes, sometimes it comes back under another agent.
 * Storing the latest snapshot and overwriting throws away the only information
 * that a weekly feed has and a single export does not:
 *
 *   · DAYS ON MARKET — the strongest thing you can know about a seller's
 *     position, and nothing on a portal tells you truthfully.
 *   · PRICE CUTS — a listing cut twice is a different conversation from one
 *     listed yesterday at the same number.
 *   · WHAT DISAPPEARED — and, carefully, what that does and does not mean.
 *
 * So snapshots are MERGED, never replaced. That is the whole reason to ingest
 * weekly rather than to look at a portal when you feel like it.
 *
 * ── DISAPPEARING IS NOT SELLING ────────────────────────────────────────────
 * A listing absent from the newest snapshot has gone. It may have sold, been
 * withdrawn, expired, been relisted by a co-broke agent, or the export may
 * simply not have covered it this week. Those are five different things and
 * nothing here can tell them apart, so the status is `gone` and never `sold`.
 * A sale is confirmed by a filed transaction months later, which is a
 * different dataset and arrives on its own schedule.
 *
 * ── DAYS ON MARKET IS A FLOOR, NOT A FACT ──────────────────────────────────
 * It is measured from when WE first saw it, which is the first ingest that
 * covered it — not from when it was listed, which most exports do not carry.
 * A listing that existed for six months before the first ingest reads as new.
 * `daysKnown` says exactly that, `listedAt` is used instead when the feed
 * provides one, and `domIsFloor` records which of the two a figure came from.
 */

export const VERSION = '2026-09-listings-v1';

/**
 * What identifies one listing across snapshots.
 *
 * A URL is best — it is unique per listing by construction. Failing that the
 * unit number, which is unique within a block. Failing both, address plus size
 * plus floor, which CAN collide: two identical units on the same floor of the
 * same block would merge into one. That is rare, it is the least-bad of the
 * three, and `keyedBy` travels so a collision is at least diagnosable.
 */
export function fingerprint(L) {
  if (L.url) return { key: `url:${String(L.url).split('?')[0].toLowerCase()}`, keyedBy: 'url' };
  if (L.href && L.unit) return { key: `unit:${L.href}|${String(L.unit).replace(/\s/g, '').toUpperCase()}`, keyedBy: 'unit' };
  if (L.href) return { key: `approx:${L.href}|${Math.round(Number(L.areaSqft) || 0)}|${Number(L.floor) || 0}`, keyedBy: 'address+size+floor' };
  return null;
}

export const emptyStore = () => ({ version: VERSION, updatedAt: null, snapshots: [], listings: {} });

/**
 * Fold one snapshot into the store.
 *
 * @param store    the accumulated store
 * @param rows     listings as at `at`
 * @param at       ISO timestamp of the snapshot
 * @param label    where it came from, for the provenance line
 * @param partial  TRUE when the snapshot is not a full sweep of the market —
 *                 a pasted handful, or an export filtered to one town. Absence
 *                 from a partial snapshot says NOTHING, so nothing is marked
 *                 gone on the strength of one. Getting this wrong would
 *                 retire half the store every time somebody pasted two
 *                 listings, and the mistake would look like a market signal.
 */
export function merge(store, rows, { at = new Date().toISOString(), label = 'import', partial = false } = {}) {
  const s = store && store.listings ? store : emptyStore();
  const seen = new Set();
  let added = 0, updated = 0, cut = 0, raised = 0;

  for (const r of rows) {
    const fp = fingerprint(r);
    if (!fp) continue;
    seen.add(fp.key);
    const price = Number(r.price) || null;
    const prev = s.listings[fp.key];

    if (!prev) {
      s.listings[fp.key] = {
        key: fp.key, keyedBy: fp.keyedBy,
        href: r.href || null, label: r.label || r.addressLine || null,
        url: r.url || null, unit: r.unit || null,
        areaSqft: Number(r.areaSqft) || null, floor: Number(r.floor) || null,
        flatType: r.flatType || null,
        price,
        priceHistory: price ? [{ at, price }] : [],
        /* `listedAt` only when the feed carried one — never inferred. */
        listedAt: r.listedAt || null,
        firstSeen: at, lastSeen: at, seenCount: 1,
        status: 'active', goneSince: null,
      };
      added++;
      continue;
    }

    prev.lastSeen = at;
    prev.seenCount++;
    if (prev.status === 'gone') { prev.status = 'active'; prev.goneSince = null; }
    /* Fill anything the earlier snapshot lacked, never overwrite with a blank. */
    for (const f of ['href', 'label', 'url', 'unit', 'areaSqft', 'floor', 'flatType', 'listedAt']) {
      if ((prev[f] === null || prev[f] === undefined) && r[f]) prev[f] = r[f];
    }
    if (price && price !== prev.price) {
      if (prev.price && price < prev.price) cut++; else if (prev.price) raised++;
      prev.priceHistory.push({ at, price });
      prev.price = price;
      updated++;
    }
  }

  let gone = 0;
  if (!partial) {
    for (const [k, L] of Object.entries(s.listings)) {
      if (seen.has(k) || L.status === 'gone') continue;
      L.status = 'gone';
      L.goneSince = at;
      gone++;
    }
  }

  s.snapshots.push({ at, label, rows: rows.length, partial, added, updated, cut, raised, gone });
  s.updatedAt = at;
  return { store: s, added, updated, cut, raised, gone, matched: seen.size };
}

const DAY = 86_400_000;

/** What a stored listing has been doing, derived rather than stored. */
export function summarise(L, now = new Date()) {
  const end = L.status === 'gone' ? new Date(L.goneSince) : now;
  const fromFeed = L.listedAt ? new Date(L.listedAt) : null;
  const from = fromFeed && !Number.isNaN(fromFeed.getTime()) ? fromFeed : new Date(L.firstSeen);
  const days = Math.max(0, Math.round((end - from) / DAY));

  const h = L.priceHistory || [];
  const first = h[0]?.price ?? null;
  const cuts = h.filter((p, i) => i > 0 && p.price < h[i - 1].price).length;
  const movePct = (first && L.price) ? (L.price - first) / first : null;

  return {
    days,
    /* Which clock the figure came from. A feed's own listed date is the truth;
       ours is a floor, because a listing that existed before the first ingest
       reads as new. */
    domIsFloor: !fromFeed,
    daysKnown: Math.max(0, Math.round((end - new Date(L.firstSeen)) / DAY)),
    cuts,
    firstPrice: first,
    movePct,
    status: L.status,
    /* Said in the shape it is true in. Never "sold". */
    goneNote: L.status === 'gone'
      ? 'Absent from the latest full snapshot. It may have sold, been withdrawn, expired, or been '
        + 'relisted by another agent — nothing here can tell those apart. A sale is confirmed by a '
        + 'filed transaction, months later.'
      : null,
  };
}

/** The listings worth a second look, and why. Ranked, never filtered silently. */
export function signals(store, { now = new Date(), minDays = 60 } = {}) {
  const out = [];
  for (const L of Object.values(store?.listings || {})) {
    if (L.status !== 'active') continue;
    const s = summarise(L, now);
    const why = [];
    if (s.cuts >= 2) why.push(`cut ${s.cuts} times`);
    else if (s.cuts === 1) why.push('cut once');
    if (s.days >= minDays) why.push(`${s.days} days on${s.domIsFloor ? ' (at least)' : ''}`);
    if (s.movePct !== null && s.movePct <= -0.05) why.push(`down ${(100 * Math.abs(s.movePct)).toFixed(1)}% from first seen`);
    if (why.length) out.push({ ...L, ...s, why });
  }
  /* Most cut, then longest on. Both point the same way: a seller whose
     position has weakened, which is a fact about the listing and not a claim
     about the home. */
  return out.sort((a, b) => (b.cuts - a.cuts) || (b.days - a.days));
}
