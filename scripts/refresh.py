"""Deterministic activity refresh. No credentials, cache, model or news fetches."""

import collections
import datetime as dt
import math


def date(value):
    if not isinstance(value, str) or dt.date.fromisoformat(value).isoformat() != value:
        raise ValueError("Noncanonical date")
    return dt.date.fromisoformat(value)


def merge_rows(old, fresh, identifiers, start, end):
    """Replace a complete source interval, never infer absence as zero."""
    first, last = date(start), date(end)
    if last < first or not identifiers:
        raise ValueError("Invalid acquisition interval/catalog")
    seen = {}
    previous = {tuple(row[:2]): row for row in old}
    deduplicated = []
    for row in fresh:
        if len(row) != 9 or row[0] not in identifiers or not first <= date(row[1]) <= last:
            raise ValueError("Unexpected source row")
        if any(
            v is not None
            and (
                isinstance(v, bool)
                or not isinstance(v, (int, float))
                or not math.isfinite(v)
                or v < 0
            )
            for v in row[2:]
        ):
            raise ValueError("Invalid source measurement")
        key = tuple(row[:2])
        prior = previous.get(key)
        if prior and any(
            before is not None and after is None for before, after in zip(prior[2:], row[2:])
        ):
            raise ValueError("Known observation coverage regressed; review source revision")
        if key in seen:
            # The source has published byte-identical repeats of an observation
            # (distinct ObjectIds, same values). One copy is kept; any
            # disagreement between copies is still a hard failure.
            if seen[key] != row:
                raise ValueError("Conflicting duplicate source observation")
            continue
        seen[key] = row
        deduplicated.append(row)
    if len(seen) != len(identifiers) * ((last - first).days + 1):
        # Name what is missing: a silent catalog change upstream (places dropped
        # or renamed) must be diagnosable from the failed-run log alone.
        present = collections.Counter(key[0] for key in seen)
        expected_days = (last - first).days + 1
        absent = sorted(p for p in identifiers if present[p] == 0)
        partial = sorted(p for p in identifiers if 0 < present[p] < expected_days)
        raise ValueError(
            "Incomplete source date/place coverage: "
            f"{len(absent)} catalogued places absent ({', '.join(absent[:12])}"
            f"{', …' if len(absent) > 12 else ''}); {len(partial)} with missing days"
        )
    if old and max(r[1] for r in old) > end:
        raise ValueError("Source cutoff regressed")
    return sorted([r for r in old if r[1] < start] + deduplicated, key=lambda r: (r[0], r[1]))


import argparse
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/"
SERVICES = {
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


def request_bytes(url):
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "Passage-Snapshot/1.0", "Cache-Control": "no-cache"}
            )
            with urllib.request.urlopen(req, timeout=90) as response:
                raw = response.read(24 * 1024 * 1024 + 1)
            if len(raw) > 24 * 1024 * 1024:
                raise ValueError("Oversized source response")
            return raw
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2**attempt)

    raise RuntimeError("Source request failed")


def request(url):
    value = json.loads(request_bytes(url))
    if isinstance(value, dict) and "error" in value:
        raise ValueError("Source API error")
    return value


def query(service, **params):
    return (
        BASE + service + "/FeatureServer/0/query?" + urllib.parse.urlencode({"f": "json", **params})
    )


def cutoffs():
    return {
        service: request(
            query(
                service,
                where="1=1",
                outStatistics=json.dumps(
                    [
                        {
                            "statisticType": "max",
                            "onStatisticField": "date",
                            "outStatisticFieldName": "latest",
                        }
                    ]
                ),
            )
        )["features"][0]["attributes"]["latest"]
        for service in SERVICES
    }


def acquire(service, start, end):
    metadata_url = BASE + service + "/FeatureServer/0?f=json"
    stamp = request(metadata_url)["editingInfo"]["lastEditDate"]
    if not isinstance(stamp, int):
        raise ValueError("Missing source revision stamp")
    where = f"date >= DATE '{start}' AND date <= DATE '{end}'"
    count = request(query(service, where=where, returnCountOnly="true"))["count"]
    fields = SERVICES[service]
    rows = []
    seen = set()
    last_id = None
    started = time.monotonic()
    print(f"Acquire {service}: {start} → {end}, {count} rows", flush=True)
    while len(rows) < count:
        result = request(
            query(
                service,
                where=where if last_id is None else where + f" AND ObjectId > {last_id}",
                outFields="ObjectId,date,portid," + ",".join(f for f in fields if f),
                returnGeometry="false",
                orderByFields="ObjectId ASC",
                resultRecordCount=1000,
            )
        )
        if not result["features"]:
            raise ValueError("Source pagination stopped before expected count")
        for item in result["features"]:
            row = item["attributes"]
            object_id = row["ObjectId"]
            if type(object_id) is not int or (last_id is not None and object_id <= last_id):
                raise ValueError("Source ObjectId cursor did not advance")
            last_id = object_id
            if row["ObjectId"] in seen:
                raise ValueError("Repeated source ObjectId")
            seen.add(row["ObjectId"])
            # Missing fields are schema failure, not null observations.
            rows.append([row["portid"], row["date"]] + [row[f] if f else None for f in fields])
        if len(rows) % 10000 == 0 or len(rows) >= count:
            print(
                f"Acquire {service}: {len(rows)}/{count} rows in {time.monotonic() - started:.1f}s",
                flush=True,
            )
    if (
        len(rows) != count
        or request(query(service, where=where, returnCountOnly="true"))["count"] != count
    ):
        raise ValueError("Source count changed during acquisition")
    if request(metadata_url)["editingInfo"]["lastEditDate"] != stamp:
        raise ValueError("Source edited during acquisition")
    return rows


