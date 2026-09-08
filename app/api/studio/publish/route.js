import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { setArticleStatus, articleById, configured } from '../../../../lib/supabase/rest.js';
import { publishBlockers } from '../../../../lib/compliance.js';

export const dynamic = 'force-dynamic';

/**
 * The one place a draft becomes public.
 *
 * The webhook cannot do this and neither can the pipeline. A person reads the
 * piece and presses the button, which is the whole reason the draft state
 * exists — everything published here carries a CEA registration number, and
 * "the model wrote it" is not a defence anybody has ever accepted.
 */
export async function POST(req) {
  if (!configured()) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }
  let body;
  try { body = await req.json(); } catch { body = null; }

  const id = body?.id;
  const status = body?.status === 'archived' ? 'archived'
    : body?.status === 'draft' ? 'draft'
    : 'published';
  if (!id) return NextResponse.json({ error: 'Which article?' }, { status: 400 });

  /* ── the gate ─────────────────────────────────────────────────────────────
     Only on the way OUT. Archiving or returning something to draft is always
     allowed — a blocked article must never become unarchivable, and the way
     to deal with one is to put it back in the queue.

     lib/compliance.js, not a prompt. Every rule below already existed inside
     the pipeline's system prompts; a model kept them most of the time, and
     most of the time is the failure rate that publishes one bad article under
     a registration number. The queue used to WARN about missing sources and
     publish anyway, which is a warning nobody has ever read twice. */
  if (status === 'published') {
    const article = await articleById(id);
    if (!article) return NextResponse.json({ error: 'No such article.' }, { status: 404 });
    const blockers = publishBlockers(article);
    if (blockers.length) {
      return NextResponse.json({
        error: 'This cannot be published as written.',
        blockers,
        note: 'Fix it in Supabase, or archive it. Nothing here is overridable from this endpoint.',
      }, { status: 422 });
    }
  }

  const { data, error } = await setArticleStatus(id, status);
  if (error) return NextResponse.json({ error }, { status: 502 });

  const slug = data?.[0]?.slug;
  revalidatePath('/insights');
  if (slug) revalidatePath(`/insights/${slug}`);
  revalidatePath('/');

  return NextResponse.json({ ok: true, id, status, slug });
}
