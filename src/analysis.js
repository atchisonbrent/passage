/* Pure calculations shared by the browser and deterministic tests. */
(function (root) {
  function summarize(rows, index, metric, windowSize = 7, baselineMode = 'prior') {
    const start = index - windowSize + 1;
    const baseEnd = baselineMode === 'january' ? 27 : start - 1;
    const baseStart = baseEnd - 27;
    function windowMean(a, b, expected) {
      if (a < 0 || b >= rows.length || b < a) return { mean: null, count: 0 };
      const values = rows
        .slice(a, b + 1)
        .map((r) => r?.[metric])
        .filter(Number.isFinite);
      return {
        mean: values.length === expected ? values.reduce((a, b) => a + b, 0) / expected : null,
        count: values.length,
      };
    }
    const current = windowMean(start, index, windowSize);
    const baseline =
      baseEnd < start ? windowMean(baseStart, baseEnd, 28) : { mean: null, count: 0 };
    const difference =
      current.mean !== null && baseline.mean !== null ? current.mean - baseline.mean : null;
    return {
      current: current.mean,
      baseline: baseline.mean,
      difference,
      percent: difference !== null && baseline.mean > 0 ? (difference / baseline.mean) * 100 : null,
      currentCount: current.count,
      baselineCount: baseline.count,
      start,
      baseStart,
      baseEnd,
    };
  }
  function csv(rows) {
    return rows
      .map((row) =>
        row
          .map((value) => {
            let s = value === null || value === undefined ? '' : String(value);
            if (/^[=+@\-\t\r]/.test(s) && typeof value !== 'number') s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(','),
      )
      .join('\r\n');
  }
  function arc(a, b) {
    const rad = Math.PI / 180;
    const xyz = (p) => [
      Math.cos(p[1] * rad) * Math.cos(p[0] * rad),
      Math.cos(p[1] * rad) * Math.sin(p[0] * rad),
      Math.sin(p[1] * rad),
    ];
    const u = xyz(a),
      v = xyz(b),
      dot = Math.max(
        -1,
        Math.min(
          1,
          u.reduce((s, x, i) => s + x * v[i], 0),
        ),
      ),
      angle = Math.acos(dot);
    let tangent = v.map((x, i) => x - dot * u[i]);
    let length = Math.hypot(...tangent);
    if (length < 1e-8) {
      const axis = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
      const d = axis.reduce((s, x, i) => s + x * u[i], 0);
      tangent = axis.map((x, i) => x - d * u[i]);
      length = Math.hypot(...tangent);
    }
    tangent = tangent.map((x) => x / length);
    return Array.from({ length: 65 }, (_, i) => {
      const t = (angle * i) / 64,
        p = u.map((x, j) => x * Math.cos(t) + tangent[j] * Math.sin(t));
      return [Math.atan2(p[1], p[0]) / rad, Math.asin(Math.max(-1, Math.min(1, p[2]))) / rad];
    });
  }
  const shiftDay = (date, n) =>
    new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  function indexed(values, base) {
    return values.map((v) => (Number.isFinite(v) && base > 0 ? (v / base) * 100 : null));
  }
  function eventStudy(rows, column, start, end, threshold = 0.9, sustain = 7) {
    const byDate = new Map(rows.map((r) => [r[0], r[column]]));
    const values = (a, b) => {
      const out = [];
      for (let d = a; d <= b; d = shiftDay(d, 1)) out.push([d, byDate.get(d)]);
      return out;
    };
    const ref = values(shiftDay(start, -28), shiftDay(start, -1));
    const baseline = ref.every((r) => Number.isFinite(r[1]))
      ? ref.reduce((s, r) => s + r[1], 0) / 28
      : null;
    const follow = start <= end ? values(start, end) : [];
    const complete = follow.length > 0 && follow.every((r) => Number.isFinite(r[1]));
    let belowDays = 0,
      observedDays = 0,
      shortfall = 0,
      netDeviation = 0,
      run = 0,
      recovery = null,
      hadDecline = false,
      minMean = null,
      minDate = null;
    for (let i = 0; i < follow.length; i++) {
      const [d, v] = follow[i];
      if (!Number.isFinite(v)) {
        run = 0;
        continue;
      }
      observedDays++;
      if (baseline === null) {
        run = 0;
        continue;
      }
      shortfall += Math.max(0, baseline - v);
      netDeviation += v - baseline;
      if (baseline > 0 && v < baseline * threshold) {
        belowDays++;
        hadDecline = true;
        run = 0;
      } else if (hadDecline && baseline > 0) {
        run++;
        if (run >= sustain && !recovery) recovery = d;
      }
      if (i >= 6) {
        const w = follow.slice(i - 6, i + 1).map((r) => r[1]);
        if (w.every(Number.isFinite)) {
          const mean = w.reduce((a, b) => a + b, 0) / 7;
          if (minMean === null || mean < minMean) {
            minMean = mean;
            minDate = d;
          }
        }
      }
    }
    return {
      baseline,
      referenceStart: shiftDay(start, -28),
      referenceEnd: shiftDay(start, -1),
      start,
      end,
      threshold,
      sustain,
      belowDays,
      observedDays,
      expectedDays: follow.length,
      complete,
      shortfall: complete && baseline !== null ? shortfall : null,
      netDeviation: complete && baseline !== null ? netDeviation : null,
      recovery,
      minMean,
      minDate,
    };
  }
  function seasonalReference(rows, column, end, windowSize) {
    const map = new Map(rows.map((r) => [r[0], r[column]])),
      year = Number(end.slice(0, 4)),
      years = [];
    for (let y = 2019; y < year; y++) {
      const target = y + end.slice(4);
      if (new Date(target + 'T00:00:00Z').toISOString().slice(0, 10) !== target) continue;
      const window = Array.from({ length: windowSize }, (_, i) => map.get(shiftDay(target, -i)));
      if (window.every(Number.isFinite))
        years.push({ year: y, mean: window.reduce((a, b) => a + b, 0) / windowSize });
    }
    const values = years.map((r) => r.mean);
    return {
      years,
      mean: values.length >= 3 ? values.reduce((a, b) => a + b, 0) / values.length : null,
      min: values.length >= 3 ? Math.min(...values) : null,
      max: values.length >= 3 ? Math.max(...values) : null,
    };
  }
  const api = { summarize, csv, arc, indexed, eventStudy, seasonalReference, shiftDay };
  if (typeof module !== 'undefined') module.exports = api;
  else root.PassageMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
