from __future__ import annotations

import math
import re
from typing import Any

from flask import Flask, jsonify, render_template, request


app = Flask(__name__)
STOCK_CODE_PATTERN = re.compile(r"^\d{6}$")


def calculate_score(
    current_price: float,
    cost_price: float,
    high_price: float,
    low_price: float,
    change_percent: float,
    volume_ratio: float,
) -> tuple[int, list[str]]:
    """Calculate a transparent 0-100 intraday strength score."""
    score = 50
    reasons: list[str] = []

    if current_price > cost_price:
        score += 15
        reasons.append("当前价高于成本 +15")
    elif current_price < cost_price:
        score -= 15
        reasons.append("当前价跌破成本 -15")

    price_range = high_price - low_price
    range_position = (current_price - low_price) / price_range if price_range else 0.5
    if range_position >= 0.8:
        score += 20
        reasons.append("当前价接近今日高点 +20")
    elif range_position <= 0.2:
        score -= 20
        reasons.append("当前价接近今日低点 -20")

    if volume_ratio > 1:
        score += 15
        reasons.append("量比大于 1 +15")

    if change_percent > 0:
        score += 15
        reasons.append("今日涨幅为正 +15")
    elif change_percent < 0:
        score -= 15
        reasons.append("今日涨幅为负 -15")

    return max(0, min(100, score)), reasons


def build_analysis(data: dict[str, Any]) -> dict[str, Any]:
    current_price = data["current_price"]
    cost_price = data["cost_price"]
    high_price = data["high_price"]
    low_price = data["low_price"]
    shares = data["shares"]

    market_value = round(current_price * shares, 2)
    profit_loss = round((current_price - cost_price) * shares, 2)
    profit_loss_ratio = round((current_price - cost_price) / cost_price * 100, 2)
    cost_gap = round(current_price - cost_price, 2)
    cost_gap_ratio = round(cost_gap / cost_price * 100, 2)
    high_gap = round(high_price - current_price, 2)
    high_gap_ratio = round(high_gap / high_price * 100, 2)
    low_gap = round(current_price - low_price, 2)
    low_gap_ratio = round(low_gap / low_price * 100, 2)

    score, score_reasons = calculate_score(
        current_price,
        cost_price,
        high_price,
        low_price,
        data["change_percent"],
        data["volume_ratio"],
    )

    if score >= 70:
        strength = "偏强"
        plan = "可以持有观察，冲高分批卖。接近卖出参考位时关注量能，避免追高加仓。"
    elif score >= 40:
        strength = "震荡"
        plan = "不追高，接近压力位减仓。若量能无法持续放大，优先保护已有利润。"
    else:
        strength = "偏弱"
        plan = "跌破止损位要控制风险。不盲目补仓，等待价格重新站稳后再观察。"

    stop_loss = round(min(current_price * 0.98, max(cost_price * 0.95, low_price * 0.99)), 2)
    sell_reference = round(max(high_price, current_price * 1.03), 2)

    return {
        **data,
        "market_value": market_value,
        "profit_loss": profit_loss,
        "profit_loss_ratio": profit_loss_ratio,
        "cost_gap": cost_gap,
        "cost_gap_ratio": cost_gap_ratio,
        "high_gap": high_gap,
        "high_gap_ratio": high_gap_ratio,
        "low_gap": low_gap,
        "low_gap_ratio": low_gap_ratio,
        "score": score,
        "score_reasons": score_reasons,
        "strength": strength,
        "stop_loss": stop_loss,
        "sell_reference": sell_reference,
        "plan": plan,
    }


@app.get("/")
def index() -> str:
    return render_template("index.html")


@app.post("/api/analyze")
def analyze():
    payload = request.get_json(silent=True) or {}
    stock_code = str(payload.get("stock_code", "")).strip()
    stock_name = str(payload.get("stock_name", "")).strip()

    if not STOCK_CODE_PATTERN.fullmatch(stock_code):
        return jsonify({"error": "请输入正确的 6 位 A 股股票代码"}), 400
    if not stock_name or len(stock_name) > 20:
        return jsonify({"error": "请输入 1–20 个字符的股票名称"}), 400

    number_fields = {
        "current_price": "当前价",
        "high_price": "今日最高价",
        "low_price": "今日最低价",
        "change_percent": "今日涨跌幅",
        "turnover": "成交额",
        "volume_ratio": "量比",
        "cost_price": "买入成本价",
        "shares": "持仓股数",
    }
    values: dict[str, float] = {}
    try:
        for key in number_fields:
            value = float(payload.get(key, ""))
            if not math.isfinite(value):
                raise ValueError
            values[key] = value
    except (TypeError, ValueError):
        return jsonify({"error": "请完整填写所有行情与持仓数字"}), 400

    positive_fields = ("current_price", "high_price", "low_price", "cost_price", "shares")
    if any(values[key] <= 0 for key in positive_fields):
        return jsonify({"error": "价格、成本和持仓股数必须大于 0"}), 400
    if values["turnover"] < 0 or values["volume_ratio"] < 0:
        return jsonify({"error": "成交额和量比不能小于 0"}), 400
    if not values["shares"].is_integer():
        return jsonify({"error": "持仓股数必须是整数"}), 400
    if values["high_price"] < values["low_price"]:
        return jsonify({"error": "今日最高价不能低于今日最低价"}), 400
    if not values["low_price"] <= values["current_price"] <= values["high_price"]:
        return jsonify({"error": "当前价应位于今日最低价和最高价之间"}), 400

    data: dict[str, Any] = {
        "stock_code": stock_code,
        "stock_name": stock_name,
        **values,
        "shares": int(values["shares"]),
    }
    return jsonify(build_analysis(data))


if __name__ == "__main__":
    app.run(debug=True)
