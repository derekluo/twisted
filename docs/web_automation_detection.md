# Web自动化检测技术全解析

## 一、WebDriver特征检测

### 原理
Selenium、Puppeteer等自动化工具在控制浏览器时会在浏览器环境中注入特定的JavaScript属性和对象。这些特征成为了识别自动化工具的关键标志。

### 检测方法

#### 1. navigator.webdriver属性
```javascript
// 检测代码
if (navigator.webdriver === true) {
    console.log('检测到自动化工具');
}
```
- 使用Selenium时，该属性返回`true`
- 正常浏览器访问时返回`undefined`或`false`

#### 2. 特定对象和属性
检查以下标志性字符串：
```javascript
// Selenium特征
window._selenium
window.__driver_evaluate
window.__webdriver_evaluate
window.__selenium_unwrapped

// Puppeteer特征
window.navigator.webdriver === true
```

### 绕过方法

#### 1. 修改webdriver属性
```javascript
// 在页面加载前执行
Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined
});
```

#### 2. 使用CDP (Chrome DevTools Protocol)
```javascript
// Puppeteer示例
await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
    });
});
```

#### 3. 使用Stealth插件
```javascript
// puppeteer-extra-plugin-stealth
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
```

---

## 二、浏览器指纹检测

### 原理
通过收集浏览器的各种技术特征，生成唯一的"指纹"来识别和追踪用户。自动化工具的指纹往往与真实浏览器存在差异。

### 检测方法

#### 1. Canvas指纹
```javascript
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
ctx.textBaseline = 'top';
ctx.font = '14px Arial';
ctx.fillText('Browser fingerprint', 2, 2);
const fingerprint = canvas.toDataURL();
```

#### 2. WebGL指纹
```javascript
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl');
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
```

#### 3. 其他指纹特征
- **User-Agent**: 用户代理字符串
- **屏幕分辨率**: `screen.width`, `screen.height`, `screen.colorDepth`
- **时区**: `Intl.DateTimeFormat().resolvedOptions().timeZone`
- **语言**: `navigator.language`, `navigator.languages`
- **字体**: 通过Canvas测量可用字体
- **插件**: `navigator.plugins`
- **Audio指纹**: 音频信号处理特征
- **媒体设备**: `navigator.mediaDevices.enumerateDevices()`

#### 4. 在线检测工具
访问 https://bot.sannysoft.com/ 可以查看浏览器的各种指纹特征

### 绕过方法

#### 1. 使用真实浏览器指纹
```javascript
// 设置完整的浏览器指纹
await page.evaluateOnNewDocument(() => {
    // 修改canvas指纹
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
        // 添加随机噪声
        return originalToDataURL.apply(this, arguments);
    };
});
```

#### 2. 使用反检测浏览器
- Undetected ChromeDriver (Python)
- Nodriver
- Rebrowser-Puppeteer

#### 3. 修改关键属性
```javascript
// 修改多个指纹属性
await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8
    });
    Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8
    });
});
```

---

## 三、行为模式检测

### 原理
人类用户和自动化工具在操作网页时的行为模式存在显著差异。自动化工具的操作通常更快、更规律、更精确。

### 检测方法

#### 1. 鼠标移动轨迹
```javascript
let mouseMovements = [];
document.addEventListener('mousemove', (e) => {
    mouseMovements.push({x: e.clientX, y: e.clientY, time: Date.now()});
});

// 分析特征：
// - 移动是否太直线
// - 速度是否恒定
// - 是否有自然的抖动
```

#### 2. 输入速度检测
```javascript
let inputTimings = [];
document.querySelector('input').addEventListener('keydown', (e) => {
    inputTimings.push(Date.now());
});

// 人类输入：每个字符间隔50-200ms，有波动
// 自动化：瞬间填完或间隔完全一致
```

#### 3. 点击模式
```javascript
// 检测点击的精确度和速度
document.addEventListener('click', (e) => {
    // 人类点击：有轻微偏移，有犹豫时间
    // 自动化：精确点击元素中心，无延迟
});
```

#### 4. 滚动行为
```javascript
// 人类滚动：不均匀，有停顿
// 自动化：可能直接跳转到目标位置
window.addEventListener('scroll', () => {
    // 记录滚动速度和模式
});
```

