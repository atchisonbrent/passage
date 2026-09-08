const assert = require('node:assert/strict');
const { summarize, csv, arc } = require('../src/analysis.js');
const rows = Array.from({ length: 42 }, (_, i) => [i < 35 ? 10 : 20]);
let r = summarize(rows, 41, 0, 7, 'prior');
assert.equal(r.current, 20);
assert.equal(r.baseline, 10);
assert.equal(r.percent, 100);
assert.equal(r.difference, 10);
assert.equal(r.currentCount, 7);
assert.equal(r.baselineCount, 28);
assert.equal(summarize(rows, 20, 0, 7, 'prior').baseline, null);
assert.equal(summarize(rows, 20, 0, 7, 'january').baseline, null, 'No lookahead');
const missing = rows.map((r) => [...r]);
missing[40] = [null];
assert.equal(
  summarize(missing, 41, 0, 7, 'prior').current,
  null,
  'Missing is not zero or partial mean',
);
const zero = rows.map(() => [0]);
assert.equal(summarize(zero, 41, 0, 7, 'prior').current, 0);
assert.equal(summarize(zero, 41, 0, 7, 'prior').percent, null, 'Zero denominator not infinity');
assert.equal(summarize(rows, 41, 0, 1, 'prior').current, 20);
assert.equal(summarize(rows, 41, 0, 7, 'january').baseline, 10);
assert.ok(csv([['=HYPERLINK("x")', 'a,b', null]]).startsWith('"\'=HYPERLINK'));
const points = arc([170, 10], [-170, 10]);
assert.equal(points.length, 65);
assert.ok(points.every((p) => p.every(Number.isFinite)));
assert.ok(Math.abs(points[32][0]) > 175, 'Dateline shortest arc');
assert.ok(
  arc([0, 0], [180, 0]).every((p) => p.every(Number.isFinite)),
  'Antipodes stay finite',
);
console.log(
  'analysis: complete-window, missing/zero, lookahead, CSV and spherical-arc checks passed',
);
