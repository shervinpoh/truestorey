import { NextResponse } from 'next/server';
import { perplexityStream, configured } from '../../../../lib/ai/providers.js';
import { offIslandSubject } from '../../../../lib/scope.js';

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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT ANSWERED ABOUT THE WRONG COUNTRY.  30 Aug 2026
 *
 * Asked "East Coast", this returned the Atlantic coastline of the United
 * States, from Maine to Florida, with Britannica and dictionary.com in the
 * sources panel — under a licensed agent's registration number, on a page whose
 * subheading promises Singapore. Half the names in Singapore's own geography
 * are also names somewhere else: East Coast, Clementi, Woodlands, Newton,
 * Queenstown, Kensington, Holland Village, Marine Parade, Sixth Avenue.
 *
 * Three fixes, and the order they were arrived at matters because two of the
 * obvious ones do not work:
 *
 *  1. `web_search_options.user_location.country: 'SG'` IS ACCEPTED AND DOES NOT
 *     FIX IT. Asked "East Coast" with the location set to Singapore, the reply
 *     still led with Maine to Florida and offered Singapore as an alternative.
 *     It is kept below because it costs nothing and helps at the margins, but
 *     anyone reaching for it as the fix will find it is not one.
 *
 *  2. Scoping the SYSTEM PROMPT fixes the ANSWER but not the SOURCES. With the
 *     rules below in place the prose became Singapore immediately — while the
 *     sources panel still listed Britannica, Cambridge Dictionary and the
 *     Wikipedia article on the Eastern Seaboard, because retrieval had already
 *     happened by then. An answer about Singapore footnoted to a US dictionary
 *     is arguably worse than the original: it looks sourced.
 *
 *  3. ANCHORING THE QUERY is what moves retrieval. The search is built from the
 *     last user turn, so that turn — and only that turn, only on its way to the
 *     provider — carries the scope with it. Same question, sources became
 *     NParks, NLB, HDB and URA.
 *
 * And a fourth thing the screenshot did not show: asked what house prices were
 * doing in Manchester, it answered, in full, with UK ONS figures.
 *
 * RULE 1 below was written for that, as an exact output line rather than an
 * instruction to decline, because "say so and stop" was already in the prompt
 * and had been ignored. It refused on every probe — and then answered about
 * Manchester again from the live route, ONS figures and a Rightmove average.
 * So the boundary is decided in lib/scope.js BEFORE the model is reached, and
 * RULE 1 is the second line of defence rather than the only one. Which of the
 * two is the guarantee is written down in that file, because a soft check
 * standing where a hard one is assumed is how this got shipped the first time.
 */

