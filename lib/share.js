/**
 * A calculator result as a link.
 *
 * ── THE FIGURES GO AFTER THE #, NEVER IN THE QUERY STRING ──────────────────
 * What a reader types into /cost is the price they paid, the month they bought,
 * their citizenship, how much CPF they used and, optionally, which home. Put
 * those in a query string and every one of them lands in the hosting
 * provider's request log the moment the link is opened, and travels onward in
 * a Referer header from any page that does not suppress it. With a named home
 * and a purchase month, that is enough to find one household's filed sale.
 *
 * A fragment is never sent to a server by a browser. So a shared result is
 * stored nowhere this site can see: not in Vercel's logs, not in the analytics
 * table (Track.jsx records the pathname only), not in a referrer. The cost is
 * that a link preview in a chat app cannot show the figures, because the
 * crawler that renders it never receives them either. That is the right side
 * of the trade for figures that can identify a household.
 *
 * ── A LINK IS UNTRUSTED INPUT ──────────────────────────────────────────────
 * Anyone can type anything after a #. Every field is validated against the
 * schema; a value that fails is DROPPED and named in `dropped`, so the page can
 * say which figures came from the link and which are its own defaults, rather
 * than silently computing a different question from the one that was sent.
 * Nothing is clamped: a clamped value is a figure the sender never typed.
 *
 * ── THE VERSION IS WHAT MAKES IT A LINK AT ALL ─────────────────────────────
 * Pages already use # for anchors (#mop, #transactions). A fragment without
 * `v=` is an anchor and decodes to null. A future change to what a field means
 * bumps `v`, and an old link then says it cannot be read rather than
 * reproducing a different answer under the same numbers.
 */

const HREF = /^\/(hdb|condo|landed)\/[a-z0-9-]+(\/[a-z0-9-]+)?$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function read(spec, raw) {
  if (raw == null || raw === '') return undefined;
  switch (spec.kind) {
    case 'int': {
      if (!/^-?\d+$/.test(raw)) return undefined;
      const n = Number(raw);
      return Number.isSafeInteger(n) && n >= spec.min && n <= spec.max ? n : undefined;
    }
    case 'num': {
      if (!/^-?\d+(\.\d+)?$/.test(raw)) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) && n >= spec.min && n <= spec.max ? n : undefined;
    }
    case 'month':
      return MONTH.test(raw) && raw >= spec.min && raw <= spec.max ? raw : undefined;
    case 'enum':
      return spec.values.includes(raw) ? raw : undefined;
    case 'href':
      return HREF.test(raw) ? raw : undefined;
    case 'text': {
      // Rendered by React as text, so this is not about markup. It is about a
      // label that could carry a line break or a control character into a
      // heading, or run long enough to break the layout.
      const t = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
      return t && t.length <= spec.max ? t : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Fields the page holds, as a fragment. Unset optional fields are left out, and
 * so is anything the decoder would refuse — a field typed as "3.60" or held as
 * a number is normalised first — so a link always opens to what it was made
 * from, and never announces on arrival that its own sender's figure was bad.
 */
export function encodeShare(schema, values) {
  const p = new URLSearchParams();
  p.set('v', String(schema.v));
  for (const [key, spec] of Object.entries(schema.fields)) {
    let v = values[key];
    if (v == null || v === '') continue;
    if (spec.kind === 'int' || spec.kind === 'num') {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      v = spec.kind === 'int' ? Math.round(n) : Math.round(n * 10000) / 10000;
    }
    const s = String(v);
    if (read(spec, s) === undefined) continue;
    p.set(key, s);
  }
  return p.toString();
}

/**
 * @returns null when the fragment is not a share link for this schema (an
 *   anchor, an empty hash, another version); otherwise { values, dropped },
 *   where `values` holds only what validated.
 */
export function decodeShare(schema, hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw.includes('=')) return null;
  let p;
  try { p = new URLSearchParams(raw); } catch { return null; }
  if (p.get('v') !== String(schema.v)) return null;
  const values = {}, dropped = [];
  for (const [key, spec] of Object.entries(schema.fields)) {
    if (!p.has(key)) continue;
    const v = read(spec, p.get(key));
    if (v === undefined) dropped.push(key);
    else values[key] = v;
  }
  return { values, dropped };
}

/**
 * /cost. Bounds are wide on purpose — they reject what cannot be a purchase,
 * not what is unusual. A S$30m price is rare; a negative one is not a price.
 */
export const COST_SHARE = {
  tool: 'cost',
  v: 1,
  fields: {
    price:      { kind: 'int', min: 1, max: 100_000_000 },
    bought:     { kind: 'month', min: '1960-01', max: '2036-12' },
    type:       { kind: 'enum', values: ['HDB', 'EC_DEVELOPER', 'EC_RESALE', 'PRIVATE'] },
    profile:    { kind: 'enum', values: ['SC', 'SPR', 'FOREIGNER'] },
    owned:      { kind: 'int', min: 1, max: 3 },
    cashDown:   { kind: 'int', min: 0, max: 100_000_000 },
    cpfDown:    { kind: 'int', min: 0, max: 100_000_000 },
    cpfMonthly: { kind: 'int', min: 0, max: 1_000_000 },
    rate:       { kind: 'num', min: 0, max: 10 },
    tenure:     { kind: 'int', min: 5, max: 35 },
    held:       { kind: 'int', min: 1, max: 30 },
    agent:      { kind: 'num', min: 0, max: 5 },
    home:       { kind: 'href' },
    label:      { kind: 'text', max: 80 },
    beds:       { kind: 'enum', values: ['1', '2', '3', '4', '5'] },
  },
};

/** Human names for `dropped`, so the page can say which figure it could not read. */
export const COST_LABELS = {
  price: 'price paid', bought: 'month bought', type: 'property type', profile: 'buyer profile',
  owned: 'properties owned', cashDown: 'cash down', cpfDown: 'CPF down',
  cpfMonthly: 'CPF per month', rate: 'interest rate', tenure: 'tenure', held: 'years held',
  agent: 'agent fee', home: 'home', label: 'home', beds: 'bedrooms',
};
