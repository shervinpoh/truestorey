import { NextResponse } from 'next/server';
import { analyse } from '../../../../lib/blindspot/analyse.js';
import { claude, configured } from '../../../../lib/ai/providers.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The Blindspot report.
 *
 * ORDER OF OPERATIONS MATTERS AND IS NOT NEGOTIABLE.
 *
 *   1. The rubric runs first, from the repo, with no network.
 *   2. The score, the points and every finding are fixed at that moment.
 *   3. Only then is a model asked to write the paragraph around them.
 *
 * The model is given the numbers and told it may not produce new ones. If it
 * is unavailable, over budget or wrong, the report still renders with its
 * score and its findings intact — which is the test of whether a feature is
 * built on data or on a model pretending to be data.
 */

const SYSTEM = `You are writing the summary paragraph of a property due-diligence report for a Singapore real estate site.

You will be given a completed analysis: a risk score, the checks that produced it, and the figure behind each one. Your job is ONLY to write connecting prose.

Hard rules:
- Never produce a number that is not already in the analysis. Do not estimate, extrapolate or round differently.
- Never state or imply what a property is worth. Never use "undervalued", "overvalued", "bargain", "best deal", "expert" or "specialist".
- Never say the score means the property is good or bad. It counts things worth checking.
- Where a check did not run, say plainly that it was not measured. Never imply that means there is no risk.
- Two short paragraphs maximum. Plain British English. No headings, no bullet points, no markdown.
- Write for an owner or buyer, not for an agent.`;

export async function POST(req) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Could not read that request.' }, { status: 400 }); }

  const { href, askPrice, areaSqft } = body || {};
  if (!href || typeof href !== 'string') {
    return NextResponse.json({ error: 'Choose a block or project first.' }, { status: 400 });
  }

  // 1 — the part that is not a model.
  const report = analyse({
    href,
    askPrice: Number(askPrice) || null,
    areaSqft: Number(areaSqft) || null,
  });
  if (report.error) return NextResponse.json(report, { status: 404 });

  // 2 — the part that is, and which the report survives without.
  let summary = null;
  if (configured.anthropic()) {
    const facts = {
      address: report.record.label,
      score: `${report.points} of a possible ${report.max}`,
      band: report.band,
      askingPsf: report.input.askingPsf,
      checksThatRan: report.checks.map(c => ({ check: c.title, points: `${c.points}/${c.max}`, finding: c.finding })),
      checksNotRun: report.skipped.map(s => s.title),
    };
    const out = await claude(SYSTEM, [{
      role: 'user',
      content: `Write the summary for this analysis.\n\n${JSON.stringify(facts, null, 2)}`,
    }]);
    if (out?.text) summary = out.text.trim();
    else if (out?.error) summary = null;
  }

  return NextResponse.json({
    ...report,
    summary,
    summaryAvailable: configured.anthropic(),
    // Said out loud in the payload so no client can present this as a valuation.
    disclaimer: 'This counts things worth checking. It is not a valuation, not advice, and not a verdict on the property. Every market figure names its source and period; price ranges come from the filed transactions shown.',
  });
}
