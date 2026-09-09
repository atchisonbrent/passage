/* Comparison-first workspace; same observations, separate historical clock. */
const comparisonMath = PassageWorkspaceMath;
const comparison = {
  ids: [],
  event: null,
  signal: null,
  open: false,
  day: 0,
  page: 0,
  key: '',
  summaries: [],
  axis: [],
  rows: {},
  busy: false,
};
const comparisonColors = ['#83dbc1', '#ffa77b', '#85bce8', '#d8a7e7'];
const comparisonValueIds = [
  'analysisStart',
  'analysisEnd',
  'analysisRefStart',
  'analysisRefEnd',
  'analysisReference',
  'analysisMetric',
  'analysisScale',
  'analysisSpan',
  'analysisDisplay',
  'analysisEventStart',
  'analysisThreshold',
  'analysisSustain',
];
const comparisonLabels = [
  'All calls',
  'Tanker calls',
  'Container calls',
  'Dry-bulk calls',
  'Estimated imports',
  'Estimated exports',
  'Passage capacity',
];
function comparisonUnit() {
  return Number($('analysisMetric').value) < 4 ? 'calls' : 'estimated tonnes';
}
function comparisonCompatible(id) {
  const m = Number($('analysisMetric').value);
  return m < 4 || (m < 6 ? placeById[id]?.kind === 'port' : placeById[id]?.kind === 'chokepoint');
}
function comparisonReference() {
  const start = $('analysisStart').value,
    end = $('analysisEnd').value,
    mode = $('analysisReference').value;
  // Preset references are derived, so their date fields are read-only; choosing
  // Custom dates unlocks them instead of a hidden edit flipping the preset.
  for (const id of ['analysisRefStart', 'analysisRefEnd']) $(id).readOnly = mode !== 'custom';
  text(
    'analysisReferenceNote',
    mode === 'custom'
      ? 'Reference must end before the observations start.'
      : 'Dates follow the observation range. Choose Custom dates to edit them.',
  );
  if (!comparisonMath.validDate(start) || !comparisonMath.validDate(end)) return;
  if (mode === 'prior') {
    $('analysisRefStart').value = comparisonMath.shift(start, -28);
    $('analysisRefEnd').value = comparisonMath.shift(start, -1);
  }
  if (mode === 'year') {
    const prev = (d) => {
      let s = Number(d.slice(0, 4)) - 1 + d.slice(4);
      return comparisonMath.validDate(s) ? s : s.slice(0, 8) + '28';
    };
    $('analysisRefStart').value = prev(start);
    $('analysisRefEnd').value = prev(end);
  }
}
// Plain-language period description for the collapsed setup summary.
function comparisonSpanLabel(a, b) {
  if (!comparisonMath.validDate(a) || !comparisonMath.validDate(b)) return `${a} → ${b}`;
  const f = (d, withYear) =>
    new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  return a.slice(0, 4) === b.slice(0, 4)
    ? `${f(a)} – ${f(b, true)}`
    : `${f(a, true)} – ${f(b, true)}`;
}
function comparisonReferenceLabel(rs, re) {
  const mode = $('analysisReference').value;
  if (mode === 'prior') return 'the 28 days before';
  if (mode === 'year') return 'the same dates in ' + rs.slice(0, 4);
  return comparisonSpanLabel(rs, re);
}
function comparisonTable(id, caption, heads, rows) {
  const table = $(id);
  table.replaceChildren(element('caption', '', caption));
  const head = document.createElement('thead'),
    tr = document.createElement('tr');
  for (const name of heads) {
    const th = element('th', '', name);
    th.scope = 'col';
    tr.append(th);
  }
  head.append(tr);
  const body = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    row.forEach((v, i) => {
      const cell = element(i === 0 ? 'th' : 'td', '', v instanceof Node ? '' : v);
      if (v instanceof Node) cell.append(v);
      if (i === 0) cell.scope = 'row';
      tr.append(cell);
    });
    body.append(tr);
  }
  table.append(head, body);
}
function comparisonInvalidate() {
  $('randomEvent').disabled =
    comparison.busy || !PassageDiscovery.candidates(passageEvents, passageShifts, places).length;
  text('analysisShare', 'Copy link');
  comparison.key = '';
  comparison.page = 0;
  renderWorkspace();
}
function comparisonOpen(open = true) {
  stop();
  comparison.open = open;
  document.body.classList.toggle('analysis-open', open);
  $('analysisWorkspace').hidden = !open;
  $('exploreView').setAttribute('aria-pressed', String(!open));
  $('analyzeView').setAttribute('aria-pressed', String(open));
  $('eventsView').setAttribute('aria-expanded', String(open && $('eventCatalog').open));
  document.querySelector('main').scrollTop = 0;
  comparisonInvalidate();
  refresh();
}

