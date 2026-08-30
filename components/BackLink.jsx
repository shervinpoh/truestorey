'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { parentOf } from '../lib/nav.js';

/**
 * One step back up, on every page that has somewhere to go.
 *
 * WHY THIS IS NOT A BROWSER-BACK BUTTON. `router.back()` goes wherever the
 * reader came FROM, which on this site is usually a search engine — most
 * traffic lands deep, on a block page, and sending someone "back" to Google is
 * not navigation. This goes UP: from a block to its town, from a town to the
 * index, from anything else to home. Where it lands is written on it, so
 * nobody has to press it to find out.
 *
 * WHY NOT JUST THE BREADCRUMBS. There are breadcrumbs, on every page, and they
 * are correct. They are also inside the masthead at the top of the document,
 * and a record page is about 8,500px tall on a phone — so by the time a reader
 * wants to leave, the only way out has been off-screen for eight screenfuls.
 * This sits in the nav, which is sticky, so the way out is wherever they are.
 *
 * DERIVED FROM THE PATH, NOT PASSED IN. The nav is rendered once in the layout
 * and the crumbs are per-page, so threading them through would mean a context
 * provider for one string. The URL already encodes the hierarchy — that is
 * what made it a good URL — and reading it back cannot fall out of step with
 * the page the way a hand-passed prop can.
 */

export default function BackLink() {
  const up = parentOf(usePathname());
  if (!up) return null;
  return (
    <Link href={up.href} className="backup" aria-label={`Back to ${up.label}`}>
      <span aria-hidden="true">←</span>{up.label}
    </Link>
  );
}
