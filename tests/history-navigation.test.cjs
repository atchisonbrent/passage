const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let fail = false;
const context = vm.createContext({
  dates: ['2019-01-01', '2019-01-02', '2019-01-03', '2026-01-01'],
  state: { metric: 0 },
  series: { port1: [null, null, null, [99]] },
  depthKey: '',
  refresh() {},
  historyCache: {},
  historyRequests: {},
  historyErrors: {},
  load: async () => {
    if (fail) throw Error('offline');
    return [10, null, 30, 20, 0, 40];
  },
});
vm.runInContext(fs.readFileSync('src/timeline.js', 'utf8'), context);
const run = (code) => vm.runInContext(code, context);
run(
  `timelineManifest={days:3,ids:['port1','port2'],files:[0,1,2,3].map(metric=>({metric,file:'fixture-'+metric,values:6,days:3,offset:0}))};timelinePlaceIndex={port1:0,port2:1}`,
);
(async () => {
  assert.equal(run('ensureTimeline()'), false);
  await run('timelineLoading');
  assert.equal(run('ensureTimeline()'), true);
  assert.equal(run("activityValue('port2',0)"), 20, 'unselected places are resident');
  assert.equal(run("activityValue('port2',1)"), 0, 'real zeros survive');
  assert.ok(Number.isNaN(run("activityValue('port1',1)")), 'missing is not zero');
  assert.equal(run("activityValue('port1',3)"), 99, 'recent rows retain their original values');
  for (const metric of [1, 2]) {
    context.state.metric = metric;
    run('ensureTimeline()');
    await run('timelineLoading');
  }
  assert.equal(run('timelineMetrics.size'), 2, 'resident measures are bounded');
  assert.equal(run('timelineMetrics.has(0)'), false);
  fail = true;
  context.state.metric = 3;
  run('ensureTimeline()');
  await run('timelineLoading');
  assert.match(run('timelineNotice()'), /unavailable/);
  assert.equal(run("activityValue('port1',0)"), undefined);
  fail = false;
  run('retryTimeline()');
  await run('timelineLoading');
  assert.equal(run('ensureTimeline()'), true);
  assert.equal(run("activityValue('port1',0)"), 10);
  run("historyCache.port1=[['2019-01-01',10,3,2,1,null,null,null]]");
  assert.equal(
    run("activityValue('port1',0,0)"),
    10,
    'evicted measure falls back to selected-place history',
  );
  context.state.metric = 0;
  fail = true;
  run('ensureTimeline()');
  context.state.metric = 3;
  await run('timelineLoading');
  assert.equal(
    run('timelineErrors.has(0)'),
    false,
    'abandoned measure does not retain an irrelevant error',
  );
  fail = false;
  console.log(
    'timeline loader: whole catalog, resident date range, null/zero, cache bound, failure and retry passed',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
