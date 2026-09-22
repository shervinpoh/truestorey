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
 * A holding period ends on a calendar anniversary, not after 365.25 × N days.
 * The old approximation could move a rate change by hours or a day around a
 * leap year. Clamp 29 February to the last day of February in a non-leap year.
 */
export function calendarAnniversary(value, years) {
  return calendarMonthOffset(value, years * 12);
}

export function calendarMonthOffset(value, months) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new RangeError('Invalid property date');
  const absoluteMonth = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const y = Math.floor(absoluteMonth / 12);
  const m = ((absoluteMonth % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}

/**
 * SSD. The schedule is chosen by PURCHASE date, not sale date —
 * this is the detail most calculators get wrong after the 4 Jul 2025 change.
 */
export function ssd(amount, purchaseDate, saleDate = new Date()) {
  const bought = new Date(purchaseDate);
  const sold = new Date(saleDate);
  if (Number.isNaN(bought.getTime()) || Number.isNaN(sold.getTime())) {
    throw new RangeError('A valid purchase and sale date are required');
  }
  const post2025 = bought >= SSD_REGIME_CHANGE;
  const schedule = post2025 ? SSD_FROM_2025_07_04 : SSD_LEGACY_2017_03_11;
  const heldYears = (sold - bought) / (365.2425 * 24 * 3600 * 1000);
  const freeAfter = calendarAnniversary(bought, schedule.at(-1).withinYears);
  for (const band of schedule) {
    // IRAS examples treat a sale on the final anniversary as outside SSD.
    // The same calendar boundary moves each intermediate rate down a tier.
    if (sold < calendarAnniversary(bought, band.withinYears)) {
      const raw = Number(amount) * band.rate;
      return {
        rate: band.rate,
        // IRAS rounds SSD down to the nearest dollar, with a S$1 minimum.
        total: raw > 0 ? Math.max(1, Math.floor(raw)) : 0,
        heldYears,
        regime: post2025 ? '2025' : 'legacy',
        freeAfter,
      };
    }
  }
  return { rate: 0, total: 0, heldYears, regime: post2025 ? '2025' : 'legacy', freeAfter };
}
