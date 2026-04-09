# Twisted VM Browser Test 反爬机制分析报告

> 分析日期: 2026-04-08
> 目标: http://43.130.243.137:9090/
> 标题: Twisted VM Browser Test

---

## 1. 架构概述

这是一个**小红书 (XHS) 浏览器指纹检测系统**，通过在浏览器中运行自定义虚拟机来采集设备指纹并上报。

### 执行流程

```
页面加载 → runtime.js (145KB) → TwistedRuntime.run([window, console])
                                    ↓
                              浏览器指纹采集
                                    ↓
                              POST t2.xiaohongshu.com/api/v2/collect
                                    ↓
                              加载 picasso 图片 x3 (图片指纹)
```

### 关键网络请求

| 请求 | 方法 | 用途 |
|------|------|------|
| `http://43.130.243.137:9090/runtime.js` | GET | VM 字节码 + 解释器 |
| `https://t2.xiaohongshu.com/api/v2/collect` | POST | 指纹数据上报 |
| `https://picasso-static.xiaohongshu.com/fe-platform/879b789b...png` | GET x3 | 图片指纹生成 (ed-fp) |

---

## 2. 代码保护层

### 2.1 自定义 VM 虚拟机

- 代码在虚拟机中解释执行，非直接运行原生 JS
- `TwistedRuntime.run([window, console])` 接收浏览器全局对象
- VM 执行导致页面 load 事件严重延迟（>10s），可作为自动化检测信号

### 2.2 变量/函数名混淆

- 所有标识符替换为 `_0x` 前缀的随机名（如 `_0x5f09f7`, `_0x35f94c`）
- 208 个混淆函数，1800+ 函数调用
- 643 个动态属性访问 `[_0xNNN(...)]`

### 2.3 字符串加密 + 碎片化

- **555 个字符串**存储在数组中，全部通过 hex 编码
- 使用**自定义 Base64** 解码器（字母表: `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=`）
- 字符串被切成 **5 字符片段**，运行时通过 `+` 拼接还原
- 关键 API 名称如 `navigator`, `canvas`, `toDataURL` 等在源码中完全不可见

### 2.4 反调试

- 包含 `debugger` 陷阱语句
- `console` 劫持（log/warn/error/info）
- `stack` 调用栈检测
- `constructor` / `toString` 检测
- 7 个 try/catch 块用于异常捕获和反分析

---

## 3. 浏览器指纹采集

根据解码出的字符串碎片，VM 检测以下浏览器 API：

### 3.1 Canvas 指纹

| API | 用途 |
|-----|------|
| `canvas` | 创建离屏 Canvas |
| `getContext` | 获取 2D/WebGL 渲染上下文 |
| `toDataURL` | 导出 Canvas 为 Base64 图片 |
| `fillText` | 在 Canvas 上绘制文本（浏览器间渲染差异） |

### 3.2 WebGL 指纹

| API | 用途 |
|-----|------|
| `getParameter` | 读取 GPU 渲染器/Vendor 信息 |

### 3.3 浏览器环境指纹

| API | 采集数据 |
|-----|----------|
| `navigator.userAgent` | 浏览器标识 |
| `navigator.platform` | 操作系统平台 |
| `navigator.language` | 语言设置 |
| `navigator.hardwareConcurrency` | CPU 核心数 |
| `createElement` | DOM 创建能力 |
| `getComputedStyle` | 计算样式访问 |

### 3.4 时区/地区指纹

| API | 用途 |
|-----|------|
| `Intl.DateTimeFormat` | 日期格式化（推断地区） |
| `timezone` | 时区信息 |

### 3.5 哈希/加密

| API | 用途 |
|-----|------|
| `hash` | 生成设备指纹唯一 ID |

---

## 4. 数据上报

### 4.1 采集端点

```
POST https://t2.xiaohongshu.com/api/v2/collect
```

### 4.2 请求头

```
sec-ch-ua: "Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"
sec-ch-ua-platform: "macOS"
sec-ch-ua-mobile: ?0
content-type: text/plain
origin: https://www.xiaohongshu.com
referer: https://www.xiaohongshu.com/
```

### 4.3 关键 Cookie

| Cookie | 用途 |
|--------|------|
| `a1` | 设备 ID |
| `web_session` | 登录会话 |
| `websectiga` | 安全签名 token |
| `webId` | Web 端用户 ID |
| `gid` | 全局 ID |
| `xsecappid` | `xhs-pc-web` |
| `sec_poison_id` | 反爬 ID |

### 4.4 图片指纹 (ed-fp)

加载 `picasso-static.xiaohongshu.com` 上的特定 PNG 图片 3 次，通过图片渲染差异生成设备指纹。

---

## 5. VM 状态消息

VM 执行过程中通过 emoji 前缀输出状态：

| 前缀 | 含义 |
|------|------|
| `🤖 Sta...` | VM 启动状态 |
| `🤖 Can...` | Canvas 检测 |
| `🤖 Tra...` | 追踪/采集执行 |
| `🤖 Inv...` | 无效/异常输入 |
| `🤖 Une...` | 意外错误 |
| `🤖 Byt...` | 字节码执行 |

---

## 6. 反自动化总结

| 防护层 | 描述 | 难度 |
|--------|------|------|
| 自定义 VM | 代码在虚拟机中解释执行，无法直接调用 API | ★★★★★ |
| 字符串加密碎片化 | 555 个字符串 hex+base64 双重编码，5 字符碎片化 | ★★★★★ |
| 浏览器指纹绑定 | Canvas/WebGL/Navigator/时区等多维指纹 | ★★★★☆ |
| XHS 登录态 | 采集数据与 Cookie 绑定，需有效登录 | ★★★★☆ |
| 图片指纹 | picasso 图片渲染差异检测 | ★★★☆☆ |
| 反调试 | debugger 陷阱 + console 劫持 + stack 检测 | ★★★☆☆ |
| 导航超时 | VM 执行导致 load 延迟，可检测自动化环境 | ★★☆☆☆ |

---

## 7. 代码统计

```
runtime.js:
  大小:       145,219 bytes
  函数:       208 个混淆函数
  调用:       1,800+ 函数调用
  属性访问:   643 个动态属性访问
  字符串表:   555 个加密字符串
  try/catch:  7 个
  new 操作:   26 个
  constructor: 6 个引用
```

---

## 8. 附录：技术细节

### 8.1 解码器核心逻辑

```javascript
// 自定义 Base64 字母表（标准）
const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';

// 解码流程:
// 1. 从字符串数组取出编码后的片段
// 2. 自定义 Base64 解码
// 3. URI percent-encoding 解码
// 4. 5字符碎片 + 运行时拼接
```

### 8.2 HTML 入口

```html
<button id="run-vm">Run VM</button>
<pre id="output"></pre>
<script src="../artifacts/runtime.js"></script>
<script>
  document.getElementById("run-vm").addEventListener("click", async () => {
    const result = await TwistedRuntime.run([window, console]);
    output.textContent = `return value: ${result}\nlatency: ${latencyMs} ms`;
  });
</script>
```

> 注意：VM 实际上在页面加载时**自动执行**，按钮点击是手动触发入口。
