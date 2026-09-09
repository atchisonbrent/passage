const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
exports.checkControls = async ({ call, js, click, delay, out, width, height }) => {
  const randomReady = async () => {
    for (let i = 0; i < 200 && (await js('comparison.busy')); i++) await delay(100);
    assert.equal(await js('comparison.busy'), false);
  };
  const geometry = () =>
    js(
      "(()=>{const r=document.getElementById('globe').getBoundingClientRect();return {height:r.height,width:r.width}})()",
    );
  const before = await geometry();
  assert.equal(
    await js('passageSnapshot().place'),
    'Singapore',
    'unlinked landing is a general shipping hub',
  );
  assert.equal(
    await js("document.querySelectorAll('#mobileControls svg[aria-hidden=true]').length"),
    2,
    'Settings needs decorative gear and disclosure icons',
  );
  if (width >= 901) {
    assert.equal(
      await js("getComputedStyle(document.getElementById('placeName')).boxShadow"),
      'none',
      'sticky title must not paint over the resting place label',
    );
    assert.ok(
      await js(
        "(()=>{const a=document.getElementById('placeKind').getBoundingClientRect(),b=document.getElementById('placeName').getBoundingClientRect();return a.height>0&&a.bottom<=b.top+1})()",
      ),
    );
    fs.writeFileSync(
      path.join(out, `resting-${width}-${height}.png`),
      Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    );
  }
  assert.ok(
    await js("document.getElementById('browseToggle').getBoundingClientRect().width>0"),
    'Search is visible at every viewport',
  );
  if (width >= 901)
    assert.ok(
      await js(
        "(()=>{const c=[...document.querySelectorAll('header > *')].filter(e=>e.getBoundingClientRect().width).map(e=>{const r=e.getBoundingClientRect();return r.top+r.height/2});return Math.max(...c)-Math.min(...c)<2})()",
      ),
      'header stays a single row on wide layouts',
    );
  assert.ok(
    await js(
      "(()=>{const h=document.querySelector('.header-tools').getBoundingClientRect();return innerWidth-h.right<=24})()",
    ),
    'Search and More sit at the trailing edge',
  );
  assert.equal(await js("document.getElementById('mobileExplore').textContent.trim()"), 'More');
  await click('#browseToggle');
  assert.equal(await js("document.getElementById('browseDialog').open"), true);
  await click('#closeBrowse');
  // Panel actions sit beside the title, never below the chart.
  assert.ok(
    await js(
      "(()=>{const t=document.getElementById('placeName').getBoundingClientRect(),p=document.getElementById('pin').getBoundingClientRect(),s=document.getElementById('share').getBoundingClientRect();return p.top<t.bottom&&s.top<t.bottom&&p.width>=38&&s.width>=38})()",
    ),
    'Compare and Copy link are in the panel heading',
  );
  await click('#pin');
  assert.equal(await js("document.getElementById('pin').getAttribute('aria-pressed')"), 'true');
  assert.equal(await js('state.pins.length'), 1);
  assert.equal(await js("document.getElementById('comparePanel').hidden"), false);
  await js("state.pins.push(places.find(p=>p.name==='Rotterdam').id);refresh()");
  await delay(150);
  assert.equal(await js('state.pins.length'), 2);
  assert.equal(await js("document.querySelectorAll('#pinLabels .pin-remove').length"), 2);
  await js("document.querySelector('#pinLabels .pin-chip:last-child .pin-remove').focus()");
  await click('#pinLabels .pin-chip:last-child .pin-remove');
  assert.deepEqual(
    await js('state.pins'),
    [await js('state.selected')],
    'x removes only that place',
  );
  assert.ok(
    await js("document.activeElement.closest('#pinLabels, #clearPins')!==null"),
    'keyboard focus stays in the compare strip after removing a chip',
  );
  // Removing the sole remaining chip hides the strip; focus must land somewhere visible.
  await js("document.querySelector('#pinLabels .pin-chip .pin-remove').focus()");
  await click('#pinLabels .pin-chip .pin-remove');
  assert.equal(await js('state.pins.length'), 0);
  assert.equal(await js("document.getElementById('comparePanel').hidden"), true);
  assert.equal(await js('document.activeElement.id'), 'pin', 'focus moves to the Compare toggle');
  await click('#pin');
  assert.equal(await js('state.pins.length'), 1);
  await click('#pin');
  assert.equal(await js("document.getElementById('pin').getAttribute('aria-pressed')"), 'false');
  await click('#share');
  assert.equal(await js("document.getElementById('actionTip').hidden"), false);
  assert.ok(await js('location.hash.includes("baseline=")'));
  // Adjustable reference and window feed the ranking, detail and calculation.
  const setValue = async (id, value) => {
    await js(
      `(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change'));})()`,
    );
    await delay(150);
  };
  const settingsInline = await js("matchMedia('(min-width: 1281px) and (pointer: fine)').matches");
  if (!settingsInline) await click('#mobileControls');
  await setValue('baseline', 'prior91');
  await setValue('window', '14');
  assert.deepEqual(await js('[state.baseline,state.window]'), ['prior91', 14]);
  assert.equal(await js('stats[state.selected].baselineExpected'), 91);
  assert.equal(await js('stats[state.selected].baseEnd-stats[state.selected].baseStart'), 90);
  assert.ok(
    await js("document.getElementById('explanation').textContent.includes('prior 91 days')"),
  );
  assert.ok(await js("document.getElementById('unit').textContent.startsWith('14-day mean')"));
  await setValue('baseline', 'year');
  // The selected place fetches its own history; until then the reference is
  // null (never silently zero), and other places stay null too.
  const other = await js('Object.keys(stats).find(id=>id!==state.selected&&!historyCache[id])');
  assert.equal(await js(`stats[${JSON.stringify(other)}].baseline`), null);
  for (let i = 0; i < 100 && !(await js('!!historyCache[state.selected]')); i++) await delay(100);
  await delay(200);
  assert.ok(
    await js('Number.isFinite(stats[state.selected].baseline)'),
    'selected place gains a same-dates-last-year reference once history loads',
  );
  assert.ok(
    await js("document.getElementById('explanation').textContent.includes('same dates last year')"),
  );
  // Exported reference dates and the category breakdown follow the same reference.
  const yearRefs = await js(
    '(()=>{const s=stats[state.selected];const shift=d=>String(Number(d.slice(0,4))-1)+d.slice(4);return {actual:referenceDates(s),expected:[shift(dates[s.start]),shift(dates[state.index])]}})()',
  );
  assert.deepEqual(
    yearRefs.actual,
    yearRefs.expected,
    'year-mode CSV reference dates are last year',
  );
  assert.ok(yearRefs.actual.every((d) => d.startsWith('2025-')));
  await js("document.getElementById('depthPanel').open=true;renderDepth()");
  await delay(150);
  const categoryCaptions = await js(
    "[...document.querySelectorAll('#categoryResults .category-row small')].map(e=>e.textContent)",
  );
  assert.ok(
    categoryCaptions.some((c) => c.includes('same dates last year')),
    'category breakdown names the selected reference',
  );
  assert.ok(!categoryCaptions.some((c) => c.includes('preceding 28')));
  await js("document.getElementById('depthPanel').open=false");
  await setValue('baseline', 'prior');
  await setValue('window', '7');
  if (!settingsInline) await click('#closeTimeline');
  // Real pointer hover and selection at dense-port zoom, then restore landing.
  for (let i = 0; i < 26; i++) await click('#zoomin');
  assert.equal(await js('state.zoom'), 32);
  const points = await js(
    `(() => {const b=document.getElementById('globe').getBoundingClientRect();return hitpoints.filter(p=>!p.id.startsWith('country-')&&p.x>20&&p.y>20&&p.x<b.width-20&&p.y<b.height-20).slice(0,3).map(p=>({...p,x:p.x+b.left,y:p.y+b.top}));})()`,
  );
  assert.ok(points.length >= 2, 'dense Singapore view exposes multiple selectable ports');
  for (const point of points) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    await delay(80);
    assert.equal(await js("document.getElementById('globe').style.cursor"), 'pointer');
    assert.ok(await js("!document.getElementById('mapHover').hidden"));
    fs.writeFileSync(
      path.join(out, `hover-${width}-${height}.png`),
      Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    );
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
    });
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
    });
    await delay(80);
    assert.equal(await js('state.selected'), point.id);
  }
  fs.writeFileSync(
    path.join(out, `dense-map-${width}-${height}.png`),
    Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
  );
  await js("choose(places.find(p=>p.name==='Singapore').id)");
  await delay(100);
  const inlineSettings = await js("matchMedia('(min-width: 1281px) and (pointer: fine)').matches");
  if (inlineSettings) {
    // Wide pointer layouts keep playback settings in the bar; no disclosure, no popover.
    assert.equal(await js("document.getElementById('mobileControls').offsetParent"), null);
    assert.ok(
      await js(
        "(()=>{const s=document.getElementById('speed').getBoundingClientRect(),b=document.getElementById('scrub').getBoundingClientRect(),p=document.getElementById('play').getBoundingClientRect();return s.width>0&&s.bottom<=b.top&&Math.abs(s.top-p.top)<20})()",
      ),
      'inline settings share the playback row above the scrubber',
    );
    assert.equal(
      await js("document.getElementById('mobileMeasure').offsetParent"),
      null,
      'inline settings make the measure caption redundant',
    );
    fs.writeFileSync(
      path.join(out, `settings-${width}-${height}.png`),
      Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    );
  } else {
    await click('#mobileControls');
    assert.equal(await js("document.getElementById('timelineSettings').hidden"), false);
    assert.notEqual(
      await js('document.activeElement.tagName'),
      'SELECT',
      'opening Settings must not focus a native picker',
    );
    assert.deepEqual(await geometry(), before, 'settings must not resize the globe');
    assert.ok(
      await js(
        "(()=>{const r=document.getElementById('timelineSettings').getBoundingClientRect();return r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()",
      ),
      'settings must fit the viewport',
    );
    if (width <= 360)
      assert.ok(
        await js("document.getElementById('metric').getBoundingClientRect().width>200"),
        'narrow settings must give select labels a full row',
      );
    fs.writeFileSync(
      path.join(out, `settings-${width}-${height}.png`),
      Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    );
    if (width <= 360) {
      await call('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: width / 2,
        y: 250,
        deltaX: 0,
        deltaY: 240,
      });
      await delay(300);
      assert.ok(
        await js("document.getElementById('timelineSettings').scrollTop>0"),
        'narrow Settings scrolls through all fields',
      );
      assert.ok(
        await js(
          "(()=>{const r=document.getElementById('baseline').getBoundingClientRect(),p=document.getElementById('timelineSettings').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom})()",
        ),
        'comparison control remains reachable',
      );
      fs.writeFileSync(
        path.join(out, 'settings-narrow-scrolled.png'),
        Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
      );
    }
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    assert.equal(
      await js(
        "document.getElementById('timelineSettings').hidden&&document.activeElement.id==='mobileControls'",
      ),
      true,
    );
    await click('#mobileControls');
    await click('#closeTimeline');
    // Exercise a real touch sequence, not mouse clicks with a mobile viewport.
    if (width <= 1210) {
      const b = await js(
        "(()=>{const r=document.getElementById('mobileControls').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
      );
      await call('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...b, id: 0, radiusX: 1, radiusY: 1 }],
      });
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await delay(150);
      assert.equal(await js("document.getElementById('timelineSettings').hidden"), false);
      assert.notEqual(
        await js('document.activeElement.tagName'),
        'SELECT',
        'Settings tap must not focus a picker',
      );
      await click('#closeTimeline');
    }
    // Opening with Enter keeps focus on the disclosure; Tab reaches Close then Measure.
    await call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      text: '\r',
    });
    await call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    assert.equal(await js("document.getElementById('timelineSettings').hidden"), false);
    assert.equal(await js('document.activeElement.id'), 'mobileControls');
    assert.notEqual(
      await js("getComputedStyle(document.querySelector('.settings-chevron')).transform"),
      'none',
    );
    const tab = async () => {
      await call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      });
      await call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      });
    };
    await tab(); // Scrubber follows the disclosure in document order.
    assert.equal(await js('document.activeElement.id'), 'scrub');
    await tab();
    assert.equal(await js('document.activeElement.id'), 'closeTimeline');
    await tab();
    assert.equal(await js('document.activeElement.id'), 'metric');
    await click('#closeTimeline');
    await click('#mobileControls');
    await click('#reset');
    assert.equal(
      await js("document.getElementById('timelineSettings').hidden"),
      true,
      'outside click closes Settings',
    );
    assert.equal(
      await js("getComputedStyle(document.querySelector('.settings-chevron')).transform"),
      'none',
    );
    assert.equal(
      await js("document.getElementById('mobileControls').getAttribute('aria-expanded')"),
      'false',
    );
  }
  await click('#mobileExplore');
  assert.deepEqual(await geometry(), before, 'More must not resize the globe');
  await click('#sources');
  assert.equal(await js("document.getElementById('sourceDialog').open"), true);
  await click('#closeDialog');
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  assert.equal(await js("document.body.classList.contains('explore-open')"), false);
  await click('#randomEvent');
  await randomReady();
  assert.equal(await js('comparison.open&&!!comparisonContext()'), true);
  const picked = await js('comparisonContext().id');
  assert.equal(await js("document.querySelector('#eventContext details').open"), true);
  await click('#randomEvent');
  await randomReady();
  assert.notEqual(await js('comparisonContext().id'), picked);
  fs.writeFileSync(
    path.join(out, `random-${width}-${height}.png`),
    Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
  );
  assert.ok(
    await js(
      `(() => {const c=document.querySelector('.event-close').getBoundingClientRect(),d=document.querySelector('#eventContext details').getBoundingClientRect();return c.left>=d.right;})()`,
    ),
    'close button owns a separate column from all event text',
  );
  assert.ok(
    await js(
      `(() => {const d=document.querySelector('#eventContext details'),b=d.querySelector('button');return d.getBoundingClientRect().bottom-b.getBoundingClientRect().bottom>=12;})()`,
    ),
    'Locate on globe has bottom breathing room',
  );
  if (width >= 1680)
    assert.ok(
      await js(
        `(() => {const a=document.getElementById('analysisWorkspace').getBoundingClientRect(),b=document.querySelector('.brand').getBoundingClientRect(),t=document.querySelector('.header-tools').getBoundingClientRect();return Math.abs(a.left-b.left)<2&&Math.abs(a.right-t.right)<2;})()`,
      ),
      'wide header edges align with the centered analysis rail',
    );
  const comparisonBefore = await js(
    'JSON.stringify([comparison.ids,...comparisonValueIds.map(id=>document.getElementById(id).value),passageEvents,passageShifts])',
  );
  assert.equal(
    await js("document.querySelector('.event-close').getAttribute('aria-label')"),
    'Close event',
  );
  await click('#eventContext summary');
  assert.equal(await js("document.querySelector('#eventContext details').open"), false);
  assert.ok(
    await js(
      "(()=>{const r=document.querySelector('.event-close').getBoundingClientRect();return r.width>=44&&r.height>=44})()",
    ),
  );
  await click('.event-close');
  assert.equal(
    await js("!comparisonContext()&&document.getElementById('eventContext').hidden"),
    true,
  );
  assert.equal(await js('document.activeElement.id'), 'analyzeView');
  assert.equal(
    await js(
      'JSON.stringify([comparison.ids,...comparisonValueIds.map(id=>document.getElementById(id).value),passageEvents,passageShifts])',
    ),
    comparisonBefore,
    'closing context preserves comparison and catalogs',
  );
  await click('#exploreView');
};
exports.checkLenses = async ({ call, js, click, navigate, delay, until, base, out }) => {
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1210,
    height: 702,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await navigate(base);
  const select = async (selector, index) => {
    await js(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.selectedIndex=${index};e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await delay(150);
  };
  await click('#mobileControls');
  await select('#metric', 1);
  await select('#window', 0);
  await select('#baseline', 4);
  await select('#speed', 2);
  assert.deepEqual(
    await js(
      "({metric:state.metric,window:state.window,baseline:state.baseline,speed:document.getElementById('speed').value})",
    ),
    { metric: 1, window: 1, baseline: 'january', speed: '28' },
  );
  await click('#closeTimeline');
  const start = await js('state.index');
  await click('#back');
  assert.equal(await js('state.index'), start - 1);
  await click('#forward');
  assert.equal(await js('state.index'), start);
  await click('#play');
  await delay(650);
  assert.equal(await js('state.playing'), true);
  await click('#play');
  assert.equal(await js('state.playing'), false);
  await click('#latest');
  const zoom = await js('state.zoom');
  await click('#zoomin');
  assert.ok((await js('state.zoom')) > zoom);
  await click('#reset');
  assert.equal(await js('state.zoom'), 1);
  await click('#browseToggle');
  await call('Input.insertText', { text: 'Jebel Ali' });
  await delay(300);
  await click('#locations button');
  assert.equal(await js('passageSnapshot().place'), 'Jebel Ali');
  const latestAvailable = await js(
    'dates.filter((_,i)=>Number.isFinite(series[state.selected]?.[i]?.[state.metric])).at(-1)',
  );
  await click('#latest');
  assert.equal(await js('passageSnapshot().date'), latestAvailable);
  assert.ok(latestAvailable <= (await js('manifest.Daily_Ports_Data_latest')));
  await click('#pin');
  assert.equal(await js('state.pins.length'), 1);
  await click('#share');
  const shared = await js('location.hash');
  await navigate(base + shared);
  assert.equal(await js('state.pins.length'), 1);
  await click('#clearPins');
  assert.equal(await js('state.pins.length'), 0);
  await click('#depthPanel summary');
  await click('#loadHistory');
  await until(() => js('!!historyCache[state.selected]'));
  await click('#mobileControls');
  await select('#window', 1);
  await select('#baseline', 5);
  assert.equal(await js('state.baseline'), 'year');
  const yearStats = await js(
    '({b:stats[state.selected].baseline,e:stats[state.selected].baselineExpected})',
  );
  assert.equal(yearStats.e, 7, 'year-ago reference spans the current window length');
  assert.ok(Number.isFinite(yearStats.b), 'loaded history yields a same-dates-last-year mean');
  const expectedYear = await js(
    '(()=>{const rows=historyCache[state.selected],by=new Map(rows.map(r=>[r[0],r[state.metric+1]]));const ds=dates.slice(state.index-6,state.index+1).map(d=>String(Number(d.slice(0,4))-1)+d.slice(4));const v=ds.map(d=>by.get(d));return v.every(Number.isFinite)?v.reduce((a,b)=>a+b,0)/7:null})()',
  );
  assert.equal(yearStats.b, expectedYear, 'year-ago mean matches an independent recomputation');
  assert.ok(
    await js("document.getElementById('explanation').textContent.includes('same dates last year')"),
  );
  await select('#baseline', 0);
  await click('#closeTimeline');
  await js("document.querySelector('.detail').scrollTop=500");
  await delay(100);
  assert.ok(
    await js(
      "(()=>{const p=document.getElementById('placeName').getBoundingClientRect(),d=document.querySelector('.detail').getBoundingClientRect();return p.bottom<d.top&&getComputedStyle(document.getElementById('placeName')).position==='static'})()",
    ),
    'heading scrolls with content rather than masking the chart',
  );
  fs.writeFileSync(
    path.join(out, 'details-expanded.png'),
    Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
  );
  await click('#connections');
  await until(() => js("state.mode==='connections'&&!!network"));
  assert.equal(
    await js("getComputedStyle(document.querySelector('.time-controls')).display"),
    'none',
  );
  await select('#direction', 1);
  assert.equal(await js("document.getElementById('direction').value"), 'in');
  assert.ok((await js('links.length')) > 0);
  await click('#exposure');
  await until(() => js("state.mode==='exposure'&&countryRows.length>0"));
  await select('#trade', 1);
  assert.equal(await js("document.getElementById('trade').value"), 'daily_export_value_at_risk');
  assert.equal(
    await js("getComputedStyle(document.querySelector('.time-controls')).display"),
    'none',
  );
  await click('#change');
  await until(() => js("state.mode==='change'"));
  assert.notEqual(
    await js("getComputedStyle(document.querySelector('.time-controls')).display"),
    'none',
  );
  await click('#analyzeView');
  assert.equal(await js('comparison.open'), true);
  await click('#analysisSetup summary');
  await click('#analysisSetup summary');
  await select('#analysisDisplay', 1);
  assert.equal(await js("document.getElementById('analysisDailyPanel').hidden"), false);
  assert.ok(
    await js("document.getElementById('analysisDisplay').getBoundingClientRect().width>0"),
    'Display control stays visible in table mode',
  );
  // Dates on the page are the date picker: a table date selects the chart day,
  // the recovery study adopts it, and the start never sits empty.
  assert.ok(
    await js("document.querySelectorAll('#analysisDaily .day-select').length>0"),
    'daily table dates are buttons',
  );
  const tableDay = await js(
    "document.querySelector('#analysisDaily tbody tr:nth-child(5) .day-select').textContent",
  );
  await click('#analysisDaily tbody tr:nth-child(5) .day-select');
  assert.equal(await js('comparison.axis[comparison.day]'), tableDay);
  assert.ok(
    await js("document.querySelector('#analysisDaily tr.selected-day')!==null"),
    'selected day highlighted in table',
  );
  assert.equal(
    await js("document.getElementById('analysisEventFromChart').textContent"),
    'Use chart day · ' + tableDay,
  );
  assert.equal(
    await js("document.getElementById('analysisEventStart').value"),
    await js("document.getElementById('analysisStart').value"),
    'disruption start defaults to the observation start',
  );
  assert.equal(await js('comparison.recoveryAuto'), true);
  await js("document.getElementById('analysisRecovery').open=true");
  await click('#analysisEventFromChart');
  assert.equal(await js("document.getElementById('analysisEventStart').value"), tableDay);
  assert.equal(await js('comparison.recoveryAuto'), false);
  assert.equal(await js("document.getElementById('analysisRecovery').open"), true);
  assert.ok(
    await js(
      "document.getElementById('analysisRecoveryNote').textContent.includes('28 days before " +
        tableDay +
        "')",
    ),
  );
  assert.ok(
    await js(
      "document.querySelector('#recoveryResults tbody td').textContent!=='Disruption start outside the observation range'",
    ),
    'recovery table has a result, not a prompt to fill a field',
  );
  // Chart day → observation From; presets stay read-only until Custom dates.
  await click('#analysisSetup summary');
  await click('#analysisStartFromChart');
  assert.equal(await js("document.getElementById('analysisStart').value"), tableDay);
  assert.equal(await js("document.getElementById('analysisRefStart').readOnly"), true);
  await select('#analysisReference', 2);
  assert.equal(await js("document.getElementById('analysisRefStart').readOnly"), false);
  await select('#analysisReference', 0);
  await click('#analysisSetup summary');
  assert.ok(
    await js(
      "/\\d{1,2} \\w{3} .* vs the 28 days before/.test(document.getElementById('analysisSetupSummary').textContent)",
    ),
    'setup summary reads as prose',
  );
  await select('#analysisDisplay', 0);
  assert.equal(await js("document.getElementById('analysisChartPanel').hidden"), false);
  assert.equal(await js("document.getElementById('analysisDailyPanel').hidden"), true);
  // Method note is a real disclosure, not hover-only text.
  await click('.method-note summary');
  assert.equal(await js("document.querySelector('.method-note').open"), true);
  assert.ok(
    await js(
      "document.getElementById('analysisCoverage').textContent.includes('missing is not zero')",
    ),
  );
  await click('#exploreView');
  assert.equal(await js('comparison.open'), false);
  // Force each existing discovery through the real button, not direct navigation calls.
  const pool = await js('PassageDiscovery.candidates(passageEvents,passageShifts,places)');
  for (const target of pool) {
    await js(
      `comparison.event=null;comparison.signal=null;window.qaRandom=Math.random;Math.random=()=>${(pool.indexOf(target) + 0.5) / pool.length}`,
    );
    await click('#randomEvent');
    await js('Math.random=window.qaRandom;delete window.qaRandom');
    await until(() => js('!comparison.busy'));
    assert.equal(await js('comparisonContext().id'), target.id);
    assert.ok(
      await js('comparison.summaries.some(s=>s.count>0)'),
      'random discovery loads actual observations',
    );
    assert.equal(await js('comparison.open&&comparison.ids.includes(state.selected)'), true);
    assert.equal(
      await js("document.getElementById('analysisStart').value"),
      await js(
        target.kind === 'event'
          ? 'passageEvents.find(e=>e.id===comparison.event).start'
          : 'passageShifts.find(e=>e.id===comparison.signal).start',
      ),
    );
  }
  const context = await js('comparisonContext().id');
  await click('#analysisShare');
  const link = await js('location.href');
  await navigate(link);
  assert.equal(await js('comparisonContext().id'), context);
  await click('#exploreView');
  await js("document.getElementById('share').scrollIntoView({block:'center'})");
  await click('#share');
  const globeLink = await js('location.href');
  await navigate(globeLink);
  assert.equal(
    await js('comparisonContext().id'),
    context,
    'globe share preserves the selected shift annotation',
  );

  await navigate(base + '#place=chokepoint6');
  assert.equal(
    await js('state.selected'),
    'chokepoint6',
    'explicit shared selections remain intact',
  );
  await navigate(base + 'stories/');
  assert.equal(await js('comparison.open&&document.getElementById("eventCatalog").open'), true);
};
