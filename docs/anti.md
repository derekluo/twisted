# Web 端反 Hook、反调试与加密方案文档

## 一、反 Hook 检测

### 1.1 原生函数完整性校验

原生函数的 `toString()` 返回固定格式，被 hook 后通常会暴露：

```js
// 检测 fetch 是否被 hook
function isNativeFunction(fn) {
    const str = Function.prototype.toString.call(fn);
    return str === `function ${fn.name}() { [native code] }`;
}

isNativeFunction(window.fetch);    // 被 hook → false
isNativeFunction(window.console.log); // 被 hook → false
```

绕过方式：攻击者会同时 hook `Function.prototype.toString`。  
对抗：检测 `toString` 本身是否也被 hook：

```js
function checkToString() {
    const ts = Function.prototype.toString;
    // toString 本身也必须是 native
    return /native code/.test(ts.call(ts));
}
```

---

### 1.2 属性描述符异常检测

原生属性描述符有固定特征，被 `defineProperty` hook 后描述符会变化：

```js
function checkDescriptor(obj, prop) {
    const desc = Object.getOwnPropertyDescriptor(obj, prop);
    if (!desc) return true; // 不存在说明未被篡改
    // 原生属性通常是 writable:true, configurable:true, enumerable:false
    // 若被 defineProperty 覆盖，getter/setter 会出现
    if (desc.get || desc.set) return false; // 存在 getter/setter 说明被 hook
    return true;
}

checkDescriptor(window, 'fetch');
checkDescriptor(XMLHttpRequest.prototype, 'open');
```

---

### 1.3 原型链完整性检测

hook 工具（如 Frida/puppeteer）可能污染原型链：

```js
function checkPrototype() {
    // fetch 应挂在 window 上，不应在原型链上被替换
    const nativeFetch = window.fetch;
    // 检测 fetch 是否为真正的 Function 实例
    if (!(nativeFetch instanceof Function)) return false;
    // 检测原型链是否被篡改
    if (Object.getPrototypeOf(nativeFetch) !== Function.prototype) return false;
    return true;
}
```

---

### 1.4 关键 API 枚举检测

正常浏览器的 `console` 对象有固定属性集合，被 hook 后可能多出属性或属性顺序变化：

```js
function checkConsole() {
    const nativeKeys = ['log','warn','error','info','debug','table','trace','dir'];
    // toString 应返回 [object console]（非 hook 环境）
    return window.console.toString() === '[object console]';
}
```

---

### 1.5 eval / Function 完整性检测

攻击者常 hook `eval` 来捕获动态代码：

```js
function checkEval() {
    const str = Function.prototype.toString.call(window.eval);
    const isNative = str === 'function eval() { [native code] }';
    const hasCorrectName = window.eval.name === 'eval';
    const hasCorrectLength = window.eval.length === 1;
    return isNative && hasCorrectName && hasCorrectLength;
}
```

---

## 二、反调试检测

### 2.1 debugger 耗时检测

调试器打开时 `debugger` 语句会阻塞执行，时间差会显著变大：

```js
async function debuggerTimingDetect() {
    const start = window.performance.now();
    await new Promise(function(resolve) {
        window.setTimeout(function() {
            debugger;
            resolve();
        }, 0);
    });
    return window.performance.now() - start; // 正常 < 50ms，调试中 > 500ms
}
```

---

### 2.2 无限 debugger（干扰调试器使用）

让调试器无法正常操作：

```js
function infiniteDebugger() {
    (function loop() {
        debugger;
        window.setTimeout(loop, 50);
    })();
}
```

动态构造绕过静态混淆分析：

```js
function dynamicDebugger() {
    var c = new Function('debugger');
    window.setInterval(c, 100);
}
```

---

### 2.3 窗口尺寸差检测

DevTools 打开时会改变 `outerWidth - innerWidth` 或 `outerHeight - innerHeight`：

```js
function windowSizeDetect() {
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    // 正常情况差值较小（< 20），DevTools 打开时差值较大
    return widthDiff > 200 || heightDiff > 200;
}
```

注意：undocked 模式（独立窗口）时此方法失效。

---

### 2.4 console.log 频率检测

DevTools 打开时，调用 `console.log` 会触发渲染，可通过检测时间差感知：

```js
function consoleDetect() {
    var start = window.performance.now();
    for (var i = 0; i < 100; i++) {
        window.console.log && window.console.clear && window.console.log('');
    }
    return window.performance.now() - start > 100; // DevTools 打开时渲染耗时更长
}
```

---

### 2.5 Worker 内 debugger 检测（不阻塞主线程）

