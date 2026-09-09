/* Curated source context, reviewed 2026-09-07. Not a live or exhaustive feed. */
const passageEvents = [
  {
    id: 'hormuz-2026',
    title: 'Hormuz: the February break',
    date: '2026-02-28',
    dateKind: 'Disruption start reported by IMF',
    disruptionStart: '2026-02-28',
    published: null,
    source: 'IMF PortWatch',
    url: 'https://portwatch.imf.org/pages/cc317ba850e34c4dadbead6f7b336fb1',
    summary:
      'PortWatch reports reduced traffic from February 28 and attacks on commercial ships. Its warning includes GPS jamming, AIS spoofing and vessels going dark.',
    places: ['chokepoint6', 'chokepoint4', 'chokepoint1'],
    start: '2026-02-28',
    end: '2026-08-28',
    referenceStart: '2026-01-31',
    referenceEnd: '2026-02-27',
    caveat:
      'Related passages provide geographic context, not a causal control group. AIS interference can affect measured traffic.',
  },
  {
    id: 'hormuz-august',
    title: 'Hormuz: six months unresolved',
    date: '2026-08-28',
    dateKind: 'Statement date, not a new disruption onset',
    published: '2026-08-28',
    source: 'International Maritime Organization',
    url: 'https://www.imo.org/en/mediacentre/pressbriefings/pages/statement-on-the-ongoing-crisis-in-the-strait-of-hormuz.aspx',
    summary:
      'The IMO described the situation as unresolved six months into the conflict and called for practical solutions to restore freedom of navigation.',
    places: ['chokepoint6'],
    start: '2026-08-01',
    end: '2026-08-28',
    referenceStart: '2026-01-31',
    referenceEnd: '2026-02-27',
    caveat:
      'This snapshot cannot establish recovery after the statement. The comparison is August against a pre-conflict reference, not an estimate of the statement’s effect.',
  },
  {
    id: 'red-sea-2024',
    title: 'Suez and the Cape: the longer route',
    date: '2024-03-07',
    dateKind: 'IMF report publication, not disruption onset',
    published: '2024-03-07',
    source: 'IMF',
    url: 'https://www.imf.org/en/blogs/articles/2024/03/07/red-sea-attacks-disrupt-global-trade',
    summary:
      'The IMF reported reduced Suez trade and increased Cape traffic in early 2024 as shipping companies diverted around Africa following Red Sea attacks.',
    places: ['chokepoint1', 'chokepoint7'],
    start: '2024-01-01',
    end: '2024-03-31',
    referenceStart: '2023-01-01',
    referenceEnd: '2023-03-31',
    caveat:
      'Historical context, not current news. The default chart uses calls, not the trade-volume measure quoted in the IMF article. The reference is the same quarter a year earlier.',
  },
  {
    id: 'panama-2024',
    title: 'Panama: drought restrictions',
    date: '2024-03-07',
    dateKind: 'IMF report publication, not restriction onset',
    published: '2024-03-07',
    source: 'IMF',
    url: 'https://www.imf.org/en/blogs/articles/2024/03/07/red-sea-attacks-disrupt-global-trade',
    summary:
      'The IMF described drought-related restrictions that reduced daily Panama Canal crossings from October 2023 and discussed weaker trade volume in early 2024.',
    places: ['chokepoint2'],
    start: '2024-01-01',
    end: '2024-03-31',
    referenceStart: '2023-01-01',
    referenceEnd: '2023-03-31',
    caveat:
      'Historical context. Calls and estimated capacity are distinct from trade value; comparison alone does not isolate the effect of drought.',
  },
];
if (typeof module !== 'undefined') module.exports = passageEvents;
