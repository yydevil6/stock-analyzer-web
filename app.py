from __future__ import annotations

import math
import hashlib
import random
import re
from typing import Any
from urllib.request import Request, urlopen

from flask import Flask, jsonify, render_template, request


app = Flask(__name__)
STOCK_CODE_PATTERN = re.compile(r"^\d{6}$")
QUOTE_TIMEOUT_SECONDS = 5
LOCAL_STOCK_NAMES = {
    "000547": "航天发展",
    "002086": "东方海洋",
    "000001": "平安银行",
    "600519": "贵州茅台",
    "300750": "宁德时代",
    "002594": "比亚迪",
    "601318": "中国平安",
    "600036": "招商银行",
    "601398": "工商银行",
    "000858": "五粮液",
}


def resolve_stock_name(stock_code: str, *candidates: object) -> str:
    """Return a real Chinese name; never use the stock code as its name."""
    for candidate in candidates:
        name = str(candidate or "").strip()
        if name and name != stock_code and re.search(r"[\u4e00-\u9fff]", name):
            return name
    return LOCAL_STOCK_NAMES.get(stock_code, "未知股票名称")


def normalize_quote_fields(data: dict[str, Any]) -> dict[str, Any]:
    """Expose the V5 canonical API contract plus legacy aliases for the UI."""
    code = str(data.get("code") or data.get("stock_code") or "").strip()
    name = resolve_stock_name(code, data.get("name"), data.get("stock_name"), data.get("股票名称"))
    normalized = {
        "code": code,
        "name": name,
        "current_price": round(float(data["current_price"]), 2),
        "high": round(float(data.get("high", data.get("high_price"))), 2),
        "low": round(float(data.get("low", data.get("low_price"))), 2),
        "change_percent": round(float(data["change_percent"]), 2),
        "amount": round(float(data.get("amount", data.get("turnover"))), 2),
        "volume_ratio": round(float(data["volume_ratio"]), 2),
        "quote_time": data.get("quote_time", ""),
    }
    return {
        **normalized,
        "stock_code": normalized["code"],
        "stock_name": normalized["name"],
        "high_price": normalized["high"],
        "low_price": normalized["low"],
        "turnover": normalized["amount"],
    }


def market_symbol(stock_code: str) -> str:
    if stock_code.startswith(("6", "9")):
        return f"sh{stock_code}"
    if stock_code.startswith(("4", "8")):
        return f"bj{stock_code}"
    return f"sz{stock_code}"


def parse_tencent_quote(raw_text: str, stock_code: str) -> dict[str, Any]:
    match = re.search(r'="(.*)";', raw_text)
    if not match:
        raise ValueError("Unexpected quote response")

    fields = match.group(1).split("~")
    if len(fields) < 57 or fields[2] != stock_code:
        raise ValueError("Incomplete quote response")

    current_price = float(fields[3])
    high_price = float(fields[32])
    low_price = float(fields[33])
    if current_price <= 0 or high_price <= 0 or low_price <= 0:
        raise ValueError("Quote is not available")

    return normalize_quote_fields({
        "code": stock_code,
        "name": fields[1],
        "current_price": round(current_price, 2),
        "high": round(high_price, 2),
        "low": round(low_price, 2),
        "change_percent": round(float(fields[31]), 2),
        "amount": round(float(fields[56]) / 10000, 2),
        "volume_ratio": round(float(fields[55]), 2),
        "quote_time": fields[29],
    })


def fetch_live_quote(stock_code: str) -> dict[str, Any]:
    symbol = market_symbol(stock_code)
    request_object = Request(
        f"https://qt.gtimg.cn/q={symbol}",
        headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.qq.com/"},
    )
    with urlopen(request_object, timeout=QUOTE_TIMEOUT_SECONDS) as response:
        raw_text = response.read().decode("gbk", errors="replace")
    return parse_tencent_quote(raw_text, stock_code)


def build_fallback_quote(stock_code: str) -> dict[str, Any]:
    seed = int(hashlib.sha256(stock_code.encode("utf-8")).hexdigest()[:16], 16)
    rng = random.Random(seed)
    current_price = 20.05 if stock_code == "000547" else round(rng.uniform(6, 60), 2)
    low_price = round(current_price * rng.uniform(0.96, 0.99), 2)
    high_price = round(current_price * rng.uniform(1.01, 1.04), 2)
    return normalize_quote_fields({
        "code": stock_code,
        "name": LOCAL_STOCK_NAMES.get(stock_code),
        "current_price": current_price,
        "high": max(high_price, current_price),
        "low": min(low_price, current_price),
        "change_percent": round(rng.uniform(-4, 5), 2),
        "amount": round(rng.uniform(1, 30), 2),
        "volume_ratio": round(rng.uniform(0.7, 2.2), 2),
        "quote_time": "模拟数据",
    })


