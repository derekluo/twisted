# 闭包实现原理

本文档记录 Twisted 项目中闭包功能的完整开发逻辑，涵盖编译器、虚拟机两侧的设计决策和实现细节。

---

## 一、什么是闭包（概念回顾）

闭包 = **函数体** + **词法环境快照**。

```javascript
function outer() {
    const x = 10;            // 外层变量
    return function inner() {
        return x + 1;        // inner 捕获了 x
    };
}
const f = outer();
f(); // 11 —— x 在 outer 返回后仍然存活
```

关键点：`inner` 被创建时，需要把 `x` 的**当前值**"打包"进去，使其生命周期超过 `outer` 的栈帧。

---

## 二、整体架构

```
JavaScript 源码
      │  (Babel AST)
      ▼
  Compiler (compiler.ts)
      │  生成 IR 指令流
      ▼
  Assembler (bulldozer)
      │  回填地址，输出字节码
      ▼
  VM (vm.ts)
      │  逐字节执行
      ▼
  运行结果
```

闭包相关的改动横跨**编译器**和**虚拟机**两层，二者通过新增的三条操作码协作。

---

## 三、新增操作码

| 操作码 | 编号 | 作用 |
|---|---|---|
| `MakeClosure` | `0x1f` | 在**当前帧**快照若干局部槽位，生成 `ClosureValue` 推入栈 |
| `LoadCapture`  | `0x20` | 从**当前帧** `captures[]` 按下标取出捕获值推入栈 |
| `InvokeValue`  | `0x21` | 调用栈顶的函数值，自动区分**闭包**和**原生函数** |

定义位置：`src/constant.ts`

---

## 四、运行时闭包值（ClosureValue）

VM 中用一个普通对象表示"闭包值"：

```typescript
// src/vm/vm.ts
interface ClosureValue {
    $pc:   number;    // 函数体入口字节码地址
    $caps: unknown[]; // 捕获变量的快照数组（按顺序）
}

function isClosure(v: unknown): v is ClosureValue {
    return typeof v === "object" && v !== null && "$pc" in v;
}
```

`$pc` 是跳转目标，`$caps` 是捕获变量的**值快照**（当前实现为值拷贝，非引用）。

---

## 五、编译器侧实现

### 5.1 作用域链（Scope Chain）

**文件**：`src/compiler/context/scope.ts/scope.ts`

每个 `Scope` 持有一个指向父作用域的 `parent` 引用，由 `Context.enter()` 在进入新作用域时注入：

```typescript
// context.ts
public enter() {
    const parent = this.scopes[this.scopes.length - 1]; // 当前最内层作用域
    const scope = new Scope(parent);                    // 新作用域记录父亲
    this.scopes.push(scope);
}
```

这样就建立了一条**词法作用域链**：全局 → 函数 → 内层函数 → ...

### 5.2 变量绑定解析（resolveBinding）

普通标识符解析（`scope.resolve`）只查**当前作用域**，在闭包内部需要穿越作用域边界，因此新增了 `resolveBinding`：

```typescript
// scope.ts
public resolveBinding(name: string, addCapture: (outerSlot: number) => number): Binding {
    // 1. 先查当前作用域（局部变量/参数）
    const local = this.variables.tryResolve(name);
    if (local !== undefined) {
        return { kind: "local", slot: local };
    }
    // 2. 查父作用域（外层函数的局部变量）
    if (!this.parent) throw new Error(`Undefined variable: ${name}`);
    const outerSlot = this.parent.variables.tryResolve(name);
    if (outerSlot !== undefined) {
        // addCapture 把外层槽位登记到 closureCaptures[]，返回 captures 下标
        return { kind: "upvalue", index: addCapture(outerSlot) };
    }
    // 3. 更深层暂不支持（需嵌套 upvalue 链，当前 POC 不实现）
    throw new Error(`Nested closure capture is not supported: ${name}`);
}
```

返回的 `Binding` 有两种形态：

- `{ kind: "local", slot: N }` → 变量在**本帧**局部变量表，用 `Load N` 读取
- `{ kind: "upvalue", index: I }` → 变量是从外层捕获的，用 `LoadCapture I` 读取

### 5.3 compileFunctionExpression

**文件**：`src/compiler/compiler.ts`

这是闭包编译的核心方法，生成的字节码布局如下：

