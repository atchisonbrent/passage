import datetime as dt
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("passage_signals", ROOT / "scripts/signals.py")
assert spec is not None and spec.loader is not None
signals = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signals)


class SignalsTests(unittest.TestCase):
    def rows(self):
        return [
            [str(dt.date(2026, 1, 1) + dt.timedelta(days=i)), 100 if i < 28 else 10]
            for i in range(35)
        ]

    def test_positive_control(self):
        s = signals.strongest(self.rows())
        self.assertEqual(s["percent"], -90)
        self.assertEqual(s["start"], "2026-01-29")
        self.assertEqual(s["referenceEnd"], "2026-01-28")

    def test_gaps_zero_and_floor(self):
        rows = self.rows()
        rows[5][1] = None
        self.assertIsNone(signals.strongest(rows))
        self.assertIsNone(signals.strongest(self.rows()[1:]))
        self.assertIsNone(signals.strongest([[r[0], r[1] / 10] for r in self.rows()]))
        self.assertIsNone(signals.strongest([[r[0], 0] for r in self.rows()]))
        self.assertIsNone(signals.strongest([[r[0], 100] for r in self.rows()]))
        with self.assertRaises(ValueError):
            signals.strongest(self.rows() + [self.rows()[0]])
        malformed = self.rows()
        malformed[0][0] = "20260101"
        with self.assertRaises(ValueError):
            signals.strongest(malformed)
        self.assertEqual(
            signals.strongest(list(reversed(self.rows()))), signals.strongest(self.rows())
        )

    def test_snapshot_candidates_and_context_binding(self):
        hits = signals.generate()
        self.assertEqual(len(hits), len({h["place"] for h in hits}))
        for h in hits:
            self.assertGreaterEqual(h["reference"], 20)
            self.assertGreaterEqual(abs(h["percent"]), 50)
            self.assertLess(h["referenceEnd"], h["start"])
            if h["context"]:
                self.assertEqual(h["context"]["start"], h["start"])
                self.assertEqual(h["context"]["end"], h["end"])
                self.assertEqual(h["context"]["place"], h["place"])
                self.assertTrue(h["context"]["url"].startswith("https://"))

    def test_pinned_source_windows(self):
        import json

        fixture = json.loads((ROOT / "tests/fixtures/source-signals.json").read_text())
        contexts = json.loads((ROOT / "src/signal-context.json").read_text())
        hits = [
            dict(
                place=place,
                context=next(c for c in contexts if c["place"] == place),
                **signals.strongest(rows),
            )
            for place, rows in fixture.items()
        ]
        expected = {
            "chokepoint6": ("2026-03-02", "2026-03-08"),
            "port744": ("2026-03-02", "2026-03-08"),
            "port1253": ("2026-07-08", "2026-07-14"),
        }
        for place, window in expected.items():
            hit = next(h for h in hits if h["place"] == place)
            self.assertIsNotNone(hit["context"])
            self.assertEqual((hit["start"], hit["end"]), window)
        hormuz = next(h for h in hits if h["place"] == "chokepoint6")
        self.assertAlmostEqual(hormuz["mean"], 18 / 7)
        self.assertEqual(hormuz["reference"], 77.25)

    def test_recent_window_does_not_reuse_old_winner(self):
        self.assertTrue(hasattr(signals, "recent"), "Missing recent-only screening")
        rows = self.rows() + [
            [str(dt.date(2026, 1, 1) + dt.timedelta(days=i)), 100] for i in range(35, 100)
        ]
        self.assertIsNotNone(signals.strongest(rows))
        self.assertIsNone(signals.recent(rows, "2026-04-10", 30))
        self.assertIsNotNone(signals.recent(self.rows(), "2026-02-04", 30))

    def test_archive_keeps_identity_without_stale_numbers(self):
        self.assertTrue(hasattr(signals, "discover"), "Missing stable discovery archive")
        rows = {"port1": self.rows()}
        catalog = {"port1": {"name": "Fixture"}}
        hits, keys = signals.discover(rows, catalog, [], {}, "2026-02-04")
        ident = hits[0]["id"]
        self.assertTrue(hits[0]["recent"])
        revised = {"port1": [[d, 50] for d, v in self.rows()]}
        updated, newkeys = signals.discover(revised, catalog, [], keys, "2026-04-10")
        hit = next(h for h in updated if h["id"] == ident)
        self.assertFalse(hit["qualifies"])
        self.assertFalse(hit["recent"])
        self.assertEqual(hit["percent"], 0)
        self.assertEqual(keys, newkeys)


if __name__ == "__main__":
    unittest.main()
