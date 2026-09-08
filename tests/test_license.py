import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("license_check", ROOT / "scripts/check-licenses.py")


class LicenseTests(unittest.TestCase):
    def test_terms_are_required_and_structured(self):
        check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(check)
        check.validate(ROOT)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaises(ValueError):
                check.validate(root)
            for name in [
                "LICENSE",
                "LICENSES.md",
                "public/data/LICENSE.txt",
                "tests/fixtures/LICENSE.txt",
            ]:
                p = root / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text("license")
            with self.assertRaises(ValueError):
                check.validate(root)


if __name__ == "__main__":
    unittest.main()