function comparisonSearch() {
  const q = $('analysisSearch').value.trim().toLowerCase();
  $('analysisMatches').replaceChildren();
  if (!q) return;
  const matches = places
    .filter(
      (p) => !comparison.ids.includes(p.id) && (p.name + ' ' + p.country).toLowerCase().includes(q),
    )
    .slice(0, 8);
  for (const p of matches) {
    const b = element('button', '', p.name + ' · ' + p.country);
    b.disabled = comparison.ids.length >= 4;
    b.onclick = () => {
      if (comparison.ids.length >= 4 || comparison.ids.includes(p.id)) return;
      comparison.ids.push(p.id);
      state.pins = [...comparison.ids];
      $('analysisSearch').value = '';
      comparisonSearch();
      comparisonInvalidate();
    };
    $('analysisMatches').append(b);
  }
  if (!matches.length)
    $('analysisMatches').append(element('p', 'hint', 'No additional matching places.'));
}
function comparisonPins() {
  $('analysisPins').replaceChildren(
    ...comparison.ids.map((id, i) => {
      const b = element('button', '', `${i + 1}. ${placeById[id].name} ×`);
      b.style.borderColor = comparisonColors[i];
      b.setAttribute('aria-label', 'Remove ' + placeById[id].name);
      b.onclick = () => {
        comparison.ids = comparison.ids.filter((x) => x !== id);
        state.pins = [...comparison.ids];
        comparisonInvalidate();
      };
      return b;
    }),
  );
}

