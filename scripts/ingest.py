"""Build an explicit, count-checked public PortWatch snapshot (no credentials).
Run manually; not a scheduled updater. Cached pages are resumable receipts.
"""

import concurrent.futures as cf
import datetime as dt
import hashlib
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/"
CACHE = ROOT / ".cache"
OUT = ROOT / "public/data"
FIELDS = ["calls", "tanker", "container", "dry_bulk", "imports", "exports", "capacity"]


def request(url):
    key = hashlib.sha256(url.encode()).hexdigest()
    file = CACHE / (key + ".json")
    if file.exists():
        return json.loads(file.read_text())
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90) as response:
                data = json.load(response)
            if "error" in data:
                raise RuntimeError(data["error"])
            file.write_text(json.dumps(data, separators=(",", ":")))
            return data
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2**attempt)


def query(service, **args):
    return (
        BASE + service + "/FeatureServer/0/query?" + urllib.parse.urlencode({"f": "json", **args})
    )


def collect(service, where, fields):
    count = request(query(service, where=where, returnCountOnly="true"))["count"]

    def page(offset):
        return request(
            query(
                service,
                where=where,
                outFields=fields + ",ObjectId",
                returnGeometry="false",
                orderByFields="ObjectId ASC",
                resultOffset=offset,
                resultRecordCount=1000,
            )
        )["features"]

    rows = []
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        for page_rows in pool.map(page, range(0, count, 1000)):
            rows.extend(x["attributes"] for x in page_rows)
    assert len(rows) == count, (service, count, len(rows))
    assert len({x["ObjectId"] for x in rows}) == count, "Duplicate pagination"
    print(service, where, count, flush=True)
    return rows


def save(name, data):
    text = json.dumps(data, separators=(",", ":"), allow_nan=False)
    (OUT / name).write_text(text)
    return {
        "file": name,
        "bytes": len(text.encode()),
        "sha256": hashlib.sha256(text.encode()).hexdigest(),
    }


def day(value):
    if isinstance(value, str):
        return dt.date.fromisoformat(value).isoformat()
    return dt.datetime.fromtimestamp(value / 1000, dt.timezone.utc).date().isoformat()


def run():
    CACHE.mkdir(exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    ports = collect(
        "PortWatch_ports_database", "1=1", "portid,portname,country,ISO3,lat,lon,vessel_count_total"
    )
    chokepoints = collect("PortWatch_chokepoints_database", "1=1", "portid,portname,lat,lon")
    places = [
        {
            "id": p["portid"],
            "name": p["portname"],
            "country": p.get("country", "International passage"),
            "lat": p["lat"],
            "lon": p["lon"],
            "kind": kind,
        }
        for group, kind in [(ports, "port"), (chokepoints, "chokepoint")]
        for p in group
    ]
    assert len({p["id"] for p in places}) == len(places)
    save("places.json", places)
    metadata = {
        "retrieved": dt.datetime.now(dt.timezone.utc).isoformat(),
        "start": "2026-01-01",
        "fields": FIELDS,
        "places": len(places),
        "ports": len(ports),
        "chokepoints": len(chokepoints),
        "activity": [],
        "sources": {},
    }
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
    months = {}
    seen = set()
    totals = {}
    for service, fields in mapping.items():
        rows = collect(
            service, "date >= DATE '2026-01-01'", "date,portid," + ",".join(f for f in fields if f)
        )
        totals[service] = len(rows)
        metadata["sources"][service] = query(
            service, where="date >= DATE '2026-01-01'", outFields="*"
        )
        metadata[service + "_latest"] = max(day(r["date"]) for r in rows)
        for row in rows:
            date = day(row["date"])
            key = (row["portid"], date)
            assert key not in seen, key
            seen.add(key)
            months.setdefault(date[:7], []).append(
                [row["portid"], date] + [row.get(f) if f else None for f in fields]
            )
    for month, rows in sorted(months.items()):
        rows.sort(key=lambda r: (r[0], r[1]))
        metadata["activity"].append(
            {**save("activity-" + month + ".json", rows), "rows": len(rows)}
        )
    metadata["rows"] = totals
    network = collect(
        "spillovers_port_level_impact",
        "1=1",
        "from_portid,from_portname,from_country,from_lat,from_lon,to_portid,to_portname,to_country,to_lat,to_lon,average_transit_days,daily_capacity_at_risk,relative_capacity_at_risk",
    )
    nodes = {}
    for row in network:
        for prefix in ["from_", "to_"]:
            nodes[row[prefix + "portid"]] = {
                "id": row[prefix + "portid"],
                "name": row[prefix + "portname"],
                "country": row[prefix + "country"],
                "lat": row[prefix + "lat"],
                "lon": row[prefix + "lon"],
                "kind": "port",
            }
    edges = [
        [
            r["from_portid"],
            r["to_portid"],
            r["average_transit_days"],
            r["daily_capacity_at_risk"],
            r["relative_capacity_at_risk"],
        ]
        for r in network
    ]
    metadata["network"] = {
        **save("network.json", {"nodes": nodes, "edges": edges}),
        "rows": len(edges),
        "vintage": "2019–2024",
        "source": BASE + "spillovers_port_level_impact/FeatureServer/0",
    }
    # Explicit teaching sample: full country/sector rows for these ports, not a global exposure ranking.
    names = [
        "Jebel Ali",
        "Singapore",
        "Rotterdam",
        "Shanghai",
        "Los Angeles",
        "New York",
        "Busan",
        "Antwerp",
        "Hamburg",
        "Santos",
        "Durban",
        "Port Said",
    ]
    selected = [p for p in places if p["kind"] == "port" and p["name"] in names]
    metadata["exposure"] = []
    for place in selected:
        rows = collect(
            "spillovers_trade",
            "from_portid = '" + place["id"] + "'",
            "to_country,to_iso3,to_lat,to_lon,industry,unit,scale,daily_export_value_at_risk,daily_import_value_at_risk",
        )
        if rows:
            metadata["exposure"].append(
                {
                    "id": place["id"],
                    "name": place["name"],
                    **save("exposure-" + place["id"] + ".json", rows),
                    "rows": len(rows),
                }
            )
    save("manifest.json", metadata)
    print("DONE", json.dumps(metadata), flush=True)


if __name__ == "__main__":
    run()
