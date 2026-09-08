import io
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("public_bounds", ROOT / "scripts/verify-public.py")
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


class PublicationBoundaryTests(unittest.TestCase):
    def test_response_cap_is_rejection_not_truncation(self):
        self.assertTrue(hasattr(verify, "read_html_response"))

        class Response(io.BytesIO):
            pass

        with patch.object(verify, "MAX_HTML_BYTES", 64):
            for body, length in [(b"valid", 5), (b"x" * 65, 65), (b"valid", 6)]:
                response = Response(body)
                response.headers = {"Content-Length": str(length)}
                if len(body) == length and length <= 64:
                    self.assertEqual(verify.read_html_response(response), body)
                else:
                    with self.assertRaises(ValueError):
                        verify.read_html_response(response)

    def test_attributes_and_policy_cannot_gain_side_effects(self):
        page = b"<html><body>Original</body></html>"
        policy = "default-src 'none'; script-src 'sha256-test'; script-src-attr 'none'"
        base = b'<script src="https://static.cloudflareinsights.com/beacon.min.js"%s></script>'
        for attributes in [
            b' onerror="handler()"',
            b' style="display:block"',
            b' type="text/plain"',
        ]:
            with self.assertRaises(ValueError):
                verify.verify_html(
                    page, page.replace(b"</body>", (base % attributes) + b"</body>"), policy, policy
                )
        for bad in [
            policy.replace("script-src-attr 'none'", "script-src-attr 'unsafe-inline'"),
            policy + "; script-src 'sha256-other'",
        ]:
            with self.assertRaises(ValueError):
                verify.verify_html(
                    page, page.replace(b"</body>", (base % b"") + b"</body>"), bad, bad
                )


if __name__ == "__main__":
    unittest.main()
