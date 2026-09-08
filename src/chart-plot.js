/* Readable daily charts share date geometry with pointer/keyboard selection. */
function plot(canvas, items) {
  const { ctx, w, h } = sizeCanvas(canvas),
    { left, right } = PassageChartInput.bounds(w),
    top = 10,
    bottom = h - 30,
    metric = state.metric,
    indexMode = canvas.id === 'comparison' && $('comparisonScale').value === 'indexed';
  ctx.clearRect(0, 0, w, h);
  const values = {};
  let max = 1;
  for (const item of items) {
    const raw = (series[item.id] || []).map((r) => r?.[metric]),
      ref = raw.slice(0, 28),
      base =
        ref.length === 28 && ref.every(Number.isFinite)
          ? ref.reduce((a, b) => a + b, 0) / 28
          : null;
    values[item.id] = indexMode ? M.indexed(raw, base) : raw;
    for (const v of values[item.id]) if (Number.isFinite(v)) max = Math.max(max, v);
  }
  const xAt = (i) => left + (i / Math.max(1, dates.length - 1)) * (right - left),
    yAt = (v) => bottom - (v / max) * (bottom - top);
  ctx.font = '11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let i = 0; i < 3; i++) {
    const value = (max * i) / 2,
      y = yAt(value);
    ctx.strokeStyle = '#52737b66';
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillStyle = '#a9bdc4';
    ctx.fillText(short(value), left - 8, y);
  }
  const ticks = [0];
  for (let i = 1; i < dates.length - 1; i++)
    if (dates[i].endsWith('-01') && xAt(i) - xAt(ticks.at(-1)) >= 65 && right - xAt(i) >= 55)
      ticks.push(i);
  if (dates.length > 1) ticks.push(dates.length - 1);
  const dateLabel = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  for (const i of ticks) {
    const x = xAt(i);
    ctx.strokeStyle = '#52737b44';
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, bottom + 5);
    ctx.stroke();
    ctx.fillStyle = '#a9bdc4';
    ctx.textAlign = i === 0 ? 'left' : i === dates.length - 1 ? 'right' : 'center';
    ctx.fillText(dateLabel.format(new Date(dates[i] + 'T00:00:00Z')), x, h - 12);
  }
  for (const item of items) {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < dates.length; i++) {
      const v = values[item.id]?.[i];
      if (!Number.isFinite(v)) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(xAt(i), yAt(v));
      else ctx.moveTo(xAt(i), yAt(v));
      pen = true;
    }
    ctx.stroke();
  }
  if (canvas.id === 'chart') comparisonGlobeAnnotation(ctx, left, right, top, bottom);
  const x = xAt(state.index);
  ctx.strokeStyle = '#f4c397';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
  ctx.stroke();
  for (const item of items) {
    const v = values[item.id]?.[state.index];
    if (!Number.isFinite(v)) continue;
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(x, yAt(v), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const unit = indexMode ? 'index points' : metric < 4 ? 'calls' : 'estimated tonnes';
  const reading =
    dates[state.index] +
    ' · ' +
    items
      .map((item) => {
        const v = values[item.id]?.[state.index];
        return (
          (items.length > 1 ? (placeById[item.id]?.name || item.id) + ': ' : '') +
          (Number.isFinite(v) ? fmt(v) + ' ' + unit : 'no observation')
        );
      })
      .join(' · ');
  text(canvas.id === 'chart' ? 'chartReadout' : 'comparisonReadout', reading + ' · daily');
  canvas.setAttribute('aria-valuemin', '0');
  canvas.setAttribute('aria-valuemax', String(dates.length - 1));
  canvas.setAttribute('aria-valuenow', String(state.index));
  canvas.setAttribute('aria-valuetext', reading);
  return max;
}
function bindCharts() {
  for (const id of ['chart', 'comparison'])
    PassageChartInput.attach($(id), {
      count: () => dates.length,
      index: () => state.index,
      onSelect: (i) => setDate(i),
    });
}
