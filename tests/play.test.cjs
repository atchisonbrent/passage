// Exercise the actual browser play() entrypoint with its clock/DOM dependencies bounded.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/data/manifest.json'),'utf8'));
const end=[manifest.Daily_Ports_Data_latest,manifest.Daily_Chokepoints_Data_latest].sort().at(-1);
const dates=[];
for(let t=Date.parse(manifest.start+'T00:00:00Z');t<=Date.parse(end+'T00:00:00Z');t+=86400000)dates.push(new Date(t).toISOString().slice(0,10));
const source=fs.readFileSync(path.join(root,'src/app.js'),'utf8').match(/^function play\(\)\{.*\}$/m)?.[0];
assert.ok(source,'Actual play entrypoint must be found');
const shared=dates.indexOf([manifest.Daily_Ports_Data_latest,manifest.Daily_Chokepoints_Data_latest].sort()[0]);
for(const [index,expected] of [[shared,0],[dates.length-1,0],[50,50]]){
 const context={state:{index,mode:'change',playing:false},manifest,dates,stop(){},refresh(){},performance:{now:()=>0},$:()=>({value:'7'}),setInterval:()=>1};
 vm.runInNewContext(source+';play();',context);
 assert.equal(context.state.index,expected,'Play at a latest snapshot must replay, not immediately end');
 assert.equal(context.state.playing,true);
}
console.log('actual play entrypoint: shared-latest replay, end replay, mid-range continuation passed');
