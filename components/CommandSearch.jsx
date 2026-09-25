'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon.jsx';
import { findTools, TOOL_GROUPS } from '../lib/nav.js';
import { readRecent } from '../lib/recent.js';
import { titleCase } from '../lib/name.js';

/**
 * One search box for the whole site: a block, a project, a street — or a tool.
 *
 * Shervin, 26 Sep: he could not find the tool he wanted, so a first-time
 * visitor certainly could not. The homepage search only knew addresses, and
 * typing "stamp duty" into it returned nothing. This lives in the header on
 * every page, opens with ⌘K or "/", and answers both kinds of question in one
 * list: tools first when the words name a tool (lib/nav.js findTools), places
 * from the same index /api/search already serves. Empty, it offers what this
 * reader looked at last (lib/recent.js, their own device only) and one
 * starting tool from each group.
 */
export default function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState([]);
  const [recent, setRecent] = useState([]);
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const router = useRouter();

  const show = useCallback(() => { setRecent(readRecent()); setOpen(true); }, []);
  const hide = useCallback(() => { setOpen(false); setQ(''); setPlaces([]); setActive(0); }, []);

  /* ⌘K / Ctrl+K anywhere; "/" when the reader is not already typing. */
  useEffect(() => {
    const onKey = e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault(); show();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => input.current?.focus(), 10);
    document.documentElement.classList.add('palette-open');
    return () => { clearTimeout(t); document.documentElement.classList.remove('palette-open'); };
  }, [open]);

  /* Places: the same index the homepage search reads, asked after a pause so
     a fast typist sends one request, not six. */
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) { setPlaces([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}&limit=6&towns=1`, { signal: ctl.signal })
        .then(r => (r.ok ? r.json() : { results: [] }))
        .then(j => setPlaces(j.results || []))
        .catch(() => {});
    }, 160);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open]);

  const tools = useMemo(() => findTools(q, 5), [q]);
  const starters = useMemo(() => TOOL_GROUPS.map(g => ({ ...g.items[0], group: g.label })), []);

  const rows = useMemo(() => {
    if (!q.trim()) {
      return [
        ...recent.map(r => ({ key: `r${r.href}`, href: r.href, icon: r.kind === 'home' ? 'building' : 'clock', name: r.label, note: r.kind === 'home' ? 'Looked at recently' : 'Used recently', section: 'Pick up where you left off' })),
        ...starters.map(t => ({ key: `s${t.href}`, href: t.href, icon: t.icon, name: t.name, note: t.note, section: 'Start with a tool' })),
      ];
    }
    return [
      ...tools.map(t => ({ key: `t${t.href}`, href: t.href, icon: t.icon, name: t.name, note: t.note, section: 'Tools' })),
      ...places.map(p => ({ key: `p${p.href}`, href: p.href, icon: p.kind === 'HDB' ? 'building' : 'home',
        name: titleCase(p.label), note: [p.sub, p.n ? `${Number(p.n).toLocaleString('en-SG')} filed sales` : ''].filter(Boolean).join(' · '),
        section: 'Blocks, projects and streets' })),
    ];
  }, [q, tools, places, recent, starters]);

  useEffect(() => { setActive(0); }, [q]);

  const go = row => { if (!row) return; hide(); router.push(row.href); };
  const onKeyDown = e => {
    if (e.key === 'Escape') { e.preventDefault(); hide(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(rows[active]); }
  };

  let lastSection = null;
  return (
    <>
      <button type="button" className="hsearch" onClick={show} aria-haspopup="dialog">
        <Icon name="search" size={17} />
        <span className="hsearch-say">Search a block, project or tool</span>
        <kbd aria-hidden="true">⌘K</kbd>
      </button>
      {open && (
        <div className="palette" role="dialog" aria-modal="true" aria-label="Search Truestorey"
          onPointerDown={e => { if (e.target === e.currentTarget) hide(); }}>
          <div className="palette-box">
            <div className="palette-input">
              <Icon name="search" size={19} />
              <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
                placeholder="A block, a project, a street — or “stamp duty”, “rent”, “when can I sell”"
                aria-label="Search" aria-controls="palette-list" autoComplete="off" spellCheck="false" />
              <button type="button" className="palette-close" onClick={hide} aria-label="Close search">Esc</button>
            </div>
            <ul className="palette-list" id="palette-list" role="listbox">
              {rows.map((r, i) => {
                const head = r.section !== lastSection ? r.section : null;
                lastSection = r.section;
                return [
                  head && <li key={`h-${head}`} className="palette-sec" role="presentation">{head}</li>,
                  <li key={r.key} role="option" aria-selected={i === active}>
                    <a href={r.href} className={i === active ? 'on' : undefined}
                      onMouseEnter={() => setActive(i)} onClick={e => { e.preventDefault(); go(r); }}>
                      <span className="palette-ico"><Icon name={r.icon} size={19} /></span>
                      <span className="palette-txt"><b>{r.name}</b>{r.note && <span>{r.note}</span>}</span>
                      <Icon name="arrow" size={16} className="palette-go" />
                    </a>
                  </li>,
                ];
              })}
              {q.trim().length >= 2 && !rows.length && (
                <li className="palette-empty">Nothing by that name yet. Try a block number and street, a project name, or a word like “rent”.</li>
              )}
            </ul>
            <p className="palette-foot"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</p>
          </div>
        </div>
      )}
    </>
  );
}
