/*  ============================================================================
    12_Brief.gs - the morning brief, from filed figures instead of memory
    ----------------------------------------------------------------------------
    ADDITIVE. Nothing here is redefined; it uses the project's own send_,
    setting_, str_ and aiCall_. One line changes in 07_Bot.gs, at the bottom.

    WHAT IT REPLACES
    /brief asked a model to write a Singapore market brief out of nothing. It
    complied, and then said so:

        "Note: I don't have live market feeds - this brief uses general
         knowledge/trends through my training data, not real-time URA/HDB
         caveats or Sep 2026 transactions."

    underneath a paragraph asserting resale prices had "continued their grind
    upward (historically 1-2% QoQ)". No source, no period, nothing to check,
    going out under a CEA registration number. CEA PG 02-11 s3.1 requires a
    market claim to be substantiated, and the site holds every figure that
    brief was reaching for.

    HOW IT WORKS NOW
    truestorey.vercel.app/api/brief returns the figures with their periods and
    agencies. The model writes prose AROUND numbers that are already fixed and
    is told it may not add one. The source line underneath is assembled by THIS
    CODE from the same payload, so it is right whatever the model does - the
    one part of the message a model cannot get wrong.

    Same arrangement as Blindspot, and the same reason it is allowed to exist:
    a language model never assigns a number.
    ============================================================================ */

function briefSite_() {
  return String(setting_('Truestorey Site URL', 'https://truestorey.vercel.app')).replace(/\/$/, '');
}

/** The figures, or null. A failed fetch is reported, never silently skipped. */
function briefFigures_() {
  try {
    const res = UrlFetchApp.fetch(briefSite_() + '/api/brief', { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      Logger.log('brief: HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
      return null;
    }
    return JSON.parse(res.getContentText());
  } catch (err) {
    Logger.log('brief: ' + err);
    return null;
  }
}

/** One line per figure, in the order a reader would want them. */
function briefLines_(d) {
  const out = [];
  (d.figures || []).forEach(function (f) {
    let s = f.what + ': ' + f.value;
    if (f.yoy !== null && f.yoy !== undefined) s += ', ' + (f.yoy > 0 ? '+' : '') + f.yoy + '% year on year';
    if (f.qoq !== null && f.qoq !== undefined) s += ', ' + (f.qoq > 0 ? '+' : '') + f.qoq + '% quarter on quarter';
    s += ' (' + f.period + ', ' + f.source + ')';
    out.push(s);
  });
  if (d.mop && d.mop.thisYear) {
    const t = d.mop.thisYear;
    out.push('Flats reaching MOP in ' + t.year + ': ' + t.units + ' units across ' + t.blocks +
             ' blocks, largest in ' + t.topTowns.map(function (x) { return x.town; }).join(', ') +
             ' (' + d.mop.source + '). ' + d.mop.caveat);
    if (d.mop.nextYear) out.push('Reaching MOP in ' + d.mop.nextYear.year + ': ' + d.mop.nextYear.units + ' units.');
  }
  if (d.gls && d.gls.latestAward) {
    const g = d.gls.latestAward;
    out.push('Most recent GLS award: ' + g.site + ' on ' + g.date + ', ' + g.bids +
             ' bid' + (g.bids === 1 ? '' : 's') + ', won by ' + g.winner + ' (' + d.gls.source + ').');
  }
  if (d.transactions && d.transactions.hdb) {
    out.push('Filed transactions on the site cover ' + d.transactions.hdb.from + ' to ' +
             d.transactions.hdb.to + ' for HDB and ' + d.transactions.private.from + ' to ' +
             d.transactions.private.to + ' for private.');
  }
  return out;
}

var BRIEF_SYSTEM =
  'You write a morning brief for Shervin, a CEA-licensed residential property agent in Singapore. ' +
  'It is read on a phone before work.\n\n' +
  'THE ONLY NUMBERS YOU MAY USE ARE THE ONES IN FIGURES. You may not add, estimate, ' +
  'round differently, annualise, extrapolate or recall any other number. If you want to say ' +
  'something you have no figure for, say it in words with no number attached, or leave it out. ' +
  'Writing a number that is not in FIGURES makes the brief unpublishable.\n\n' +
  'Write the period beside any figure you use - the quarter or the date. Do not repeat the ' +
  'agency name in the prose; a source line is added underneath by the sender.\n\n' +
  'STRUCTURE, under 180 words total:\n' +
  '*What moved* - the one comparison that matters this morning, in two sentences.\n' +
  '*What it means for a conversation today* - one thing he can actually say to a client, ' +
  'grounded in a figure above.\n\n' +
  'RULES:\n' +
  '- Never say undervalued, best deal, expert, specialist, hot market or must buy.\n' +
  '- Never predict what prices will do. You may say what HAS happened, with its period.\n' +
  '- Never cite or recommend REALIS. It is licensed for personal research only, not for ' +
  'commercial use (CEA PG 02-11 s6).\n' +
  '- An index level is not a price. Do not convert one into dollars.\n' +
  '- MOP eligibility is not an intention to sell. Do not describe it as incoming supply.\n' +
  '- British spelling. No preamble, no sign-off, no emoji beyond the two section markers.';

function botMarketBriefLive(to) {
  const d = briefFigures_();
  if (!d) {
    return send_(to, '*Morning brief*\n_' + fmtDate_(today_()) + '_\n\n' +
      'Could not read the figures from truestorey just now, so there is no brief this morning. ' +
      'Nothing else is affected. The site is at ' + briefSite_() + '/market if you want them directly.');
  }

  const lines = briefLines_(d);
  if (!lines.length) {
    return send_(to, '*Morning brief*\n_' + fmtDate_(today_()) + '_\n\nNo figures could be read this morning.');
  }

  const prose = aiCall_({
    system: BRIEF_SYSTEM,
    messages: [{ role: 'user', content: 'FIGURES\n' + lines.join('\n') }],
    maxTokens: 900
  });

  /* The source line is built here, not by the model. Rule 6 is then true of
     every brief regardless of what the model wrote or forgot. */
  const sources = {};
  (d.figures || []).forEach(function (f) { sources[f.source] = f.period; });
  const cited = Object.keys(sources).map(function (s) { return s + ' (' + sources[s] + ')'; });

  let m = '*Morning brief*\n_' + fmtDate_(today_()) + '_\n\n';
  m += prose ? prose : 'The writer did not respond. The figures are below, unwritten.\n\n' + lines.join('\n\n');
  m += '\n\n_Sources: ' + cited.join(' . ') + '_';
  if (d.missing && d.missing.length) {
    /* Named, not dropped. Silent truncation reads as completeness, and the
       mortgage rate going missing is exactly the sort of gap that matters. */
    m += '\n_Not read this morning: ' + d.missing.join('; ') + '._';
  }
  send_(to, m);
}

//  ===========================================================================
//  THE ONE HOOK - in 07_Bot.gs, handleCommand_
//
//    if (lower === '/brief')  return botMarketBrief(from);
//
//  becomes
//
//    if (lower === '/brief')  return botMarketBriefLive(from);
//
//  The old botMarketBrief stays where it is, unreferenced, so reverting is one
//  word. Delete it once the new one has run for a week.
//  ===========================================================================
