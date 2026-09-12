/**
 * The price ramp, and how a set of values is cut into it.
 *
 * ── WHY IT IS A MODULE ─────────────────────────────────────────────────────
 * It was defined inside IslandMap.jsx, copied from PriceMap.jsx, and a third
 * consumer was about to copy it again. Two implementations of one calculation
 * is the failure this repo already records against lib/calc/proceeds.js, and
 * a ramp is worse than most: nothing would go red, the two maps would simply
 * shade the same price differently and the site would quietly stop being one
 * atlas.
 *
 * Sequential, one hue, running from the palette's data mist to its deep teal,
 * so the darkest step is the same colour as the interface and a map reads as
 * part of the site rather than beside it.
 */
export const RAMP = ['#CDE9E9', '#9BD6D9', '#6FC4CA', '#3D9AA1', '#256E73', '#164F52'];

/**
 * Six equal-sized GROUPS, not six equal price steps.
 *
 * On a min-max ramp a handful of expensive outliers flatten everything else
 * into one shade, and a map where nine tenths of the land is the same colour
 * has told the reader nothing. Quantiles spend the ramp where the values
 * actually are.
 */
export function quantileBreaks(values, bands = RAMP.length) {
  const v = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return [];
  const out = [];
  for (let i = 1; i < bands; i++) out.push(v[Math.floor((i / bands) * v.length)]);
  return out;
}

/** Which step of the ramp a value falls on. */
export const bandOf = (value, breaks) => {
  if (!Number.isFinite(value)) return null;
  let i = 0;
  while (i < breaks.length && value >= breaks[i]) i++;
  return i;
};

/**
 * The floor under shading a set at all.
 *
 * Six bands over eleven blocks gives one or two per band, and a quantile over
 * a sample that small is noise wearing a colour. A town below this gets plain
 * dots and a sentence saying why, which is the same rule Blindspot follows:
 * a check that cannot run scores nothing and says so.
 */
export const MIN_TO_BAND = RAMP.length * 2;