```js
function workerDebuggerDetect() {
    return new Promise(function(resolve) {
        var code = 'var t=performance.now();debugger;postMessage(performance.now()-t)';
        var blob = new window.Blob([code], { type: 'application/javascript' });
        var worker = new window.Worker(window.URL.createObjectURL(blob));
        worker.onmessage = function(e) {
            resolve(e.data); // 调试器打开时值显著 > 正常值
            worker.terminate();
        };
    });
}
```

---

## 三、自动化环境检测

### 3.1 navigator.webdriver

Puppeteer/Playwright 等自动化工具默认设置此属性：

```js
function checkWebdriver() {
    return navigator.webdriver === true;
}
```

---

### 3.2 自动化工具遗留全局变量

历史版本 ChromeDriver/Puppeteer 会在 window 上注入特征变量：

```js
function checkAutomationGlobals() {
    const keys = [
        '_phantom', '__nightmare', 'callPhantom', '_selenium',
        '__webdriver_evaluate', '__selenium_evaluate',
        '__fxdriver_evaluate', '__driver_evaluate',
        '__webdriver_script_func', '__driver_unwrapped',
        '__webdriver_script_fn',
    ];
    return keys.some(function(k) { return k in window; });
}
```

---

### 3.3 Chrome 自动化扩展检测

```js
function checkChromeAutomation() {
    // 真实 Chrome 有 window.chrome 且结构完整
    if (!window.chrome) return true; // headless 可能缺少
    // 检测是否通过自动化扩展注入
    if (window.chrome.runtime && window.chrome.runtime.id) return true;
    return false;
}
```

---

### 3.4 插件数量检测

无头浏览器通常没有插件：

```js
function checkPlugins() {
    return navigator.plugins.length === 0;
}
```

---

### 3.5 语言/时区一致性检测

自动化环境语言和时区常与 IP 地理位置不一致：

```js
function checkLanguage() {
    return !navigator.language || navigator.language.length === 0;
}
```

---

## 四、综合评分模型

不要单点判断，用多信号加权打分：

```js
async function detectRisk() {
    var score = 0;
    var signals = {};

    // 反 hook
    signals.fetchHooked = !isNativeFunction(window.fetch);
    signals.evalHooked = !checkEval();
    signals.consoleHooked = !checkConsole();

    // 反调试
    signals.windowSize = windowSizeDetect();
    signals.webdriver = checkWebdriver();
    signals.automationGlobals = checkAutomationGlobals();
    signals.noPlugins = checkPlugins();

    // 耗时检测（异步）
    var debugTime = await debuggerTimingDetect();
    signals.debuggerTiming = debugTime > 500;

    // 加权
    if (signals.fetchHooked) score += 30;
    if (signals.evalHooked) score += 20;
    if (signals.consoleHooked) score += 15;
    if (signals.windowSize) score += 10;
    if (signals.webdriver) score += 25;
    if (signals.automationGlobals) score += 20;
    if (signals.noPlugins) score += 5;
    if (signals.debuggerTiming) score += 20;

    return { score: score, signals: signals };
    // score > 50 认为高风险
}
```

---

## 五、注意事项

1. **不要单点拦截**：任何单一信号都有误报，必须组合评分。
2. **信号只上报，不前端拦截**：前端拦截容易被绕过，把 `score` 和 `signals` 上报服务端由后端决策。
3. **持续对抗**：检测方法会随浏览器版本/工具版本变化失效，需定期维护。
4. **性能影响**：耗时检测、Worker 检测有异步成本，放在非关键路径执行。
5. **兼容性**：部分 API（`performance.now`、`Worker`、`Blob`）需做降级处理。

---

## 六、行为信号采集

### 6.1 event.isTrusted 检测（重要）

浏览器原生标志，真人操作为 `true`，脚本模拟（`dispatchEvent`）为 `false`，**无法伪造**：

```js
var trustedEventCount = 0;
var untrustedEventCount = 0;

function trackEvent(e) {
    if (e.isTrusted) {
        trustedEventCount++;
    } else {
        untrustedEventCount++;
    }
}

window.document.addEventListener('mousemove', trackEvent, { passive: true });
window.document.addEventListener('click', trackEvent, { passive: true });
window.document.addEventListener('keydown', trackEvent, { passive: true });

function getEventTrustScore() {
    var total = trustedEventCount + untrustedEventCount;
    if (total === 0) return 0;
    return trustedEventCount / total; // 接近 1 为真人，接近 0 为脚本
}
```

**Cloudflare 就采集了此字段**，这是区分真人与自动化最可靠的前端信号之一。

---

### 6.2 鼠标轨迹采集

