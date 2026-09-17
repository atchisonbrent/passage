"""Pack pinned history by measure/year for a fully resident globe timeline."""

import datetime as dt
import hashlib
import json
from pathlib import Path
import tempfile


def build_timeline(data):
    data = Path(data)
    source = (data / "history-manifest.json").read_bytes()
    fingerprint = hashlib.sha256(source).hexdigest()
    target = data / "timeline-manifest.json"
    if target.exists():
        cached = json.loads(target.read_text())
        if (
            cached.get("layout") == "metric-year-v1"
            and cached.get("source_sha256") == fingerprint
            and all(
                (data / p["file"]).exists()
                and hashlib.sha256((data / p["file"]).read_bytes()).hexdigest() == p["sha256"]
                for p in cached["files"]
            )
        ):
            return cached
    history = json.loads(source)
    ids = sorted(history["files"])
    start, end = dt.date(2019, 1, 1), dt.date(2025, 12, 31)
    days = (end - start).days + 1
    axis = [(start + dt.timedelta(days=i)).isoformat() for i in range(days)]
    spans = [
        (
            year,
            (dt.date(year, 1, 1) - start).days,
            (dt.date(year + 1, 1, 1) - dt.date(year, 1, 1)).days,
        )
        for year in range(2019, 2026)
    ]
    with tempfile.TemporaryDirectory(dir=data.parent) as tmp:
        handles = {}
        try:
            for metric in range(7):
                for year, offset, count in spans:
                    name = f"timeline-{metric}-{year}.json"
                    handles[metric, year] = (Path(tmp) / name).open("w")
                    handles[metric, year].write("[")
            for place_index, ident in enumerate(ids):
                entry = history["files"][ident]
                content = (data / entry["file"]).read_bytes()
                if hashlib.sha256(content).hexdigest() != entry["sha256"]:
                    raise ValueError("Historical source hash mismatch: " + ident)
                rows = json.loads(content)
                if [row[0] for row in rows] != axis:
                    raise ValueError("Historical calendar mismatch: " + ident)
                for metric in range(7):
                    for year, offset, count in spans:
                        handle = handles[metric, year]
                        if place_index:
                            handle.write(",")
                        handle.write(
                            json.dumps(
                                [r[metric + 1] for r in rows[offset : offset + count]],
                                separators=(",", ":"),
                            )[1:-1]
                        )
            for handle in handles.values():
                handle.write("]")
        finally:
            for handle in handles.values():
                handle.close()
        files = []
        for metric in range(7):
            for year, offset, count in spans:
                name = f"timeline-{metric}-{year}.json"
                content = (Path(tmp) / name).read_bytes()
                files.append(
                    {
                        "metric": metric,
                        "year": year,
                        "offset": offset,
                        "days": count,
                        "file": name,
                        "values": len(ids) * count,
                        "sha256": hashlib.sha256(content).hexdigest(),
                    }
                )
                (Path(tmp) / name).replace(data / name)
        result = {
            "layout": "metric-year-v1",
            "start": start.isoformat(),
            "end": end.isoformat(),
            "days": days,
            "ids": ids,
            "source_sha256": fingerprint,
            "assembled": history.get("assembled"),
            "files": files,
        }
        target.write_text(json.dumps(result, separators=(",", ":")))
    return result
