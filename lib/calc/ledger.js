import { CPF_OA_RATE, GST_RATE, SOURCES } from './constants.js';
import { bsd, absd, ssd } from './stampDuty.js';
import { amortise } from './amortise.js';

/**
 * What a purchase has cost, before the property has done anything.
 *
 * ── THE QUESTION ───────────────────────────────────────────────────────────
 * Every price conversation in Singapore is about what a home is worth. Almost
 * none of them is about what owning it costs regardless: the duties, the
 * interest, the commission on the way out, and the CPF interest that has been
 * quietly accruing against the flat since the day it was bought. Those are all
 * published, all knowable in advance, and all absent from the decision.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 * The brief that prompted this asked for the purchase to be scored against
 * historical STI, S&P 500 and gold returns. Refused: none of those series is
 * in this repo, each would need sourcing and licensing, and ranking a home
 * against equities is investment advice, which nobody here is licensed to
 * give. The one benchmark that survives is the CPF Ordinary Account rate —
 * because it is STATUTORY and PUBLISHED rather than observed, because CPF is
 * where most of the money actually came from, and because using it needs no
 * data this site does not already hold.
 *
 * Even that is a reference and not a recommendation. The page shows two
 * figures and says what each one means. It does not say which is better.
 *
 * ── THE LARGEST OMITTED NUMBER, SAID OUT LOUD ──────────────────────────────
 * The alternative to buying is renting, and rent is not in here. Nobody
 * publishes what THIS reader would have paid to rent the home they bought, so
 * inventing one would put a guess at the centre of the arithmetic. It is named
 * in `omissions` on every result instead, because a comparison that quietly
 * drops the other side's biggest cost is not conservative, it is wrong. URA's
 * filed rental contracts are on /yield for anyone who wants to put a real
 * number to it themselves.
 *
 * ── WHY BREAK-EVEN IS DIVISION AND NOT ADDITION ────────────────────────────
 * Agent commission and SSD are percentages OF THE SALE PRICE, so the price
 * that clears a target is not the target plus the costs — it is the target
 * divided by what is left of each dollar after them. Adding them, which is the
 * obvious way to do it, understates the answer by the commission on the
 * commission. See breakEven() below.
 */

/** A square metre of ground rules; a month of CPF is compounded monthly. */
const m = r => r / 12;

/**
 * CPF principal and the interest that accrues against it.
 *
 * proceeds.js already had cpfAccruedInterest(), which compounds one lump for
 * the whole period. That is right for a down payment and wrong for the monthly
 * servicing: a dollar of OA spent on last month's instalment has not been out
 * of the account for twenty years. So the stream gets the annuity form —
 * future value of the payments, less the payments themselves.
 *
 * The two agree exactly when monthly is zero, and test/ledger.test.js asserts
 * that, because two implementations of one rule disagreeing is a failure this
 * repo has already had.
 */
export function cpfAccrual({ lump = 0, monthly = 0, months = 0, payingMonths = months, rate = CPF_OA_RATE }) {
  if (months <= 0) return { principal: lump, interest: 0, total: lump };
  const i = m(rate);
  const pay = Math.min(Math.max(0, payingMonths), months);
  const growth = Math.pow(1 + i, months);
  const atStop = Math.pow(1 + i, pay);
  const onLump = lump * (growth - 1);
  /* The stream stops when the instalments stop — a repaid loan takes nothing
   * more out of the Ordinary Account — but what it already took keeps accruing
   * against the property until it is sold. Two phases, and conflating them was
   * a live bug: a ten-year loan held for twenty-five went on drawing CPF for
   * fifteen years after the mortgage ended. */
  const streamAtStop = monthly ? monthly * ((atStop - 1) / i) : 0;
  const streamNow = streamAtStop * Math.pow(1 + i, months - pay);
  const principal = lump + monthly * pay;
  const interest = onLump + (streamNow - monthly * pay);
  return { principal, interest, total: principal + interest, payingMonths: pay };
}


/**
 * SSD applies to residential property held for less than the schedule's run.
 * An HDB flat and an EC bought from the developer are governed by the minimum
 * occupation period instead — they cannot be sold inside it at all — so the
 * rate is zero here and the caveat says which rule is doing the work.
 */
