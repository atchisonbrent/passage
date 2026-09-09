"""Render both static entrypoints with exact script-hash CSP. No dependencies."""

import base64
import hashlib
import json
import re
from signals import discovery as signal_candidates
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


# Classic scripts share a lexical scope. Helpers precede UI bindings; bootstrap
# runs last, after every view has been defined. These names are the code map.
APP_HELPERS = (
    "freshness.js",
    "workspace-math.js",
    "discovery.js",
    "events.js",
    "chart-input.js",
)
APP_VIEWS = (
    "app.js",
    "depth.js",
    "chart-plot.js",
    "workspace.js",
    "comparison-context.js",
    "comparison-chart.js",
    "comparison-export.js",
)


def script_bundles(source):
    """Return the exact three inline-script payloads used by the template/CSP."""
    helpers = [(source / name).read_text() for name in APP_HELPERS]
    shifts = "const passageShifts=" + json.dumps(signal_candidates(), separators=(",", ":")) + ";"
    views = [(source / name).read_text() for name in APP_VIEWS]
    application = "\n".join([*helpers, shifts, *views, "boot();"])
    return [(source / "analysis.js").read_text(), (source / "gestures.js").read_text(), application]


def build():
    source = ROOT / "src"
    data = ROOT / "public/data"
    manifest = json.loads((data / "manifest.json").read_text())
    manifest["assets"] = []
    for name in ["places.json", "land.json"]:
        content = (data / name).read_bytes()
        manifest["assets"].append(
            {"file": name, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}
        )
    # Port totals from the source "Total" rows so the Exposure list can rank
    # ports before any per-port model file is downloaded. Derived at build time
    # from pinned reference assets; not part of the published-baseline contract.
    manifest["exposureTotals"] = {}
    for entry in manifest.get("exposure", []):
        rows = json.loads((data / entry["file"]).read_text())
        totals = {"import": 0.0, "export": 0.0}
        for row in rows:
            if row.get("industry") != "Total" or row.get("unit") != "US Dollars":
                continue
            if row.get("scale") != "Unit":
                continue
            for key, field in [
                ("import", "daily_import_value_at_risk"),
                ("export", "daily_export_value_at_risk"),
            ]:
                value = row.get(field)
                if isinstance(value, (int, float)) and value >= 0:
                    totals[key] += value
        manifest["exposureTotals"][entry["id"]] = {k: round(v) for k, v in totals.items()}
    (data / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")))
    html = (source / "index.html").read_text()
    scripts = script_bundles(source)
    assert all("</script" not in s.lower() for s in scripts)
    replacements = {
        "STYLE": (source / "style.css").read_text(),
        "MATH": scripts[0],
        "GESTURES": scripts[1],
        "APP": scripts[2],
    }
    for key in replacements:
        assert html.count("/*" + key + "*/") == 1, "Template marker must be unique"
    html = re.sub(
        r"/\*(STYLE|MATH|GESTURES|APP)\*/", lambda match: replacements[match.group(1)], html
    )
    for name in ["index.html", "stories/index.html"]:
        (ROOT / "public" / name).write_text(html)
    hashes = " ".join(
        "'sha256-" + base64.b64encode(hashlib.sha256(s.encode()).digest()).decode() + "'"
        for s in scripts
    )
    (ROOT / "public/_headers").write_text(
        "/*\n  Content-Security-Policy: default-src 'none'; script-src "
        + hashes
        + "; script-src-attr 'none'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n  Strict-Transport-Security: max-age=31536000\n  X-Robots-Tag: noindex, nofollow, noarchive\n  Cache-Control: public, max-age=0, must-revalidate\n"
    )
    print("Rendered two entrypoints; exact script hashes; same-origin static data only")


if __name__ == "__main__":
    build()
