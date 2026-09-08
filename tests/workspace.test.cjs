const assert=require('node:assert/strict');
const A=require('../src/workspace-math.js');
const M=require('../src/analysis.js');
const rows=Array.from({length:100},(_,i)=>[M.shiftDay('2026-01-01',i),i<28?100:50]);
let s=A.summary(rows,1,'2026-01-29','2026-02-10','2026-01-01','2026-01-28');
assert.equal(s.mean,50);assert.equal(s.reference,100);assert.equal(s.percent,-50);assert.equal(s.net,-650);assert.equal(s.count,13);
assert.equal(A.summary(rows.filter(r=>r[0]!=='2026-02-01'),1,'2026-01-29','2026-02-10','2026-01-01','2026-01-28').mean,null);
assert.equal(A.summary(rows,1,'2026-01-20','2026-02-10','2026-01-01','2026-01-28').reference,null);
assert.equal(A.summary(rows.map(r=>[r[0],0]),1,'2026-01-29','2026-02-10','2026-01-01','2026-01-28').percent,null);
assert.equal(A.summary(rows.map(r=>[r[0],0]),1,'2026-01-29','2026-02-10','2026-01-01','2026-01-28').mean,0);
assert.equal(A.validDate('2026-02-30'),false);assert.equal(A.validDate('2024-02-29'),true);
assert.deepEqual(A.days('2026-02-02','2026-02-01'),[]);
assert.equal(A.summary(rows,1,'2026-02-02','2026-02-01','2026-01-01','2026-01-28').mean,null);
assert.equal(A.normalize(0,100),0);assert.equal(A.normalize(3,0),null);
console.log('workspace math: calendar validation, complete periods, overlap, zero, missing, index and net deviation passed');

assert.equal(A.days('2019-01-01','2026-08-30').at(-1),'2026-08-30');
assert.equal(A.summary(rows,1,'2026-01-01','2026-02-10','2018-12-01','2018-12-28').reference,null);
const events=require('../src/events.js');assert.equal(new Set(events.map(e=>e.id)).size,events.length);
for(const e of events){assert(A.validDate(e.date));assert(A.validDate(e.start));assert(A.validDate(e.end));assert(e.referenceEnd<e.start);assert(e.places.length>0&&e.places.length<=4);assert(e.url.startsWith('https://'));assert(e.dateKind&&e.caveat);}
console.log('event catalog: dated sources, explicit date kinds and earlier references passed');
