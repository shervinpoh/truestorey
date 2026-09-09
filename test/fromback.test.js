/**
 * "Back to the property" is a link built from the URL, which means anyone can
 * put anything in it.
 *
 * A record page forks into five tools. Two carried ?from= and rendered a way
 * back; three did not, so opening Compare or MOP from a block was a one-way
 * trip. Closing that gap means reading a destination out of the query string
 * — and an unchecked one would render a link to wherever an attacker chose,
 * on a page carrying a CEA registration number. A phishing hop with this
 * site's name on it is a worse outcome than the missing link.
 *
 * Only a same-origin path to a record is accepted. Everything else renders
 * nothing, which is the same answer as not having come from anywhere.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { safeFrom } from '../lib/fromback.js';

test('a real record path is accepted', () => {
  for (const p of ['/hdb/ang-mo-kio/570-ang-mo-kio-ave-3', '/condo/d-leedon', '/landed/kew-drive']) {
    assert.equal(safeFrom(p), p);
  }
  // A query or hash on the way in is dropped, not carried into the link.
  assert.equal(safeFrom('/condo/d-leedon?x=1#y'), '/condo/d-leedon');
});

test('nothing that could leave the site is accepted', () => {
  for (const bad of [
    'https://evil.example/x',      // absolute
    '//evil.example/x',            // protocol-relative
    'http:/evil.example',
    '/\\evil.example',             // backslash, which some parsers read as a slash
    'javascript:alert(1)',
    '',
    null,
    undefined,
  ]) {
    assert.equal(safeFrom(bad), null, `${JSON.stringify(bad)} was accepted`);
  }
});

test('an internal path that is not a record is refused', () => {
  // The link says "back to the property". It must not point at a tool, an
  // article, or anything else that is not one.
  for (const p of ['/tools', '/insights/some-note', '/hdb', '/hdb/../../etc', '/studio']) {
    assert.equal(safeFrom(p), null, `${p} was accepted as a record`);
  }
});

test('every tool a record page forks into can get the reader back', () => {
  const record = readFileSync(path.join(process.cwd(), 'components', 'RecordPage.jsx'), 'utf8');
  const fork = record.slice(record.indexOf('function Fork'));

  /* Line by line, not one regex over the whole expression: an href like
     `/compare?a=${encodeURIComponent(href)}&from=...` contains braces and
     backticks, and a character-class regex stops inside the first ${...} —
     which reported a link that DOES carry ?from= as one that does not. The
     first version of this test failed on correct code for that reason. */
  const missing = [];
  for (const line of fork.split('\n')) {
    const m = /href=[{"'`]+(\/[a-z]+)/i.exec(line);
    if (!m) continue;
    const route = m[1];
    // Anchors stay on the page; a guide is not property-specific.
    if (route.startsWith('/guides')) continue;
    if (!/from=/.test(line)) missing.push(`${route}  —  ${line.trim().slice(0, 70)}`);
  }
  assert.deepEqual(missing, [],
    'these fork links are one-way trips:\n  ' + missing.join('\n  '));

  /* planHref is built outside the fork, so the line check cannot see it. */
  assert.match(record, /const planHref = [^;]*from=\$\{encodeURIComponent/,
    'the planner link no longer carries the record it came from');
});