```
Jmp  L_END          ← 跳过函数体（函数体不会在定义时执行）
[L_START:]          ← 函数体入口（MakeClosure 会记录此地址）
  LoadParameter 0   ← 加载参数
  LoadParameter 1
  ...
  <函数体指令>
  PopFrame          ← 函数体末尾无 return 时的默认出口
[L_END:]
MakeClosure  L_START  <numCaptures>  [slot0  slot1  ...]
             ↑入口地址  ↑捕获数量      ↑外层各变量的槽位
```

**关键逻辑**：

```typescript
private compileFunctionExpression(node: FunctionExpression) {
    // ① 发射跳过函数体的 Jmp
    this.pushIr(createInstruction(Opcode.Jmp, [L_END]));

    // ② 进入内层作用域，开启捕获登记
    const savedCaptures = this.closureCaptures;  // 支持嵌套函数表达式
    this.closureCaptures = [];                   // 本层捕获列表清零
    this.context.enter();

    // ③ 编译参数、函数体
    ...

    // ④ 退出作用域，恢复外层捕获列表
    const capturedSlots = this.closureCaptures.slice();
    this.closureCaptures = savedCaptures;
    this.context.exit();

    // ⑤ 发射 MakeClosure 指令（携带捕获槽位信息）
    this.pushIr(createInstruction(Opcode.MakeClosure, [
        L_START,                    // 函数体入口地址
        capturedSlots.length,       // 捕获变量数量
        ...capturedSlots,           // 各槽位下标
    ]));
}
```

### 5.4 compileIdentifier（区分普通/闭包上下文）

```typescript
private compileIdentifier(node: Identifier) {
    if (this.closureCaptures !== null) {
        // 在函数表达式内部：走词法绑定解析
        const binding = this.context.scope.resolveBinding(node.name, (outerSlot) => {
            const idx = captures.indexOf(outerSlot);
            if (idx >= 0) return idx;      // 去重：已捕获过则复用
            captures.push(outerSlot);
            return captures.length - 1;
        });
        if (binding.kind === "local") {
            emit(Load, binding.slot);       // 本帧局部变量
        } else {
            emit(LoadCapture, binding.index); // 从 captures[] 取捕获值
        }
    } else {
        // 普通函数/全局上下文：只查当前作用域
        emit(Load, scope.resolve(node.name));
    }
}
```

`closureCaptures` 字段充当**上下文标志**：
- `null` → 当前在普通函数/全局，不涉及跨作用域捕获
- `number[]` → 当前在函数表达式内，自动登记外层变量

---

## 六、虚拟机侧实现

### 6.1 Frame 结构扩展

**文件**：`src/vm/context/frame/frame.ts`

```typescript
class Frame {
    public stack:      Stack;
    public variables:  Variables;  // 局部变量表
    public captures:   any[];      // ← 新增：本帧闭包捕获的外层值
    private parameters: any[];
    private tracebackPc?: number;

    constructor(tracebackPc?: number, parameters?: any[], captures?: any[]) {
        ...
        this.captures = captures ?? [];
    }
}
```

帧创建时，把 `ClosureValue.$caps` 直接传入 `captures`，这样函数体执行期间通过 `LoadCapture` 就能取到外层变量。

### 6.2 MakeClosure 指令

```
字节码格式：
  0x1f  entryPc  numCaptures  slot0  slot1  ...
```

VM 执行逻辑：

```typescript
case Opcode.MakeClosure: {
    const entryPc      = reader.read();
    const numCaptures  = reader.read();
    const caps: unknown[] = [];
    for (let i = 0; i < numCaptures; i++) {
        const slot = reader.read();
        caps.push(frame.variables.get(slot)); // 快照当前帧的局部变量值
    }
    frame.stack.push({ $pc: entryPc, $caps: caps });
    break;
}
```

执行完毕，栈上留下一个 `ClosureValue` 对象，供后续 `Store` 或直接调用。

### 6.3 LoadCapture 指令

```typescript
case Opcode.LoadCapture: {
    const index = reader.read();
    frame.stack.push(frame.captures[index]); // 从当前帧的 captures 取值
    break;
}
```

### 6.4 InvokeValue 指令（调用闭包或原生函数）

```
栈（执行前）：
  底 ... [args]  [func]  ← 栈顶
```

```typescript
case Opcode.InvokeValue: {
    const func = stack.pop();           // 弹出函数值
    const args = stack.pop();           // 弹出参数数组
    if (isClosure(func)) {
        // 闭包调用：新建帧（带捕获），跳入函数体
        const returnPc = reader.getPc();
        const newFrame = new Frame(returnPc, args, func.$caps);
        context.pushFrame(newFrame);
        reader.jump(func.$pc);
    } else {
        // 原生函数调用
        const ret = await (func as Function).apply(undefined, args);
        stack.push(ret);
    }
    break;
}
```

