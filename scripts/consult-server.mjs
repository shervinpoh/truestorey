/**
 * The consult panel — a local web UI for the tools in lib/consult.
 *
 *   npm run consult
 *
 * ── WHY A LOCAL SERVER AND NOT A PAGE ON THE SITE ──────────────────────────
 * `test/consult-boundary.test.js` forbids anything under app/, components/ or
 * lib/ from importing lib/consult, because that layer produces a point
 * valuation and rule 2 keeps one off any page carrying a CEA registration
 * number. That boundary is the reason the site is safe and it is not being
 * relaxed for a convenience.
 *
 * scripts/ is not scanned, and nothing here is deployed — `next build` never
 * sees this file. So the panel gets the full consult layer, the site gets
 * none of it, and the test that separates them keeps passing.
 *
 * ── ZERO NEW DEPENDENCIES ──────────────────────────────────────────────────
 * node:http, node:fs. Three npm dependencies is the architecture, and a form
 * posting JSON to a local process does not need a framework. The page is one
 * HTML file with vanilla script for the same reason.
 *
 * ── THE PALETTE HAS ONE SOURCE ─────────────────────────────────────────────
 * The :root blocks are read out of app/globals.css at serve time rather than
 * retyped here. The design rules in CLAUDE.md are specific — two teals, radius
 * 3px on a control and 8px on a panel, five type steps — and a second copy of
 * them is a second thing to keep in step with the first.
 *
 * ── IT BINDS TO THE LAN ON PURPOSE ─────────────────────────────────────────
 * So the phone in your pocket can reach it at a viewing, over your own wifi.
 * It has no authentication and it must never be exposed beyond that: it serves
 * point valuations, which is exactly what the boundary above exists to contain.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { search, recordByHref } from '../lib/data/query.js';
import { estimate, clientSafe } from '../lib/consult/avm.js';
import { redact } from '../lib/consult/redact.js';
import { residual } from '../lib/consult/residual.js';
import { score } from '../lib/consult/score.js';
import { outlook } from '../lib/consult/outlook.js';
import { comps, floorMid } from '../lib/blindspot/measure.js';
import { plan } from '../lib/calc/plan.js';
import { saleProceeds } from '../lib/calc/proceeds.js';
import { sellTimeline } from '../lib/calc/timeline.js';
import { RATES_REVIEWED, LTV_REVIEWED, SOURCES } from '../lib/calc/constants.js';
import { parseListing, splitListings } from '../lib/consult/listing.js';
import { sizeCheck, parseListings, importListings, archiveListingUpload, parseRealis,
         saveRealisUpload, rebuildRealis, realisKey, safeName, paths as dataPaths } from '../lib/consult/imports.js';
import { dataStatus } from '../lib/consult/status.js';
import { LEVERS, rateScenario, VERSION as TRANSMISSION_VERSION, REVIEWED as TRANSMISSION_REVIEWED } from '../lib/consult/transmission.js';
import { developmentProfile } from '../lib/consult/development.js';
import { stackProfile, stackAdjust } from '../lib/consult/stacks.js';
import { impliedLaunch, assessLaunch, pipeline as landPipeline, model as breakevenModel } from '../lib/consult/breakeven.js';
import { districts as privateDistricts, projects as privateProjects } from '../lib/consult/privatescan.js';
import { loadReading, refreshReading, readingList, markOpened, SOURCES as READING_SOURCES } from '../lib/consult/reading.js';
import { summarise, signals } from '../lib/consult/listings.js';

const PORT = Number(process.env.CONSULT_PORT || 4173);
const SQFT_PER_SQM = 10.7639;
const ROOT = process.cwd();

const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : null; };
const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

/** The palette, lifted from the site's own stylesheet. */
function tokens() {
  try {
    const css = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8');
    const out = [];
    /* Every :root block, so both the palette and the type ladder come across,
       and the dark one with them. */
    const re = /:root(?:\[data-theme="[a-z]+"\])?\s*\{[^}]*\}/g;
    for (const m of css.matchAll(re)) out.push(m[0]);
    return out.join('\n');
  } catch {
    /* Degrade, never break: the panel is legible without the brand. */
    return ':root{--paper:#F6F5F2;--card:#fff;--ink:#111414;--mute:#666E6A;--line:#E2E0D9;--edge:#8C8B87;--acc:#164F52;--acc-lit:#58BCC3;--acc-soft:#E7F3F3;--on-acc:#F2F8F7;--up:#1E7A5F;--dn:#AE4736;--warn:#AE4736;--r1:3px;--r2:8px;--t-micro:11.5px;--t-small:14px;--t-body:16.5px;--t-lead:20px}';
  }
}

