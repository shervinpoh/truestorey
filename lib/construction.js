/** Explanations only. Percentages, notices and money stay in calc/buc.js.
 * The image illustrates the selected milestone, never a real project's
 * progress. Signing and completion deliberately promise no physical change.
 */
export const CONSTRUCTION = [
  { label: 'Agreement', title: 'The purchase begins on paper.',
    body: 'Signing starts the payment schedule. No particular state of construction is implied by this illustration.',
    detail: 'The signing percentage includes the booking fee already paid. It is not another booking fee.',
    alt: 'An empty architectural presentation site, representing no prescribed construction state at signing.' },
  { label: 'Foundation', title: 'The support below the surface.',
    body: 'The cutaway exposes the foundation and pile caps. This is the work that supports the building above.',
    detail: 'Look for the developer’s notice that the foundation work, including pile caps, is complete.',
    alt: 'Foundation piles, pile caps and ground beams highlighted in teal below a conceptual site.' },
  { label: 'Framework', title: 'A structure. Not yet a home.',
    body: 'Columns, beams and floor slabs form the reinforced-concrete framework. Rooms, services and finishes are separate milestones.',
    detail: 'This stage refers to the framework of the building, rather than just the floor your unit is on.',
    alt: 'An open four-level conceptual building with its reinforced-concrete columns, beams and slabs highlighted in teal.' },
  { label: 'Partitions', title: 'The rooms take shape.',
    body: 'Partition walls divide the open structure into spaces. The front stays cut away so you can see what changed inside.',
    detail: 'The schedule refers to partition walls. It does not require them to be brick.',
    alt: 'Interior partitions highlighted in teal inside a pale structural framework; the front facade is omitted for visibility.' },
  { label: 'Roofing', title: 'The roof closes the top.',
    body: 'The roof is highlighted above the framework and partitions. Roofing is a distinct milestone in the payment schedule.',
    detail: 'Roofing and the ceiling of an individual unit are different things.',
    alt: 'A roof slab and parapets highlighted in teal above the conceptual cutaway building.' },
  { label: 'Services', title: 'The details behind everyday life.',
    body: 'Frames and exposed service routes help locate this milestone. The notice also covers internal plastering, plumbing and wiring without fittings.',
    detail: 'The illustration shows representative elements. It cannot certify that every item in the notice is complete.',
    alt: 'Window frames, plumbing risers and an electrical route highlighted in teal in the open building.' },
  { label: 'Estate works', title: 'The work beyond your front door.',
    body: 'The car park, roads and drains serving the estate are part of the purchase too. The highlighted work now moves outside the building.',
    detail: 'This payment milestone covers the estate works named in the agreement.',
    alt: 'An estate driveway, parking area and drains highlighted beside the conceptual building.' },
  { label: 'TOP / CSC', title: 'Ready for the next chapter.',
    body: 'The completed model represents the handover milestone. The certificate and the required completion and connection notices matter; appearance alone does not trigger payment.',
    detail: 'Read the exact wording below. A finished-looking building is not evidence that the contractual conditions have been met.',
    alt: 'The conceptual building with glazing, balcony edges and finished surfaces, illustrating the handover milestone.' },
  { label: 'Completion', title: 'The building stays. The money moves.',
    body: 'There is no extra floor or facade to add here. Completion is a contractual milestone, with part of the payment held by a stakeholder.',
    detail: 'The statutory wording below explains the payment split and release conditions. Completion is distinct from getting the keys.',
    alt: 'The same completed conceptual building: final completion has no additional physical construction represented.' },
];

export function constructionStage(rows, index) {
  const row = rows[index];
  if (!row || !CONSTRUCTION[index]) throw new RangeError('Unknown construction milestone');
  return { ...row, ...CONSTRUCTION[index],
    cumulativePct: rows.slice(0,index + 1).reduce((sum, item) => sum + item.pct, 0),
    previousMonthly: rows[index - 1]?.monthly || 0,
    // The page prints whole dollars. Subtract those same displayed values
    // so "previous + increase" cannot disagree with the headline by a dollar.
    monthlyChange: Math.round(row.monthly) - Math.round(rows[index - 1]?.monthly || 0),
  };
}
