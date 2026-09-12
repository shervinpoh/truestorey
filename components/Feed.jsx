'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import EditorialImage from './EditorialImage.jsx';

/**
 * The editorial feed.
 *
 * Notes and deep dives share one chronological list rather than sitting in
 * separate sections, because a note published after a long piece may well
 * supersede it — splitting them would bury the correction under the thing it
 * corrects. The filter lets you narrow to one kind; it does not pretend they
 * are two publications.
 *
 * Filtering is client-side over an array the page already sent. No request,
 * no spinner.
 */
export default function Feed({ posts = [], topics = [] }) {
  const [kind, setKind] = useState('all');
  const [topic, setTopic] = useState(null);

  const shown = useMemo(() => posts.filter(p =>
    (kind === 'all' || p.kind === kind) &&
    (!topic || p.tags?.includes(topic))
  ), [posts, kind, topic]);

  const counts = useMemo(() => ({
    all: posts.length,
    note: posts.filter(p => p.kind === 'note').length,
    deep: posts.filter(p => p.kind === 'deep').length,
  }), [posts]);

  const tint = tints(shown);

  return (
    <>
      <div className="seg" role="group" aria-label="Filter by kind">
        <button aria-pressed={kind === 'all'} onClick={() => setKind('all')}>Everything ({counts.all})</button>
        <button aria-pressed={kind === 'note'} onClick={() => setKind('note')} disabled={!counts.note}>
          Notes ({counts.note})
        </button>
        <button aria-pressed={kind === 'deep'} onClick={() => setKind('deep')} disabled={!counts.deep}>
          Deep dives ({counts.deep})
        </button>
      </div>

      {topics.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          <button className={'kind' + (topic === null ? ' deep' : '')} onClick={() => setTopic(null)}
            style={{ cursor: 'pointer', background: 'none' }} aria-pressed={topic === null}>All topics</button>
          {topics.map(t => (
            <button key={t.name} className={'kind' + (topic === t.name ? ' deep' : '')}
              onClick={() => setTopic(topic === t.name ? null : t.name)}
              style={{ cursor: 'pointer', background: 'none' }} aria-pressed={topic === t.name}>
              {t.name} · {t.n}
            </button>
          ))}
        </div>
      )}

      {/* One pass over the rendered list, so a tint can see the card above it. */}
      {shown.length === 0 ? (
        <p className="hint" style={{ marginTop: 20 }}>Nothing under that filter yet.</p>
      ) : (
        <ul className="feedgrid" style={{ marginTop: 18 }}>
          {shown.map((p, i) => (
            <li key={p.slug} className={p.kind === 'deep' ? 'fcard deep' : 'fcard'}>
              <Link href={p.href}>
                {/* ── every card gets a visual, and most have no photograph ──
                    None of the articles filed so far carries one, and the ones
                    already published never will — an image is fetched when a
                    piece is written, not backfilled. A grid built around
                    photographs would therefore be a grid of empty rectangles,
                    which reads as broken rather than as unillustrated.

                    So the fallback is typographic: the kind set large on a
                    ground tinted by category. It fills the slot, carries the
                    one thing a reader sorts by, and looks like a decision. It
                    also gives the river rhythm without a single image — three
                    tints alternating down the page. */}
                {p.image ? (
                  <EditorialImage post={p} className="fimg" />
                ) : (
                  <span className={'ftile t' + tint[i]} aria-hidden="true">
                    <span>{p.kind === 'deep' ? 'Deep dive' : 'Note'}</span>
                  </span>
                )}
                <div className="fbody">
                  <div className="fmeta">
                    <span className={'kind' + (p.kind === 'deep' ? ' deep' : '')}>
                      {p.kind === 'deep' ? 'Deep dive' : 'Note'}
                    </span>
                    <span className="fdate">{p.date}{p.kind === 'deep' ? ` · ${p.minutes} min` : ''}</span>
                  </div>
                  <p className="ftitle">{p.title}</p>
                  {p.summary && <p className="fsum">{p.summary}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Which of the three tints each card gets.
 *
 * From the SLUG rather than the position, so a card keeps its colour when the
 * filter changes — a tile that shifts shade because something above it was
 * filtered out reads as a bug.
 *
 * But only mostly. Over eight slugs the hash spreads 2/3/3, which is fine; over
 * the two currently in the river it put both on the same tint, and two adjacent
 * identical tiles read as a mistake whatever the arithmetic says. So a card
 * that matches the one before it is nudged to the next tint. Stable where it
 * can be, alternating where it has to be — and the nudge only ever depends on
 * the card above, so a list keeps its colours as it grows.
 */
function tints(posts) {
  const hash = slug => {
    let h = 0;
    for (const c of String(slug)) h = (h * 31 + c.charCodeAt(0)) % 3;
    return h;
  };
  const out = [];
  for (let i = 0; i < posts.length; i++) {
    let t = hash(posts[i].slug);
    if (i > 0 && t === out[i - 1]) t = (t + 1) % 3;
    out.push(t);
  }
  return out;
}
