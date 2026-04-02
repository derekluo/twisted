# Cloudflare 挑战脚本逆向分析文档

> 本文档基于对 `files/cloudflare.js`（7946 行，二次解混淆版本）的静态分析整理。  
> 文件结构：配置元数据（行 1–109）+ 核心逻辑 IIFE（行 110–7946）。

---

## 一、文件整体架构

```
cloudflare.js
├── 行 1–109      全局配置 _cf_chl_opt（翻译、元数据、Turnstile 参数）
├── 行 110–140    字符串表初始化（c 函数 + 混淆数组 f48 置乱）
├── 行 141–955    主控流程（事件监听、定时器、状态机）
├── 行 956–1542   内置虚拟机 f2（字节码解释器）
├── 行 1543–1661  f3/f4：工具函数（位运算、TEA 加密）
├── 行 1663–1823  f5：UI 渲染（挑战页面元素生成）
├── 行 1824–2186  f6/f7/f8/f9/f10：事件采集与行为统计
├── 行 2187–7900  f11–f90+：各类检测、上报、加密函数
└── 行 7901–7946  入口触发
```

---

## 二、字符串混淆机制（行 110–140）

所有字符串通过 `p2(index)` 查表解析，原始数组存放在 `f48`，初始化时通过**数字验证和 push/shift 循环置乱**确保顺序正确：

```js
// 置乱校验（行 128–139）
while (true) {
    try {
        p58 = -parseInt(p56(393)) / 1 + parseInt(p56(829)) / 2 + ...
        if (p54 === p58) break;  // 校验和等于 498996 才停止
        else p57.push(p57.shift());
    } catch (e) {
        p57.push(p57.shift());
    }
}
```

**特征**：即使改变数组中任意一个元素，校验和不等就会死循环，无法被篡改。

---

## 三、RSA 公钥挑战（行 1013–1165）【核心】

这是整个挑战流程的密码学核心，实现了 **RSA 加密一次性随机数**上报：

```js
// 行 1013–1019：初始化 BigInt 常量
p27 = BigInt(p2(307));   // RSA 模数 N（1024 位大整数，从字符串表取）
p28 = BigInt(65537);     // 公钥指数 e
p29 = BigInt(0);
p30 = BigInt(1);
p31 = BigInt(2);
p32 = BigInt(8);
p33 = BigInt(p2(366));   // 掩码 0xFF

// 行 1140–1141：生成随机数
p37 = new Uint8Array(128);
crypto.getRandomValues(p37);   // 128 字节随机数
p37[0] = 0;                    // 首字节清零，确保小于模数 N

// 行 1143–1147：转换为 BigInt
p49 = 0n;
for (let i = 0; i < 128; i++) {
    p49 = (p49 << 8n) | BigInt(p37[i]);
}

// 行 1151–1157：模幂运算 result = r^65537 mod N（RSA 加密）
p39 = p49 % p27;          // base = r mod N
p40 = p28;                // exp = 65537
p41 = 1n;                 // result = 1
while (p40 > 0n) {
    if (p40 % 2n === 1n) {
        p41 = p41 * p39 % p27;   // result = result * base mod N
    }
    p39 = p39 * p39 % p27;       // base = base^2 mod N
    p40 >>= 1n;
}
p38 = p41;    // 加密结果

// 行 1159–1165：转回字节数组
p42 = new Array(128);
for (let j = 127; j >= 0; j--) {
    p42[j] = Number(p52 & 0xFFn);
    p52 >>= 8n;
}
```

**防伪原理**：
- 前端只有公钥（N=模数, e=65537），无法获知私钥
- 服务端用私钥解密 `p42`，验证解出的值是否合法
- 每次调用 `crypto.getRandomValues` 生成不同随机数，token 不可重用

---

## 四、TEA 对称加密（行 1554–1662，函数 f4）

`f4` 是标准 **TEA（Tiny Encryption Algorithm）** 实现，用于对内部数据加密：

