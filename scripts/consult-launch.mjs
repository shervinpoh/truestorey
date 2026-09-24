/**
 * npm run consult — the panel, kept current by itself.
 *
 * ── WHY IT RUNS FROM ITS OWN COPY ─────────────────────────────────────────
 * The panel used to run straight out of this working folder, which meant it
 * saw new data only when somebody pulled — and this folder is also where
 * other work sits half-finished. Pulling here once meant stashing that work,
 * rebasing around a conflict in a cache file, and hoping the stash came back.
 * Nobody should have to do that to see this morning's sales.
 *
 * So the panel keeps a private copy of the repository (by default
 * ~/.truestorey/panel), touched by nothing but this script. Every hour it
 * asks GitHub whether master has moved; if it has, the copy is reset to it,
 * whatever depends on the changed data is rebuilt, and the server restarts.
 * The nightly refresh commits new sales to master, so the panel is never more
 * than an hour behind the site without anyone doing anything.
 *
 * The copy only ever runs COMMITTED code. That is deliberate: this is the
 * panel you use in front of clients, and it should be exactly what shipped.
 * To try uncommitted changes, `npm run consult:dev` runs this folder as-is.
 *
 * ── WHAT SURVIVES AN UPDATE ───────────────────────────────────────────────
 * `git reset --hard` rewrites tracked files only. Everything you add through
 * the panel — listings and REALIS uploads, the reading list, the island
 * scan's cache — is gitignored and stays exactly where it is.
 *
 * ── DEGRADE, NEVER BREAK ──────────────────────────────────────────────────
 * No network, or GitHub unreachable: it says so and keeps serving what it
 * has. No copy at all and it cannot make one: it serves this folder instead,
 * and says that too.
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const HERE = process.cwd();
const MIRROR = process.env.CONSULT_HOME || path.join(os.homedir(), '.truestorey', 'panel');
const PORT = Number(process.env.CONSULT_PORT || 4173);
const EVERY_MIN = Number(process.env.CONSULT_SYNC_MINUTES || 60);

const stamp = () => new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });
const log = m => console.log(`  [${stamp()}] ${m}`);
const git = (...a) => execFileSync('git', a, { cwd: MIRROR, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

/* ── the copy ──────────────────────────────────────────────────────────── */
function ensureMirror() {
  if (fs.existsSync(path.join(MIRROR, '.git'))) return true;
  let url;
  try { url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: HERE }).toString().trim(); }
  catch { return false; }
  fs.mkdirSync(path.dirname(MIRROR), { recursive: true });
  log(`First run — making the panel its own copy of the repository at ${MIRROR}.`);
  log('This takes a minute or two once; after that, updates are small.');
  try {
    execFileSync('git', ['clone', '--depth', '1', '--branch', 'master', url, MIRROR], { stdio: 'inherit' });
    return true;
  } catch (e) {
    log(`Could not make the copy (${e.message.split('\n')[0]}).`);
    return false;
  }
}

/** Bring the copy to master. Returns the files that changed, or null. */
function update() {
  try {
    const before = git('rev-parse', 'HEAD');
    git('fetch', '--depth', '1', 'origin', 'master');
    const after = git('rev-parse', 'FETCH_HEAD');
    if (before === after) return [];
    let changed = [];
    try { changed = git('diff', '--name-only', before, after).split('\n').filter(Boolean); }
    catch { changed = ['*']; } // shallow history can lack `before`; rebuild everything
    git('reset', '--hard', after);
    return changed;
  } catch (e) {
    log(`Could not reach GitHub to check for updates (${e.message.split('\n')[0]}). Serving what is here.`);
    return null;
  }
}

/* ── what depends on what ──────────────────────────────────────────────── */
function run(script, label) {
  try {
    execFileSync('node', [script], { cwd: MIRROR, stdio: ['ignore', 'pipe', 'pipe'] });
    log(`rebuilt ${label}`);
  } catch (e) {
    log(`could not rebuild ${label}: ${String(e.stderr || e.message).split('\n')[0]}`);
  }
}

let scanChild = null;
function rebuildDerived(changed, { first = false } = {}) {
  const touched = f => first || changed.includes('*') || changed.includes(f);
  /* Both read private.json, which the nightly refresh rewrites and which
     nothing in that refresh rebuilds them from. Seconds each. */
  if (touched('data/private.json')) run('scripts/build-private-scan.mjs', 'the private scan');
  if (touched('data/private.json') || touched('data/gls-awards.json')) run('scripts/build-breakeven.mjs', 'the land model');

  /* The HDB value scan prices every block and takes minutes, so it runs
     beside the server rather than in front of it. The server reads its file
     on every request, so the new one is picked up without a restart. */
  const scanFile = path.join(MIRROR, 'data', '.scan.json');
  if ((touched('data/comps.json') || touched('data/hdb.json') || !fs.existsSync(scanFile)) && !scanChild) {
    log('refreshing the HDB value scan in the background (a few minutes)…');
    scanChild = spawn('node', ['scripts/scan.mjs'], { cwd: MIRROR, stdio: 'ignore' });
    scanChild.on('exit', code => { log(code === 0 ? 'HDB value scan refreshed' : 'HDB value scan did not finish'); scanChild = null; });
  }
}

/* ── the server ────────────────────────────────────────────────────────── */
let server = null;
function portFree(p) {
  return new Promise(resolve => {
    const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
    s.listen(p, '0.0.0.0');
  });
}
function start(dir) {
  server = spawn('node', ['scripts/consult-server.mjs'], {
    cwd: dir, stdio: 'inherit', env: { ...process.env, CONSULT_PORT: String(PORT) },
  });
  server.on('exit', code => { if (code && code !== 143 && code !== null) log(`the panel stopped (exit ${code}).`); });
}
function restart(dir) {
  if (!server) return start(dir);
  server.once('exit', () => start(dir));
  server.kill('SIGTERM');
}

/* ── go ────────────────────────────────────────────────────────────────── */
if (!(await portFree(PORT))) {
  console.log(`\n  Port ${PORT} is already in use — an older panel is probably still running.\n`);
  console.log('    stop it with   pkill -f consult-server.mjs');
  console.log('    then run       npm run consult\n');
  process.exit(1);
}

console.log('\n  Consult — keeping itself current\n');
let dir = HERE;
if (ensureMirror()) {
  dir = MIRROR;
  const changed = update();
  rebuildDerived(changed || [], { first: true });
  log(`running from ${MIRROR} at ${git('log', '-1', '--format=%h · %cd', '--date=format:%d %b %H:%M')}`);
  log(`checking for new data and code every ${EVERY_MIN} minutes`);
} else {
  log('No private copy available — running this folder as-is. It will not update itself.');
}
start(dir);

if (dir === MIRROR) {
  setInterval(() => {
    const changed = update();
    if (!changed || !changed.length) return;
    log(`master moved — ${changed.length} file(s) changed. Updating the panel.`);
    rebuildDerived(changed);
    restart(MIRROR);
  }, EVERY_MIN * 60_000);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    scanChild?.kill('SIGTERM');
    if (server) { server.once('exit', () => process.exit(0)); server.kill('SIGTERM'); } else process.exit(0);
  });
}
