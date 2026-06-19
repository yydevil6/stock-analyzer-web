const form = document.querySelector("#analysis-form");
const report = document.querySelector("#report");
const button = document.querySelector("#analyze-button");
const errorMessage = document.querySelector("#error-message");
const stockCodeInput = document.querySelector("#stock-code");
const byId = (id) => document.getElementById(id);

const inputIds = {
    stock_code: "stock-code",
    stock_name: "stock-name",
    current_price: "current-price",
    high_price: "high-price",
    low_price: "low-price",
    change_percent: "change-percent-input",
    turnover: "turnover-input",
    volume_ratio: "volume-ratio-input",
    cost_price: "cost-price",
    shares: "shares",
};

stockCodeInput.addEventListener("input", () => {
    stockCodeInput.value = stockCodeInput.value.replace(/\D/g, "").slice(0, 6);
});
form.addEventListener("input", () => { errorMessage.textContent = ""; });

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(
        Object.entries(inputIds).map(([key, id]) => [key, byId(id).value.trim()])
    );
    const validationError = validate(payload);
    if (validationError) {
        errorMessage.textContent = validationError;
        return;
    }

    setLoading(true);
    try {
        const response = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "分析失败，请稍后重试");
        render(data);
        report.hidden = false;
        report.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        errorMessage.textContent = error.message;
    } finally {
        setLoading(false);
    }
});

function validate(data) {
    if (!/^\d{6}$/.test(data.stock_code)) return "请输入正确的 6 位股票代码";
    if (!data.stock_name) return "请输入股票名称";
    const requiredNumbers = Object.keys(inputIds).filter((key) => !["stock_code", "stock_name"].includes(key));
    if (requiredNumbers.some((key) => data[key] === "" || !Number.isFinite(Number(data[key])))) return "请完整填写所有行情与持仓数字";
    if (Number(data.high_price) < Number(data.low_price)) return "今日最高价不能低于今日最低价";
    if (Number(data.current_price) < Number(data.low_price) || Number(data.current_price) > Number(data.high_price)) return "当前价应位于今日最低价和最高价之间";
    if (!Number.isInteger(Number(data.shares)) || Number(data.shares) <= 0) return "持仓股数必须是大于 0 的整数";
    return "";
}

function setLoading(loading) {
    button.disabled = loading;
    button.classList.toggle("loading", loading);
}

function money(value) {
    return Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signed(value, suffix = "") {
    const number = Number(value);
    return `${number > 0 ? "+" : ""}${money(number)}${suffix}`;
}

function render(data) {
    const isProfit = data.profit_loss >= 0;
    byId("report-name").textContent = data.stock_name;
    byId("report-code").textContent = data.stock_code;
    byId("score").textContent = data.score;
    byId("strength").textContent = data.strength;
    byId("score-reasons").textContent = data.score_reasons.join(" · ") || "暂无额外加减分项";
    byId("score-ring").style.setProperty("--score", `${data.score * 3.6}deg`);
    byId("profit-loss").textContent = signed(data.profit_loss, " 元");
    byId("profit-ratio").textContent = signed(data.profit_loss_ratio, "%");
    byId("profit-card").className = `profit-card ${isProfit ? "profit" : "loss"}`;
    byId("market-value").textContent = money(data.market_value);
    byId("cost-gap").textContent = signed(data.cost_gap, " 元");
    byId("cost-gap-ratio").textContent = signed(data.cost_gap_ratio, "%");
    byId("high-gap").textContent = `${money(data.high_gap)} 元`;
    byId("high-gap-ratio").textContent = `距高点 ${money(data.high_gap_ratio)}%`;
    byId("low-gap").textContent = `${money(data.low_gap)} 元`;
    byId("low-gap-ratio").textContent = `高于低点 ${money(data.low_gap_ratio)}%`;
    byId("stop-loss").textContent = money(data.stop_loss);
    byId("sell-reference").textContent = money(data.sell_reference);
    byId("plan").textContent = `${data.strength}：${data.plan}`;
    byId("detail-current").textContent = `${money(data.current_price)} 元`;
    byId("detail-cost").textContent = `${money(data.cost_price)} 元`;
    byId("detail-shares").textContent = `${Number(data.shares).toLocaleString("zh-CN")} 股`;
    byId("detail-change").textContent = signed(data.change_percent, "%");
    byId("detail-turnover").textContent = `${money(data.turnover)} 亿元`;
    byId("detail-volume").textContent = money(data.volume_ratio);
}
