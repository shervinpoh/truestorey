import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { setArticleStatus, configured } from '../../../../lib/supabase/rest.js';

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

  const { data, error } = await setArticleStatus(id, status);
  if (error) return NextResponse.json({ error }, { status: 502 });

  const slug = data?.[0]?.slug;
  revalidatePath('/insights');
  if (slug) revalidatePath(`/insights/${slug}`);
  revalidatePath('/');

  return NextResponse.json({ ok: true, id, status, slug });
}