```js
var mouseTrail = [];
window.document.addEventListener('mousemove', function(e) {
    mouseTrail.push({
        x: e.clientX,
        y: e.clientY,
        t: window.performance.now(),
        trusted: e.isTrusted
    });
    // 只保留最近 50 个点
    if (mouseTrail.length > 50) {
        mouseTrail.shift();
    }
}, { passive: true });

function getMouseEntropy() {
    // 计算轨迹的方向变化次数（真人轨迹有随机抖动，脚本轨迹过于平滑）
    var dirChanges = 0;
    for (var i = 2; i < mouseTrail.length; i++) {
        var dx1 = mouseTrail[i-1].x - mouseTrail[i-2].x;
        var dy1 = mouseTrail[i-1].y - mouseTrail[i-2].y;
        var dx2 = mouseTrail[i].x - mouseTrail[i-1].x;
        var dy2 = mouseTrail[i].y - mouseTrail[i-1].y;
        var dot = dx1 * dx2 + dy1 * dy2;
        if (dot < 0) dirChanges++;
    }
    return dirChanges;
}
```

---

### 6.3 键盘节奏采集

```js
var keyTimings = [];
window.document.addEventListener('keydown', function(e) {
    keyTimings.push({
        code: e.code,
        t: window.performance.now(),
        trusted: e.isTrusted
    });
}, { passive: true });
```

---

## 七、加密与挑战方案

### 7.1 RSA 公钥挑战（Cloudflare 方案）

服务端持有私钥，前端用公钥加密随机数上报，服务端验证。**前端无法伪造**（不知道私钥）：

```js
// 这是 Cloudflare 的实际实现（已从混淆代码还原）
// 公钥指数 e = 65537，模数 N 由服务端下发

async function rsaChallenge(publicKeyModulusHex) {
    // 生成 128 字节随机数
    var r = new window.Uint8Array(128);
    window.crypto.getRandomValues(r);
    r[0] = 0; // 确保小于模数

    // BigInt 模幂：result = r^65537 mod N
    var N = window.BigInt('0x' + publicKeyModulusHex);
    var e = window.BigInt(65537);
    var base = window.BigInt(0);
    for (var i = 0; i < r.length; i++) {
        base = (base << window.BigInt(8)) | window.BigInt(r[i]);
    }
    base %= N;

    var result = window.BigInt(1);
    var exp = e;
    while (exp > window.BigInt(0)) {
        if (exp % window.BigInt(2) === window.BigInt(1)) {
            result = result * base % N;
        }
        base = base * base % N;
        exp >>= window.BigInt(1);
    }

    // 转回字节数组上报
    var out = new window.Uint8Array(128);
    var tmp = result;
    for (var j = 127; j >= 0; j--) {
        out[j] = window.Number(tmp & window.BigInt(255));
        tmp >>= window.BigInt(8);
    }
    return out;
}
```

**优点**：即使攻击者完全读懂算法，没有私钥也无法通过验证。

---

### 7.2 服务端动态 Challenge-Response

每次请求前先拿一次性 nonce，签名必须包含 nonce：

```js
async function getSignWithChallenge() {
    // 第一步：从服务端取 challenge
    var resp = await window.fetch('/api/challenge', { method: 'POST' });
    var data = await resp.json();
    var nonce = data.nonce; // 服务端生成的一次性随机串，有效期 30s

    // 第二步：用 nonce + 指纹计算签名
    var fp = getFingerprint();
    var payload = window.JSON.stringify({ nonce: nonce, fp: fp });
    var encoder = new window.TextEncoder();
    var hashBuf = await window.crypto.subtle.digest('SHA-256', encoder.encode(payload));
    var hashArr = window.Array.from(new window.Uint8Array(hashBuf));
    var hashHex = hashArr.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');

    return { nonce: nonce, sign: hashHex };
}
```

**服务端验证**：nonce 是否有效（未过期、未使用过）+ sign 是否匹配。  
**效果**：攻击者即使读懂算法，也必须实时请求 nonce，无法预生成 token 池。

---

### 7.3 HMAC 签名（对称方案，适合内部系统）

密钥由服务端动态下发，前端用 Web Crypto API 计算 HMAC：

```js
async function hmacSign(message, keyBase64) {
    var keyBytes = window.Uint8Array.from(window.atob(keyBase64), function(c) {
        return c.charCodeAt(0);
    });
    var key = await window.crypto.subtle.importKey(
        'raw', keyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    var encoder = new window.TextEncoder();
    var sig = await window.crypto.subtle.sign('HMAC', key, encoder.encode(message));
    return window.btoa(String.fromCharCode.apply(null, new window.Uint8Array(sig)));
}
```

---

### 7.4 字节码懒解密（分段保护）

核心逻辑加密存放，运行时用挑战结果作密钥解密执行：

