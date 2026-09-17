/* All dates of the active measure are resident before the globe can scrub. */
let timelineInteraction = 0;
let timelineManifest,
  dateIndex = {},
  timelinePlaceIndex = {},
  timelineLoading = null;
const timelineMetrics = new Map(),
  timelineErrors = new Map();
function ensureTimeline() {
  const metric = state.metric;
  if (timelineMetrics.has(metric)) return true;
  if (timelineLoading || timelineErrors.has(metric)) return false;
  timelineLoading = (async () => {
    const data = new Float64Array(timelineManifest.ids.length * timelineManifest.days);
    data.fill(NaN);
    const parts = timelineManifest.files.filter((p) => p.metric === metric);
    // Bounded parsing/transfers; an obsolete measure stops after its current pair.
    for (let i = 0; i < parts.length; i += 2) {
      if (state.metric !== metric) return;
      await Promise.all(
        parts.slice(i, i + 2).map(async (part) => {
          const values = await load(part.file + '?v=' + part.sha256, { cache: 'force-cache' });
          if (values.length !== part.values) throw new Error('Historical value count mismatch');
          for (let p = 0; p < timelineManifest.ids.length; p++) {
            const destination = p * timelineManifest.days + part.offset;
            for (let d = 0; d < part.days; d++) {
              const value = values[p * part.days + d];
              if (value !== null && !Number.isFinite(value))
                throw new Error('Invalid historical value');
              data[destination + d] = value === null ? NaN : value;
            }
          }
        }),
      );
    }
    if (state.metric !== metric) return;
    timelineMetrics.set(metric, data);
    // One previous measure can be revisited instantly; memory stays bounded.
    while (timelineMetrics.size > 2) timelineMetrics.delete(timelineMetrics.keys().next().value);
  })()
    .catch((e) => {
      if (state.metric === metric) timelineErrors.set(metric, e.message);
    })
    .finally(() => {
      timelineLoading = null;
      depthKey = '';
      refresh();
    });
  return false;
}
function timelineNotice() {
  if (timelineErrors.has(state.metric)) return 'History unavailable · tap to retry';
  return timelineMetrics.has(state.metric) ? '' : 'Loading timeline…';
}
function retryTimeline() {
  if (!timelineErrors.has(state.metric)) return;
  timelineErrors.delete(state.metric);
  ensureTimeline();
  refresh();
}
function activityValue(id, index, metric = state.metric) {
  if (index < 0 || index >= dates.length) return undefined;
  if (index >= timelineManifest.days) return series[id]?.[index]?.[metric];
  const p = timelinePlaceIndex[id];
  return p === undefined
    ? undefined
    : (timelineMetrics.get(metric)?.[p * timelineManifest.days + index] ??
        historyCache[id]?.[index]?.[metric + 1]);
}
function chartRows(id) {
  const rows = [...(series[id] || Array(dates.length).fill(null))];
  for (const [day, ...values] of historyCache[id] || []) rows[dateIndex[day]] = values;
  return rows;
}
function warmTimeline() {
  if (navigator.connection?.saveData) return;
  const queue = timelineManifest.files.filter((p) => !timelineMetrics.has(p.metric));
  const idle = (fn) =>
    window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 1000);
  const next = async () => {
    if (!queue.length) return;
    if (document.hidden || timelineLoading || performance.now() - timelineInteraction < 1500) {
      setTimeout(() => idle(next), 2000);
      return;
    }
    const part = queue.shift();
    if (!timelineMetrics.has(part.metric)) {
      try {
        const response = await fetch('/data/' + part.file + '?v=' + part.sha256, {
          cache: 'force-cache',
          priority: 'low',
        });
        if (response.ok) await response.arrayBuffer();
      } catch {
        /* Optional cache warming never changes observed values. */
      }
    }
    idle(next);
  };
  setTimeout(() => idle(next), 3000);
}
function ensureChartHistory() {
  for (const id of new Set([state.selected, ...state.pins])) {
    if (id && !historyCache[id] && !historyRequests[id] && !historyErrors[id]) fetchHistory(id);
  }
}
