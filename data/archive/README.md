# The policy and data archive

Every official announcement and data release that moves Singapore residential
property, dated and linked to its **primary source**.

## What belongs here, and what does not

**Belongs:** a URA media release, an HDB announcement, an MAS rate series, a
data.gov.sg dataset refresh, a Budget or cooling-measure statement. These are
government facts. Recording that they happened, on what date, with a link, is
indexing — not republishing.

**Does not belong:** anything from Straits Times, Business Times, EdgeProp,
Stacked Homes or any other outlet. Compressing someone else's article into an
entry here reproduces their journalism on a commercial site, and it breaks the
rule this whole publication is built on: *take in the data, publish in your
own voice.* An archive of primary sources is also simply better — everyone
else is downstream of the same secondary coverage.

**The take goes in a note, not here.** An entry is what happened. What it
means is a separate, signed, dated piece of writing that links back to it.

## Two ways an entry gets in

1. **`manual.json`** — hand-added, and the honest route for anything that
   needs a human to have read it. Seeded with URA releases verified on
   23 Aug 2026.
2. **Derived** — `npm run ingest:archive` writes an entry for every dataset
   release it can see: a new index quarter, an MOP refresh, a transaction
   period moving. These need no one to type them.

`summary` may be empty. A bare dated fact with a link is a perfectly good
entry; an invented sentence to fill the space is not.
