/* Chart scrubbing: horizontal intent; vertical browser panning stays native. */
(function(root){
  const bounds=width=>({left:48,right:Math.max(49,width-10)});
  function indexAt(x,width,count){const b=bounds(width);return Math.max(0,Math.min(count-1,Math.round((x-b.left)/(b.right-b.left)*Math.max(0,count-1))));}
  function attach(canvas,{count,index,onSelect}){
    const pointers=new Set();let active=null,multi=false;
    const release=id=>{try{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}catch{}};
    const select=e=>{if(count()>0){const r=canvas.getBoundingClientRect();onSelect(indexAt(e.clientX-r.left,r.width,count()));}};
    // Ambiguous diagonals do not select: native vertical scrolling gets priority.
    const intent=e=>{if(active?.mode!=='pending')return;const dx=Math.abs(e.clientX-active.x),dy=Math.abs(e.clientY-active.y);if(dy>6&&dy>=dx)active.mode='vertical';else if(dx>6&&dx>dy*1.2)active.mode='horizontal';};
    canvas.addEventListener('pointerdown',e=>{
      if(e.button!==undefined&&e.button!==0)return;
      pointers.add(e.pointerId);if(pointers.size>1){multi=true;active=null;return;}
      if(multi)return;active={id:e.pointerId,x:e.clientX,y:e.clientY,mode:'pending'};
      try{canvas.setPointerCapture(e.pointerId);}catch{active=null;pointers.delete(e.pointerId);}
    });
    canvas.addEventListener('pointermove',e=>{if(!active||active.id!==e.pointerId||multi)return;intent(e);if(active.mode==='horizontal'){e.preventDefault();select(e);}});
    canvas.addEventListener('pointerup',e=>{
      if(active?.id===e.pointerId&&!multi){intent(e);if(active.mode==='horizontal'||active.mode==='pending'&&Math.hypot(e.clientX-active.x,e.clientY-active.y)<=6)select(e);}
      if(active?.id===e.pointerId)active=null;pointers.delete(e.pointerId);release(e.pointerId);if(!pointers.size)multi=false;
    });
    const cancel=e=>{if(active?.id===e.pointerId)active=null;pointers.delete(e.pointerId);release(e.pointerId);if(!pointers.size)multi=false;};
    canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
    canvas.addEventListener('keydown',e=>{if(count()<=0)return;const step=e.shiftKey?7:1;let next=index();if(e.key==='ArrowLeft'||e.key==='ArrowDown')next-=step;else if(e.key==='ArrowRight'||e.key==='ArrowUp')next+=step;else if(e.key==='Home')next=0;else if(e.key==='End')next=count()-1;else return;e.preventDefault();onSelect(Math.max(0,Math.min(count()-1,next)));});
  }
  const api={bounds,indexAt,attach};if(typeof module!=='undefined')module.exports=api;else root.PassageChartInput=api;
})(typeof window!=='undefined'?window:globalThis);
