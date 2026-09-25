/**
 * What this reader looked at recently — on this device, and nowhere else.
 *
 * Shervin, 26 Sep: give people a reason to come back. The most ordinary one
 * is that the thing they were looking at yesterday is one tap away today. A
 * house hunt is a shortlist of four blocks revisited for weeks, and until now
 * every return started from an empty search box.
 *
 * localStorage, per CLAUDE.md's rule for it: a per-viewer convenience that
 * may come back empty (a private window, cleared data) and must never be
 * state anything depends on. Every read and write is wrapped. Nothing here is
 * sent anywhere — not to analytics, not to the CRM — and it holds only the
 * page address and its title, which the reader could see in their own history.
 */
const KEY = 'truestorey-recent';
const MAX = 8;

/* The pages worth coming back to: a home (block, project, street) or a tool.
   Index pages and articles are not a shortlist. */
const HOME = /^\/(hdb\/[^/]+\/[^/]+|condo\/[^/]+|landed\/[^/]+)$/;
const TOOL = /^\/(plan|cost|progressive|blindspot|compare|floors|floorplan|lease|land|yield|mop|map|market|neighbourhood)$/;

export function kindOf(pathname) {
  const p = String(pathname || '').split(/[?#]/)[0];
  if (HOME.test(p)) return 'home';
  if (TOOL.test(p)) return 'tool';
  return null;
}

export function readRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v)
      ? v.filter(x => x && typeof x.href === 'string' && x.href.startsWith('/') && typeof x.label === 'string').slice(0, MAX)
      : [];
  } catch { return []; }
}

export function remember({ href, label, kind }) {
  if (!href || !label || !kind) return;
  try {
    const next = [{ href, label: String(label).slice(0, 90), kind, at: Date.now() },
      ...readRecent().filter(x => x.href !== href)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* private window, storage full or blocked: nothing to remember */ }
}

export function forget() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