const SSD_APPLIES = new Set(['PRIVATE', 'EC_RESALE']);

/**
 * The price a sale must reach to leave `target` in hand.
 *
 * P − loan − cpfRefund − legal − P·agent − P·ssd = target
 *   ⇒ P = (target + loan + cpfRefund + legal) / (1 − agent − ssd)
 *
 * Returns null when the denominator is not positive, which would mean the
 * costs of selling consume the whole price. It cannot happen at real rates and
 * returning Infinity dressed as money would be worse than saying nothing.
 */
export function breakEven({ target, loan, cpfRefund, legal, agentRate, ssdRate }) {
  const keep = 1 - agentRate - ssdRate;
  if (keep <= 0) return null;
  return (target + loan + cpfRefund + legal) / keep;
}

/**
 * What renting the same home instead would have cost over the same years.
 *
 * ── THE FIGURE THIS LEDGER USED TO SAY IT COULD NOT HAVE ───────────────────
 * `omissions` has always led with rent: the alternative to buying is renting,
 * and nobody publishes what THIS reader would have paid. That was true of a
 * standalone calculator and it stopped being true the moment the page knew
 * which home it was talking about — URA files every tenancy contract, and the
 * repo holds 65,654 of them.
 *
 * ── WHAT IT IS AND IS NOT ──────────────────────────────────────────────────
 * Today's median rent for that cohort, held flat across the whole period. It
 * is NOT a forecast: rents move, and this makes no attempt to say how. Held
 * flat it is a floor rather than a guess — rents have to fall for the real
 * figure to be lower — and saying that is more useful than picking a growth
 * rate nobody published.
 *
 * Compared against FRICTION, not against the whole cost. Rent is money gone;
 * so are the duties, the interest and the commission. The loan principal and
 * the CPF refund are not gone, they are yours in another form, and putting
 * them on the same side as rent would make ownership look far worse than it
 * is. This comparison is the two piles of money that no longer exist.
 */
export function rentInstead({ monthlyRent, yearsHeld, friction }) {
  const months = Math.max(0, Math.round((Number(yearsHeld) || 0) * 12));
  const rent = Number(monthlyRent) || 0;
  if (!rent || !months) return null;
  const paid = rent * months;
  return {
    monthlyRent: Math.round(rent),
    months,
    paid: Math.round(paid),
    friction: Math.round(friction),
    /** Positive means owning cost more than renting would have, before any
     *  change in what the home is worth. */
    difference: Math.round(friction - paid),
    heldFlat: true,
  };
}

