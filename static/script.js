const form = document.querySelector("#analysis-form");
const input = document.querySelector("#stock-code");
const button = document.querySelector("#analyze-button");
const report = document.querySelector("#report");
const errorMessage = document.querySelector("#error-message");

const fields = {
    reportCode: document.querySelector("#report-code"),
    currentPrice: document.querySelector("#current-price"),
    changePercent: document.querySelector("#change-percent"),
    ma5: document.querySelector("#ma5"),
    ma10: document.querySelector("#ma10"),
    ma20: document.querySelector("#ma20"),
    turnover: document.querySelector("#turnover"),
    volumeRatio: document.querySelector("#volume-ratio"),
    trend: document.querySelector("#trend"),
    trendBadge: document.querySelector("#trend-badge"),
    support: document.querySelector("#support"),
    resistance: document.querySelector("#resistance"),
    stopLoss: document.querySelector("#stop-loss"),
    advice: document.querySelector("#advice"),
};

input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
    errorMessage.textContent = "";
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const stockCode = input.value.trim();

    if (!/^\d{6}$/.test(stockCode)) {
        errorMessage.textContent = "请输入正确的 6 位 A 股股票代码";
        input.focus();
        return;
    }

    setLoading(true);
    errorMessage.textContent = "";

    try {
        const response = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stock_code: stockCode }),
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

function setLoading(isLoading) {
    button.disabled = isLoading;
    button.classList.toggle("loading", isLoading);
}

function renderReport(data) {
    fields.reportCode.textContent = data.stock_code;
    fields.currentPrice.textContent = Number(data.current_price).toFixed(2);
    fields.changePercent.textContent = `${data.change_percent > 0 ? "+" : ""}${Number(data.change_percent).toFixed(2)}%`;
    fields.changePercent.className = `change ${data.change_percent >= 0 ? "up" : "down"}`;
    fields.ma5.textContent = Number(data.ma5).toFixed(2);
    fields.ma10.textContent = Number(data.ma10).toFixed(2);
    fields.ma20.textContent = Number(data.ma20).toFixed(2);
    fields.turnover.textContent = `${Number(data.turnover).toFixed(2)} 亿元`;
    fields.volumeRatio.textContent = Number(data.volume_ratio).toFixed(2);
    fields.trend.textContent = data.trend;
    fields.trendBadge.textContent = data.trend;
    fields.support.textContent = Number(data.support).toFixed(2);
    fields.resistance.textContent = Number(data.resistance).toFixed(2);
    fields.stopLoss.textContent = Number(data.stop_loss).toFixed(2);
    fields.advice.textContent = data.advice;
}
