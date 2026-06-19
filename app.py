from __future__ import annotations

import hashlib
import random
import re
from typing import Any

from flask import Flask, jsonify, render_template, request


app = Flask(__name__)
STOCK_CODE_PATTERN = re.compile(r"^\d{6}$")


def build_mock_report(stock_code: str, cost_price: float, shares: int) -> dict[str, Any]:
    """Build a stable mock quote and calculate the user's position result."""
    seed = int(hashlib.sha256(stock_code.encode("utf-8")).hexdigest()[:16], 16)
    rng = random.Random(seed)

    current_price = 20.05 if stock_code == "000547" else round(rng.uniform(5, 80), 2)
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
    stop_loss = round(min(support * 0.97, cost_price * 0.95), 2)
    sell_reference = round(max(resistance, current_price * 1.06), 2)
    market_value = round(current_price * shares, 2)
    profit_loss = round((current_price - cost_price) * shares, 2)
    profit_loss_ratio = round((current_price - cost_price) / cost_price * 100, 2)

    if current_price <= stop_loss * 1.02:
        stop_loss_advice = f"价格已接近止损区域 {stop_loss:.2f} 元，建议严格控制风险。"
    else:
        stop_loss_advice = f"可将 {stop_loss:.2f} 元作为短线止损参考，跌破后谨慎持有。"

    if profit_loss_ratio >= 8:
        position_advice = "当前已有一定浮盈，可分批止盈并上移保护位，避免利润回吐。"
    elif profit_loss_ratio <= -5:
        position_advice = "持仓处于亏损区间，不建议盲目补仓，优先执行止损纪律。"
    elif trend == "偏强上行":
        position_advice = "短线结构偏强，可继续观察，冲高接近参考位时考虑分批减仓。"
    else:
        position_advice = "短线方向仍需确认，建议控制仓位，等待放量突破或企稳信号。"

    return {
        "stock_code": stock_code,
        "current_price": current_price,
        "cost_price": round(cost_price, 2),
        "shares": shares,
        "market_value": market_value,
        "profit_loss": profit_loss,
        "profit_loss_ratio": profit_loss_ratio,
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
        "stop_loss_advice": stop_loss_advice,
        "sell_reference": sell_reference,
        "advice": position_advice,
        "market_advice": advice,
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

    try:
        cost_price = float(payload.get("cost_price", 0))
        shares_value = float(payload.get("shares", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "买入成本和持仓股数必须是有效数字"}), 400

    if cost_price <= 0:
        return jsonify({"error": "买入成本必须大于 0"}), 400
    if shares_value <= 0 or not shares_value.is_integer():
        return jsonify({"error": "持仓股数必须是大于 0 的整数"}), 400

    return jsonify(build_mock_report(stock_code, cost_price, int(shares_value)))


if __name__ == "__main__":
    app.run(debug=True)
