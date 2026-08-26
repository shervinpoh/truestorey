/**
 * First-party analytics. No cookies, no IP, no fingerprinting.
 *
 * WHY NOT GOOGLE ANALYTICS
 * ------------------------
 * A site whose whole promise is "free, no sign-up, nothing leaves your browser"
 * cannot open with a cookie banner. Under PDPA a consent notice is required for
 * personal data, and third-party analytics with cookies and full IP is squarely
 * that. Everything below is deliberately non-personal, so no banner is needed
 * and nothing here is a PDPA data subject record:
 *
 *   · NO cookies — the session id lives in sessionStorage and dies with the tab
 *   · NO IP address stored, not even hashed
 *   · NO user agent, no screen fingerprint — only a coarse mobile/tablet/desktop
 *   · NO free-text from the lead form. Names, numbers and emails never come here
 *
 * The session id exists only to stitch one visit's steps into a funnel. It is
 * random per tab, meaningless on its own, and cannot be tied back to a person.
 *
 * If any of this ever changes, a consent notice becomes required. Do not add a
 * field here without asking whether it identifies someone.
 */

export const EVENTS = /** @type {const} */ ({
  VIEW:          'view',           // any page
  SEARCH:        'search',         // a query ran           { q, n }
  SEARCH_EMPTY:  'search_empty',   // a query found nothing { q }
  SEARCH_PICK:   'search_pick',    // a result was chosen   { q, href }
  RECORD:        'record',         // a block/project page  { href, kind }
  PROCEEDS:      'proceeds',       // the calculator moved  { href }
  LEAD_START:    'lead_start',     // first keystroke       { href }
  LEAD_SUBMIT:   'lead_submit',    // captured              { href, consent }
});

/** Funnel order for the stats report. */
export const FUNNEL = [
  { key: EVENTS.VIEW,       label: 'Visited a page' },
  { key: EVENTS.SEARCH,     label: 'Searched' },
  { key: EVENTS.RECORD,     label: 'Opened a block or project' },
  { key: EVENTS.PROCEEDS,   label: 'Used the proceeds calculator' },
  { key: EVENTS.LEAD_START, label: 'Started the form' },
  { key: EVENTS.LEAD_SUBMIT,label: 'Submitted' },
];

const MAX_STR = 120;

/** Whitelist. Anything not named here is dropped rather than stored. */
const ALLOWED = {
  [EVENTS.VIEW]:         ['p', 'd', 'r'],
  [EVENTS.SEARCH]:       ['q', 'n'],
  [EVENTS.SEARCH_EMPTY]: ['q'],
  [EVENTS.SEARCH_PICK]:  ['q', 'href'],
  [EVENTS.RECORD]:       ['href', 'kind'],
  [EVENTS.PROCEEDS]:     ['href'],
  [EVENTS.LEAD_START]:   ['href'],
  [EVENTS.LEAD_SUBMIT]:  ['href', 'consent'],
};

/**
 * Validate and strip an incoming event. Returns null if it should not be stored.
 * This is the boundary: anything the client sends that is not whitelisted here
 * never reaches disk, so an accidental extra field cannot leak personal data.
 */
export function sanitise(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const e = String(raw.e || '');
  const allowed = ALLOWED[e];
  if (!allowed) return null;

  const sid = String(raw.s || '').slice(0, 24).replace(/[^a-zA-Z0-9]/g, '');
  if (!sid) return null;

  const out = { t: new Date().toISOString(), e, s: sid };
  for (const k of allowed) {
    const v = raw[k];
    if (v == null) continue;
    if (typeof v === 'number') out[k] = Number.isFinite(v) ? v : 0;
    else if (typeof v === 'boolean') out[k] = v;
    else out[k] = String(v).slice(0, MAX_STR);
  }
  return out;
}
