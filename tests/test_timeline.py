import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class TimelineTests(unittest.TestCase):
    def test_generated_measure_packs_preserve_source(self):
        data = ROOT / "public/data"
        manifest = json.loads((data / "timeline-manifest.json").read_text())
        history = json.loads((data / "history-manifest.json").read_text())
        self.assertEqual(manifest["ids"], sorted(history["files"]))
        self.assertEqual(manifest["days"], 2557)
        self.assertEqual(len(manifest["files"]), 49)
        sample_days = {"2019-01-01", "2020-02-29", "2023-12-01", "2025-12-31"}
        samples = {}
        for ident in manifest["ids"]:
            rows = json.loads((data / history["files"][ident]["file"]).read_text())
            samples[ident] = [(i, row) for i, row in enumerate(rows) if row[0] in sample_days]
        total = 0
        for part in manifest["files"]:
            content = (data / part["file"]).read_bytes()
            self.assertLess(len(content), 25 * 1024 * 1024)
            self.assertEqual(hashlib.sha256(content).hexdigest(), part["sha256"])
            values = json.loads(content)
            self.assertEqual(len(values), len(manifest["ids"]) * part["days"])
            total += len(values)
            for p, ident in enumerate(manifest["ids"]):
                for day, row in samples[ident]:
                    if part["offset"] <= day < part["offset"] + part["days"]:
                        self.assertEqual(
                            values[p * part["days"] + day - part["offset"]], row[part["metric"] + 1]
                        )
        self.assertEqual(total, sum(history["rows"].values()) * 7)


if __name__ == "__main__":
    unittest.main()
