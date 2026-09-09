/**
 * Is this a path we are willing to send a reader back to?
 *
 * `from` arrives in the query string, which means anyone can put anything in
 * it. An unchecked value renders a link to wherever an attacker chose, on a
 * page carrying a CEA registration number — a phishing hop with this site's
 * name on it, which is a worse outcome than the missing link it was added to
 * fix.
 *
 * Only a same-origin path to a RECORD is accepted. Not a tool, not an article:
 * the link says "back to the property" and must not point at something that is
 * not one. Rejected values render nothing, which is the same answer as not
 * having come from anywhere.
 *
 * In lib/ rather than beside the component because node:test cannot import a
 * .jsx file — Node does not strip JSX, and this repo will not add a transform
 * to test one validator.
 */
const RECORD = /^\/(hdb|condo|landed)\/[a-z0-9-]+(\/[a-z0-9-]+)?$/i;

export function safeFrom(raw) {
  const s = String(raw || '');
  /* A leading "//" is protocol-relative and leaves the site; a backslash is
     read as a slash by some parsers and is never in one of our paths. */
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\')) return null;
  const path = s.split('?')[0].split('#')[0];
  return RECORD.test(path) ? path : null;
}
