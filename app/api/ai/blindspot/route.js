import { NextResponse } from 'next/server';
import { analyse } from '../../../../lib/blindspot/analyse.js';
import { recordByHref } from '../../../../lib/data/query.js';
import { unitDetailError } from '../../../../lib/blindspot/unit.js';
import { summarise } from '../../../../lib/blindspot/summary.js';

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

export async function POST(req) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Could not read that request.' }, { status: 400 }); }

  const { href, askPrice, areaSqft, floor, flatType, bedrooms } = body || {};
  if (!href || typeof href !== 'string') {
    return NextResponse.json({ error: 'Choose a block or project first.' }, { status: 400 });
  }
  const rec = recordByHref(href);
  if (!rec) return NextResponse.json({ error: 'No record at that address.' }, { status: 404 });
  const unitError = unitDetailError(rec, { flatType, bedrooms });
  if (unitError) return NextResponse.json({ error: unitError }, { status: 400 });

  // 1 — the part that is not a model.
  const report = analyse({
    href,
    askPrice: Number(askPrice) || null,
    areaSqft: Number(areaSqft) || null,
    floor: Number(floor) || null,
    flatType: rec.kind === 'HDB' ? flatType : null,
    bedrooms: rec.kind === 'HDB' ? null : Number(bedrooms),
  });
  if (report.error) return NextResponse.json(report, { status: 404 });

  // 2 — the paragraph, assembled from the report rather than written by a
  // model. See lib/blindspot/summary.js for why: the model's version printed
  // figures the score did not contain.
  const summary = summarise(report);

  return NextResponse.json({
    ...report,
    summary,
    summaryAvailable: Boolean(summary),
    // Said out loud in the payload so no client can present this as a valuation.
    disclaimer: 'This counts things worth checking. It is not a valuation, not advice, and not a verdict on the property. Every market figure names its source and period; price ranges come from the filed transactions shown.',
  });
}
