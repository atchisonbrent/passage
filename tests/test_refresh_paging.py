"""Sparse-ID paging must not repeatedly scan growing offsets."""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit, parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import refresh


class PagingTests(unittest.TestCase):
    def source(self, broken=False):
        calls = []

        def request(url):
            if "/query?" not in url:
                return {"editingInfo": {"lastEditDate": 1}}
            q = parse_qs(urlsplit(url).query)
            if "returnCountOnly" in q:
                return {"count": 1002}
            self.assertNotIn("resultOffset", q, "Growing offsets caused the production timeout")
            where = q["where"][0]
            calls.append(where)
            ids = (
                range(1, 2001, 2) if len(calls) == 1 else ([1999, 2003] if broken else [2001, 2003])
            )
            if len(calls) > 1:
                self.assertIn("ObjectId > 1999", where)
            return {
                "features": [
                    {
                        "attributes": {
                            "ObjectId": i,
                            "date": "2026-08-28",
                            "portid": "port1",
                            **{f: 1 for f in refresh.SERVICES["Daily_Ports_Data"] if f},
                        }
                    }
                    for i in ids
                ]
            }

        return request, calls

    def test_sparse_ids_and_final_partial_page(self):
        request, calls = self.source()
        with patch.object(refresh, "request", request):
            rows = refresh.acquire("Daily_Ports_Data", "2026-05-31", "2026-08-28")
        self.assertEqual(len(rows), 1002)
        self.assertEqual(len(calls), 2)

    def test_nonadvancing_page_is_rejected(self):
        request, _ = self.source(broken=True)
        with patch.object(refresh, "request", request):
            with self.assertRaises(ValueError):
                refresh.acquire("Daily_Ports_Data", "2026-05-31", "2026-08-28")
