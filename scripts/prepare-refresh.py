"""Prepare/validate a candidate; never deploy from this entrypoint."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import datetime as dt

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from refresh import published_baseline


def prepare_code_data(data):
    """Reuse verified published observations; never acquire upstream data."""
    published_baseline(data)


def validate_changed_paths():
    changed = (
        subprocess.check_output(
            ["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"], cwd=ROOT
        )
        .decode()
        .split("\0")
    )
    for item in filter(None, changed):
        status, name = item[:2], item[3:]
        if "R" in status or "C" in status or Path(ROOT / name).is_symlink():
            raise ValueError("Unsupported candidate change")
        if not (
            name
            in {
                "public/index.html",
                "public/stories/index.html",
                "public/_headers",
                "public/data/manifest.json",
            }
            or __import__("re").fullmatch(r"public/data/activity-\d{4}-\d{2}\.json", name)
        ):
            raise ValueError("Unexpected candidate path: " + name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--receipt-dir", type=Path, required=True)
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--code-release", action="store_true")
    args = parser.parse_args()
    if args.code_release and args.full:
        parser.error("--full is only for data refresh")
    if subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT).strip():
        raise ValueError("Start with a committed clean checkout")
    receipts = args.receipt_dir.resolve()
    if receipts.is_relative_to(ROOT):
        raise ValueError("Receipts must stay outside publication checkout")
    receipts.mkdir(parents=True, exist_ok=True)
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if args.code_release:
        prepare_code_data(ROOT / "public/data")
        receipt = {"changed": False, "kind": "code-release"}
    else:
        cmd = [
            sys.executable,
            "scripts/refresh.py",
            "--published-baseline",
            "--receipt",
            str(receipts / "refresh.json"),
        ]
        if args.full:
            cmd.append("--full")
        subprocess.run(cmd, cwd=ROOT, check=True)
        receipt = json.loads((receipts / "refresh.json").read_text())
        age = (
            dt.date.fromisoformat(receipt["checked"])
            - dt.date.fromisoformat(min(window["end"] for window in receipt["windows"].values()))
        ).days
        if age > 14:
            raise ValueError(
                "Source observations exceed 14-day freshness threshold; retaining last published snapshot"
            )
    data = ROOT / "public/data"
    manifest = json.loads((data / "manifest.json").read_text())
    publish = receipt["changed"] or manifest.get("source_revision") != revision
    if publish:
        if not args.code_release:
            manifest["refresh"] = receipt
        manifest["source_revision"] = revision
        (data / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")))
    subprocess.run([sys.executable, "scripts/build.py"], cwd=ROOT, check=True)
    subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", "tests"], cwd=ROOT, check=True
    )
    for test in sorted((ROOT / "tests").glob("*.test.cjs")):
        subprocess.run(["node", str(test)], cwd=ROOT, check=True)
    subprocess.run([sys.executable, "scripts/deploy.py", "check"], cwd=ROOT, check=True)
    validate_changed_paths()
    manifest = json.loads((data / "manifest.json").read_text())
    receipt.update(
        publish=publish,
        revision=revision,
        manifest_sha256=hashlib.sha256((data / "manifest.json").read_bytes()).hexdigest(),
    )
    (receipts / "candidate.json").write_text(json.dumps(receipt, indent=2) + "\n")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write("publish=" + str(publish).lower() + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
