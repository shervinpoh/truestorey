/**
 * Everything this site has been asked for and declined, with the reason.
 *
 * ── WHY THIS IS A PAGE AND NOT A NOTE IN A README ──────────────────────────
 * Two competitors sell the things below. A reader comparing three property
 * sites sees a shorter feature list here and has no way to tell a gap from a
 * decision — and "we don't do that" is worthless without the reason attached.
 *
 * Every entry has to be checkable. `where` points at the file whose comment
 * carries the full argument, so a sceptical reader can go and read the code
 * that enforces it rather than taking a marketing page's word. That is the
 * same contract as every figure on the site: the working is the product.
 *
 * ── WHAT DOES NOT BELONG HERE ──────────────────────────────────────────────
 * Things not built yet. A backlog is not a principle, and padding this with
 * "we could but haven't" would make the whole page worthless. Every entry is
 * something that was specifically proposed — by a brief, by a competitor's
 * product, or by an obvious reading of the data — and turned down on a
 * reason that still holds.
 */

export const GROUPS = [
  {
    id: 'numbers',
    title: 'Numbers this site will not produce',
    lede: 'Each of these is sold by somebody in this market. The objection is never that it is hard.',
    items: [
      {
        what: 'A valuation. One number for what your home is worth.',
        asked: 'The most requested thing there is, and the headline product of both comparable sites.',
        why: 'No public dataset can see your floor, your facing, your renovation or your lease. '
           + 'Valuation tools routinely disagree by tens of thousands on the same home, and the '
           + 'disagreement is not a bug in one of them — it is the honest width of the answer. '
           + 'This site shows the observed range and the transactions behind it, and lets you '
           + 'decide where inside it you sit.',
        rule: 'Rule 2',
        where: 'lib/blindspot/rubric.js',
      },
      {
        what: 'A projected launch price from what the developer paid for the land.',
        asked: 'Proposed as a "breakeven ladder": land price, plus construction, plus a margin.',
        why: 'Two of those three are published by nobody. Construction cost varies by site, by '
           + 'contractor and by year, and no developer files its margin — so the sum would be one '
           + 'fact carrying two guesses, presented as arithmetic. It is also a valuation of a '
           + 'building that does not exist yet.',
        rule: 'Rule 2',
        where: 'components/LandView.jsx',
      },
      {
        what: 'A project scorecard — one grade for whether a development is good.',
        asked: 'A competitor sells exactly this.',
        why: 'A score assembled by a language model is an opinion wearing a number’s clothes: '
           + 'it reads objective, it cannot be sourced, and it will not give the same answer '
           + 'twice. Blindspot does publish a score, and the difference is the whole point — its '
           + 'formula is printed on the page, a model never assigns a point, and the same inputs '
           + 'always produce the same result.',
        rule: 'A model never assigns a number',
        where: 'lib/blindspot/rubric.js',
      },
      {
        what: 'Your purchase ranked against the stock market or gold.',
        asked: 'Proposed as an "opportunity cost engine" scoring a home against STI, the S&P 500 and gold.',
        why: 'None of those series is held here, each needs sourcing and licensing, and ranking a '
           + 'home against equities is investment advice, which nobody here is licensed to give. '
           + 'What survived is the CPF Ordinary Account rate — statutory, published, and where '
           + 'most of the money actually came from.',
        rule: 'Not licensed for it',
        where: 'lib/calc/ledger.js',
      },
    ],
  },
  {
    id: 'data',
    title: 'Data this site will not use',
    lede: 'Two of these are licensing. The third is about drawing things nobody published.',
    items: [
      {
        what: 'REALIS — the unit number on a private sale.',
        asked: 'It is what lets a competitor show the actual unit a transaction happened in, and they say so.',
        why: 'URA licenses REALIS for personal research, not commercial use. It is also the '
           + 'difference between a site whose every figure you can check against a free government '
           + 'source and one where part of the answer cannot be reproduced from public data — '
           + 'which that competitor’s own methodology states plainly.',
        rule: 'Rule 1 · CEA PG 02-11 s6',
        where: 'CLAUDE.md',
      },
      {
        what: 'Anyone else’s reporting.',
        asked: 'The obvious way to have a news section.',
        why: 'Nothing here reproduces the Straits Times, Business Times, EdgeProp or Stacked. The '
           + 'archive indexes primary sources — government announcements and public datasets — '
           + 'and links to them.',
        rule: 'Rule 9',
        where: 'app/archive',
      },
      {
        what: 'Geometry the data does not contain.',
        asked: 'A rail line drawn between stations. A boundary drawn around a point. Future MRT opening years.',
        why: 'A list of station coordinates is not a route, and a point is not a parcel. If a line '
           + 'would come from memory rather than from a published shapefile, it does not get '
           + 'drawn — which is why the future-rail file in this repo is an empty array rather than '
           + 'a plausible guess.',
        rule: 'Rule 13',
        where: 'data/sources/rail-future.json',
      },
    ],
  },
  {
    id: 'cannot',
    title: 'Things the data cannot actually support',
    lede: 'These were attempted, and the attempt is the record. Each one looked buildable until it was built.',
    items: [
      {
        what: 'What a specific home actually returned when it resold.',
        asked: 'The question every owner has, and a competitor sells a version of it.',
        why: 'Pairing filed sales needs a unit identifier, and neither HDB nor URA publishes one. '
           + 'The closest available match is address plus floor area plus floor band, and it is '
           + 'not a unit: Blk 362C Sembawang Crescent filed fifteen 4-room 93 sqm sales on '
           + 'storeys 7 to 9 inside seventeen months, two of them in the same month. A first '
           + 'build of this paired those and produced a confident median holding period out of '
           + 'fifteen different families’ homes. It was deleted rather than shipped.',
        rule: 'Deleted after building it',
        where: 'lib/blindspot/measure.js',
        instead: 'What homes of your size have sold for here, year by year, beside the same figure '
               + 'for every size at that address — because a project’s headline moves when the '
               + 'mix of sizes sold moves, not only when prices do.',
      },
      {
        what: 'How long it takes to walk to the station.',
        asked: 'On every property site in the market.',
        why: 'What sits between two points — a canal, an expressway, a fence — is in no dataset '
           + 'held here, so a walking time would be a guess presented as a measurement. Distances '
           + 'are straight-line and say so on every line.',
        rule: 'Rule 10',
        where: 'lib/geo.js',
      },
      {
        what: 'A shaded 1km circle around a school.',
        asked: 'The standard way every portal shows primary-school priority.',
        why: 'MOE measures to the school’s land boundary, not to a pin in the middle of the '
           + 'campus. On a large site that is a couple of hundred metres, which is the entire '
           + 'width of the decision at a band edge. A circle drawn from one coordinate is not '
           + 'MOE’s measure and would imply a place nobody has been offered.',
        rule: 'Rules 11 and 12',
        where: 'lib/geo.js',
      },
      {
        what: 'A renovation-age negotiation anchor.',
        asked: 'Proposed as a way to price how tired a unit is.',
        why: 'Renovation is not in the filed data at all. Inferring it from a building’s age '
           + 'would dress an assumption as a comparable.',
        rule: 'Refused at the audit',
        where: 'NEXT.md',
      },
    ],
  },
  {
    id: 'advice',
    title: 'Advice this site will not give',
    lede: 'The line is between a fact about your money and a decision about your life.',
    items: [
      {
        what: 'When to sell before the lease decays further.',
        asked: 'Proposed as an "inflection point" — the year to exit a leasehold.',
        why: 'The exit year rested on an invented 2% line that nobody publishes, and telling '
           + 'somebody when to sell their home is advice, not arithmetic. The State’s own '
           + 'leasehold table is published here in full, all ninety-nine years of it, and what '
           + 'you do with it is yours.',
        rule: 'Sell advice on an invented line',
        where: 'lib/calc/lease.js',
      },
      {
        what: 'A verdict on a floor plan.',
        asked: 'Proposed as a badge library — good layout, poor layout, scored.',
        why: 'That is a model assigning a verdict, and the plans themselves are the developers’ '
           + 'copyright. What the tool does instead is measure how much of the area is usable and '
           + 'list the questions to put to your designer and an engineer.',
        rule: 'A model never assigns a number',
        where: 'app/floorplan',
      },
      {
        what: 'That anything is undervalued, a good deal, or a buy.',
        asked: 'Standard vocabulary across this market, including on both comparable sites.',
        why: 'Those are opinions dressed as findings. CEA PG 02-11 s3.1 requires a market claim to '
           + 'be substantiated, and none of those words can be. What you get instead is disclosed '
           + 'arithmetic against a cited source, with the arithmetic on the page.',
        rule: 'Rules 6 and 7',
        where: 'CLAUDE.md',
      },
      {
        what: 'Your phone number, for anything.',
        asked: 'Every lead form in the industry asks for one.',
        why: 'There is no number field on this site. It was removed rather than reworded, because '
           + 'collecting a number with no purpose behind it is its own problem. Consent is per '
           + 'channel, never bundled, and an enquiry is not consent to be called.',
        rule: 'Rules 3 and 4 · PDPA s14(2)',
        where: 'lib/consent.js',
      },
    ],
  },
];

/** Flat list, for counting and for tests. */
export const ALL = GROUPS.flatMap(g => g.items.map(i => ({ ...i, group: g.id })));
