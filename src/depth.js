/* Selected-place analysis. Historical files load only on explicit request. */
const historyCache={},historyRequests={},historyErrors={};
let historyManifest=null,depthExport=[],depthKey='';
function restoreDepth(q){
  if(/^\d{4}-\d{2}-\d{2}$/.test(q.get('event')||'')&&q.get('event')>='2019-01-01'&&q.get('event')<=dates.at(-1))$('eventStart').value=q.get('event');
  if(['0.8','0.9','1'].includes(q.get('threshold')))$('recoveryThreshold').value=q.get('threshold');
  if(['7','14'].includes(q.get('sustain')))$('recoveryDays').value=q.get('sustain');
  if(q.get('compare')==='indexed')$('comparisonScale').value='indexed';
  $('depthPanel').open=q.get('depth')==='1';
}
function bindDepth(){
  $('depthPanel').ontoggle=()=>{depthKey='';renderDepth();};
  $('loadHistory').onclick=()=>fetchHistory(state.selected);
  for(const id of ['eventStart','recoveryThreshold','recoveryDays','comparisonScale'])$(id).onchange=()=>{depthKey='';refresh();};
  $('downloadDepth').onclick=()=>download(state.selected+'-analysis.csv',depthExport);
}
async function fetchHistory(id){
  if(historyCache[id]||historyRequests[id])return;
  delete historyErrors[id];
  historyRequests[id]=(async()=>{
    try{
      if(!historyManifest)historyManifest=await load('history-manifest.json');
      const entry=historyManifest.files[id];if(!entry)throw new Error('No historical file for this place');
      const rows=await load(entry.file);if(rows.length!==entry.rows)throw new Error('Historical row count mismatch');
      historyCache[id]=rows;
    }catch(e){historyErrors[id]=e.message;}
    finally{delete historyRequests[id];depthKey='';refresh();}
  })();depthKey='';refresh();await historyRequests[id];
}
function combinedHistory(id){return [...(historyCache[id]||[]),...dates.map((d,i)=>[d,...(series[id]?.[i]||Array(7).fill(null))])];}
function renderDepth(){
  if(!$('depthPanel').open)return;
  const id=state.selected,end=dates[state.index],metric=state.metric,col=metric+1,rows=combinedHistory(id),event=$('eventStart').value;
  const key=[id,end,metric,state.window,state.baseline,event,$('recoveryThreshold').value,$('recoveryDays').value,!!historyCache[id],!!historyRequests[id],historyErrors[id],innerWidth].join('|');
  if(key===depthKey)return;depthKey=key;
  $('eventStart').min='2019-01-01';$('eventStart').max=end;
  $('loadHistory').disabled=!!historyRequests[id]||!!historyCache[id];
  text('loadHistory',historyCache[id]?'Historical file loaded':historyRequests[id]?'Loading historical file…':'Load 2019–2025 history');
  text('historyStatus',historyErrors[id]?'History unavailable: '+historyErrors[id]+'. Tap Load to retry.':historyCache[id]?`${historyCache[id].length.toLocaleString()} dated source rows loaded. Coverage depends on measure and period.`:'Historical context loads only for this selected place. Current analysis uses the bundled 2026 observations.');
  const seasonal=M.seasonalReference(rows,col,end,state.window),current=M.summarize(series[id]||[],state.index,metric,state.window).current;
  text('seasonSummary',seasonal.mean===null?(historyCache[id]?`Only ${seasonal.years.length} complete earlier years for this window; at least three are required.`:'Load history to compare the same calendar window in earlier years. At least three complete prior years are required.'):`${fmt(current)} now versus ${fmt(seasonal.mean)} across ${seasonal.years.length} complete earlier years; historical range ${fmt(seasonal.min)}–${fmt(seasonal.max)}. Same calendar dates, not holiday-adjusted or a confidence interval.`);
  $('seasonYears').replaceChildren(...seasonal.years.map(r=>element('span','season-year',r.year+': '+fmt(r.mean))));
  drawHistory(rows,col);
  const valid=/^\d{4}-\d{2}-\d{2}$/.test(event)&&event>='2019-01-01'&&event<=end;
  const study=valid?M.eventStudy(rows,col,event,end,Number($('recoveryThreshold').value),Number($('recoveryDays').value)):null;
  const dl=$('eventResults');dl.replaceChildren();
  const recovery=study?.baseline===null?'Insufficient pre-event observations':study?.baseline===0?'Undefined for a zero baseline':study?.recovery?`Confirmed ${study.recovery}`:study?.observedDays===0?'No usable follow-up observations':study?.belowDays===0?'No observed decline below threshold':'Not confirmed within observed follow-up';
  const results=study?[
    ['Reference window',study.referenceStart+' → '+study.referenceEnd],['Pre-event mean',fmt(study.baseline)+' / day'],
    ['Follow-up',event+' → '+end],['Coverage',study.observedDays+' / '+study.expectedDays+' days with usable observed values'],
    ['Days below threshold',study.baseline>0?study.belowDays+' observed days':'Unavailable'],['Recovery',recovery],
    ['Lowest complete 7-day mean',fmt(study.minMean)+(study.minDate?' · ending '+study.minDate:'')],
    ['Cumulative shortfall',fmt(study.shortfall)+' '+(metric<4?'calls':'estimated tonnes')],
    ['Net deviation',fmt(study.netDeviation)+' '+(metric<4?'calls':'estimated tonnes')]
  ]:[['Choose an event date','It must be on or before the selected observation date.']];
  for(const [k,v] of results)dl.append(element('dt','',k),element('dd','',v));
  dl.append(element('dt','','Interpretation'),element('dd','','Shortfall sums only below-reference deviations; net deviation also includes surges. Missing follow-up days suppress both totals. These are descriptive reference comparisons, not economic losses. Recovery can be followed by relapse; missing days break its confirmation run. A zero reference still permits absolute deviations, but not percentage or recovery claims.'));
  const labels=['All calls','Tanker calls','Container calls','Dry-bulk calls','Estimated imports','Estimated exports','Passage capacity'];
  const entries=[];for(let m=0;m<7;m++){
    if(m>=4&&(m<6?place().kind!=='port':place().kind!=='chokepoint'))continue;
    const s=M.summarize(series[id]||[],state.index,m,state.window,state.baseline);
    entries.push({m,s});
  }
  const total=entries[0]?.s.current;
  $('categoryResults').replaceChildren(...entries.map(({m,s})=>{
    const e=element('div','category-row');e.append(element('strong','',labels[m]),element('span','',fmt(s.current)+' / day'),element('small','',s.percent===null?'No complete reference':(s.percent>0?'+':'')+fmt(s.percent)+'% vs '+(state.baseline==='january'?'Jan 1–28':'preceding 28 days')));
    if(m>0&&m<4&&total>0&&s.current!==null)e.append(element('small','',fmt(s.current/total*100)+'% of all calls'));return e;
  }));
  const categories=entries.filter(e=>e.m>0&&e.m<4).map(e=>e.s.current);
  const residual=Number.isFinite(total)&&categories.length===3&&categories.every(Number.isFinite)?total-categories.reduce((a,b)=>a+b,0):null;
  $('categoryResults').append(element('p','hint',residual===null?'Unrepresented call categories: insufficient data.':residual>=0?'Other call categories: '+fmt(residual)+' / day.':'Selected category totals exceed all calls; shares are not presented as an exhaustive partition.'));
  depthExport=[['section','key','value','place_id','measure','observation_end','event_start','threshold','sustain_days','snapshot_assembled'],...results.map(([k,v])=>['event',k,v,id,labels[metric],end,event,$('recoveryThreshold').value,$('recoveryDays').value,manifest.retrieved]),...seasonal.years.map(y=>['seasonal',y.year,y.mean,id,labels[metric],end,'','','',historyManifest?.assembled||'']),...entries.map(({m,s})=>['category',labels[m],s.current,id,labels[m],end,'','','',manifest.retrieved])];
  if(study)for(const [key,value] of Object.entries(study))depthExport.push(['event_numeric',key,value,id,labels[metric],end,event,$('recoveryThreshold').value,$('recoveryDays').value,manifest.retrieved]);
  for(const row of rows)depthExport.push(['observation',row[0],row[col]??null,id,labels[metric],end]);
  depthExport.push(['method','window_days',state.window],['method','category_reference',state.baseline],['source','activity',manifest.sources[place().kind==='port'?'Daily_Ports_Data':'Daily_Chokepoints_Data']],['source','history',historyManifest?.sources[place().kind==='port'?'Daily_Ports_Data':'Daily_Chokepoints_Data']||'not loaded'],['method','seasonal','Same end month/day, trailing selected window, complete prior years only; at least 3 for pooled reference. Not seasonally adjusted.']);
  depthExport=depthExport.map(row=>[...row,...Array(Math.max(0,depthExport[0].length-row.length)).fill('')]);
}
function drawHistory(rows,column){
  const months=new Map();if(rows.length){for(let d=rows[0][0].slice(0,7)+'-01';d<=rows.at(-1)[0];){months.set(d.slice(0,7),[]);const t=new Date(d+'T00:00:00Z');t.setUTCMonth(t.getUTCMonth()+1);d=t.toISOString().slice(0,10);}}for(const row of rows){const month=row[0].slice(0,7);if(!months.has(month))months.set(month,[]);months.get(month).push(row);}
  const points=[...months].sort(([a],[b])=>a.localeCompare(b)).map(([month,rs])=>{
    const expected=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate(),v=rs.map(r=>r[column]);
    return {month,mean:rs.length===expected&&v.every(Number.isFinite)?v.reduce((a,b)=>a+b,0)/expected:null};
  });
  const {ctx,w,h}=sizeCanvas($('historyChart'));ctx.clearRect(0,0,w,h);const max=Math.max(1,...points.map(p=>p.mean||0));ctx.strokeStyle='#83dbc1';ctx.beginPath();let pen=false;
  points.forEach((p,i)=>{if(p.mean===null){pen=false;return;}const x=i/Math.max(1,points.length-1)*w,y=h-10-p.mean/max*(h-25);if(pen)ctx.lineTo(x,y);else ctx.moveTo(x,y);pen=true;});ctx.stroke();
  text('historyRange',`${points[0]?.month||'—'} → ${points.at(-1)?.month||'—'} · complete calendar-month means only · scale 0–${short(max)} / day. Partial months are gaps. Historical chart does not move the globe date.`);
}
