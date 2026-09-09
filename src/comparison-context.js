/* Comparison view helpers; shared state is owned by workspace.js. */

function comparisonEvent(id) {
  const event = passageEvents.find((e) => e.id === id);
  if (!event) return;
  comparison.event = id;
  comparison.signal = null;
  comparison.ids = [...event.places];
  choose(event.places[0]);
  state.pins = [...event.places];
  setMode('change');
  $('analysisMetric').value = '0';
  $('analysisStart').value = event.start;
  $('analysisEnd').value = event.end;
  $('analysisReference').value = 'custom';
  $('analysisRefStart').value = event.referenceStart;
  $('analysisRefEnd').value = event.referenceEnd;
  // Only a reported disruption onset seeds the recovery study; report and
  // statement dates leave the start tracking the observation range.
  $('analysisEventStart').value = event.disruptionStart || '';
  comparison.recoveryAuto = !event.disruptionStart;
  comparison.day = 0;
  $('eventCatalog').open = false;
  $('analysisSetup').open = false;
  comparisonOpen();
}

function comparisonEventContext() {
  const event = comparisonContext(),
    panel = $('eventContext');
  const wasOpen = panel.querySelector('details')?.open || false;
  panel.hidden = !event;
  panel.replaceChildren();
  if (!event) return;
  const details = document.createElement('details');
  details.open = wasOpen;
  details.append(element('summary', '', event.title + ' · context & sources'));
  panel.append(details);
  details.append(
    element('p', '', event.summary),
    element(
      'p',
      'hint',
      event.date +
        ' · ' +
        event.dateKind +
        ' · ' +
        (event.published ? 'Published ' + event.published : 'Publication date not supplied') +
        ' · reviewed 2026-09-07',
    ),
  );
  const link = element('a', '', event.source + ' · original source ↗');
  link.href = event.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  if (event.url) details.append(link);
  details.append(element('p', 'hint', event.caveat));
  if (event.date > dates.at(-1))
    details.append(
      element(
        'p',
        '',
        'Reporting is newer than this observation snapshot; post-event effects cannot be displayed.',
      ),
    );
  if (comparison.ids.some((id) => !event.places.includes(id)))
    details.append(
      element(
        'p',
        'hint',
        'Additional places are your comparisons; the source does not necessarily discuss them.',
      ),
    );
  const map = element('button', '', 'Locate on globe');
  map.onclick = () => {
    choose(event.places[0]);
    setMode('change');
    if (dates.includes(event.date)) setDate(dates.indexOf(event.date));
    comparisonOpen(false);
  };
  const clear = element('button', 'event-close', '×');
  clear.type = 'button';
  clear.setAttribute('aria-label', 'Close event');
  clear.title = 'Close event';
  clear.onclick = () => {
    comparison.event = null;
    comparison.signal = null;
    comparisonInvalidate();
    refresh();
    $('analyzeView').focus({ preventScroll: true });
  };
  details.append(map);
  panel.append(clear);
}

function comparisonGlobeContext() {
  const found = comparisonContext(),
    e = found?.places.includes(state.selected) ? found : null;
  $('globeEventContext').hidden = !e;
  $('globeEventContext').replaceChildren();
  if (e) {
    const b = element(
      'button',
      '',
      'Violet marker · ' + e.date + ' · ' + e.title + ' · source & comparison',
    );
    b.onclick = () => comparisonOpen();
    $('globeEventContext').append(b);
  }
}

function comparisonGlobeAnnotation(ctx, left, right, top, bottom) {
  const event = comparisonContext();
  if (!event || !event.places.includes(state.selected)) return;
  const index = dates.indexOf(event.date);
  if (index < 0) return;
  const x = left + (index / Math.max(1, dates.length - 1)) * (right - left);
  ctx.save();
  ctx.strokeStyle = '#c5a6ff';
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
  ctx.stroke();
  ctx.restore();
}

function comparisonContext() {
  if (comparison.signal) {
    const h = passageShifts.find((s) => s.id === comparison.signal);
    if (!h) return null;
    const c = h.context;
    return {
      id: h.id,
      title:
        h.name +
        ': ' +
        (h.percent == null ? 'comparison unavailable' : fmt(h.percent) + '% recorded calls'),
      date: h.start,
      dateKind: 'Detected seven-day window start, not claimed event onset',
      published: c?.published || null,
      source: c?.source || '',
      url: c?.url || null,
      places: [h.place],
      summary:
        (!h.qualifies
          ? 'Source revisions mean this archived window no longer meets the screen. '
          : '') +
        `${h.start} → ${h.end}: ${fmt(h.mean)} calls/day versus ${fmt(h.reference)} in ${h.referenceStart} → ${h.referenceEnd}. ` +
        (c
          ? c.summary
          : 'No corroborated event is attached to this signal. Variation, reporting quality and other explanations remain possible.'),
      caveat:
        (c ? c.caveat : 'Unexplained signal, not evidence of disruption.') +
        ' Retrospective screening is not a significance test or causal estimate.',
    };
  }
  return passageEvents.find((e) => e.id === comparison.event) || null;
}

function comparisonShift(id) {
  const h = passageShifts.find((s) => s.id === id);
  if (!h) return;
  comparison.signal = id;
  comparison.event = null;
  comparison.ids = [h.place];
  state.pins = [h.place];
  choose(h.place);
  setMode('change');
  $('analysisMetric').value = '0';
  $('analysisScale').value = 'absolute';
  $('analysisStart').value = h.start;
  $('analysisEnd').value = h.end;
  $('analysisRefStart').value = h.referenceStart;
  $('analysisRefEnd').value = h.referenceEnd;
  $('analysisReference').value = 'custom';
  $('analysisEventStart').value = '';
  comparison.recoveryAuto = true;
  $('analysisSpan').value = 'reference';
  comparison.day = 28;
  $('eventCatalog').open = false;
  $('analysisSetup').open = false;
  comparisonOpen();
}

function comparisonShiftCards() {
  const cutoff = [
      manifest.Daily_Ports_Data_latest,
      manifest.Daily_Chokepoints_Data_latest,
    ].sort()[0],
    recent = $('shiftPeriod').value === 'recent',
    hits = passageShifts.filter((h) => (recent ? h.recent : !h.recent));
  text(
    'shiftPeriodNote',
    recent
      ? 'Windows ending ' +
          comparisonMath.shift(cutoff, -29) +
          ' → ' +
          cutoff +
          ' · relative to observed coverage, not live news. ' +
          (!hits.length ? 'No qualifying recent shifts.' : '')
      : 'Previously selected windows remain linkable; values are recalculated after source revisions.',
  );
  $('shiftCards').replaceChildren(
    ...hits.map((h) => {
      const card = element('article', 'event-card');
      card.append(
        element(
          'small',
          '',
          !h.qualifies
            ? 'Revised data · no longer qualifies'
            : h.context
              ? 'Related source attached · not causal proof'
              : 'Unexplained signal',
        ),
        element(
          'h3',
          '',
          h.name +
            ' · ' +
            (h.percent == null ? 'comparison unavailable' : fmt(h.percent) + '% calls'),
        ),
        element('p', '', h.start + ' → ' + h.end),
        element(
          'p',
          'hint',
          fmt(h.mean) + ' / day vs ' + fmt(h.reference) + ' in preceding 28 days',
        ),
      );
      const b = element('button', '', 'Inspect this shift');
      b.dataset.shift = h.id;
      b.onclick = () => comparisonShift(h.id);
      card.append(b);
      return card;
    }),
  );
}
