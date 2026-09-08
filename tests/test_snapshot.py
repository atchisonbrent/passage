"""Deterministic artifact integrity, real-data coverage and static publication checks."""

import base64
import hashlib
import json
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from deploy import assets
from ingest import day


class SnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = ROOT / "public/data"
        cls.manifest = json.loads((cls.data / "manifest.json").read_text())

    def test_dates(self):
        self.assertEqual(day("2026-01-01"), "2026-01-01")
        self.assertEqual(day(1767225600000), "2026-01-01")
        with self.assertRaises(ValueError):
            day("01/01/2026")

    def test_counts_and_missing_semantics(self):
        manifest = self.manifest
        places = json.loads((self.data / "places.json").read_text())
        self.assertEqual(len(places), manifest["ports"] + manifest["chokepoints"])
        self.assertEqual(len({p["id"] for p in places}), len(places))
        seen = set()
        counts = {"port": 0, "chokepoint": 0}
        latest = {}
        ids = set()
        for part in manifest["activity"]:
            b = (self.data / part["file"]).read_bytes()
            self.assertEqual(hashlib.sha256(b).hexdigest(), part["sha256"])
            rows = json.loads(b)
            self.assertEqual(len(rows), part["rows"])
            for row in rows:
                self.assertEqual(len(row), 9)
                key = tuple(row[:2])
                self.assertNotIn(key, seen)
                seen.add(key)
                ids.add(row[0])
                kind = "chokepoint" if row[0].startswith("chokepoint") else "port"
                counts[kind] += 1
                latest[kind] = max(latest.get(kind, ""), row[1])
                self.assertTrue(all(v is None or isinstance(v, (int, float)) for v in row[2:]))
                if kind == "port":
                    self.assertIsNone(row[8])
                else:
                    self.assertEqual(row[6:8], [None, None])
        self.assertEqual(counts["port"], manifest["rows"]["Daily_Ports_Data"])
        self.assertEqual(counts["chokepoint"], manifest["rows"]["Daily_Chokepoints_Data"])
        self.assertEqual(ids, {p["id"] for p in places})
        self.assertEqual(latest["port"], manifest["Daily_Ports_Data_latest"])
        self.assertEqual(latest["chokepoint"], manifest["Daily_Chokepoints_Data_latest"])

    def test_guided_catalog_bindings(self):
        places = json.loads((self.data / "places.json").read_text())
        names = {p["id"]: p["name"] for p in places}
        self.assertEqual(names["chokepoint1"], "Suez Canal")
        self.assertEqual(names["chokepoint6"], "Strait of Hormuz")
        self.assertEqual(names["chokepoint7"], "Cape of Good Hope")
        self.assertIn("Jebel Ali", names.values())
        self.assertIn("Singapore", names.values())

    def test_network_and_model(self):
        network = json.loads((self.data / "network.json").read_text())
        self.assertEqual(len(network["edges"]), self.manifest["network"]["rows"])
        self.assertEqual(
            hashlib.sha256((self.data / "network.json").read_bytes()).hexdigest(),
            self.manifest["network"]["sha256"],
        )
        for edge in network["edges"]:
            self.assertIn(edge[0], network["nodes"])
            self.assertIn(edge[1], network["nodes"])
        for case in self.manifest["exposure"]:
            b = (self.data / case["file"]).read_bytes()
            self.assertEqual(hashlib.sha256(b).hexdigest(), case["sha256"])
            rows = json.loads(b)
            self.assertEqual(len(rows), case["rows"])
            keys = [(r["to_iso3"], r["industry"], r["unit"], r["scale"]) for r in rows]
            self.assertEqual(len(keys), len(set(keys)), case["id"])
            self.assertTrue(any(r["industry"] == "Total" for r in rows))
            self.assertEqual({r["unit"] for r in rows}, {"US Dollars"})
            self.assertEqual({r["scale"] for r in rows}, {"Unit"})

    def test_public_boundary_and_hashes(self):
        self.assertGreater(len(assets()), 10)
        self.assertEqual(len(self.manifest["assets"]), 2)
        for receipt in self.manifest["assets"]:
            self.assertEqual(
                hashlib.sha256((self.data / receipt["file"]).read_bytes()).hexdigest(),
                receipt["sha256"],
            )
        for entry in ["index.html", "stories/index.html"]:
            text = (ROOT / "public" / entry).read_text()
            scripts = re.findall(r"<script>(.*?)</script>", text, re.S)
            self.assertEqual(len(scripts), 3)
            headers = (ROOT / "public/_headers").read_text()
            for script in scripts:
                digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
                self.assertIn("'sha256-" + digest + "'", headers)
            self.assertNotIn("The world moves through here", text)
            self.assertNotIn("eval(", text)
            self.assertIn("connect-src 'self'", headers)
            self.assertNotIn("script-src 'self'", headers)
            self.assertNotIn("/Users/", text)
            self.assertNotIn("cdn.jsdelivr", text)


if __name__ == "__main__":
    unittest.main()