### 绕过方法

#### 1. 模拟人类鼠标移动
```javascript
// 使用贝塞尔曲线模拟自然移动
async function humanMouseMove(page, selector) {
    const element = await page.$(selector);
    const box = await element.boundingBox();
    
    // 添加随机偏移
    const x = box.x + box.width / 2 + (Math.random() - 0.5) * 10;
    const y = box.y + box.height / 2 + (Math.random() - 0.5) * 10;
    
    await page.mouse.move(x, y, {steps: 25}); // 分步移动
}
```

#### 2. 随机延迟
```javascript
// 添加随机等待时间
async function humanDelay(min = 100, max = 300) {
    const delay = Math.random() * (max - min) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
}
```

#### 3. 模拟打字速度
```javascript
async function humanType(page, selector, text) {
    await page.click(selector);
    for (let char of text) {
        await page.keyboard.type(char);
        await humanDelay(50, 150); // 每个字符间随机延迟
    }
}
```

#### 4. 模拟滚动
```javascript
async function humanScroll(page, distance) {
    const steps = Math.floor(distance / 100);
    for (let i = 0; i < steps; i++) {
        await page.evaluate(() => {
            window.scrollBy(0, 100 + Math.random() * 20);
        });
        await humanDelay(100, 200);
    }
}
```

---

## 四、Runtime.enable 检测（最新技术）

### 原理
所有主流自动化库（Puppeteer、Playwright、Selenium）都使用Chrome DevTools Protocol (CDP)与浏览器通信，并且都会使用`Runtime.enable`命令。这个命令允许从浏览器的Runtime域获取事件。

当浏览器收到`Runtime.enable`命令时，Chromium才会分发Runtime事件。通过检测这些事件是否被触发，可以识别是否正在使用CDP控制浏览器。

### 检测方法

#### 核心机制
利用`Runtime.consoleAPICalled`事件和Chrome的控制台消息缓冲特性：

```javascript
// 检测代码原理
(function() {
    const e = new Error();
    let cdpDetected = false;
    
    Object.defineProperty(e, 'stack', {
        get() {
            cdpDetected = true; // 如果被序列化，说明CDP已连接
            return '';
        }
    });
    
    console.table(e); // 触发序列化
    
    if (cdpDetected) {
        console.log('检测到CDP自动化');
    }
})();
```

#### 检测逻辑
1. 创建Error对象，定义stack属性的getter
2. 使用`console.table`等方法记录该对象
3. 如果CDP已连接且`Runtime.enable`启用，对象会被序列化，触发getter
4. 正常浏览器（未开启DevTools）不会触发getter

#### 影响范围
- **Cloudflare Turnstile**
- **DataDome**
- 其他使用此技术的反机器人服务

### 绕过方法

#### 1. 禁用自动Runtime.enable
```javascript
// 方案1: 使用Page.createIsolatedWorld
const {executionContextId} = await client.send('Page.createIsolatedWorld', {
    frameId: frameId,
    worldName: 'myWorld'
});
```

```javascript
// 方案2: 手动控制Runtime
await client.send('Runtime.enable');
await client.send('Runtime.disable'); // 立即禁用
```

#### 2. 使用已打补丁的库
```javascript
// Nodriver (原生支持)
import nodriver as uc
browser = await uc.start()

// Rebrowser-Puppeteer
const puppeteer = require('rebrowser-puppeteer');
const browser = await puppeteer.launch();
```

#### 3. 修改CDP实现
手动实现CDP通信，避免使用标准的`Runtime.enable`命令，但这需要深入了解CDP协议。

### 局限性
- **误报问题**: 会检测到打开DevTools的普通用户
- **兼容性**: 主要针对基于Chromium的浏览器
- **维护成本**: 需要持续更新绕过方案

---

## 五、Console方法检测

### 原理
通过重写或禁用console对象的方法（如console.log、console.table等），达到两个目的：
1. 干扰调试，让开发者难以通过console输出调试
2. 检测控制台是否打开（调试状态）

### 检测方法

#### 1. 禁用Console方法
```javascript
// 反爬虫脚本示例
window["console"]["log"] = function(){};
window["console"]["warn"] = function(){};
window["console"]["debug"] = function(){};
window["console"]["table"] = function(){};
window["console"]["clear"] = function(){};
```

