# The daily article pipeline

Perplexity finds it · Gemini triages it · Claude writes it · **Shervin
publishes it.** Make.com is the wire between them.

The code half is built and live. `POST /api/webhook/article` files a draft,
`/studio` is the approval queue, and `components/Insight.jsx` renders the
source links on the published page. What this file specifies is the Make.com
scenario, which is the only part that lives outside the repo.

---

## The rule this pipeline exists to not break

**Rule 9: never reproduce news. Index primary sources and link to them.**

A chain that turns other outlets' reporting into "articles in my own words" is
one careless prompt away from laundering the Straits Times through three models
and publishing it under a CEA registration number. That is not a hypothetical
failure mode of this design — it is the *default* failure mode, because it is
what a general news search plus a rewrite instruction naturally produces.

Two things stop it, and both are structural rather than a line in a prompt:

1. **Perplexity is pinned to `.gov.sg` at the API level**, not asked politely in
   the prompt. Same principle as `lib/scope.js`: a prompt rule alone did not
   hold on /neighbourhood — RULE 1 refused Manchester on every probe and then
   answered it from the live route — so scope is decided before the model is
   called.
2. **Every article carries `source_urls`, and they are the release itself.** The
   piece is commentary *on* a linked primary source, not a retelling of somebody
   else's coverage of it. `/studio` prints "No sources recorded — worth knowing
   before this goes out under your name" when the array is empty, which is the
   last chance to catch it.

If a run produces an article whose only source is a news site, the pipeline is
broken, not the article.

---

## Before you open Make.com

Three environment variables must exist **in Vercel**, not only in `.env.local`.
The webhook and the studio both treat "unset" as *closed*, deliberately — so a
missing variable looks exactly like a wrong password and neither will tell you
which it is from outside.

| Variable | What breaks without it |
|---|---|
| `ARTICLE_WEBHOOK_SECRET` | every POST returns `401 Not authorised` |
| `SUPABASE_URL` + `SUPABASE_SECRET_KEY` | POST returns `503 Supabase is not configured` |
| `STUDIO_PASSWORD` | `/studio` is closed and nothing can be published |

`UNSPLASH_ACCESS_KEY` is optional and only matters if you send images. Don't,
to begin with — see "Images" below.

**Test it end to end before building anything**, with the real secret from
`.env.local`:

```bash
curl -sS -X POST https://truestorey.vercel.app/api/webhook/article \
  -H "Authorization: Bearer $(grep '^ARTICLE_WEBHOOK_SECRET=' .env.local | cut -d= -f2-)" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Pipeline smoke test","category":"note","content_html":"<p>This is a smoke test of the article webhook. It exists only to prove the endpoint accepts a well formed draft, and it should be deleted from the studio queue as soon as it has been seen. Two hundred characters of body text are required before the endpoint will accept anything at all, which is what this paragraph is for.</p>","source_urls":["https://www.ura.gov.sg/"]}'
```

- `201` with `{"status":"draft"}` — everything is wired. Delete it from `/studio`.
- `401` — `ARTICLE_WEBHOOK_SECRET` is absent from Vercel or differs from `.env.local`.
- `503` — the Supabase variables are absent from Vercel.

---

## The scenario

```
1  Schedule            daily, 07:15 SGT
2  HTTP → Perplexity   what did a Singapore agency publish yesterday?
3  Filter              stop if nothing came back
4  HTTP → Gemini       triage, dedupe, and pick AT MOST TWO — or none
5  Filter              stop if it picked none  ← most days end here, correctly
6  Iterator            over the chosen items
7  HTTP → Claude       write the piece
8  HTTP → webhook      file it as a draft
9  Notify              "2 drafts waiting" → wherever you read messages
```

### Most days should produce nothing, and that is the design

A pipeline that must publish daily will manufacture filler, and filler under a
CEA registration number is a liability rather than a content strategy. URA, HDB
and MAS do not publish something worth 800 words every weekday. Module 4 is
explicitly allowed — instructed — to return an empty list, and module 5 stops
the run when it does. Two a week is a healthy rate for this.

---

## Module 2 · Perplexity — find the primary source

`POST https://api.perplexity.ai/chat/completions`
`Authorization: Bearer <PERPLEXITY_API_KEY>` · `Content-Type: application/json`

```json
{
  "model": "sonar",
  "temperature": 0.1,
  "max_tokens": 1500,
  "search_recency_filter": "day",
  "search_domain_filter": [
    "ura.gov.sg", "hdb.gov.sg", "mas.gov.sg", "lta.gov.sg",
    "mnd.gov.sg", "iras.gov.sg", "cpf.gov.sg", "moe.gov.sg",
    "data.gov.sg", "singstat.gov.sg"
  ],
  "messages": [
    { "role": "system", "content": "You index primary sources. You never summarise a news report. Every item you return must be a document published by the agency itself — a press release, a media release, a circular, a data release or a speech on that agency's own site. If your only evidence for something is a news article about it, find the agency page and return that; if there is no agency page, drop the item entirely. Reply with JSON only, no prose and no code fences." },
    { "role": "user", "content": "What did Singapore government agencies publish in the last 24 hours that materially affects someone buying, owning or selling residential property here? Consider URA, HDB, MND, MAS, IRAS, CPF, LTA, MOE, SingStat and data.gov.sg.\n\nReturn:\n{\"items\":[{\"agency\":\"URA\",\"headline\":\"exact title of the release\",\"url\":\"https://…\",\"published\":\"YYYY-MM-DD\",\"what_changed\":\"one sentence, factual\",\"who_it_affects\":\"one sentence\",\"is_primary\":true}]}\n\nIf nothing qualifies, return {\"items\":[]}. Do not pad the list. An empty answer is a correct answer." }
  ]
}
```