### 6.5 调用约定（PushFrame / PopFrame 修复）

正确的调用约定要求 `PopFrame` 能精确跳回**调用指令之后**，这里有一个关键细节：

```
字节码布局（函数声明调用）：

  offset N:   PushFrame          ← 保存返回地址
  offset N+1: Jmp  <target>      ← 跳入函数体（共 2 字节）
  offset N+3: <后续指令>         ← 应该返回到这里
```

`PushFrame` 执行时 `getPc()` 等于 `N+1`（已消费 opcode 字节），所以：

```typescript
// vm.ts PushFrame
const returnPc = this.reader.getPc() + 2; // 跳过紧随的 Jmp（1字节opcode + 1字节操作数）
```

`PopFrame` 直接跳到保存的地址：

```typescript
// vm.ts PopFrame
this.reader.jump(frame.getTracebackPc()); // 精确返回调用点之后
```

---

## 七、完整数据流示例

以下面的代码为例：

```javascript
function hookFetch(nativeFetch) {
    window.fetch = function(url, options) {
        // 使用了捕获的 nativeFetch
        return nativeFetch(url, options);
    };
}
hookFetch(window.fetch);
```

**编译阶段**：

1. 编译 `hookFetch` 函数声明，进入其作用域，`nativeFetch` 被分配槽位 0
2. 遇到 `function(url, options) { ... }`（函数表达式）：
   - 开启 `closureCaptures = []`，进入新作用域
   - 编译 `nativeFetch(url, options)` 时，`compileIdentifier("nativeFetch")` 调用 `resolveBinding`：
     - 当前作用域没有 `nativeFetch`
     - 父作用域（hookFetch 的作用域）有 `nativeFetch`，槽位 = 0
     - 登记到 `closureCaptures = [0]`，返回 `{ kind: "upvalue", index: 0 }`
     - 生成 `LoadCapture 0`
   - 退出作用域，`capturedSlots = [0]`
   - 生成 `MakeClosure <L_START> 1 0`（入口地址、1个捕获、来自槽0）

**运行阶段**：

1. 执行 `MakeClosure`：读到 `entryPc=L_START`, `numCaptures=1`, `slot=0`
   - 从当前帧取 `variables[0]`（即 `nativeFetch` 的当前值，原生 `window.fetch`）
   - 推入 `{ $pc: L_START, $caps: [originalFetch] }`
2. `Store` 把闭包值存入 `window.fetch`（通过 `SetProperty`）
3. 之后调用 `window.fetch(url, options)` 触发 `Apply`：
   - `isClosure(func)` 为 true
   - 新建 `Frame(returnPc, [url, options], [originalFetch])`
   - 跳入 `L_START`
4. 函数体内 `LoadCapture 0`：从 `frame.captures[0]` 取出 `originalFetch`
5. 调用原生 `fetch`，`PopFrame` 返回结果

---

## 八、当前限制

| 限制 | 原因 | 后续方向 |
|---|---|---|
| 只支持**单层**捕获 | `resolveBinding` 只向上查一层 | 递归传递 upvalue 链 |
| 捕获为**值拷贝** | `$caps` 在 `MakeClosure` 时快照 | 引入 Upvalue Cell（共享引用） |
| 不支持闭包内**写回**外层变量 | 没有 `StoreCapture` 指令 | 增加 `StoreCapture` 操作码 |

---

## 九、相关文件索引

| 文件 | 职责 |
|---|---|
| `src/constant.ts` | 操作码定义（`MakeClosure` / `LoadCapture` / `InvokeValue`） |
| `src/compiler/context/scope.ts/variables.ts` | 变量表，提供 `tryResolve`（不报错的查找） |
| `src/compiler/context/scope.ts/scope.ts` | 作用域，实现 `resolveBinding` 词法绑定解析 |
| `src/compiler/context/context.ts` | 作用域栈，`enter()` 时传递 `parent` |
| `src/compiler/compiler.ts` | `compileFunctionExpression`、`compileIdentifier` 闭包编译逻辑 |
| `src/vm/context/frame/frame.ts` | 帧结构，新增 `captures` 字段 |
| `src/vm/vm.ts` | `MakeClosure` / `LoadCapture` / `InvokeValue` 执行逻辑 |
| `files/runtime_input.js` | 实际使用闭包的示例（`hookFetch`） |
