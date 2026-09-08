"""Manual static historical extension, cached/resumable; no browser API access.
Full daily source history before 2026, partitioned by place for lazy loading.
"""

import datetime as dt
import json
from ingest import request, day, save, CACHE, OUT, query, BASE
import concurrent.futures as cf


def collect(service, where, fields):
    layer = request(BASE + service + "/FeatureServer/0?f=json")
    assert layer["advancedQueryCapabilities"]["supportsQueryWithResultType"]
    page_size = min(32000, layer["standardMaxRecordCount"])
    count = request(query(service, where=where, returnCountOnly="true"))["count"]

    def page(offset):
        return request(
            query(
                service,
                where=where,
                outFields=fields + ",ObjectId",
                returnGeometry="false",
                orderByFields="ObjectId ASC",
                resultType="standard",
                resultRecordCount=page_size,
                resultOffset=offset,
            )
        )["features"]

    rows = []
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for batch in pool.map(page, range(0, count, page_size)):
            rows.extend(r["attributes"] for r in batch)
    assert len(rows) == count and len({r["ObjectId"] for r in rows}) == count
    print(service, where, count, flush=True)
    return rows


def run():
    CACHE.mkdir(exist_ok=True)
    places = json.loads((OUT / "places.json").read_text())
    known = {p["id"] for p in places}
    data = {p: {} for p in known}
    totals = {}
    mapping = {
        "Daily_Ports_Data": [
            "portcalls",
            "portcalls_tanker",
            "portcalls_container",
            "portcalls_dry_bulk",
            "import",
            "export",
            None,
        ],
        "Daily_Chokepoints_Data": [
            "n_total",
            "n_tanker",
            "n_container",
            "n_dry_bulk",
            None,
            None,
            "capacity",
        ],
    }
    for service, fields in mapping.items():
        totals[service] = 0
        for year in range(2019, 2026):
            where = f"date >= DATE '{year}-01-01' AND date < DATE '{year + 1}-01-01'"
            rows = collect(service, where, "portid,date," + ",".join(f for f in fields if f))
            totals[service] += len(rows)
            for row in rows:
                ident = row["portid"]
                assert ident in known, ("Unknown historical identifier", ident)
                date = day(row["date"])
                assert date not in data[ident], (ident, date)
                data[ident][date] = [row.get(f) if f else None for f in fields]
    files = {}
    for ident, rows in sorted(data.items()):
        files[ident] = {
            **save("history-" + ident + ".json", [[d, *v] for d, v in sorted(rows.items())]),
            "rows": len(rows),
        }
    result = {
        "assembled": dt.datetime.now(dt.timezone.utc).isoformat(),
        "start": "2019-01-01",
        "end": "2025-12-31",
        "files": files,
        "rows": totals,
        "sources": {
            s: query(
                s, where="date >= DATE '2019-01-01' AND date < DATE '2026-01-01'", outFields="*"
            )
            for s in mapping
        },
        "cache_note": "Assembly time; pages may be reused from the manual acquisition cache. Not a new retrieval time for each row.",
    }
    save("history-manifest.json", result)
    print("Historical extension complete", totals, "places", len(files), flush=True)


if __name__ == "__main__":
    run()
