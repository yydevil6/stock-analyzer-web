from __future__ import annotations

import hashlib
import random
import re
from typing import Any

from flask import Flask, jsonify, render_template, request


app = Flask(__name__)
STOCK_CODE_PATTERN = re.compile(r"^\d{6}$")


def build_mock_report(stock_code: str) -> dict[str, Any]:
    """Build stable, realistic-looking mock data from a six-digit stock code."""
    seed = int(hashlib.sha256(stock_code.encode("utf-8")).hexdigest()[:16], 16)
    rng = random.Random(seed)

    current_price = round(rng.uniform(5, 80), 2)
    change_percent = round(rng.uniform(-6.5, 7.5), 2)
    ma5 = round(current_price * rng.uniform(0.975, 1.025), 2)
    ma10 = round(current_price * rng.uniform(0.96, 1.04), 2)
    ma20 = round(current_price * rng.uniform(0.94, 1.06), 2)
    turnover = round(rng.uniform(1.2, 38.0), 2)
    volume_ratio = round(rng.uniform(0.65, 2.8), 2)

    if current_price > ma5 > ma10 > ma20:
        trend = "偏强上行"
        advice = "短线趋势较强，可关注回踩 MA5 后的承接力度，避免追高。"
    elif current_price < ma5 < ma10 < ma20:
        trend = "偏弱下行"
        advice = "短线仍偏弱，建议耐心等待企稳信号，严格控制仓位。"
    else:
        trend = "震荡整理"
        advice = "均线方向尚未统一，适合观望或轻仓高抛低吸。"

    support = round(min(current_price, ma10, ma20) * 0.985, 2)
    resistance = round(max(current_price, ma5, ma10) * 1.025, 2)
    stop_loss = round(support * 0.97, 2)

    return {
        "stock_code": stock_code,
        "current_price": current_price,
        "change_percent": change_percent,
        "ma5": ma5,
        "ma10": ma10,
        "ma20": ma20,
        "turnover": turnover,
        "volume_ratio": volume_ratio,
        "trend": trend,
        "support": support,
        "resistance": resistance,
        "stop_loss": stop_loss,
        "advice": advice,
    }


@app.get("/")
def index() -> str:
    return render_template("index.html")


@app.post("/api/analyze")
def analyze():
    payload = request.get_json(silent=True) or {}
    stock_code = str(payload.get("stock_code", "")).strip()

    if not STOCK_CODE_PATTERN.fullmatch(stock_code):
        return jsonify({"error": "请输入正确的 6 位 A 股股票代码"}), 400

    return jsonify(build_mock_report(stock_code))


if __name__ == "__main__":
    app.run(debug=True)
