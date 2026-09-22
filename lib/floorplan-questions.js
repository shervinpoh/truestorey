/** A portable viewing note, never a claim about whether a wall can move. */
export function floorplanQuestions(items) {
  const questions = (Array.isArray(items) ? items : [])
    .filter(item => typeof item?.askYourQP === 'string' && item.askYourQP.trim())
    .map((item, i) => `${i + 1}. ${typeof item.where === 'string' && item.where.trim() ? `${item.where.trim()}: ` : ''}${item.askYourQP.trim()}`);
  if (!questions.length) return '';
  return ['Questions to ask a qualified person about this floor plan',
    'The floor plan alone cannot establish whether a wall is structural.',
    ...questions].join('\n\n');
}
