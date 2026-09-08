'use client';
import { useState } from 'react';

/**
 * The draft queue.
 *
 * Everything the pipeline files lands here and nowhere else. The job of this
 * screen is to make reading the piece easier than publishing it — so the body
 * is one click away and the publish button sits under it rather than beside
 * the title. A queue that can be cleared without reading anything is a queue
 * that will be.
 */
export default function StudioQueue({ drafts }) {
  const [items, setItems] = useState(drafts);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [blocked, setBlocked] = useState({});

  async function act(id, status) {
    setBusy(id); setErr('');
    try {
      const res = await fetch('/api/studio/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const j = await res.json();
      /* The server refused it on the published rules. Show them rather than
         the generic message — a person needs to know WHICH rule, and the
         endpoint has no override to offer them. */
      if (res.status === 422 && Array.isArray(j.blockers)) {
        setBlocked(b => ({ ...b, [id]: j.blockers }));
        return;
      }
      if (!res.ok) throw new Error(j.error || 'That did not work.');
      setItems(list => list.filter(x => x.id !== id));
    } catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  if (!items.length) {
    return (
      <div className="note">
        <b>Nothing waiting.</b> Drafts filed by the pipeline appear here. Nothing reaches the site
        until you publish it from this page.
      </div>
    );
  }

  return (
    <>
      {err && <div className="warn" style={{ marginBottom: 16 }}><p style={{ margin: 0 }}>{err}</p></div>}
      {items.map(a => (
        <article key={a.id} className="draft">
          <div className="dhead">
            <div>
              <span className="filtn">{a.category.replace('_', ' ')} · filed {String(a.created_at).slice(0, 10)}</span>
              <h2>{a.title}</h2>
            </div>
            <span className="chipish mono">{a.words} words</span>
          </div>

          <p className="dsum">{a.excerpt}</p>

          {a.source_urls?.length > 0 ? (
            <p className="hint">
              <b>Written from {a.source_urls.length} source{a.source_urls.length > 1 ? 's' : ''}:</b>{' '}
              {a.source_urls.map((u, i) => (
                <span key={u}>{i ? ' · ' : ''}<a href={u} target="_blank" rel="noopener noreferrer nofollow">{host(u)}</a></span>
              ))}
            </p>
          ) : (
            <p className="hint warnline"><b>No sources recorded, so this cannot be published.</b>{' '}
              Nothing under a CEA registration number may rest on an unsourced claim
              (PG 02-11 s3.1). Add sources in Supabase, or archive it.</p>
          )}

          {!a.header_image_url ? null : a.unsplash_photographer_name ? (
            <p className="hint">Image credited to {a.unsplash_photographer_name}.</p>
          ) : (
            <p className="hint"><b>An image with no photographer credit was dropped</b> — publishing it would breach the licence.</p>
          )}

          <button className="linkish" onClick={() => setOpen(open === a.id ? null : a.id)}
            aria-expanded={open === a.id}>
            {open === a.id ? 'Hide the piece' : 'Read the piece'}
          </button>

          {open === a.id && (
            <div className="post guide" style={{ marginTop: 16 }}
              dangerouslySetInnerHTML={{ __html: a.content_html }} />
          )}

          {blocked[a.id] && (
            <div className="warn" style={{ margin: '14px 0 0' }}>
              <p style={{ margin: '0 0 6px' }}><b>Refused. This cannot go out as written.</b></p>
              <ul className="bul">
                {blocked[a.id].map(b => <li key={b.id}>{b.why}</li>)}
              </ul>
            </div>
          )}

          <div className="dactions">
            {/* Not disabled on the client. The gate is the endpoint, and a
                button that greys itself out invites the question of how to
                un-grey it; a button that is refused, with the rule quoted,
                does not. */}
            <button className="mapopt" disabled={busy === a.id} onClick={() => act(a.id, 'published')}>
              {busy === a.id ? 'Publishing…' : 'Publish it'}
            </button>
            <button className="mapopt" disabled={busy === a.id} onClick={() => act(a.id, 'archived')}>
              Not this one
            </button>
            <span className="hint" style={{ marginLeft: 'auto' }}>
              Publishing puts it on /insights immediately, under your CEA number.
            </span>
          </div>
        </article>
      ))}
    </>
  );
}

function host(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
}
