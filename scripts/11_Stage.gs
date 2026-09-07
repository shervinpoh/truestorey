/*  ============================================================================
    11_Stage.gs - spread the follow-up queue over real days
    ----------------------------------------------------------------------------
    A ONE-OFF. Run stageFollowUps() once from the editor, read the log, then
    delete this file. It is additive and prefixed; it defines nothing that
    already exists and touches exactly one column.

    WHY THIS EXISTS
    600 contacts all carried the same stale Next Action Date, so the dashboard
    read "600 due . 23d over" every morning. A list nobody can finish is a list
    nobody opens, and the number stops meaning anything the first time it is
    ignored. Resetting them all to today would have produced "600 due today" -
    the same wall with a fresher label.

    So they are STAGED: ordered best-first, then dealt out PER_DAY at a time
    across consecutive days starting tomorrow. 600 at 25 a day is 24 days.

    WHAT IT DOES NOT TOUCH
    Last Contacted. 03_Engine.gs derives overdue, dormancy and the score factors
    from that field, so writing today into it for people who have not been
    contacted would make every one of those figures quietly wrong in the
    flattering direction - everyone freshly touched, nobody ever going cold.
    Next Action Date is a plan. Last Contacted is a record. Only the plan moves.

    PDPA Consent and DNC Checked are not touched either. Rule 5: DNC Checked
    reflects a real check or nothing.
    ============================================================================ */

/** How many to line up per day. 20-30 is a day's follow-ups; 25 is the middle. */
const STAGE_PER_DAY = 25;

/** Consecutive days, weekends included - a property agent works Saturdays.
 *  Set to true to deal them out Monday to Friday only. */
const STAGE_SKIP_WEEKENDS = false;

/** Ranking when scores tie, which they do when a batch is imported flat. */
const STAGE_STATUS_RANK = { hot: 0, warm: 1, 'new': 2, cold: 3, dormant: 4, converted: 9 };

function stageFollowUps() {
  const sheet = mustSheet_(TAB.CONTACTS);
  const data = readAll(TAB.CONTACTS);
  if (!data.rows.length) { Logger.log('No contacts.'); return; }

  /* Rows worth scheduling. A blank name is a spacer row and keeps whatever it
     had - which is why the write below carries existing values through. */
  const queue = [];
  data.rows.forEach(function (r, i) {
    if (!str_(val(r, data.cols, 'Full Name'))) return;
    if (/closed|converted/i.test(str_(val(r, data.cols, 'Stage')) + str_(val(r, data.cols, 'Lead Status')))) return;
    queue.push({
      i: i,
      score: num_(val(r, data.cols, 'Lead Score')),
      rank: STAGE_STATUS_RANK[str_(val(r, data.cols, 'Lead Status')).toLowerCase()],
      name: str_(val(r, data.cols, 'Full Name'))
    });
  });

  /* Best first: score, then status, then the order they were imported in, so
     two runs of this produce the same order rather than reshuffling the queue
     under someone who has started working through it. */
  queue.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    const ar = a.rank === undefined ? 5 : a.rank;
    const br = b.rank === undefined ? 5 : b.rank;
    if (ar !== br) return ar - br;
    return a.i - b.i;
  });

  /* Existing values carried through, so a row that is not in the queue keeps
     whatever date it had. writeCol_ writes the whole column in one call. */
  const cIdx = data.cols[key_('Next Action Date')];
  const values = data.rows.map(function (r) { return cIdx ? r[cIdx - 1] : ''; });

  const start = today_();
  let day = 0, placed = 0;
  const perDay = {};
  queue.forEach(function (q, n) {
    day = Math.floor(n / STAGE_PER_DAY);
    const d = stageDateAfter_(start, day + 1);
    values[q.i] = d;
    placed++;
    const k = Utilities.formatDate(d, TZ, 'dd MMM');
    perDay[k] = (perDay[k] || 0) + 1;
  });

  writeCol_(sheet, 'Next Action Date', values, 2);
  rebuildDashboard();

  const days = Object.keys(perDay);
  Logger.log('Staged ' + placed + ' contacts over ' + days.length + ' days, ' +
             STAGE_PER_DAY + ' a day, starting ' + days[0] + '.');
  Logger.log('First five days: ' + days.slice(0, 5).map(function (k) {
    return k + ' (' + perDay[k] + ')';
  }).join(' . '));
  Logger.log('Last day: ' + days[days.length - 1] + ' (' + perDay[days[days.length - 1]] + ')');
}

/**
 * n days after `from`, counting only the days that are dealt out. Returns a
 * real Date at midnight, never a formatted string - 00_Core.gs records what
 * storing "14/05/2026" as text did to every day-count in the project.
 */
function stageDateAfter_(from, n) {
  const d = new Date(from.getTime());
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (STAGE_SKIP_WEEKENDS && (d.getDay() === 0 || d.getDay() === 6)) continue;
    added++;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Read-only. Prints what stageFollowUps would do, and writes nothing. */
function stageFollowUpsPreview() {
  const data = readAll(TAB.CONTACTS);
  let n = 0;
  data.rows.forEach(function (r) {
    if (!str_(val(r, data.cols, 'Full Name'))) return;
    if (/closed|converted/i.test(str_(val(r, data.cols, 'Stage')) + str_(val(r, data.cols, 'Lead Status')))) return;
    n++;
  });
  const days = Math.ceil(n / STAGE_PER_DAY);
  Logger.log(n + ' contacts would be staged at ' + STAGE_PER_DAY + ' a day = ' +
             days + ' days, ' + Utilities.formatDate(stageDateAfter_(today_(), 1), TZ, 'EEE dd MMM') +
             ' through ' + Utilities.formatDate(stageDateAfter_(today_(), days), TZ, 'EEE dd MMM') + '.');
  Logger.log('Nothing was written. Run stageFollowUps() to apply it.');
}
