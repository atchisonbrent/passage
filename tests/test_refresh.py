import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RefreshTests(unittest.TestCase):
    def test_revision_and_rollover(self):
        path = ROOT / "scripts/refresh.py"
        self.assertTrue(path.exists(), "Missing deterministic refresher")
        spec = importlib.util.spec_from_file_location("refresh", path)
        assert spec is not None and spec.loader is not None
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        old = [
            ["port1", "2026-12-30", 10, 1, 2, 3, None, None, None],
            ["port1", "2026-12-31", 10, 1, 2, 3, None, None, None],
        ]
        fresh = [
            ["port1", "2026-12-31", 0, 0, 0, 0, None, None, None],
            ["port1", "2027-01-01", 12, 1, 2, 3, None, None, None],
        ]
        merged = mod.merge_rows(old, fresh, {"port1"}, "2026-12-31", "2027-01-01")
        self.assertEqual(merged, [old[0]] + fresh)
        self.assertEqual(
            mod.merge_rows(merged, fresh, {"port1"}, "2026-12-31", "2027-01-01"), merged
        )

    def test_rejects_incomplete_and_invalid_source(self):
        import sys

        sys.path.insert(0, str(ROOT / "scripts"))
        from refresh import merge_rows

        row = ["port1", "2027-01-01", 10, 1, 2, 3, None, None, None]
        for bad in [
            [],
            [row, row[:2] + [11] + row[3:]],
            [["port2"] + row[1:]],
            [row[:2] + [float("nan")] + row[3:]],
            [row[:2] + [-1] + row[3:]],
            [row[:1] + ["20270101"] + row[2:]],
            [row[:2] + [True] + row[3:]],
        ]:
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    merge_rows([row], bad, {"port1"}, "2027-01-01", "2027-01-01")
        # Byte-identical repeats (the source republished an observation under a
        # second ObjectId) collapse to one row; they do not count as coverage twice.
        self.assertEqual(
            merge_rows([row], [row, list(row)], {"port1"}, "2027-01-01", "2027-01-01"), [row]
        )
        with self.assertRaises(ValueError):
            merge_rows([row], [row, row], {"port1"}, "2027-01-01", "2027-01-02")
        with self.assertRaises(ValueError):
            merge_rows([row], [row], {"port1"}, "2027-01-01", "2027-01-02")
        with self.assertRaises(ValueError):
            merge_rows([row], [row], {"port1"}, "2027-01-01", "2026-12-31")

    def test_source_refresh_is_transactional_and_noop(self):
        import sys, tempfile, json

        sys.path.insert(0, str(ROOT / "scripts"))
        import refresh

        self.assertTrue(hasattr(refresh, "refresh"), "Missing acquisition transaction")
        row = ["port1", "2026-12-31", 10, 1, 2, 3, None, None, None]
        channel = ["chokepoint1", "2026-12-31", 10, 1, 2, 3, None, None, 100]
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            (data / "places.json").write_text(
                json.dumps(
                    [{"id": "port1", "kind": "port"}, {"id": "chokepoint1", "kind": "chokepoint"}]
                )
            )
            (data / "activity-2026-12.json").write_text(
                json.dumps([row, channel], separators=(",", ":"))
            )
            import hashlib

            manifest = {
                "start": "2026-12-31",
                "activity": [
                    {
                        "file": "activity-2026-12.json",
                        "rows": 2,
                        "sha256": hashlib.sha256(
                            (data / "activity-2026-12.json").read_bytes()
                        ).hexdigest(),
                    }
                ],
                "Daily_Ports_Data_latest": "2026-12-31",
                "Daily_Chokepoints_Data_latest": "2026-12-31",
                "rows": {},
                "sources": {},
                "network": {"vintage": "2019–2024"},
            }
            (data / "manifest.json").write_text(json.dumps(manifest))

            def source(service, start, end):
                return [row] if service == "Daily_Ports_Data" else [channel]

            before = {p.name: p.read_bytes() for p in data.iterdir()}
            result = refresh.refresh(
                data,
                source,
                {"Daily_Ports_Data": "2026-12-31", "Daily_Chokepoints_Data": "2026-12-31"},
                "2027-01-01",
            )
            self.assertFalse(result["changed"])
            self.assertEqual(before, {p.name: p.read_bytes() for p in data.iterdir()})

            def broken(service, start, end):
                return [row[:2] + [11] + row[3:]] if service == "Daily_Ports_Data" else []

            with self.assertRaises(ValueError):
                refresh.refresh(
                    data,
                    broken,
                    {"Daily_Ports_Data": "2026-12-31", "Daily_Chokepoints_Data": "2026-12-31"},
                    "2027-01-01",
                )
            self.assertEqual(before, {p.name: p.read_bytes() for p in data.iterdir()})

            def revised(service, start, end):
                return [row[:2] + [11] + row[3:]] if service == "Daily_Ports_Data" else [channel]

            self.assertTrue(
                refresh.refresh(
                    data,
                    revised,
                    {"Daily_Ports_Data": "2026-12-31", "Daily_Chokepoints_Data": "2026-12-31"},
                    "2027-01-01",
                )["changed"]
            )
            self.assertEqual(
                json.loads((data / "manifest.json").read_text())["network"], manifest["network"]
            )

    def test_candidate_path_guard(self):
        import tempfile, subprocess

        spec = importlib.util.spec_from_file_location(
            "prepare", ROOT / "scripts/prepare-refresh.py"
        )
        assert spec and spec.loader
        prepare = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(prepare)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            prepare.ROOT = root
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            (root / "public/data").mkdir(parents=True)
            (root / "public/data/activity-2027-01.json").write_text("[]")
            prepare.validate_changed_paths()
            (root / "unrelated.txt").write_text("private fixture")
            with self.assertRaises(ValueError):
                prepare.validate_changed_paths()
            self.assertEqual((root / "unrelated.txt").read_text(), "private fixture")
            (root / "unrelated.txt").unlink()
            (root / "public/data/manifest.json").symlink_to("/etc/hosts")
            with self.assertRaises(ValueError):
                prepare.validate_changed_paths()

    def test_ci_publication_is_primary_branch_only(self):
        workflow = (ROOT / ".github/workflows/refresh.yml").read_text()
        self.assertIn(
            "    if: vars.PASSAGE_REFRESH_ENABLED == 'true' && github.ref == 'refs/heads/main'\n",
            workflow,
        )

    def test_rejects_source_edit_during_pagination(self):
        import sys
        from unittest.mock import patch

        sys.path.insert(0, str(ROOT / "scripts"))
        import refresh
        from urllib.parse import urlparse, parse_qs

        stamps = iter([1, 2])

        def request(url):
            if not urlparse(url).path.endswith("/query"):
                return {"editingInfo": {"lastEditDate": next(stamps)}}
            params = parse_qs(urlparse(url).query)
            if "returnCountOnly" in params:
                return {"count": 1}
            return {
                "features": [
                    {
                        "attributes": {
                            "ObjectId": 1,
                            "portid": "port1",
                            "date": "2027-01-01",
                            "portcalls": 10,
                            "portcalls_tanker": 1,
                            "portcalls_container": 2,
                            "portcalls_dry_bulk": 3,
                            "import": None,
                            "export": None,
                        }
                    }
                ]
            }

        with patch.object(refresh, "request", side_effect=request):
            with self.assertRaises(ValueError):
                refresh.acquire("Daily_Ports_Data", "2027-01-01", "2027-01-01")

    def test_missing_revision_cannot_erase_known_coverage(self):
        import sys

        sys.path.insert(0, str(ROOT / "scripts"))
        from refresh import merge_rows

        old = [["port1", "2027-01-01", 10, 1, 2, 3, None, None, None]]
        missing = [["port1", "2027-01-01", None, 1, 2, 3, None, None, None]]
        with self.assertRaises(ValueError):
            merge_rows(old, missing, {"port1"}, "2027-01-01", "2027-01-01")

    def test_unknown_baseline_id_is_rejected_before_fetch(self):
        import sys, tempfile, json, hashlib

        sys.path.insert(0, str(ROOT / "scripts"))
        from refresh import refresh

        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            raw = json.dumps([["unknown", "2027-01-01", 1, 1, 1, 1, None, None, None]]).encode()
            (data / "activity-2027-01.json").write_bytes(raw)
            (data / "places.json").write_text(json.dumps([{"id": "port1", "kind": "port"}]))
            (data / "manifest.json").write_text(
                json.dumps(
                    {
                        "activity": [
                            {
                                "file": "activity-2027-01.json",
                                "sha256": hashlib.sha256(raw).hexdigest(),
                                "rows": 1,
                            }
                        ]
                    }
                )
            )

            def fetch(*args):
                raise AssertionError("Fetch must not run on invalid baseline")

            with self.assertRaisesRegex(ValueError, "Unknown baseline"):
                refresh(data, fetch, {}, "2027-01-01")

    def test_stale_source_stops_before_build_or_publish_receipt(self):
        import sys, tempfile, json
        from unittest.mock import patch

        spec = importlib.util.spec_from_file_location(
            "stale_prepare", ROOT / "scripts/prepare-refresh.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            module.ROOT = base / "checkout"
            module.ROOT.mkdir()
            out = base / "receipts"
            calls = []

            def command(args, **kwargs):
                calls.append(args)
                (out / "refresh.json").write_text(
                    json.dumps(
                        {
                            "changed": True,
                            "checked": "2027-02-01",
                            "windows": {"ports": {"end": "2027-01-01"}},
                        }
                    )
                )

            with (
                patch.object(sys, "argv", ["prepare-refresh.py", "--receipt-dir", str(out)]),
                patch.object(module.subprocess, "check_output", side_effect=[b"", "revision"]),
                patch.object(module.subprocess, "run", side_effect=command),
            ):
                with self.assertRaisesRegex(ValueError, "freshness"):
                    module.main()
            self.assertEqual(len(calls), 1)
            self.assertFalse((out / "candidate.json").exists())

    def test_stable_source_stamp_returns_actual_rows(self):
        import sys
        from unittest.mock import patch

        sys.path.insert(0, str(ROOT / "scripts"))
        import refresh as module

        fields = module.SERVICES["Daily_Ports_Data"]
        attrs = {
            "ObjectId": 1,
            "date": "2027-01-01",
            "portid": "port1",
            **{field: 10 if field == "portcalls" else 1 for field in fields if field},
        }
        urls = []

        def request(url):
            urls.append(url)
            if "/query?" not in url:
                return {"editingInfo": {"lastEditDate": 1000}}
            if "returnCountOnly" in url:
                return {"count": 1}
            return {"features": [{"attributes": attrs}]}

        with patch.object(module, "request", request):
            rows = module.acquire("Daily_Ports_Data", "2027-01-01", "2027-01-01")
        self.assertEqual(rows[0][:3], ["port1", "2027-01-01", 10])
        self.assertEqual(len(rows), 1)
        self.assertEqual(sum("/query?" not in url for url in urls), 2)


if __name__ == "__main__":
    unittest.main()
