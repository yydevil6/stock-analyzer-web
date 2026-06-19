const form = document.querySelector("#analysis-form");
const report = document.querySelector("#report");
const button = document.querySelector("#analyze-button");
const errorMessage = document.querySelector("#error-message");
const saveMessage = document.querySelector("#save-message");
const quoteMessage = document.querySelector("#quote-message");
const saveButton = document.querySelector("#save-button");
const fetchQuoteButton = document.querySelector("#fetch-quote-button");
const stockCodeInput = document.querySelector("#stock-code");
const byId = (id) => document.getElementById(id);
const STORAGE_KEY = "stock-lens-watchlist-v1";
let watchlist = loadWatchlist();

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
    quoteMessage.textContent = "";
    quoteMessage.className = "";
});
form.addEventListener("input", () => { errorMessage.textContent = ""; });
form.addEventListener("input", () => { saveMessage.textContent = ""; });

saveButton.addEventListener("click", saveCurrentStock);
fetchQuoteButton.addEventListener("click", fetchQuote);
byId("watchlist-body").addEventListener("click", handleWatchlistAction);
renderWatchlist();

async function fetchQuote() {
    const stockCode = stockCodeInput.value.trim();
    if (!/^\d{6}$/.test(stockCode)) {
        errorMessage.textContent = "请先输入正确的 6 位 A 股股票代码";
        stockCodeInput.focus();
        return;
    }

    quoteMessage.className = "";
    quoteMessage.textContent = "正在获取行情…";
    setQuoteLoading(true);
    try {
        const response = await fetch(`/api/quote/${stockCode}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "行情获取失败");
        fillQuoteData(result.data);
        quoteMessage.textContent = result.message;
        quoteMessage.className = result.success ? "quote-success" : "quote-warning";
    } catch {
        quoteMessage.textContent = "行情获取失败，已切换为手动输入模式";
        quoteMessage.className = "quote-warning";
    } finally {
        setQuoteLoading(false);
    }
}

function fillQuoteData(data) {
    const code = String(data.code ?? data.stock_code ?? stockCodeInput.value).trim();
    const nameCandidates = [data.name, data.stock_name, data["股票名称"]];
    const stockName = nameCandidates.find((value) => {
        const candidate = String(value ?? "").trim();
        return candidate && candidate !== code && /[\u4e00-\u9fff]/.test(candidate);
    }) || "未知股票名称";
    const fields = {
        stock_name: stockName,
        current_price: data.current_price,
        high_price: data.high ?? data.high_price,
        low_price: data.low ?? data.low_price,
        change_percent: data.change_percent,
        turnover: data.amount ?? data.turnover,
        volume_ratio: data.volume_ratio,
    };
    Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined && value !== null) byId(inputIds[key]).value = value;
    });
}

function setQuoteLoading(loading) {
    fetchQuoteButton.disabled = loading;
    fetchQuoteButton.classList.toggle("loading", loading);
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = getFormData();
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
        updateSavedAnalysis(data);
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

function getFormData() {
    return Object.fromEntries(
        Object.entries(inputIds).map(([key, id]) => [key, byId(id).value.trim()])
    );
}

function validateWatchlistFields(data) {
    if (!/^\d{6}$/.test(data.stock_code)) return "保存前请输入正确的 6 位股票代码";
    if (!data.stock_name) return "保存前请输入股票名称";
    if (!Number.isFinite(Number(data.cost_price)) || Number(data.cost_price) <= 0) return "保存前请输入大于 0 的成本价";
    if (!Number.isInteger(Number(data.shares)) || Number(data.shares) <= 0) return "保存前请输入大于 0 的整数持仓股数";
    return "";
}

function saveCurrentStock() {
    const data = getFormData();
    const message = validateWatchlistFields(data);
    if (message) {
        errorMessage.textContent = message;
        return;
    }

    const existing = watchlist.find((item) => item.stock_code === data.stock_code);
    const market = hasValidMarketData(data) ? pickMarketData(data) : existing?.market || null;
    const positionChanged = existing && (
        Number(existing.cost_price) !== Number(data.cost_price) || Number(existing.shares) !== Number(data.shares)
    );
    const item = {
        stock_code: data.stock_code,
        stock_name: data.stock_name,
        cost_price: Number(data.cost_price),
        shares: Number(data.shares),
        market,
        last_current_price: positionChanged ? null : existing?.last_current_price ?? null,
        last_profit_loss: positionChanged ? null : existing?.last_profit_loss ?? null,
    };

    watchlist = [item, ...watchlist.filter((stock) => stock.stock_code !== item.stock_code)];
    persistWatchlist();
    renderWatchlist();
    saveMessage.textContent = existing ? "自选股信息已更新" : "已保存到我的自选股";
}

function hasValidMarketData(data) {
    const keys = ["current_price", "high_price", "low_price", "change_percent", "turnover", "volume_ratio"];
    if (keys.some((key) => data[key] === "" || !Number.isFinite(Number(data[key])))) return false;
    const current = Number(data.current_price);
    const high = Number(data.high_price);
    const low = Number(data.low_price);
    return current > 0 && low > 0 && high >= low && current >= low && current <= high;
}

function pickMarketData(data) {
    return {
        current_price: Number(data.current_price),
        high_price: Number(data.high_price),
        low_price: Number(data.low_price),
        change_percent: Number(data.change_percent),
        turnover: Number(data.turnover),
        volume_ratio: Number(data.volume_ratio),
    };
}

function loadWatchlist() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(stored) ? stored : [];
    } catch {
        return [];
    }
}

function persistWatchlist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
}

function renderWatchlist() {
    const body = byId("watchlist-body");
    body.replaceChildren();
    byId("watchlist-count").textContent = `${watchlist.length} 只自选股`;
    byId("watchlist-empty").hidden = watchlist.length > 0;
    byId("watchlist-table-wrap").hidden = watchlist.length === 0;

    watchlist.forEach((item) => {
        const row = document.createElement("tr");
        appendCell(row, "股票", `${item.stock_code} · ${item.stock_name}`, "stock-cell");
        appendCell(row, "成本价", `${money(item.cost_price)} 元`);
        appendCell(row, "持仓股数", `${Number(item.shares).toLocaleString("zh-CN")} 股`);
        appendCell(row, "最近当前价", item.last_current_price == null ? "—" : `${money(item.last_current_price)} 元`);
        const profitClass = item.last_profit_loss == null ? "" : item.last_profit_loss >= 0 ? "positive" : "negative";
        appendCell(row, "最近浮动盈亏", item.last_profit_loss == null ? "—" : signed(item.last_profit_loss, " 元"), profitClass);

        const actionCell = document.createElement("td");
        actionCell.dataset.label = "操作";
        actionCell.className = "row-actions";
        actionCell.append(createActionButton("分析", "analyze", item.stock_code), createActionButton("删除", "delete", item.stock_code));
        row.append(actionCell);
        body.append(row);
    });
}

function appendCell(row, label, value, className = "") {
    const cell = document.createElement("td");
    cell.dataset.label = label;
    cell.textContent = value;
    if (className) cell.className = className;
    row.append(cell);
}

function createActionButton(text, action, code) {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = `table-button ${action === "delete" ? "delete-button" : ""}`;
    actionButton.dataset.action = action;
    actionButton.dataset.code = code;
    actionButton.textContent = text;
    return actionButton;
}

function handleWatchlistAction(event) {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) return;
    const item = watchlist.find((stock) => stock.stock_code === actionButton.dataset.code);
    if (!item) return;

    if (actionButton.dataset.action === "delete") {
        watchlist = watchlist.filter((stock) => stock.stock_code !== item.stock_code);
        persistWatchlist();
        renderWatchlist();
        saveMessage.textContent = `已删除 ${item.stock_name}`;
        return;
    }

    fillFromWatchlist(item);
    form.requestSubmit();
}

function fillFromWatchlist(item) {
    const fallbackPrice = Number(item.cost_price);
    const market = item.market || {
        current_price: fallbackPrice,
        high_price: fallbackPrice,
        low_price: fallbackPrice,
        change_percent: 0,
        turnover: 0,
        volume_ratio: 1,
    };
    const values = { ...market, stock_code: item.stock_code, stock_name: item.stock_name, cost_price: item.cost_price, shares: item.shares };
    Object.entries(inputIds).forEach(([key, id]) => { byId(id).value = values[key]; });
    saveMessage.textContent = `已载入 ${item.stock_name}，正在重新分析`;
}

function updateSavedAnalysis(data) {
    const index = watchlist.findIndex((item) => item.stock_code === data.stock_code);
    if (index < 0) return;
    watchlist[index] = {
        ...watchlist[index],
        stock_name: data.stock_name,
        cost_price: data.cost_price,
        shares: data.shares,
        market: pickMarketData(data),
        last_current_price: data.current_price,
        last_profit_loss: data.profit_loss,
    };
    persistWatchlist();
    renderWatchlist();
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