function comparisonDaily() {
  const col = Number($('analysisMetric').value) + 1,
    maps = comparison.ids.map(
      (id) => new Map((comparison.rows[id] || []).map((r) => [r[0], r[col]])),
    ),
    pages = Math.max(1, Math.ceil(comparison.axis.length / 50));
  comparison.page = Math.min(comparison.page, pages - 1);
  const rows = comparison.axis
    .slice(comparison.page * 50, (comparison.page + 1) * 50)
    .map((d) => [
      comparisonDayButton(d),
      d >= $('analysisStart').value
        ? 'Observation'
        : d >= $('analysisRefStart').value && d <= $('analysisRefEnd').value
          ? 'Reference'
          : d < $('analysisRefStart').value
            ? 'Before reference'
            : 'Between periods',
      ...comparison.ids.map((id, i) =>
        comparisonCompatible(id) && Number.isFinite(maps[i].get(d))
          ? fmt(maps[i].get(d))
          : 'Unavailable',
      ),
    ]);
  comparisonTable(
    'analysisDaily',
    'Raw daily observations · ' + comparisonUnit() + ' · not indexed',
    ['Date', 'Period', ...comparison.ids.map((id) => placeById[id].name)],
    rows,
  );
  $('analysisPrev').disabled = comparison.page === 0;
  $('analysisNext').disabled = comparison.page >= pages - 1;
  text(
    'analysisPage',
    `Page ${comparison.page + 1} / ${pages} · ${comparison.axis.length} calendar days`,
  );
}
// The chart cursor is the page's selected day: dates in the daily table select
// it, and the recovery study can adopt it as the disruption start.
function comparisonSelectedDayUi() {
  const day = comparison.axis[comparison.day];
  text('analysisEventFromChart', day ? 'Use chart day · ' + day : 'Use chart day');
  $('analysisEventFromChart').disabled = !day || day === $('analysisEventStart').value;
  for (const b of document.querySelectorAll('#analysisDaily .day-select'))
    b.closest('tr').classList.toggle('selected-day', b.textContent === day);
  if ($('analysisChartPanel').hidden) {
    // No chart to paint the readout: name the selected day from the rows.
    const col = Number($('analysisMetric').value) + 1;
    text(
      'analysisReadout',
      day
        ? day +
            ' · ' +
            comparison.ids
              .map((id, j) => {
                const v = comparison.rows[id]?.find((r) => r[0] === day)?.[col];
                return `${j + 1}. ${placeById[id].name}: ${Number.isFinite(v) ? fmt(v) + ' ' + comparisonUnit() : 'unavailable'}`;
              })
              .join(' · ')
        : '',
    );
  }
}
function comparisonSelectDay(date) {
  const i = comparison.axis.indexOf(date);
  if (i < 0) return;
  comparison.day = i;
  comparisonRenderChart();
  comparisonSelectedDayUi();
}
function comparisonDayButton(date) {
  const b = element('button', 'day-select', date);
  b.type = 'button';
  b.title = 'Select this day on the chart';
  b.onclick = () => comparisonSelectDay(date);
  return b;
}
function comparisonSetDisruptionStart(date) {
  if (!comparisonMath.validDate(date)) return;
  comparison.recoveryAuto = false;
  $('analysisEventStart').value = date;
  $('analysisRecovery').open = true;
  comparisonInvalidate();
}
function comparisonRecovery() {
  const start = $('analysisEventStart').value,
    end = $('analysisEnd').value,
    col = Number($('analysisMetric').value) + 1;
  const valid = comparisonMath.validDate(start) && start >= '2019-01-01' && start <= end;
  text(
    'analysisRecoveryNote',
    (valid
      ? `Reference: the 28 days before ${start} (${comparisonMath.shift(start, -28)} → ${comparisonMath.shift(start, -1)}). Follow-up runs to ${end}. `
      : `Choose a disruption start between 2019-01-01 and ${end}. `) +
      (comparison.recoveryAuto
        ? 'Start follows the observation From date until you set one. '
        : '') +
      'Missing days break recovery runs; a confirmed recovery can still relapse.',
  );
  comparisonTable(
    'recoveryResults',
    'Pre-disruption reference and follow-up · means per day; cumulative totals in ' +
      comparisonUnit(),
    [
      'Place',
      'Reference mean',
      'Coverage',
      'Days below',
      'Recovery confirmation',
      'Shortfall',
      'Net deviation',
    ],
    comparison.ids.map((id) => {
      if (!valid || !comparisonCompatible(id))
        return [
          placeById[id].name,
          !valid
            ? 'Disruption start must fall between 2019-01-01 and Through'
            : 'Measure not available here',
          '',
          '',
          '',
          '',
          '',
        ];
      const v = M.eventStudy(
        comparison.rows[id],
        col,
        start,
        end,
        Number($('analysisThreshold').value),
        Number($('analysisSustain').value),
      );
      return [
        placeById[id].name,
        fmt(v.baseline),
        `${v.observedDays}/${v.expectedDays}`,
        v.baseline > 0 ? v.belowDays : 'Unavailable',
        v.baseline === null
          ? 'Incomplete pre-event reference'
          : v.baseline === 0
            ? 'Undefined for zero reference'
            : v.recovery ||
              (!v.observedDays
                ? 'No follow-up'
                : v.belowDays
                  ? 'Not confirmed in follow-up'
                  : 'No observed decline'),
        fmt(v.shortfall),
        fmt(v.netDeviation),
      ];
    }),
  );
}
function renderWorkspace() {
  if (!comparison.open || !manifest) return;
  const start = $('analysisStart').value,
    end = $('analysisEnd').value,
    rs = $('analysisRefStart').value,
    re = $('analysisRefEnd').value,
    col = Number($('analysisMetric').value) + 1;
  // Until the reader sets one, the disruption start tracks the observation start.
  if (comparison.recoveryAuto && $('analysisEventStart').value !== start)
    $('analysisEventStart').value = start;
  const key = [
    ...comparisonValueIds.map((id) => $(id).value),
    comparison.ids.join(','),
    comparison.event,
    comparison.signal,
    comparison.busy,
    $('analysisSetup').open,
    comparison.ids.map((id) => [!!historyCache[id], !!historyRequests[id], historyErrors[id]]),
    innerWidth,
    innerHeight,
  ].join('|');
  if (key === comparison.key) return;
  comparison.key = key;
  comparisonPins();
  comparisonEventContext();
  const valid =
    [start, end].every(
      (d) => comparisonMath.validDate(d) && d >= '2019-01-01' && d <= dates.at(-1),
    ) && start <= end;
  // Say which field is wrong; a generic rule sends the reader back to guessing.
  const problem = !comparisonMath.validDate(start)
    ? 'Choose an observation start date.'
    : !comparisonMath.validDate(end)
      ? 'Choose an observation end date.'
      : start > end
        ? 'Observations end before they start: swap From and Through.'
        : end > dates.at(-1)
          ? `Observations end after the latest snapshot day (${dates.at(-1)}).`
          : start < '2019-01-01'
            ? 'Observations start before the earliest source data (2019-01-01).'
            : !comparisonMath.validDate(rs) || !comparisonMath.validDate(re)
              ? 'Choose both reference dates.'
              : rs > re
                ? 'Reference ends before it starts.'
                : re >= start
                  ? `Reference must end before the observations start (${start}).`
                  : '';
  text(
    'analysisSetupSummary',
    `${comparison.ids.map((id) => placeById[id].name).join(' / ') || 'Add places'} · ${comparisonSpanLabel(start, end)} vs ${comparisonReferenceLabel(rs, re)} · ${comparisonLabels[col - 1]}`,
  );
  const plotStart =
    $('analysisSpan').value === 'reference' && comparisonMath.validDate(rs) && rs < start
      ? rs < '2019-01-01'
        ? '2019-01-01'
        : rs
      : start;
  const selectedDay = comparison.axis[comparison.day];
  comparison.axis = valid ? comparisonMath.days(plotStart, end) : [];
  // The selection is a calendar date, not an index: keep it where the axis
  // still contains it, otherwise clamp regardless of whether a chart is drawn.
  const kept = selectedDay ? comparison.axis.indexOf(selectedDay) : -1;
  comparison.day =
    kept >= 0 ? kept : Math.max(0, Math.min(comparison.axis.length - 1, comparison.day));
  comparison.rows = Object.fromEntries(comparison.ids.map((id) => [id, combinedHistory(id)]));
  comparison.summaries = comparison.ids.map((id) =>
    comparisonMath.summary(
      comparisonCompatible(id) ? comparison.rows[id] : [],
      col,
      start,
      end,
      rs,
      re,
    ),
  );
  const eventStart = $('analysisEventStart').value,
    earliest = [
      start,
      rs,
      comparisonMath.validDate(start) ? comparisonMath.shift(start, -56) : start,
      comparisonMath.validDate(eventStart) ? comparisonMath.shift(eventStart, -28) : start,
    ].sort()[0],
    need = earliest < manifest.start;
  // History files load on demand when a period reaches before the bundled
  // 2026 activity; the button remains only as a retry after a failed download.
  const missing = comparison.ids.filter((id) => need && !historyCache[id]);
  const failed = missing.filter((id) => historyErrors[id]);
  if (valid && !comparison.busy && missing.some((id) => !historyErrors[id] && !historyRequests[id]))
    queueMicrotask(() => $('analysisLoad').onclick());
  $('analysisLoad').hidden = !failed.length || comparison.busy;
  $('analysisLoad').disabled = comparison.busy;
  text('analysisLoad', 'Retry history download');
  const loading = comparison.busy || missing.some((id) => historyRequests[id]);
  const usable = valid && !problem;
  $('analysisStatus').hidden = usable && comparison.ids.length > 0 && !loading && !failed.length;
  if (!usable) $('analysisSetup').open = true;
  text(
    'analysisStatus',
    !usable
      ? problem
      : !comparison.ids.length
        ? 'Add up to four places to compare.'
        : loading
          ? 'Loading history…'
          : failed.length
            ? `History download failed for ${failed.map((id) => placeById[id].name).join(', ')}.`
            : '',
  );
  text(
    'analysisCoverage',
    `Snapshot: ports through ${manifest.Daily_Ports_Data_latest}, passages through ${manifest.Daily_Chokepoints_Data_latest}. ` +
      ($('analysisScale').value === 'indexed'
        ? 'Indexed: each place relative to its complete reference mean = 100. '
        : '') +
      'Means require every calendar day in each period; missing is not zero. Net deviation is against the reference, not lost trade. Percentages need a positive reference; tiny references produce large percentages.',
  );
  comparisonTable(
    'analysisResults',
    `${start} → ${end}; reference ${rs} → ${re} · means in ${comparisonUnit()}/day; net deviation in ${comparisonUnit()}`,
    ['Place', 'Mean', 'Reference', 'Δ / day', 'Δ %', 'Net deviation', 'Coverage obs / ref'],
    comparison.ids.map((id, i) => {
      const v = comparison.summaries[i];
      return [
        placeById[id].name,
        fmt(v.mean),
        fmt(v.reference),
        fmt(v.difference),
        fmt(v.percent),
        fmt(v.net),
        `${v.count}/${v.expected} · ${v.referenceCount}/${v.referenceExpected}`,
      ];
    }),
  );
  $('analysisQuality').replaceChildren(
    ...comparison.ids.map((id, i) => {
      const v = comparison.summaries[i],
        latest = comparisonCompatible(id)
          ? comparison.rows[id].findLast((row) => Number.isFinite(row[col]))?.[0]
          : null,
        reason = !comparisonCompatible(id)
          ? 'Measure not available for this place type'
          : v.reason +
            (v.reference > 0 && v.reference < (col <= 4 ? 10 : 1000)
              ? '; small reference: percentage unstable'
              : '');
      return element(
        'p',
        '',
        placeById[id].name + ': ' + reason + '. Latest usable: ' + (latest || 'none') + '.',
      );
    }),
  );
  const sensitivity = [];
  if (valid)
    for (const id of comparison.ids)
      for (const offset of [0, 7, 28]) {
        const b = comparisonMath.shift(start, -1 - offset),
          a = comparisonMath.shift(b, -27),
          v = comparisonMath.summary(
            comparisonCompatible(id) ? comparison.rows[id] : [],
            col,
            start,
            end,
            a,
            b,
          );
        sensitivity.push([
          placeById[id].name,
          a + ' → ' + b,
          fmt(v.reference),
          fmt(v.percent),
          v.reason,
        ]);
      }
  comparisonTable(
    'sensitivityResults',
    'Fixed observation range; alternative references',
    ['Place', 'Reference dates', 'Reference mean', 'Δ %', 'Coverage / reason'],
    sensitivity,
  );
  $('analysisChartPanel').hidden =
    $('analysisDisplay').value !== 'chart' || !comparison.axis.length;
  $('analysisDailyPanel').hidden = $('analysisDisplay').value !== 'table';
  $('analysisExport').disabled = !valid || !comparison.ids.length || comparison.busy;
  comparisonDaily();
  comparisonRecovery();
  comparisonRenderChart();
  comparisonSelectedDayUi();
}

