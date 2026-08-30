/**
 * Turning a retrieval answer into something a page can render.
 *
 * WHY THIS EXISTS. The tracker was printing the model's raw output straight
 * into paragraphs, so a reader got `**East Coast**` with the asterisks showing
 * and `[2][3][15]` trailing every sentence. Those brackets are not noise — they
 * are the citation indices into the sources array — but as bare text they read
 * as a bug, and on a site whose whole argument is that every claim is checkable
 * they were pointing at nothing. Here they become links.
 *
 * NO MARKDOWN LIBRARY, AND NO HTML. Three npm dependencies is the architecture.
 * More importantly this parser emits *tokens*, and the renderer turns those
 * into React elements — never a string of HTML. There is no innerHTML anywhere
 * in the path, so model output cannot inject markup no matter what comes back.
 * That is a stronger guarantee than sanitising would be, and `lib/sanitize.js`
 * exists precisely because sanitising is the hard way to get it.
 *
 * EVERYTHING HERE IS STREAM-SAFE. It runs on every delta, so it sees text
 * mid-word, mid-`**`, and mid-marker. Half-written syntax is swallowed rather
 * than shown, because a reader watching `**Eas` appear is watching the bug the
 * user reported, one frame at a time.
 */

/* The model ends with a machine-readable trailer instead of offering choices in
 * prose. Written `**FOLLOW-UPS:**` about half the time, hence the loose shape. */
const TRAILER = /(?:^|\n)[ \t]*\**[ \t]*FOLLOW[- ]?UPS?[ \t]*\**[ \t]*:[ \t]*/i;

/* The same trailer, half-typed, at the very end of a stream. Three characters
 * minimum: "FOL" is not a word anyone starts a paragraph with, "F" is. */
const TRAILER_PARTIAL = /\n[ \t]*\**[ \t]*(?:FOL|FOLL|FOLLO|FOLLOW|FOLLOW-|FOLLOW-U|FOLLOW-UP|FOLLOW-UPS)[ \t]*:?[ \t]*$/i;

/* A question outside Singapore is refused with this, not answered. See the
 * route's RULE 1 — the model returns the line, the page renders the refusal. */
const OFF = /^[ \t]*\**[ \t]*OFF-ISLAND[ \t]*\**[ \t]*:[ \t]*(.*)$/im;

/**
 * Split a raw answer into the three things a page needs.
 *
 * Returns { offIsland, body, followUps }. `offIsland` is the clause naming what
 * was asked about, or null. `followUps` are complete questions, ready to ask.
 */
export function splitAnswer(raw) {
  const text = String(raw || '');

  const off = OFF.exec(text);
  if (off) return { offIsland: off[1].trim().replace(/\*\*/g, '') || 'that', body: '', followUps: [] };

  // Guard the half-typed marker too: "OFF-ISLAN" arriving mid-stream must not
  // flash the first half of a refusal as though it were an answer.
  if (/^[ \t]*\**[ \t]*OFF-?I(?:S|SL|SLA|SLAN|SLAND)?[ \t]*:?[ \t]*$/i.test(text.trim())) {
    return { offIsland: null, body: '', followUps: [] };
  }

  const cut = TRAILER.exec(text);
  let body = cut ? text.slice(0, cut.index) : text;
  let followUps = [];

  if (cut) {
    followUps = text
      .slice(cut.index + cut[0].length)
      .split('\n')[0]
      .split('|')
      .map(s => s.trim().replace(/\*\*/g, '').replace(/^[-–—\d.)\s]+/, '').trim())
      // A fragment shorter than this is the trailer still arriving, not a
      // question. Rendering it as a chip means offering a click that asks
      // something incoherent.
      .filter(s => s.length >= 12);
  } else {
    body = body.replace(TRAILER_PARTIAL, '');
  }

  return { offIsland: null, body: trimDangling(body), followUps: followUps.slice(0, 4) };
}

/* A stream ends mid-syntax constantly. Drop the opener that has no closer yet
 * rather than print it. */
