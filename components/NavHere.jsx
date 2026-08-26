'use client';
import { usePathname } from 'next/navigation';
import Nav from './Nav.jsx';

/**
 * Thin client wrapper so the server-rendered nav knows which link is current.
 * Kept separate from Nav.jsx so the nav itself stays a server component and
 * ships no JavaScript beyond this one hook.
 */
export default function NavHere() {
  return <Nav here={usePathname() || ''} />;
}
