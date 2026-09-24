# Handover to Codex

> **Superseded 25 Sep 2026.** Shervin has handed the website build back to
> Claude. Codex keeps the concierge only. The ownership notice at the top of
> `AGENTS.md` is the current word; this file is kept as the record of what was
> handed over on 19 Sep.

Written 19 Sep 2026, at the point where Claude hands the build over. This is
the engineering brief. The product brief — what the site is for, what each
feature does for a reader — is the operating brief Shervin will send you
separately; this one is about how to work on the repo without breaking it.

**Read in this order: `CLAUDE.md`, then `NEXT.md`, then this file.** CLAUDE.md
is the law (the rules, the architecture, and a list of things that have already
gone wrong). NEXT.md is the ordered backlog. Neither is optional, and neither
is decoration: most of what looks arbitrary in this codebase is a scar.

---

## The one sentence the whole thing rests on

Every figure published here is a filed transaction or a published rate, and it
renders its source and period beside it. Everything else follows — what gets
built, what gets refused, and why a reader should believe this over a portal.

It is not a style preference. Everything goes out under **CEA Reg. No.
R066925H**, a licensed salesperson's registration. A wrong number here is a
regulatory problem, not a bug report.

---

## Where it stands today

| | |
|---|---|
| Live | https://truestorey.vercel.app — deployed from `shervinpoh/truestorey` on push to `master` |
| HEAD | `eab43fe` |
| Tests | 773, `node:test`, no framework (`npm test`) |
| Dependencies | three: `next`, `react`, `react-dom`. This is deliberate |
| Data | refreshes itself daily via `.github/workflows/refresh-data.yml`, commits `data/`, and that commit is the deploy |
| Scale | 13,052 pages · 9,483 HDB blocks · 2,531 condos · 1,012 landed streets · 210,351 filed transactions |

Traffic is 253 visits in the three weeks to 17 Sep, almost none from search.
**That is the binding constraint on the whole project**, and it is not a code
problem: the site is still on a `vercel.app` address. Build accordingly — the
13,052 pages are an asset waiting on a domain, and capture work converts
almost nothing at this volume.

---

## How to ship without breaking it

**1. The working tree is shared. Never stage a file whole without reading it.**
Other agents work in this same checkout. `git add -A` and `git commit -a` are
forbidden by CLAUDE.md, and that is not enough on its own: a file you changed
may also carry someone else's uncommitted hunks. **Read `git diff --cached`
before every commit.** On 15 Sep a commit staged `RecordPage.jsx` whole, swept
in another session's import of a file that was never committed, and every
deploy failed for two days while three commits were described as live.

To stage only your own hunk of a file that carries someone else's work: build
the HEAD-plus-your-change version in a temp file, `git diff --no-index` it
against `git show HEAD:<path>`, rewrite the `---`/`+++` lines to `a/<path>`
and `b/<path>`, and `git apply --cached` that patch.

**2. A push is a deploy, and a deploy can fail after a green build.**
Check it: `gh api repos/shervinpoh/truestorey/commits/<sha>/statuses`. A build
that exits 0 locally still fails on Vercel for function size, a missing file,
or Vercel's own transient errors (seen twice this week).

**3. Verify in a clean checkout before pushing.** The working tree has other
people's files in it, so a green `npm test` there proves less than it looks.
Add a detached worktree at HEAD, symlink `node_modules`, run `npm test` and
`npx next build` in it, then remove it. **Never run `next build` while
`next dev` is running in the same directory** — they share `.next` and the mix
corrupts it silently.

**4. A new API route that reads `data/` must be added to
`outputFileTracingIncludes` in `next.config.mjs`.** The data layer builds paths
at request time and the tracer cannot follow them: without the entry the route
works perfectly in dev and returns nothing in production. This has now been
forgotten three times. `test/tracing.test.js` catches some of it.

**5. Test the failure, then make the test fail.** Tests here describe failures
someone actually caused. After writing a guard, break the code deliberately and
confirm the test goes red — several tests in this repo were written, passed
immediately, and turned out to assert nothing. Two of mine this week asserted
on wording that a mutation could delete while the assertion still passed.

**6. Say what could not be measured.** A check that cannot run scores nothing
and says so. Silent truncation reads as completeness; absence of evidence must
never render as evidence of safety.

---

## What is in the tree that is NOT yours to commit

As of today the working tree carries uncommitted work from other sessions.
**Leave it alone.** If you must edit a file it touches, stage only your hunk.

- **AVM and the consult panel** — `scripts/avm.mjs`, `backtest-avm.mjs`,
  `tune-avm.mjs`, `lib/consult/`, `consult-server.mjs`, `docs/AVM_METHOD.md`,
  `data/avm-error.json`, plus their hunks in `package.json` and `.gitignore`.
  Internal agency tooling, not site code.
- **An AI concierge** — `app/api/concierge/`, `lib/concierge/`,
  `app/concierge-lab/`, `docs/AI_CONCIERGE.md`. In progress, unreferenced by
  the site.
- **A within-building floor curve** — `curveOf` in `scripts/build-storey.mjs`
  plus `lib/blindspot/measure.js` and `test/blindspot.test.js`. This one is a
  real improvement to Blindspot's comparable adjustment and is close to done;
  its test was resolved on 18 Sep. Shervin has it on hold until his data
  arrives.
