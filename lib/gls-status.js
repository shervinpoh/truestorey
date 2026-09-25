/**
 * Which sites in the current GLS programme have been awarded, from URA's own
 * awards spreadsheet rather than from a hand-typed status.
 *
 * data/sources/gls-programme.json is transcribed by hand, twice a year, and
 * its `status` was typed in with it. By 26 Sep it still read "Open for
 * tender" for New Upper Changi Road (awarded 4 Sep) and Lorong Puntong / Sin
 * Ming Avenue (awarded 18 Sep). The awards arrive in data/gls-awards.json by
 * themselves every three days, so the status is taken from there.
 *
 * ── A NAME IS NOT A SITE ───────────────────────────────────────────────────
 * The awards record holds an earlier Lorong Puntong (2014), an earlier Marina
 * Gardens Lane (2023) and an earlier Orchard Boulevard (2024). Matched on name
 * alone, every one of those programme sites would read as awarded before it
 * was launched. So an award counts only if it came after the programme was
 * announced: early June for a second-half programme, early December of the
 * year before for a first-half one.
 */

const norm = s => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const full = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "2026 H2" → "2026-06-01"; "2027 H1" → "2026-12-01". */
export function programmeStart(programme) {
  const m = /^(\d{4})\s*H([12])$/i.exec(String(programme || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  return m[2] === '2' ? `${y}-06-01` : `${y - 1}-12-01`;
}

/**
 * @param programme  data/gls.json (or the source file): { programme, sites[] }
 * @param awards     data/gls-awards.json: { sites[] }
 * @returns { sites, changed } — sites with status/award fields set, and the
 *          names whose status this changed. Pure; the caller writes.
 */
export function markAwarded(programme, awards) {
  const since = programmeStart(programme?.programme);
  const pool = (awards?.sites || []).filter(a => a.award && since && a.award >= since);
  const changed = [];
  const sites = (programme?.sites || []).map(s => {
    /* The full name first, parcel letter and all; then the name without a
       parcel, for a record that does not carry one. Never the other way:
       "Media Circle" must not take "Media Circle (Parcel B)"'s award. */
    const parcel = x => /\(parcel/i.test(x);
    const hit = pool.find(a => full(a.site) === full(s.name))
      || pool.find(a => norm(a.site) === norm(s.name) && parcel(a.site) === parcel(s.name));
    if (!hit) return s;
    const next = { ...s, status: 'Awarded', awardDate: hit.award, awardBids: hit.bids ?? null, awardPrice: hit.price ?? null };
    if (s.status !== 'Awarded') changed.push(s.name);
    return next;
  });
  return { sites, changed };
}
