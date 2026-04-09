# Twisted VM 对比分析: XHS (9090) vs Vercel (twisted-brown.vercel.app)

## 概述

| 维度 | XHS (9090) | Vercel (twisted-brown) |
|------|-----------|----------------------|
| **URL** | `http://43.130.243.137:9090/` | `https://twisted-brown.vercel.app/` |
| **文件** | runtime.js (145KB) | runtime.js (411KB) |
| **MD5** | `a92cf412dde93eea9bf3e6f62e66dfed` | `6883dd59d8660414779f09f0b86410b0` |
| **函数数** | 208 | 539 |
| **行数** | 1 (单行压缩) | 1 (单行压缩) |
| **部署** | 自建服务器 (端口 9090) | Vercel CDN |
| **源码** | 未知 (已混淆) | **已知** — 本地 `twisted/` 仓库 |

## 结论: 同源 Twisted VM 编译框架

`twisted-brown.vercel.app` 是 **Twisted VM 开源框架** ([本地仓库](../../twisted/)) 的官方 Demo 部署。XHS (9090) 版本是同一框架的定制编译产物。

### 核心证据

1. **相同的 VM 架构** — 栈式字节码虚拟机，构造函数接收 `(config, data, [window, console])`
2. **相同的编译管线** — `fingerprint.js` → Babel AST → IR → 字节码 → runtime.js
3. **相同的入口模式** — `new VM(config, data, [window, console]).run()`
4. **Vercel 版本的源码已确认** — `twisted/example/fingerprint.js` 是 Vercel 部署的输入源码

## Twisted VM 框架架构

基于本地 `twisted/` 仓库源码分析:

### 编译管线 (3 阶段)

```
fingerprint.js (JS 源码)
    │
    ▼ [Babel Parser]
AST (抽象语法树)
    │
    ▼ [Compiler: src/compiler/compiler.ts]
IR 指令序列 (Instruction[])
    │
    ▼ [Obfuscator: src/obfuscator/]
混淆后的 IR
    │
    ▼ [Assembler: src/assembler/assembler.ts]
bytecode[] + meta[] (字符串/常量表)
    │
    ▼ [Builder: src/builder/runtime.ts]
runtime.js (IIFE + VM 解释器 + 字节码)
    │
    ▼ [javascript-obfuscator]
最终混淆产物
```

### VM 操作码 (42 个)

| 类别 | 操作码 |
|------|--------|
| **栈操作** | `Push(0x00)`, `Pop(0x01)`, `PushNull(0x26)` |
| **算术** | `Add(0x02)`, `Sub(0x03)`, `Mul(0x04)`, `Div(0x05)` |
| **位运算** | `BitOr(0x17)`, `BitXor(0x1e)`, `ShiftLeft(0x18)`, `ShiftRightUnsigned(0x19)` |
| **比较** | `Equal(0x06)`, `LessThan(0x1a)`, `GreaterThan(0x1b)`, `LessThanOrEqual(0x1d)`, `GreaterThanOrEqual(0x1c)` |
| **控制流** | `Jmp(0x07)`, `JmpIf(0x08)`, `Halt(0x10)`, `Debugger(0x27)` |
| **变量** | `Store(0x09)`, `Load(0x0a)`, `LoadParameter(0x13)` |
| **对象/数组** | `BuildArray(0x11)`, `BuildObject(0x12)`, `Property(0x0d)`, `SetProperty(0x1f)`, `GetElement(0x20)`, `SetElement(0x21)` |
| **函数** | `Apply(0x0b)`, `Construct(0x15)`, `InvokeValue(0x24)`, `MakeClosure(0x22)`, `LoadCapture(0x23)` |
| **运行时** | `Dependency(0x0c)`, `LoadMeta(0x16)`, `Await(0x14)`, `Not(0x25)` |
| **帧管理** | `PushFrame(0x0e)`, `PopFrame(0x0f)` |

> XHS 版本之前分析出的 14 个操作码是字节码数组的数值范围，实际操作码是 42 个。

### 指纹采集系统 (`example/fingerprint.js`)

Vercel 版本采集 **10 个维度** (比 XHS 多 4 个):

