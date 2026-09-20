/**
 * What a client may see.
 *
 * ── WHY THIS IS DEFAULT-DENY ──────────────────────────────────────────────
 * Client-safe mode used to strip exactly one thing: the AVM's point estimate.
 * Everything else the report had grown since — the over/under verdict, the
 * good-buy score, the hold-period outlook, the REALIS stack premium — went
 * out in full, because each was added to the report object and nothing made
 * anyone decide about it. Both export paths serialise the RENDERED PAGE
 * ("Export as PDF" prints it, "Download this report" writes its innerHTML),
 * so a leak here is not a JSON curiosity. It is a PDF in a client's inbox.
 *
 * So the rule is inverted: a key is withheld unless it is listed as visible,
 * and test/redact.test.js fails when a report key appears in neither list.
 * Adding a feature to the report now forces a decision about who may read it,
 * at the moment the feature is written, by a test rather than by memory.
 *
 * ── WHY EACH WITHHELD THING IS WITHHELD ───────────────────────────────────
 * - residual, score, outlook: speculative. They are the analyst's working,
 *   not a finding, and a client reading "undervalued" on a page with a
 *   registration number at the bottom is a CEA PG 02-11 s3.1 problem and a
 *   rule-7 problem at once. These are for the agent, and reach the client as
 *   the agent's own words or not at all.
 * - stack: not speculative — filed transactions — but REALIS is licensed for
 *   personal research and not for commercial use (PG 02-11 s6). Putting a
 *   stack table in a client deliverable is precisely the commercial use the
 *   licence excludes, however sound the arithmetic.
 *
 * What survives is the band, its evidence and its measured error: what
 * comparable homes actually transacted at, and how often an estimate built
 * this way has missed. That is a defensible thing to hand someone.
 */

/** Keys a client-safe report may carry. Everything else is dropped. */
export const CLIENT_VISIBLE = new Set([
  'record',      // which home this is
  'input',       // what was keyed in
  'estimate',    // the band only — the point is stripped by clientSafe()
  'clientSafe',  // the flag itself, so the footer can say so
  'generatedAt',
  'withheld',    // the list below, so the page can state what is missing
]);

/**
 * Keys deliberately withheld, with the label the page shows for each. Listed
 * rather than merely absent so that "we removed four things" is renderable —
 * silent truncation reads as completeness, and a client-safe report that
 * looks identical to a full one is one nobody trusts the mode of.
 */
export const CLIENT_WITHHELD = {
  residual: 'Whether the asking price is above or below the estimate',
  score: 'The positive-factor score',
  outlook: 'The hold-period outlook',
  stack: 'The stack premium (REALIS — licensed for research, not for client use)',
};

export function redact(report) {
  const out = {};
  const withheld = [];
  for (const [k, v] of Object.entries(report)) {
    if (CLIENT_VISIBLE.has(k)) { out[k] = v; continue; }
    /* Only name what was actually there. A report run without an asking
       price has no residual to withhold, and saying otherwise implies a
       finding was suppressed when none was made. */
    if (CLIENT_WITHHELD[k] && v != null) withheld.push(CLIENT_WITHHELD[k]);
  }
  out.withheld = withheld;
  out.clientSafe = true;
  return out;
}
