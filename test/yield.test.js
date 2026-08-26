import test from 'node:test';
import assert from 'node:assert/strict';
import { yieldsFrom } from '../scripts/build-yield.mjs';

/* The rental ingest needs the network and the URA key, so the derivation is
 * tested against fixtures instead of against a file that may not exist. The
 * thing being protected is the SIZE JOIN: a three-bedroom's rent over a
 * one-bedroom's price is not a yield, and nothing in the shape of the data
 * stops that happening by accident. */

const rent = (project, areaFrom, areaTo, r, district = '15') =>
  ({ project, district, areaFrom, areaTo, rent: r, noOfBedRoom: 2 });
const sale = (project, areaSqm, price, district = '15') =>
  ({ project, district, areaSqm, price });

test('rent is only ever matched to sales inside its own area band', () => {
  const rentals = [
    rent('SEASIDE', 70, 80, 4000), rent('SEASIDE', 70, 80, 4200), rent('SEASIDE', 70, 80, 4100),
  ];
  const sales = [
    // three inside the band…
    sale('SEASIDE', 72, 1_500_000), sale('SEASIDE', 75, 1_550_000), sale('SEASIDE', 78, 1_600_000),
    // …and a penthouse that must not be allowed anywhere near the ratio
    sale('SEASIDE', 300, 9_000_000), sale('SEASIDE', 320, 9_500_000),
  ];
  const { projects } = yieldsFrom(rentals, sales);
  const p = projects.SEASIDE;
  assert.ok(p, 'project should have produced a yield');
  assert.equal(p.cohorts.length, 1);
  assert.equal(p.cohorts[0].sales, 3, 'the two out-of-band sales were counted');
  assert.equal(p.cohorts[0].medianPrice, 1_550_000);
  // 4100 * 12 / 1,550,000 = 3.17%
  assert.equal(p.cohorts[0].grossYield, 3.17);
});

test('a project with no size overlap produces nothing, not an average', () => {
  const rentals = [rent('MISMATCH', 40, 50, 3000), rent('MISMATCH', 40, 50, 3100), rent('MISMATCH', 40, 50, 3200)];
  const sales = [sale('MISMATCH', 200, 5_000_000), sale('MISMATCH', 210, 5_200_000), sale('MISMATCH', 220, 5_400_000)];
  const { projects } = yieldsFrom(rentals, sales);
  assert.equal(Object.keys(projects).length, 0, 'a yield was produced from unrelated sizes');
});

test('thin cohorts are dropped rather than published', () => {
  const rentals = [rent('THIN', 70, 80, 4000), rent('THIN', 70, 80, 4100)];   // 2 rents, bar is 3
  const sales = [sale('THIN', 72, 1_500_000), sale('THIN', 75, 1_550_000), sale('THIN', 78, 1_600_000)];
  assert.equal(Object.keys(yieldsFrom(rentals, sales).projects).length, 0);
});

test('the project figure is the median across cohorts, not across contracts', () => {
  // Fifty studios and three big units: the studios must not decide the project.
  const rentals = [
    ...Array.from({ length: 50 }, () => rent('MIXED', 40, 50, 3000)),
    rent('MIXED', 130, 140, 6000), rent('MIXED', 130, 140, 6100), rent('MIXED', 130, 140, 6200),
  ];
  const sales = [
    sale('MIXED', 45, 900_000), sale('MIXED', 46, 920_000), sale('MIXED', 48, 950_000),
    sale('MIXED', 132, 3_000_000), sale('MIXED', 135, 3_100_000), sale('MIXED', 138, 3_200_000),
  ];
  const p = yieldsFrom(rentals, sales).projects.MIXED;
  assert.equal(p.cohorts.length, 2);
  const [studio, big] = p.cohorts.map(c => c.grossYield);
  assert.ok(p.grossYield >= Math.min(studio, big) && p.grossYield <= Math.max(studio, big));
});

test('the district figure is a median of projects', () => {
  const mk = (name, r, price) => ({
    rentals: [rent(name, 70, 80, r), rent(name, 70, 80, r), rent(name, 70, 80, r)],
    sales: [sale(name, 72, price), sale(name, 75, price), sale(name, 78, price)],
  });
  const a = mk('A', 4000, 1_000_000), b = mk('B', 4000, 2_000_000), c = mk('C', 4000, 3_000_000);
  const { districts } = yieldsFrom(
    [...a.rentals, ...b.rentals, ...c.rentals],
    [...a.sales, ...b.sales, ...c.sales]);
  assert.equal(districts['15'].projects, 3);
  // B sits in the middle: 4000 * 12 / 2,000,000 = 2.4%
  assert.equal(districts['15'].grossYield, 2.4);
});

test('nothing in the output claims to be a net yield', () => {
  const rentals = [rent('SEASIDE', 70, 80, 4000), rent('SEASIDE', 70, 80, 4200), rent('SEASIDE', 70, 80, 4100)];
  const sales = [sale('SEASIDE', 72, 1_500_000), sale('SEASIDE', 75, 1_550_000), sale('SEASIDE', 78, 1_600_000)];
  const out = JSON.stringify(yieldsFrom(rentals, sales));
  assert.ok(!/netYield|"net"/i.test(out), 'a net yield appeared without the costs to compute one');
});
