import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The palette, measured rather than eyeballed.
 *
 * Three of these were live on the site and none of them looked wrong, which is
 * the whole problem with contrast: the person who cannot see the boundary is
 * not the person choosing the colour. The tokens are read out of globals.css
 * rather than restated here, so a future edit to the palette is what this
 * checks — restating them would only test that this file agrees with itself.
 *
 * WCAG 1.4.11 asks 3:1 of a boundary needed to IDENTIFY a control, and of a
 * focus indicator. It asks nothing of a decorative rule, which is why --line
 * and --line2 are deliberately absent from the non-text block below: they draw
 * hairlines between table rows and around panels, they identify nothing, and
 * darkening them to satisfy a rule that does not apply would turn a warm
 * editorial page into a spreadsheet.
 */
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

/** Read a custom property straight out of :root, so the test tracks the file. */
function token(name) {
  const m = new RegExp(`--${name}\\s*:\\s*(#[0-9A-Fa-f]{6})`).exec(css);
  assert.ok(m, `--${name} is not defined in globals.css`);
  return m[1];
}

const srgb = h => [1, 3, 5].map((_, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255);
const lin = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const L = h => { const [r, g, b] = srgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => {
  const x = L(a), y = L(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const atLeast = (need, fg, bg, what) => {
  const r = ratio(token(fg), token(bg));
  assert.ok(r >= need, `${what}: --${fg} on --${bg} is ${r.toFixed(2)}:1, needs ${need}:1`);
};

/* ── non-text: controls and focus, WCAG 1.4.11 ─────────────────────────────── */

/* --edge exists because this was 1.21:1 — the edge of every input and every
 * segmented control on the site, at a quarter of what it needed. */
test('a control edge is visible on both grounds', () => {
  atLeast(3, 'edge', 'paper', 'input and control borders');
  atLeast(3, 'edge', 'card', 'controls on a white panel');
});

/* The chart plot and the hero search both rang with --acc-lit at 2.05:1. The
 * palette already forbade it — --acc-lit is data that is live or selected and
 * "never a border" — so WCAG and the house rule agreed. */
test('a focus ring is visible, and is not the data colour', () => {
  atLeast(3, 'acc', 'paper', 'focus ring');
  const lit = ratio(token('acc-lit'), token('paper'));
  assert.ok(lit < 3, 'if --acc-lit now clears 3:1 this test needs rewriting, not deleting');
  assert.doesNotMatch(css, /outline:\s*\d+px\s+solid\s+var\(--acc-lit\)/,
    '--acc-lit is a focus ring again — the palette says it is never a border');
});

/* ── text, WCAG 1.4.3 ──────────────────────────────────────────────────────── */

/* Both pills render at 11px, so they are normal text and need 4.5:1. The
 * negative one sat at 4.31:1. */
test('a price that moved is readable on its own pill', () => {
  atLeast(4.5, 'dn', 'dnS', 'the negative pill');
  atLeast(4.5, 'up', 'upS', 'the positive pill');
});

/* .prov and .lab carry the source and period CEA PG 02-11 s3.1 requires, at
 * 10px. This is the one text on the site that must be readable. */
test('the provenance line clears AA', () => {
  atLeast(4.5, 'mute', 'paper', '.prov and .lab');
  atLeast(4.5, 'ink2', 'paper', 'body copy');
  atLeast(4.5, 'acc-ink', 'acc-soft', 'the source chip number');
});

/* A decorative rule is exempt, and stating that here stops someone "fixing"
 * it later and flattening the page. */
test('decorative rules are deliberately below the control threshold', () => {
  assert.ok(ratio(token('line'), token('paper')) < 3,
    '--line has been darkened to control strength; use --edge for controls instead');
});