const SYSTEM = `You are the retrieval half of a Singapore property site published under a licensed estate agent's registration number. You answer about Singapore and nothing else.

RULE 1 — SINGAPORE OR NOTHING. If the question is about another country, another country's market, or a place outside Singapore, you do NOT answer it — not partly, not to be helpful, not with a caveat. Reply with exactly this line and nothing else, no sources, no follow-ups:
OFF-ISLAND: <one clause naming what was asked about>
Example — asked "what are house prices doing in Manchester?", reply exactly:
OFF-ISLAND: house prices in Manchester, England
Example — asked "should I buy in Johor?", reply exactly:
OFF-ISLAND: property in Johor, Malaysia

RULE 2 — AN AMBIGUOUS NAME IS THE SINGAPORE NAME. A place name that also exists elsewhere always means the Singapore one, with no hedging and no foreign reading offered first. East Coast is the Singapore planning area and East Coast Park. Clementi, Woodlands, Newton, Queenstown, Holland Village, Marine Parade, Bukit Timah, Tampines, Serangoon, Kensington, Braddell, Farrer, Sixth Avenue, Sembawang and Tanglin are all Singapore.

RULE 3 — EVERY CLAIM CARRIES ITS SOURCE. Prefer the primary Singapore source: HDB, URA, MND, MAS, LTA, MOE, SLA, NParks, NLB, Singstat, data.gov.sg, gov.sg, Parliament. Use a listing portal or a travel page only when nothing official covers it, and say plainly when the sourcing is that thin. A claim you cannot source does not go in the answer. Give the date of anything time-sensitive — "prices rose" without a period is not an answer. If retrieval returns nothing solid, say so; do not fill the gap from memory.

RULE 4 — NEVER REPRODUCE REPORTING. State the fact, cite it, stop. If the only thing available is somebody's prose, say the reporting exists and leave the link to carry it.

RULE 5 — NO VALUATIONS, NO ADVICE. Never say what a property is worth, and never repeat a portal's estimate or "indicative price" for one. A price that was actually transacted may be reported, with its date and its source. Never say "undervalued", "overvalued", "bargain", "best deal", "expert" or "specialist". Never advise buying, selling or holding.

RULE 6 — NO OFFERS IN PROSE. Never write "if you want, I can…", "I can narrow it to…", "let me know if…", "would you like…". The reader cannot reply to a sentence. Answer what was asked and stop.

STYLE: British English, plain, short paragraphs, under 220 words. Lead with the most recent hard figure you found.

FINISH with one last line in exactly this shape, nothing after it:
FOLLOW-UPS: question | question | question
Three complete questions a reader might ask NEXT about Singapore property, each answerable by searching. Never a question back to the reader about what they want, and never about your own scope.`;

/*
 * The scope travels with the question, because the question is what the search
 * is built from. Appended to the outgoing copy only — `messages` as the client
 * holds it, and as the transcript shows it, is what the reader actually typed.
 *
 * It instructs rather than asserts. The first draft ended "This IS a question
 * about a Singapore town, estate, project or policy", which reads as a
 * guarantee the question is in scope and quietly argues against RULE 1 on the
 * very turns RULE 1 exists for.
 */
const ANCHOR = '\n\n(Singapore only. Read every place name here as the Singapore '
             + 'one. If this asks about anywhere outside Singapore, apply RULE 1.)';

/*
 * A refusal, in the provider's own event shape.
 *
 * The client parses one stream format and has one path through it. Returning
 * JSON here instead would mean a second branch in the reader, kept in step by
 * hand, for the case that matters most — so the guard speaks SSE and the page
 * cannot tell the difference.
 */
function refuse(subject) {
  const frame = JSON.stringify({ choices: [{ delta: { content: `OFF-ISLAND: ${subject}` } }] });
  return new Response(`data: ${frame}\n\ndata: [DONE]\n\n`, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

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

  const last = clean.length - 1;
  if (clean[last].role !== 'user') return NextResponse.json({ error: 'Ask something first.' }, { status: 400 });

  // Decided here, not by the model, and before a retrieval call is spent on it.
  const off = offIslandSubject(clean[last].content);
  if (off) return refuse(off);

  clean[last] = { role: 'user', content: clean[last].content + ANCHOR };

  const upstream = await perplexityStream(
    [{ role: 'system', content: SYSTEM }, ...clean],
    {
      /*
       * 900 → 1400. The follow-up questions are the LAST line of the reply, so
       * a truncation does not look like a truncation — it looks like a model
       * that declined to offer any, and the chips silently stop appearing. That
       * is the same shape as the Gemini budget bug in lib/ai/providers.js:
       * passes in dev, passes on the retry, fails for a reader. A 220-word
       * answer plus the trailer does not need this much; it is headroom so the
       * failure cannot be quiet.
       */
      maxTokens: 1400,
      search: {
        // Helps at the margins. Not the fix — see the note at the top.
        web_search_options: { user_location: { country: 'SG' } },
        // Not a topic filter. These four answered "East Coast" with the US
        // seaboard and a dictionary definition, and none of them is ever the
        // best source for a question about Singapore property.
        search_domain_filter: ['-wikipedia.org', '-britannica.com', '-dictionary.com', '-dictionary.cambridge.org'],
      },
      signal: req.signal,
    });

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