| 维度 | 字段 | 方法 | XHS 有? |
|------|------|------|---------|
| User-Agent | `ua` | `navigator.userAgent` | ✅ |
| 语言 | `lang` | `navigator.language` | ✅ |
| 平台 | `platform` | `navigator.platform` | ✅ |
| CPU 核心数 | `hc` | `navigator.hardwareConcurrency` | ✅ |
| 时区 | `tz` | `Intl.DateTimeFormat().resolvedOptions().timeZone` | ✅ |
| Canvas | `canvas` | Canvas 2D → SHA-256 | ✅ (格式不同) |
| **WebGL** | `webgl` | GPU vendor/renderer/extensions | ❌ |
| **GPU** | `gpu` | `UNMASKED_RENDERER_WEBGL` | ❌ |
| **插件列表** | `plugins` | `navigator.plugins` 枚举 | ❌ |
| **字体** | `fonts` | Canvas 字体测量检测 | ❌ |
| **网络** | `net` | `connection.effectiveType/downlink/rtt` | ❌ |

### X-Twisted-Sign 签名机制

Vercel 版本的核心功能 — 对每个 `fetch` 请求注入签名:

```javascript
// 源码: example/fingerprint.js:230-252
function hookFetch() {
    const nativeFetch = window.fetch;
    window.Object.defineProperty(window.window, "fetch", {
      value: function(url, options) {
          if (!options) options = {};
          let headers = options.headers || {};
          headers["X-Twisted-Sign"] = getSign();  // 异步签名
          options.headers = headers;
          return nativeFetch(url, options);
      }
    });
    // 伪装: fetch.toString() 返回 [native code]
    window.Object.defineProperty(window.fetch, "toString", {
      value: function() {
        return "function fetch() { [native code] }"
      }
    });
}
```

签名生成流程 (`getSign()`):
```
1. 采集指纹: getFingerprint() → {ua, lang, platform, hc, tz, canvas, webgl, gpu, plugins, fonts, net}
2. 检测调试器: dectectDebugger() → [debugger时间差, 窗口尺寸差, console状态]
3. 检测自动化: dectectAutomation() → [CDP, webdriver, Headless, Selenium, Puppeteer, Playwright...]
4. 检测 Hook: dectectHook() → [console.toString, eval.toString, eval.name, eval.length]
5. 组合: JSON.stringify({fingerprint, debugger, automation, hook}) + "|" + Date.now() + "|" + random(0,10000)
6. 哈希: SHA-256(signString) → 64位十六进制字符串
```

### 反调试/反自动化检测

| 检测类型 | 方法 | 源码位置 |
|----------|------|----------|
| **Debugger 时间检测** | `eval("debugger;")` 前后 `performance.now()` 差值 | `testDebuggerRunningTimeDectect()` |
| **CDP 检测** | `Error.stack` getter + `console.debug()` 触发 CDP 读取 | `dectectCdp()` |
| **WebDriver** | `navigator.webdriver === true` | `dectectAutomation()` |
| **Headless Chrome** | `userAgent.includes("HeadlessChrome")` | `dectectAutomation()` |
| **Selenium** | `window._Selenium_IDE_Anchor === true` | `dectectAutomation()` |
| **Puppeteer** | `window.__puppeteer_evaluation_script__ === true` | `dectectAutomation()` |
| **Playwright** | `window.__playwright_evaluation_script__ === true` | `dectectAutomation()` |
| **Hook 检测** | `console.toString()`, `eval.toString()`, `eval.name`, `eval.length` | `dectectHook()` |
| **DevTools 尺寸** | `outerWidth - innerWidth` (DevTools 打开时差异) | `dectectDebugger()` |

### 混淆系统

| 层级 | 技术 | 工具 |
|------|------|------|
| **IR 级** | 算术变形 (A+B → (A-t)+(B+t))、常量拆分、控制流平坦化 | `src/obfuscator/` |
| **JS 级** | 字符串数组 + RC4 编码 + 旋转、Unicode 转义、属性重命名、死代码注入 | `javascript-obfuscator` |
| **VM 级** | 所有业务逻辑在 VM 字节码中执行，无法直接读取 | Twisted VM |

### 部署

```json
// vercel.json
{
  "buildCommand": "npm run build:all && cp dist/browser/runtime.js public/runtime.js",
  "outputDirectory": "public"
}
```

