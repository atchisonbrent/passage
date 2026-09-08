# Reading the numbers

Passage is an independent presentation of IMF PortWatch data, not an IMF product or a causal model. Source links, snapshot dates and coverage accompany the views.

## Activity comparisons

Daily activity is aggregate observed/estimated port and passage activity, not individual live ship positions. Calls and estimated tonnes are different measures; not every measure exists for every place type.

A comparison mean is available only when every expected calendar day has a finite observation. Zero is valid; missing is not zero. The reference must end before the observation period. Percentage change is `(mean - reference) / reference * 100`, defined only for a positive reference. An index divides a daily value by that positive reference and multiplies by 100.

Net deviation is the mean difference multiplied by the observation-day count for complete periods. It is not a measure of lost trade. Reference-window sensitivity shows how results change under different preceding windows; it is not statistical confidence. See `src/analysis.js`, `src/workspace-math.js` and their tests.

## Event context and recovery

Curated reporting and detected shifts are distinct. An attached source supplies dated context, not proof that it caused a traffic change. Random event selects an existing catalog entry or qualifying shift; it does not generate explanations.

Recovery uses a complete 28-day pre-event reference and the chosen threshold and sustained-day requirement. Missing days interrupt the sustained run. Recovery is a descriptive confirmation within the available follow-up, not a forecast. Shortfall and net deviation require complete follow-up. Seasonal references require at least three complete matching historical windows.

## Detected shifts

The screen compares seven daily observations with the preceding 28-day mean, requiring complete windows, a baseline of at least 20 calls/day, an absolute change of at least 50%, and all seven observation days on the same side of the baseline. It is retrospective screening, not a significance test. Archived windows remain linkable even if revisions make them cease to qualify. See `scripts/signals.py` for the implementation and tests.

## Other views

Historical port connections summarize previous/next calls, not ultimate cargo origins or destinations. Transit means are not current ETAs. Modeled exposure uses its stated vintage and is not a prediction of loss. Neither should be read as current observed shipping.

CSV exports retain dates, reference choices and source metadata so readers can reproduce comparisons. The public snapshot can lag the source; check displayed dates rather than assuming today’s coverage.
