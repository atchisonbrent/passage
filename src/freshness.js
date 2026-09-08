/* Client-clock warning continues to age even if the updater stops. */
const PassageFreshness = {
  status(manifest, today = new Date().toISOString().slice(0, 10)) {
    const cutoff = [
      manifest.Daily_Ports_Data_latest,
      manifest.Daily_Chokepoints_Data_latest,
    ].sort()[0];
    const days = Math.floor(
      (Date.parse(today + 'T00:00:00Z') - Date.parse(cutoff + 'T00:00:00Z')) / 86400000,
    );
    return { cutoff, days, stale: !Number.isFinite(days) || days > 14 };
  },
};
if (typeof module !== 'undefined' && module.exports) module.exports = PassageFreshness;