- **`components/PlanStudio.jsx`** — a floor-plan studio that was built,
  measured as half-working, and pulled from the site. Referenced by nothing.
  Do not wire it back in.
- **`data/hdb.json`, `data/storey.json`, `data/geocache.json`** — newer ingests
  than HEAD. Harmless, but do not commit them as part of a code change.

---

## What shipped this week, so you do not redo or undo it

- **The homepage leads with a finding**, computed not typed: pooled across
  Singapore a high floor looks worth 26.7%, inside the same block 10.5%, and in
  21 of 450 blocks it sold for less. The earlier version compared two different
  definitions of "high floor" (144% vs 10.5%) and was wrong.
- **Landed homes are addressed by street** — `street|` keys, 1,012 street
  pages, estate names still resolving. Landed pages now say sales are filed by
  street and never by house number.
- **Twelve MOE Two-Track schools flagged** where distance stops ordering
  Phase 2C from the 2027 exercise.
- **MOP context on block pages**, shown only where a block's fifth year is
  current (284 pages, not 9,483), counting the previous wave's own blocks.
- **Search understands abbreviations** (JLN/JALAN, AVE/AVENUE) and falls back
  to **OneMap (SLA)** when nothing filed matches — postal codes, estate names
  and house numbers now resolve. Three different "empty" messages.
- **Shareable results** on `/cost`, `/plan`, `/progressive` — state in the URL
  fragment, never the query string, because those inputs can identify a
  household. One hook, `components/useShareLink.js`.
- **Emailed written reports** from the same three, via `/api/report`. Figures
  are recomputed server-side from the share fragment; nothing is posted. The
  address is used once and stored nowhere.
- **`npm run stats` read half the table** and called it all — PostgREST caps a
  response at 1,000 rows silently. Now paged on `id`.

---

## Decisions that are Shervin's, not yours

Do not resolve these in code. Ask.

1. **A domain.** Unlocks search traffic, the OG cards and the sending domain.
   The single highest-value item anywhere on the list.
2. **`NEXT_PUBLIC_WA_CHANNEL` in Vercel.** One variable; the channel link has
   never rendered for a reader.
3. **The "stay in touch" consent wording, and the CRM connection.** The only
   wording this site has ever shown bundles "the full report" with "monthly
   updates on my block" — bundled consent is void under PDPA s14(2), so a
   report tick needs its own wording and a new `CONSENT_COPY_VERSION`.
   `lib/crm.js` also points at an Apps Script that was never deployed, and
   `configured()` is false in production today.
4. **REALIS-derived data.** Shervin has said he wants to publish PropNex /
   Huttons data even if it is REALIS-derived. **Rule 1 forbids it** — CEA
   PG 02-11 s6 licenses REALIS for personal research, not commercial use, and
   it is his registration on every page. Nothing REALIS-shaped enters `data/`
   until its source and licence are established in writing. Unit-number-level
   purchase prices are the shape to refuse.
5. **The floor-plan rating and the Blindspot polish** — both waiting on that
   same data set.

---

## Where the value is next

In order, with the reasoning:

1. **§8.3 — the fourth line every tool is missing.** Each tool should end with
   the one action that follows from what the reader just worked out. Three now
   do (share, email). Eight do not. This is an acceptance criterion written
   down on 2 Sep and still unmet.
2. **Quantum by year** (NEXT.md §3, gap 6) — what buyers actually paid by
   region, size and year. A pivot over data already held; no new source.
3. **The land arc, second half** — the timeline from tender to today's filed
   range, and the reverse view on `/land`. Half is built; the strongest idea
   either outside model produced.
4. **Measure tool use before judging any tool by taste** — `tool_run` events
   exist now; `/floorplan` and `/neighbourhood` should be judged on them.
5. **The emailed report for Blindspot** — §8.2 names `/blindspot` and `/cost`
   as the two outputs long enough to be worth keeping. `/cost` is done;
   Blindspot waits on the data hold.

---

## Traps that will waste a day if nobody warns you

- **The preview pane is not a browser.** Hydration errors appear there that
  reproduce nowhere else, and a hidden pane throttles timers so a streamed
  Suspense boundary can take 60+ seconds to become interactive. Verify against
  a production build before believing a UI bug.
- **OneMap throttles after about three quick requests** and serves the 429 as
  HTML. Its unauthenticated answers also carry `error: "Authentication token
  missing"` beside perfectly good results — and beside `found: 0` for an
  address that genuinely does not exist. Read `found`, not the error.
- **Email deliverability is unproven.** Resend reports the first real sends as
  *delivered*, and they reached neither of Shervin's inboxes' front pages. The
  code is not the suspect; the sending domain is. `/api/report` now logs the
  provider id (never the address) so any send can be traced.
- **Git credentials hang on the macOS keychain** in this environment. Pushing
  works with `git -c credential.helper= -c credential.helper='!gh auth
  git-credential' push`.
- **`f()` in `components/fmt.js` prefixes `S$`.** It is wrong on a count.

---

## The house style, in four lines

- **Comment the decision, not the mechanics.** Why a threshold is what it is,
  what was tried and rejected, what breaks if someone changes it.
- **Degrade, never break.** A missing dataset or key disables one feature and
  says so. It never 500s a page.
- **No new dependency without a reason that survives being written down.**
  No Tailwind, no TypeScript, no chart library.
- **A language model never assigns a number.** Models write prose around
  figures that are already fixed by published formulas.
