/**
 * No unicode escapes in a .jsx file.
 *
 * Like test/motion.test.js and test/guides.test.js, this reads source rather
 * than rendering anything — Node does not strip JSX and the three-dependency
 * rule is worth more than a transform.
 *
 * WHAT THIS CATCHES:
 *
 * JSX text and JSX attribute values are not JavaScript string literals. They
 * do not process backslash escapes. Write a middot as an escape sequence in
 * either position and the six literal characters are what the reader gets.
 *
 * Four pages shipped that way: /hdb, /hdb/[town], /condo and /landed each
 * printed their provenance line with escape sequences standing in for the
 * separators —
 *
 *     HDB Resale Flat Prices (data.gov.sg) [escape] 2023-08 to 2026-08
 *
 * That is the line CEA PG 02-11 s3.1 exists for. It is also the line least
 * likely to be noticed, because it is 9px grey mono at the bottom of the page
 * and nobody proof-reads the part they have read a hundred times. A block page
 * beside it rendered the same separator correctly, which is what made it look
 * fine at a glance.
 *
 * The trap is that the same escape DOES work one line away, inside a template
 * literal in an expression — so the file looks internally consistent and half
 * of it is wrong. That asymmetry is the failure someone could actually cause,
 * and it is invisible in review.
 *
 * The rule asserted is deliberately blunter than the bug: no unicode escape
 * anywhere in a .jsx file, not merely none in JSX positions. Telling those
 * positions apart needs a parser, and this repo writes real characters in
 * every other file. A blunt rule with no false positives beats a clever one
 * that needs maintaining.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** Every .jsx under a directory, recursively. */
function jsxFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      jsxFiles(p, out);
    } else if (e.name.endsWith('.jsx')) out.push(p);
  }
  return out;
}

const ESCAPE = /\\u[0-9a-fA-F]{4}/;

test('no unicode escape sequences in any .jsx file', () => {
  const root = process.cwd();
  const files = [
    ...jsxFiles(path.join(root, 'app')),
    ...jsxFiles(path.join(root, 'components')),
  ];

  // If this ever finds nothing to read, the walk is broken, not the codebase.
  assert.ok(files.length > 20, `expected to find .jsx files, found ${files.length}`);

  const bad = [];
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const m = line.match(ESCAPE);
      if (m) bad.push(`${path.relative(root, f)}:${i + 1} — ${m[0]}, write the character itself`);
    });
  }

  assert.deepEqual(bad, [], `unicode escapes in JSX:\n${bad.join('\n')}`);
});
