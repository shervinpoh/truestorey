/**
 * The explanation, one tap away instead of in the way.
 *
 * Shervin, 26 Sep: every page carries too many words, and it reads as mess.
 * Measured the same day: /cost ran to 2,212 words, 801 of them fine print,
 * because every figure had its reasoning written out beside it. The reasoning
 * is right and stays — the rules in CLAUDE.md require a figure to show where
 * it came from — but it does not need to be read before the figure can be.
 *
 * So a section shows its numbers, one short line of context and its source
 * line, and folds the method, the caveats that change nothing about the
 * decision, and what the calculation leaves out into this. A caveat that
 * WOULD change the decision stays visible, in one sentence ("a question worth
 * S$32,500 is not a disclosure triangle"). A <details>, so it opens with no
 * JavaScript, prints closed, and a screen reader announces it as expandable.
 */
export default function HowWorked({ title = 'How this is worked out', children }) {
  return (
    <details className="howworked">
      <summary>{title}</summary>
      <div className="howworked-body">{children}</div>
    </details>
  );
}
