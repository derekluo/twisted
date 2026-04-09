# Twisted VM Browser Test - Anti-Scrape Analysis

## Target

`http://43.130.243.137:9090/` — 小红书 (XHS) 浏览器指纹检测系统

## Files

| File | Description |
|------|-------------|
| `artifacts/runtime.js` | 145KB 混淆 JS，208 个函数，VM 字节码解释器 |
| `scripts/js/string-decoder.js` | 字符串解码器 (Node.js)，解码 557 个加密字符串碎片 |
| `scripts/js/run-vm.js` | 完整 VM 运行器 (Node.js)，带浏览器环境模拟 |
| `scripts/js/hash-vm.js` | Hash 计算器，stdin 输入指纹 JSON → stdout 输出 hash |
| `scripts/python/xhs-fingerprint.py` | Python 指纹生成器，支持随机/自定义指纹 |
| `scripts/python/vercel-sign.py` | 纯 Python `X-Twisted-Sign` 签名生成器 |
| `docs/report.md` | 完整反爬机制分析报告 |
| `docs/comparison-vercel.md` | XHS 与 Vercel 版本对比 |
| `data/decoded_strings.json` | 解码后的字符串表 (索引 133-689) |
| `data/bytecode.json` | 284 条 VM 字节码指令 |

## Layout

```text
analysis/
  README.md
  artifacts/
    runtime.js
  data/
    bytecode.json
    decoded_strings.json
  docs/
    comparison-vercel.md
    report.md
  scripts/
    js/
      hash-vm.js
      run-vm.js
      string-decoder.js
    python/
      vercel-sign.py
      xhs-fingerprint.py
```

## Quick Start

```bash
# 随机生成指纹
python3 analysis/scripts/python/xhs-fingerprint.py

# JSON 输出
python3 analysis/scripts/python/xhs-fingerprint.py --json

# 自定义参数
python3 analysis/scripts/python/xhs-fingerprint.py --ua "Chrome/146" --platform MacIntel --lang zh-CN --hc 8 --tz Asia/Shanghai --canvas-hash abc123

# 批量生成 10 个
python3 analysis/scripts/python/xhs-fingerprint.py -n 10 --json --pretty

# 仅生成指纹数据，不计算 hash（不需要 Node.js）
python3 analysis/scripts/python/xhs-fingerprint.py --no-vm

# 解码字符串（输出到 data/decoded_strings.json）
node analysis/scripts/js/string-decoder.js

# 运行完整 VM（带网络请求拦截）
node analysis/scripts/js/run-vm.js

# 通过 stdin 计算 hash
echo '{"canvas":"ABC","tz":"Asia/Shanghai","hc":8,"platform":"MacIntel","lang":"zh-CN","ua":"Chrome/146"}' | node analysis/scripts/js/hash-vm.js
```

## Quick Summary

页面加载 runtime.js 后自动执行 `TwistedRuntime.run([window, console])`，采集浏览器指纹并上报至 `t2.xiaohongshu.com/api/v2/collect`。

核心防护：自定义 VM 执行 + 字符串加密碎片化 + Canvas/WebGL/Navigator 指纹采集 + XHS 登录态绑定 + picasso 图片指纹。

## 指纹数据格式

VM 返回 JSON：

```json
{
  "hash": "0x7e295584",
  "fingerprint": {
    "canvas": "data:image/png;base64,...",
    "tz": "Asia/Shanghai",
    "hc": 8,
    "platform": "MacIntel",
    "lang": "zh-CN",
    "ua": "Mozilla/5.0 ..."
  }
}
```

6 个指纹维度：

| 字段 | 说明 | 示例 |
|------|------|------|
| `canvas` | Canvas 2D 渲染指纹 (base64 或 hash) | `"data:image/png;base64,..."` |
| `tz` | 时区 | `"Asia/Shanghai"` |
| `hc` | CPU 核心数 (`navigator.hardwareConcurrency`) | `8` |
| `platform` | 平台 (`navigator.platform`) | `"MacIntel"` |
| `lang` | 语言 (`navigator.language`) | `"zh-CN"` |
| `ua` | User-Agent | `"Mozilla/5.0 ..."` |

## VM 逆向结果

| 项目 | 详情 |
|------|------|
| 字符串表 | 557 个条目，自定义 Base64 + 5 字符碎片化 |
| 旋转量 | 846190 % 557 = 107 |
| 字节码 | 284 条指令，14 个操作码 |
| 哈希 | 自定义算法（FNV-1a 常量），确定性 |
| 网络请求 | VM 不发送请求，上报由调用方完成 |

## 用途

这是**小红书 (XHS) 的客户端环境检测系统**，用于判断当前访问者是否为真实人类使用真实浏览器。

### 核心用途

1. **生成设备指纹 (ed-fp)** — 通过 Canvas、WebGL、Navigator、时区、picasso 图片渲染差异等多维数据，为每个浏览器生成唯一 ID
2. **反爬虫/反自动化** — 自定义 VM 必须在真实浏览器环境中执行，headless Chrome、Puppeteer、requests 等无法通过
3. **账号风控** — 指纹数据与 XHS 登录态（`a1`、`web_session`、`websectiga`）绑定，用于检测多账号、模拟登录、批量操作
4. **数据上报** — 将指纹采集结果发送到 `t2.xiaohongshu.com/api/v2/collect`，供服务端风控系统决策

### 实际场景

用户在小红书网页端操作时，该 VM 在后台静默运行，采集浏览器特征上报。如果指纹异常（自动化工具、模拟器、指纹被篡改），服务端触发风控：限流、弹验证码、封号等。

该测试页面（9090 端口）为开发/测试环境，用于单独调试 VM 指纹模块。

## Vercel 版本签名器

`scripts/python/vercel-sign.py` — 纯 Python 实现 `X-Twisted-Sign` 签名生成，无需浏览器或 Node.js。

```bash
# 生成签名
python3 analysis/scripts/python/vercel-sign.py

# JSON 输出
python3 analysis/scripts/python/vercel-sign.py --json

# 带签名发起请求
python3 analysis/scripts/python/vercel-sign.py --fetch https://httpbin.org/get

# 自定义参数
python3 analysis/scripts/python/vercel-sign.py --ua "Chrome/146" --platform Win32 --hc 16 --tz America/New_York
```

签名算法 (来自 `twisted/example/fingerprint.js` 源码):
```
payload = { fingerprint: {ua,lang,platform,hc,tz,canvas,webgl,gpu,plugins,fonts,net}, debugger, automation, hook }
signString = JSON.stringify(payload) + "|" + Date.now() + "|" + random(0,10000)
X-Twisted-Sign = SHA-256(signString)
```

## 依赖

- **Python 3.10+** — 指纹生成器、Vercel 签名器
- **Node.js 25+** — VM 运行器和字符串解码器（仅 XHS hash 计算需要）
