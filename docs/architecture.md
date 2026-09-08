# Code map

Passage is a static application: Python assembles same-origin snapshots and HTML; the browser draws the globe and computes selected comparisons. There is no application server or browser connection to IMF APIs.

## Where to start

| Responsibility                                | Files                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Page structure and responsive layout          | `src/index.html`, `src/style.css`                                                     |
| Globe, selected place, playback and bootstrap | `src/app.js`                                                                          |
| Comparison controls, state and tables         | `src/workspace.js`                                                                    |
| Event context, charts and exports             | `src/comparison-context.js`, `src/comparison-chart.js`, `src/comparison-export.js`    |
| Historical loading and selected-place detail  | `src/depth.js`                                                                        |
| Pure calculations                             | `src/analysis.js`, `src/workspace-math.js`                                            |
| Chart plotting and input                      | `src/chart-plot.js`, `src/chart-input.js`                                             |
| Globe gestures                                | `src/gestures.js`                                                                     |
| Event catalog and random selection            | `src/events.js`, `src/discovery.js`                                                   |
| Snapshot freshness                            | `src/freshness.js`                                                                    |
| Acquisition and retrospective screening       | `scripts/ingest.py`, `scripts/history.py`, `scripts/refresh.py`, `scripts/signals.py` |
| Build and release validation                  | `scripts/build.py`, `scripts/prepare-refresh.py`, `scripts/verify-public.py`          |
| Local acceptance entrypoint                   | `scripts/qa.py`                                                                       |

## Data and execution

`public/data/manifest.json` identifies observation partitions and their provenance. Current observations load at startup. Selected historical files, network data and exposure data load on demand. The build embeds the curated event catalog and deterministic shift candidates.

The frontend currently uses ordered classic scripts, not ES modules. Pure helper APIs are available to Node tests and the browser. UI files share application state and DOM helpers. The lexical `comparison` object owns comparison state; access the similarly named DOM element through `$('comparison')`, not a bare global. `scripts/build.py` is the authoritative dependency order; do not reorder files casually. Bootstrap loads the snapshot before binding views.

The globe clock and comparison date range are separate. The comparison workspace may use historical dates not available in the globe snapshot. History caches are keyed by place; errors remain visible and retryable.

Both public HTML entrypoints are generated from one template. The build hashes the exact inline scripts into the Content Security Policy. Do not hand-edit generated HTML or loosen CSP to accommodate a change.

## Boundaries for extensions

Put new calculations in pure helper files with Node tests before wiring them to controls. Keep network acquisition in Python; do not add browser-side source fetches. Use existing shared-link parsing and source/coverage conventions when adding controls.

The UI still has shared globals and a cascade-based responsive stylesheet. Formatting makes those dependencies inspectable; it does not remove them. Prefer small, tested extractions over introducing a framework just to rearrange the same state.
