'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';

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

      {shown.length === 0 ? (
        <p className="hint" style={{ marginTop: 20 }}>Nothing under that filter yet.</p>
      ) : (
        <ul className="feed" style={{ marginTop: 18 }}>
          {shown.map(p => (
            <li key={p.slug} className={p.kind === 'deep' ? 'deep' : undefined}>
              <Link href={p.href}>
                {p.image && (
                  <img className="fimg" src={p.image} alt={p.imageAlt} loading="lazy" width="1200" height="675" />
                )}
                <div className="fmeta">
                  <span className={'kind' + (p.kind === 'deep' ? ' deep' : '')}>
                    {p.kind === 'deep' ? 'Deep dive' : 'Note'}
                  </span>
                  <span className="fdate">{p.date}{p.kind === 'deep' ? ` · ${p.minutes} min` : ''}</span>
                </div>
                <p className="ftitle">{p.title}</p>
                {p.summary && <p className="fsum">{p.summary}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
