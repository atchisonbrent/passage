/* Real Chromium navigation + responsive/restore smoke. Node 22+, no npm dependencies. */
const {spawn}=require('node:child_process');
const {removeProfile}=require('./browser-profile.cjs');
const {checkControls,checkLenses}=require('./control-checks.cjs');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=process.argv[2]||'http://127.0.0.1:8653/';
const out=process.argv[3]||path.join(os.tmpdir(),'passage-browser-receipts');
const chrome=process.env.CHROME_BIN||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/google-chrome');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'passage-smoke-'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const deadline=Date.now()+45000;let last;while(Date.now()<deadline){try{if(await fn())return;}catch(e){last=e;}await delay(100);}throw Error('Browser readiness timeout: '+(last?.message||''));}
(async()=>{
 const proc=spawn(chrome,['--headless=new','--no-sandbox','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+tmp,'--no-first-run','--disable-background-networking','about:blank'],{stdio:'ignore'});
 let ws;
 try{
  await until(()=>fs.existsSync(path.join(tmp,'DevToolsActivePort')));
  const port=fs.readFileSync(path.join(tmp,'DevToolsActivePort'),'utf8').split('\n')[0];
  const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0;const pending=new Map(),errors=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);if(pending.has(m.id)){const {resolve,reject,timer}=pending.get(m.id);clearTimeout(timer);pending.delete(m.id);m.error?reject(Error(m.error.message)):resolve(m.result);}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},45000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
  const js=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
  const click=async selector=>{await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);await delay(100);const b=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',...b,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...b,button:'left',clickCount:1});await delay(150);};
  const navigate=async url=>{await call('Page.navigate',{url:'about:blank'});await until(()=>js("location.href==='about:blank'"));await call('Page.navigate',{url});await until(()=>js('!!window.passageSnapshot?.().ready'));};
  await call('Page.enable');await call('Runtime.enable');
  fs.mkdirSync(out,{recursive:true});const results=[];
  for(const [width,height] of [[320,568],[390,844],[744,1133],[834,1210],[900,1200],[901,1200],[1024,1366],[1100,1400],[1210,702],[1210,834],[1366,1024],[1440,900],[1920,1080]]){
   await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   await call('Emulation.setTouchEmulationEnabled',{enabled:width<=1210});
   await navigate(base);await checkControls({call,js,click,delay,out,width,height});await click('#eventsView');
   assert.equal(await js("document.getElementById('eventCatalog').open"),true);
   assert.ok(await js("document.getElementById('freshness').textContent.includes('Observations:')"));
   assert.ok(await js("document.getElementById('shiftPeriodNote').textContent.includes('relative to observed coverage')"));
   await js("document.getElementById('shiftPeriod').value='archive';document.getElementById('shiftPeriod').dispatchEvent(new Event('change'))");
   await click('[data-shift]');
   assert.ok(await js('aw.axis.length>=35&&aw.summaries[0].mean!==null'));
   assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'));
   const expected=await js('({id:aw.signal,mean:aw.summaries[0].mean,reference:aw.summaries[0].reference})');
   const hash=await js("'#'+awParams()");
   await navigate(base+hash);assert.deepEqual(await js('({id:aw.signal,mean:aw.summaries[0].mean,reference:aw.summaries[0].reference})'),expected);
   await click('#analysisChart');await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
   const image=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`analysis-${width}.png`),Buffer.from(image.data,'base64'));
   results.push({width,height,...expected});
  }
  // Exercise every retained discovery, not a hand-counted subset.
  const ids=await js('passageShifts.map(h=>h.id)');
  for(const ident of ids){await js(`awShift(${JSON.stringify(ident)})`);const hash=await js("'#'+awParams()");await navigate(base+hash);assert.equal(await js('aw.signal'),ident);}
  await checkLenses({call,js,click,navigate,delay,until,base,out});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({results,discoveryCount:ids.length,errors},null,2));
  console.log(JSON.stringify({viewports:results.length,discoveries:ids.length,exceptions:errors.length}));
 }finally{
  ws?.close();proc.kill('SIGTERM');await new Promise(resolve=>proc.exitCode!==null?resolve():proc.once('exit',resolve));await removeProfile(tmp);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
