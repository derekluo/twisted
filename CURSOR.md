# Cursor IDE 配置文档

本文档为 Cursor IDE 提供项目特定的开发规则和提示。

## 项目概述（整体设计 & 当前仓库）

Twisted 是一个反爬虫虚拟机系统，从整体设计上包含三个核心模块：
- **Encoder**: JavaScript 到字节码的编译器
- **Runtime**: 栈式虚拟机（目标形态为 Rust，实现阶段使用 TypeScript VM 原型）
- **OLLVM**: JavaScript 代码混淆器

整个编译与执行管线可以概括为：

- **JavaScript 源码 → Babel AST → IR（中间表示）→ Bytecode 数组 → VM 执行**

其中 **IR（中间层）** 是本项目的核心设计之一：

- **唯一中间表示**：Encoder 不直接从 AST 生成字节码，而是先生成字典结构的 IR（Dict IR），所有后续优化、混淆、FLA 等都在 IR 上操作；
- **稳定抽象层**：VM 只关心线性字节码，IR 层屏蔽了 AST 细节与混淆策略，便于后续替换前端（例如支持更多 JS 语法）而不影响 VM；
- **可标注/可分析**：IR 的 Block、Instruction、Arg 都可以挂载 `tags`，用于指纹采集、反调试、控制不同区域的混淆强度；
- **规范位置**：IR 的完整字段与示例定义在 `docs/ir.md`，新增 Pass / 修改指令集时需要优先与该文件保持一致。

> 当前这个仓库是 Twisted 的 **TypeScript 实现原型**，在单一包中集成了 Encoder、TypeScript VM 以及部分 OLLVM 能力，文件结构见下文。

## 当前仓库结构与模块

核心代码位于 `src/` 目录，整体结构如下：

```text
src/
├── constant.ts           # Opcode / Header 等常量定义
├── index.ts              # 示例入口：演示 Compiler 输出 IR
├── compiler/
│   ├── compiler.ts       # JS 源码 → Instruction[] IR 的编译器
│   └── instruction.ts    # IR 结构 (Instruction/Arg) 与 createInstruction 工厂
├── assembler/
│   └── assembler.ts      # 预留：IR → Bytecode 汇编器（待实现）
├── vm/
│   └── vm.ts             # TypeScript 栈式虚拟机，执行字节码
├── obfuscator/
│   ├── base.js           # AST 混淆器基础类（基于 Babel）
│   └── passes/
│       └── base.js       # 预留：混淆 Pass 基类
└── utils/
    ├── bytecode.js       # 十进制/十六进制与字节数组互转工具
    └── file.js           # 文件读写工具
```

辅助文档位于 `docs/`：

- `docs/ir.md`: IR（Block/Instruction/Arg）的结构定义与示例
- `docs/workflow.md`: 编译、混淆、部署整体工作流设计

## 开发规则

### JavaScript 代码规范 (Encoder/OLLVM)

1. **模块系统**: 使用 ES6+ 模块 (`import`/`export`)
2. **AST处理**: 使用 `@babel/types` 进行类型检查
3. **命名规范**:
   - 类名: PascalCase (`Compiler`)
   - 方法名: camelCase (`compileExpr`)
   - 常量: UPPER_SNAKE_CASE (`MAX_STACK_SIZE`)

4. **编译器开发**:
   - 使用递归下降遍历AST
   - 支持作用域管理（全局/局部变量）
   - 节点类型检查使用字符串比较: `node.type === "TypeName"`
   - 字节码生成格式: `[Opcode] [Type] [Value...]`

### TypeScript VM 规范（当前仓库 Runtime 实现）

1. **位置**: 虚拟机实现位于 `src/vm/vm.ts`
2. **操作码定义**: 所有 Opcode 在 `src/constant.ts` 的 `OPCODE` 枚举中定义，必须与编译器保持同步
3. **执行模型**:
   - 使用 `pc`（program counter）跟踪执行位置
   - 通过 `stack`、`locals`、`globals` 三个数组维护栈和变量
4. **指令实现**:
   - 在 `execute(bytecode: number[])` 的 `switch (opcode)` 中实现
   - 新增 Opcode 时，必须：
     - 在 `src/constant.ts` 中增加枚举值
     - 在 `src/vm/vm.ts` 中实现执行逻辑
     - 在 `src/compiler/compiler.ts` 中生成对应 IR 指令

### Rust 代码规范 (未来 Runtime 形态)

> 这一小节描述的是 **目标架构中的 Rust Runtime 规范**，当前仓库并未包含 Rust 代码，未来拆分仓库或新增 `runtime/` 时可直接复用。

1. **枚举定义**: 使用 `#[repr(u8)]` 支持字节转换
2. **错误处理**: 使用 `Option<Value>` 或 `Result` 类型
3. **操作码**: 定义为 `u8` 类型
4. **模块组织**: 操作码定义在 `vm/opcode.rs`，实现 logic 在 `vm.rs`

### 调试和日志

使用emoji前缀区分日志类型:
- 🔍 查找/搜索操作
- 📝 节点处理
- 🔧 编译操作
- ⚡ 指令生成
- 🎯 最终结果
- ❌ 错误信息

## 代码生成提示

### 添加新操作码（基于当前 TypeScript 实现）

当需要为 **当前仓库的 VM 原型** 添加新的操作码时：

