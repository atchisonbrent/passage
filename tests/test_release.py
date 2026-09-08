import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "prepare", Path(__file__).resolve().parents[1] / "scripts/prepare-refresh.py"
)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ReleaseTest(unittest.TestCase):
    def test_release_only_downloads_published_baseline(self):
        with patch.object(m, "published_baseline") as baseline:
            m.prepare_code_data(Path("/unused"))
            baseline.assert_called_once_with(Path("/unused"))
