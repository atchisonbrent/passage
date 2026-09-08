# Contributing

Start with [the code map](docs/architecture.md) and [methods](docs/methods.md).

Use Python 3.12+, Node 22+ and Chrome/Chromium. No application dependencies are required. Optional development tools are pinned:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-dev.txt
npm ci --ignore-scripts
```

Before submitting a change:

```sh
npm run format
python -m ruff format scripts tests
npm run format:check
python -m ruff format --check scripts tests
python -m ruff check scripts tests
python scripts/qa.py --output /tmp/passage-qa
```

Inspect the screenshots as well as the test result. Include a regression test for behavior changes and a short explanation of the affected view or calculation. Do not commit test output or credentials.

Edit `src/`, not generated HTML. Run `scripts/build.py` and include the resulting `public/index.html`, `public/stories/index.html` and `public/_headers` when source changes affect them. Keep data changes separate from UI changes.

Missing observations are not zero. Preserve source attribution, coverage checks and explicit date ranges. Changes to numerical methods need boundary tests and an update to the methods document.

Ordinary pushes do not deploy. Production publication is a maintainer action; see [maintenance](docs/maintenance.md).