/**
 * What this address actually contains, so the form can fill itself in.
 *
 * Typing a floor area from memory is how a wrong psf gets into a report, and
 * asking somebody to look up the size of a flat they are standing in is the
 * kind of friction that stops a tool being used. Every option offered here is
 * a MEDIAN OF FILED SALES at this address, per flat type.
 */
function recordSummary(href) {
  const rec = recordByHref(href);
  if (!rec) return null;
  const self = comps().records?.[href];
  const sales = self?.sales || [];
  const byType = {};
  for (const [month, psf, areaSqm, type, storey] of sales) {
    (byType[type] ||= []).push({ month, psf, areaSqm, floor: floorMid(storey) });
  }
  const types = Object.entries(byType).map(([type, rows]) => ({
    type, n: rows.length,
    areaSqm: med(rows.map(r => r.areaSqm).filter(Number.isFinite)),
    areaSqft: Math.round((med(rows.map(r => r.areaSqm).filter(Number.isFinite)) || 0) * SQFT_PER_SQM) || null,
    floor: med(rows.map(r => r.floor).filter(Number.isFinite)),
    medianPsf: Math.round(med(rows.map(r => r.psf))),
  })).filter(t => t.areaSqft).sort((a, b) => b.n - a.n);

  return {
    href, label: rec.label, kind: rec.kind, town: rec.town || null,
    types,
    recent: sales.slice(0, 8).map(([month, psf, areaSqm, type, storey]) =>
      ({ month, psf, areaSqm, type, storey })),
  };
}

/* 1MB for a form, more for an upload. An export is text, sent as JSON so the
   server needs no multipart parser — and a limit, because the panel has no
   authentication and a request can say it is anything. */
