/**
 * A photograph for the top of the piece.
 *
 * ── WHY IT IS ATMOSPHERE AND NOTHING MORE ──────────────────────────────────
 * A stock photograph cannot show the block the article is about, and one that
 * looks like it might is worse than none. So the search terms are deliberately
 * general — Singapore, housing, the skyline — and never the subject's name. A
 * reader should read it as a picture of the city, because that is what it is.
 * The chart carries the substance; this carries the page.
 *
 * ── WHAT UNSPLASH REQUIRES, AND WHERE IT IS HONOURED ───────────────────────
 * The API terms want the photographer credited with a link, and a ping to the
 * photo's download endpoint when it is used. The webhook does both — and drops
 * the image entirely if no photographer name arrives with it, so a broken
 * credit cannot publish. This only has to pass the fields through.
 *
 * No key means no photograph and a piece that still files. An article is not
 * worth losing over its illustration.
 */
export async function photograph() {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  /* Search, not /photos/random. Random with a query is a lottery: it returns
     one loosely-matched photo and there is no way to look at it before
     accepting it. Search returns thirty with their metadata, which is what
     makes the check below possible. */
  const terms = ['singapore public housing', 'singapore skyline', 'singapore hdb',
                 'singapore architecture', 'singapore neighbourhood'];
  const query = terms[Math.floor(Math.random() * terms.length)];
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}`
      + '&orientation=landscape&content_filter=high&per_page=30',
      { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) { console.warn(`  no photograph: Unsplash ${res.status}`); return null; }
    const { results = [] } = await res.json();

    /* ── IT HAS TO ACTUALLY BE SINGAPORE ──────────────────────────────────
       A search for "singapore hdb" returns apartment blocks, and plenty of
       them are in Hong Kong, Kuala Lumpur or Seoul. On a site whose whole
       claim is that its figures come from Singapore's own agencies, a
       photograph of somewhere else is a small lie at the top of the page —
       and the kind a reader who knows the city will spot immediately.

       Unsplash carries a location on many photos and tags on nearly all, so
       the claim is checkable rather than assumed. Anything that cannot be
       confirmed is dropped.

       Better no photograph than the wrong country: the typographic tile
       already handles an unillustrated piece, and handles it well. */
    const singaporean = results.filter(p => {
      const country = p.location?.country || '';
      if (/singapore/i.test(country)) return true;
      const words = [p.alt_description, p.description,
                     ...(p.tags || []).map(t => t.title)].filter(Boolean).join(' ');
      return /\bsingapore\b|\bhdb\b|marina bay|sentosa/i.test(words);
    });

    if (!singaporean.length) {
      console.warn(`  no photograph: nothing in "${query}" could be confirmed as Singapore`);
      return null;
    }
    const p = singaporean[Math.floor(Math.random() * singaporean.length)];
    if (!p?.urls?.regular || !p?.user?.name) return null;

    const why = /singapore/i.test(p.location?.country || '') ? 'location' : 'tags';
    console.log(`  photograph by ${p.user.name} — Singapore confirmed by ${why}`
      + ` (${singaporean.length} of ${results.length} results qualified)`);
    return {
      header_image_url: p.urls.regular,
      unsplash_photographer_name: p.user.name,
      unsplash_photographer_profile_url: p.user.links?.html || null,
      /* The webhook pings this. Unsplash requires it on every use and it is
         the one term people forget, which is why it travels as a field rather
         than being left to whoever calls the API. */
      unsplash_download_location: p.links?.download_location || null,
      alt: p.alt_description || query,
    };
  } catch (e) {
    console.warn(`  no photograph: ${e.name}`);
    return null;
  }
}
