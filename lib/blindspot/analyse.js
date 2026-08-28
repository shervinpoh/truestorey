import { recordByHref } from '../data/query.js';
import { score, CHECKS, RUBRIC_VERSION } from './rubric.js';
import { supplyWithin, pricePercentile, glsWithin, plotRatioWithin } from './measure.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * One property, four checks, one score — assembled from the repo alone.
 *
 * This runs with no network and no API key. The AI route wraps it and adds
 * prose; if every key were revoked tomorrow the number and the findings would
 * still be here, which is the point of building it this way round.
 */

let _geo = null;
function coordsFor(href) {
  if (!_geo) {
    const p = path.join(process.cwd(), 'data', 'geo.json');
    _geo = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { records: {} };
  }
  const g = _geo.records?.[href];
  return g ? { lat: g.lat, lon: g.lon, match: g.match } : null;
}

/**
 * @param href      a record href, e.g. /hdb/bishan/275a-bishan-st-24
 * @param askPrice  what it is being asked for, in dollars
 * @param areaSqft  the unit's floor area, so an asking psf can be formed
 */
export function analyse({ href, askPrice = null, areaSqft = null, now = new Date() } = {}) {
  const rec = recordByHref(href);
  if (!rec) return { error: 'No record at that address.' };

  const where = coordsFor(href);
  const askingPsf = askPrice && areaSqft ? Number(askPrice) / Number(areaSqft) : null;

  const price = askingPsf ? pricePercentile(rec, askingPsf, { now }) : null;
  const supply = supplyWithin(where?.lat, where?.lon, { town: rec.town, from: now });
  const gls = where ? glsWithin(where.lat, where.lon) : null;
  const view = where ? plotRatioWithin(where.lat, where.lon) : null;

  const result = score({
    price: price?.percentile ?? null,
    supply: supply?.ratio ?? null,
    gls: gls ? gls.units : null,
    view: view ? view.plotRatio : null,
  }, {
    // The measurement objects, so a check can state the limits of its own
    // answer — see the `caveat` on the zoning check in rubric.js.
    price, supply, gls, view,
  });

  return {
    version: RUBRIC_VERSION,
    record: { href: rec.href, label: rec.label, kind: rec.kind, town: rec.town, district: rec.district, n: rec.n, medianPsf: rec.medianPsf },
    input: { askPrice: askPrice ? Number(askPrice) : null, areaSqft: areaSqft ? Number(areaSqft) : null, askingPsf: askingPsf ? Math.round(askingPsf) : null },
    ...result,
    detail: { price, supply, gls, view },
    rubric: Object.values(CHECKS).map(c => ({ key: c.key, title: c.title, max: c.max, source: c.source, needs: c.needs })),
  };
}
