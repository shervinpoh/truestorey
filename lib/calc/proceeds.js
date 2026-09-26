import { CPF_OA_RATE, GST_RATE } from './constants.js';
import { ssd } from './stampDuty.js';

/**
 * CPF accrued interest, compounded monthly on the OA rate.
 * This is an ESTIMATE. The real figure is in the seller's CPF statement —
 * never present it as authoritative.
 */
export function cpfAccruedInterest(principal, years) {
  if (!principal || !years) return 0;
  return Math.round(principal * (Math.pow(1 + CPF_OA_RATE / 12, years * 12) - 1));
}

/**
 * Net sale proceeds. Works for HDB and private — the difference is that
 * private may incur SSD, HDB resale does not.
 */
export function saleProceeds({
  salePrice,
  outstandingLoan = 0,
  cpfPrincipal = 0,
  yearsHeld = 0,
  agentFeePct = 2,
  legalFees = 2800,
  propertyType = 'HDB',       // 'HDB' | 'PRIVATE'
  purchaseDate = null,        // required for SSD on private
  otherCosts = 0,
  cpfAccruedInterestOverride = null,
}) {
  const estimatedAccrued = cpfAccruedInterest(cpfPrincipal, yearsHeld);
  const hasExactAccrued = cpfAccruedInterestOverride !== null
    && cpfAccruedInterestOverride !== '' && Number.isFinite(Number(cpfAccruedInterestOverride))
    && Number(cpfAccruedInterestOverride) >= 0;
  const accrued = hasExactAccrued ? Math.round(Number(cpfAccruedInterestOverride)) : estimatedAccrued;
  const agentFee = salePrice * (agentFeePct / 100);
  const agentGst = agentFee * GST_RATE;

  let sellerStampDuty = { total: 0, rate: 0 };
  if (propertyType === 'PRIVATE' && purchaseDate) {
    sellerStampDuty = ssd(salePrice, purchaseDate);
  }

  const sellingCosts = agentFee + agentGst + legalFees + sellerStampDuty.total + otherCosts;
  const requiredCpfRefund = cpfPrincipal + accrued;
  const beforeCpf = salePrice - outstandingLoan - sellingCosts;
  const availableForCpf = Math.max(0, beforeCpf);
  const cpfRefundFromProceeds = Math.min(requiredCpfRefund, availableForCpf);
  const afterFullCpfRefund = beforeCpf - requiredCpfRefund;

  return {
    salePrice,
    outstandingLoan,
    cpfPrincipal,
    cpfAccruedInterest: accrued,
    cpfAccruedInterestEstimated: !hasExactAccrued,
    cpfTotalReturned: requiredCpfRefund,
    cpfRefundFromProceeds: Math.round(cpfRefundFromProceeds),
    cpfRefundGap: Math.round(Math.max(0, requiredCpfRefund - cpfRefundFromProceeds)),
    agentFee: Math.round(agentFee + agentGst),
    legalFees,
    ssd: sellerStampDuty,
    otherCosts,
    /** Full-refund arithmetic, retained for callers comparing the same inputs. */
    cashInHand: Math.round(afterFullCpfRefund),
    /** What can actually remain in cash if the sale is accepted at market value. */
    cashProceedsAtMarketValue: Math.round(Math.max(0, afterFullCpfRefund)),
    /** A shortfall that exists before CPF and therefore is not a CPF waiver question. */
    nonCpfCompletionShortfall: Math.round(Math.max(0, -beforeCpf)),
    isEstimate: true,
    caveats: [
      hasExactAccrued
        ? 'Uses the CPF accrued interest entered from your Home ownership dashboard.'
        : 'CPF accrued interest is estimated as one lump at the OA rate. Your actual figure is in the “What happens if” section of your CPF Home ownership dashboard.',
      'If sold at market value and proceeds after the loan cannot cover the CPF refund, CPF Board generally does not require a cash top-up for that gap. A below-market-value sale can require one.',
      'Assumes a clean sale with no outstanding levies, upgrading charges or HDB resale levy.',
      propertyType === 'PRIVATE'
        ? 'SSD schedule is selected by purchase date. The 4 Jul 2025 change extended the holding period to 4 years.'
        : 'HDB resale does not attract SSD.',
    ],
  };
}

/**
 * saleProceeds() as a statement: the price, what comes off it, and what is
 * left, with every line rounded as printed and the last line the arithmetic
 * of the printed lines.
 *
 * ── WHY IT EXISTS ──────────────────────────────────────────────────────────
 * The block page's breakdown listed the CPF refund REQUIRED and the CPF refund
 * PAID FROM THE PROCEEDS both as deductions, so its column never added up —
 * with enough proceeds the same refund came off twice, and without them an
 * obligation sat in the column beside the money that actually moved. Only
 * what the sale pays out comes off here. The obligation, and any gap between
 * it and what the proceeds can pay, is stated beside the statement.
 *
 * The last line is negative when the sale does not cover the loan and costs:
 * that is money to bring to completion, and it is never floored (see the
 * Proceeds.jsx entry in CLAUDE.md).
 */
export function proceedsStatement(r) {
  const lines = [
    { key: 'loan', amount: Math.round(r.outstandingLoan) },
    { key: 'fees', amount: r.agentFee + r.legalFees },
    ...(r.ssd?.total ? [{ key: 'ssd', amount: Math.round(r.ssd.total) }] : []),
    ...(r.otherCosts ? [{ key: 'other', amount: Math.round(r.otherCosts) }] : []),
    { key: 'cpf', amount: r.cpfRefundFromProceeds },
  ];
  const price = Math.round(r.salePrice);
  return { price, lines, left: price - lines.reduce((a, l) => a + l.amount, 0) };
}