1. **在 `src/constant.ts` 中定义枚举值**:
```ts
const enum OPCODE {
  // ... 现有操作码
  Mul = 0x06,  // 新增
}
```

2. **在 `src/vm/vm.ts` 中实现执行逻辑**:
```ts
switch (opcode) {
  // ...
  case OPCODE.Mul: {
    const a = this.stack.pop();
    const b = this.stack.pop();
    // 实现逻辑
    break;
  }
}
```

3. **在 `src/compiler/compiler.ts` 中生成对应 IR 指令**:
```ts
const operatorMap: Record<string, OPCODE> = {
  // ...
  "*": OPCODE.Mul, // 新增
};
```

> 如果未来接入 Rust Runtime 仓库，可参考“Rust 代码规范 (Runtime)”一节中的路径和示例，在 Rust 端同步增加操作码定义与执行逻辑。

### 扩展编译器语法支持

添加新的AST节点类型支持:

```javascript
compileNode(node) {
    switch (node.type) {
        case "YourNewNodeType":
            this.compileYourNewNode(node)
            break
    }
}
```

### 作用域管理（编译器）

当前编译器在 `src/compiler/compiler.ts` 中使用 Babel 的 `scope` 信息来区分全局变量与局部变量：

- 通过 `path.scope.getBinding(varName)` 获取变量绑定
- 使用 `binding.scope.path.isProgram()` 判断是否为全局变量
- 全局变量索引记录在 `this.globals: Map<string, number>` 中，并映射到 `OPCODE.GlobalStore / OPCODE.GlobalLoad`

后续如果实现完整作用域栈，可参考以下思路：

- 使用作用域栈 (`scopeStack`) 管理作用域层级
- 进入作用域: `enterScope()` - 创建新作用域并入栈
- 退出作用域: `exitScope()` - 弹出当前作用域
- 查找变量: `findVariable(name)` - 从当前作用域向上查找

## 字节码与 IR 对应关系（当前原型）

- 具体字节码编码规则在 `docs/ir.md` 和 `docs/workflow.md` 中有更详细说明；
- 目前仓库中已经实现的是 **Opcode 枚举（`src/constant.ts`）和 VM 执行逻辑（`src/vm/vm.ts`）**；
- IR 侧使用的是 **线性 `Instruction[]` 形式**，由 `src/compiler/compiler.ts` 生成。

推荐开发流程：

1. 确认/更新 `docs/ir.md` 中的 IR 约定；
2. 在 `compiler.ts` 里生成对应的 `Instruction`；
3. 在 `assembler/assembler.ts` 中将 IR 编码为字节码数组（规划中）；
4. 在 `vm.ts` 中消费这些字节码。

## 常见问题解决

### Q: 如何调试字节码生成？
A: 编译器会输出十六进制字节码，使用 `console.log` 查看生成的指令序列。

### Q: 作用域栈如何工作？
A: 
- 进入函数/块时调用 `enterScope()` push新作用域
- 退出时调用 `exitScope()` pop当前作用域
- 查找变量时从 `currentScope` 向上遍历 `parent` 链

### Q: 如何处理未定义的变量？
A: `findVariable()` 返回 `null` 时应输出错误并跳过该变量。

### Q: 如何确保编译器与VM操作码同步？
A: 操作码值定义在 `runtime/src/vm/opcode.rs`，编译器中的操作码映射必须与之匹配。

## 反爬虫特性开发指南

### 当前支持
- 字节码编译（隐藏源代码逻辑）
- 栈式执行（难以静态分析）

### 计划实现
- 动态Opcode映射（每次执行不同）
- 字节码加密（部署时加密）
- 反调试检测（检测调试器）
- 环境指纹（动态密钥生成）

### 开发原则
- 安全性优先，但不能影响性能过多
- 混淆不能破坏代码功能
- 虚拟机必须正确执行混淆后的字节码

## 文件结构提示（当前仓库）

```text
src/
├── constant.ts           # Opcode / Header 等枚举
├── index.ts              # 示例入口（编译并打印 IR）
├── compiler/
│   ├── compiler.ts       # 编译器主类，基于 Babel AST 生成 Instruction[]
│   └── instruction.ts    # IR 结构与 createInstruction 工厂
├── assembler/
│   └── assembler.ts      # 预留：IR → Bytecode 汇编逻辑
├── vm/
│   └── vm.ts             # 栈式虚拟机实现
├── obfuscator/
│   ├── base.js           # 混淆器基类（使用 Babel parser/generator）
│   └── passes/           # 预留混淆 Pass
└── utils/
    ├── bytecode.js       # 十六进制/十进制 ↔ 字节码数组转换
    └── file.js           # 文件读写工具
```

## 代码审查检查点

1. ✅ 操作码值是否唯一且连续？
2. ✅ 字节码格式是否符合规范？
3. ✅ 错误处理是否完善？
4. ✅ 作用域管理是否正确？
5. ✅ 调试日志是否清晰？
6. ✅ 代码注释是否充分？

## 测试指南

- 使用 `files/test.js` 作为测试用例
- 编译后检查字节码格式是否正确
- 在VM中执行验证结果
- 确保局部/全局变量正确处理

## 提交规范

提交信息格式: `<类型>: <简短描述>`

类型:
- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `refactor`: 重构
- `test`: 测试相关

示例: `feat: 添加乘法操作码支持`
