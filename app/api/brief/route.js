import { NextResponse } from 'next/server';
import { brief } from '../../../lib/brief.js';

/**
 * The figures a morning brief may contain, with their sources and periods.
 *
 * STATIC ON PURPOSE. Every figure behind it is build-time JSON, and
 * refresh-data.yml commits data/ which is itself the deploy — so a static
 * response tracks the data exactly. It also means this route never reads
 * data/ at RUNTIME, which is why it is absent from outputFileTracingIncludes
 * in next.config.mjs and must stay that way. CLAUDE.md records that map being
 * forgotten three times; the way not to forget it a fourth is not to need it.
 *
 * Consumed by /brief in the WhatsApp bot, which passes these to a model and
 * asks for prose around them. The model never adds a number. That rule is
 * enforced at the prompt AND by the fact that this is the only place the
 * numbers come from.
 */
export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json(brief(), {
    headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' },
  });
}
