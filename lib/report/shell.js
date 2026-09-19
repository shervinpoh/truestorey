/**
 * The furniture every emailed report shares.
 *
 * Three reports now render the same shape — a headline figure or two, tables of
 * rows, a list of caveats, sources, a link back and the CEA footer — and the
 * third one is where a house style either exists or quietly becomes three
 * house styles. The rules it enforces are lib/digest.js's, for the reasons
 * given there: inline styles, no stylesheet, no web font, no image, and a
 * plain-text part that reads on its own because that is what a mail preview
 * shows and what a screen reader gets.
 */
export const money = n => 'S$' + Math.round(Number(n) || 0).toLocaleString('en-SG');
export const pct = (n, dp = 1) => `${(Number(n) || 0).toFixed(dp)}%`;
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
/** "2021-06" → "June 2021". A YYYY-MM string is a database value, not prose. */
export function monthName(m) {
  const [y, mm] = String(m || '').split('-');
  return MONTHS[Number(mm) - 1] ? `${MONTHS[Number(mm) - 1]} ${y}` : String(m || '');
}

export const S = {
  wrap: 'font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111414;max-width:620px',
  lab: 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#666E6A',
  fig: 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:27px;font-weight:600;letter-spacing:-.01em;color:#164F52',
  hint: 'margin:6px 0 0;font-size:13.5px;color:#48514F',
  mono: 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
  rule: 'border:0;border-top:1px solid #E2E0D9;margin:26px 0',
};

/** A two-column table of [label, value] rows. Both cells are escaped. */
export const table = lines => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:8px 0 0">
${lines.map(([k, val], i) => `<tr>
<td style="padding:8px 10px 8px 0;border-top:${i ? '1px solid #EDEBE5' : '0'};color:#48514F;font-size:14px">${esc(k)}</td>
<td style="padding:8px 0;border-top:${i ? '1px solid #EDEBE5' : '0'};text-align:right;white-space:nowrap;${S.mono};font-size:14px;color:#111414">${esc(val)}</td>
</tr>`).join('')}
</table>`;

/** A headline figure in its panel. `accent` marks the second one apart. */
export const figure = (label, value, note, accent = '#164F52') => `<div style="background:#F6F5F2;border-left:3px solid ${accent};padding:16px 18px;margin:0 0 14px">
<p style="${S.lab};margin:0 0 6px">${esc(label)}</p>
<p style="${S.fig};margin:0">${esc(value)}</p>
<p style="${S.hint}">${esc(note)}</p>
</div>`;

export const bullets = items =>
  `<ul style="margin:0;padding-left:18px;font-size:13.5px;color:#48514F">${items.map(i => `<li style="margin:0 0 8px">${esc(i)}</li>`).join('')}</ul>`;

/**
 * The closing block every report ends with: the line that says it is not a
 * valuation (rule 2), the link back, the sources with their effective dates
 * (rule 6) and the CEA particulars (rule 8).
 */
export function footer({ link, sources, agent, extraNote = null }) {
  const text = [
    'THIS IS NOT A VALUATION. Every figure above comes from what you entered and from published',
    'rates. None of it is an opinion about what your home is worth or what it would fetch — that',
    'is a separate question, and the filed transaction ranges on the site are the evidence for it.',
    '',
    `Open this result again: ${link}`,
    '',
    sources.map(s => `${s.name} (effective ${s.effective})`).join(' · '),
    ...(extraNote ? ['', extraNote] : []),
    '',
    `${agent.name} · CEA Reg. No. ${agent.cea} · ${agent.agency}`,
    'You asked for this copy at truestorey.',
    'Your address was used once to send it and was not stored, and neither were your figures.',
    'There is no list here, and nothing to unsubscribe from.',
  ].join('\n');

  const html = `<hr style="${S.rule}">
<p style="margin:0 0 16px;font-size:13.5px;color:#48514F"><strong style="color:#111414">This is not a valuation.</strong> Every figure above comes from what you entered and from published rates. None of it is an opinion about what your home is worth or what it would fetch — that is a separate question, and the filed transaction ranges on the site are the evidence for it.</p>
<p style="margin:0 0 18px"><a href="${esc(link)}" style="color:#164F52;font-weight:600">Open this result again, with every figure editable &rarr;</a></p>
<p style="${S.lab};margin:0 0 4px">${sources.map(s => `${esc(s.name)} (effective ${esc(s.effective)})`).join(' · ')}</p>
${extraNote ? `<p style="${S.lab};margin:0 0 18px">${esc(extraNote)}</p>` : '<div style="margin:0 0 18px"></div>'}
<p style="margin:0;padding-top:14px;border-top:1px solid #E2E0D9;font-size:12px;color:#666E6A">
${esc(agent.name)} · CEA Reg. No. ${esc(agent.cea)} · ${esc(agent.agency)}<br>
You asked for this copy at truestorey.<br>
Your address was used once to send it and was not stored, and neither were your figures. There is no list here, and nothing to unsubscribe from.
</p>`;
  return { text, html };
}

/** The masthead: what this is, where it was run, and on what date. */
export function head({ kind, subject, siteUrl, path, dated, standfirst }) {
  return {
    text: [subject, `Run on truestorey.vercel.app${path}, ${dated}.`, standfirst, ''].join('\n'),
    html: `<p style="${S.lab};margin:0 0 4px">Truestorey · ${esc(kind)}</p>
<h1 style="font-size:21px;line-height:1.25;margin:0 0 6px">${esc(subject)}</h1>
<p style="margin:0 0 20px;font-size:13.5px;color:#48514F">Run on <a href="${esc(siteUrl + path)}" style="color:#164F52">truestorey${esc(path)}</a> on ${esc(dated)}. ${esc(standfirst)}</p>`,
  };
}
