/**
 * The WhatsApp channel is offered where readers finish, and it stays honest.
 *
 * It was a text link at the end of each note and nowhere else. Shervin,
 * 25 Sep: put it on the Blindspot result and the footer, obviously. These
 * guard the placements, the colour rule, and what the offer may claim.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EVENTS, sanitise } from '../lib/analytics.js';

const code = (...p) => readFileSync(path.join(process.cwd(), ...p), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

test('the footer and the Blindspot result carry the offer, and no page shows it twice', () => {
  assert.match(code('components', 'SiteFooter.jsx'), /<FollowWhatsApp where="footer" variant="band" \/>/,
    'the footer lost the channel — it is the one placement on every page');
  assert.match(code('components', 'BlindspotReport.jsx'), /<FollowWhatsApp where="blindspot" variant="row"/,
    'the Blindspot result lost the channel');
  /* The notes carried their own panel directly above the footer band, so the
     same button appeared twice one scroll apart. The band is the offer. */
  for (const p of [['app', 'insights', 'page.jsx'], ['app', 'insights', '[slug]', 'page.jsx']]) {
    assert.doesNotMatch(code(...p), /<Follow\b|<FollowWhatsApp/, `${p.join('/')} prints a second WhatsApp offer above the footer's`);
  }
});

test('it renders nothing when no channel is configured, and opens WhatsApp safely', () => {
  const src = code('components', 'FollowWhatsApp.jsx');
  assert.match(src, /if \(!URL\) return null;/, 'a dead button renders when the channel is unset');
  assert.match(src, /target="_blank" rel="noopener noreferrer"/);
});

test('it promises no frequency and is not WhatsApp green', () => {
  const src = code('components', 'FollowWhatsApp.jsx');
  assert.doesNotMatch(src, /\b(daily|every day|most days|weekly|every week|most weeks)\b/i,
    'the offer promises a cadence the site cannot keep on Shervin’s behalf');
  const css = readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');
  const block = css.slice(css.indexOf('.wafollow{'), css.indexOf('@media(max-width:560px){.wafollow-btn'));
  assert.doesNotMatch(block, /#25D366|#128C7E|#075E54|--up\b|--green/i,
    'the button borrowed a green, which on this site means a price that moved');
  assert.match(block, /\.wafollow-btn\{[^}]*background:var\(--acc\)/, 'the button is no longer the interface teal');
});

test('a click records where it was, and nothing about who', () => {
  assert.equal(EVENTS.FOLLOW, 'follow');
  const out = sanitise({ e: EVENTS.FOLLOW, s: 'abc123', where: 'blindspot', phone: '91234567', url: 'x' });
  assert.deepEqual(Object.keys(out).sort(), ['e', 's', 't', 'where']);
});
