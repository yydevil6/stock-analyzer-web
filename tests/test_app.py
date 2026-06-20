import json
import unittest
from unittest.mock import patch

import app as stock_app


class QuoteAccuracyTests(unittest.TestCase):
    def setUp(self):
        self.client = stock_app.app.test_client()

    def test_tencent_field_positions(self):
        fields = [""] * 50
        fields[1] = "金浦钛业"
        fields[2] = "000545"
        fields[3] = "3.96"
        fields[30] = "20260620150000"
        fields[32] = "2.59"
        fields[33] = "4.08"
        fields[34] = "3.82"
        fields[37] = "123456.78"
        fields[49] = "1.23"

        quote = stock_app.parse_tencent_quote(f'v_sz000545="{"~".join(fields)}";', "000545")
        self.assertEqual(quote["name"], "金浦钛业")
        self.assertEqual(quote["current_price"], 3.96)
        self.assertEqual(quote["high"], 4.08)
        self.assertEqual(quote["low"], 3.82)
        self.assertEqual(quote["change_percent"], 2.59)
        self.assertEqual(quote["amount"], 12.35)
        self.assertEqual(quote["volume_ratio"], 1.23)

    def test_eastmoney_field_scaling(self):
        raw = json.dumps({"data": {
            "f57": "000545", "f58": "金浦钛业", "f43": 396,
            "f44": 408, "f45": 382, "f170": 259,
            "f48": 1234567800, "f50": 123,
        }})
        quote = stock_app.parse_eastmoney_quote(raw, "000545")
        self.assertEqual(quote["current_price"], 3.96)
        self.assertEqual(quote["amount"], 12.35)
        self.assertEqual(quote["volume_ratio"], 1.23)

    @patch("app.fetch_live_quote", side_effect=RuntimeError("offline"))
    def test_failed_quote_returns_manual_mode_without_prices(self, _fetch):
        result = self.client.get("/api/quote/000545").get_json()
        self.assertFalse(result["success"])
        self.assertEqual(result["mode"], "manual")
        self.assertEqual(result["name"], "金浦钛业")
        self.assertEqual(result["message"], "真实行情获取失败，请手动输入行情数据。")
        for field in ("current_price", "high", "low", "change_percent", "amount", "volume_ratio"):
            self.assertNotIn(field, result)
            self.assertNotIn(field, result["data"])

    @patch("app.fetch_live_quote", side_effect=RuntimeError("offline"))
    def test_existing_name_fallback_is_preserved(self, _fetch):
        result = self.client.get("/api/quote/000547").get_json()
        self.assertEqual(result["name"], "航天发展")

    def test_manual_analysis_still_works(self):
        response = self.client.post("/api/analyze", json={
            "stock_code": "000545", "stock_name": "金浦钛业",
            "current_price": 3.96, "high_price": 4.08, "low_price": 3.82,
            "change_percent": 2.59, "turnover": 12.35, "volume_ratio": 1.23,
            "cost_price": 3.80, "shares": 1000,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["market_value"], 3960.0)


if __name__ == "__main__":
    unittest.main()

