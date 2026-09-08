'use strict';
const $ = (id) => document.getElementById(id),
  M = PassageMath;
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }),
  compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const fmt = (v) => (Number.isFinite(v) ? nf.format(v) : '—'),
  short = (v) => (Number.isFinite(v) ? compact.format(v) : '—');
const state = {
  mode: 'change',
  selected: null,
  index: 0,
  metric: 0,
  window: 7,
  baseline: 'prior',
  lon: 45,
  lat: 16,
  zoom: 1,
  playing: false,
  pins: [],
  story: null,
};
let manifest,
  places = [],
  placeById = {},
  dates = [],
  series = {},
  land,
  network = null,
  networkPromise = null,
  networkError = null,
  exposures = {},
  exposurePromises = {},
  exposureErrors = {},
  stats = {},
  ranking = [],
  links = [],
  countryRows = [],
  hitpoints = [],
  drag = null,
  clock = null,
  renderPending = false,
  routeFrame = null,
  phase = 0,
  bootFailed = false;
let globeGeometry = { cx: 0, cy: 0, r: 1, w: 1, h: 1 };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
async function load(file) {
  const response = await fetch('/data/' + file);
  if (!response.ok) throw new Error(file + ' HTTP ' + response.status);
  return response.json();
}
function text(id, s) {
  $(id).textContent = s;
}
function element(tag, cls, content) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (content !== undefined) e.textContent = content;
  return e;
}
function place() {
  return placeById[state.selected] || network?.nodes[state.selected];
}
function supported(p) {
  return state.metric < 4 || (state.metric < 6 ? p.kind === 'port' : p.kind === 'chokepoint');
}
function stop() {
  if (clock) clearInterval(clock);
  clock = null;
  state.playing = false;
}
function refresh() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    render();
  });
}
function setDate(i) {
  stop();
  state.index = Math.max(0, Math.min(dates.length - 1, i));
  refresh();
}
function play() {
  stop();
  if (state.mode !== 'change') return;
  if (
    state.index >=
    dates.indexOf(
      [manifest.Daily_Ports_Data_latest, manifest.Daily_Chokepoints_Data_latest].sort()[0],
    )
  )
    state.index = 0;
  state.playing = true;
  const start = state.index,
    t = performance.now(),
    rate = Number($('speed').value);
  clock = setInterval(() => {
    const next = Math.min(
      dates.length - 1,
      start + Math.floor(((performance.now() - t) * rate) / 1000),
    );
    if (next !== state.index) {
      state.index = next;
      if (next === dates.length - 1) stop();
      refresh();
    }
  }, 40);
  refresh();
}
function choose(id, recenter = true) {
  if (!placeById[id] && !network?.nodes[id]) return;
  state.selected = id;
  document.querySelector('.detail').scrollTop = 0;
  if ($('browseDialog').open) {
    $('search').value = '';
    $('browseDialog').close();
    document.querySelector('main').scrollTo({ top: 0, behavior: 'auto' });
  }
  const p = place();
  if (!supported(p)) state.metric = 0;
  if (recenter) {
    state.lon = p.lon;
    state.lat = p.lat;
    state.zoom = 1;
  }
  state.story = null;
  if (state.mode === 'exposure') ensureExposure();
  refresh();
}
async function setMode(mode) {
  if (comparison.open) comparisonOpen(false);
  stop();
  state.mode = mode;
  state.story = null;
  document.querySelector('.detail').scrollTop = 0;
  if (mode !== 'change') $('kind').value = 'all';
  if (mode === 'connections') {
    if (place()?.kind === 'chokepoint')
      state.selected = places.find((p) => p.name === 'Jebel Ali')?.id || places[0].id;
    const p = place();
    state.lon = p.lon;
    state.lat = p.lat;
    ensureNetwork();
  }
  if (mode === 'exposure') {
    if (!manifest.exposure.some((p) => p.id === state.selected))
      state.selected =
        manifest.exposure.find((p) => p.name === 'Singapore')?.id || manifest.exposure[0]?.id;
    ensureExposure();
    const p = place();
    if (p) {
      state.lon = p.lon;
      state.lat = p.lat;
    }
  }
  refresh();
}
async function ensureNetwork() {
  if (network) return;
  if (!networkPromise) {
    networkError = null;
    text('status', 'Loading the historical network…');
    networkPromise = load('network.json')
      .then((data) => {
        network = data;
        return data;
      })
      .catch((e) => {
        networkPromise = null;
        networkError = e.message;
        return null;
      });
  }
  await networkPromise;
  refresh();
}
async function ensureExposure() {
  const id = state.selected,
    entry = manifest.exposure.find((x) => x.id === id);
  if (!entry) return;
  if (!exposures[id]) {
    if (!exposurePromises[id]) {
      delete exposureErrors[id];
      exposurePromises[id] = load(entry.file)
        .then((rows) => {
          exposures[id] = rows;
        })
        .catch((e) => {
          delete exposurePromises[id];
          exposureErrors[id] = e.message;
        });
    }
    await exposurePromises[id];
  }
  if (state.selected === id) refresh();
}
function recompute() {
  stats = {};
  if (state.mode !== 'change') return;
  for (const p of places)
    if (supported(p))
      stats[p.id] = M.summarize(
        series[p.id] || [],
        state.index,
        state.metric,
        state.window,
        state.baseline,
      );
}
function filteredPlaces() {
  const q = $('search').value.trim().toLocaleLowerCase(),
    kind = $('kind').value;
  let pool = state.mode === 'exposure' ? manifest.exposure.map((p) => placeById[p.id]) : places;
  return pool.filter(
    (p) =>
      p &&
      (state.mode !== 'connections' || p.kind === 'port') &&
      (state.mode !== 'change' || supported(p)) &&
      (kind === 'all' || p.kind === kind) &&
      (!q || (p.name + ' ' + p.country).toLocaleLowerCase().includes(q)),
  );
}
function makeList() {
  const mode = state.mode,
    rank = $('rank').value;
  let list = filteredPlaces();
  if (mode === 'change') {
    if (!$('search').value.trim())
      list = list.filter((p) =>
        rank === 'activity'
          ? stats[p.id]?.current !== null
          : stats[p.id]?.difference !== null &&
            (rank !== 'percent' || stats[p.id].baseline >= (state.metric < 4 ? 10 : 1000)),
      );
    list.sort((a, b) => {
      const x = stats[a.id],
        y = stats[b.id];
      const score = (s) =>
        rank === 'activity'
          ? s?.current
          : rank === 'percent'
            ? Math.abs(s?.percent ?? 0)
            : Math.abs(s?.difference ?? 0);
      return (score(y) ?? -1) - (score(x) ?? -1) || a.name.localeCompare(b.name);
    });
  } else list.sort((a, b) => a.name.localeCompare(b.name));
  ranking = list;
  const frag = document.createDocumentFragment();
  for (const p of list.slice(0, 80)) {
    const b = element('button', 'location' + (p.id === state.selected ? ' active' : ''));
    b.setAttribute('aria-pressed', String(p.id === state.selected));
    b.dataset.place = p.id;
    b.append(element('strong', '', p.name));
    b.append(element('span', '', p.country));
    if (mode === 'change') {
      const s = stats[p.id],
        v = rank === 'activity' ? s?.current : rank === 'percent' ? s?.percent : s?.difference;
      const label =
        rank === 'activity'
          ? fmt(v) + ' / day'
          : v === null || v === undefined
            ? 'No complete comparison'
            : (v > 0 ? '+' : '') + fmt(v) + (rank === 'percent' ? '%' : ' / day');
      b.append(
        element('span', 'rankvalue ' + (v > 0 ? 'positive' : v < 0 ? 'negative' : ''), label),
      );
    }
    b.onclick = () => choose(p.id);
    frag.append(b);
  }
  if (!list.length)
    frag.append(
      element(
        'p',
        'hint',
        mode === 'change'
          ? 'No matching complete comparisons. Try another date, activity ranking, or search for a place.'
          : 'No matching ports. Clear the search or select another lens.',
      ),
    );
  $('locations').replaceChildren(frag);
  text(
    'coverage',
    `${list.length.toLocaleString()} matches${list.length > 80 ? ' · top 80 listed' : ''}`,
  );
  text(
    'listHint',
    mode === 'change'
      ? rank === 'percent'
        ? 'Baseline floor: ' +
          (state.metric < 4 ? '10 calls' : '1,000 tonnes') +
          '/day. Complete windows only.'
        : rank === 'activity'
          ? 'Highest current activity first. Complete selected windows only.'
          : 'Largest absolute shifts first. Search includes places with missing comparisons.'
      : mode === 'connections'
        ? 'Select a port. Historical links do not change with the observation date.'
        : `${manifest.exposure.length} selected ports, not a global exposure ranking.`,
  );
}
function sizeCanvas(canvas) {
  const b = canvas.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(b.width * dpr),
    height = Math.round(b.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: b.width, h: b.height };
}
function project(lon, lat) {
  const { cx, cy, r } = globeGeometry,
    rad = Math.PI / 180,
    d = (lon - state.lon) * rad,
    p = lat * rad,
    b = state.lat * rad,
    z = Math.sin(b) * Math.sin(p) + Math.cos(b) * Math.cos(p) * Math.cos(d);
  return {
    x: cx + r * Math.cos(p) * Math.sin(d),
    y: cy - r * (Math.cos(b) * Math.sin(p) - Math.sin(b) * Math.cos(p) * Math.cos(d)),
    z,
  };
}
function drawLine(ctx, points, color, width = 1) {
  ctx.beginPath();
  let pen = false;
  for (const a of points) {
    const p = project(...a);
    if (p.z > 0.002) {
      if (pen) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
      pen = true;
    } else pen = false;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function globe() {
  if (!land) return;
  const { ctx, w, h } = sizeCanvas($('globe'));
  if (!w || !h) return;
  const cx = w / 2,
    cy = h * 0.55,
    r = Math.min(w * 0.44, h * 0.42) * state.zoom;
  globeGeometry = { cx, cy, r, w, h };
  hitpoints = [];
  const labelBoxes = [];
  const selected = place();
  if (selected && project(selected.lon, selected.lat).z >= 0.015) {
    const pos = project(selected.lon, selected.lat);
    labelBoxes.push({ x: pos.x + 5, y: pos.y - 25, w: selected.name.length * 7 + 25, h: 25 });
  }
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.clip();
  const ocean = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ocean.addColorStop(0, '#234451');
  ocean.addColorStop(1, '#0b1b27');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, w, h);
  for (let lon = -180; lon < 180; lon += 30)
    drawLine(
      ctx,
      Array.from({ length: 91 }, (_, i) => [lon, i * 2 - 90]),
      '#7aaba71e',
      0.6,
    );
  for (let lat = -60; lat <= 60; lat += 30)
    drawLine(
      ctx,
      Array.from({ length: 181 }, (_, i) => [i * 2 - 180, lat]),
      '#7aaba71e',
      0.6,
    );
  for (const f of land.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) for (const ring of poly) drawLine(ctx, ring, '#9bbcb68c', 0.8);
  }
  ctx.restore();
  ctx.strokeStyle = '#9cc9ba55';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();
  function marker(p, color, size, label = false, ring = null) {
    if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat)) return;
    const pos = project(p.lon, p.lat);
    if (pos.z < 0.015) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (ring !== null) {
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ring, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    if (color === '#81969e') ctx.stroke();
    else ctx.fill();
    if (p.id === state.selected) {
      ctx.strokeStyle = '#edf7ef';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size + 5, 0, 2 * Math.PI);
      ctx.stroke();
    }
    hitpoints.push({ ...pos, id: p.id, size });
    if (label) {
      ctx.font = '11px -apple-system,sans-serif';
      ctx.fillStyle = '#e4eee9';
      ctx.textAlign = 'left';
      const labelX = Math.min(w - ctx.measureText(p.name).width - 9, Math.max(8, pos.x + size + 8));
      const box = { x: labelX, y: pos.y - 19, w: ctx.measureText(p.name).width, h: 15 };
      if (
        p.id !== state.selected &&
        labelBoxes.some(
          (b) =>
            box.x < b.x + b.w + 5 &&
            box.x + box.w + 5 > b.x &&
            box.y < b.y + b.h + 3 &&
            box.y + box.h + 3 > b.y,
        )
      )
        return;
      labelBoxes.push(box);
      ctx.fillText(p.name, labelX, pos.y - 8);
    }
  }
  if (state.mode === 'change') {
    const pool = $('analyst').checked ? filteredPlaces() : ranking.slice(0, 80),
      scale = state.metric < 4 ? 250 : 1000000;
    const size = (v) => Math.min(17, Math.max(2, Math.sqrt(Math.max(0, v || 0) / scale) * 14));
    pool.sort(
      (a, b) => Math.abs(stats[a.id]?.difference || 0) - Math.abs(stats[b.id]?.difference || 0),
    );
    const standout = new Set(ranking.slice(0, 3).map((p) => p.id));
    for (const p of pool) {
      if (p.id === state.selected) continue;
      const s = stats[p.id];
      const color =
        s?.percent === null || s?.percent === undefined
          ? '#81969e'
          : s.percent > 5
            ? '#83dbc1'
            : s.percent < -5
              ? '#ffa77b'
              : '#c3d2cb';
      marker(
        p,
        color,
        size(s?.current),
        w > 480 && standout.has(p.id),
        p.kind === 'chokepoint' && s?.baseline !== null ? size(s.baseline) : null,
      );
    }
    const p = place(),
      s = stats[state.selected];
    if (p)
      marker(
        p,
        s?.percent === null || s?.percent === undefined
          ? '#81969e'
          : s.percent < 0
            ? '#ffa77b'
            : '#83dbc1',
        size(s?.current),
        true,
        s?.baseline !== null && s?.baseline !== undefined ? size(s.baseline) : null,
      );
  } else if (state.mode === 'connections' && network) {
    // This lens draws only actual selected links; unrelated ports stay searchable.
    const max = Math.max(1, ...links.slice(0, 20).map((e) => e[3] || 0));
    for (const edge of links.slice(0, 20)) {
      const a = network.nodes[edge[0]],
        b = network.nodes[edge[1]];
      if (!a || !b) continue;
      const points = M.arc([a.lon, a.lat], [b.lon, b.lat]),
        width = 0.6 + 3 * Math.sqrt(Math.max(0, edge[3] || 0) / max);
      drawLine(ctx, points, '#85bce860', width);
      ctx.setLineDash([5, 22]);
      ctx.lineDashOffset = -phase;
      drawLine(ctx, points, '#a9e4fa', Math.max(1, width * 0.4));
      ctx.setLineDash([]);
      const mid = project(...points[33]),
        prev = project(...points[32]);
      if (mid.z > 0 && prev.z > 0) {
        ctx.save();
        ctx.translate(mid.x, mid.y);
        ctx.rotate(Math.atan2(mid.y - prev.y, mid.x - prev.x));
        ctx.fillStyle = '#c0ecff';
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(-3, -3);
        ctx.lineTo(-3, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      const endpoint = $('direction').value === 'out' ? b : a;
      marker(endpoint, '#85bce8', 3, w > 480 && links.indexOf(edge) < 6);
    }
    marker(place(), '#83dbc1', 7, true);
  } else if (state.mode === 'exposure') {
    const max = Math.max(1, ...countryRows.map((r) => r.value));
    for (const r of countryRows.slice(0, 40)) {
      drawLine(ctx, M.arc([place().lon, place().lat], [r.lon, r.lat]), '#85bce835', 0.7);
      marker(
        { id: 'country-' + r.iso, name: r.name, lon: r.lon, lat: r.lat },
        '#85bce8',
        3 + 13 * Math.sqrt(r.value / max),
        w > 480 && countryRows.indexOf(r) < 4 && r.name !== place().name,
      );
    }
    if (place()) marker(place(), '#83dbc1', 6, true);
  }
}
function activityDetail() {
  const p = place(),
    s = stats[state.selected] || M.summarize([], 0, 0);
  text('value', fmt(s.current));
  text(
    'unit',
    (state.window === 7 ? '7-day mean · ' : 'Daily · ') +
      (state.metric < 4
        ? p.kind === 'port'
          ? 'port calls/day'
          : 'transit calls/day'
        : 'estimated metric tonnes/day'),
  );
  text(
    'delta',
    s.percent === null
      ? 'No comparable percentage'
      : (s.percent > 0 ? '+' : '') + fmt(s.percent) + '% vs reference',
  );
  $('delta').className =
    'delta ' + (s.percent === null ? 'muted' : s.percent < 0 ? 'negative' : 'positive');
  const baselineDates =
    s.baseStart >= 0 && s.baseEnd < dates.length
      ? dates[s.baseStart] + ' → ' + dates[s.baseEnd]
      : 'not available';
  text(
    'explanation',
    s.difference === null
      ? 'A complete current window and an earlier 28-day reference are required.'
      : `${fmt(Math.abs(s.difference))} ${state.metric < 4 ? 'calls' : 'estimated tonnes'} per day ${s.difference < 0 ? 'below' : 'above'} the ${fmt(s.baseline)} reference mean (${baselineDates}).`,
  );
  text(
    'quality',
    !supported(p)
      ? 'This measure is not available for this location type. Select a compatible port or passage.'
      : s.current === 0
        ? 'Zero recorded; not proof of no physical traffic.'
        : s.current === null
          ? `${s.currentCount}/${state.window} current observations. Missing days are not filled.`
          : `${s.currentCount}/${state.window} current days · ${s.baselineCount}/28 baseline days. No seasonal adjustment.`,
  );
  const data = series[state.selected] || [];
  let last = -1;
  data.forEach((r, i) => {
    if (Number.isFinite(r?.[state.metric])) last = i;
  });
  text('lastDate', last >= 0 ? dates[last] : 'NO OBSERVATIONS');
  plot($('chart'), [{ id: state.selected, color: '#83dbc1' }]);
  text('chartScale', state.metric < 4 ? 'Calls/day' : 'Est. tonnes/day');
  const dl = $('calculation');
  dl.replaceChildren();
  for (const [key, value] of [
    ['Current window', (dates[s.start] || 'before snapshot') + ' → ' + dates[state.index]],
    ['Reference window', baselineDates],
    ['Current / reference mean', fmt(s.current) + ' / ' + fmt(s.baseline)],
    ['Formula', '100 × (current mean − reference mean) / reference mean'],
    ['Selected source ID', state.selected],
    ['Dataset snapshot', manifest.retrieved],
    ['Latest selected observation', last >= 0 ? dates[last] : 'none'],
  ])
    dl.append(element('dt', '', key), element('dd', '', value));
}
function networkDetail() {
  links = network
    ? network.edges
        .filter(
          (e) => e[$('direction').value === 'out' ? 0 : 1] === state.selected && e[0] !== e[1],
        )
        .sort((a, b) => (b[3] || 0) - (a[3] || 0))
    : [];
  $('downloadNetwork').disabled = !network;
  text(
    'networkSummary',
    !network
      ? networkError
        ? 'Network download failed. Select Connections again to retry. Observed activity remains available.'
        : 'Loading historical network…'
      : links.length
        ? `${links.length} historical ${$('direction').value === 'out' ? 'outgoing' : 'incoming'} connections. Showing the strongest ${Math.min(20, links.length)} by daily loaded capacity at risk.`
        : 'No matching historical connections in this snapshot.',
  );
  if (network && links.length) {
    const valid = links.filter((e) => Number.isFinite(e[3]) && e[3] >= 0),
      total = valid.reduce((s, e) => s + e[3], 0);
    if (total > 0) {
      const top = valid.slice(0, 5).reduce((s, e) => s + e[3], 0);
      text(
        'networkSummary',
        $('networkSummary').textContent +
          ' Top five account for ' +
          fmt((top / total) * 100) +
          '% of the selected historical capacity weight. ' +
          (links.length - valid.length) +
          ' links excluded for missing/invalid weights. This is concentration, not resilience or available substitute capacity.',
      );
    }
  }
  const frag = document.createDocumentFragment();
  for (const edge of links.slice(0, 20)) {
    const id = edge[$('direction').value === 'out' ? 1 : 0],
      p = network.nodes[id],
      r = element('div', 'route'),
      b = element('button', '');
    b.append(
      element('b', '', p?.name || id),
      element(
        'small',
        '',
        `${fmt(edge[2])} days historical mean · ${short(edge[3])} tonnes/day capacity at risk`,
      ),
    );
    b.onclick = () => choose(id);
    r.append(b);
    frag.append(r);
  }
  $('routes').replaceChildren(frag);
}
function exposureDetail() {
  const rows = exposures[state.selected];
  $('downloadExposure').disabled = !rows;
  if (!rows) {
    text(
      'exposureSummary',
      exposureErrors[state.selected]
        ? 'Model download failed. Select this port again to retry. Observed activity remains available.'
        : 'Loading this port model…',
    );
    countryRows = [];
    $('countries').replaceChildren();
    return;
  }
  const sectors = [
    'all',
    ...new Set(rows.map((r) => r.industry).filter((x) => x && x !== 'Total')),
  ].sort((a, b) => (a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b)));
  if ($('sector').dataset.port !== state.selected) {
    $('sector').replaceChildren(
      ...sectors.map((s) => {
        const o = element('option', '', s === 'all' ? 'All sectors (source Total)' : s);
        o.value = s;
        return o;
      }),
    );
    $('sector').dataset.port = state.selected;
  }
  const field = $('trade').value,
    sector = $('sector').value;
  const filtered = rows.filter(
    (r) =>
      r.industry === (sector === 'all' ? 'Total' : sector) &&
      r.unit === 'US Dollars' &&
      r.scale === 'Unit',
  );
  // Use the source Total only; never add Total to its component sectors.
  countryRows = filtered
    .filter((r) => Number.isFinite(r[field]))
    .map((r) => ({
      name: r.to_country,
      iso: r.to_iso3,
      lat: r.to_lat,
      lon: r.to_lon,
      value: r[field],
    }))
    .sort((a, b) => b.value - a.value);
  text(
    'exposureSummary',
    `${countryRows.length} countries with reported values · USD/day · 2022 modeled allocation. Missing values excluded, not zero. Top 40 mapped and listed; export retains all selected source rows.`,
  );
  const max = Math.max(1, ...countryRows.map((r) => r.value)),
    frag = document.createDocumentFragment();
  for (const row of countryRows.slice(0, 40)) {
    const r = element('div', 'country');
    r.append(element('b', '', row.name + ' · $' + short(row.value) + '/day'));
    const bar = element('div', 'bar');
    bar.style.width = (row.value / max) * 100 + '%';
    r.append(bar);
    frag.append(r);
  }
  $('countries').replaceChildren(frag);
}
function render() {
  if (!manifest || !land) return;
  document.body.dataset.mode = state.mode;
  recompute();
  makeList();
  const p = place();
  if (!p) return;
  text('placeName', p.name);
  text('placeCountry', p.country);
  text('placeKind', p.kind === 'chokepoint' ? 'Selected passage' : 'Selected port');
  for (const m of ['change', 'connections', 'exposure']) {
    $(m).classList.toggle('active', state.mode === m);
    $(m).setAttribute('aria-pressed', String(state.mode === m));
  }
  const activity = state.mode === 'change';
  $('activityDetail').hidden = !activity;
  $('networkDetail').hidden = state.mode !== 'connections';
  $('exposureDetail').hidden = state.mode !== 'exposure';
  $('pin').hidden = !activity;
  text('pin', state.pins.includes(state.selected) ? '− Unpin' : '+ Compare');
  text(
    'listTitle',
    activity
      ? 'Find the change'
      : state.mode === 'connections'
        ? 'Trace the connections'
        : 'Explore dependence',
  );
  text(
    'lensBadge',
    activity
      ? 'Observed · AIS-derived estimates'
      : state.mode === 'connections'
        ? 'Historical network · 2019–2024'
        : 'Modeled trade exposure · 2022',
  );
  text(
    'mapTitle',
    activity
      ? 'Where the pattern changes'
      : state.mode === 'connections'
        ? 'Connected across oceans'
        : 'Far away. Still dependent.',
  );
  text(
    'mapSubtitle',
    activity
      ? dates[state.index] + ' · ' + (state.window === 7 ? '7-day means' : 'daily values')
      : state.mode === 'connections'
        ? 'Previous / next port calls · not final cargo destinations'
        : 'Country markers show trade exposure—not actual losses',
  );
  text(
    'mobileExplore',
    ($('analyst').checked ? 'More · All' : 'More') +
      (document.body.classList.contains('explore-open') ? ' ▴' : ' ▾'),
  );
  text(
    'mobileMeasure',
    activity
      ? $('metric').options[state.metric].text +
          ' · ' +
          (state.window === 7 ? '7-day mean' : 'daily') +
          ' · ' +
          (state.baseline === 'january' ? 'Jan reference' : 'prior 28 days')
      : 'Historical/model data · timeline paused',
  );
  $('metric').value = state.metric;
  $('window').value = state.window;
  $('baseline').value = state.baseline;
  for (const id of [
    'play',
    'back',
    'forward',
    'dateInput',
    'latest',
    'speed',
    'metric',
    'window',
    'baseline',
    'scrub',
  ])
    $(id).disabled = !activity;
  $('rank').disabled = !activity;
  $('kind').disabled = state.mode === 'exposure';
  text('play', state.playing ? 'Ⅱ Pause' : '▶ Play');
  $('scrub').value = state.index;
  $('scrub').setAttribute('aria-valuetext', dates[state.index]);
  $('dateInput').value = dates[state.index];
  text(
    'clockNote',
    activity
      ? 'Daily observations · snapshot, not live traffic'
      : 'Observation clock paused · this layer has its own historical vintage',
  );
  text(
    'status',
    $('analyst').checked
      ? `${manifest.ports.toLocaleString()} ports · ${manifest.chokepoints} chokepoints · ports through ${manifest.Daily_Ports_Data_latest} · passages through ${manifest.Daily_Chokepoints_Data_latest}`
      : `${manifest.ports.toLocaleString()} ports · ${manifest.chokepoints} chokepoints · ${manifest.start} → ${dates.at(-1)}`,
  );
  text(
    'legend',
    activity
      ? $('analyst').checked
        ? 'Full catalog · reference rings for passages/selection · coral < −5% / mint > +5% · hollow: no comparison'
        : 'Up to 80 ranked matches + selected · coral < −5% / mint > +5%'
      : state.mode === 'connections'
        ? 'Arrow = direction · width = historical capacity · top 20 schematic links'
        : 'Country size = modeled USD/day at risk · top 40 · no scenario clock',
  );
  if (activity) {
    activityDetail();
    comparisonGlobeContext();
  } else if (state.mode === 'connections') networkDetail();
  else exposureDetail();
  $('story').hidden = !state.story;
  if (state.story) renderStory();
  $('comparePanel').hidden = !state.pins.length || !activity;
  if (state.pins.length && activity) {
    text(
      'indexNote',
      $('comparisonScale').value === 'indexed'
        ? 'Each series uses its complete Jan 1–28, 2026 mean as 100. Zero/incomplete references are omitted. Values before Jan 29 overlap the reference; this is retrospective normalization, not a real-time signal.'
        : 'Daily values with one shared vertical scale.',
    );
    const colors = ['#83dbc1', '#ffa77b', '#85bce8', '#d8a7e7'];
    $('pinLabels').replaceChildren(
      ...state.pins.map((id, i) => {
        const s = element('span', '', placeById[id]?.name || id);
        s.style.color = colors[i];
        return s;
      }),
    );
    plot(
      $('comparison'),
      state.pins.map((id, i) => ({ id, color: colors[i] })),
    );
  }
  if (activity) renderDepth();
  renderWorkspace();
  globe();
  startRouteMotion();
}
function startRouteMotion() {
  if (routeFrame !== null) {
    cancelAnimationFrame(routeFrame);
    routeFrame = null;
  }
  if (state.mode !== 'connections' || reduced.matches || document.hidden || !network) return;
  let last = 0;
  function tick(t) {
    if (t - last > 65) {
      phase = t * 0.018;
      globe();
      last = t;
    }
    routeFrame = requestAnimationFrame(tick);
  }
  routeFrame = requestAnimationFrame(tick);
}
function renderStory() {
  const panel = $('story');
  panel.replaceChildren();
  const isHormuz = state.story === 'hormuz';
  panel.append(
    element(
      'p',
      '',
      isHormuz
        ? 'Hormuz: inspect the recorded break, then the following months. This is an observed decline, not a claim of complete physical closure.'
        : 'Suez and the Cape: compare the timing and vessel categories. Opposite changes alone do not prove the same cargo was rerouted.',
    ),
  );
  for (const [label, date] of isHormuz
    ? [
        ['Before', '2026-02-20'],
        ['After', '2026-03-15'],
        ['Latest', dates.at(-1)],
      ]
    : [
        ['January', '2026-01-31'],
        ['March', '2026-03-31'],
        ['Latest', dates.at(-1)],
      ]) {
    const b = element('button', '', label);
    b.onclick = () => setDate(dates.indexOf(date));
    panel.append(b);
  }
  const b = element('button', '', 'Explore freely ×');
  b.onclick = () => {
    state.story = null;
    refresh();
  };
  panel.append(b);
}
async function story(name) {
  $('search').value = '';
  $('kind').value = 'all';
  if (name === 'routes' || name === 'exposure') {
    await setMode(name === 'routes' ? 'connections' : 'exposure');
    const match = places.find((p) => p.name === (name === 'routes' ? 'Jebel Ali' : 'Singapore'));
    if (match) choose(match.id);
    else
      text(
        'status',
        'This guided port is unavailable in the current snapshot. Choose another port.',
      );
    return;
  }
  await setMode('change');
  state.metric = 0;
  state.window = 7;
  state.baseline = 'january';
  state.selected = name === 'hormuz' ? 'chokepoint6' : 'chokepoint1';
  state.lon = name === 'hormuz' ? 45 : 30;
  state.lat = 15;
  state.zoom = 1;
  state.index = dates.indexOf(name === 'hormuz' ? '2026-02-20' : '2026-03-31');
  state.story = name;
  if (name === 'cape') state.pins = ['chokepoint1', 'chokepoint7'];
  refresh();
}
function download(name, rows) {
  const blob = new Blob(['\ufeff' + M.csv(rows)], { type: 'text/csv;charset=utf-8' }),
    url = URL.createObjectURL(blob),
    a = element('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function bind() {
  bindDepth();
  bindCharts();
  const closeMore = () => {
    document.body.classList.remove('explore-open');
    $('mobileExplore').setAttribute('aria-expanded', 'false');
    text('mobileExplore', ($('analyst').checked ? 'More · All' : 'More') + ' ▾');
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('explore-open')) {
      closeMore();
      $('mobileExplore').focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#morePanel,#mobileExplore')) closeMore();
  });
  $('morePanel').addEventListener('click', (e) => {
    if (e.target.closest('[data-story],#sources')) closeMore();
  });
  const setTimeline = (open) => {
    document.body.classList.toggle('timeline-open', open);
    $('timelineSettings').hidden = !open;
    $('mobileControls').setAttribute('aria-expanded', String(open));
  };
  $('mobileControls').onclick = () => setTimeline($('timelineSettings').hidden);
  $('closeTimeline').onclick = () => {
    setTimeline(false);
    $('mobileControls').focus();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('timelineSettings').hidden) {
      setTimeline(false);
      $('mobileControls').focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#timelineSettings,#mobileControls')) setTimeline(false);
  });
  $('mobileExplore').onclick = () => {
    const open = document.body.classList.toggle('explore-open');
    $('mobileExplore').setAttribute('aria-expanded', String(open));
    text('mobileExplore', ($('analyst').checked ? 'More · All' : 'More') + (open ? ' ▴' : ' ▾'));
  };
  $('detailsToggle').onclick = () =>
    document.querySelector('.detail').scrollIntoView({ block: 'start', behavior: 'auto' });
  $('backToGlobe').onclick = () =>
    document.querySelector('main').scrollTo({ top: 0, behavior: 'auto' });
  $('browseToggle').onclick = () => {
    $('browseDialog').append(document.querySelector('.discovery'));
    $('browseDialog').showModal();
    $('search').focus();
  };
  $('closeBrowse').onclick = () => $('browseDialog').close();
  $('browseDialog').addEventListener('close', () =>
    document.querySelector('.workspace').prepend(document.querySelector('.discovery')),
  );
  for (const mode of ['change', 'connections', 'exposure']) $(mode).onclick = () => setMode(mode);
  for (const id of ['search', 'kind', 'rank'])
    $(id).addEventListener(id === 'search' ? 'input' : 'change', refresh);
  $('analyst').onchange = refresh;
  $('window').onchange = () => {
    state.window = Number($('window').value);
    refresh();
  };
  $('baseline').onchange = () => {
    state.baseline = $('baseline').value;
    refresh();
  };
  $('metric').onchange = () => {
    state.metric = Number($('metric').value);
    refresh();
  };
  $('play').onclick = () => {
    if (state.playing) {
      stop();
      refresh();
    } else play();
  };
  $('speed').onchange = () => {
    if (state.playing) play();
  };
  $('scrub').oninput = () => setDate(Number($('scrub').value));
  $('back').onclick = () => setDate(state.index - 1);
  $('forward').onclick = () => setDate(state.index + 1);
  $('latest').onclick = () => {
    const rows = series[state.selected] || [];
    let last = dates.length - 1;
    while (last > 0 && !Number.isFinite(rows[last]?.[state.metric])) last--;
    setDate(last);
  };
  $('dateInput').onchange = () => {
    const i = dates.indexOf($('dateInput').value);
    if (i >= 0) setDate(i);
    else refresh();
  };
  $('direction').onchange = refresh;
  $('sector').onchange = refresh;
  $('trade').onchange = refresh;
  $('sources').onclick = () => $('sourceDialog').showModal();
  $('closeDialog').onclick = () => $('sourceDialog').close();
  $('reset').onclick = () => {
    state.lon = 45;
    state.lat = 16;
    state.zoom = 1;
    globe();
  };
  const zoom = (f) => {
    state.zoom = Math.min(2.5, Math.max(0.7, state.zoom * f));
    globe();
  };
  $('zoomin').onclick = () => zoom(1.15);
  $('zoomout').onclick = () => zoom(1 / 1.15);
  const c = $('globe');
  PassageGestures.attach(c, {
    getView: () => state,
    setView: (changes) => {
      Object.assign(state, changes);
      globe();
    },
    onTap: (e) => {
      const b = c.getBoundingClientRect(),
        x = e.clientX - b.left,
        y = e.clientY - b.top,
        p = hitpoints
          .filter((p) => !p.id.startsWith('country-'))
          .sort((a, b) => Math.hypot(x - a.x, y - a.y) - Math.hypot(x - b.x, y - b.y))
          .find((p) => Math.hypot(x - p.x, y - p.y) < p.size + 8);
      if (p) choose(p.id, false);
    },
  });
  c.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    },
    { passive: false },
  );
  c.onkeydown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '='].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'ArrowLeft') state.lon -= 10;
    if (e.key === 'ArrowRight') state.lon += 10;
    if (e.key === 'ArrowUp') state.lat = Math.min(80, state.lat + 10);
    if (e.key === 'ArrowDown') state.lat = Math.max(-80, state.lat - 10);
    if (e.key === '+' || e.key === '=') zoom(1.1);
    if (e.key === '-') zoom(1 / 1.1);
    globe();
  };
  $('pin').onclick = () => {
    if (state.pins.includes(state.selected))
      state.pins = state.pins.filter((id) => id !== state.selected);
    else if (state.pins.length < 4) state.pins.push(state.selected);
    else {
      text('pin', 'Four pins maximum');
      return;
    }
    text('pin', state.pins.includes(state.selected) ? '− Unpin' : '+ Compare');
    refresh();
  };
  $('clearPins').onclick = () => {
    state.pins = [];
    refresh();
  };
  $('share').onclick = async () => {
    const params = new URLSearchParams({
      mode: state.mode,
      place: state.selected,
      date: dates[state.index],
      metric: state.metric,
      window: state.window,
      baseline: state.baseline,
      direction: $('direction').value,
      sector: $('sector').value,
      trade: $('trade').value,
      pins: state.pins.join(','),
      context: comparison.event || '',
      shift: comparison.signal || '',
      event: $('eventStart').value,
      threshold: $('recoveryThreshold').value,
      sustain: $('recoveryDays').value,
      compare: $('comparisonScale').value,
      depth: $('depthPanel').open ? '1' : '0',
      analyst: $('analyst').checked ? '1' : '0',
    });
    const url = location.origin + '/#' + params;
    history.replaceState(null, '', '#' + params);
    try {
      await navigator.clipboard.writeText(url);
      text('share', 'Link copied');
    } catch {
      text('share', 'View saved in address bar');
    }
  };
  $('download').onclick = () => {
    const headers = [
      'date',
      'port_id',
      'place',
      'measure',
      'value',
      'unit',
      'snapshot_utc',
      'source',
      'window_days',
      'baseline_mode',
      'selected_end_date',
      'current_start_date',
      'reference_start_date',
      'reference_end_date',
    ];
    const service = place().kind === 'port' ? 'Daily_Ports_Data' : 'Daily_Chokepoints_Data';
    download(state.selected + '-' + manifest.fields[state.metric] + '.csv', [
      headers,
      ...dates.map((date, i) => [
        date,
        state.selected,
        place().name,
        manifest.fields[state.metric],
        series[state.selected]?.[i]?.[state.metric] ?? null,
        state.metric < 4 ? 'calls/day' : 'estimated metric tonnes/day',
        manifest.retrieved,
        manifest.sources[service],
        state.window,
        state.baseline,
        dates[state.index],
        dates[stats[state.selected]?.start] || null,
        dates[stats[state.selected]?.baseStart] || null,
        dates[stats[state.selected]?.baseEnd] || null,
      ]),
    ]);
  };
  $('downloadNetwork').onclick = () =>
    download(state.selected + '-connections.csv', [
      [
        'from_port_id',
        'to_port_id',
        'historical_mean_transit_days',
        'daily_capacity_at_risk_metric_tonnes',
        'relative_capacity_at_risk_percent',
        'network_vintage',
        'source',
      ],
      ...links.map((e) => [...e, '2019–2024', manifest.network.source]),
    ]);
  $('downloadExposure').onclick = () => {
    const rows = (exposures[state.selected] || []).filter(
      (r) => r.industry === ($('sector').value === 'all' ? 'Total' : $('sector').value),
    );
    const keys = [
      'to_country',
      'to_iso3',
      'industry',
      'unit',
      'scale',
      'daily_import_value_at_risk',
      'daily_export_value_at_risk',
    ];
    download(state.selected + '-exposure.csv', [
      ['from_port_id', ...keys, 'base_year', 'source'],
      ...rows.map((r) => [
        state.selected,
        ...keys.map((k) => r[k]),
        2022,
        'https://www.arcgis.com/home/item.html?id=86842d9b6e8948f29200710a8df206f5',
      ]),
    ]);
  };
  document
    .querySelectorAll('[data-story]')
    .forEach((b) => (b.onclick = () => story(b.dataset.story)));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    refresh();
  });
  reduced.addEventListener('change', startRouteMotion);
  new ResizeObserver(() => {
    if (
      !matchMedia('(max-width:1280px), (max-width:1440px) and (any-pointer:coarse)').matches &&
      $('browseDialog').open
    )
      $('browseDialog').close();
    refresh();
  }).observe(document.querySelector('.map-panel'));
}
async function boot() {
  try {
    [manifest, places, land] = await Promise.all([
      load('manifest.json'),
      load('places.json'),
      load('land.json'),
    ]);
    placeById = Object.fromEntries(places.map((p) => [p.id, p]));
    const end = [manifest.Daily_Ports_Data_latest, manifest.Daily_Chokepoints_Data_latest]
      .sort()
      .at(-1);
    for (
      let t = Date.parse(manifest.start + 'T00:00:00Z');
      t <= Date.parse(end + 'T00:00:00Z');
      t += 86400000
    )
      dates.push(new Date(t).toISOString().slice(0, 10));
    const dateIndex = Object.fromEntries(dates.map((d, i) => [d, i]));
    let complete = 0;
    for (let batch = 0; batch < manifest.activity.length; batch += 3)
      await Promise.all(
        manifest.activity.slice(batch, batch + 3).map(async (part) => {
          const rows = await load(part.file);
          if (rows.length !== part.rows) throw new Error('Snapshot row count mismatch');
          for (const row of rows) {
            const [id, date, ...values] = row;
            if (!series[id]) series[id] = Array(dates.length).fill(null);
            series[id][dateIndex[date]] = values;
          }
          complete++;
          if (!bootFailed)
            text(
              'status',
              `Loading observed history · ${complete}/${manifest.activity.length} monthly partitions`,
            );
        }),
      );
    state.index = dates.indexOf(
      [manifest.Daily_Ports_Data_latest, manifest.Daily_Chokepoints_Data_latest].sort()[0],
    );
    const q = new URLSearchParams(location.hash.slice(1));
    state.selected = placeById[q.get('place')] ? q.get('place') : PassageDiscovery.landing(places);
    state.lon = place().lon;
    state.lat = place().lat;
    if (dates.includes(q.get('date'))) state.index = dates.indexOf(q.get('date'));
    if (['0', '1', '2', '3', '4', '5', '6'].includes(q.get('metric')))
      state.metric = Number(q.get('metric'));
    if (q.get('window') === '1') state.window = 1;
    if (q.get('baseline') === 'january') state.baseline = 'january';
    state.pins = (q.get('pins') || '')
      .split(',')
      .filter((id) => placeById[id])
      .slice(0, 4);
    $('analyst').checked = q.get('analyst') === '1';
    if (q.get('direction') === 'in') $('direction').value = 'in';
    if (q.get('trade') === 'daily_export_value_at_risk') $('trade').value = q.get('trade');
    $('scrub').max = dates.length - 1;
    $('dateInput').min = dates[0];
    $('dateInput').max = end;
    text('endLabel', end);
    text(
      'provenance',
      `Snapshot retrieved: ${manifest.retrieved}\nCatalog: ${manifest.ports} ports, ${manifest.chokepoints} chokepoints\nActivity rows: ${Object.values(manifest.rows).reduce((a, b) => a + b, 0)}\nHistorical connection rows: ${manifest.network.rows}\nCountry-model selected ports: ${manifest.exposure.map((p) => p.name).join(', ')}\nActivity sources: UN Global Platform; IMF PortWatch.\nNetwork/model sources: University of Oxford; IMF PortWatch (portwatch.imf.org).`,
    );
    restoreDepth(q);
    bind();
    bindWorkspace(q);
    updateFreshness();
    setInterval(updateFreshness, 60000);
    render();
    if (['connections', 'exposure'].includes(q.get('mode'))) {
      await setMode(q.get('mode'));
      if (state.mode === 'exposure') {
        await ensureExposure();
        render();
        if ([...$('sector').options].some((o) => o.value === q.get('sector')))
          $('sector').value = q.get('sector');
        refresh();
      }
    } else if (location.pathname.startsWith('/stories') && !location.hash) {
      comparisonOpen();
      $('eventCatalog').open = true;
    }
    document.body.classList.add('snapshot-ready');
    window.passageSnapshot = () => ({
      state: { ...state },
      date: dates[state.index],
      place: place()?.name,
      summary: stats[state.selected],
      places: places.length,
      series: Object.keys(series).length,
      ranking: ranking.slice(0, 5).map((p) => p.id),
      links: links.length,
      countries: countryRows.length,
      networkRows: network?.edges.length,
      hitpoints: hitpoints.map((p) => ({ ...p })),
      ready: true,
    });
  } catch (e) {
    bootFailed = true;
    text('status', 'Snapshot could not load. Reload to retry. ' + e.message);
    $('status').setAttribute('role', 'alert');
    for (const b of document.querySelectorAll('button,input,select')) b.disabled = true;
  }
}

function updateFreshness() {
  if (!manifest) return;
  const f = PassageFreshness.status(manifest);
  text(
    'freshness',
    `${f.stale ? 'Data is aging · ' : ''}Observations: ports ${manifest.Daily_Ports_Data_latest}, passages ${manifest.Daily_Chokepoints_Data_latest}. Last published source check: ${manifest.refresh?.checked || 'not recorded'}. Context reviewed separately.`,
  );
  $('freshness').classList.toggle('stale', f.stale);
}
