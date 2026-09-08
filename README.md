# Passage

**[Explore Passage](https://passage.batchison.dev/)** — an independent,
noncommercial maritime atlas built from IMF PortWatch observations.
Not an IMF product or endorsement. Aggregate daily activity, not live ship tracking.

## Explore and analyze

- Globe-first exploration of 2,065 ports and 28 passages, with search, comparison,
  playback and directly scrubbable charts.
- Historical analysis back to 2019, complete-period references, indexed comparisons,
  disruption/recovery views and reproducible CSV exports and shared links.
- Historical port connections (2019–2024) and separately labeled modeled trade
  exposure (2022 base year), not current routes or predicted losses.
- Dated event context and deterministic shifts. Related reporting is context,
  not proof of causation; new windows never inherit an old explanation.
- Responsive phone/tablet/desktop layouts, keyboard chart controls and explicit
  missing-data coverage. Missing observations are never silently replaced by zero.

## Run and test

Python 3.12+ and Node 22+. No application package dependencies or build framework.
The committed static snapshots support offline development; browser acceptance
uses an installed Chromium/Chrome browser.

```sh
python3 scripts/build.py
python3 -m unittest discover -s tests
for test in tests/*.test.cjs; do node "$test"; done
python3 scripts/deploy.py check
python3 scripts/preview.py
# Separate terminal, while preview is running:
node scripts/browser-smoke.cjs http://127.0.0.1:8653/ /tmp/passage-browser
```

`src/` owns the interface and analysis; `scripts/` owns acquisition, build and
publication; `public/` is the exact static deployment bundle. Never upload the
repository root. Security headers use exact script hashes and same-origin data.
No runtime IMF requests, server, database, telemetry or LLM calls are required.

## Data and interpretation

Sources: UN Global Platform / IMF PortWatch (observed activity); University of
Oxford / IMF PortWatch (network and economic models); Natural Earth (land).
[Data terms and attribution](public/data/LICENSE.txt) apply separately from code.
Source cutoffs and hashes are in `public/data/manifest.json`; historical provenance
is in `public/data/history-manifest.json`. Data is generally published weekly, not live.

Percent changes require valid complete references; zero and missing differ.
Cumulative deviations are descriptive, not lost trade. Exposure is modeled risk,
not a loss forecast. Connections do not identify final cargo destinations.
Event dates distinguish disruption onset from report publication.

## Deterministic refresh

`.github/workflows/refresh.yml` checks daily at 11:23 UTC. Activation is explicit:
`PASSAGE_REFRESH_ENABLED=true`, main branch only. **Prepared, not yet enabled.**
Standard hosted runners in this public repository have free Actions execution;
no premium runners or persistent artifact/cache uploads are configured.

The pipeline reacquires 90 days to catch revisions, reconciles activity since
2026 monthly or with the manual `full` input, checks source revision stamps,
coverage, identifiers and values, builds and tests, runs browser acceptance,
and publishes only eligible changed candidates. Static catalogs, pre-2026 history
and network/model vintages require separately reviewed maintenance.

Manual dry run: dispatch with `publish=false`. Manual publication: `publish=true`.
`full=true` requests full activity reconciliation. A job has a 20-minute timeout;
a source outage or validation failure leaves the last good site intact. Browser
freshness warnings keep aging even if the scheduler stops. GitHub scheduled runs
can be delayed; public-repository schedules may be disabled after prolonged
repository inactivity. Job failure notifications depend on account settings.

Deployment reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the process
environment (GitHub Actions secrets in CI). Never commit credentials. The default
Pages project is `passage-imf`; a dedicated Pages-only token is required for CI.
Cloudflare Pages permissions cover the account, not solely this project.

```sh
python3 scripts/deploy.py upload --receipts /absolute/path/to/receipts
python3 scripts/verify-public.py --base https://passage.batchison.dev/
```

The local uploader requires a clean committed tree; CI validates an ephemeral
source-backed candidate without committing daily snapshots. Public verification
checks HTML/CSP and data hashes, permitting only recognized inert Cloudflare
appendages under the exact restrictive policy. Failed post-upload verification
needs investigation and, if necessary, a native Pages rollback—it is not an
automatic rollback. No deployment credentials are exposed to pull-request jobs.

`imf.batchison.dev` is the legacy hostname; migration preserves old links.
The current bundle retains noindex headers; public accessibility is not authentication.

## License

Original code: **MIT**, copyright Brent Atchison. Data and third-party material
are **not MIT**. See [LICENSES.md](LICENSES.md) for exact boundaries.

## Verification limits

Chromium responsive/gesture checks are not physical Safari or a full VoiceOver
assessment. Curated sources need human review; routine numerical updates do not.
