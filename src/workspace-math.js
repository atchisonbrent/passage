/* Calendar-aligned descriptive comparisons. No zero fill or causal model. */
(function(root){
  const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
  const shift=(s,n)=>new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  function days(start,end){if(!validDate(start)||!validDate(end)||start>end||end>'2100-01-01'||start<'2019-01-01')return [];const out=[];for(let d=start;d<=end;d=shift(d,1))out.push(d);return out;}
  function period(rows,col,start,end){const map=new Map(rows.map(r=>[r[0],r[col]])),ds=days(start,end),values=ds.map(d=>map.get(d)),count=values.filter(Number.isFinite).length;return {mean:ds.length&&count===ds.length?values.reduce((a,b)=>a+b,0)/ds.length:null,count,expected:ds.length};}
  function summary(rows,col,start,end,refStart,refEnd){const cur=period(rows,col,start,end),ref=period(rows,col,refStart,refEnd),reference=refEnd<start?ref.mean:null,difference=cur.mean!==null&&reference!==null?cur.mean-reference:null;
    return {mean:cur.mean,reference,difference,percent:difference!==null&&reference>0?100*difference/reference:null,net:difference!==null?difference*cur.expected:null,count:cur.count,expected:cur.expected,referenceCount:ref.count,referenceExpected:ref.expected,reason:!cur.expected?'Choose a valid observation range':cur.mean===null?'Incomplete observation range':refEnd>=start?'Reference must end before observations':reference===null?'Incomplete reference':reference===0?'Zero reference: percentage undefined':'Complete periods; descriptive, not causal'};}
  const normalize=(v,ref)=>Number.isFinite(v)&&ref>0?v/ref*100:null;
  const api={validDate,shift,days,period,summary,normalize};if(typeof module!=='undefined')module.exports=api;else root.PassageWorkspaceMath=api;
})(typeof window!=='undefined'?window:globalThis);
