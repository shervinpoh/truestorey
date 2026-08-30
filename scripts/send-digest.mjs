/**
 * The block digest — what was filed at a watched block since the last one.
 *
 * RUNS AFTER THE DATA REFRESH, not on a schedule of its own. The workflow that
 * ingests and commits data/ is the only thing that can create news here, so
 * running on any other clock would either send nothing or send it twice.
 *
 * ── AN EXIT CODE IS A CLAIM, NOT EVIDENCE ───────────────────────────────────
 *
 * This repo has been bitten by that: `sync` read exit codes, printed "All 1
 * refreshed" over a dataset it had not refreshed, and the scheduled workflow
 * went green. So this prints, per watch, what it found and what it did, counts
 * every outcome, and exits non-zero if any send failed. A run that sends
 * nothing because nothing happened says so in those words, and is not the same
 * output as a run that sent nothing because it could not.
 *
 * ── THE WATERMARK ONLY MOVES ON A CONFIRMED SEND ────────────────────────────
 *
 * If the send fails the mark stays where it was, so the next run retries the
 * same news rather than skipping it. Moving the mark first would lose a
 * transaction permanently on one bad HTTP response, and nobody would ever know
 * which one.
 *
 *   npm run digest           send
 *   npm run digest -- --dry  resolve and render everything, send nothing
 */
import fs from 'node:fs/promises';
import { newSince } from '../lib/watch.js';
import { renderDigest } from '../lib/digest.js';
import { send, configured as mailConfigured } from '../lib/email.js';
import { watchesFor, markWatchSent, configured as dbConfigured } from '../lib/supabase/rest.js';

const DRY = process.argv.includes('--dry');

const read = async f => JSON.parse(await fs.readFile(new URL(`../data/${f}`, import.meta.url), 'utf8'));

/* The join key every other block lookup on this site uses. */
const slug = n => String(n).toUpperCase().replace(/&/g, ' AND ')
  .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
const hrefOf = r => `/hdb/${slug(r.town)}/${slug(`${r.block} ${r.street}`)}`;

async function main() {
  if (!dbConfigured()) { console.error('Supabase is not configured — no watches to read.'); process.exit(1); }
  if (!mailConfigured() && !DRY) {
    console.error('RESEND_API_KEY or DIGEST_FROM is missing. Nothing can be sent.');
    console.error('Run with --dry to see what WOULD go out.');
    process.exit(1);
  }

  const { data: watches, error } = await watchesFor();
  if (error) { console.error('Could not read watches:', error); process.exit(1); }
  if (!watches.length) { console.log('No confirmed watches. Nothing to do.'); return; }

  const hdb = await read('hdb.json');
  const latestMonth = hdb.rows.reduce((m, r) => (r.month > m ? r.month : m), '');
  const meta = { source: hdb.source, accessedAt: hdb.accessedAt, latestMonth };

  // One pass over 80,942 rows, not one per watch.
  const byHref = new Map();
  for (const r of hdb.rows) {
    const h = hrefOf(r);
    if (!byHref.has(h)) byHref.set(h, []);
    byHref.get(h).push(r);
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://truestorey.vercel.app').replace(/\/$/, '');
  const agent = {
    name: process.env.NEXT_PUBLIC_AGENT_NAME || 'Shervin Poh',
    cea: process.env.NEXT_PUBLIC_CEA_REG || 'R066925H',
    agency: process.env.NEXT_PUBLIC_AGENCY || 'Huttons Asia Pte Ltd',
  };

  let sent = 0, quiet = 0, failed = 0, missing = 0;

  for (const w of watches) {
    const rows = byHref.get(w.href);
    if (!rows) {
      // The block is in nobody's data. Say so and leave the mark alone — this
      // is a watch on an address the dataset does not cover, which is a fact
      // worth seeing rather than a silent skip.
      console.log(`  ⚠ ${w.href} — no rows in hdb.json for this block`);
      missing++;
      continue;
    }

    const { fresh, mark, firstRun } = newSince(rows, { month: w.mark_month, n: w.mark_n });

    if (firstRun) {
      console.log(`  · ${w.href} — first run, watermark set at ${mark.month} (${mark.n})`);
      if (!DRY) await markWatchSent(w.id, mark);
      quiet++;
      continue;
    }
    if (!fresh.length) { console.log(`  · ${w.href} — nothing new`); quiet++; continue; }

    const unsubscribeUrl = `${siteUrl}/api/watch/unsubscribe?t=${encodeURIComponent(w.unsub_token)}`;
    const { subject, text, html } = renderDigest({
      label: w.label, href: w.href, fresh, meta, siteUrl, unsubscribeUrl, agent,
    });

    if (DRY) {
      console.log(`  → ${w.email}  "${subject}"  (${fresh.length} rows, not sent)`);
      sent++;
      continue;
    }

    const res = await send({ to: w.email, subject, text, html, unsubscribeUrl });
    if (!res || res.error) {
      // The mark does NOT move. The next run retries this same news.
      console.error(`  ✗ ${w.email} ${w.href} — ${res?.error || 'sender not configured'}`);
      failed++;
      continue;
    }
    await markWatchSent(w.id, mark);
    console.log(`  ✓ ${w.email} ${w.href} — ${fresh.length} filed, watermark → ${mark.month} (${mark.n})`);
    sent++;
  }

  console.log(`\n${DRY ? 'DRY RUN. ' : ''}${sent} sent · ${quiet} with no news · `
            + `${missing} on blocks absent from the data · ${failed} failed`);
  console.log(`Source: ${meta.source} · registrations to ${latestMonth} · pulled ${meta.accessedAt.slice(0, 10)}`);
  if (failed) process.exit(1);
}

main().catch(e => { console.error('DIGEST FAILED:', e.message); process.exit(1); });
