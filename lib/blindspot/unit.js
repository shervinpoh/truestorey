/** HDB's flat-type vocabulary is not a bedroom count. A 4-room flat is not
 * a four-bedroom home; keeping these separate prevents a plausible-looking
 * but false comparison when a listing is carried into Blindspot. */
export const HDB_FLAT_TYPES = [
  '1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION',
];

export const hdbFlatLabel = type => /^\d ROOM$/.test(type)
  ? type.replace(' ROOM', '-room')
  : type === 'EXECUTIVE' ? 'Executive' : type === 'MULTI-GENERATION' ? 'Multi-generation' : type;

export function unitDetailError(rec, { flatType = null, bedrooms = null } = {}) {
  if (!rec) return 'Choose a block or project first.';
  if (rec.kind === 'HDB') {
    return HDB_FLAT_TYPES.includes(flatType) ? null : 'Choose the flat type shown in the HDB listing.';
  }
  return Number.isInteger(Number(bedrooms)) && Number(bedrooms) >= 1 && Number(bedrooms) <= 20
    ? null : 'Enter the number of bedrooms shown in the listing.';
}
