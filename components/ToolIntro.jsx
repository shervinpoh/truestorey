import { itemFor } from '../lib/nav.js';

/**
 * What a tool is for, before it asks for anything.
 *
 * ── WHY EVERY TOOL NEEDED THE SAME THREE LINES ─────────────────────────────
 * The feedback was that there are too many things here and not enough
 * explanation, and the sharpest version of that is what a calculator looks
 * like the moment it loads: a title, then inputs. A reader who does not
 * already know what the tool does has to work it out by using it, and the
 * ones on this site answer questions specific enough that guessing wrong
 * wastes real effort — /cost and /plan both take a price and give completely
 * different answers about it.
 *
 * Three lines, one sentence each. Not a wall of copy: the tools are the
 * product and this is a label on the tin, not a preamble to read first.
 *
 * ── THE WORDS LIVE IN lib/nav.js ───────────────────────────────────────────
 * Not in each page. The same sentences drive the menu, the /tools router and
 * this, and a tool described one way in the menu and another way on its own
 * page is the nav-in-two-places mistake with a slower symptom. Node can import
 * that file, so test/situations.test.js asserts every tool actually has all
 * three and that none of them overstates what the tool produces.
 *
 * ── AND THE EXAMPLE LABEL ──────────────────────────────────────────────────
 * `example` is for the calculators that open on prefilled figures. They do it
 * so the page is not an empty form, which is right — but an unlabelled
 * specific answer reads as THE answer, and somebody who does not notice the
 * inputs are illustrative can carry a S$1.6m stranger's number away as their
 * own. Pass the noun for whatever the page has prefilled.
 */
export default function ToolIntro({ href, example = null }) {
  const t = itemFor(href);
  if (!t?.use) return null;
  return (
    <div className="toolintro">
      <dl>
        <div><dt>Use this when</dt><dd>{t.use}</dd></div>
        <div><dt>You will need</dt><dd>{t.need}</dd></div>
        <div><dt>You will get</dt><dd>{t.get}</dd></div>
      </dl>
      {example && (
        <p className="egnote">
          <b>The {example} below are an example.</b> Replace them with yours — nothing is saved
          and nothing is sent anywhere.
        </p>
      )}
    </div>
  );
}
