/**
 * A keepable Blindspot report, recomputed from the same published rubric the
 * page uses. The email deliberately omits the optional model paragraph: the
 * checks, caveats, filed comparables and viewing questions are the report;
 * no generated prose is needed to make a forwarded copy useful.
 */
import { analyse } from '../blindspot/analyse.js';
import { viewingQuestions } from '../blindspot/viewing.js';
import { S, esc, figure, footer, head, money, table } from './shell.js';

const count = n => Number(n).toLocaleString('en-SG');
const psf = n => `S$${count(Math.round(n))} psf`;

export function renderBlindspotReport({ values, link, agent, siteUrl, now = new Date() }) {
  const r = analyse({
    href: values.home, askPrice: values.price, areaSqft: values.area,
    floor: values.floor || null, now,
  });
  if (r.error) return { error: r.error };

  const dated = now.toISOString().slice(0, 10);
  const subject = `Your Blindspot check — ${r.record.label}`.slice(0, 118);
  const standfirst = 'Risk points count things worth checking, not a rating. The score uses the published rubric and the public records held when this email was made.';
  const h = head({ kind: 'Blindspot', subject, siteUrl, path: '/blindspot', dated, standfirst });
  const asked = [
    ['Property', r.record.label],
    ['Asking price supplied', money(r.input.askPrice)],
    ['Floor area supplied', `${count(r.input.areaSqft)} sq ft`],
    ...(r.input.floor ? [['Floor supplied', String(r.input.floor)]] : []),
    ['Asking price per sq ft', psf(r.input.askingPsf)],
  ];
  const checkText = r.checks.flatMap(c => [
    `${c.title.toUpperCase()} — ${c.points} of ${c.max} points`,
    c.finding,
    ...(c.caveat ? [c.caveat] : []),
    `Source: ${c.source} · as at ${dated}.`,
    '',
  ]);
  const questions = viewingQuestions(r);
  const price = r.detail?.price;
  const observed = price?.observed;
  const scored = price?.scored;
  const period = price?.period;
  const priceLines = [
    ...(observed ? [
      `At this address: ${count(observed.sample)} filed sales, ${psf(observed.low)} to ${psf(observed.high)}, ${observed.from} to ${observed.to}.`,
    ] : []),
    ...(scored ? [
      `Scored cohort: ${count(scored.sample)} filed sales${scored.basis === 'nearby' ? ` across ${count(scored.blocks)} nearby ${r.record.kind === 'HDB' ? 'HDB blocks' : 'projects'} within ${count(Math.round(scored.radiusKm * 1000))}m straight-line` : ' at this address'}. Range ${psf(scored.low)} to ${psf(scored.high)}; median ${psf(scored.median)}.`,
      ...(scored.adjusted ? [`Comparables were restated to floor ${scored.adjusted.to} using the ${scored.adjusted.where} floor curve; ${count(scored.adjusted.moved)} of ${count(scored.adjusted.of)} moved.`]
        : ['Comparables were used as filed, without a floor adjustment.']),
    ] : price?.unavailable ? [`Not scored: ${price.unavailable}`] : []),
    ...(period ? [`${price.source} · ${period.from} to ${period.to} · observed transactions, not a valuation.`] : []),
  ];
  const comps = scored?.comparisons || [];
  const compLines = comps.map(c => `${c.label} · filed ${c.month} · ${c.areaSqm || 'area not held'} sqm${c.storey ? ` · ${c.storey}` : ''} · ${psf(c.psf)} · ${c.distanceM ? `${count(c.distanceM)}m straight-line` : 'this address'}`);
  const f = footer({
    link, sources: [], agent,
    figureBasis: 'the listing inputs supplied and the public records named beside each check',
    extraNote: `Rubric ${r.version} · results are recomputed from the public records held when the link is opened, so they may change after a data refresh.`,
  });

  const text = [
    h.text,
    `RISK POINTS: ${r.points} of ${r.max} — ${r.band}`,
    `${r.direction} ${r.meaning}`,
    `${r.checks.length} applicable checks ran; ${r.skipped.length} could not run; ${r.notApplicable.length} did not apply. A check that could not run scores nothing, not a pass.`,
    '',
    'WHAT YOU ENTERED',
    ...asked.map(([k, v]) => `  ${k}: ${v}`),
    '',
    'WHAT EACH CHECK FOUND',
    ...checkText,
    ...(r.notApplicable.length ? ['NOT APPLICABLE', ...r.notApplicable.map(c => `  ${c.title}: ${c.reason}`), ''] : []),
    ...(r.skipped.length ? ['COULD NOT BE CHECKED', ...r.skipped.map(c => `  ${c.title}: ${c.needs}`), ''] : []),
    ...(priceLines.length ? ['THE PRICE EVIDENCE', ...priceLines, ''] : []),
    ...(compLines.length ? ['FILED COMPARABLES', ...compLines.map(c => `  ${c}`), ''] : []),
    'TAKE THESE QUESTIONS INTO THE VIEWING',
    ...questions.map((q, i) => `  ${i + 1}. ${q.question}`),
    '',
    f.text,
  ].join('\n');

  const html = `<div style="${S.wrap}">
${h.html}
${figure('Risk points', `${r.points} of ${r.max}`, `${r.band}. ${r.direction} ${r.meaning}`)}
<p style="${S.hint}">${r.checks.length} applicable checks ran; ${r.skipped.length} could not run; ${r.notApplicable.length} did not apply. A check that could not run scores nothing, not a pass.</p>
<hr style="${S.rule}">
<p style="${S.lab};margin:0">What you entered</p>
${table(asked)}
<hr style="${S.rule}">
<p style="${S.lab};margin:0 0 8px">What each check found</p>
${r.checks.map(c => `<div style="border-top:1px solid #EDEBE5;padding:13px 0">
<p style="margin:0 0 4px;font-weight:600">${esc(c.title)} · ${c.points} of ${c.max} points</p>
<p style="margin:0 0 4px">${esc(c.finding)}</p>
${c.caveat ? `<p style="${S.hint}">${esc(c.caveat)}</p>` : ''}
<p style="${S.lab};margin:7px 0 0">${esc(c.source)} · as at ${esc(dated)}</p>
</div>`).join('')}
${r.notApplicable.length ? `<p style="${S.lab};margin:16px 0 6px">Not applicable</p>${r.notApplicable.map(c => `<p style="${S.hint}"><strong>${esc(c.title)}:</strong> ${esc(c.reason)}</p>`).join('')}` : ''}
${r.skipped.length ? `<p style="${S.lab};margin:16px 0 6px">Could not be checked</p>${r.skipped.map(c => `<p style="${S.hint}"><strong>${esc(c.title)}:</strong> ${esc(c.needs)}</p>`).join('')}` : ''}
${priceLines.length ? `<hr style="${S.rule}"><p style="${S.lab};margin:0 0 8px">The price evidence</p>${priceLines.map(line => `<p style="${S.hint}">${esc(line)}</p>`).join('')}` : ''}
${compLines.length ? `<p style="${S.lab};margin:18px 0 8px">Filed comparables</p><ol style="padding-left:20px;font-size:13px">${compLines.map(line => `<li style="margin:0 0 7px">${esc(line)}</li>`).join('')}</ol>` : ''}
<hr style="${S.rule}"><p style="${S.lab};margin:0 0 8px">Take these questions into the viewing</p>
<ol style="padding-left:20px">${questions.map(q => `<li style="margin:0 0 9px">${esc(q.question)}</li>`).join('')}</ol>
${f.html}
</div>`;

  return { subject, text, html };
}
