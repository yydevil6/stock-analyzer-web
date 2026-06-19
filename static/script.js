const form = document.querySelector("#analysis-form");
const stockInput = document.querySelector("#stock-code");
const costInput = document.querySelector("#cost-price");
const sharesInput = document.querySelector("#shares");
const button = document.querySelector("#analyze-button");
const report = document.querySelector("#report");
const errorMessage = document.querySelector("#error-message");

const byId = (id) => document.getElementById(id);
const money = (value) => Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

stockInput.addEventListener("input", () => {
    stockInput.value = stockInput.value.replace(/\D/g, "").slice(0, 6);
    errorMessage.textContent = "";
});

form.addEventListener("input", () => { errorMessage.textContent = ""; });

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const stockCode = stockInput.value.trim();
    const costPrice = Number(costInput.value);
    const shares = Number(sharesInput.value);

    const validationError = validateInputs(stockCode, costPrice, shares);
    if (validationError) {
        errorMessage.textContent = validationError;
        return;
    }

    setLoading(true);
    try {
        const response = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stock_code: stockCode, cost_price: costPrice, shares }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "分析失败，请稍后重试");

        renderReport(data);
        report.hidden = false;
        report.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        errorMessage.textContent = error.message;
    } finally {
        setLoading(false);
    }
});

function validateInputs(stockCode, costPrice, shares) {
    if (!/^\d{6}$/.test(stockCode)) return "请输入正确的 6 位 A 股股票代码";
    if (!Number.isFinite(costPrice) || costPrice <= 0) return "请输入大于 0 的买入成本价";
    if (!Number.isInteger(shares) || shares <= 0) return "持仓股数必须是大于 0 的整数";
    return "";
}

function setLoading(isLoading) {
    button.disabled = isLoading;
    button.classList.toggle("loading", isLoading);
}

function renderReport(data) {
    const isProfit = data.profit_loss >= 0;
    const sign = isProfit ? "+" : "";

    byId("report-code").textContent = data.stock_code;
    byId("trend-badge").textContent = data.trend;
    byId("current-price").textContent = money(data.current_price);
    byId("report-cost").textContent = money(data.cost_price);
    byId("report-shares").textContent = Number(data.shares).toLocaleString("zh-CN");
    byId("market-value").textContent = money(data.market_value);
    byId("profit-loss").textContent = `${sign}${money(data.profit_loss)} 元`;
    byId("profit-ratio").textContent = `${sign}${Number(data.profit_loss_ratio).toFixed(2)}%`;
    byId("profit-panel").className = `profit-panel ${isProfit ? "profit" : "loss"}`;
    byId("stop-loss").textContent = money(data.stop_loss);
    byId("stop-loss-advice").textContent = data.stop_loss_advice;
    byId("sell-reference").textContent = money(data.sell_reference);
    byId("advice").textContent = data.advice;
    byId("change-percent").textContent = `${data.change_percent > 0 ? "+" : ""}${Number(data.change_percent).toFixed(2)}%`;
    byId("ma5").textContent = money(data.ma5);
    byId("ma10").textContent = money(data.ma10);
    byId("ma20").textContent = money(data.ma20);
    byId("turnover").textContent = `${money(data.turnover)} 亿元`;
    byId("volume-ratio").textContent = Number(data.volume_ratio).toFixed(2);
}