export function ledger({
  price,
  purchaseDate,
  propertyType = 'PRIVATE',
  buyerProfile = 'SC',
  propertyCount = 1,
  loan = 0,
  loanRate = 0.026,
  loanYears = 25,
  cashDown = 0,
  cpfDown = 0,
  cpfMonthly = 0,
  yearsHeld = 5,
  agentFeePct = 2,
  legalBuy = 3000,
  legalSell = 2800,
  monthlyRent = null,
}) {
  const months = Math.max(0, Math.round(yearsHeld * 12));

  /* ── what it cost to get in ─────────────────────────────────────────────── */
  const duty = bsd(price);
  const extra = absd(price, buyerProfile, propertyCount);
  const entry = { bsd: duty.total, absd: extra.total, absdRate: extra.rate, legal: legalBuy };
  entry.total = entry.bsd + entry.absd + entry.legal;

  /* ── what the loan has cost so far ──────────────────────────────────────── */
  // amortise() returns one row per year, which is the resolution this asks
  // for: the ledger is read at whole years held. Holding past the end of the
  // tenure is not an error — the loan is simply gone and the interest stops.
  const sched = loan > 0 ? amortise({ principal: loan, annualRate: loanRate, years: loanYears }) : null;
  const impossible = Boolean(sched?.impossible);
  const rows = impossible ? [] : (sched?.byYear || []).slice(0, Math.round(yearsHeld));
  const interestPaid = rows.reduce((a, r) => a + r.interest, 0);
  const outstanding = rows.length ? rows[rows.length - 1].balance : loan;
  const instalment = sched?.instalment ?? 0;

  /* ── CPF, and the interest running against it the whole time ────────────── */
  /* HOW LONG ANYTHING FLOWS. An instalment is paid until the loan is repaid and
   * not one month longer, so a reader holding past the end of the tenure must
   * stop putting money in. Both bugs this replaces were the same mistake in
   * different clothes: money flowing into a mortgage that is not there.
   *   - No loan at all, because the down payments covered the price.
   *   - A loan that ended years before the sale. */
  const loanMonths = impossible ? 0 : (sched?.months ?? 0);
  const payingMonths = Math.min(months, loanMonths);

  /* CPF cannot pay more of an instalment than the instalment is. Where a
   * reader enters more, the excess simply stays in their Ordinary Account
   * earning the same rate — it never goes into the property, so it is not in
   * this ledger. The clamp is REPORTED rather than applied quietly: a control
   * that silently uses a different number from the one typed into it is the
   * failure this repo has already recorded once. */
  const cpfWanted = Math.max(0, cpfMonthly);
  const cpfPerMonth = payingMonths > 0 ? Math.min(cpfWanted, instalment) : 0;
  const cpfClamped = payingMonths > 0 && cpfWanted > instalment;
  const cpf = cpfAccrual({ lump: cpfDown, monthly: cpfPerMonth, months, payingMonths });

  /* ── cash actually out of pocket ────────────────────────────────────────── */
  // Stamp duty is counted as cash. BSD is often reimbursed from CPF, which
  // moves money between these two columns without changing the total — the
  // caveat says so rather than the tool pretending to know which.
  const cashAtEntry = cashDown + entry.total;
  const cashPerMonth = payingMonths > 0 ? Math.max(0, (instalment || 0) - cpfPerMonth) : 0;
  const cashIn = cashAtEntry + cashPerMonth * payingMonths;

  /* ── what it will cost to get out ───────────────────────────────────────── */
  const agentRate = (agentFeePct / 100) * (1 + GST_RATE);
  const saleDate = new Date(new Date(purchaseDate).getTime() + months * (365.25 / 12) * 864e5);
  const sellerDuty = SSD_APPLIES.has(propertyType) && purchaseDate
    ? ssd(price, purchaseDate, saleDate)
    : { rate: 0, total: 0, heldYears: yearsHeld, regime: null, freeAfter: null };

  /* ── the two figures ────────────────────────────────────────────────────── */
  const common = { loan: outstanding, cpfRefund: cpf.total, legal: legalSell, agentRate, ssdRate: sellerDuty.rate };
  const returnOfCash = breakEven({ target: cashIn, ...common });

  /* ── WHY THERE IS NO "WHAT YOUR CASH COULD HAVE EARNED" FIGURE ────────────
   * There was one, and it was wrong. It grew the reader's CASH at the CPF
   * Ordinary Account rate and called the result the price a sale had to reach
   * to keep pace — but cash held outside CPF does not earn the OA rate, and
   * cannot be made to. You cannot put savings into your Ordinary Account to
   * collect 2.5%. It was a benchmark the reader had no access to, quoted as
   * though they had passed it up.
   *
   * It was worst in the case that exposed it: a purchase with NO CPF used at
   * all still reported "to have kept pace with CPF OA, S$2,454,678", applying
   * an account rate to somebody who had touched no account.
   *
   * The OA rate is only ever relevant to CPF THAT WAS USED — and there it is
   * already accounted for, exactly, by the accrued interest below. Money taken
   * out of an OA stops compounding, and the refund on sale puts back what it
   * would have earned. So CPF used on a home earns the OA rate by
   * construction, no more and no less, and there is no gap to report.
   *
   * The honest second figure is what that refund actually means for the
   * seller: principal and accrued interest go back to the ACCOUNT, not into
   * their hands. That is a real, statutory, frequently underestimated number,
   * and unlike the one it replaced it is about money the reader really has.
   *
   * No benchmark is offered for the cash. Doing that needs a market return
   * this repo does not hold and would not source — the same refusal that kept
   * STI, the S&P and gold out of here. */
  const cpfReturns = cpf.total > 0 ? {
    principal: Math.round(cpf.principal),
    interest: Math.round(cpf.interest),
    total: Math.round(cpf.total),
    rate: CPF_OA_RATE,
    /** The share of the refund that is interest rather than money you put in.
     *  On a long hold it passes a third, which is the part nobody expects. */
    interestShare: cpf.total > 0 ? cpf.interest / cpf.total : 0,
  } : null;

  return {
    price, purchaseDate, propertyType, yearsHeld, months,
    entry,
    holding: {
      instalment: Math.round(instalment), interestPaid: Math.round(interestPaid),
      outstanding: Math.round(outstanding), impossible,
      /** Months anything was actually paid, and the year the loan ran out. */
      payingMonths, loanMonths,
      repaidInYear: loanMonths && months > loanMonths ? Math.ceil(loanMonths / 12) : null,
    },
    cpf: { principal: Math.round(cpf.principal), interest: Math.round(cpf.interest), total: Math.round(cpf.total), rate: CPF_OA_RATE },
    cash: { atEntry: Math.round(cashAtEntry), perMonth: Math.round(cashPerMonth), total: Math.round(cashIn) },
    /** What the reader asked for against what the instalment could absorb. */
    cpfEntry: { wanted: Math.round(cpfWanted), used: Math.round(cpfPerMonth), clamped: cpfClamped },
    exit: { agentFeePct, agentRate, gstRate: GST_RATE, legal: legalSell, ssd: sellerDuty },
    /** Everything that leaves and does not come back, whatever the sale fetches. */
    friction: Math.round(entry.total + interestPaid + legalSell),
    /** What goes back to the CPF account rather than to the seller. Null when
     *  no CPF was used, because then there is nothing to say. */
    cpfReturns,
    /** Null until the page knows which home it is talking about. */
    renting: rentInstead({ monthlyRent, yearsHeld, friction: entry.total + interestPaid + legalSell }),
    breakEven: {
      returnOfCash: returnOfCash === null ? null : Math.round(returnOfCash),
    },
    sources: [SOURCES.bsd, SOURCES.absd, ...(sellerDuty.rate ? [SOURCES.ssd] : []), SOURCES.cpf],
    omissions: [
      monthlyRent
        ? 'Future rent movements. The comparison above holds today\u2019s filed median flat for '
          + 'the whole period and does not forecast. Rents move; held flat this is a floor, '
          + 'because rents would have to FALL for the real figure to come in lower.'
        : 'Rent. The alternative to buying is renting, and this calculator does not know which '
          + 'home you mean, so it cannot look one up. Name a project and it will read the filed '
          + 'tenancy contracts for it. Until then this is the largest figure not in the ledger, '
          + 'and note which way that points: the monthly instalments ARE charged as interest '
          + 'they could have earned elsewhere, and the rent you would have paid instead is NOT '
          + 'credited back.',
      'Maintenance, conservancy or sinking fund, property tax, insurance and renovation. '
      + 'All real, none published per property.',
      'Any change in the property’s value. This ledger is only what it costs to hold; '
      + 'nothing here estimates what it is worth or will be worth.',
    ],
    caveats: [
      'Stamp duty is counted as cash here. Buyer’s Stamp Duty can often be reimbursed from '
      + 'CPF, which moves it between the cash and CPF columns without changing the total.',
      'CPF accrued interest is computed at the Ordinary Account rate. Your actual figure is '
      + 'in your CPF statement and is the one that governs.',
      'If a sale at market value does not cover the loan and the CPF refund, CPF requires no '
      + 'cash top-up of the shortfall. Selling BELOW market value does require one.',
      SSD_APPLIES.has(propertyType)
        ? 'Seller’s Stamp Duty is selected by purchase date — the 4 Jul 2025 change extended the '
          + 'holding period to four years for purchases from that date.'
        : 'No Seller’s Stamp Duty is applied. An HDB flat and an EC bought from the developer are '
          + 'governed by the minimum occupation period instead, which forbids the sale outright '
          + 'rather than taxing it.',
      'Nothing here compares the purchase against an investment return. Cash held outside CPF does '
      + 'not earn the Ordinary Account rate and cannot be made to, so growing it at that rate and '
      + 'calling the result a benchmark would be measuring against something you could not have had.',
    ],
  };
}
