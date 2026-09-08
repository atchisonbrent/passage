/* Discovery selects existing evidence; it does not infer new events. */
const PassageDiscovery = {
  landing(places) {
    return (places.find((p) => p.name === 'Singapore') || places[0])?.id;
  },
  candidates(events, shifts, places) {
    const ids = new Set(places.map((p) => p.id));
    return [
      ...events
        .filter((e) => e.places.length && e.places.every((id) => ids.has(id)))
        .map((e) => ({ kind: 'event', id: e.id, key: 'event:' + e.id })),
      ...shifts
        .filter((s) => s.qualifies && ids.has(s.place))
        .map((s) => ({ kind: 'shift', id: s.id, key: 'shift:' + s.id })),
    ];
  },
  pick(pool, current, rng = Math.random) {
    const next = pool.filter((e) => e.key !== current),
      choices = next.length ? next : pool;
    return choices.length ? choices[Math.floor(rng() * choices.length)] : null;
  },
};
if (typeof module !== 'undefined') module.exports = PassageDiscovery;
