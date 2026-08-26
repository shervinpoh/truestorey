/**
 * Names, as their source wrote them — unless the source shouts.
 *
 * The layers disagree about capitals. NParks, MOE and HDB are all-caps
 * ("BISHAN ST 24", "TELOK BLANGAH HILL PARK"); NEA is not ("Tiong Bahru
 * Market"). Left alone a page reads like a database dump, which is the exact
 * opposite of what this site is for.
 *
 * So: convert only what is genuinely shouting (more than 85% uppercase),
 * leave anything already mixed-case exactly as received, and keep acronyms.
 * "CHIJ St. Nicholas Girls' School", never "Chij St. Nicholas Girls' School".
 *
 * Shared by the amenity list and the share cards so a block cannot be titled
 * one way on the page and another way in the image someone forwards.
 */
const ACRONYMS = new Set([
  'MRT','LRT','CHIJ','MOE','ITE','NUS','NTU','SMU','SJI','ACS','SCGS','CHS','NPS',
  'HDB','URA','NEA','ECDA','PCF','DBSS','EC','SG','JC','FC','OS','PG','PK','CC','RC',
  'NS','EW','CE','DT','TE','BP','SE','STC','PE','SK','II','III','IV','BLK',
]);
const SMALL = new Set(['of','the','and','at','on','de','di','da','bin','binte']);

/**
 * Judged word by word, not by a ratio over the whole string.
 *
 * A whole-string threshold gets "Blk 275A BISHAN ST 24" wrong: the lowercase
 * "lk" drags it under any sensible cutoff and the shouting survives. Deciding
 * per word means a mixed label is handled correctly in both directions —
 * "Blk" is left alone because it is already cased, "BISHAN" is fixed because
 * it is not.
 */
export function titleCase(name) {
  const s = String(name || '').trim();
  if (!s) return name;
  let first = true;
  return s.split(/(\s+)/).map(w => {
    if (/^\s+$/.test(w)) return w;
    const bare = w.replace(/[^A-Za-z0-9']/g, '');
    if (!bare) return w;
    const lead = first; first = false;
    if (/^\d/.test(bare)) return w;                          // 275A keeps its shape
    if (ACRONYMS.has(bare.toUpperCase()) && bare.length <= 5) return w;
    // A small word stays small only in the middle. "THE SAIL" is The Sail.
    if (!lead && SMALL.has(bare.toLowerCase())) return w.toLowerCase();
    // Only touch a word that is actually shouting. Anything already mixed —
    // "Bahru", "McNair", "iShine" — is left exactly as its source wrote it.
    if (w !== w.toUpperCase()) return w;
    return w.toLowerCase().replace(/(^|[\s\-/(.'])([a-z])/g, (m, p, c) => p + c.toUpperCase());
  }).join('');
}
