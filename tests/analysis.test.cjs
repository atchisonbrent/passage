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
// Adjustable reference length and window.
assert.equal(summarize(rows, 41, 0, 7, 'prior', { baselineDays: 14 }).baseline, 10);
assert.equal(summarize(rows, 41, 0, 7, 'prior', { baselineDays: 14 }).baselineCount, 14);
assert.equal(summarize(rows, 41, 0, 7, 'prior', { baselineDays: 14 }).baseStart, 21);
assert.equal(
  summarize(rows, 41, 0, 7, 'prior', { baselineDays: 40 }).baseline,
  null,
  'Reference longer than available data stays null',
);
assert.equal(
  summarize(rows, 41, 0, 14, 'prior', { baselineDays: 14 }).current,
  15,
  '14-day window straddles the step',
);
assert.equal(summarize(rows, 41, 0, 14, 'prior', { baselineDays: 14 }).currentCount, 14);
// Same dates last year: aligned yearAgo rows, window-length reference, no lookahead into rows.
const lastYear = rows.map(() => [5]);
const y = summarize(rows, 41, 0, 7, 'year', { yearAgo: lastYear });
assert.equal(y.baseline, 5);
assert.equal(y.percent, 300);
assert.equal(y.baseStart, 35);
assert.equal(y.baseEnd, 41);
assert.equal(y.baselineExpected, 7);
assert.equal(
  summarize(rows, 41, 0, 7, 'year').baseline,
  null,
  'Missing last-year rows are not zero',
);
const gappy = lastYear.map((r) => [...r]);
gappy[38] = [null];
assert.equal(
  summarize(rows, 41, 0, 7, 'year', { yearAgo: gappy }).baseline,
  null,
  'Gap in last-year window is not filled',
);
assert.equal(
  summarize(rows, 41, 0, 7, 'year', { yearAgo: [] }).baseline,
  null,
  'Empty last-year rows stay null',
);
// Varying last-year series: the reference must be exactly the aligned window slice.
const varying = rows.map((_, i) => [i]);
assert.equal(
  summarize(rows, 41, 0, 7, 'year', { yearAgo: varying }).baseline,
  38,
  'Mean of aligned indices 35..41',
);
const negative = rows.map(() => [-4]);
const neg = summarize(rows, 41, 0, 7, 'year', { yearAgo: negative });
assert.equal(neg.baseline, -4);
assert.equal(neg.percent, null, 'Negative reference has no percentage');
assert.equal(neg.difference, 24);
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
