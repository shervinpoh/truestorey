/**
 * Preflight is the diagnosis when an optional integration cannot answer.
 * A network failure used to return `{ status: 0, error }`; the events check
 * fell through to `JSON.stringify(undefined).slice(...)` and the diagnostic
 * command crashed before printing any integration state at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../scripts/preflight.mjs', import.meta.url), 'utf8');

test('preflight can report a request that received no response body', () => {
  assert.match(src, /const brief = body => \(JSON\.stringify\(body\) \|\| 'no response body'\)\.slice/,
    'preflight has no safe formatter for a request that failed before a response');
  assert.doesNotMatch(src, /JSON\.stringify\(r\.body\)\.slice/,
    'an integration error path can still slice an undefined response body');
});

test('the events check names an unreachable Supabase instead of parsing it', () => {
  const events = src.slice(src.indexOf('// The events table.'), src.indexOf('// The RLS check.'));
  assert.match(events, /r\.status === 0[^\n]*Supabase · events reachable[^\n]*r\.error/,
    'the events probe no longer handles a network failure before inspecting its body');
});
