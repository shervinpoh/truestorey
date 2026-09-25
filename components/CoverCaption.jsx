/**
 * The caption under a Commons photograph: what it shows, when, what it is NOT,
 * and whose it is.
 *
 * All three parts are required, for different reasons. What it shows and when
 * are the file's own words and its camera's date — a photograph on a property
 * page is evidence, and evidence says what it is. What it is not is the line
 * that stops a photograph of Marina Gardens Drive reading as the tender plot.
 * Whose it is, and under which licence with a link to it, is the condition on
 * which the photograph may be used at all.
 *
 * No hooks, so the studio queue (a client component) can use it too.
 */
export default function CoverCaption({ cover, className = 'covercap' }) {
  if (!cover) return null;
  const shows = cover.shows ? `${cover.shows}${cover.taken ? `, ${cover.taken}` : ''}` : '';
  const ends = /[.!?…]$/.test(shows) ? '' : '.';
  return (
    <figcaption className={className}>
      {shows && <span className="covercap-shows">{shows}{ends} </span>}
      <span className="covercap-rel">{cover.relation}</span>
      <span className="covercap-credit">
        Photo:{' '}
        <a href={cover.page} target="_blank" rel="noopener noreferrer">{cover.by}</a>
        {' · '}
        {cover.licenceUrl
          ? <a href={cover.licenceUrl} target="_blank" rel="noopener noreferrer license">{cover.licence}</a>
          : cover.licence}
        {' · via '}
        <a href={cover.page} target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>
      </span>
    </figcaption>
  );
}
