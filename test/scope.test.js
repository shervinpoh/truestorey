import test from 'node:test';
import assert from 'node:assert/strict';
import { offIslandSubject } from '../lib/scope.js';

/**
 * The tracker answered "what are house prices doing in Manchester?" in full,
 * with UK ONS figures, from the live route — after refusing the identical
 * question on every probe of the system prompt that was meant to stop it.
 *
 * So the boundary moved out of the prompt and into a list, and this is the
 * test that the list holds. The second half is the more important half: a
 * Singapore question that happens to mention somewhere else must still be
 * answered, or the guard is worse than the bug.
 */

test('the question that shipped is refused', () => {
  assert.equal(offIslandSubject('What are house prices doing in Manchester?'), 'Manchester');
});

test('the neighbours are refused, and named as the reader wrote them', () => {
  assert.equal(offIslandSubject('Is it a good time to buy in Johor Bahru?'), 'Johor Bahru');
  assert.equal(offIslandSubject('property prices in KUALA LUMPUR'), 'KUALA LUMPUR');
  assert.equal(offIslandSubject('Should I buy a condo in Batam?'), 'Batam');
});

test('the longest match is the one named back', () => {
  // "johor" also matches; the reader asked about Johor Bahru.
  assert.equal(offIslandSubject('What is happening in Johor Bahru?'), 'Johor Bahru');
  assert.equal(offIslandSubject('New York rents'), 'New York');
});

/* ── the half that must not over-fire ──────────────────────────────────────── */

test('naming Singapore makes a comparison ours to answer', () => {
  assert.equal(offIslandSubject('How do Malaysian buyers affect Singapore prices?'), null);
  assert.equal(offIslandSubject('Is Sengkang cheaper than Johor?'), null);
  assert.equal(offIslandSubject('Does the Hong Kong stamp duty resemble ABSD?'), null);
});

test('ordinary questions pass untouched', () => {
  for (const q of [
    'East Coast',
    'What has been announced for Bishan in the last six months?',
    'Tengah — what is completing and when?',
    'Any policy change affecting HDB resale this quarter?',
    '406 Ang Mo Kio Ave 10',
    'Which blocks in Queenstown are reaching MOP?',
  ]) assert.equal(offIslandSubject(q), null, `wrongly refused: ${q}`);
});

/*
 * Half of Singapore's map is named after somewhere else. Each of these is a
 * real Singapore place that a careless denylist would refuse, and Queenstown is
 * the one that would hurt most — it is an HDB town with its own page here.
 */
test('a Singapore place that shares a foreign name is still Singapore', () => {
  for (const q of [
    'Queenstown resale prices',        // and New Zealand
    'Holland Village amenities',       // and the Netherlands
    'The Florence Residences',         // and Italy
    'Newton MRT',                      // and Massachusetts
    'Clementi',                        // and California
    'Woodlands',                       // and half the English-speaking world
    'Kensington Park',                 // and London
    'Marine Parade',
    'Sixth Avenue',
    'Chinatown food centre',           // must not trip "china"
    'Balestier Road shophouses',       // must not trip "bali"
    'Are Indian buyers active here?',  // "indian" is not "india"
  ]) assert.equal(offIslandSubject(q), null, `wrongly refused: ${q}`);
});

test('a word boundary is required, so substrings do not fire', () => {
  assert.equal(offIslandSubject('usual conditions for resale'), null);   // not "usa"
  assert.equal(offIslandSubject('Tell us about Tampines'), null);        // not "u.s."
  assert.equal(offIslandSubject('Chinatown'), null);
});

test('an empty question is not a refusal', () => {
  assert.equal(offIslandSubject(''), null);
  assert.equal(offIslandSubject('   '), null);
  assert.equal(offIslandSubject(null), null);
});

test('the route decides scope before it calls the model', async () => {
  const src = await import('node:fs').then(fs =>
    fs.promises.readFile(new URL('../app/api/ai/neighbourhood/route.js', import.meta.url), 'utf8'));
  const guard = src.indexOf('offIslandSubject(');
  const call = src.indexOf('perplexityStream(');
  assert.ok(guard > 0 && call > 0, 'route no longer guards or no longer calls');
  assert.ok(guard < call, 'the scope check must run before a retrieval call is spent');
  // The refusal reaches the client in the provider's own event shape, so the
  // stream reader keeps one path through it.
  assert.match(src, /data: \$\{frame\}\\n\\ndata: \[DONE\]/);
});
