import Variables from "./variables.js";

/**
 * 变量绑定解析结果：
 * - local   当前帧局部槽
 * - upvalue 外层闭包捕获，index 为 captures[] 下标
 */
export type Binding = { kind: "local"; slot: number } | { kind: "upvalue"; index: number };

class Scope {
	private variables: Variables;
	public parent?: Scope;

	constructor(parent?: Scope) {
		this.variables = new Variables();
		this.parent = parent;
	}

	public declare(name: string): void {
		this.variables.declare(name);
	}

	public resolve(name: string): number {
		return this.variables.resolve(name);
	}

	/**
	 * 词法绑定解析（仅在函数表达式上下文中使用）。
	 * - 当前作用域找到 → local
	 * - 父作用域直接找到 → upvalue（addCapture 登记槽位，返回 captureIndex）
	 * - 更外层目前不支持嵌套捕获
	 */
	public resolveBinding(name: string, addCapture: (outerSlot: number) => number): Binding {
		const local = this.variables.tryResolve(name);
		if (local !== undefined) {
			return { kind: "local", slot: local };
		}
		if (!this.parent) {
			throw new Error(`Undefined variable: ${name}`);
		}
		const outerSlot = this.parent.variables.tryResolve(name);
		if (outerSlot !== undefined) {
			return { kind: "upvalue", index: addCapture(outerSlot) };
		}
		throw new Error(`Nested closure capture is not supported: ${name}`);
	}
}

export default Scope;
