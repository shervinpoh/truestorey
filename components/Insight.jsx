import Link from 'next/link';
import { render } from '../lib/md.js';
import { getIndex, hdbIndex, sora, mop, recordByHref, town as getTown } from '../lib/data/query.js';

const f  = n => 'S$' + Math.round(n).toLocaleString('en-SG');
const num = n => Number(n).toLocaleString('en-SG');

/**
 * Renders one post.
 *
 * The shortcodes exist so a post never hardcodes a figure. `{{index}}` reads
 * the live price index; `{{block:/hdb/...}}` reads that block's real numbers.
 * Rewrite the data, rebuild, and every post is current — which is the whole
 * reason for writing against the datasets rather than typing numbers in.
 *
 * Every insert carries its own source line, because a figure inside an article
 * is still a derived figure (PG 02-11 s3.1).
 */
export default function Insight({ post }) {
  // A pipeline article arrives as HTML that was sanitised on the way IN, so it
  // is rendered as-is. Shortcodes are not run over it: they read live data and
  // a pipeline that emitted one by accident would be quoting a figure nobody
  // wrote. Only a file Shervin wrote himself gets that power.
  if (post.html) {
    return (
      <>
        <div className="post" dangerouslySetInnerHTML={{ __html: post.html }} />
        {post.credit?.name && (
          <p className="prov">
            Photograph by{' '}
            <a href={post.credit.profile} rel="noopener noreferrer" target="_blank">{post.credit.name}</a>
            {' '}on <a href={post.credit.unsplash} rel="noopener noreferrer" target="_blank">Unsplash</a>
          </p>
        )}
        {post.sources?.length > 0 && (
          <div className="pane" style={{ marginTop: 8 }}>
            <div className="sh"><span>What this was written from</span></div>
            <ul className="idx">
              {post.sources.map(u => (
                <li key={u}>
                  <a href={u} rel="noopener noreferrer nofollow" target="_blank">
                    <span className="n">{hostOf(u)}</span>
                    <span className="s mono">{u.length > 80 ? u.slice(0, 80) + '…' : u}</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="hint">
              Primary sources, linked rather than reproduced. Nothing on this site republishes
              somebody else&apos;s reporting.
            </p>
          </div>
        )}
      </>
    );
  }
  const html = render(post.body, resolve);
  return <div className="post" dangerouslySetInnerHTML={{ __html: html }} />;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function box(inner, source) {
  return `<div class="embed">${inner}${source ? `<p class="prov" style="margin:10px 0 0">${source}</p>` : ''}</div>`;
}

function resolve(name, arg) {
  try {
    if (name === 'index') {
      const i = hdbIndex(); if (!i) return null;
      const dir = i.yoy == null ? '' : Math.abs(i.yoy) < 0.05 ? 'flat' : (i.yoy > 0 ? `up ${i.yoy.toFixed(1)}%` : `down ${Math.abs(i.yoy).toFixed(1)}%`);
      return box(
        `<span class="lab">HDB resale price index · ${i.base}</span>
         <div class="embignum">${i.latest.index.toFixed(1)}</div>
         <p class="meta">${i.latest.quarter.replace('-Q',' Q')}${dir ? ` · ${dir} year on year` : ''}</p>`,
        `${i.source} · accessed ${i.accessedAt.slice(0,10)}`
      );
    }

    if (name === 'sora') {
      const s = sora(); if (!s) return null;
      return box(
        `<span class="lab">SORA</span>
         <div class="embignum">${s.latest.sora.toFixed(2)}%</div>
         <p class="meta">as at ${s.latest.date}</p>`,
        `${s.source} · fetched ${s.accessedAt.slice(0,10)}`
      );
    }

    if (name === 'block' || name === 'record') {
      const r = recordByHref(arg); if (!r) return null;
      return box(
        `<span class="lab">Transacted range</span>
         <div class="embignum">$${r.minPsf} – $${r.maxPsf} psf</div>
         <p class="meta">${r.label} · median $${r.medianPsf} psf · ${r.n} filed transaction${r.n>1?'s':''}</p>
         <p style="margin:10px 0 0"><a href="${r.href}">See every transaction behind this →</a></p>`,
        `${r.source} · ${r.period?.from} to ${r.period?.to} · accessed ${r.accessedAt}`
      );
    }

    if (name === 'town') {
      const t = getTown(arg); if (!t) return null;
      return box(
        `<span class="lab">${t.name}</span>
         <div class="embignum">$${t.medianPsf} psf</div>
         <p class="meta">median across ${num(t.n)} filed resales · ${t.blocks.length} blocks</p>
         <p style="margin:10px 0 0"><a href="${t.href}">Open ${t.name} →</a></p>`,
        `${getIndex().hdb?.source} · accessed ${getIndex().hdb?.accessedAt}`
      );
    }

    if (name === 'mop') {
      const m = mop(); if (!m) return null;
      if (arg) {
        const key = String(arg).toUpperCase();
        const t = Object.values(m.towns).find(x => x.town === key);
        if (!t) return null;
        const up = Object.values(t.byYear).filter(y => y.year >= m.generatedForYear && y.year <= m.generatedForYear + 4);
        const units = up.reduce((a, y) => a + y.units, 0), blocks = up.reduce((a, y) => a + y.blocks, 0);
        return box(
          `<span class="lab">${t.town} · reaching year five ${m.generatedForYear}–${m.generatedForYear+4}</span>
           <div class="embignum">${num(units)}</div>
           <p class="meta">units across ${blocks} blocks</p>
           <p style="margin:10px 0 0"><a href="/mop">The full tracker →</a></p>`,
          `${m.source} · accessed ${m.accessedAt.slice(0,10)} · earliest-possible years, see the tracker for why`
        );
      }
      return box(
        `<span class="lab">Reaching year five ${m.generatedForYear}–${m.generatedForYear+4}</span>
         <div class="embignum">${num(m.totals.upcomingUnits)}</div>
         <p class="meta">units across ${num(m.totals.upcomingBlocks)} blocks</p>
         <p style="margin:10px 0 0"><a href="/mop">The full tracker →</a></p>`,
        `${m.source} · accessed ${m.accessedAt.slice(0,10)} · earliest-possible years, see the tracker for why`
      );
    }
  } catch { /* a bad argument must never take the page down */ }
  return null;
}
