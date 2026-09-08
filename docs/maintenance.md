# Maintaining Passage

## Local development and code releases

Run `python3 scripts/qa.py --output /tmp/passage-qa` for an offline build, all tests, an isolated loopback preview and responsive browser acceptance. The server chooses a free port and is stopped automatically. Inspect the generated screenshots as well as browser.json. No cloud job, deployment or source acquisition occurs.

For a production code release, manually dispatch `release.yml` with `publish=true`. It downloads and hash-checks the current published observation partitions, preserves their refresh provenance, builds the new code, tests it and publishes. It never queries ArcGIS or claims a fresh data check. Release and refresh share a concurrency lock so they cannot overwrite each other mid-run. Ordinary pushes do not deploy.

## Scheduled data refresh

`.github/workflows/refresh.yml` checks daily at 11:23 UTC. Activation is explicit:
`PASSAGE_REFRESH_ENABLED=true`, main branch only. The repository variable is the on/off switch; check Actions for the latest run.
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
can be delayed; public-repository schedules may be disabled after 60 days without repository activity. Job failure notifications depend on account settings.

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

## Checks

```sh
python3 -m unittest discover -s tests
for test in tests/*.test.cjs; do node "$test"; done
python3 scripts/deploy.py check
# With the preview server running and Chrome installed:
node scripts/browser-smoke.cjs http://127.0.0.1:8653/ /tmp/passage-browser
```

Browser tests use Chromium. Physical Safari and VoiceOver checks are still outstanding.
