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
    assert.equal(
      await js("!!document.getElementById('historyExplore')"),
      true,
      'history entry must be visible on the landing page',
    );
    assert.equal(await js("document.getElementById('dateInput').min"), '2019-01-01');
    await click('#historyExplore');
    assert.equal(
      await js("comparison.open && document.getElementById('analysisSetup').open"),
      true,
    );
    await click('#exploreView');
    await js(
      "document.getElementById('dateInput').value='2023-12-01';document.getElementById('dateInput').dispatchEvent(new Event('change'))",
    );
    await until(() => js('comparison.open && !comparison.busy && !!historyCache[state.selected]'));
    assert.equal(await js("document.getElementById('analysisEnd').value"), '2023-12-01');
    assert.ok(await js('Number.isFinite(comparison.summaries[0].mean)'));
    await click('#exploreView');
    await js(
      "document.getElementById('analysisDisplay').value='table';document.getElementById('analysisSpan').value='observations';document.getElementById('analysisScale').value='indexed'",
    );
    await click('#redSeaStudy');
    assert.deepEqual(
      await js(
        "['analysisDisplay','analysisSpan','analysisScale'].map(id=>document.getElementById(id).value)",
      ),
      ['chart', 'reference', 'absolute'],
    );
    await until(() => js('!comparison.busy && comparison.ids.every(id=>!!historyCache[id])'));
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
        "document.getElementById('globeEventContext').textContent.includes('Historical comparison')",
      ),
    );
    assert.ok(
      await js(
        "!document.getElementById('globeEventContext').textContent.includes('Violet marker')",
      ),
    );
    await click('#analyzeView');
    const expected = await js('JSON.stringify(comparison.summaries)');
    await click('#analysisShare');
    const hash = await js('location.hash');
    await navigate(base + hash);
    await until(() => js('!comparison.busy && comparison.ids.every(id=>!!historyCache[id])'));
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
  await click('#redSeaStudy');
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
};