```bash
# package.json
"build:all": "twisted all example/fingerprint.js dist/browser/bundle.json dist/browser/runtime.js --obfuscate"
```

## XHS (9090) vs Vercel 详细对比

### 混淆差异

| | XHS (9090) | Vercel (twisted-brown) |
|---|-----------|----------------------|
| **变量命名** | `_0xNNNNN` (5位十六进制) | 单字母 `a-z`, `A-Z` |
| **字符串解码器** | `_0x5cbb(index, mode)` | `d(index, ...)` |
| **字符串表** | 557 条 (5字符碎片) | 1630 条 (更长碎片) |
| **VM 类** | `_0x44b6d2` (ES6 class) | `I` (constructor function) |
| **方法名** | 从字符串表解码 (运行时) | `\xHH\xHH` 十六进制转义 |
| **全局导出** | `TwistedRuntime` | 无 (纯 IIFE) |
| **文件大小** | 145KB | 411KB |

### 功能差异

| | XHS (9090) | Vercel (twisted-brown) |
|---|-----------|----------------------|
| **工作模式** | 被动采集 → 返回 JSON | 主动拦截 → 注入签名 |
| **指纹维度** | 6 个 (canvas/tz/hc/platform/lang/ua) | **10 个** (+webgl/gpu/plugins/fonts/net) |
| **Hash 算法** | 自定义 FNV-1a 变体 | **SHA-256** (标准) |
| **Canvas 处理** | 返回原始 base64 或 hash | Canvas → SHA-256 hash |
| **fetch 拦截** | 否 | **是** (X-Twisted-Sign) |
| **反调试** | 基础 (toString 检测) | **全面** (debugger/CDP/webdriver/hook) |
| **反自动化** | 未知 | **全面** (Selenium/Puppeteer/Playwright) |
| **数据上报** | 由调用方完成 | 不上报 (透明代理模式) |

### 运行时行为对比

**XHS (9090)**:
```
页面加载 → runtime.js 加载 → TwistedRuntime.run([window, console])
  → VM 采集 6 维指纹 → 计算自定义 hash → 返回 JSON
  → 调用方将 JSON 上报到 t2.xiaohongshu.com/api/v2/collect
```

**Vercel (twisted-brown)**:
```
页面加载 → runtime.js 加载 → init()
  → hookFetch() 替换 window.fetch
  → dectectCdp() 执行 CDP 检测
  → 用户发起 fetch 请求
  → 拦截 → getSign() 异步计算签名
    → 采集 10 维指纹 + 反调试 + 反自动化 + Hook 检测
    → JSON.stringify + timestamp + random → SHA-256
  → 注入 X-Twisted-Sign header → 代理到原始 fetch
```

## 关键发现

1. **Vercel 版本是 Twisted 框架的官方 Demo** — 源码在 `twisted/example/fingerprint.js`，通过 `npm run build:all --obfuscate` 编译后部署
2. **XHS 版本是定制编译产物** — 使用同一框架但不同的输入脚本和编译参数，指纹维度更少，无 fetch 拦截
3. **两者核心区别是使用场景** — XHS 用于被动指纹采集 + 服务端风控，Vercel 用于主动请求签名 + 客户端透明代理
4. **Vercel 版本使用标准 SHA-256** — 而 XHS 使用自定义 FNV-1a 变体 hash
5. **Vercel 版本的反检测更全面** — 包含 debugger 时间检测、CDP 检测、多种自动化工具检测
6. **字符串 "SHA-256" 在源码中被碎片化** — `joinChars(["S", "H", "A", "-", "2", "5", "6"])` 避免明文出现

## 对 XHS 逆向的启示

1. **VM 解释器可以复用** — `twisted/src/vm/` 中的 VM 实现可以帮助理解 XHS 版本的字节码执行
2. **42 个操作码是完整集合** — 之前分析 XHS 时只识别了 14 个数值范围，现在知道有 42 个正式操作码
3. **编译管线可以本地复现** — `npm run build:all` 可以从源码重新生成 runtime.js
4. **反检测机制可预测** — XHS 版本很可能也包含类似的反调试/反自动化检测，只是输入脚本不同
5. **XHS 的自定义 hash 可能是编译选项** — 框架默认用 SHA-256，XHS 可能修改了 hash 实现或使用了不同版本的框架
