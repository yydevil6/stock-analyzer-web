const form = document.querySelector("#analysis-form");
const report = document.querySelector("#report");
const analyzeButton = document.querySelector("#analyze-button");
const fetchQuoteButton = document.querySelector("#fetch-quote-button");
const saveButton = document.querySelector("#save-button");
const stockCodeInput = document.querySelector("#stock-code");
const errorMessage = document.querySelector("#error-message");
const quoteMessage = document.querySelector("#quote-message");
const saveMessage = document.querySelector("#save-message");
const byId = (id) => document.getElementById(id);

const WATCHLIST_KEY = "stock-lens-watchlist-v1";
const ALERTS_KEY = "stock-lens-alert-records-v1";
const LOCAL_NAMES = {
    "000547": "航天发展", "002086": "东方海洋", "000001": "平安银行", "600519": "贵州茅台", "300750": "宁德时代",
    "002594": "比亚迪", "601318": "中国平安", "600036": "招商银行", "601398": "工商银行", "000858": "五粮液",
    "000545": "金浦钛业",
};
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
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
const reminderIds = { stop: "stop-alert", sell: "sell-alert", pressure: "pressure-alert" };

let watchlist = loadWatchlist();
let alertRecords = loadAlertRecords();
let refreshTimer = null;
let isRefreshing = false;

stockCodeInput.addEventListener("input", () => {
    stockCodeInput.value = stockCodeInput.value.replace(/\D/g, "").slice(0, 6);
    quoteMessage.textContent = "";
    quoteMessage.className = "";
    setDataSource(false);
});
form.addEventListener("input", () => {
    errorMessage.textContent = "";
    saveMessage.textContent = "";
});
form.addEventListener("submit", analyzeCurrentForm);
fetchQuoteButton.addEventListener("click", fetchQuote);
saveButton.addEventListener("click", saveCurrentStock);
byId("watchlist-body").addEventListener("click", handleWatchlistAction);
byId("auto-refresh-button").addEventListener("click", toggleAutoRefresh);
byId("clear-alerts-button").addEventListener("click", clearAlertRecords);

renderWatchlist();
renderAlertRecords();

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
        const result = await requestQuote(stockCode);
        if (result.success === true && result.mode === "live") {
            fillQuoteData(result.data);
            quoteMessage.textContent = "行情获取成功";
            quoteMessage.className = "quote-success";
            setDataSource(true);
        } else {
            fillStockNameOnly(result.data, stockCode);
            quoteMessage.textContent = "真实行情获取失败，请手动输入行情数据。";
            quoteMessage.className = "quote-warning";
            setDataSource(false);
        }
    } catch {
        fillStockNameOnly({ name: LOCAL_NAMES[stockCode] }, stockCode);
        quoteMessage.textContent = "真实行情获取失败，请手动输入行情数据。";
        quoteMessage.className = "quote-warning";
        setDataSource(false);
    } finally {
        setQuoteLoading(false);
    }
}