```js
// chunk_B 是加密的字节码片段，key 来自服务端 challenge 返回值
function decryptChunk(encryptedChunk, keyBytes) {
    var out = new window.Uint8Array(encryptedChunk.length);
    for (var i = 0; i < encryptedChunk.length; i++) {
        // XOR 解密（实际可换 AES）
        out[i] = encryptedChunk[i] ^ keyBytes[i % keyBytes.length];
    }
    return Array.from(out);
}

// VM 执行流程
async function executeWithChallenge(chunkA, encryptedChunkB) {
    // chunkA 明文执行（采集指纹）
    var vm = new VM(chunkA, meta, [window, console]);
    await vm.execute();

    // 用指纹哈希作为密钥解密 chunkB
    var fp = getFingerprint();
    var encoder = new window.TextEncoder();
    var hashBuf = await window.crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(fp)));
    var keyBytes = new window.Uint8Array(hashBuf);

    var chunkB = decryptChunk(encryptedChunkB, keyBytes);

    // chunkB 执行（核心签名逻辑）
    var vm2 = new VM([...chunkA, ...chunkB], meta, [window, console]);
    await vm2.execute();
}
```

**效果**：静态分析只能拿到 chunkA，chunkB 的内容在运行时才出现，且和当前环境指纹绑定。

---

### 7.5 时间戳绑定（防 replay）

签名中加入时间戳，服务端拒绝过期的签名：

```js
function buildPayload(fingerprint, debugMetrics) {
    var ts = window.Date.now();
    var rand = window.Math.floor(window.Math.random() * 10000);
    return {
        fp: fingerprint,
        dbg: debugMetrics,
        ts: ts,
        rand: rand
        // 服务端验证：ts 在当前时间 ±30s 内有效
    };
}
```

---

## 八、破坏攻击者工程化的策略

### 8.1 构建时 Opcode 随机置换

每次构建生成随机 opcode 映射，攻击者逆向一次后下次构建就失效：

```js
// 编译器构建时生成置换表
function generateOpcodeMap(seed) {
    var opcodes = Array.from({ length: 256 }, function(_, i) { return i; });
    // Fisher-Yates 洗牌
    for (var i = opcodes.length - 1; i > 0; i--) {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        var j = Math.abs(seed) % (i + 1);
        var tmp = opcodes[i];
        opcodes[i] = opcodes[j];
        opcodes[j] = tmp;
    }
    return opcodes; // encodeMap[语义opcode] = 字节值
}
```

### 8.2 版本碎片化

不同用户/地区下发不同字节码版本，攻击者无法用一套脚本覆盖全部：

```
用户 A → 字节码版本 v1（opcode 映射 seed=12345）
用户 B → 字节码版本 v2（opcode 映射 seed=67890）
```

### 8.3 蜜罐 Token

对疑似攻击环境（score > 80）返回"成功"但实际无效的 token，让攻击者误以为成功，消耗其资源：

```
正常用户  → 真实 token（服务端实际放行）
高风险用户 → 伪造 token（格式相同，服务端识别后拒绝）
```

攻击者发现 token 无效需要额外时间排查，增加其调试成本。

---

## 九、完整信号上报结构

综合以上所有检测点，上报给服务端的完整 payload：

```js
async function buildFullPayload() {
    return {
        // 设备指纹
        fp: {
            ua: window.navigator.userAgent,
            lang: window.navigator.language,
            tz: window.Intl.DateTimeFormat().resolvedOptions().timeZone,
            canvas: getCanvasFingerprint(),
            webgl: getWebGLFingerprint(),
            gpu: getGpuFingerprint(),
            fonts: getFontFingerprint(),
            plugins: getPluginListFingerprint(),
            hc: window.navigator.hardwareConcurrency,
            screen: window.screen.width + 'x' + window.screen.height,
        },
        // 反调试信号
        dbg: {
            timing: await debuggerTimingDetect(),     // debugger 耗时
            windowSize: windowSizeDetect(),            // 窗口尺寸差
            consoleHooked: !checkConsole(),            // console 是否被 hook
            fetchHooked: !isNativeFunction(window.fetch), // fetch 是否被 hook
            evalHooked: !checkEval(),                  // eval 是否被 hook
            webdriver: navigator.webdriver === true,   // 自动化标志
            automationGlobals: checkAutomationGlobals(), // 遗留全局变量
            noPlugins: navigator.plugins.length === 0, // 无插件
        },
        // 行为信号
        behavior: {
            trustedRatio: getEventTrustScore(),   // isTrusted 比例
            mouseEntropy: getMouseEntropy(),       // 鼠标轨迹熵值
            eventCount: trustedEventCount + untrustedEventCount,
        },
        // 挑战结果
        ts: window.Date.now(),
        rand: window.Math.floor(window.Math.random() * 10000),
    };
}
```