def refresh(data, fetch, latest, today, full=False):
    manifest = json.loads((data / "manifest.json").read_text())
    catalog = json.loads((data / "places.json").read_text())
    existing = []
    for part in manifest["activity"]:
        if not re.fullmatch(r"activity-\d{4}-\d{2}\.json", part["file"]):
            raise ValueError("Invalid partition path")
        raw = (data / part["file"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != part["sha256"]:
            raise ValueError("Baseline hash mismatch")
        rows = json.loads(raw)
        if len(rows) != part["rows"]:
            raise ValueError("Baseline count mismatch")
        existing.extend(rows)
    catalog_ids = {p["id"] for p in catalog}
    if any(row[0] not in catalog_ids for row in existing):
        raise ValueError("Unknown baseline place identifier")
    merged = []
    windows = {}
    for service in SERVICES:
        end = latest[service]
        if date(end) > date(today) or end < manifest[service + "_latest"]:
            raise ValueError("Invalid/regressed source cutoff")
        ids = {
            p["id"]
            for p in catalog
            if (p["kind"] == "chokepoint") == (service == "Daily_Chokepoints_Data")
        }
        old = [r for r in existing if r[0] in ids]
        start = (
            manifest["start"]
            if full
            else max(
                manifest["start"],
                (date(manifest[service + "_latest"]) - dt.timedelta(days=89)).isoformat(),
            )
        )
        fresh = fetch(service, start, end)
        merged.extend(merge_rows(old, fresh, ids, start, end))
        windows[service] = {"start": start, "end": end, "rows": len(fresh)}
    changed = sorted(existing) != sorted(merged)
    receipt = {
        "changed": changed,
        "checked": today,
        "windows": windows,
        "full_reconciliation": full,
    }
    if not changed:
        return receipt
    # Nothing is written until both acquisitions pass. Caller uses an isolated candidate.
    partitions = collections.defaultdict(list)
    for row in merged:
        partitions[row[1][:7]].append(row)
    manifest["activity"] = []
    for month, rows in sorted(partitions.items()):
        name = "activity-" + month + ".json"
        raw = json.dumps(sorted(rows), separators=(",", ":"), allow_nan=False).encode()
        (data / name).write_bytes(raw)
        manifest["activity"].append(
            {
                "file": name,
                "rows": len(rows),
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
            }
        )
    for service in SERVICES:
        manifest[service + "_latest"] = latest[service]
        manifest["rows"][service] = sum(
            1
            for r in merged
            if r[0].startswith("chokepoint") == (service == "Daily_Chokepoints_Data")
        )
    manifest["refresh"] = receipt
    manifest["retrieved"] = dt.datetime.now(dt.timezone.utc).isoformat()
    (data / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")))
    return receipt


def published_baseline(data):
    """Read only canonical public activity; pinned reference assets stay in Git."""
    origin = "https://passage.batchison.dev/data/"
    print("Loading published baseline", flush=True)
    current = request(origin + "manifest.json")
    local = json.loads((data / "manifest.json").read_text())
    # Catalog/model changes require an explicit bootstrap update, not silent drift.
    for key in ["start", "ports", "chokepoints", "places", "network", "exposure", "assets"]:
        if current[key] != local[key]:
            raise ValueError("Published reference assets differ from checkout: " + key)
    parts = {}
    for part in current["activity"]:
        name = part["file"]
        if not re.fullmatch(r"activity-\d{4}-\d{2}\.json", name):
            raise ValueError("Invalid live partition path")
        # Hashes are byte hashes, so do not decode/reencode the response.
        raw = request_bytes(origin + name)
        if (
            hashlib.sha256(raw).hexdigest() != part["sha256"]
            or len(json.loads(raw)) != part["rows"]
        ):
            raise ValueError("Published baseline integrity failure")
        parts[name] = raw
    for name, raw in parts.items():
        (data / name).write_bytes(raw)
    (data / "manifest.json").write_text(json.dumps(current, separators=(",", ":")))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--published-baseline", action="store_true")
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    data = ROOT / "public/data"
    if args.published_baseline:
        published_baseline(data)
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    # Monthly reconcile of all activity since the explicit 2026 bootstrap boundary.
    result = refresh(data, acquire, cutoffs(), today, args.full or today.endswith("-01"))
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