```js
// 行 1644–1653：TEA 加密核心（32 轮 Feistel 结构）
p401 = (p395[0] << 24 | p395[1] << 16 | p395[2] << 8 | p395[3]) >>> 0;  // v0
p402 = (p395[4] << 24 | p395[5] << 16 | p395[6] << 8 | p395[7]) >>> 0;  // v1
p396 = [/* 128位密钥拆成4个32位整数 */];

for (let i = 0; i < 32; i++) {
    p401 = (p401 + ((p402 << 4) + p402 >>> 5) + p402 ^ (p403 + p396[p403 & 3])) >>> 0;
    p403 = (p403 + 2654435769) >>> 0;   // delta = 0x9E3779B9（黄金比例）
    p402 = (p402 + ((p401 << 4) + p401 >>> 5) + p401 ^ (p403 + p396[p403 >> 11 & 3])) >>> 0;
}
```

**用途**：对 Cookie 值或中间状态数据做对称加密，防止明文传输。

---

## 五、行为事件采集（行 1995–2186，函数 f9/f10）

### 5.1 监听的事件类型（行 2085–2091）

```js
// f9 注册了以下事件监听器，均带 { passive: true }
p4.addEventListener("click",       f10, { passive: true });
p4.addEventListener("mousemove",   f10, { passive: true });
p4.addEventListener("keydown",     f10, { passive: true });
p4.addEventListener("touchstart",  f10, { passive: true });
p4.addEventListener("wheel",       f10, { passive: true });
p4.addEventListener("pointermove", f10, { passive: true });
p4.addEventListener("pointerover", f10, { passive: true });
```

### 5.2 事件数据采集字段（行 2100–2141，函数 f10）

每次事件触发，f10 按 switch 分支统计多个计数器：

```js
// case "0": 统计 isTrusted=true 的事件（真人事件）
if (event.isTrusted) {
    state.trustedCount++;
}
// case "1": 按事件类型分类统计（click/mousemove/keydown 等）
if (event.type === "click") {
    state.clickCount++;
}
// case "2": 统计特定 x 坐标范围的鼠标事件
if (event.clientX === "某阈值") {
    state.positionCount++;
}
// case "3": 全局事件计数器 p21++
p21++;
// case "5": 统计鼠标移动距离
if (event.movementX > threshold) {
    state.moveCount++;
}
// case "6": 统计 timeStamp 偏差
if (event.timeStamp > someValue) {
    state.timeCount++;
}
// case "7": 记录当前总事件数
state.totalEvents = p21;
// case "8": 按事件 target 类型分类
if (event.target === someElement) {
    state.targetCount++;
}
```

**关键字段**：`event.isTrusted`（真人/脚本区分）、`event.timeStamp`、`event.clientX/Y`、`event.movementX`、`event.type`

---

## 六、时间漂移检测（行 714–765）

每 1000ms 执行一次检查，比较 `Date.now()` 与页面加载基准时间 `p15`：

```js
setInterval(function () {
    var timeout = p3[p2(519)][p2(181)] || 10000;  // 默认超时 10 秒
    if (
        !p3[p2(237)] &&           // 未暂停
        !p13 &&                   // 未完成
        !p3[p2(295)][p2(1148)] && // 未出错
        Date.now() - p15 > timeout  // 超时判定
    ) {
        f46();  // 触发超时处理（重试/失败）
    } else {
        f22();  // 正常更新状态
    }
}, 1000);
```

---

## 七、navigator.webdriver 检测（行 5826–5832）

```js
// 行 5830（还原后）
if (!navigator[p1424(p1421.xG)]) {
    // p1424(p1421.xG) 解析为 "webdriver"
    // navigator.webdriver 为 false 或 undefined → 标记为正常
    p1428 = true;  // 否则 p1428 = false → 继续验证
}
```

---

## 八、浏览器扩展检测（行 5820–5828）

通过 `Error.stack` 检测 URL 是否包含浏览器扩展协议：

```js
// f 函数内（行约 2352–2356）
var stackStr = new Error().stack;
var isExtension = /(chrome|moz|safari|edge)-extension:\/\//.test(stackStr);
if (isExtension) {
    // 标记为存在扩展，影响 challenge 结果
}
```

---

## 九、Cookie 管理机制（行约 5842）

挑战通过后写入多个安全 Cookie：

```js
// 行约 5842 相关字段
// Cookie 名：cf_chl_*、_cf_chl_opt、_cf_chl_state
// 属性：; Path=/; Secure; SameSite=None; Partitioned
// 有效期：通过 Expires + toUTCString 设置
```

---

## 十、XHR 上报流程（函数 f13，行约 2533）

`f13` 负责把挑战结果通过 XHR POST 上报给服务端：