**Check the raw response once, in Make's execution log, before you map it.**
The answer is in `choices[0].message.content` as a JSON *string* that needs
parsing. The array of URLs Perplexity searched has been called different things
at different times — map from whatever the log actually shows, not from what a
doc says it should be. This repo has already been bitten twice by a provider
changing a field and the wrapper reading the old one.

**On `search_domain_filter`:** Perplexity caps the list, and the cap has been
different on different plans. If the request is rejected, cut it to the six that
matter most — `ura.gov.sg`, `hdb.gov.sg`, `mas.gov.sg`, `mnd.gov.sg`,
`iras.gov.sg`, `data.gov.sg` — rather than dropping the filter. **Never drop the
filter.** It is the thing keeping rule 9 structural.

---

## Module 4 · Gemini — triage, and permission to say nothing

`POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=<GEMINI_API_KEY>`

```json
{
  "contents": [{ "parts": [{ "text": "<<the items JSON from module 2>>\n\nYou are the editor. For each item decide whether it is worth an article on a Singapore property site written for ordinary buyers, owners and sellers.\n\nDROP anything that is: not published by the agency itself; a routine scheduled data release with no change in it; about commercial or industrial property only; a re-announcement of something already in force; or of interest only to the industry rather than to a household.\n\nKEEP something only if a reader could act differently because of it.\n\nRank what survives and return AT MOST TWO. Returning zero is normal and correct on most days — do not pad.\n\nReturn JSON only:\n{\"chosen\":[{\"agency\":\"\",\"headline\":\"\",\"url\":\"\",\"published\":\"\",\"angle\":\"the one thing a reader needs to understand, in a sentence\",\"category\":\"policy|note|deep_dive|editorial\",\"why_it_matters\":\"two sentences, plain\"}]}" }] }],
  "generationConfig": {
    "temperature": 0.1,
    "maxOutputTokens": 4096,
    "responseMimeType": "application/json"
  }
}
```

**`maxOutputTokens` is 4096 and that is not arbitrary.** Gemini's current models
think, and the thinking counts against that ceiling: 942 tokens of thinking plus
498 of answer against a 1600 ceiling truncated the JSON mid-object,
*intermittently* — passing in dev, passing on the retry, failing for a reader.
It is written up in `CLAUDE.md` under "A thinking model spends your output
budget on thinking". Do not tighten it to save money.

The model id is pinned for the same reason `lib/ai/providers.js` pins it:
`gemini-2.5-flash` was closed to new keys and 404s, and the error names the
model rather than the key, which is the opposite of where anyone looks first.

---

## Module 7 · Claude — write it

`POST https://api.anthropic.com/v1/messages`
`x-api-key: <ANTHROPIC_API_KEY>` · `anthropic-version: 2023-06-01`

Use **`claude-opus-5`** here. This is the one step where voice matters and it
runs at most twice a day; `claude-sonnet-5` is the cheaper swap if the bill
argues. (The repo's own runtime pins `claude-sonnet-4-6`, but that is for a
three-sentence Blindspot paragraph around figures that are already fixed — a
different job with a different budget.)

```json
{
  "model": "claude-opus-5",
  "max_tokens": 4000,
  "temperature": 0.4,
  "system": "<<the house rules below>>",
  "messages": [{ "role": "user", "content": "<<one chosen item, as JSON>>" }]
}
```

### The house rules, as the system prompt

Paste this verbatim. Every line in it is a rule from `CLAUDE.md` and the ones
that look fussy are the ones that carry a registration number.

