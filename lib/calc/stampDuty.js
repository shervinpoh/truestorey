import { BSD_RESIDENTIAL, ABSD, SSD_FROM_2025_07_04, SSD_LEGACY_2017_03_11, SSD_REGIME_CHANGE } from './constants.js';

/** Progressive BSD on the higher of price or market value. */
export function bsd(amount) {
  let remaining = amount, prev = 0, total = 0;
  const bands = [];
  for (const b of BSD_RESIDENTIAL) {
    if (remaining <= 0) break;
    const width = Math.min(remaining, b.upTo - prev);
    const duty = width * b.rate;
    bands.push({ from: prev, to: prev + width, rate: b.rate, duty });
    total += duty; remaining -= width; prev = b.upTo;
  }
  return { total: Math.round(total), bands };
}

/**
 * ABSD. profile: 'SC' | 'SPR' | 'FOREIGNER' | 'ENTITY' | 'TRUSTEE'
 * count: number of residential properties owned INCLUDING this purchase.
 * Note: nationals of countries with applicable FTAs may receive SC-equivalent
 * treatment. Not modelled — flag to the user rather than guess.
 */
export function absd(amount, profile, count = 1) {
  let rate;
  if (profile === 'SC' || profile === 'SPR') {
    rate = ABSD[profile][Math.min(count, 3)];
  } else {
    rate = ABSD[profile];
  }
  if (rate === undefined) throw new Error(`Unknown ABSD profile: ${profile}`);
  return { rate, total: Math.round(amount * rate) };
}

/**
 * Which SSD schedule a purchase falls under. Exposed so the sell timeline can
 * render every band without re-implementing the regime rule — the one detail
 * most calculators get wrong.
 */
export const SSD_SCHEDULE = purchaseDate =>
  new Date(purchaseDate) >= SSD_REGIME_CHANGE ? SSD_FROM_2025_07_04 : SSD_LEGACY_2017_03_11;

/**
 * SSD. The schedule is chosen by PURCHASE date, not sale date —
 * this is the detail most calculators get wrong after the 4 Jul 2025 change.
 */
export function ssd(amount, purchaseDate, saleDate = new Date()) {
  const bought = new Date(purchaseDate);
  const schedule = bought >= SSD_REGIME_CHANGE ? SSD_FROM_2025_07_04 : SSD_LEGACY_2017_03_11;
  const heldYears = (new Date(saleDate) - bought) / (365.25 * 24 * 3600 * 1000);
  for (const band of schedule) {
    if (heldYears <= band.withinYears) {
      return {
        rate: band.rate,
        total: Math.round(amount * band.rate),
        heldYears,
        regime: bought >= SSD_REGIME_CHANGE ? '2025' : 'legacy',
        freeAfter: new Date(bought.getTime() + schedule.length * 365.25 * 24 * 3600 * 1000),
      };
    }
  }
  return { rate: 0, total: 0, heldYears, regime: bought >= SSD_REGIME_CHANGE ? '2025' : 'legacy', freeAfter: null };
}
