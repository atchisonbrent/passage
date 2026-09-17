const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const math = require('../src/workspace-math.js');
const fields = {};
const field = (id) => (fields[id] ||= { value: '', open: false, focus() {} });
let opened = false;
const context = vm.createContext({
  PassageWorkspaceMath: math,
  state: { selected: 'chokepoint6', pins: ['chokepoint1'], metric: 2, index: 1, window: 7 },
  dates: ['2026-01-01', '2026-08-28'],
  manifest: { start: '2026-01-01' },
  $: field,
  setMode() {},
});
vm.runInContext(fs.readFileSync('src/workspace.js', 'utf8'), context);
vm.runInContext(
  'comparisonOpen = () => { globalThis.opened = true; }; comparisonReference = () => {};',
  context,
);
vm.runInContext("comparisonExplore('2023-12-01')", context);
opened = context.opened;
assert.equal(opened, true);
assert.equal(field('analysisEnd').value, '2023-12-01');
assert.equal(field('analysisStart').value, '2023-11-25');
assert.equal(field('analysisMetric').value, '2');
assert.equal(field('analysisSetup').open, true);
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(comparison.ids)', context)), [
  'chokepoint1',
]);
context.state.pins = ['chokepoint1', 'chokepoint4', 'chokepoint7', 'chokepoint2'];
vm.runInContext("comparisonExplore('2023-12-01')", context);
assert.deepEqual(
  JSON.parse(vm.runInContext('JSON.stringify(comparison.ids)', context)),
  context.state.pins,
);
context.state.pins = [];
vm.runInContext("comparisonExplore('2023-12-01')", context);
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(comparison.ids)', context)), [
  'chokepoint6',
]);
assert.equal(vm.runInContext('comparison.event', context), null);
vm.runInContext("comparisonExplore('2019-01-01')", context);
assert.equal(field('analysisStart').value, '2019-01-01');
context.opened = false;
vm.runInContext("comparisonExplore('2018-12-31')", context);
assert.equal(context.opened, false);
console.log(
  'history navigation: selected places, metric, historical dates and lower boundary passed',
);
