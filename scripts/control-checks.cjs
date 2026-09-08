const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
exports.checkControls=async({call,js,click,delay,out,width,height})=>{
  const geometry=()=>js("(()=>{const r=document.getElementById('globe').getBoundingClientRect();return {height:r.height,width:r.width}})()");
  const before=await geometry();
  assert.equal(await js("document.querySelectorAll('#mobileControls svg[aria-hidden=true]').length"),2,'Settings needs decorative gear and disclosure icons');
  if(width>=901){
    assert.equal(await js("getComputedStyle(document.getElementById('placeName')).boxShadow"),'none','sticky title must not paint over the resting place label');
    assert.ok(await js("(()=>{const a=document.getElementById('placeKind').getBoundingClientRect(),b=document.getElementById('placeName').getBoundingClientRect();return a.height>0&&a.bottom<=b.top+1})()"));
    fs.writeFileSync(path.join(out,`resting-${width}-${height}.png`),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  await click('#mobileControls');
  assert.equal(await js("document.getElementById('timelineSettings').hidden"),false);
  assert.notEqual(await js('document.activeElement.tagName'),'SELECT','opening Settings must not focus a native picker');
  assert.deepEqual(await geometry(),before,'settings must not resize the globe');
  assert.ok(await js("(()=>{const r=document.getElementById('timelineSettings').getBoundingClientRect();return r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"),'settings must fit the viewport');
  if(width<=360)assert.ok(await js("document.getElementById('speed').getBoundingClientRect().width>200"),'narrow settings must give select labels a full row');
  fs.writeFileSync(path.join(out,`settings-${width}-${height}.png`),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  if(width<=360){
    await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:width/2,y:250,deltaX:0,deltaY:240});await delay(300);
    assert.ok(await js("document.getElementById('timelineSettings').scrollTop>0"),'narrow Settings scrolls through all fields');
    assert.ok(await js("(()=>{const r=document.getElementById('baseline').getBoundingClientRect(),p=document.getElementById('timelineSettings').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom})()"),'comparison control remains reachable');
    fs.writeFileSync(path.join(out,'settings-narrow-scrolled.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await js("document.getElementById('timelineSettings').hidden&&document.activeElement.id==='mobileControls'"),true);
  await click('#mobileControls');await click('#closeTimeline');
  // Exercise a real touch sequence, not mouse clicks with a mobile viewport.
  if(width<=1210){
    const b=await js("(()=>{const r=document.getElementById('mobileControls').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...b,id:0,radiusX:1,radiusY:1}]});
    await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(150);
    assert.equal(await js("document.getElementById('timelineSettings').hidden"),false);
    assert.notEqual(await js('document.activeElement.tagName'),'SELECT','Settings tap must not focus a picker');
    await click('#closeTimeline');
  }
  // Opening with Enter keeps focus on the disclosure; Tab reaches Close then Speed.
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert.equal(await js("document.getElementById('timelineSettings').hidden"),false);
  assert.equal(await js('document.activeElement.id'),'mobileControls');
  assert.notEqual(await js("getComputedStyle(document.querySelector('.settings-chevron')).transform"),'none');
  const tab=async()=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});};
  await tab(); // Scrubber follows the disclosure in document order.
  assert.equal(await js('document.activeElement.id'),'scrub');
  await tab();assert.equal(await js('document.activeElement.id'),'closeTimeline');
  await tab();assert.equal(await js('document.activeElement.id'),'speed');
  await click('#closeTimeline');
  await click('#mobileControls');await click('#reset');
  assert.equal(await js("document.getElementById('timelineSettings').hidden"),true,'outside click closes Settings');
  assert.equal(await js("getComputedStyle(document.querySelector('.settings-chevron')).transform"),'none');
  assert.equal(await js("document.getElementById('mobileControls').getAttribute('aria-expanded')"),'false');
  await click('#mobileExplore');
  assert.deepEqual(await geometry(),before,'More must not resize the globe');
  await click('#sources');assert.equal(await js("document.getElementById('sourceDialog').open"),true);
  await click('#closeDialog');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await js("document.body.classList.contains('explore-open')"),false);
};
exports.checkLenses=async({call,js,click,navigate,delay,until,base,out})=>{
  await call('Emulation.setDeviceMetricsOverride',{width:1210,height:702,deviceScaleFactor:1,mobile:false});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await navigate(base);
  const select=async(selector,index)=>{await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.selectedIndex=${index};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(150);};
  await click('#mobileControls');
  await select('#metric',1);await select('#window',1);await select('#baseline',1);await select('#speed',2);
  assert.deepEqual(await js("({metric:state.metric,window:state.window,baseline:state.baseline,speed:document.getElementById('speed').value})"),{metric:1,window:1,baseline:'january',speed:'28'});
  await click('#closeTimeline');
  const start=await js('state.index');await click('#back');assert.equal(await js('state.index'),start-1);
  await click('#forward');assert.equal(await js('state.index'),start);
  await click('#play');await delay(650);assert.equal(await js('state.playing'),true);
  await click('#play');assert.equal(await js('state.playing'),false);
  await click('#latest');
  const zoom=await js('state.zoom');await click('#zoomin');assert.ok(await js('state.zoom')>zoom);await click('#reset');assert.equal(await js('state.zoom'),1);
  await click('#browseToggle');await call('Input.insertText',{text:'Jebel Ali'});await delay(300);await click('#locations button');
  assert.equal(await js('passageSnapshot().place'),'Jebel Ali');
  const latestAvailable=await js('dates.filter((_,i)=>Number.isFinite(series[state.selected]?.[i]?.[state.metric])).at(-1)');
  await click('#latest');assert.equal(await js('passageSnapshot().date'),latestAvailable);
  assert.ok(latestAvailable<=await js('manifest.Daily_Ports_Data_latest'));
  await click('#pin');assert.equal(await js('state.pins.length'),1);
  await click('#share');const shared=await js('location.hash');await navigate(base+shared);assert.equal(await js('state.pins.length'),1);
  await click('#clearPins');assert.equal(await js('state.pins.length'),0);
  await click('#depthPanel summary');await click('#loadHistory');await until(()=>js('!!historyCache[state.selected]'));
  await js("document.querySelector('.detail').scrollTop=500");await delay(100);
  assert.ok(await js("(()=>{const p=document.getElementById('placeName').getBoundingClientRect(),d=document.querySelector('.detail').getBoundingClientRect();return p.top>=d.top-1&&p.bottom<d.bottom})()"),'selected place stays visible while details scroll');
  fs.writeFileSync(path.join(out,'details-expanded.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await click('#connections');await until(()=>js("state.mode==='connections'&&!!network"));
  assert.equal(await js("getComputedStyle(document.querySelector('.time-controls')).display"),'none');
  await select('#direction',1);assert.equal(await js("document.getElementById('direction').value"),'in');assert.ok(await js('links.length')>0);
  await click('#exposure');await until(()=>js("state.mode==='exposure'&&countryRows.length>0"));
  await select('#trade',1);assert.equal(await js("document.getElementById('trade').value"),'daily_export_value_at_risk');
  assert.equal(await js("getComputedStyle(document.querySelector('.time-controls')).display"),'none');
  await click('#change');await until(()=>js("state.mode==='change'"));
  assert.notEqual(await js("getComputedStyle(document.querySelector('.time-controls')).display"),'none');
  await click('#analyzeView');assert.equal(await js('aw.open'),true);
  await click('#analysisSetup summary');await click('#analysisSetup summary');
  await select('#analysisDisplay',1);assert.equal(await js("document.getElementById('analysisDailyPanel').hidden"),false);
  await click('#exploreView');assert.equal(await js('aw.open'),false);
};
