const assert = require('node:assert/strict');
const T = require('../src/timeline-math.js');
const M = require('../src/analysis.js');
assert.equal(T.yearAgo('2024-02-29'), null);
assert.equal(T.yearAgo('2023-12-01'), '2022-12-01');
const source = Array.from({ length: 800 }, (_, i) => i);
const result = M.summarize([], 420, 0, 7, 'january', {
  januaryStart: 365,
  valueAt: (i) => source[i],
});
assert.equal(result.baseStart, 365);
assert.equal(result.baseEnd, 392);
assert.equal(result.current, 417);
assert.equal(result.baseline, 378.5);
const missing = M.summarize([], 0, 0, 1, 'prior', { valueAt: () => NaN });
assert.equal(missing.current, null);
assert.equal(missing.baseline, null);
const vm = require('node:vm');
const fs = require('node:fs');
const sourceCode = fs.readFileSync('src/app.js', 'utf8');
const reference = sourceCode.match(/^function referenceArgs\([\s\S]*?^\}/m)[0];
const context = vm.createContext({
  state: { metric: 0, baseline: 'prior' },
  activityValue: (id, i, m) => (m === 0 ? 10 : 3),
});
vm.runInContext(reference, context);
const total = vm.runInContext("referenceArgs('port1',0)[1].valueAt(0)", context);
const tanker = vm.runInContext("referenceArgs('port1',1)[1].valueAt(0)", context);
assert.equal(total, 10);
assert.equal(tanker, 3, 'category readers must use the requested measure');
console.log(
  'timeline calculations: resident values, category measures, selected-year January, lower bound and leap day passed',
);
