/**
 * Only the live site writes to the analytics table.
 *
 * Local development carries the production Supabase keys in .env.local, and
 * for a month every local session was counted as a visitor: /concierge-lab —
 * a page that exists only on a laptop — was in the table on 25 Sep.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { analyticsSink } from '../lib/analytics.js';

test('the production deployment writes to the table', () => {
  assert.equal(analyticsSink({ VERCEL: '1', VERCEL_ENV: 'production' }, { databaseConfigured: true }), 'database');
  assert.equal(analyticsSink({ VERCEL: '1', VERCEL_ENV: 'production' }, { databaseConfigured: false }), 'none',
    'serverless has no durable disk; a file write there is a silent loss');
});

test('local development and preview deployments never reach the table', () => {
  assert.equal(analyticsSink({}, { databaseConfigured: true }), 'file',
    'a local next dev session with the production keys was counted as a visitor');
  assert.equal(analyticsSink({ VERCEL: '1', VERCEL_ENV: 'preview' }, { databaseConfigured: true }), 'none');
  assert.equal(analyticsSink({ VERCEL: '1', VERCEL_ENV: 'development' }, { databaseConfigured: true }), 'none');
});

test('the route asks analyticsSink before every write', () => {
  const src = readFileSync(path.join(process.cwd(), 'app', 'api', 'track', 'route.js'), 'utf8');
  assert.match(src, /const sink = analyticsSink\(process\.env, \{ databaseConfigured: configured\(\) \}\);/);
  assert.match(src, /if \(sink === 'database'\) \{/);
  assert.doesNotMatch(src, /if \(configured\(\)\) \{/, 'the route writes to the table whenever keys exist again');
});
