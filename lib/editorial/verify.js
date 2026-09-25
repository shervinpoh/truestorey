/**
 * What a draft must pass before it may be filed. Code, not a prompt.
 *
 * ── WHY EACH OF THESE EXISTS ───────────────────────────────────────────────
 * The notes published before 26 Sep were written to a prompt that said "never
 * invent a number" and "write as him". They obeyed the first by containing no
 * numbers at all, and the second by inventing him: "I have watched couples…",
 * twice in each of two published pieces, under a CEA registration. A prompt is
 * a request. These are the rules.
 *
 *   numbers     every number in the text is in the pack, as the pack writes
 *               it. A difference, an average or a rounding the pack does not
 *               hold is a new figure, and a model does not assign figures.
 *   person      no first person and no invented experience. The desk has
 *               none, and the page says the desk wrote it.
 *   language    lib/compliance.js — the same list the publish button applies.
 *   currency    S$, never a bare $.
 *   publishers  rule 9: no other outlet named as a source.
 *   distance    rule 10: no walking time, no distance.
 *   links       only the pack's own pages and its primary source.
 *   shape       a title and dek that fit, a body of the length asked for.
 *
 * verify() returns the problems as sentences the writer can act on, because
 * the first failure is handed back to it for one more attempt.
 */
import { scanLanguage, EXPERIENCE } from '../compliance.js';
import { allowedNumbers, numbersIn } from './figures.js';

const plain = html => String(html || '')
  .replace(/<a\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/* Case matters: "I" is always the first person; "US" is a country and "us"
   is not. The experience patterns catch the third-person dodge as well — "a
   buyer told", "clients often" — which is the same invention with the
   pronoun removed. */
const FIRST_PERSON = /\b(?:I|I'm|I've|I'd|I'll|[Mm]e|[Mm]y|[Mm]ine|[Mm]yself|[Ww]e|[Ww]e're|[Ww]e've|[Oo]ur|[Oo]urs|us)\b/;
const PUBLISHERS = /\b(?:straits times|business times|edgeprop|stacked(?: homes)?|propertyguru|99\.co|mothership|channel newsasia|\bCNA\b|today online|the edge)\b/i;
const DISTANCE = /\b\d+\s*(?:-|to)?\s*\d*\s*(?:min(?:ute)?s?)\b(?:[^.]{0,20}\b(?:walk|drive|away))|\bwalking distance\b|\b\d+(?:\.\d+)?\s*(?:m|km|metres?|kilometres?)\s+(?:from|to|away)\b/i;

export function verify(draft, pack, { minWords = 450, maxWords = 1400 } = {}) {
  const problems = [];
  const title = String(draft?.title || '').trim();
  const dek = String(draft?.dek || '').trim();
  const body = String(draft?.content_html || '');
  const text = plain(body);
  const all = `${title} ${dek} ${text}`;

  if (!title) problems.push('There is no title.');
  if (title.length > 80) problems.push(`The title is ${title.length} characters; it must be under 70.`);
  if (/:\s/.test(title)) problems.push('The title uses a colon subtitle. Make it one line.');
  if (!dek) problems.push('There is no dek.');
  if (dek.length > 200) problems.push(`The dek is ${dek.length} characters; keep it under 170.`);

  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < minWords) problems.push(`The body is ${words} words; it needs at least ${minWords}.`);
  if (words > maxWords) problems.push(`The body is ${words} words; keep it under ${maxWords}.`);
  if (!body.includes('{{NUMBERS}}')) problems.push('{{NUMBERS}} is missing. Put it on its own line after the opening paragraph.');
  if ((body.match(/<h2/gi) || []).length < 3) problems.push('Use at least three <h2> subheads.');
  if (/<h1/i.test(body)) problems.push('Do not use <h1>.');

  const allowed = allowedNumbers(pack);
  const stray = [...new Set(numbersIn(all.replace(/\{\{(NUMBERS|CHART)\}\}/g, '')))].filter(n => !allowed.has(n));
  if (stray.length) {
    problems.push(`These numbers are not in the pack: ${stray.join(', ')}. Remove them, or use the pack's figure written exactly as the pack writes it. Write any comparison in words.`);
  }

  const fp = FIRST_PERSON.exec(all);
  if (fp) problems.push(`First person ("${fp[0]}") is not allowed. The desk has no voice of its own and no experiences; rewrite the sentence around the reader or the figure.`);
  const ex = EXPERIENCE.exec(all);
  if (ex) problems.push(`"${ex[0]}" describes an experience nobody had. Remove it.`);

  for (const hit of scanLanguage(all)) problems.push(`"${hit.found}" is not allowed: ${hit.why}`);
  if (/(?<![S\w])\$\s?\d/.test(all)) problems.push('Money must be written S$1,234, never a bare $.');
  /* The writer's own materials are invisible to a reader. The first live
     draft said "higher than the other Bedok awards in the pack". */
  const leak = /\b(?:the|this|in the) pack\b|\bfigures? (?:given|provided)\b|\bprovided (?:data|figures)\b|\bas the caveat (?:above|says)\b/i.exec(all);
  if (leak) problems.push(`"${leak[0]}" refers to your materials, which a reader never sees. Say where the figure comes from instead.`);
  const pub = PUBLISHERS.exec(all);
  if (pub) problems.push(`Do not name ${pub[0]}. The only sources are the pack's.`);
  const dist = DISTANCE.exec(all);
  if (dist) problems.push(`"${dist[0]}" is a walking time or distance, which the site never states.`);

  const hrefs = [...body.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map(m => m[1]);
  const okLinks = new Set([...(pack.links || []).map(l => l.href), pack.source?.url].filter(Boolean));
  const badLinks = hrefs.filter(h => !okLinks.has(h));
  if (badLinks.length) problems.push(`Only the pack's links may be used. Remove: ${badLinks.join(', ')}.`);
  const siteLinks = (pack.links || []).filter(l => hrefs.includes(l.href));
  if ((pack.links || []).length && !siteLinks.length) problems.push(`Link ${pack.links[0].label} (${pack.links[0].href}) once, by name.`);

  return { ok: problems.length === 0, problems, words };
}
