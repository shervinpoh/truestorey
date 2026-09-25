/**
 * The tool icons. One line weight, one grid, drawn here rather than taken from
 * a set — three npm dependencies is the architecture, and an icon library
 * would be a fourth for sixteen drawings.
 *
 * WHY TOOLS HAVE ICONS NOW. Shervin, 26 Sep: the useful tools are overlooked,
 * and he could not find the one he wanted himself. A list of sixteen names is
 * read; a grid of sixteen shapes is scanned, and scanning is what a first-time
 * visitor does. Each icon is the object the tool is about — a wallet for what
 * you can afford, a calendar for when you can sell — never a decoration.
 *
 * Stroke only, in currentColor, so an icon takes the colour of whatever holds
 * it and the palette rules in globals.css govern it like any text.
 */
const P = {
  afford: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1.2" /></>,
  crane: <><path d="M6 21V3" /><path d="M6 3h13" /><path d="M6 7l4-4" /><path d="M17 3v5" /><path d="M15 8h4v3h-4z" /><path d="M3 21h7" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  stamp: <><path d="M9.5 3h5v5.5l2.5 3.5H7l2.5-3.5z" /><path d="M5 15h14v3H5z" /><path d="M5 21h14" /></>,
  check: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /><path d="M8.3 12.8V10.6l2.7-2.1 2.7 2.1v2.2" /></>,
  compare: <><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /><path d="M5.5 9h2M5.5 13h2M16.5 9h2M16.5 13h2" /></>,
  floors: <><rect x="4" y="3" width="10" height="18" rx="1" /><path d="M7 7h4M7 11h4M7 15h4" /><path d="M19 18V6" /><path d="m16.5 8.5 2.5-2.5 2.5 2.5" /></>,
  plan: <><rect x="3" y="3" width="18" height="18" rx="1.5" /><path d="M3 12h7v9" /><path d="M14 3v6h7" /><path d="M14 13v3" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m9 15.5 2 2 4-4" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9" /><path d="m16.5 6.5 3 3" /><path d="m14 9 2 2" /></>,
  hourglass: <><path d="M7 3h10M7 21h10" /><path d="M8 3c0 5 8 5 8 9s-8 4-8 9" /><path d="M16 3c0 5-8 5-8 9s8 4 8 9" /></>,
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="m12 12 6-6" /></>,
  map: <><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" /><path d="M9 4v13.5M15 6.5V20" /></>,
  plot: <><rect x="3" y="9.5" width="18" height="11" rx="1" strokeDasharray="2.6 2.4" /><path d="M11 15V3.5l5.5 2.6L11 8.7" /></>,
  percent: <><path d="M4 11 12 4l8 7v9H4z" /><path d="m9.5 17.5 5-5" /><circle cx="9.7" cy="12.7" r=".9" /><circle cx="14.3" cy="17.3" r=".9" /></>,
  chart: <><path d="M3 20h18" /><path d="m5 16 4-5 4 3 6-8" /></>,
  book: <><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19" /></>,
  pen: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 9.5V20h12V9.5" /></>,
  building: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
};

export default function Icon({ name, size = 20, className = 'ico', title }) {
  const d = P[name];
  if (!d) return null;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} focusable="false">
      {title && <title>{title}</title>}
      {d}
    </svg>
  );
}

export const ICONS = Object.keys(P);
