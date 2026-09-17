/* Calendar-safe year-ago alignment; February 29 never rolls into March. */
(function (root) {
  function yearAgo(d) {
    const prior = String(Number(d.slice(0, 4)) - 1) + d.slice(4);
    return new Date(prior + 'T00:00:00Z').toISOString().slice(0, 10) === prior ? prior : null;
  }
  if (typeof module !== 'undefined') module.exports = { yearAgo };
  else root.PassageTimeline = { yearAgo };
})(typeof window !== 'undefined' ? window : globalThis);
