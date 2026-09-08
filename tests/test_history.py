import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class HistoryTests(unittest.TestCase):
    def test_complete_partition_integrity(self):
        data = ROOT / "public/data"
        manifest = json.loads((data / "history-manifest.json").read_text())
        places = {p["id"] for p in json.loads((data / "places.json").read_text())}
        self.assertEqual(set(manifest["files"]), places)
        total = 0
        for ident, entry in manifest["files"].items():
            content = (data / entry["file"]).read_bytes()
            self.assertEqual(hashlib.sha256(content).hexdigest(), entry["sha256"])
            rows = json.loads(content)
            total += len(rows)
            self.assertEqual(len(rows), entry["rows"])
            dates = [row[0] for row in rows]
            self.assertEqual(dates, sorted(set(dates)))
            self.assertTrue(all("2019-01-01" <= d <= "2025-12-31" for d in dates))
            self.assertTrue(all(len(row) == 8 for row in rows))
            self.assertTrue(
                all(v is None or isinstance(v, (int, float)) for row in rows for v in row[1:])
            )
        self.assertEqual(total, sum(manifest["rows"].values()))

    def test_no_classroom_framing_and_depth_entrypoint(self):
        html = (ROOT / "public/index.html").read_text()
        self.assertNotIn("Try this in a classroom", html)
        self.assertNotIn("teaching case", html)
        self.assertIn('id="depthPanel"', html)
        self.assertIn("function eventStudy", html)
        self.assertIn("function fetchHistory", html)


if __name__ == "__main__":
    unittest.main()
