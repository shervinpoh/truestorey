import { byMonth } from './watch.js';

/**
 * The block digest, as text and as HTML.
 *
 * WHAT THIS IS ALLOWED TO SAY. Filed transactions, with the month they were
 * registered, the source and the period the dataset covers. That is the whole
 * permitted vocabulary.
 *
 * WHAT IT MUST NOT SAY, and the rules that say so:
 *   · what the reader's flat is now worth — rule 2, no single valuation. The
 *     digest reports other people's completed sales and stops.
 *   · "undervalued", "best deal", "expert", "specialist" — rule 7.
 *   · anything about direction without a period attached — rule 6 and CEA
 *     PG 02-11 s3.1. "Prices rose" is not a claim this may make.
 *   · a walking time, or a school place — rules 10 and 11 do not arise here
 *     and must not be smuggled in by a future edit.
 *
 * ── THE HONEST TIMELINESS CLAIM ─────────────────────────────────────────────
 *
 * HDB publishes resale registrations by MONTH, with a lag. There is no day, no
 * hour, and a sale agreed in June can be registered in the June figures weeks
 * later. So this never says "just sold" or "sold this week". It says the month
 * it was registered for and the date the dataset was pulled, and lets the
 * reader see the gap. A rival promising same-day alerts on this data is
 * promising something the source does not carry.
 *
 * ── HTML EMAIL ──────────────────────────────────────────────────────────────
 *
 * Inline styles only, no stylesheet, no web font, no image. Every client
 * strips or mangles something different and the fallback for all of it is
 * legible text, which is what the plain-text part already is.
 */

const money = n => 'S$' + Number(n).toLocaleString('en-SG');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "2026-08" → "August 2026". A YYYY-MM string is a database value, not prose. */
export function monthName(m) {
  const [y, mm] = String(m).split('-');
  const names = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
  return `${names[Number(mm) - 1] || mm} ${y}`;
}

const line = r => [
  r.flatType,
  r.areaSqm ? `${Math.round(r.areaSqm * 10.7639)} sqft` : null,
  r.storeyRange ? `floor ${r.storeyRange.toLowerCase()}` : null,
].filter(Boolean).join(' · ');

/**
 * Returns { subject, text, html }.
 *
 * `label` is the block as a reader wrote it, `href` its page on the site,
 * `meta` the dataset's own source, period and access date — passed in rather
 * than imported so the digest cannot drift from the file it was built off.
 */
export function renderDigest({ label, href, fresh, meta, siteUrl, unsubscribeUrl, agent }) {
  const groups = byMonth(fresh);
  const n = fresh.length;
  const subject = `${n} sale${n === 1 ? '' : 's'} filed at ${label}`;

  const asOf = String(meta.accessedAt || '').slice(0, 10);
  const provenance = `${meta.source} · registrations to ${monthName(meta.latestMonth)} · dataset pulled ${asOf}`;

  const textBody = [
    subject,
    '',
    `Filed with HDB and published through data.gov.sg. Registrations are reported by month, not by day, and a sale can be registered weeks after it was agreed — so this is what the register now shows, not what happened yesterday.`,
    '',
    ...groups.flatMap(g => [
      `${monthName(g.month)} — ${g.rows.length} registered`,
      ...g.rows.map(r => `  ${money(r.price)}  ${line(r)}`),
      '',
    ]),
    `Every transaction at this block: ${siteUrl}${href}`,
    '',
    provenance,
    'This reports completed sales at your block. It is not a valuation of your flat and nothing here is advice.',
    '',
    `${agent.name} · CEA Reg. No. ${agent.cea} · ${agent.agency}`,
    `Stop these updates: ${unsubscribeUrl}`,
  ].join('\n');

  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111414;max-width:560px">
<h1 style="font-size:19px;margin:0 0 6px">${esc(subject)}</h1>
<p style="margin:0 0 18px;color:#48514F;font-size:13.5px">Filed with HDB and published through data.gov.sg. Registrations are reported by <strong>month, not by day</strong>, and a sale can be registered weeks after it was agreed — so this is what the register now shows, not what happened yesterday.</p>
${groups.map(g => `<div style="margin:0 0 16px">
<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#666E6A;padding-bottom:6px;border-bottom:1px solid #E2E0D9">${esc(monthName(g.month))} — ${g.rows.length} registered</div>
${g.rows.map(r => `<div style="padding:9px 0;border-bottom:1px solid #EDEBE5">
<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600">${esc(money(r.price))}</span>
<span style="color:#48514F"> &nbsp;${esc(line(r))}</span>
</div>`).join('')}
</div>`).join('')}
<p style="margin:18px 0"><a href="${esc(siteUrl + href)}" style="color:#164F52">Every transaction at this block &rarr;</a></p>
<p style="margin:0 0 4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#666E6A">${esc(provenance)}</p>
<p style="margin:0 0 18px;font-size:12.5px;color:#666E6A">This reports completed sales at your block. It is not a valuation of your flat, and nothing here is advice.</p>
<p style="margin:0;padding-top:12px;border-top:1px solid #E2E0D9;font-size:12px;color:#666E6A">
${esc(agent.name)} · CEA Reg. No. ${esc(agent.cea)} · ${esc(agent.agency)}<br>
<a href="${esc(unsubscribeUrl)}" style="color:#666E6A">Stop these updates</a> — one click, no reply needed.
</p>
</div>`;

  return { subject, text: textBody, html };
}