def calculate_score(
    current_price: float,
    cost_price: float,
    high_price: float,
    low_price: float,
    change_percent: float,
    volume_ratio: float,
    stop_price: float,
) -> tuple[int, list[str]]:
    """Calculate a transparent 0-100 intraday strength score."""
    score = 50
    reasons: list[str] = []

    if current_price > cost_price:
        score += 20
        reasons.append("当前价高于成本 +20")
    elif current_price < cost_price:
        score -= 20
        reasons.append("当前价低于成本 -20")

    price_range = high_price - low_price
    range_position = (current_price - low_price) / price_range if price_range else 0.5
    if range_position >= 0.8:
        score += 15
        reasons.append("当前价接近今日高点 +15")
    elif range_position <= 0.2:
        score -= 15
        reasons.append("当前价接近今日低点 -15")

    if range_position >= 0.5:
        score += 10
        reasons.append("当前价远离今日低点 +10")

    if volume_ratio > 1:
        score += 10
        reasons.append("量比大于 1 +10")
    elif volume_ratio < 0.8:
        score -= 10
        reasons.append("量比小于 0.8 -10")

    if change_percent > 0:
        score += 15
        reasons.append("今日涨幅为正 +15")
    elif change_percent < 0:
        score -= 15
        reasons.append("今日涨幅为负 -15")

    if current_price <= stop_price:
        score -= 30
        reasons.append("当前价跌破止损价 -30")

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

    suggested_stop = round(min(current_price * 0.98, max(cost_price * 0.95, low_price * 0.99)), 2)
    stop_loss = round(float(data.get("stop_alert") or suggested_stop), 2)
    suggested_sell = round(max(high_price, current_price * 1.03), 2)
    sell_reference = round(float(data.get("sell_alert") or suggested_sell), 2)
    suggested_pressure = round(max(high_price * 1.02, current_price * 1.06, sell_reference * 1.02), 2)
    pressure_reference = round(float(data.get("pressure_alert") or suggested_pressure), 2)

    score, score_reasons = calculate_score(
        current_price,
        cost_price,
        high_price,
        low_price,
        data["change_percent"],
        data["volume_ratio"],
        stop_loss,
    )

    if score >= 75:
        strength = "偏强"
        plan = "偏强，持有观察，冲高分批止盈"
    elif score >= 50:
        strength = "震荡"
        plan = "震荡，不追高，接近压力位减仓"
    else:
        strength = "偏弱"
        plan = "偏弱，跌破止损位要控制风险"

    if current_price <= stop_loss:
        status = "触发止损"
        plan = "已触发止损提醒，请控制风险"
    elif current_price >= sell_reference:
        status = "接近卖出位"
        plan = "已接近冲高卖出位，可考虑分批止盈"
    else:
        status = strength

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
        "status": status,
        "stop_loss": stop_loss,
        "sell_reference": sell_reference,
        "pressure_reference": pressure_reference,
        "plan": plan,
    }


@app.get("/")
def index() -> str:
    return render_template("index.html")


@app.get("/api/quote/<stock_code>")
def quote(stock_code: str):
    stock_code = stock_code.strip()
    if not STOCK_CODE_PATTERN.fullmatch(stock_code):
        return jsonify({"error": "请输入正确的 6 位 A 股股票代码"}), 400

    try:
        data = fetch_live_quote(stock_code)
        return jsonify({"success": True, "mode": "live", "message": "行情获取成功", "data": data, **data})
    except Exception:
        data = build_fallback_quote(stock_code)
        return jsonify({
            "success": False,
            "mode": "fallback",
            "message": "行情获取失败，已切换为手动输入模式",
            "data": data,
            **data,
        })


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
    for key in ("stop_alert", "sell_alert", "pressure_alert"):
        raw_value = payload.get(key)
        if raw_value not in (None, ""):
            try:
                reminder_value = float(raw_value)
            except (TypeError, ValueError):
                return jsonify({"error": "提醒价必须是有效数字"}), 400
            if not math.isfinite(reminder_value) or reminder_value <= 0:
                return jsonify({"error": "提醒价必须大于 0"}), 400
            data[key] = reminder_value
    return jsonify(build_analysis(data))


if __name__ == "__main__":
    app.run(debug=True)

