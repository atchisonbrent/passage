# Reading the numbers

Passage is an independent presentation of IMF PortWatch data, not an IMF product or a causal model. Source links, snapshot dates and coverage accompany the views.

## Coverage and historical research

Both daily source APIs begin on 2019-01-01. Passage keeps 2019–2025 in per-place historical files and 2026 onward in monthly activity partitions. The globe uses the recent partitions; historical analysis loads only the selected places. This split is a loading boundary, not the start of the source dataset. Historical files are a separately assembled snapshot, not refreshed by the daily activity job; see their assembly date and source hash in exported comparison CSVs.

The Red Sea 2023–24 preset compares December 2023 through March 2024 against November 1–28, 2023. These are editable study windows, not a claimed disruption onset or the IMF article’s year-on-year calculation. Suez and Bab el-Mandeb describe the affected corridor; the Cape is the documented alternative route; Hormuz supplies regional context, not a bypass of the Red Sea.

Compare each passage’s absolute and percentage changes using the same measure and windows. These aggregates cannot identify the same ships or cargo rerouting, separate chokepoint traffic by transit direction, or establish that one increase offsets another decline. The same vessel can cross multiple passages; do not sum their totals as unique ships.

Passage exposes aggregate calls, tanker/container/dry-bulk calls, port import/export estimates, and aggregate chokepoint capacity. The source also offers general-cargo and ro-ro categories and category-specific tonnage; those fields are not currently bundled. Connections and Exposure are historical/model layers, not observed event-time rerouting.

## Activity comparisons

Daily activity is aggregate observed/estimated port and passage activity, not individual live ship positions. Calls and estimated tonnes are different measures; not every measure exists for every place type.

A comparison mean is available only when every expected calendar day has a finite observation. Zero is valid; missing is not zero. The reference must end before the observation period. Percentage change is `(mean - reference) / reference * 100`, defined only for a positive reference. An index divides a daily value by that positive reference and multiplies by 100.

Net deviation is the mean difference multiplied by the observation-day count for complete periods. It is not a measure of lost trade. Reference-window sensitivity shows how results change under different preceding windows; it is not statistical confidence. See `src/analysis.js`, `src/workspace-math.js` and their tests.

## Event context and recovery

Event presets open an absolute-value chart with the reference period visible, rather than inheriting a previous comparison’s display settings. Curated reporting and detected shifts are distinct. An attached source supplies dated context, not proof that it caused a traffic change. Random event selects an existing catalog entry or qualifying shift; it does not generate explanations.

Recovery uses a complete 28-day pre-event reference and the chosen threshold and sustained-day requirement. Missing days interrupt the sustained run. Recovery is a descriptive confirmation within the available follow-up, not a forecast. Shortfall and net deviation require complete follow-up. Seasonal references require at least three complete matching historical windows.

## Detected shifts

The screen compares seven daily observations with the preceding 28-day mean, requiring complete windows, a baseline of at least 20 calls/day, an absolute change of at least 50%, and all seven observation days on the same side of the baseline. It is retrospective screening, not a significance test. Archived windows remain linkable even if revisions make them cease to qualify. See `scripts/signals.py` for the implementation and tests.

## Other views

Historical port connections summarize previous/next calls, not ultimate cargo origins or destinations. Transit means are not current ETAs. Modeled exposure uses its stated vintage and is not a prediction of loss. Neither should be read as current observed shipping.

CSV exports retain dates, reference choices and source metadata so readers can reproduce comparisons. The public snapshot can lag the source; check displayed dates rather than assuming today’s coverage.
