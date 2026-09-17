const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
exports.checkHistory = async ({ call, js, click, navigate, until, base, out }) => {
  for (const [width, height] of [
    [320, 780],
    [390, 844],
    [1440, 900],
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate(base);
    assert.equal(await js("!!document.getElementById('historyEntry')"), false);
    assert.equal(
      await js("document.getElementById('freshness').closest('dialog').id"),
      'sourceDialog',
    );
    assert.equal(await js("document.getElementById('dateInput').min"), '2019-01-01');
    assert.equal(await js('dates[0]'), '2019-01-01');
    assert.equal(await js('timelineMetrics.has(0)'), true);
    await js(
      "document.getElementById('dateInput').value='2023-12-01';document.getElementById('dateInput').dispatchEvent(new Event('change'))",
    );
    await until(() =>
      js(
        "dates[state.index]==='2023-12-01' && stats[state.selected].start===state.index-state.window+1 && Number.isFinite(stats[state.selected].current)",
      ),
    );
    assert.equal(await js('comparison.open'), false);
    assert.ok(await js('Object.values(stats).filter(s=>Number.isFinite(s.current)).length>1000'));
    const check = await js(
      "(async()=>{const rows=await load('history-chokepoint1.json');const values=rows.filter(r=>r[0]>='2023-11-25'&&r[0]<='2023-12-01').map(r=>r[1]);return {actual:stats.chokepoint1.current,expected:values.reduce((a,b)=>a+b,0)/7}})()",
    );
    assert.equal(check.actual, check.expected, 'unselected passage uses the real historical dates');
    await until(() => js('!!historyCache[state.selected]'));
    const categories = await js(
      "(()=>{document.getElementById('depthPanel').open=true;depthKey='';renderDepth();const actual=depthExport.filter(r=>r[0]==='category').map(r=>r[2]);const rows=historyCache[state.selected].filter(r=>r[0]>='2023-11-25'&&r[0]<='2023-12-01');const expected=actual.map((_,m)=>rows.reduce((sum,r)=>sum+r[m+1],0)/7);document.getElementById('depthPanel').open=false;return {actual,expected}})()",
    );
    assert.deepEqual(
      categories.actual,
      categories.expected,
      'category breakdown preserves each measure',
    );
    const pixels = await js(
      "(()=>{const canvas=document.getElementById('chart'),items=[{id:state.selected,color:'#83dbc1'}];plot(canvas,items);const cached=canvas.toDataURL();plotCache.delete(canvas);plot(canvas,items);return cached===canvas.toDataURL()})()",
    );
    assert.equal(pixels, true, 'cached and fresh chart pixels agree');
    fs.writeFileSync(
      path.join(out, `timeline-${width}.png`),
      Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    );
    // Continuous input across years: all dates are resident, never wait for a month.
    // Measure the actual rendering work, not just slider event dispatch.
    await js(
      "globalThis.dragProfile={};const track=(name,fn)=>(...args)=>{const t=performance.now();const result=fn(...args);(dragProfile[name]||=[]).push(performance.now()-t);return result};recompute=track('recompute',recompute);makeList=track('makeList',makeList);globe=track('globe',globe);activityDetail=track('detail',activityDetail);renderWorkspace=track('workspace',renderWorkspace);render=track('render',render)",
    );
    const drag = await js(
      "new Promise(resolve=>{const timings=[];let i=0;function step(){const t=performance.now();const slider=document.getElementById('scrub');slider.value=Math.floor((dates.length-1)*i/59);slider.dispatchEvent(new Event('input'));requestAnimationFrame(()=>{timings.push(performance.now()-t);if(++i<60)step();else resolve({timings,ready:timelineMetrics.has(0),dates:dates.length,requests:timelineLoading!==null})})}step()})",
    );
    drag.profile = await js('dragProfile');
    assert.equal(drag.ready, true);
    assert.equal(drag.requests, false);
    fs.writeFileSync(path.join(out, `drag-${width}.json`), JSON.stringify(drag, null, 2));
    // Native held-pointer drag must repaint the world during—not after—the gesture.
    const sliderBox = await js(
      "(()=>{const el=document.getElementById('scrub');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();globalThis.worldFrames=[];const original=globe;globe=(...args)=>{worldFrames.push({date:dates[state.index],current:stats.chokepoint1?.current,time:performance.now()});return original(...args)};return {x:r.x+8,y:r.y+r.height/2,width:r.width-16}})()",
    );
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: sliderBox.x,
      y: sliderBox.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    for (let step = 1; step <= 40; step++)
      await call('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: sliderBox.x + (sliderBox.width * step) / 40,
        y: sliderBox.y,
        button: 'left',
        buttons: 1,
      });
    const world = await js('worldFrames');
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: sliderBox.x + sliderBox.width,
      y: sliderBox.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    assert.ok(
      new Set(world.map((frame) => frame.date)).size >= 10,
      'globe updates during held-pointer drag',
    );
    assert.ok(
      new Set(world.map((frame) => frame.current)).size >= 10,
      'globe traffic changes during held-pointer drag',
    );
    fs.writeFileSync(path.join(out, `pointer-drag-${width}.json`), JSON.stringify(world, null, 2));
    await js(
      "document.getElementById('scrub').value=0;document.getElementById('scrub').dispatchEvent(new Event('input'))",
    );
    await until(() =>
      js("dates[state.index]==='2019-01-01' && stats[state.selected].start===1-state.window"),
    );
    assert.equal(await js('stats[state.selected].baseline'), null);
    await click('#eventsView');
    await js(
      "document.getElementById('analysisDisplay').value='table';document.getElementById('analysisSpan').value='observations';document.getElementById('analysisScale').value='indexed'",
    );
    await click('[data-event="red-sea-2023"]');
    assert.deepEqual(
      await js(
        "['analysisDisplay','analysisSpan','analysisScale'].map(id=>document.getElementById(id).value)",
      ),
      ['chart', 'reference', 'absolute'],
    );
    await until(() =>
      js(
        '!comparison.busy && comparison.ids.every(id=>!!historyCache[id]) && comparison.summaries.every(s=>Number.isFinite(s.mean)&&Number.isFinite(s.reference))',
      ),
    );
    assert.deepEqual(await js('comparison.ids'), [
      'chokepoint1',
      'chokepoint4',
      'chokepoint7',
      'chokepoint6',
    ]);
    assert.deepEqual(
      await js(
        "[...document.querySelectorAll('#analysisLegend .legend-item')].map(e=>e.textContent)",
      ),
      ['Suez Canal', 'Bab el-Mandeb Strait', 'Cape of Good Hope', 'Strait of Hormuz'],
    );
    assert.deepEqual(
      await js(
        "[...document.querySelectorAll('#analysisLegend line')].map(e=>e.getAttribute('stroke-dasharray'))",
      ),
      ['', '7 3', '2 3', '9 3 2 3'],
    );
    assert.equal(await js("document.getElementById('analysisStart').value"), '2023-12-01');
    assert.equal(await js("document.getElementById('analysisRefStart').value"), '2023-11-01');
    assert.ok(
      await js(
        'comparison.summaries.every(s=>Number.isFinite(s.mean)&&Number.isFinite(s.reference))',
      ),
    );
    assert.ok(
      await js(
        "document.getElementById('analysisInterpretation').textContent.includes('same ships')",
      ),
    );
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'));
    fs.writeFileSync(
      path.join(out, `red-sea-${width}.png`),
      Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    );
    await click('#exploreView');
    assert.ok(
      await js(
        "document.getElementById('globeEventContext').textContent.includes('Violet marker')",
      ),
    );
    await click('#analyzeView');
    const expected = await js('JSON.stringify(comparison.summaries)');
    await click('#analysisShare');
    const hash = await js('location.hash');
    await navigate(base + hash);
    await until(() =>
      js(
        '!comparison.busy && comparison.ids.every(id=>!!historyCache[id]) && comparison.summaries.every(s=>Number.isFinite(s.mean)&&Number.isFinite(s.reference))',
      ),
    );
    assert.equal(await js('JSON.stringify(comparison.summaries)'), expected);
    await js('globalThis.exported=null; download=(name,rows)=>{globalThis.exported={name,rows}}');
    await click('#analysisExport');
    assert.ok(await js("exported.rows.some(r=>r[0]==='observation'&&r[2]==='2023-12-01')"));
    assert.ok(await js("exported.rows.some(r=>r[0]==='source'&&r[2]==='history_sha256')"));
  }
  // A history error is visible and retryable, never converted into zero traffic.
  await navigate(base);
  await js(
    "globalThis.originalLoad=load; load=async file=>{if(file==='history-chokepoint6.json') throw Error('test offline');return originalLoad(file)}",
  );
  await click('#eventsView');
  await click('[data-event="red-sea-2023"]');
  await until(() => js('!comparison.busy && !!historyErrors.chokepoint6'));
  assert.equal(await js("document.getElementById('analysisLoad').hidden"), false);
  assert.equal(await js('comparison.summaries[3].mean'), null);
  await js('load=originalLoad');
  await click('#analysisLoad');
  await until(() => js('!comparison.busy && !!historyCache.chokepoint6'));
  assert.ok(await js('Number.isFinite(comparison.summaries[3].mean)'));
  fs.writeFileSync(
    path.join(out, 'history.json'),
    JSON.stringify(await js('({ids:comparison.ids,summaries:comparison.summaries})'), null, 2),
  );
  // A failed initial measure leaves the app usable and can be retried in place.
  await call('Network.enable');
  await call('Network.clearBrowserCache');
  await call('Network.setBlockedURLs', { urls: ['*timeline-0-*.json*'] });
  await navigate(base);
  assert.equal(await js('bootFailed'), false);
  assert.equal(await js('timelineMetrics.has(0)'), false);
  assert.ok(await js("document.getElementById('mapSubtitle').textContent.includes('unavailable')"));
  await click('#connections');
  assert.equal(await js('state.mode'), 'connections');
  await click('#change');
  await call('Network.setBlockedURLs', { urls: [] });
  await click('#mapSubtitle');
  await until(() => js("timelineMetrics.has(0) && !document.getElementById('scrub').disabled"));
};
