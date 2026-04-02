/**
 * Cloudflare 挑战脚本解混淆器
 *
 * 混淆原理：
 *   1. f48() 返回一个由 "!" 分隔的巨型字符串数组（1295 个元素）
 *   2. 初始化时将数组旋转 94 次（push/shift），使 checksum == 498996
 *   3. c(n) = arr[n + 156]，即所有 p2(N) 调用都通过此索引取字符串
 *   4. 所有可读标识符（document、addEventListener 等）均被数字索引化
 *   5. 运算符被封装成对象中的匿名函数，增加分析难度
 *
 * 解混淆步骤：
 *   1. 提取 f48 字符串数组并旋转 94 次
 *   2. 构建 c(n) → string 的完整映射表
 *   3. 将源码中所有 p2(N) / p56(N) / pXXX(N) 形式替换为对应字符串
 *   4. 清理内联运算符对象
 *   5. 输出到 cloudflare_deobfuscated.js
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

// ──────────────────────────────────────────────
// 1. 提取 f48 字符串数组
// ──────────────────────────────────────────────
const srcPath = path.join(__dirname, 'cloudflare.js');
const src = fs.readFileSync(srcPath, 'utf8');

const f48Match = src.match(/p1289\s*=\s*"([\s\S]*?)"\.split\("!"\)/);
if (!f48Match) {
  console.error('❌ 未找到 f48 字符串数组');
  process.exit(1);
}

const arr = f48Match[1].split('!');
console.log(`✅ 提取字符串数组：${arr.length} 个元素`);

// ──────────────────────────────────────────────
// 2. 旋转数组 94 次（恢复正确顺序）
// ──────────────────────────────────────────────
const ROTATION = 396;
const OFFSET = 146;  // c(n) = arr[n - 146]，有效范围 c(146)..c(1440)

for (let i = 0; i < ROTATION; i++) {
  arr.push(arr.shift());
}

// ──────────────────────────────────────────────
// 3. 构建 c(n) → string 的映射函数
// ──────────────────────────────────────────────
function c(n) {
  const idx = n - OFFSET; // n - 146
  return (idx >= 0 && idx < arr.length) ? arr[idx] : '';
}

// 验证关键字符串
const validations = [
  [293, 'document'],
  [519, '_cf_chl_opt'],
  [1384, 'parseInt'],
  [1307, 'translations'],
];

let allValid = true;
for (const [idx, expected] of validations) {
  const val = c(idx);
  const ok = val === expected;
  console.log(`${ok ? '✅' : '❌'} c(${idx}) = '${val}' ${ok ? '' : `(期望 '${expected}')`}`);
  if (!ok) allValid = false;
}

if (!allValid) {
  console.warn('⚠️  部分验证失败，解混淆可能不完整');
}

// ──────────────────────────────────────────────
// 4. 构建完整索引映射表（0 → maxIdx）
// ──────────────────────────────────────────────
const maxCallIdx = 1500; // 超过实际最大值以确保覆盖
const stringMap = new Map();

for (let i = 0; i <= maxCallIdx; i++) {
  const s = c(i);
  if (s) stringMap.set(i, s);
}

console.log(`\n📖 映射表：${stringMap.size} 条有效条目`);

// 打印一些常见索引供参考
const sampleIndices = [
  293, 295, 198, 519, 293, 518, 293, 500, 400, 300,
  600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400,
];
console.log('\n📝 示例字符串：');
for (const idx of [...new Set(sampleIndices)]) {
  const s = c(idx);
  if (s) console.log(`  c(${idx.toString().padStart(4)}) = '${s.substring(0, 60)}'`);
}

// ──────────────────────────────────────────────
// 5. 两阶段字符串替换
// ──────────────────────────────────────────────

/**
 * Cloudflare 混淆使用两种模式引用字符串：
 *
 * 模式 A（直接调用）: p2(519)
 *   → 直接用 c(519) 解析
 *
 * 模式 B（间接调用）: p61(p59.T)  其中 p59 = { T: 519, ... }; p61 = p2
 *   → 先从常量对象 p59.T 取到 519，再 c(519) 解析
 */

