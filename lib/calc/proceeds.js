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
}) {
  const accrued = cpfAccruedInterest(cpfPrincipal, yearsHeld);
  const agentFee = salePrice * (agentFeePct / 100);
  const agentGst = agentFee * GST_RATE;

  let sellerStampDuty = { total: 0, rate: 0 };
  if (propertyType === 'PRIVATE' && purchaseDate) {
    sellerStampDuty = ssd(salePrice, purchaseDate);
  }

  const deductions = outstandingLoan + cpfPrincipal + accrued
    + agentFee + agentGst + legalFees + sellerStampDuty.total + otherCosts;

  return {
    salePrice,
    outstandingLoan,
    cpfPrincipal,
    cpfAccruedInterest: accrued,
    cpfTotalReturned: cpfPrincipal + accrued,
    agentFee: Math.round(agentFee + agentGst),
    legalFees,
    ssd: sellerStampDuty,
    otherCosts,
    cashInHand: Math.round(salePrice - deductions),
    isEstimate: true,
    caveats: [
      'CPF accrued interest is estimated at the OA rate. Your actual figure is in your CPF statement.',
      'Assumes a clean sale with no outstanding levies, upgrading charges or HDB resale levy.',
      propertyType === 'PRIVATE'
        ? 'SSD schedule is selected by purchase date. The 4 Jul 2025 change extended the holding period to 4 years.'
        : 'HDB resale does not attract SSD.',
    ],
  };
}