async function requestQuote(stockCode) {
    const response = await fetch(`/api/quote/${stockCode}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "行情获取失败");
    return result;
}

function fillQuoteData(data) {
    const code = String(data.code ?? data.stock_code ?? stockCodeInput.value).trim();
    const candidates = [data.name, data.stock_name, data["股票名称"]];
    const name = candidates.find((value) => {
        const candidate = String(value ?? "").trim();
        return candidate && candidate !== code && /[\u4e00-\u9fff]/.test(candidate);
    }) || LOCAL_NAMES[code] || "未知股票名称";
    const fields = {
        stock_name: name,
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

function fillStockNameOnly(data, code) {
    const nameInput = byId(inputIds.stock_name);
    const currentName = nameInput.value.trim();
    const isPreviousAutomaticName = Object.values(LOCAL_NAMES).includes(currentName) || currentName === "未知股票名称";
    if (currentName && currentName !== code && !isPreviousAutomaticName) return;
    nameInput.value = safeStockName(code, data?.name || data?.stock_name);
}

function setDataSource(isLive) {
    const source = byId("data-source");
    source.textContent = isLive ? "数据来源：真实行情" : "数据来源：未获取到真实行情，请手动输入";
    source.className = `data-source ${isLive ? "data-source-live" : "data-source-manual"}`;
}

async function analyzeCurrentForm(event) {
    event.preventDefault();
    const payload = getFormData();
    const validationError = validate(payload);
    if (validationError) {
        errorMessage.textContent = validationError;
        return;
    }
    setAnalyzeLoading(true);
    try {
        const response = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "分析失败，请稍后重试");
        renderAnalysis(data);
        updateSavedAnalysis(data);
        report.hidden = false;
        report.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        errorMessage.textContent = error.message;
    } finally {
        setAnalyzeLoading(false);
    }
}

function getFormData() {
    return {
        ...Object.fromEntries(Object.entries(inputIds).map(([key, id]) => [key, byId(id).value.trim()])),
        stop_alert: byId(reminderIds.stop).value.trim(),
        sell_alert: byId(reminderIds.sell).value.trim(),
        pressure_alert: byId(reminderIds.pressure).value.trim(),
    };
}

function validate(data) {
    if (!/^\d{6}$/.test(data.stock_code)) return "请输入正确的 6 位股票代码";
    if (!data.stock_name) return "请输入股票名称";
    const numericKeys = Object.keys(inputIds).filter((key) => !["stock_code", "stock_name"].includes(key));
    if (numericKeys.some((key) => data[key] === "" || !Number.isFinite(Number(data[key])))) return "请完整填写所有行情与持仓数字";
    if (Number(data.high_price) < Number(data.low_price)) return "今日最高价不能低于今日最低价";
    if (Number(data.current_price) < Number(data.low_price) || Number(data.current_price) > Number(data.high_price)) return "当前价应位于今日最低价和最高价之间";
    if (!Number.isInteger(Number(data.shares)) || Number(data.shares) <= 0) return "持仓股数必须是大于 0 的整数";
    if ([data.stop_alert, data.sell_alert, data.pressure_alert].some((value) => value !== "" && (!Number.isFinite(Number(value)) || Number(value) <= 0))) return "提醒价必须是大于 0 的数字";
    return "";
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
    const current = Number(market?.current_price || existing?.last_current_price || data.cost_price);
    const reminders = {
        stop: positiveNumber(byId(reminderIds.stop).value) || existing?.reminders?.stop || roundPrice(Number(data.cost_price) * 0.95),
        sell: positiveNumber(byId(reminderIds.sell).value) || existing?.reminders?.sell || roundPrice(current * 1.03),
        pressure: positiveNumber(byId(reminderIds.pressure).value) || existing?.reminders?.pressure || roundPrice(current * 1.06),
    };
    const positionChanged = existing && (Number(existing.cost_price) !== Number(data.cost_price) || Number(existing.shares) !== Number(data.shares));
    const item = normalizeWatchlistItem({
        ...existing,
        stock_code: data.stock_code,
        stock_name: safeStockName(data.stock_code, data.stock_name),
        cost_price: Number(data.cost_price),
        shares: Number(data.shares),
        market,
        reminders,
        last_current_price: positionChanged ? null : existing?.last_current_price ?? null,
        last_profit_loss: positionChanged ? null : existing?.last_profit_loss ?? null,
        active_alerts: positionChanged ? [] : existing?.active_alerts || [],
    });
    watchlist = [item, ...watchlist.filter((stock) => stock.stock_code !== item.stock_code)];
    persistWatchlist();
    renderWatchlist();
    saveMessage.textContent = existing ? "自选股与提醒设置已更新" : "已保存到我的自选股";
}

function loadWatchlist() {
    try {
        const stored = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]");
        return Array.isArray(stored) ? stored.map(normalizeWatchlistItem) : [];
    } catch {
        return [];
    }
}

function normalizeWatchlistItem(raw) {
    const code = String(raw.stock_code || raw.code || "").trim();
    const cost = Number(raw.cost_price) || 0;
    const current = Number(raw.last_current_price || raw.market?.current_price || cost) || 0;
    return {
        ...raw,
        stock_code: code,
        stock_name: safeStockName(code, raw.stock_name || raw.name),
        cost_price: cost,
        shares: Number(raw.shares) || 0,
        market: raw.market || null,
        reminders: {
            stop: positiveNumber(raw.reminders?.stop) || roundPrice(cost * 0.95),
            sell: positiveNumber(raw.reminders?.sell) || roundPrice(current * 1.03),
            pressure: positiveNumber(raw.reminders?.pressure) || roundPrice(current * 1.06),
        },
        active_alerts: Array.isArray(raw.active_alerts) ? raw.active_alerts : [],
        last_alert_times: raw.last_alert_times && typeof raw.last_alert_times === "object" ? raw.last_alert_times : {},
        last_current_price: finiteOrNull(raw.last_current_price),
        last_change_percent: finiteOrNull(raw.last_change_percent ?? raw.market?.change_percent),
        last_market_value: finiteOrNull(raw.last_market_value),
        last_profit_loss: finiteOrNull(raw.last_profit_loss),
        last_profit_loss_ratio: finiteOrNull(raw.last_profit_loss_ratio),
        last_score: finiteOrNull(raw.last_score),
        last_strength: raw.last_strength || "待分析",
        last_plan: raw.last_plan || "点击分析或开启自动刷新后生成计划",
        last_updated: raw.last_updated || "",
    };
}

function persistWatchlist() {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
}

function renderWatchlist() {
    const container = byId("watchlist-body");
    container.replaceChildren();
    byId("watchlist-count").textContent = `${watchlist.length} 只自选股`;
    byId("watchlist-empty").hidden = watchlist.length > 0;
    container.hidden = watchlist.length === 0;
    watchlist.forEach((item) => container.append(createMonitorCard(item)));
}

function createMonitorCard(item) {
    const card = element("article", "monitor-card");
    const header = element("div", "monitor-card-header");
    const identity = element("div", "monitor-identity");
    identity.append(textElement("strong", safeStockName(item.stock_code, item.stock_name)), textElement("span", item.stock_code));
    const status = currentStatus(item);
    const statusPill = textElement("span", status, `status-pill status-${statusClass(status)}`);
    header.append(identity, statusPill);

    const metrics = element("div", "monitor-metrics");
    metrics.append(
        metric("当前价", formatOptionalMoney(item.last_current_price), trendClass(item.last_change_percent)),
        metric("涨跌幅", formatPercent(item.last_change_percent, true), trendClass(item.last_change_percent)),
        metric("买入成本", money(item.cost_price)),
        metric("持仓股数", `${Number(item.shares).toLocaleString("zh-CN")} 股`),
        metric("当前市值", formatOptionalMoney(item.last_market_value)),
        metric("浮动盈亏", formatSignedMoney(item.last_profit_loss), profitClass(item.last_profit_loss)),
        metric("盈亏比例", formatPercent(item.last_profit_loss_ratio, true), profitClass(item.last_profit_loss_ratio)),
        metric("超短线评分", item.last_score == null ? "—" : `${item.last_score} / 100`),
        metric("今日最高", formatOptionalMoney(item.market?.high_price)),
        metric("今日最低", formatOptionalMoney(item.market?.low_price)),
        metric("成交额", item.market?.turnover == null ? "—" : `${money(item.market.turnover)} 亿元`),
        metric("量比", item.market?.volume_ratio == null ? "—" : money(item.market.volume_ratio))
    );

    const reminderRow = element("div", "reminder-levels");
    reminderRow.append(
        textElement("span", `止损 ${money(item.reminders.stop)}`),
        textElement("span", `冲高 ${money(item.reminders.sell)}`),
        textElement("span", `强压力 ${money(item.reminders.pressure)}`)
    );

    const notices = element("div", "active-notices");
    getTriggeredAlerts(item).forEach((trigger) => notices.append(textElement("p", trigger.content, `notice notice-${trigger.type}`)));

    const plan = element("div", "monitor-plan");
    plan.append(textElement("span", "今日操作计划"), textElement("p", effectivePlan(item)));

    const footer = element("div", "monitor-card-footer");
    footer.append(
        textElement("small", item.last_updated ? `更新于 ${item.last_updated}` : "尚未更新行情"),
        createActionButton("获取行情", "quote", item.stock_code),
        createActionButton("分析", "analyze", item.stock_code),
        createActionButton("编辑", "edit", item.stock_code),
        createActionButton("删除", "delete", item.stock_code)
    );
    card.append(header, metrics, reminderRow, notices, plan, footer);
    return card;
}

function metric(label, value, className = "") {
    const node = element("div", "monitor-metric");
    node.append(textElement("span", label), textElement("strong", value, className));
    return node;
}

function createActionButton(text, action, code) {
    const button = textElement("button", text, `table-button ${action === "delete" ? "delete-button" : ""}`);
    button.type = "button";
    button.dataset.action = action;
    button.dataset.code = code;
    return button;
}

async function handleWatchlistAction(event) {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) return;
    const item = watchlist.find((stock) => stock.stock_code === actionButton.dataset.code);
    if (!item) return;
    if (actionButton.dataset.action === "delete") {
        watchlist = watchlist.filter((stock) => stock.stock_code !== item.stock_code);
        persistWatchlist();
        renderWatchlist();
        saveMessage.textContent = `已删除 ${item.stock_name}`;
        if (!watchlist.length) stopAutoRefresh();
        return;
    }
    if (actionButton.dataset.action === "quote") {
        actionButton.disabled = true;
        actionButton.textContent = "获取中...";
        const success = await refreshSingleStock(item);
        if (!success) {
            actionButton.disabled = false;
            actionButton.textContent = "获取行情";
        }
        byId("refresh-message").textContent = success ? `${item.stock_name} 真实行情已更新` : "真实行情获取失败，请手动输入行情数据。";
        return;
    }
    fillFromWatchlist(item);
    document.querySelector(".input-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    if (actionButton.dataset.action === "analyze") form.requestSubmit();
    else saveMessage.textContent = `正在编辑 ${item.stock_name}，修改后请重新保存`;
}

function fillFromWatchlist(item) {
    const market = item.market || { current_price: "", high_price: "", low_price: "", change_percent: "", turnover: "", volume_ratio: "" };
    const values = { ...market, stock_code: item.stock_code, stock_name: item.stock_name, cost_price: item.cost_price, shares: item.shares };
    Object.entries(inputIds).forEach(([key, id]) => { byId(id).value = values[key]; });
    Object.entries(reminderIds).forEach(([key, id]) => { byId(id).value = item.reminders[key]; });
    saveMessage.textContent = `已载入 ${item.stock_name}，正在重新分析`;
}

function updateSavedAnalysis(data) {
    const index = watchlist.findIndex((item) => item.stock_code === data.stock_code);
    if (index < 0) return;
    applyAnalysisToItem(index, data);
    persistWatchlist();
    persistAlertRecords();
    renderWatchlist();
    renderAlertRecords();
}

function applyAnalysisToItem(index, data) {
    const item = watchlist[index];
    const updated = normalizeWatchlistItem({
        ...item,
        stock_name: safeStockName(data.stock_code, data.stock_name),
        cost_price: data.cost_price,
        shares: data.shares,
        market: pickMarketData(data),
        last_current_price: data.current_price,
        last_change_percent: data.change_percent,
        last_market_value: data.market_value,
        last_profit_loss: data.profit_loss,
        last_profit_loss_ratio: data.profit_loss_ratio,
        last_score: data.score,
        last_strength: data.strength,
        last_plan: planByScore(data.score),
        last_updated: timeLabel(new Date()),
    });
    processAlertTransitions(updated);
    watchlist[index] = updated;
}

function getTriggeredAlerts(item) {
    const price = Number(item.last_current_price);
    if (!Number.isFinite(price)) return [];
    const alerts = [];
    if (price <= item.reminders.stop) alerts.push({ type: "stop", label: "止损提醒", content: "已触发止损提醒，请控制风险" });
    if (price >= item.reminders.sell) alerts.push({ type: "sell", label: "冲高卖出提醒", content: "已接近冲高卖出位，可考虑分批止盈" });
    if (price >= item.reminders.pressure) alerts.push({ type: "pressure", label: "强压力提醒", content: "已触及强压力提醒位，注意回落风险" });
    return alerts;
}

function processAlertTransitions(item) {
    const previous = new Set(item.active_alerts || []);
    const triggered = getTriggeredAlerts(item);
    const now = Date.now();
    item.last_alert_times = item.last_alert_times || {};
    triggered.filter((alert) => {
        const lastTime = Number(item.last_alert_times[alert.type] || 0);
        return !previous.has(alert.type) && now - lastTime >= ALERT_COOLDOWN_MS;
    }).forEach((alert) => {
        item.last_alert_times[alert.type] = now;
        alertRecords.unshift({
            id: `${now}-${item.stock_code}-${alert.type}`,
            date: dateKey(new Date()),
            time: timeLabel(new Date()),
            stock_code: item.stock_code,
            stock_name: item.stock_name,
            current_price: item.last_current_price,
            type: alert.label,
            alert_type: alert.type,
            content: alert.content,
        });
    });
    item.active_alerts = triggered.map((alert) => alert.type);
    alertRecords = alertRecords.slice(0, 200);
}

function currentStatus(item) {
    const types = new Set(getTriggeredAlerts(item).map((alert) => alert.type));
    if (types.has("stop")) return "触发止损";
    if (types.has("sell") || types.has("pressure")) return "接近卖出位";
    return item.last_strength === "待分析" ? "待分析" : item.last_strength;
}

function effectivePlan(item) {
    const types = new Set(getTriggeredAlerts(item).map((alert) => alert.type));
    if (types.has("stop")) return "已触发止损提醒，请控制风险";
    if (types.has("sell")) return "已接近冲高卖出位，可考虑分批止盈";
    if (types.has("pressure")) return "已触及强压力提醒位，注意回落风险";
    return planByScore(item.last_score);
}

function planByScore(score) {
    if (score == null) return "点击分析或开启自动刷新后生成计划";
    if (score >= 75) return "偏强，持有观察，冲高分批止盈";
    if (score >= 50) return "震荡，不追高，接近压力位减仓";
    return "偏弱，跌破止损位要控制风险";
}

async function refreshSingleStock(item) {
    const index = watchlist.findIndex((stock) => stock.stock_code === item.stock_code);
    if (index < 0) return false;
    const success = await refreshStockAt(index);
    if (success) {
        const now = new Date();
        byId("last-update").textContent = `最后更新时间：${timeLabel(now)}`;
        persistWatchlist();
        persistAlertRecords();
        renderWatchlist();
        renderAlertRecords();
    }
    return success;
}

async function refreshStockAt(index) {
    const item = watchlist[index];
    try {
        const quoteResult = await requestQuote(item.stock_code);
        if (quoteResult.success !== true || quoteResult.mode !== "live") return false;
        const quote = quoteResult.data;
        const payload = {
            stock_code: item.stock_code,
            stock_name: safeStockName(item.stock_code, quote.name || quote.stock_name),
            current_price: quote.current_price,
            high_price: quote.high ?? quote.high_price,
            low_price: quote.low ?? quote.low_price,
            change_percent: quote.change_percent,
            turnover: quote.amount ?? quote.turnover,
            volume_ratio: quote.volume_ratio,
            cost_price: item.cost_price,
            shares: item.shares,
            stop_alert: item.reminders.stop,
            sell_alert: item.reminders.sell,
            pressure_alert: item.reminders.pressure,
        };
        const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const analysis = await response.json();
        if (!response.ok) return false;
        applyAnalysisToItem(index, analysis);
        return true;
    } catch {
        return false;
    }
}

function toggleAutoRefresh() {
    if (refreshTimer) {
        stopAutoRefresh();
        return;
    }
    if (!watchlist.length) {
        byId("refresh-message").textContent = "请先保存至少一只自选股";
        return;
    }
    const seconds = Number(byId("refresh-interval").value);
    refreshTimer = window.setInterval(refreshWatchlist, seconds * 1000);
    byId("auto-refresh-button").textContent = "停止自动刷新";
    byId("auto-refresh-button").classList.add("active");
    byId("refresh-interval").disabled = true;
    byId("auto-refresh-status").textContent = `自动刷新状态：已开启，每 ${seconds} 秒刷新`;
    byId("refresh-message").textContent = "";
    refreshWatchlist();
}

function stopAutoRefresh() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = null;
    byId("auto-refresh-button").textContent = "开启自动刷新";
    byId("auto-refresh-button").classList.remove("active");
    byId("refresh-interval").disabled = false;
    byId("auto-refresh-status").textContent = "自动刷新状态：已停止";
    byId("refresh-message").textContent = "";
}

async function refreshWatchlist() {
    if (isRefreshing || !watchlist.length) return;
    isRefreshing = true;
    byId("refresh-message").textContent = "正在刷新自选股行情…";
    let failures = 0;
    await Promise.all(watchlist.map(async (_item, index) => {
        if (!await refreshStockAt(index)) failures += 1;
    }));
    const now = new Date();
    byId("last-update").textContent = `最后更新时间：${timeLabel(now)}`;
    byId("refresh-message").textContent = failures ? "部分或全部股票未获取到真实行情，已保留原有数据" : "自选股真实行情已更新";
    persistWatchlist();
    persistAlertRecords();
    renderWatchlist();
    renderAlertRecords();
    isRefreshing = false;
}

function loadAlertRecords() {
    try {
        const records = JSON.parse(localStorage.getItem(ALERTS_KEY) || "[]");
        return Array.isArray(records) ? records : [];
    } catch {
        return [];
    }
}

function persistAlertRecords() {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alertRecords));
}

function renderAlertRecords() {
    const list = byId("alerts-list");
    const todayRecords = alertRecords.filter((record) => record.date === dateKey(new Date()));
    list.replaceChildren();
    byId("alerts-empty").hidden = todayRecords.length > 0;
    list.hidden = todayRecords.length === 0;
    todayRecords.forEach((record) => {
        const row = element("article", `alert-record alert-record-${record.alert_type || "pressure"}`);
        const info = element("div", "alert-record-info");
        info.append(textElement("time", record.time), textElement("strong", `${record.stock_code} · ${safeStockName(record.stock_code, record.stock_name)}`), textElement("span", `${money(record.current_price)} 元`));
        const content = element("div", "alert-record-content");
        content.append(textElement("span", record.type), textElement("p", record.content));
        row.append(info, content);
        list.append(row);
    });
}

function clearAlertRecords() {
    alertRecords = [];
    persistAlertRecords();
    renderAlertRecords();
}

function renderAnalysis(data) {
    const isProfit = data.profit_loss >= 0;
    byId("report-name").textContent = safeStockName(data.stock_code, data.stock_name);
    byId("report-code").textContent = data.stock_code;
    byId("score").textContent = data.score;
    byId("strength").textContent = data.status || data.strength;
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
    byId("pressure-reference").textContent = money(data.pressure_reference);
    byId("plan").textContent = data.plan;
    byId("detail-current").textContent = `${money(data.current_price)} 元`;
    byId("detail-cost").textContent = `${money(data.cost_price)} 元`;
    byId("detail-shares").textContent = `${Number(data.shares).toLocaleString("zh-CN")} 股`;
    byId("detail-change").textContent = signed(data.change_percent, "%");
    byId("detail-turnover").textContent = `${money(data.turnover)} 亿元`;
    byId("detail-volume").textContent = money(data.volume_ratio);
}

function hasValidMarketData(data) {
    const keys = ["current_price", "high_price", "low_price", "change_percent", "turnover", "volume_ratio"];
    if (keys.some((key) => data[key] === "" || !Number.isFinite(Number(data[key])))) return false;
    const current = Number(data.current_price), high = Number(data.high_price), low = Number(data.low_price);
    return current > 0 && low > 0 && high >= low && current >= low && current <= high;
}

function pickMarketData(data) {
    return {
        current_price: Number(data.current_price), high_price: Number(data.high_price), low_price: Number(data.low_price),
        change_percent: Number(data.change_percent), turnover: Number(data.turnover), volume_ratio: Number(data.volume_ratio),
    };
}

function safeStockName(code, name) {
    const candidate = String(name || "").trim();
    return candidate && candidate !== code && /[\u4e00-\u9fff]/.test(candidate) ? candidate : LOCAL_NAMES[code] || "未知股票名称";
}

function element(tag, className = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
}

function textElement(tag, text, className = "") {
    const node = element(tag, className);
    node.textContent = text;
    return node;
}

function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? roundPrice(number) : null;
}

function finiteOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function roundPrice(value) { return Math.round(Number(value) * 100) / 100; }
function money(value) { return Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function signed(value, suffix = "") { const number = Number(value); return `${number > 0 ? "+" : ""}${money(number)}${suffix}`; }
function formatOptionalMoney(value) { return value == null ? "—" : `${money(value)} 元`; }
function formatSignedMoney(value) { return value == null ? "—" : signed(value, " 元"); }
function formatPercent(value, withSign = false) { if (value == null) return "—"; const number = Number(value); return `${withSign && number > 0 ? "+" : ""}${money(number)}%`; }
function profitClass(value) { return value == null ? "" : Number(value) >= 0 ? "positive" : "negative"; }
function trendClass(value) { return value == null ? "" : Number(value) >= 0 ? "positive" : "negative"; }
function statusClass(status) { return ({ "偏强": "strong", "震荡": "flat", "偏弱": "weak", "触发止损": "stop", "接近卖出位": "sell" })[status] || "pending"; }
function timeLabel(date) { return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); }
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function setQuoteLoading(loading) {
    fetchQuoteButton.disabled = loading;
    fetchQuoteButton.classList.toggle("loading", loading);
    fetchQuoteButton.querySelector(".quote-button-text").textContent = loading ? "获取中..." : "获取行情";
}
function setAnalyzeLoading(loading) { analyzeButton.disabled = loading; analyzeButton.classList.toggle("loading", loading); }

