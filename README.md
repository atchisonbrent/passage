# Passage

Explore shipping activity on an interactive globe, using [IMF PortWatch](https://portwatch.imf.org/) data.

**[Open Passage](https://passage.batchison.dev/)**

Pick a port or passage to see how its traffic has changed. Look back at the Red Sea disruptions, compare ports over time, or download the numbers for your own analysis. You can share a link to the view you're looking at.

The data goes back to 2019. It records daily activity and is usually published weekly, so this isn't a live ship tracker. Dates and sources are shown alongside the charts.

## Run locally

You'll need Python 3.12+ and Node 22+. The data is already in the repo.

```sh
python3 scripts/build.py
python3 scripts/preview.py
```

Open [localhost:8653](http://localhost:8653/). The frontend is plain JavaScript; Python handles the data and build scripts.

Want to build on it? Start with [contributing](CONTRIBUTING.md), the [code map](docs/architecture.md), and [methods](docs/methods.md). See [maintenance](docs/maintenance.md) for data updates and deployment.

## License and data

The original code is [MIT licensed](LICENSE). The datasets have [their own terms and attribution](public/data/LICENSE.txt); see [LICENSES.md](LICENSES.md) for details. Passage is an independent project, not an IMF product.
