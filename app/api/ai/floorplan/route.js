import { NextResponse } from 'next/server';
import { gemini, firstJson, configured } from '../../../../lib/ai/providers.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Floor plan diagnostics.
 *
 * WHY THE STRUCTURAL QUESTION IS ANSWERED AS A QUESTION.
 *
 * Layout efficiency and which way a unit faces are both readable from a plan.
 * Whether a wall is load-bearing is not: that lives in the structural drawings
 * and in a qualified person's assessment, and a floor plan simply does not
 * carry it. The failure mode is not an inaccurate report — it is somebody
 * hacking a structural wall, which is a BCA permit offence before it is a
 * safety problem.
 *
 * So the model is instructed to produce OBSERVATIONS AND QUESTIONS on that
 * third heading, with a confidence on each, and is forbidden from stating that
 * any wall can be removed. That is more useful anyway: what a buyer needs is
 * the list to put in front of their ID and their QP.
 */

const MAX_IMAGE = 6 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const SYSTEM = `You are reading a Singapore residential floor plan or interior photograph for a property site.

Return ONLY JSON matching this shape:

{
  "isFloorPlan": boolean,
  "unitType": string,
  "spatialHealth": { "score": number (1-10, 10 = very efficient), "basis": string },
  "layout": [ { "observation": string, "impact": string } ],
  "facing": { "reading": string, "confidence": "high" | "medium" | "low" | "cannot tell", "note": string },
  "wallsToAskAbout": [ { "where": string, "whyItMatters": string, "askYourQP": string, "confidence": "medium" | "low" | "cannot tell" } ],
  "renovationNotes": [ string ],
  "cannotTell": [ string ]
}

Hard rules:
- NEVER state that a wall is load-bearing, structural, or safe to remove. A floor plan does not carry that information. Every wall entry is a question to put to a qualified person, phrased as one.
- Confidence on a wall entry is never "high". If you cannot tell, say "cannot tell".
- Orientation: only report a facing if the plan actually shows a north arrow or a compass. Otherwise set confidence to "cannot tell" and say the plan carries no orientation marking. Do not infer it from anything else.
- Never estimate what the unit is worth, what renovation would cost, or what rent it would fetch.
- Never say "undervalued", "bargain", "best deal", "expert" or "specialist".
- "cannotTell" must list what the image genuinely does not show. An empty array means the image answered everything, which is almost never true.
- If the image is not a floor plan or an interior, set isFloorPlan false and leave the rest empty.

British English. Plain, specific, no marketing language.`;

export async function POST(req) {
  if (!configured.gemini()) {
    return NextResponse.json({ error: 'Floor plan reading is not configured on this deployment.' }, { status: 503 });
  }

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

  const buf = Buffer.from(await file.arrayBuffer());
  const out = await gemini([
    { text: SYSTEM },
    { inline_data: { mime_type: file.type, data: buf.toString('base64') } },
    { text: 'Read this plan and return the JSON.' },
  ], { signal: req.signal });

  if (!out || out.error) {
    return NextResponse.json({ error: out?.error || 'That did not work.' }, { status: 502 });
  }

  const parsed = firstJson(out.text);
  if (!parsed) {
    return NextResponse.json({ error: 'The reading came back in a shape this page could not use.' }, { status: 502 });
  }

  // Belt and braces: the prompt forbids high confidence on a wall, and this
  // enforces it regardless of what came back.
  if (Array.isArray(parsed.wallsToAskAbout)) {
    parsed.wallsToAskAbout = parsed.wallsToAskAbout.map(w => ({
      ...w,
      confidence: w?.confidence === 'high' ? 'medium' : (w?.confidence || 'cannot tell'),
    }));
  }

  return NextResponse.json({
    ...parsed,
    // The image is never written to disk and never leaves this request.
    retained: false,
    disclaimer: 'A floor plan cannot tell you which walls are structural. Nothing here is a determination — the wall notes are questions for your interior designer and a qualified person, and any removal needs their assessment and the relevant approval.',
  });
}
