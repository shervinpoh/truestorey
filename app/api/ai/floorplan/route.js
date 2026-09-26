import { NextResponse } from 'next/server';
import { claude, gemini, firstJson, configured } from '../../../../lib/ai/providers.js';
import { normaliseReport } from '../../../../lib/floorplan.js';
import { seal } from '../../../../lib/floorplan-share.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Floor plan reading.
 *
 * ── WHAT CHANGED ON 26 SEP ─────────────────────────────────────────────────
 * The report read back what a buyer can already see — mostly whether walls
 * can come down. The instructions below ask for what they cannot: how the
 * unit is zoned, what a visitor at the door sees, which rooms share a wall or
 * a sun, where the bathrooms open, where the washing goes. Every sentence must
 * be about THIS plan; "natural light is important" is named as worthless.
 *
 * The reader is Claude Opus 5.5 at low effort: on a real HDB plan it read
 * the casement windows, the missing ensuite and the missing yard where a
 * faster model misread all three, and it answered in about 32s inside this
 * route's 60. Gemini remains only for a deployment without an Anthropic key.
 *
 * ── WHY THE STRUCTURAL QUESTION IS STILL A QUESTION ────────────────────────
 * Whether a wall is load-bearing lives in the structural drawings and a
 * qualified person's assessment; a floor plan does not carry it, and the
 * failure mode is somebody hacking a structural wall. So every wall item is
 * a question, never high confidence — enforced in lib/floorplan.js whatever
 * the model returns.
 *
 * ── NUMBERS ────────────────────────────────────────────────────────────────
 * The model transcribes only what is printed. Areas and bed fits are computed
 * in lib/floorplan.js from a printed size; nothing is estimated from the
 * drawing. The image is read in this request and never written anywhere.
 */

const MAX_IMAGE = 6 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const SYSTEM = `You are reading ONE Singapore residential floor plan for a buyer who is deciding whether to view or buy this unit. They can already see the drawing. Your job is to tell them what the drawing means for living in this particular unit — the things a first-time buyer would not notice on their own.

BE SPECIFIC TO THIS PLAN. Name rooms as the plan labels them and say where they are ("Bedroom 3, top right, beside the living room"). Every observation must be about something visible in this drawing. A sentence that would be true of any flat ("natural light is important", "consider your family's needs") is worthless — do not write it.

WHAT TO READ, in this order:
1. The unit: what type it appears to be, the number of bedrooms and bathrooms, and any area or dimensions PRINTED on the plan, transcribed exactly as printed.
2. Every room: name as labelled, where it sits, its shape (regular, L-shaped, irregular, long and narrow), which walls have windows, where its door is and which way the door swings, and anything that eats usable space (a door swing, a column, a bay window, a service duct, an angled wall).
3. Zoning and privacy: which rooms share walls, whether bedrooms are grouped or split, what the main door opens onto and what a visitor at the door can see, whether any bathroom opens straight onto the living or dining area, whether the kitchen is open or closed.
4. Circulation: corridor length, doors that clash or cluster, rooms you must pass through to reach others.
5. Light and air: which rooms have windows and on which sides, whether any habitable room has none, whether air can cross the unit (openings on opposite sides), which rooms share the same outlook (so the same sun).
6. Wet areas and services: where the kitchen, bathrooms, yard or service area and household shelter sit relative to each other and to the living spaces — and whether there is anywhere obvious for laundry.
7. Storage and awkward spaces: the household shelter, store, recesses, and corners that will be hard to furnish.
8. Orientation: ONLY if the plan shows a north arrow or compass.
9. Walls a buyer may want to change: as QUESTIONS for a qualified person, never as advice.

HARD RULES:
- Transcribe printed numbers exactly; never estimate a dimension, an area or a proportion from the drawing. If something is not printed, say it is not printed. A room's printedSize is null unless a size is printed on that room.
- Never state that a wall is load-bearing, structural or removable. Every wall item is a question for a qualified person. Confidence on a wall is never high.
- Never estimate value, rent, renovation cost or a score of any kind.
- Never use: undervalued, bargain, best deal, expert, specialist, must.
- No first person. British spelling. Plain and direct. Short sentences.
- If the image is not a floor plan, return {"isFloorPlan": false}.

Return ONLY this JSON:
{
  "isFloorPlan": boolean,
  "unit": { "type": string, "bedrooms": number|null, "bathrooms": number|null, "printedArea": string|null, "summary": string },
  "rooms": [ { "name": string, "kind": "bedroom"|"living"|"dining"|"living-dining"|"kitchen"|"bathroom"|"yard"|"service"|"shelter"|"store"|"study"|"balcony"|"bay-window"|"ac-ledge"|"planter"|"corridor"|"foyer"|"other", "where": string, "shape": string, "windows": string, "door": string, "printedSize": string|null, "note": string } ],
  "findings": [ { "theme": "zoning"|"privacy"|"circulation"|"light"|"ventilation"|"wet-areas"|"storage"|"furnishing"|"noise", "observation": string, "whyItMatters": string } ],
  "facing": { "reading": string, "confidence": "high"|"medium"|"low"|"cannot tell", "note": string },
  "wallsToAskAbout": [ { "where": string, "whyItMatters": string, "askYourQP": string, "confidence": "medium"|"low"|"cannot tell" } ],
  "atTheViewing": [ string ],
  "cannotTell": [ string ]
}
"unit.summary" is two or three sentences. "findings" holds 6 to 12 items. "atTheViewing" holds 5 to 8 things to check or measure in person, each tied to something in this plan.`;

async function read(buf, type, signal) {
  if (configured.anthropic()) {
    const out = await claude(SYSTEM, [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: type, data: buf.toString('base64') } },
      { type: 'text', text: 'Read this plan and return the JSON.' },
    ] }], { model: 'claude-opus-5-5', effort: 'low', maxTokens: 6000, timeoutMs: 52_000, signal });
    if (out && !out.error) return out.text;
    return { error: out?.error || 'The plan could not be read.' };
  }
  if (!configured.gemini()) return { error: 'Floor plan reading is not configured on this deployment.' };
  const out = await gemini([
    { text: SYSTEM },
    { inline_data: { mime_type: type, data: buf.toString('base64') } },
    { text: 'Read this plan and return the JSON.' },
  ], { signal });
  return out && !out.error ? out.text : { error: out?.error || 'The plan could not be read.' };
}

export async function POST(req) {
  let form;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'Send the image as a form upload.' }, { status: 400 }); }

  const file = form.get('image');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No image came through.' }, { status: 400 });
  }
  if (!TYPES.has(file.type)) {
    return NextResponse.json({ error: 'PNG, JPEG or WebP only.' }, { status: 415 });
  }
  if (file.size > MAX_IMAGE) {
    return NextResponse.json({ error: 'That image is over 6MB — try a smaller export.' }, { status: 413 });
  }

  const text = await read(Buffer.from(await file.arrayBuffer()), file.type, req.signal);
  if (typeof text !== 'string') {
    return NextResponse.json({ error: text.error }, { status: 502 });
  }
  const parsed = firstJson(text);
  if (!parsed) {
    return NextResponse.json({ error: 'The reading came back in a shape this page could not use.' }, { status: 502 });
  }

  const report = normaliseReport(parsed);
  return NextResponse.json({
    ...report,
    share: report.isFloorPlan ? seal(report) : null,
    // The image is never written to disk and never leaves this request.
    retained: false,
  });
}