```
You write for Truestorey, a Singapore property site published by Shervin Poh,
CEA Reg. No. R066925H, Huttons Asia Pte Ltd. Everything you write goes out
under that registration number. Write as him: plain, direct, unhurried, more
interested in what a figure does not say than in what it does.

YOU ARE WRITING COMMENTARY ON A LINKED PRIMARY SOURCE. You are not summarising
it and you are certainly not retelling anyone's news coverage of it. Assume the
reader can click the link. Your job is what it means for someone buying, owning
or selling a home — the consequence, the thing that is easy to misread, the
question it should make them ask.

HARD RULES. Breaking any of these makes the piece unpublishable:
- Never state a valuation, an estimate of what any property is worth, or a
  price forecast. Ranges with the evidence shown are fine; a verdict is not.
- Never invent a number. Every figure must be in the source you were given, and
  must be written with the agency and the period beside it: "URA, Q2 2026".
  If you want a figure you were not given, describe it in words instead.
- Never use: undervalued, best deal, expert, specialist, guaranteed, hot
  market, must buy, once in a lifetime.
- Never imply a school place. The MOE 1km band is ballot priority, nothing more.
- Never give a walking time or a distance to anything.
- Never quote or paraphrase Straits Times, Business Times, EdgeProp, Stacked or
  any other publisher. If a fact is not in the agency release, leave it out.
- Never predict what prices will do. You may say what has happened, with dates.

HOUSE STYLE:
- British spelling. Singapore dollars as S$1,234,567.
- No first-person plural. "I" is allowed sparingly; "we" is not.
- Short paragraphs. No bullet list longer than five items.
- Do not open with "In a move that" or "As Singapore's property market".
- End on the practical consequence, not on a summary of what you just said.

OUTPUT. Return one JSON object and nothing else — no prose, no code fences:
{
  "title": "under 70 characters, specific, no colon-subtitle construction",
  "slug": "lowercase-hyphenated",
  "category": "policy | note | deep_dive | editorial",
  "excerpt": "one sentence under 200 characters",
  "content_html": "…",
  "tags": ["three or four lowercase tags"],
  "source_urls": ["the agency URL you were given, and nothing else"]
}

content_html RULES — it is sanitised on the way in against an allowlist, and
anything outside it is silently dropped:
- Allowed: p br hr h2 h3 h4 strong b em i u s sup sub mark ul ol li blockquote
  figure figcaption cite a img table thead tbody tr th td caption code pre span
  div small time
- NO <h1>. The page supplies it, and a second one breaks the heading order a
  screen reader announces.
- On <a>, only href title rel target. No inline styles, no classes, no
  event handlers — they will be stripped.
- 600 to 900 words for a note, 1,200 to 1,600 for a deep_dive.
- Link the agency release in the first two paragraphs, in the prose, by name.
```

---

## Module 8 · File the draft

`POST https://truestorey.vercel.app/api/webhook/article`
`Authorization: Bearer <ARTICLE_WEBHOOK_SECRET>` · `Content-Type: application/json`

Send Claude's JSON through as the body, with `source_urls` guaranteed present.
The endpoint will:

- verify the Bearer token in constant time,
- sanitise `content_html` **before storing it**, so a future page that forgets
  to sanitise is still safe,
- slugify the title if no slug came through, and resolve a collision by
  appending the date rather than rejecting the piece,
- drop an Unsplash image that arrives without a photographer credit, because
  publishing it would breach the licence,
- and file it as **`status: 'draft'`**, which is not negotiable and has no
  override flag.

It returns `201` with `{ ok, id, slug, status: "draft", review: "/studio" }`.

Failures worth mapping in Make so you see them rather than a silent green run:

| Code | Meaning |
|---|---|
| 401 | secret missing or wrong |
| 413 | body over 512KB |
| 422 | no title, or under 200 characters of body text — "check the pipeline" |
| 502 | Supabase rejected the write |
| 503 | Supabase not configured on the deployment |

---

## Module 9 · Tell yourself it is waiting

The notification is **not** the approval. `/studio` is the approval. So use
whatever channel is cheapest to set up, and do not let this module block the
rest of the scenario.

- **Telegram** — a bot, a free Make module, working in ten minutes. Start here.
- **Email via Resend** — already configured for the block digest, so the domain
  is verified and the key exists. One HTTP module.
- **WhatsApp** — needs the WhatsApp Business Cloud API: a Meta app, a verified
  business, a phone number that is not your personal one, and a message template
  approved by Meta for anything business-initiated. Worth doing eventually
  because it is where you already read messages. It is not worth doing before
  the pipeline runs.

Message body: how many drafts, their titles, and the `/studio` link. Nothing
else — the piece is read in the studio, not in a chat window.

---

## Images

**Skip them for the first month.** An Unsplash image adds a licence obligation
(the download endpoint must be pinged, the photographer must be credited, and
the webhook drops the image rather than the credit if either is missing) in
exchange for decoration. Articles read fine without one, and a policy note with
a stock photo of a skyline on it reads like every other property blog.

If you add them later, send all four fields together or none:
`header_image_url`, `unsplash_photographer_name`,
`unsplash_photographer_profile_url`, `unsplash_download_location`.

---

## What to watch in the first fortnight

1. **Are the `source_urls` agency URLs?** Open three published pieces and click
   through. If any lead to a news site, stop the scenario and fix module 2.
2. **Is Gemini returning zero on quiet days?** If it returns two every single
   day, the triage prompt is being ignored and you are publishing filler.
3. **Are any numbers appearing that are not in the source?** This is the failure
   that is hardest to see and most expensive to have published. Spot-check every
   figure in the first ten pieces against the release.
4. **Does anything read like it was written by a model?** That is the whole
   point of the approval step. Rewriting a paragraph in the studio before
   publishing is normal use, not a sign the pipeline failed.