function trimDangling(s) {
  return s.replace(/\*{1,2}$/, '').replace(/\[\d{0,2}$/, '').replace(/\s+$/, '');
}

/** Which sources the prose actually cites, in the order first cited, 1-based. */
export function citedIndexes(text) {
  const seen = [];
  for (const m of String(text || '').matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (n > 0 && !seen.includes(n)) seen.push(n);
  }
  return seen;
}

/*
 * One pass, one regex, and the order of the alternatives is the whole of the
 * precedence rule. `[Katong](https://…)` must be tried before `[3]`, and `**`
 * before `*`, or bold comes back as two italics wrapped around nothing.
 */
const INLINE = new RegExp([
  /\*\*([^*\n]+)\*\*/,                       // bold
  /__([^_\n]+)__/,                           // bold, the other spelling
  /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/,  // link
  /\[(\d{1,2})\]/,                           // citation → a link to source n
  /`([^`\n]+)`/,                             // code
  /\*([^*\n]+)\*/,                           // italic
  /_([^_\n]+)_/,                             // italic, the other spelling
].map(r => r.source).join('|'), 'g');

/**
 * A line of prose as tokens: text, bold, italic, code, link, cite.
 *
 * Leftover `**` in a text run can only be an opener whose closer never came, so
 * it is dropped. That is the difference between a reader seeing emphasis and a
 * reader seeing asterisks.
 */
export function parseInline(line) {
  const out = [];
  const push = s => {
    const v = s.replace(/\*\*/g, '').replace(/__/g, '');
    if (v) out.push({ t: 'text', v });
  };

  let last = 0;
  INLINE.lastIndex = 0;
  for (let m; (m = INLINE.exec(line));) {
    if (m.index > last) push(line.slice(last, m.index));
    const [, b1, b2, linkText, href, cite, code, i1, i2] = m;
    if (b1 || b2) out.push({ t: 'b', v: b1 || b2 });
    else if (href) out.push({ t: 'link', v: linkText, href });
    else if (cite) out.push({ t: 'cite', n: Number(cite) });
    else if (code) out.push({ t: 'code', v: code });
    else if (i1 || i2) out.push({ t: 'i', v: i1 || i2 });
    last = m.index + m[0].length;
  }
  if (last < line.length) push(line.slice(last));
  return out;
}

const H = /^\s{0,3}(#{1,6})\s+(.*)$/;
const UL = /^\s*[-*•]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;
const ROW = /^\s*\|(.*)\|\s*$/;
const RULE = /^\s*\|?[\s|:-]*-{2,}[\s|:-]*\|?\s*$/;

/**
 * Blocks: paragraphs, headings, lists and tables.
 *
 * Tables are here because sonar reaches for one on any comparison and a raw
 * `| Town | Median |` grid is the single ugliest thing this component can
 * print. Consecutive plain lines join into one paragraph — the model breaks
 * lines inside a thought and only a blank line means a new one.
 */
export function parseBlocks(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  let para = [];

  const flush = () => {
    if (!para.length) return;
    out.push({ kind: 'p', spans: parseInline(para.join(' ')) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) { flush(); continue; }

    const h = H.exec(line);
    if (h) { flush(); out.push({ kind: 'h', spans: parseInline(h[2]) }); continue; }

    if (ROW.test(line) && !RULE.test(line)) {
      flush();
      const cells = l => ROW.exec(l)[1].split('|').map(c => parseInline(c.trim()));
      const head = cells(line);
      const rows = [];
      let j = i + 1;
      if (j < lines.length && RULE.test(lines[j])) j++;
      while (j < lines.length && ROW.test(lines[j]) && !RULE.test(lines[j])) rows.push(cells(lines[j++]));
      out.push({ kind: 'table', head, rows });
      i = j - 1;
      continue;
    }

    const list = UL.exec(line) ? 'ul' : OL.exec(line) ? 'ol' : null;
    if (list) {
      flush();
      const items = [];
      let j = i;
      const re = list === 'ul' ? UL : OL;
      for (; j < lines.length; j++) {
        const m = re.exec(lines[j]);
        if (!m) break;
        items.push(parseInline(m[1]));
      }
      out.push({ kind: list, items });
      i = j - 1;
      continue;
    }

    para.push(line.trim());
  }
  flush();
  return out;
}