function bindWorkspace(q) {
  $('analysisStart').value = comparisonMath.shift(dates[state.index], -89);
  $('analysisEnd').value = dates[state.index];
  $('analysisMetric').value = String(state.metric);
  comparison.ids = state.pins.length ? [...new Set(state.pins)] : [state.selected];
  comparisonReference();
  for (const id of [
    'analysisStart',
    'analysisEnd',
    'analysisRefStart',
    'analysisRefEnd',
    'analysisEventStart',
  ]) {
    $(id).min = id.startsWith('analysisRef') ? '2018-01-01' : '2019-01-01';
    $(id).max = dates.at(-1);
  }
  for (const id of comparisonValueIds) {
    const v = q.get(id);
    if (v !== null) {
      if ($(id).tagName === 'SELECT') {
        if ([...$(id).options].some((o) => o.value === v)) $(id).value = v;
      } else if (
        comparisonMath.validDate(v) &&
        v >= (id.startsWith('analysisRef') ? '2018-01-01' : '2019-01-01') &&
        v <= dates.at(-1)
      )
        $(id).value = v;
    }
  }
  comparisonReference(); // Re-derive named presets after restoring the observation range.
  if (q.has('locations'))
    comparison.ids = [
      ...new Set(
        q
          .get('locations')
          .split(',')
          .filter((id) => placeById[id]),
      ),
    ].slice(0, 4);
  if (passageEvents.some((e) => e.id === q.get('context'))) comparison.event = q.get('context');
  if (passageShifts.some((h) => h.id === q.get('shift'))) {
    comparison.signal = q.get('shift');
    comparison.event = null;
  }
  comparison.day = Math.max(0, Math.min(30000, Math.floor(Number(q.get('analysisDay'))) || 0));
  document.querySelectorAll('.event-jumps a').forEach(
    (link) =>
      (link.onclick = (e) => {
        e.preventDefault();
        $(link.hash.slice(1)).scrollIntoView({ block: 'start' });
      }),
  );
  const discoveryPool = PassageDiscovery.candidates(passageEvents, passageShifts, places);
  $('randomEvent').disabled = !discoveryPool.length;
  $('randomEvent').onclick = () => {
    const current = comparison.signal
        ? 'shift:' + comparison.signal
        : comparison.event
          ? 'event:' + comparison.event
          : null,
      next = PassageDiscovery.pick(discoveryPool, current);
    if (!next) return;
    if (next.kind === 'event') comparisonEvent(next.id);
    else comparisonShift(next.id);
    const details = $('eventContext').querySelector('details');
    if (details) details.open = true;
  };
  $('shiftPeriod').onchange = comparisonShiftCards;
  comparisonShiftCards();
  $('eventCatalog').ontoggle = () => {
    $('eventsView').setAttribute(
      'aria-expanded',
      String(comparison.open && $('eventCatalog').open),
    );
  };
  $('eventCards').replaceChildren(
    ...passageEvents.map((e) => {
      const card = element('article', 'event-card');
      card.append(
        element(
          'small',
          '',
          (Date.now() - Date.parse(e.date + 'T00:00:00Z')) / 86400000 <= 90
            ? 'Dated reporting / disruption'
            : 'Historical context',
        ),
        element('h3', '', e.title),
        element('p', '', e.summary),
        element('p', 'hint', e.date + ' · ' + e.dateKind),
      );
      const b = element('button', '', 'Compare observations');
      b.dataset.event = e.id;
      b.onclick = () => comparisonEvent(e.id);
      card.append(b);
      return card;
    }),
  );
  $('exploreView').onclick = () => comparisonOpen(false);
  $('analyzeView').onclick = () => {
    comparison.ids = state.pins.length ? [...new Set(state.pins)] : [state.selected];
    setMode('change');
    $('analysisSetup').open = false;
    comparisonOpen();
  };
  $('eventsView').onclick = () => {
    setMode('change');
    comparisonOpen();
    $('eventCatalog').open = true;
  };
  $('analysisSearch').oninput = comparisonSearch;
  $('analysisSetup').ontoggle = () => {
    comparison.key = '';
    renderWorkspace();
  };
  $('analysisClear').onclick = () => {
    comparison.ids = [];
    state.pins = [];
    comparisonInvalidate();
  };
  // Ownership comes from the link itself: an explicit date means the reader
  // chose it, even when it happens to equal the observation start.
  comparison.recoveryAuto = !comparisonMath.validDate($('analysisEventStart').value);
  for (const id of comparisonValueIds)
    $(id).onchange = () => {
      if (['analysisStart', 'analysisEnd', 'analysisReference'].includes(id)) comparisonReference();
      if (id === 'analysisEventStart')
        comparison.recoveryAuto = !comparisonMath.validDate($('analysisEventStart').value);
      comparisonInvalidate();
    };
  $('analysisEventFromChart').onclick = () =>
    comparisonSetDisruptionStart(comparison.axis[comparison.day]);
  // Chart day → observation bounds. Keep the range valid rather than rejecting it.
  const fromChart = (field) => () => {
    const day = comparison.axis[comparison.day];
    if (!comparisonMath.validDate(day)) return;
    $(field).value = day;
    if ($('analysisStart').value > $('analysisEnd').value)
      $(field === 'analysisStart' ? 'analysisEnd' : 'analysisStart').value = day;
    comparisonReference();
    comparisonInvalidate();
  };
  $('analysisStartFromChart').onclick = fromChart('analysisStart');
  $('analysisEndFromChart').onclick = fromChart('analysisEnd');
  for (const b of document.querySelectorAll('[data-range]'))
    b.onclick = () => {
      const end = $('analysisEnd').value;
      if (!comparisonMath.validDate(end)) return;
      $('analysisStart').value =
        b.dataset.range === 'all'
          ? '2019-01-01'
          : comparisonMath.shift(end, 1 - Number(b.dataset.range));
      comparisonReference();
      comparison.day = 0;
      comparisonInvalidate();
    };
  $('analysisLoad').onclick = async () => {
    if (comparison.busy) return;
    comparison.busy = true;
    comparisonInvalidate();
    const ids = [...comparison.ids];
    try {
      for (const id of ids) await fetchHistory(id);
    } finally {
      comparison.busy = false;
      comparisonInvalidate();
    }
  };
  $('analysisExport').onclick = comparisonExport;
  $('analysisPrev').onclick = () => {
    comparison.page = Math.max(0, comparison.page - 1);
    comparisonDaily();
    comparisonSelectedDayUi();
  };
  $('analysisNext').onclick = () => {
    comparison.page++;
    comparisonDaily();
    comparisonSelectedDayUi();
  };
  $('analysisShare').onclick = async () => {
    const url = location.origin + '/#' + comparisonParams();
    history.replaceState(null, '', '#' + comparisonParams());
    try {
      await navigator.clipboard.writeText(url);
      text('analysisShare', 'Link copied');
    } catch {
      text('analysisShare', 'Link in address bar');
    }
  };
  PassageChartInput.attach($('analysisChart'), {
    count: () => comparison.axis.length,
    index: () => comparison.day,
    onSelect: (i) => {
      comparison.day = i;
      comparisonRenderChart();
      comparisonSelectedDayUi();
    },
  });
  new ResizeObserver(() => {
    if (comparison.open) comparisonRenderChart();
  }).observe($('analysisChart'));
  if (q.get('view') === 'analysis') comparisonOpen();
}
