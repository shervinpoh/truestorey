/**
 * One line of a calculation: what it is, what it comes to, and why.
 *
 * Extracted from Planner.jsx when /progressive needed the same row. Copying
 * eight lines of markup would not have been the "two implementations" bug that
 * cost this repo a floored loss — that was arithmetic — but a second copy
 * drifts in padding and weight until two calculators stop looking like one
 * site, and the third caller would have made it certain.
 *
 * `note` is not decoration. Every row on both pages is a step a reader can
 * disagree with, and the note is where the assumption behind the number is
 * written down.
 */
export default function PlanRow({ label, value, note, strong }) {
  return (
    <div className={`planrow${strong ? ' strong' : ''}`}>
      <span className="l">{label}</span>
      <span className="v mono">{value}</span>
      {note && <span className="n">{note}</span>}
    </div>
  );
}
