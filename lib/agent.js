/**
 * The CEA particulars, from one place.
 *
 * They were read straight from process.env in app/layout.jsx, which was fine
 * while the footer was the only thing that needed them. /disclosures needs the
 * same four, and two copies of an env-var lookup is how a registration number
 * ends up rendering on one page and not another.
 *
 * NEXT_PUBLIC_ because the footer is required on every page including static
 * ones (CEA PG 02-11 s7.1), so these must be inlined at build time.
 */
export function agent() {
  return {
    name: process.env.NEXT_PUBLIC_AGENT_NAME || '',
    cea: process.env.NEXT_PUBLIC_CEA_REG || '',
    agency: process.env.NEXT_PUBLIC_AGENCY || '',
    lic: process.env.NEXT_PUBLIC_AGENCY_LICENCE || '',
    phone: process.env.NEXT_PUBLIC_AGENT_PHONE || '',
  };
}
