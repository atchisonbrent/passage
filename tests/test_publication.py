import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("public_check", ROOT / "scripts/verify-public.py")
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


class PublicationTests(unittest.TestCase):
    def test_cloudflare_appendages_are_narrow_and_inert(self):
        self.assertTrue(hasattr(verify, "verify_html"))
        page = b"<html><body>Content<script>app();</script>\n</body></html>"
        policy = "default-src 'none'; script-src 'sha256-test'; connect-src 'self'"
        valid = b'<script src="https://static.cloudflareinsights.com/beacon.min.js/v123"></script>\n<script>const path="/cdn-cgi/challenge-platform/scripts/jsd/main.js";</script>'
        append = lambda value: page.replace(b"</body>", value + b"</body>")
        verify.verify_html(page, page, policy, policy)
        verify.verify_html(page, append(valid), policy, policy)
        for actual, csp in [
            (page.replace(b"Content", b"Changed"), policy),
            (append(b'<img src="evil">'), policy),
            (append(b"<script>unrecognized();</script>"), policy),
            (append(b'<script src="https://evil.example/beacon.min.js"></script>'), policy),
            (append(valid), policy + "; script-src-elem 'unsafe-inline'"),
            (append(valid.replace(b"</script>", b'</script><a href="evil">bad</a>', 1)), policy),
        ]:
            with self.subTest(actual=actual), self.assertRaises(ValueError):
                verify.verify_html(page, actual, csp, policy)

    def test_additions_cannot_reuse_an_authorized_hash(self):
        import hashlib, base64

        body = b'const path="/cdn-cgi/challenge-platform/";'
        token = "sha256-" + base64.b64encode(hashlib.sha256(body).digest()).decode()
        policy = "default-src 'none'; script-src '" + token + "'"
        page = b"<html><body>Original</body></html>"
        for extra in [
            b"<script>" + body + b"</script>",
            (
                '<script src="https://static.cloudflareinsights.com/beacon.min.js" integrity="'
                + token
                + '"></script>'
            ).encode(),
        ]:
            with self.assertRaisesRegex(ValueError, "authorized"):
                verify.verify_html(
                    page, page.replace(b"</body>", extra + b"</body>"), policy, policy
                )


if __name__ == "__main__":
    unittest.main()
