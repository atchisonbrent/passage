/* Comparison view helpers; shared state is owned by workspace.js. */

function comparisonRenderChart() {
  const canvas = $('analysisChart');
  if (!$('analysisChartPanel').hidden && comparison.axis.length) {
    const { ctx, w, h } = sizeCanvas(canvas);
    if (!w || !h) return;
    const { left, right } = PassageChartInput.bounds(w),
      top = 20,
      bottom = h - 35,
      n = comparison.axis.length,
      indexed = $('analysisScale').value === 'indexed',
      col = Number($('analysisMetric').value) + 1;
    const values = comparison.ids.map((id, j) => {
      const map = new Map(comparison.rows[id].map((r) => [r[0], r[col]]));
      return comparison.axis.map((d) => {
        const v = map.get(d);
        return !comparisonCompatible(id)
          ? null
          : indexed
            ? comparisonMath.normalize(v, comparison.summaries[j]?.reference)
            : v;
      });
    });
    let max = 1;
    for (const row of values) for (const v of row) if (Number.isFinite(v)) max = Math.max(max, v);
    const x = (i) => left + (i / Math.max(1, n - 1)) * (right - left),
      y = (v) => bottom - (v / max) * (bottom - top);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px -apple-system,sans-serif';
    ctx.textBaseline = 'middle';
    const rs = $('analysisRefStart').value,
      re = $('analysisRefEnd').value;
    let ri = comparison.axis.findIndex((d) => d >= rs),
      rj = comparison.axis.findLastIndex((d) => d <= re);
    if (ri >= 0 && rj >= ri) {
      ctx.fillStyle = '#85bce825';
      ctx.fillRect(x(ri), top, Math.max(1, x(rj) - x(ri)), bottom - top);
    }
    for (let i = 0; i <= 2; i++) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#9cb2ba';
      ctx.fillText(short((max * i) / 2), left - 7, y((max * i) / 2));
      ctx.strokeStyle = '#52737b66';
      ctx.beginPath();
      ctx.moveTo(left, y((max * i) / 2));
      ctx.lineTo(right, y((max * i) / 2));
      ctx.stroke();
    }
    const tickCount = Math.max(2, Math.min(6, Math.floor((right - left) / 95)));
    for (let j = 0; j < tickCount; j++) {
      const i = Math.round((j / (tickCount - 1)) * (n - 1));
      ctx.textAlign = j === 0 ? 'left' : j === tickCount - 1 ? 'right' : 'center';
      ctx.fillStyle = '#9cb2ba';
      ctx.fillText(comparison.axis[i], x(i), h - 12);
    }
    values.forEach((row, j) => {
      ctx.strokeStyle = comparisonColors[j];
      ctx.setLineDash(j === 0 ? [] : j === 1 ? [7, 3] : j === 2 ? [2, 3] : [9, 3, 2, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let pen = false;
      row.forEach((v, i) => {
        if (!Number.isFinite(v)) {
          pen = false;
          return;
        }
        if (pen) ctx.lineTo(x(i), y(v));
        else ctx.moveTo(x(i), y(v));
        pen = true;
      });
      ctx.stroke();
    });
    ctx.setLineDash([]);
    const event = comparisonContext(),
      ei = event ? comparison.axis.indexOf(event.date) : -1;
    if (ei >= 0) {
      ctx.strokeStyle = '#f4c397';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x(ei), top);
      ctx.lineTo(x(ei), bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f4c397';
      ctx.textAlign = x(ei) > w / 2 ? 'right' : 'left';
      ctx.fillText(comparison.signal ? 'Detected window' : 'Event / report', x(ei), 9);
    }
    comparison.day = Math.max(0, Math.min(n - 1, comparison.day));
    ctx.strokeStyle = '#e8f0ed';
    ctx.beginPath();
    ctx.moveTo(x(comparison.day), top);
    ctx.lineTo(x(comparison.day), bottom);
    ctx.stroke();
    const reading =
      comparison.axis[comparison.day] +
      ' · ' +
      comparison.ids
        .map(
          (id, j) =>
            `${j + 1}. ${placeById[id].name}: ${Number.isFinite(values[j][comparison.day]) ? fmt(values[j][comparison.day]) + (indexed ? ' index points' : ' ' + comparisonUnit()) : 'unavailable'}`,
        )
        .join(' · ');
    text('analysisReadout', reading);
    canvas.setAttribute('aria-valuemin', '0');
    canvas.setAttribute('aria-valuemax', String(n - 1));
    canvas.setAttribute('aria-valuenow', String(comparison.day));
    canvas.setAttribute('aria-valuetext', reading);
  }
}
