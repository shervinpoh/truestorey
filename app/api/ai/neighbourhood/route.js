import { NextResponse } from 'next/server';
import { perplexityStream, configured } from '../../../../lib/ai/providers.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * The neighbourhood tracker — live retrieval, streamed.
 *
 * RULE 9 IS THE WHOLE DESIGN CONSTRAINT. This site indexes primary sources and
 * links to them; it does not reproduce anybody's reporting. So the system
 * prompt forbids quoting and the response is required to carry links. A
 * retrieval tool that paraphrases articles at length is a republishing tool
 * with extra steps, and this one is built not to be.
 *
 * Streamed by piping Perplexity's own SSE through untouched. No SDK: the
 * client reads the same event stream the provider emits, which is fewer moving
 * parts than translating it into somebody else's protocol on the way past.
 */

const SYSTEM = `You are a research assistant for a Singapore property site that publishes only what it can source.

Answer the question about a Singapore estate, town or project using live retrieval.

Hard rules, in order of importance:
1. NEVER reproduce or closely paraphrase the text of a news article. State the fact, then cite. If the only thing you can offer is somebody's prose, say that the reporting exists and link it instead.
2. Every factual claim carries a source. A claim you cannot source does not go in the answer.
3. Give the date of anything time-sensitive. "Prices rose" without a period is not an answer.
4. If retrieval returns nothing solid, say so plainly. Do not fill the gap from memory.
5. Never estimate what a property is worth. Never say "undervalued", "overvalued", "bargain", "best deal", "expert" or "specialist".
6. Never advise buying, selling or holding. Report what is published; the reader decides.

Style: British English, plain, short paragraphs. Lead with the most recent hard figure you found. Under 250 words.`;

export async function POST(req) {
  if (!configured.perplexity()) {
    return NextResponse.json(
      { error: 'Live retrieval is not configured on this deployment.' }, { status: 503 });
  }

  let body;
  try { body = await req.json(); } catch { body = null; }
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages?.length) {
    return NextResponse.json({ error: 'Ask something first.' }, { status: 400 });
  }

  // Only the roles and content the provider needs, capped. Anything a client
  // sends beyond this is dropped rather than forwarded.
  const clean = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-8)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!clean.length) return NextResponse.json({ error: 'Ask something first.' }, { status: 400 });

  const upstream = await perplexityStream(
    [{ role: 'system', content: SYSTEM }, ...clean],
    { signal: req.signal });

  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Retrieval failed${upstream ? ` (${upstream.status})` : ''}.` }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
