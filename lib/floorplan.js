/**
 * The floor plan report: what the model read, cleaned, and what code can
 * work out from it.
 *
 * ── WHY IT WAS REBUILT ─────────────────────────────────────────────────────
 * Shervin, 26 Sep: every plan he tried came back talking about whether walls
 * can come down — "it just read it off the actual floor plan, which a buyer
 * can see for themselves." The old instructions asked for a layout paragraph,
 * a facing and wall questions, and forbade almost everything else, so the
 * reading was the one part a buyer did not need.
 *
 * The new reading is about living in THIS unit: which rooms share walls,
 * what a visitor at the door sees, whether a bathroom opens onto the dining
 * table, which rooms get the same sun, where the washing goes when there is
 * no yard. Tried on a real HDB 4-room plan it found all of those; the old
 * reading found none.
 *
 * ── WHAT A MODEL MAY AND MAY NOT PUT HERE ──────────────────────────────────
 * It reads; code computes. A room's size is only ever the one PRINTED on the
 * plan, transcribed as printed, and the area and "which bed fits" are
 * worked out here from that transcription by a published rule. Nothing is
 * estimated from the drawing's proportions. Most plans print no dimensions,
 * and the report says so rather than inventing them. A wall item is always a
 * question for a qualified person and never high confidence. Any item using
 * the site's prohibited language is dropped, not reworded.
 *
 * Pure: no DOM, no network. The route, the shared-report check and the page
 * all use it, and node:test can.
 */
import { scanLanguage, inventedVoice } from './compliance.js';

export const THEMES = {
  zoning: 'How the unit is zoned',
  privacy: 'Privacy',
  circulation: 'Getting around',
  light: 'Light',
  ventilation: 'Air',
  'wet-areas': 'Kitchen, bathrooms and services',
  storage: 'Storage',
  furnishing: 'Furnishing',
  noise: 'Noise',
};
const KINDS = new Set(['bedroom', 'living', 'dining', 'living-dining', 'kitchen', 'bathroom', 'yard', 'service',
  'shelter', 'store', 'study', 'balcony', 'bay-window', 'ac-ledge', 'planter', 'corridor', 'foyer', 'other']);
const CONF = new Set(['high', 'medium', 'low', 'cannot tell']);

const str = (v, n = 400) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
/* A line using a word this site does not publish is dropped whole: rewording
   a model's sentence is the model's job, and a half-cleaned one is worse. */
const clean = s => (s && !scanLanguage(s).length && !inventedVoice(`<p>${s}</p>`) ? s : '');

/* ── sizes, only as printed ─────────────────────────────────────────────── */

/**
 * "3.2m x 3.0m", "3200 x 3000", "3.2 × 3.0", "10'6\" x 9'" → { w, l } in metres,
 * short side first. Null for anything else: a size that cannot be read
 * exactly is not a size.
 */
