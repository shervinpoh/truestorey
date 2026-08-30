import { parseBlocks } from '../lib/answer.js';

/**
 * The tokens from lib/answer.js, as React elements.
 *
 * NOTHING HERE TAKES A STRING OF HTML. Every node below is constructed, so
 * model output lands in a text node and cannot become markup — no sanitiser in
 * the path and nothing for one to miss.
 *
 * A citation becomes a link to the source it indexes. `[2][3][15]` was the
 * single ugliest thing on this page; the numbers were always meaningful and
 * were always pointing at the sources list underneath, so they render as a
 * superscript that goes there. A number with no matching source is dropped
 * rather than shown dead — mid-stream the prose arrives before the citations
 * array does, and a footnote to nowhere is worse than no footnote.
 */
export default function AnswerText({ text, sources = [] }) {
  return parseBlocks(text).map((b, i) => {
    if (b.kind === 'h') return <h3 key={i} className="ansh">{spans(b.spans, sources)}</h3>;
    if (b.kind === 'ul') return <ul key={i} className="ansl">{b.items.map((it, j) => <li key={j}>{spans(it, sources)}</li>)}</ul>;
    if (b.kind === 'ol') return <ol key={i} className="ansl">{b.items.map((it, j) => <li key={j}>{spans(it, sources)}</li>)}</ol>;
    if (b.kind === 'table') return (
      <div key={i} className="tablewrap">
        <table className="anst">
          <thead><tr>{b.head.map((c, j) => <th key={j}>{spans(c, sources)}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{spans(c, sources)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
    return <p key={i}>{spans(b.spans, sources)}</p>;
  });
}

/**
 * Consecutive citations collapse into one superscript. The model emits
 * `[2][3][15]` as three separate markers and three separate brackets is what
 * made them read as debris; `2,3,15` in one raised group reads as a footnote.
 */
function spans(list, sources) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];

    if (s.t === 'cite') {
      const run = [];
      while (i < list.length && list[i].t === 'cite') {
        const n = list[i].n;
        if (sources[n - 1] && !run.some(r => r.n === n)) run.push({ n, url: sources[n - 1] });
        i++;
      }
      i--;
      if (run.length) {
        out.push(
          <sup key={out.length} className="cite">
            {run.map((r, j) => (
              <a key={r.n} href={r.url} target="_blank" rel="noopener noreferrer nofollow"
                title={host(r.url)}>{j ? `,${r.n}` : r.n}</a>
            ))}
          </sup>
        );
      }
      continue;
    }

    if (s.t === 'b') out.push(<strong key={out.length}>{s.v}</strong>);
    else if (s.t === 'i') out.push(<em key={out.length}>{s.v}</em>);
    else if (s.t === 'code') out.push(<code key={out.length} className="mono">{s.v}</code>);
    else if (s.t === 'link') out.push(
      <a key={out.length} href={s.href} target="_blank" rel="noopener noreferrer nofollow">{s.v}</a>);
    else out.push(<span key={out.length}>{s.v}</span>);
  }
  return out;
}

const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
