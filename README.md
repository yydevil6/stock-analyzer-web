# 超短线自选股分析助手

一个基于 Python + Flask 的手动行情输入与自选股分析工具。盘中录入行情和持仓数据，即可生成持仓盈亏、超短线强弱评分与今日操作计划。

> 本项目只做手动数据分析，不连接券商、不自动交易、不自动下单，也不构成投资建议。

## 功能

- 手动输入股票代码、名称、当前价、日内高低价、涨跌幅、成交额与量比
- 输入买入成本与持仓股数，保留第二版持仓分析能力
- 自动计算当前市值、浮动盈亏金额和浮动盈亏比例
- 计算距离成本价、今日最高价与今日最低价的差距
- 生成 0–100 分超短线强弱评分、止损位、卖出参考位与今日计划
- 使用浏览器 `localStorage` 保存自选股，无需数据库或新增依赖
- 自选股支持刷新后保留、自动回填分析、更新最近价格和盈亏、删除
- 响应式页面，支持电脑和手机浏览

## 自选股保存

填写股票代码、股票名称、买入成本和持仓股数后，点击“保存到自选股”即可保存。若行情字段也已填写，会一并保存为最近的行情快照。点击列表中的“分析”会自动回填数据并执行分析；分析成功后，列表中的最近当前价和浮动盈亏会自动更新。

自选股数据只保存在当前浏览器的 `localStorage` 中，刷新页面仍会保留。清除浏览器网站数据后，自选股也会被清除。

## 超短线评分规则

评分以 50 分为基准：当前价高于成本、接近今日高点、量比大于 1、涨跌幅为正会加分；跌破成本、接近今日低点或涨跌幅为负会扣分，最终限制在 0–100 分。

- 70–100：偏强，可以持有观察，冲高分批卖
- 40–69：震荡，不追高，接近压力位减仓
- 0–39：偏弱，跌破止损位要控制风险

## 项目结构

```text
stock-analyzer-web/
├── app.py
├── requirements.txt
├── README.md
├── static/
│   ├── script.js
│   └── style.css
└── templates/
    └── index.html
```

## Windows 运行方法

### 1. 安装 Python

从 [Python 官网](https://www.python.org/downloads/) 安装 Python 3.10 或更高版本。安装时请勾选 **Add Python to PATH**。

### 2. 打开项目目录

在项目文件夹空白处按住 `Shift` 并点击鼠标右键，选择“在终端中打开”，或者在 PowerShell 中进入项目目录：

```powershell
cd stock-analyzer-web
```

### 3. 创建并启用虚拟环境

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

如果 PowerShell 阻止运行激活脚本，可先执行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### 4. 安装依赖

```powershell
python -m pip install -r requirements.txt
```

### 5. 启动项目

```powershell
python app.py
```

浏览器访问：<http://127.0.0.1:5000>

停止服务时，在终端按 `Ctrl + C`。

## API 示例

`POST /api/analyze`

```json
{
  "stock_code": "000547",
  "stock_name": "航天发展",
  "current_price": 20.05,
  "high_price": 20.60,
  "low_price": 19.20,
  "change_percent": 3.20,
  "turnover": 12.50,
  "volume_ratio": 1.35,
  "cost_price": 18.50,
  "shares": 1000
}
```

服务会返回 JSON 格式的自选股超短线分析报告。所有行情均由用户手动输入，系统不会请求行情接口或执行交易操作。