#### 2. 检测控制台打开状态
```javascript
// 通过toString检测
const element = new Image();
Object.defineProperty(element, 'id', {
    get: function() {
        // 如果控制台打开，这个getter会被触发
        console.log('控制台已打开');
        return 'detected';
    }
});
console.log(element);
```

### 绕过方法

#### 1. 保存原始Console
```javascript
// 在脚本执行前保存
const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    debug: console.debug.bind(console),
    table: console.table.bind(console)
};

// 使用保存的方法
originalConsole.log('This still works');
```

#### 2. 恢复Console方法
```javascript
// 从iframe获取干净的console
const iframe = document.createElement('iframe');
iframe.style.display = 'none';
document.body.appendChild(iframe);
const cleanConsole = iframe.contentWindow.console;
```

#### 3. 使用其他调试方法
```javascript
// 使用debugger语句
debugger;

// 使用alert
alert(JSON.stringify(data));

// 写入DOM
document.body.innerHTML += '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
```

---

## 六、Headless模式检测

### 原理
无头浏览器（Headless Browser）在没有图形界面的情况下运行，这会导致某些浏览器属性和行为与正常浏览器不同。

### 检测方法

#### 1. 检测特定属性
```javascript
// Chrome Headless特征
if (navigator.webdriver) {} // WebDriver标志

if (!window.chrome || !window.chrome.runtime) {
    // Headless Chrome可能缺少chrome对象
}

// 检测插件
if (navigator.plugins.length === 0) {
    // Headless浏览器通常没有插件
}
```

#### 2. 检测用户代理
```javascript
if (/HeadlessChrome/.test(navigator.userAgent)) {
    console.log('检测到Headless Chrome');
}
```

#### 3. 权限检测
```javascript
// Headless模式下某些权限请求行为不同
navigator.permissions.query({name: 'notifications'}).then(result => {
    if (result.state === 'denied' && !window.Notification) {
        // 可能是Headless
    }
});
```

### 绕过方法

#### 1. 使用有头模式
```javascript
// Puppeteer
const browser = await puppeteer.launch({
    headless: false // 使用有头模式
});
```

#### 2. 使用新版Headless
```javascript
// Chrome新版Headless模式（更难检测）
const browser = await puppeteer.launch({
    headless: 'new' // 或 'shell'
});
```

#### 3. 修改User-Agent
```javascript
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
```

---

## 七、综合对比

| 检测方式 | 难度 | 有效性 | 误报率 | 绕过难度 |
|---------|------|--------|--------|---------|
| WebDriver检测 | 低 | 中 | 低 | 低 |
| 浏览器指纹 | 中 | 高 | 中 | 中 |
| 行为模式 | 高 | 高 | 中 | 高 |
| Runtime.enable | 低 | 极高 | 中 | 高 |
| Console检测 | 低 | 低 | 低 | 低 |
| Headless检测 | 中 | 中 | 低 | 低 |

---

## 八、最佳实践建议

### 对于网站防护者
1. **多层检测**: 结合多种检测方法，不要依赖单一技术
2. **行为分析**: 重点关注用户行为模式，这是最难伪造的
3. **使用专业服务**: Cloudflare、DataDome等提供成熟的解决方案
4. **持续更新**: 反自动化技术需要不断演进

### 对于自动化开发者
1. **使用现代工具**: Nodriver、Rebrowser等已经内置反检测
2. **模拟真实行为**: 添加随机延迟、人类化操作
3. **定期测试**: 使用 bot.sannysoft.com 等工具测试你的自动化脚本
4. **遵守规则**: 尊重robots.txt，合理控制请求频率
5. **合法合规**: 确保自动化行为符合网站条款和法律法规

---

## 九、参考资源

- **在线检测工具**: https://bot.sannysoft.com/
- **Cloudflare文档**: https://developers.cloudflare.com/turnstile/
- **Chrome DevTools Protocol**: https://chromaticpdf.com/blog/an-introduction-to-the-chrome-devtools-protocol
- **Puppeteer Stealth**: https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth
- **Nodriver**: https://github.com/ultrafunkamsterdam/nodriver