export function sizeOf(printed) {
  const s = String(printed || '').toLowerCase().replace(/[×✕*]/g, 'x');
  const ft = [...s.matchAll(/(\d+)\s*'\s*(?:(\d+)\s*(?:"|''))?/g)];
  if (ft.length === 2 && /x/.test(s)) {
    const [a, b] = ft.map(m => (Number(m[1]) * 12 + Number(m[2] || 0)) * 0.0254);
    return order(a, b);
  }
  const m = /(\d+(?:\.\d+)?)\s*(mm|m)?\s*x\s*(\d+(?:\.\d+)?)\s*(mm|m)?/.exec(s);
  if (!m) return null;
  let a = Number(m[1]), b = Number(m[3]);
  const mm = m[2] === 'mm' || m[4] === 'mm' || (a >= 500 && b >= 500);
  if (mm) { a /= 1000; b /= 1000; }
  /* A room between 1 and 15 metres a side is a room. Anything outside that
     was a misread — a scale bar, a unit number — and is not used. */
  if (!(a >= 1 && a <= 15 && b >= 1 && b <= 15)) return null;
  return order(a, b);
}
const order = (a, b) => ({ w: Math.min(a, b), l: Math.max(a, b) });

/* Singapore mattress sizes, and the room a bed needs around it to be usable:
   a 0.6m walkway at the foot, and 0.6m down one side for a single or super
   single — 0.5m down both sides for a bed two people get into. These are the
   rule, stated on the page, not a judgement about the room. */
export const BEDS = [
  { name: 'King', w: 1.83, l: 1.9, sides: 2 },
  { name: 'Queen', w: 1.52, l: 1.9, sides: 2 },
  { name: 'Super single', w: 1.07, l: 1.9, sides: 1 },
  { name: 'Single', w: 0.91, l: 1.9, sides: 1 },
];
export const CLEAR = { foot: 0.6, oneSide: 0.6, eachSide: 0.5 };

/** The largest bed that fits with its walkways, or null when none does. */
export function bedFit(size) {
  if (!size) return null;
  const fits = bed => {
    const needW = bed.sides === 2 ? bed.w + CLEAR.eachSide * 2 : bed.w + CLEAR.oneSide;
    const needL = bed.l + CLEAR.foot;
    return (size.w >= needW && size.l >= needL) || (size.l >= needW && size.w >= needL);
  };
  return BEDS.find(fits) || null;
}

/* ── the reading, cleaned ───────────────────────────────────────────────── */

export function normaliseReport(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  if (r.isFloorPlan !== true) return { isFloorPlan: false };

  const u = r.unit || {};
  const rooms = arr(r.rooms, 24).map(x => {
    const printedSize = str(x?.printedSize, 40) || null;
    const size = sizeOf(printedSize);
    const kind = KINDS.has(x?.kind) ? x.kind : 'other';
    return {
      name: str(x?.name, 60), kind,
      where: clean(str(x?.where, 160)), shape: clean(str(x?.shape, 120)),
      windows: clean(str(x?.windows, 200)), door: clean(str(x?.door, 200)),
      note: clean(str(x?.note, 300)),
      printedSize: size ? printedSize : null,
      /* Worked out here, from the printed size only. */
      areaSqm: size ? Math.round(size.w * size.l * 10) / 10 : null,
      bed: size && kind === 'bedroom' ? (bedFit(size)?.name || 'none of the standard sizes') : null,
    };
  }).filter(x => x.name);

  const findings = arr(r.findings, 16).map(f => ({
    theme: THEMES[f?.theme] ? f.theme : 'zoning',
    observation: clean(str(f?.observation, 400)),
    whyItMatters: clean(str(f?.whyItMatters, 300)),
  })).filter(f => f.observation);

  const walls = arr(r.wallsToAskAbout, 10).map(w => ({
    where: clean(str(w?.where, 160)),
    whyItMatters: clean(str(w?.whyItMatters, 300)),
    askYourQP: clean(str(w?.askYourQP, 300)),
    /* Never high. A floor plan does not carry what a wall is made of. */
    confidence: w?.confidence === 'high' ? 'medium' : (CONF.has(w?.confidence) ? w.confidence : 'cannot tell'),
  })).filter(w => w.where && w.askYourQP);

  const f = r.facing || {};
  return {
    isFloorPlan: true,
    unit: {
      type: clean(str(u.type, 120)),
      bedrooms: Number.isInteger(u.bedrooms) && u.bedrooms >= 0 && u.bedrooms < 10 ? u.bedrooms : null,
      bathrooms: Number.isInteger(u.bathrooms) && u.bathrooms >= 0 && u.bathrooms < 10 ? u.bathrooms : null,
      printedArea: str(u.printedArea, 40) || null,
      summary: clean(str(u.summary, 700)),
    },
    rooms,
    findings,
    facing: {
      reading: str(f.reading, 80), note: clean(str(f.note, 240)),
      confidence: CONF.has(f.confidence) ? f.confidence : 'cannot tell',
    },
    wallsToAskAbout: walls,
    atTheViewing: arr(r.atTheViewing, 10).map(s => clean(str(s, 240))).filter(Boolean),
    cannotTell: arr(r.cannotTell, 12).map(s => clean(str(s, 200))).filter(Boolean),
  };
}

/** Findings grouped under their headings, in THEMES order. */
export function byTheme(findings) {
  return Object.keys(THEMES)
    .map(t => ({ theme: t, heading: THEMES[t], items: (findings || []).filter(f => f.theme === t) }))
    .filter(g => g.items.length);
}

/** The viewing checklist as plain text, for copying into a note or a chat. */
export function viewingChecklist(report) {
  const items = report?.atTheViewing || [];
  if (!items.length) return '';
  return ['What to check at the viewing', ...items.map((s, i) => `${i + 1}. ${s}`),
    'From a Truestorey floor plan reading. A floor plan cannot show which walls are structural.'].join('\n');
}
