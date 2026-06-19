# A 股短线分析助手

一个基于 Python + Flask 的网页版股票持仓分析工具。输入股票代码、买入成本和持仓股数，即可生成盈亏、风险与短线操作报告。

> 当前版本仅使用模拟数据，用于跑通产品流程和界面演示，不接入真实行情，也不构成投资建议。

## 功能

- 6 位 A 股股票代码、买入成本和持仓股数输入与前后端校验
- 自动计算当前市值、浮动盈亏金额和浮动盈亏比例
- 生成止损建议、冲高卖出参考位与短线操作建议
- 模拟当前价格、涨跌幅、MA5 / MA10 / MA20、成交额和量比
- 响应式页面，支持电脑和手机浏览
- 同一股票代码会生成稳定一致的模拟结果，便于测试
- 演示代码 `000547` 的模拟当前价固定为 `20.05` 元

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
  "cost_price": 18.50,
  "shares": 1000
}
```

服务会返回一份 JSON 格式的模拟持仓分析报告，其中 `000547` 的当前价格固定为 `20.05` 元，其他代码使用稳定的模拟行情。
