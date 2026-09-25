import { MARK_BG, MARK_SHAPES } from '../lib/mark.js';

/**
 * The mark as absolutely positioned boxes, which is what next/og's renderer
 * can draw (it has no SVG <rect> fill for opacity layers). `inset` leaves a
 * margin for the maskable Android icon, whose outer ring a launcher may crop.
 */
export default function MarkPng({ size, radius = size * 0.25, inset = 0 }) {
  const k = (size - inset * 2) / 32;
  return (
    <div style={{ width: size, height: size, display: 'flex', position: 'relative', background: MARK_BG, borderRadius: radius }}>
      {MARK_SHAPES.map((s, i) => (
        <div key={i} style={{ position: 'absolute', left: inset + s.x * k, top: inset + s.y * k, width: s.w * k, height: s.h * k,
          background: s.c, opacity: s.o, borderRadius: s.r * k }} />
      ))}
    </div>
  );
}
