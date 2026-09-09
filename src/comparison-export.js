/* Comparison view helpers; shared state is owned by workspace.js. */

function comparisonExport() {
  const col = Number($('analysisMetric').value) + 1,
    headers = [
      'section',
      'place_id',
      'date_or_key',
      'value',
      'measure',
      'observation_start',
      'observation_end',
      'reference_start',
      'reference_end',
      'event_id',
      'snapshot_assembled',
    ];
  const rows = [headers];
  const add = (section, id, key, value) =>
    rows.push([
      section,
      id,
      key,
      value,
      comparisonLabels[col - 1],
      $('analysisStart').value,
      $('analysisEnd').value,
      $('analysisRefStart').value,
      $('analysisRefEnd').value,
      comparison.event || comparison.signal || '',
      manifest.retrieved,
    ]);
  comparison.ids.forEach((id, i) => {
    for (const [key, v] of Object.entries(comparison.summaries[i])) add('summary', id, key, v);
    for (const row of comparison.rows[id])
      if (
        comparison.axis.includes(row[0]) ||
        (row[0] >= $('analysisRefStart').value && row[0] <= $('analysisRefEnd').value)
      )
        add('observation', id, row[0], comparisonCompatible(id) ? (row[col] ?? null) : null);
    add(
      'source',
      id,
      'activity',
      manifest.sources[
        placeById[id].kind === 'port' ? 'Daily_Ports_Data' : 'Daily_Chokepoints_Data'
      ],
    );
    add('source', id, 'historical_loaded', !!historyCache[id]);
    if (historyCache[id]) {
      add(
        'source',
        id,
        'historical_query',
        historyManifest.sources[
          placeById[id].kind === 'port' ? 'Daily_Ports_Data' : 'Daily_Chokepoints_Data'
        ],
      );
      add('source', id, 'history_assembled', historyManifest.assembled);
      add('source', id, 'history_sha256', historyManifest.files[id].sha256);
    }
    const start = $('analysisStart').value,
      end = $('analysisEnd').value;
    for (const offset of [0, 7, 28]) {
      const re = comparisonMath.shift(start, -1 - offset),
        rs = comparisonMath.shift(re, -27),
        v = comparisonMath.summary(
          comparisonCompatible(id) ? comparison.rows[id] : [],
          col,
          start,
          end,
          rs,
          re,
        );
      add('sensitivity', id, 'reference_' + offset, rs + ' → ' + re);
      add('sensitivity', id, 'percent_' + offset, v.percent);
    }
    const eventStart = $('analysisEventStart').value;
    if (
      comparisonMath.validDate(eventStart) &&
      eventStart <= end &&
      eventStart >= '2019-01-01' &&
      comparisonCompatible(id)
    ) {
      const v = M.eventStudy(
        comparison.rows[id],
        col,
        eventStart,
        end,
        Number($('analysisThreshold').value),
        Number($('analysisSustain').value),
      );
      for (const [key, value] of Object.entries(v)) add('recovery', id, key, value);
    }
  });
  const event = comparisonContext();
  if (event) {
    add('event', '', event.date, event.title);
    if (event.url) add('source', '', 'event', event.url);
    add('event', '', 'date_kind', event.dateKind);
  }
  add('method', '', 'index', 'Daily / positive complete reference mean * 100');
  add(
    'method',
    '',
    'interpretation',
    'Descriptive reference comparison, not causal impact or lost trade',
  );
  download('passage-comparison.csv', rows);
}

function comparisonParams() {
  const q = new URLSearchParams({
    mode: 'change',
    place: comparison.ids[0] || state.selected,
    view: 'analysis',
    locations: comparison.ids.join(','),
    context: comparison.event || '',
    shift: comparison.signal || '',
  });
  for (const id of comparisonValueIds) q.set(id, $(id).value);
  // An automatic disruption start is derived, not chosen: share it as empty so
  // the restored page keeps following the observation start.
  if (comparison.recoveryAuto) q.set('analysisEventStart', '');
  q.set('analysisDay', String(comparison.day));
  return q;
}