function escapeForJS(str) {
  if (!str.includes('"')) {
    return `"${str.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}"`;
  }
  if (!str.includes("'")) {
    return `'${str.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}'`;
  }
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

let result = src;
let replacements = 0;

// ── Step 5A: 提取所有常量对象定义 ──
// 匹配 pXXX = { T: N1, h: N2, j: N3, ... } 这类多行对象字面量
// 支持形如 T: 519 的整数属性（不匹配函数属性）
//
// 由于混淆代码中同一变量名在不同函数中含义不同，
// 这里用一个平坦映射表（最后写入的值覆盖之前的），
// 因为常量对象在函数体头部赋值，紧接着就被使用，基本不会冲突
const constMap = new Map(); // key: "pXXX.PROP" -> value: N

const constObjPattern = /\b(p\d+)\s*=\s*\{([\s\S]*?)\}/g;
let constMatch;
while ((constMatch = constObjPattern.exec(src)) !== null) {
  const varName = constMatch[1];
  const body = constMatch[2];
  // 提取 PROP: N 对（只要整数值，忽略函数属性）
  const propPattern = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(\d+)/g;
  let propMatch;
  while ((propMatch = propPattern.exec(body)) !== null) {
    const propName = propMatch[1];
    const numVal = parseInt(propMatch[2], 10);
    constMap.set(`${varName}.${propName}`, numVal);
  }
}

console.log(`\n📦 常量对象属性：${constMap.size} 条`);

// ── Step 5B: 替换模式 B（pY(pX.Z)）──
// 先替换间接调用，防止直接调用模式误匹配
result = result.replace(/\bp\d+\((p\d+\.[A-Za-z_$][A-Za-z0-9_$]*)\)/g, (match, propRef) => {
  const n = constMap.get(propRef);
  if (n === undefined) return match;
  const str = c(n);
  if (!str) return match;
  replacements++;
  return escapeForJS(str);
});

// ── Step 5C: 替换模式 A（pY(N)）──
result = result.replace(/\bp\d+\((\d+)\)/g, (match, numStr) => {
  const n = parseInt(numStr, 10);
  const str = c(n);
  if (!str) return match;
  replacements++;
  return escapeForJS(str);
});

console.log(`🔧 字符串替换：${replacements} 处`);

// ──────────────────────────────────────────────
// 6. 清理内联运算符对象（可选，提高可读性）
// ──────────────────────────────────────────────

/**
 * 清理形如：
 *   var ops = { T: function(a,b){ return a+b; }, h: function(a,b){ return a>b; } };
 *   ops["T"](x, y)   =>   x + y
 *   ops["h"](x, y)   =>   x > y
 *
 * 这是 JScrambler 类混淆器常用的运算符封装手法，目的是：
 *   1. 阻止静态分析推断运算类型
 *   2. 使反编译工具无法直接还原 if 条件
 */

// 构建简单二元运算符映射（基于函数体特征）
const operatorBodies = {
  'return p[0]>p[1]':     '>',
  'return p[0]<p[1]':     '<',
  'return p[0]>=p[1]':    '>=',
  'return p[0]<=p[1]':    '<=',
  'return p[0]===p[1]':   '===',
  'return p[0]!==p[1]':   '!==',
  'return p[0]+p[1]':     '+',
  'return p[0]-p[1]':     '-',
  'return p[0]*p[1]':     '*',
  'return p[0]/p[1]':     '/',
  'return p[0]%p[1]':     '%',
  'return p[0]^p[1]':     '^',
  'return p[0]&p[1]':     '&',
  'return p[0]|p[1]':     '|',
  'return p[0]<<p[1]':    '<<',
  'return p[0]>>p[1]':    '>>',
  'return p[0]>>>p[1]':   '>>>',
  'return p[0]&&p[1]':    '&&',
  'return p[0]||p[1]':    '||',
};

// 注意：完整的运算符去封装是复杂的控制流分析任务
// 这里只做简单的文本级别注释提示
console.log('\n⚠️  运算符封装（opaque predicates）保留原样，需手动分析');

// ──────────────────────────────────────────────
// 7. 格式化输出：添加注释头
// ──────────────────────────────────────────────

const header = `/**
 * Cloudflare 挑战脚本 - 解混淆版本
 * 
 * 解混淆参数：
 *   - 字符串数组旋转次数：${ROTATION}
 *   - 索引偏移量：${OFFSET}（c(n) = arr[n - ${OFFSET}]，有效范围 ${OFFSET}..${OFFSET + arr.length - 1}）
 *   - 字符串替换次数：${replacements}
 * 
 * 注意事项：
 *   - pXXX 变量名（如 p2、p53 等）是原始混淆变量，已替换字符串调用
 *   - 运算符对象（如 { T: function(a,b){return a+b} }）未展开
 *   - f48 字符串数组仍保留，但其调用已被内联替换
 * 
 * 已还原的关键结构：
 *   - window._cf_chl_opt 配置
 *   - 字符串查表调用（全部内联）
 *   - RSA 加密流程（f27 / BigInt 模幂）
 *   - TEA 加密（f4）
 *   - 行为事件采集（f9/f10）
 *   - 超时检测定时器
 */
\n`;

const outPath = path.join(__dirname, 'cloudflare_deobfuscated.js');
fs.writeFileSync(outPath, header + result, 'utf8');

console.log(`\n🎯 输出文件：${outPath}`);
console.log(`📊 原始大小：${(src.length / 1024).toFixed(1)} KB`);
console.log(`📊 解混淆后：${((header + result).length / 1024).toFixed(1)} KB`);

// ──────────────────────────────────────────────
// 8. 打印字符串映射表到单独文件供参考
// ──────────────────────────────────────────────

let mapContent = '// Cloudflare c() 字符串映射表\n// c(index) => string\n\n';
mapContent += 'const STRING_MAP = {\n';
for (const [idx, str] of [...stringMap.entries()].sort((a, b) => a[0] - b[0])) {
  mapContent += `  ${idx}: ${escapeForJS(str)},\n`;
}
mapContent += '};\n\nmodule.exports = STRING_MAP;\n';

const mapPath = path.join(__dirname, 'cloudflare_strings.js');
fs.writeFileSync(mapPath, mapContent, 'utf8');
console.log(`📝 字符串映射表：${mapPath}`);