const readBody = (req, limit = 1e6) => new Promise((resolve, reject) => {
  let b = '';
  req.on('data', c => { b += c; if (b.length > limit) req.destroy(new Error('Too large.')); });
  req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { reject(e); } });
  req.on('error', reject);
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = fs.readFileSync(path.join(ROOT, 'scripts', 'consult-ui.html'), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(html);
    }

    if (url.pathname === '/tokens.css') {
      res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(tokens());
    }

    if (url.pathname === '/api/search') {
      const q = url.searchParams.get('q') || '';
      if (q.trim().length < 2) return json(res, 200, { hits: [] });
      return json(res, 200, { hits: search(q, { limit: 8 }).map(h => ({ href: h.href, label: h.label, kind: h.kind })) });
    }

    if (url.pathname === '/api/record') {
      const s = recordSummary(url.searchParams.get('href') || '');
      return s ? json(res, 200, s) : json(res, 404, { error: 'No record at that address.' });
    }

    if (url.pathname === '/api/report' && req.method === 'POST') {
      const body = await readBody(req);
      const rec = recordByHref(body.href);
      if (!rec) return json(res, 404, { error: 'No record at that address.' });

      const areaSqft = Number(body.areaSqft);
      const floor = Number(body.floor) > 0 ? Number(body.floor) : null;
      const price = Number(body.price) > 0 ? Number(body.price) : null;
      const years = Number(body.years) > 0 ? Number(body.years) : 7;

      const est = estimate(rec, { areaSqft, floor });
      /* A unit number turns four unobservable attributes into one measured
         premium — but only for a private project a REALIS export covers, and
         only ever as its own line beside the estimate. See stackAdjust. */
      const stackRes = rec.kind !== 'HDB' && body.stack
        ? stackAdjust(rec.label, body.stack) : null;
      const out = {
        /* District and tenure travel too: the client document's header line
           reads "1,044 sqft · storey 18 · District 09 · Freehold", and it
           was printing the first two only because the payload stopped there. */
        record: { href: rec.href, label: rec.label, kind: rec.kind, town: rec.town || null,
                  district: rec.district || null,
                  tenure: [...new Set((rec.recent || []).map(x => x.tenure).filter(Boolean))][0] || null },
        input: { areaSqft, floor, price, years },
        estimate: body.clientSafe && est.ok ? clientSafe(est) : est,
        stack: stackRes,
        clientSafe: Boolean(body.clientSafe),
        score: score(rec),
        residual: price ? residual(rec, { asking: price, areaSqft, floor }) : null,
        outlook: outlook(rec, { areaSqft, floor, years, price, since: body.since || null }),
        generatedAt: new Date().toISOString(),
      };
      /* Default-deny, applied to the whole report rather than to the one
         field somebody remembered. Both export buttons serialise the rendered
         page, so anything that reaches the browser reaches the client. */
      return json(res, 200, body.clientSafe ? redact(out) : out);
    }

    /**
     * ── THE CALCULATORS ─────────────────────────────────────────────────
     * lib/calc was written, tested and then reachable only from the site.
     * Every rate in it carries a source and a review date from
     * lib/calc/constants.js, which is the single source of truth for all of
     * them — nothing is re-declared here, and `reviewed` travels with every
     * answer so a stale rate is visible rather than assumed current.
     */
    /* The island scan's last result. A cache with its own date on it — a
       farming list whose age is invisible is one somebody acts on a month
       after the market moved. */
    if (url.pathname === '/api/scan') {
      const f = path.join(ROOT, 'data', '.scan.json');
      if (!fs.existsSync(f)) {
        return json(res, 404, { error: 'No scan has been run yet. Run `npm run scan` — it takes a few minutes over ~9,500 blocks.' });
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(fs.readFileSync(f, 'utf8'));
    }

    /**
     * ── PARSE A PASTE ───────────────────────────────────────────────────
     * Text the user pasted, never a page this process fetched. See the header
     * of lib/consult/listing.js for why that distinction is load-bearing.
     * Each listing is resolved to a record and size-checked against what that
     * address has actually filed, because an overstated area understates the
     * psf and would rank as a discount.
     */
    /**
     * The accumulated listings store. Read-only here — it is built by
     * `npm run ingest:listings`, because folding a snapshot in is a decision
     * (full sweep or partial) and not something a page refresh should make.
     */
    if (url.pathname === '/api/listings') {
      const f = path.join(ROOT, 'data', '.listings.json');
      if (!fs.existsSync(f)) {
        return json(res, 404, { error: 'No listings have been ingested yet. Drop a CSV into data/listings/ and run `npm run ingest:listings`.' });
      }
      const store = JSON.parse(fs.readFileSync(f, 'utf8'));
      const all = Object.values(store.listings).map(L => ({ ...L, ...summarise(L) }));
      return json(res, 200, {
        updatedAt: store.updatedAt,
        snapshots: store.snapshots.length,
        since: store.snapshots[0]?.at || null,
        active: all.filter(L => L.status === 'active').length,
        known: all.length,
        signals: signals(store).map(L => ({ href: L.href, label: L.label, url: L.url, price: L.price,
          areaSqft: L.areaSqft, floor: L.floor, unit: L.unit, cuts: L.cuts, days: L.days,
          domIsFloor: L.domIsFloor, movePct: L.movePct, why: L.why })),
        listings: all,
      });
    }

    if (url.pathname === '/api/parse' && req.method === 'POST') {
      const b = await readBody(req);
      const out = splitListings(b.text || '').map(chunk => {
        const p = parseListing(chunk);
        if (!p) return null;
        let rec = null, matchedBy = null;
        if (p.addressLine) {
          const hit = search(p.addressLine, { limit: 1 })[0];
          if (hit) { rec = recordByHref(hit.href); matchedBy = 'search'; }
        }
        /* The same like-for-like check the importer uses. This call used to
           pool every flat type at the address and flagged a correct 4-room at
           275A Bishan St 24 against a median taken mostly from 5-rooms. */
        const area = (rec && p.areaSqft)
          ? sizeCheck(rec, p.areaSqft, chunk)
          : { ran: false, why: 'No record matched, so there is nothing to compare the size against.' };
        return { ...p, href: rec?.href || null, label: rec?.label || null,
                 kind: rec?.kind || null, matchedBy, areaCheck: area };
      }).filter(Boolean);
      return json(res, 200, { listings: out });
    }

    /** Screen already-parsed listings. Separate from /api/parse so a correction
     *  typed into the table is what gets screened, not the original paste. */
    if (url.pathname === '/api/screen' && req.method === 'POST') {
      const b = await readBody(req);
      const out = (b.listings || []).map(L => {
        const rec = L.href ? recordByHref(L.href) : null;
        if (!rec) return { ...L, ok: false, reason: 'No record matched that address.' };
        if (!(Number(L.price) > 0) || !(Number(L.areaSqft) > 0)) {
          return { ...L, ok: false, reason: 'Needs both a price and a floor area.' };
        }
        const res2 = residual(rec, { asking: Number(L.price), areaSqft: Number(L.areaSqft),
                                     floor: Number(L.floor) || null });
        const sc = score(rec);
        return { ...L, label: rec.label, town: rec.town || null, ok: res2.ok,
                 reason: res2.reason || null, residual: res2.ok ? res2 : null,
                 score: sc.ok ? { points: sc.points, max: sc.max, ratio: sc.ratio } : null };
      });
      return json(res, 200, { screened: out, generatedAt: new Date().toISOString() });
    }

    /**
     * ── THE DATA PAGE ───────────────────────────────────────────────────
     * Preview writes nothing. It shows how the columns were read, what could
     * not be matched, and what the import WOULD do — for listings, both as a
     * full sweep and as a partial, because that choice decides what gets
     * marked gone and a person should see the number before making it.
     */
    const UPLOAD_LIMIT = 40e6;
    const uploads = b => (Array.isArray(b.files) ? b.files : [])
      .slice(0, 12).map(f => ({ name: safeName(f.name), text: String(f.text || '') }));
    const slimFile = p => {
      const { rows, ...rest } = p;
      return { ...rest, rows: Array.isArray(rows) ? rows.length : 0, sample: Array.isArray(rows) ? rows.slice(0, 6) : [] };
    };

    /**
     * The briefing: the written transmission map, plus whatever the indices
     * currently read. Not a news feed — nothing here reproduces reporting;
     * primary sources are linked and the reasoning is the repo's own.
     */
    /* One development profiled, rather than one unit priced — see the header
       of lib/consult/development.js for why those are different operations. */
    if (url.pathname === '/api/development') {
      const p = developmentProfile(url.searchParams.get('href') || '');
      /* Stacks come from a licensed REALIS export and exist for private
         projects only — an HDB block has no stack in the sense that matters,
         because its units do not sit above each other by unit number. The
         profile stays usable when no export has been imported: the panel
         prints the reason instead of the table. */
      if (p.ok && p.identity?.kind !== 'HDB') p.stacks = stackProfile(p.identity.label);
      return json(res, p.ok ? 200 : 404, p);
    }

    /**
     * The private half of the farming list. Condominium resales only, each
     * district fitted on its own sales — see lib/consult/privatescan.js for
     * what each number is and, more importantly, what it is not.
     */
    if (url.pathname === '/api/private-scan') {
      const d = privateDistricts();
      if (!d.ok) return json(res, 404, d);
      const p = privateProjects({
        district: url.searchParams.get('district') || null,
        by: url.searchParams.get('by') === 'drift' ? 'drift' : 'gap',
        freehold: url.searchParams.get('tenure') === 'fh' ? true
          : url.searchParams.get('tenure') === 'lh' ? false : null,
        minSales: Number(url.searchParams.get('min')) || 0,
        limit: 60,
      });
      return json(res, 200, { ok: true, districts: d, projects: p });
    }

    /**
     * ── LAND ────────────────────────────────────────────────────────────
     * What a launch has to price at, given what its land cost. The non-land
     * side is measured from past launches rather than taken from a cost
     * guide — see lib/consult/breakeven.js for why that is the honest way
     * round, and scripts/build-breakeven.mjs for what would make it wrong.
     */
    if (url.pathname === '/api/land') {
      const m = breakevenModel();
      if (!m) return json(res, 404, { ok: false, reason: 'No breakeven model has been built. Run `npm run build:breakeven`.' });
      const land = Number(url.searchParams.get('land'));
      const asking = Number(url.searchParams.get('asking'));
      /* Default to the current regime: a land price being priced today is
         almost always a harmonised site. */
      const harmonised = url.searchParams.get('harmonised') !== '0';
      return json(res, 200, {
        ok: true,
        version: m.version, builtAt: m.builtAt,
        fit: m.fit, pooledFit: m.pooledFit, harmonisation: m.harmonisation,
        accuracy: m.accuracy, segmentBias: m.segmentBias,
        window: m.window, dropped: m.dropped, sources: m.sources,
        /* Every joined launch, actual against what its land implied at the
           time. This is the track record AND the finding: it is the only
           view here that says which launches were priced aggressively. */
        observations: m.observations.map(o => {
          /* Each launch read back against the rules it was BUILT under. The
             regime flag was missing here, so the seven pre-harmonisation
             launches were being scored on the harmonised fit — which is the
             exact mistake the two-fit split exists to prevent. */
          const imp = impliedLaunch({ landPsfPpr: o.landPsfPpr, when: o.launch, harmonised: o.harmonised });
          return { ...o, implied: imp.ok ? imp.psf : null, gap: imp.ok ? o.launchPsf / imp.psf - 1 : null };
        }),
        pipeline: landPipeline(),
        implied: land > 0 ? impliedLaunch({ landPsfPpr: land, harmonised }) : null,
        assessed: land > 0 && asking > 0 ? assessLaunch({ landPsfPpr: land, askingPsf: asking, harmonised }) : null,
      });
    }

    /**
     * The reading list. Refreshed when the page is opened and the store is
     * older than six hours — which is a better guarantee of "every day" than
     * a schedule, because a cron on a sleeping laptop does not run and a page
     * you are looking at always does.
     */
    if (url.pathname === '/api/reading') {
      const STALE_MS = 6 * 60 * 60 * 1000;
      let store = loadReading();
      const age = store.updatedAt ? Date.now() - new Date(store.updatedAt).getTime() : Infinity;
      let refreshed = false;
      if (url.searchParams.get('force') === '1' || age > STALE_MS) {
        try { store = await refreshReading(); refreshed = true; }
        catch { /* degrade: serve what is held and let the source rows say so */ }
      }
      const list = readingList(store, {
        limit: Number(url.searchParams.get('limit')) || 60,
        source: url.searchParams.get('source') || null,
        lever: url.searchParams.get('lever') || null,
      });
      /* Marked AFTER the list is built, so "new" means new since the previous
         visit rather than since a second ago. */
      try { markOpened(store); } catch { /* read-only disk is not a reason to fail */ }
      return json(res, 200, {
        ...list, refreshed, updatedAt: store.updatedAt, held: Object.keys(store.items || {}).length,
        sources: (store.sources || []).map(({ key, name, site, ok, items, added, error, fetchedAt, lastGood }) =>
          ({ key, name, site, ok, items, added, error, fetchedAt, lastGood })),
        known: READING_SOURCES.map(s2 => ({ key: s2.key, name: s2.name })),
      });
    }

    if (url.pathname === '/api/briefing') {
      const read = n => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', n), 'utf8')); } catch { return null; } };
      const hdb = read('hdb-index.json'), ppi = read('ppi.json'), sora = read('sora.json');
      return json(res, 200, {
        version: TRANSMISSION_VERSION, reviewed: TRANSMISSION_REVIEWED,
        levers: LEVERS,
        readings: [
          hdb && { key: 'hdb', title: 'HDB Resale Price Index', latest: hdb.latest, qoq: hdb.qoq, yoy: hdb.yoy, source: hdb.source, asOf: hdb.accessedAt },
          ppi && { key: 'ppi', title: 'URA Private Residential Price Index', latest: ppi.latest, qoq: ppi.qoq, yoy: ppi.yoy, source: ppi.source, asOf: ppi.accessedAt },
          /* Said plainly when it is missing. MAS times out under maintenance
             and a rates block that quietly vanished would read as "no change". */
          sora
            ? { key: 'sora', title: 'SORA', latest: sora.latest, source: sora.source, asOf: sora.accessedAt }
            : { key: 'sora', title: 'SORA', missing: true, why: 'MAS eservices did not answer — npm run ingest:sora. Not zero, not unchanged: unknown.' },
        ].filter(Boolean),
      });
    }

    if (url.pathname === '/api/briefing/scenario' && req.method === 'POST') {
      const b = await readBody(req);
      const applicants = (b.applicants || [])
        .map(a => ({ fixedIncome: Number(a.fixedIncome) || 0, variableIncome: 0, age: Number(a.age) || 35 }))
        .filter(a => a.fixedIncome > 0);
      return json(res, 200, rateScenario({
        loan: Number(b.loan), tenureYears: Number(b.tenureYears) || 25,
        from: Number(b.from) / 100, to: Number(b.to) / 100,
        applicants, monthlyDebts: Number(b.monthlyDebts) || 0,
        propertyType: b.propertyType || 'HDB',
      }));
    }

    if (url.pathname === '/api/data/status') {
      return json(res, 200, { items: dataStatus(), generatedAt: new Date().toISOString() });
    }

    if (url.pathname === '/api/data/preview' && req.method === 'POST') {
      const b = await readBody(req, UPLOAD_LIMIT);
      const files = uploads(b);
      if (!files.length) return json(res, 400, { error: 'No files.' });

      if (b.kind === 'listings') {
        const parsed = files.map(f => ({ name: f.name, ...parseListings(f.text) }));
        return json(res, 200, {
          kind: 'listings', files: parsed.map(slimFile),
          asFull: importListings({ parsed, partial: false, dryRun: true }),
          asPartial: importListings({ parsed, partial: true, dryRun: true }),
        });
      }
      if (b.kind === 'realis') {
        const parsed = files.map(f => ({ name: f.name, ...parseRealis(f.text) }));
        const storePath = dataPaths().realisStore;
        const have = new Set(fs.existsSync(storePath)
          ? JSON.parse(fs.readFileSync(storePath, 'utf8')).rows.map(realisKey) : []);
        const rows = parsed.filter(p => p.ok).flatMap(p => p.rows);
        return json(res, 200, {
          kind: 'realis', files: parsed.map(slimFile),
          rows: rows.length,
          withUnitNumber: rows.filter(r => r.stack).length,
          stacks: new Set(rows.filter(r => r.stack).map(r => `${r.project}|${r.stack}`)).size,
          alreadyHeld: rows.filter(r => have.has(realisKey(r))).length,
        });
      }
      return json(res, 400, { error: 'Unknown kind.' });
    }

    if (url.pathname === '/api/data/import' && req.method === 'POST') {
      const b = await readBody(req, UPLOAD_LIMIT);
      const files = uploads(b);
      if (!files.length) return json(res, 400, { error: 'No files.' });
      const at = new Date().toISOString();

      if (b.kind === 'listings') {
        const r = importListings({ files, partial: b.partial, at });
        if (!r.ok) return json(res, 400, { error: r.reason });
        /* Kept with the others it was imported beside, so the record of what
           arrived when is not only the store. */
        const archived = files.map(f => archiveListingUpload(f.name, f.text, { at }));
        return json(res, 200, { kind: 'listings', ...r, archived });
      }
      if (b.kind === 'realis') {
        /* Only files that parse are kept. An unreadable one saved into the
           folder would be re-read and complained about on every rebuild. */
        const readable = files.filter(f => parseRealis(f.text).ok);
        if (!readable.length) return json(res, 400, { error: 'None of these files could be read as a REALIS export.' });
        const saved = readable.map(f => saveRealisUpload(f.name, f.text, { at }));
        const r = rebuildRealis();
        return json(res, 200, { kind: 'realis', saved, skipped: files.length - readable.length, ...r });
      }
      return json(res, 400, { error: 'Unknown kind.' });
    }

    if (url.pathname === '/api/plan' && req.method === 'POST') {
      const b = await readBody(req);
      const applicants = (b.applicants || [])
        .map(a => ({ fixedIncome: Number(a.fixedIncome) || 0,
                     variableIncome: Number(a.variableIncome) || 0,
                     age: Number(a.age) || 35 }))
        .filter(a => a.fixedIncome > 0 || a.variableIncome > 0);
      if (!applicants.length) return json(res, 400, { error: 'At least one applicant with an income is needed.' });
      if (!(Number(b.price) > 0)) return json(res, 400, { error: 'A price is needed.' });

      const out = plan({
        price: Number(b.price),
        applicants,
        monthlyDebts: Number(b.monthlyDebts) || 0,
        propertyType: b.propertyType || 'HDB',
        hdbLoan: Boolean(b.hdbLoan),
        existingLoans: Number(b.existingLoans) || 0,
        profile: b.profile || 'SC',
        propertyCount: Number(b.propertyCount) || 1,
        cashAvailable: Number(b.cashAvailable) || 0,
        cpfAvailable: Number(b.cpfAvailable) || 0,
      });
      return json(res, 200, { plan: out, reviewed: { rates: RATES_REVIEWED, ltv: LTV_REVIEWED },
                              sources: SOURCES, generatedAt: new Date().toISOString() });
    }

    if (url.pathname === '/api/proceeds' && req.method === 'POST') {
      const b = await readBody(req);
      if (!(Number(b.salePrice) > 0)) return json(res, 400, { error: 'A sale price is needed.' });
      const out = saleProceeds({
        salePrice: Number(b.salePrice),
        outstandingLoan: Number(b.outstandingLoan) || 0,
        cpfPrincipal: Number(b.cpfPrincipal) || 0,
        yearsHeld: Number(b.yearsHeld) || 0,
        agentFeePct: b.agentFeePct === undefined || b.agentFeePct === '' ? 2 : Number(b.agentFeePct),
        propertyType: b.propertyType === 'PRIVATE' ? 'PRIVATE' : 'HDB',
        purchaseDate: b.purchaseDate ? new Date(b.purchaseDate) : null,
        otherCosts: Number(b.otherCosts) || 0,
      });
      /* SSD only bites on private and only inside three years, and the
         timeline says when it stops — a seller's most common question. */
      let timeline = null;
      if (b.purchaseDate) {
        try {
          timeline = sellTimeline({ propertyType: b.propertyType === 'PRIVATE' ? 'PRIVATE' : 'HDB',
                                    purchaseDate: new Date(b.purchaseDate), price: Number(b.salePrice) });
        } catch { /* degrade, never break */ }
      }
      return json(res, 200, { proceeds: out, timeline, reviewed: { rates: RATES_REVIEWED },
                              generatedAt: new Date().toISOString() });
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  } catch (e) {
    /* Degrade, never break — the panel shows the message rather than dying. */
    json(res, 500, { error: String(e?.message || e) });
  }
});

/**
 * Degrade, never break. A second copy of the panel is the commonest way to
 * start it — one left running in another terminal, or a background one from
 * an earlier session — and the default for that is nine lines of stack trace
 * naming `listenInCluster`, which says nothing about what to do. It is also
 * not an error worth failing loudly over: the panel is almost certainly
 * already open on that port.
 */
server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use — the panel is probably already running.\n`);
    console.error(`    open it          http://localhost:${PORT}`);
    console.error(`    or stop that one  pkill -f consult-server.mjs`);
    console.error(`    or use another    CONSULT_PORT=4174 npm run consult\n`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat()
    .find(i => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log(`\n  Consult panel\n`);
  console.log(`    this machine   http://localhost:${PORT}`);
  if (lan) console.log(`    your phone     http://${lan}:${PORT}   (same wifi)`);
  console.log(`\n  No authentication. It serves point valuations — keep it on your own network.`);
  console.log(`  Ctrl-C to stop.\n`);
});
