/**
 * Policy watch.
 *
 * WHY THERE IS NO RSS HERE
 * ------------------------
 * The first version of this fetched RSS from URA, HDB, MND and MAS. Checked on
 * 22 Aug 2026: URA 404, MND 404, HDB 403, MAS returned something that was not a
 * feed. Those agencies publish HTML press-release listings, not RSS. Scraping
 * them would be fragile, would break silently, and would tempt reproducing text
 * that must never be reproduced.
 *
 * So this does two better things instead:
 *
 *  1. A TRIPWIRE on the rates. Cooling measures are the announcements that
 *     actually matter here, and their effect is entirely captured by
 *     lib/calc/constants.js. If a measure lands and the constants are not
 *     updated, every calculator on the site is silently wrong — which is far
 *     worse than missing a headline. So the brief nags when the rates have not
 *     been verified recently.
 *
 *  2. A CHECKLIST of the pages worth eyeballing, with direct links. Two minutes
 *     of human attention, and it never breaks.
 *
 * If a working feed is ever found, add it to FEEDS and the machinery in
 * brief.mjs picks it up. Empty by default, deliberately.
 */

/** Verified working feeds only. Empty until one is actually confirmed. */
export const FEEDS = [];

/** Days after which the rates should be re-verified. */
export const RATES_STALE_DAYS = 30;

/** Pages to eyeball. Links only — never fetched, never reproduced. */
export const SOURCES = [
  { name: 'IRAS — stamp duty rates (BSD / ABSD / SSD)',
    url: 'https://www.iras.gov.sg/taxes/stamp-duty/for-property' },
  { name: 'MND — press releases',
    url: 'https://www.mnd.gov.sg/newsroom/press-releases' },
  { name: 'HDB — press releases',
    url: 'https://www.hdb.gov.sg/about-us/news-and-publications/press-releases' },
  { name: 'URA — media releases',
    url: 'https://www.ura.gov.sg/Corporate/Media-Room/Media-Releases' },
  { name: 'MAS — media releases',
    url: 'https://www.mas.gov.sg/news' },
  { name: 'CPF — interest rates',
    url: 'https://www.cpf.gov.sg/member/growing-your-savings/earning-attractive-interest' },
];

const daysSince = iso => Math.floor((Date.now() - new Date(iso + 'T00:00:00Z')) / 86400000);

/**
 * Returns the policy-watch section as an array of markdown lines.
 * `reviewed` is RATES_REVIEWED from lib/calc/constants.js.
 */
export function policyWatch(reviewed) {
  const L = ['## Policy watch', ''];
  const age = reviewed ? daysSince(reviewed) : null;

  if (age == null) {
    L.push('**RATES_REVIEWED is not set in lib/calc/constants.js.** Set it to today once you have checked the rates.', '');
  } else if (age > RATES_STALE_DAYS) {
    L.push(
      `**⚠ Rates last verified ${age} days ago (${reviewed}).**`,
      '',
      'A cooling measure since then would make every calculator on this site silently wrong,',
      'and wrong arithmetic presented with a source line is worse than no arithmetic at all.',
      '',
      'Check the stamp duty page first, then update `lib/calc/constants.js`, bump `RATES_REVIEWED`,',
      'and run `npm test` — the rate tests are there to catch a bad edit.',
      ''
    );
  } else {
    L.push(`Rates verified ${age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`} (${reviewed}). Next check due around day ${RATES_STALE_DAYS}.`, '');
  }

  L.push('### Worth two minutes', '');
  for (const s of SOURCES) L.push(`- [${s.name}](${s.url})`);
  L.push('', '_Read the source, then write your own take. Never reproduce it._', '');
  return L;
}
