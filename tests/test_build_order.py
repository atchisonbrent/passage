"""Protect the classic-script dependency and bootstrap boundary."""

import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("passage_build", ROOT / "scripts/build.py")
assert spec is not None and spec.loader is not None
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildOrderTests(unittest.TestCase):
    def test_helpers_and_views_precede_single_bootstrap(self):
        with patch.object(build, "signal_candidates", return_value=[]):
            bundles = build.script_bundles(ROOT / "src")
        self.assertEqual(len(bundles), 3)
        application = bundles[2]
        self.assertTrue(application.endswith("\nboot();"))
        self.assertEqual(application.count("\nboot();"), 1)
        for name in build.APP_HELPERS + build.APP_VIEWS:
            self.assertIn((ROOT / "src" / name).read_text(), application)
        self.assertLess(application.index("const comparison ="), application.index("\nboot();"))
        self.assertLess(
            application.index("function comparisonExport("), application.index("\nboot();")
        )
        self.assertEqual(
            len(set(build.APP_HELPERS + build.APP_VIEWS)), len(build.APP_HELPERS + build.APP_VIEWS)
        )
