import { mopCopy } from '../lib/mop.js';

function Source({ source, period }) {
  if (!source) return null;
  return <p className="prov"><a href={source.url}>{source.name}</a>
    {period && ` · ${period}`} · accessed {source.accessedAt}</p>;
}

export default function BlockMop({ data, rec }) {
  const copy = mopCopy(data, rec);
  if (!copy) return null;
  return (
    <section className="pane blockmop" id="mop" aria-labelledby="block-mop-title">
      <h2 id="block-mop-title">{copy.title}</h2>
      <p className="note missing"><b>{copy.dateLabel}.</b> {copy.dateNote}</p>
      {copy.missing && <p className="hint">{copy.missing}</p>}
      {copy.year && <>
        <h3 className="mono">{copy.year}</h3>
        <p className="hint">{copy.yearNote}</p>
      </>}
      <Source source={data.source} period={data.completedYear ? `Completion year ${data.completedYear}` : null} />
      {copy.first && <>
        <p><b>{copy.first}</b></p>
        <p className="hint">{copy.firstNote}</p>
        <Source source={data.filingSource} period={copy.held} />
      </>}
      <h3>{copy.comparisonTitle}</h3>
      <p>{copy.wave}</p>
      {data.previousYear && <Source source={data.source} period={String(data.previousYear)} />}
      <p className="note method">{copy.method}</p>
      {copy.rows.length ? <>
        {copy.partial && <p className="note missing">{copy.partial}</p>}
        <dl className="mopcounts">
          {copy.rows.map(row => <div key={row.label}>
            <dt>{row.label}</dt>
            <dd><b className="mono">{row.count.toLocaleString('en-SG')} filings</b>
              <Source source={data.filingSource} period={row.period} /></dd>
          </div>)}
        </dl>
        {copy.blockNote && <p className="hint">{copy.blockNote}</p>}
        <p className="hint">{copy.scope}</p>
        <p className="hint">{copy.lag}</p>
      </> : <>
        <p className="note missing">{copy.unavailable}</p>
        <Source source={data.filingSource} period={copy.held} />
      </>}
    </section>
  );
}