```js
// 上报数据结构（还原自 f13）
{
    LmXjv7: p3.state.xxx,      // 页面状态信息
    cJzUF5: p3.counter.xxx,    // 事件计数
    qSXnT3: 0,
    ifelP6: 0,
    yvkIa7: p3.frame.width - p3.outer.width,   // 宽度差（DevTools 检测）
    UhIE3:  p3.frame.height - p3.outer.height,  // 高度差
    // + RSA 加密结果 p42
    // + TEA 加密的 Cookie 值
}
```

---

## 十一、crypto 能力检测（行 175、6767）

```js
// 行 175：用 crypto.randomUUID 生成会话 ID
p5 = crypto && crypto.randomUUID ? crypto.randomUUID() : "";

// 行 6767：验证 crypto 方法可用性
if (!p3[...] || !crypto[...]) {
    // crypto 不可用 → 降级或失败
}
```

---

## 十二、eval 动态执行（行 795）

```js
// 行 795
p18 = (0, eval)(p2(584));
// 通过间接 eval 执行字符串（绕过 CSP 的 unsafe-eval 检测）
// p2(584) 是从字符串表取的一小段 JS 代码
```

---

## 十三、完整挑战流程（时序）

```
页面加载
    │
    ├─ 初始化 BigInt 常量 + RSA 参数（行 1013）
    ├─ 生成随机数 r，计算 r^65537 mod N（行 1140–1158）
    ├─ 注册行为事件监听（f9，行 1995）
    ├─ 启动超时定时器（行 714）
    │
用户触发挑战（load 事件）
    │
    ├─ 采集行为信号（f10）：isTrusted / 事件类型 / 坐标 / 时间戳
    ├─ 检测 navigator.webdriver（行 5830）
    ├─ 检测浏览器扩展（Error.stack）
    ├─ 检测 crypto 能力（行 6767）
    ├─ 检测 iframe 受限环境（f30，行 3925）
    │
    ├─ 组装上报 payload（f13）：
    │       - RSA 加密结果（128 字节）
    │       - TEA 加密的状态数据
    │       - 行为计数（click/move/trusted）
    │       - 窗口尺寸差（DevTools 检测）
    │       - 会话 ID（randomUUID）
    │
    ├─ XHR POST 上报到 /cdn-cgi/challenge-platform/
    │
服务端验证
    │
    ├─ RSA 私钥解密 → 验证随机数合法性
    ├─ 行为信号评分（isTrusted 比例、事件频率）
    ├─ 环境信号评分（webdriver / 扩展 / 窗口尺寸）
    │
    └─ 通过 → 写入 cf_clearance Cookie
```

---

## 十四、与你的项目对比及建议

| 能力 | Cloudflare | 你的项目 | 建议 |
|------|-----------|---------|------|
| RSA 挑战（公私钥） | ✅ 1024 位模幂 | ❌ 无 | 服务端生成密钥对，前端加密上报 |
| TEA/对称加密 | ✅ | ❌ 无 | 对 payload 加密再上报 |
| event.isTrusted 采集 | ✅ 多事件类型 | ❌ 无 | **优先实现，成本低效果好** |
| 事件类型分类统计 | ✅ 7 种事件 | ❌ 无 | 统计 click/move/keydown 频率 |
| 窗口尺寸差采集 | ✅ | ⚠️ 有但未上报 | 加入 payload 上报 |
| navigator.webdriver | ✅ | ❌ 未实现 | 1 行代码，直接加 |
| 扩展检测（Error.stack） | ✅ | ❌ 无 | 正则检测 `-extension://` |
| 超时/时间漂移检测 | ✅ setInterval | ✅ 有 | 已有，继续完善 |
| VM 字节码保护 | ✅ | ✅ | 两者思路相同 |
| Cookie 安全属性 | ✅ Secure+SameSite | 取决于服务端 | 服务端配置 |
| 随机 UUID 会话 ID | ✅ | ❌ 无 | 加入 payload 追踪会话 |
| eval 动态执行 | ✅（间接） | ❌ | 可选，提高分析难度 |

**最高优先级补充**：
1. `event.isTrusted` 统计上报（1 小时内可完成）
2. `navigator.webdriver` 检测（1 行代码）
3. 扩展检测（5 行代码）
4. RSA 挑战（需要服务端配合，但效果最强）
