import { Opcode } from "../constant.js";
import Context from "./context/context.js";
import Frame from "./context/frame/frame.js";
import BytecodeReader from "./reader.js";

/** 闭包值的运行时标记 */
interface ClosureValue {
	$pc: number;
	$caps: unknown[];
}

function isClosure(v: unknown): v is ClosureValue {
	return typeof v === "object" && v !== null && "$pc" in v;
}

class VM {
	private context: Context;
	private reader: BytecodeReader;
	private dependencies: object[];
	private meta: string[];

	constructor(bytecode: number[], meta: string[] = [], dependencies: object[] = [window, console]) {
		this.context = new Context();
		this.reader = new BytecodeReader(bytecode);
		this.dependencies = dependencies;
		this.meta = meta;
	}

	public async execute() {
		while (this.reader.hasNext()) {
			const opcode = this.reader.read();
			await this._execute(opcode);
		}
		return this.context.frame.stack.peek();
	}

	private async _execute(opcode: Opcode) {
		switch (opcode) {
			case Opcode.Push:
				this.context.frame.stack.push(this.reader.read());
				break;
			case Opcode.Pop:
				this.context.frame.stack.pop();
				break;
			case Opcode.Add:
				const a = this.context.frame.stack.pop();
				const b = this.context.frame.stack.pop();
				if (typeof a === "number" && typeof b === "number") {
					this.context.frame.stack.push(a + b);
				} else if (typeof a === "string" || typeof b === "string") {
					this.context.frame.stack.push(String(b) + String(a));
				} else {
					throw new Error("Invalid operands for Add");
				}
				break;
			case Opcode.Sub: {
				const a = this.context.frame.stack.pop();
				const b = this.context.frame.stack.pop();
				if (typeof a === "number" && typeof b === "number") {
					this.context.frame.stack.push(a - b);
				} else {
					throw new Error("Invalid operands for Sub");
				}
				break;
			}
			case Opcode.Mul: {
				const a = this.context.frame.stack.pop();
				const b = this.context.frame.stack.pop();
				if (typeof a === "number" && typeof b === "number") {
					this.context.frame.stack.push(a * b);
				} else {
					throw new Error("Invalid operands for Mul");
				}
				break;
			}
			case Opcode.Div: {
				const a = this.context.frame.stack.pop();
				const b = this.context.frame.stack.pop();
				if (typeof a === "number" && typeof b === "number") {
					this.context.frame.stack.push(a / b);
				} else {
					throw new Error("Invalid operands for Div");
				}
				break;
			}
			case Opcode.Equal: {
				const a = this.context.frame.stack.pop();
				const b = this.context.frame.stack.pop();
				this.context.frame.stack.push(a === b);
				break;
			}
			case Opcode.BitOr: {
				const a = this.context.frame.stack.pop();
				const b = this.context.frame.stack.pop();
				if (typeof a === "number" && typeof b === "number") {
					this.context.frame.stack.push(b | a);
				} else {
					throw new Error("Invalid operands for BitOr");
				}
				break;
			}
			case Opcode.BitXor: {
				const a = this.context.frame.stack.pop();
				const b = this.context.frame.stack.pop();
				if (typeof a === "number" && typeof b === "number") {
					this.context.frame.stack.push(b ^ a);
				} else {
					throw new Error("Invalid operands for BitXor");
				}
				break;
			}
			case Opcode.ShiftLeft: {
				const a = this.context.frame.stack.pop();
				const b = this.context.frame.stack.pop();
				if (typeof a === "number" && typeof b === "number") {
					this.context.frame.stack.push(b << a);
				} else {
					throw new Error("Invalid operands for ShiftLeft");
				}
				break;
			}
			case Opcode.ShiftRightUnsigned: {
				const a = this.context.frame.stack.pop();
				const b = this.context.frame.stack.pop();
				if (typeof a === "number" && typeof b === "number") {
					this.context.frame.stack.push(b >>> a);
				} else {
					throw new Error("Invalid operands for ShiftRightUnsigned");
				}
				break;
			}
			case Opcode.LessThan: {
				const a = this.context.frame.stack.pop();
				const b = this.context.frame.stack.pop();
				this.context.frame.stack.push(b < a);
				break;
			}
			case Opcode.Jmp: {
				const target = this.reader.read();
				this.reader.jump(target);
				break;
			}
			case Opcode.JmpIf: {
				const condition = this.context.frame.stack.pop();
				const target = this.reader.read();
				if (condition) {
					this.reader.jump(target);
				}
				break;
			}
			case Opcode.Store: {
				const value = this.context.frame.stack.pop();
				const index = this.reader.read();
				this.context.frame.variables.set(index, value);
				break;
			}
			case Opcode.Load: {
				const index = this.reader.read();
				const value = this.context.frame.variables.get(index);
				this.context.frame.stack.push(value);
				break;
			}
			case Opcode.LoadMeta: {
				const index = this.reader.read();
				const value = this.meta[index];
				this.context.frame.stack.push(value);
				break;
			}
			case Opcode.Apply: {
				const func = this.context.frame.stack.pop();
				const thisVal = this.context.frame.stack.pop();
				const args = this.context.frame.stack.pop() as unknown[];
				if (isClosure(func)) {
					// 闭包作为 method 被调用（如 window.fetch = function(...){}），忽略 this
					const returnPc = this.reader.getPc();
					const frame = new Frame(returnPc, args, func.$caps);
					this.context.pushFrame(frame);
					this.reader.jump(func.$pc);
				} else {
					const ret = await Promise.resolve((func as Function).apply(thisVal, args));
					this.context.frame.stack.push(ret);
				}
				break;
			}
			case Opcode.Await: {
				const value = this.context.frame.stack.pop();
				const awaited = await Promise.resolve(value);
				this.context.frame.stack.push(awaited);
				break;
			}
			case Opcode.Construct: {
				const _ctor = this.context.frame.stack.pop();
				const _args = this.context.frame.stack.pop();
				const _instance = Reflect.construct(_ctor as Function, _args as unknown[]);
				this.context.frame.stack.push(_instance);
				break;
			}
			case Opcode.Dependency: {
				const index = this.reader.read();
				const dependency = this.dependencies[index];
				console.log("🤖 Dependency index: %s, dependency: %s", index);
				this.context.frame.stack.push(dependency);
				break;
			}
			case Opcode.Property: {
				const dependency = this.context.frame.stack.pop();
				const propertyIndex = this.reader.read();
				const property = this.meta[propertyIndex];
				console.log("🤖 Property: %s", property);
				this.context.frame.stack.push(dependency[property]);
				break;
			}
			case Opcode.SetProperty: {
				const value = this.context.frame.stack.pop();
				const object = this.context.frame.stack.pop();
				const propertyIndex = this.reader.read();
				const property = this.meta[propertyIndex];
				object[property] = value;
				this.context.frame.stack.push(value);
				break;
			}
			case Opcode.GetElement: {
				const key = this.context.frame.stack.pop();
				const object = this.context.frame.stack.pop();
				this.context.frame.stack.push(object[key]);
				break;
			}
			case Opcode.SetElement: {
				const value = this.context.frame.stack.pop();
				const key = this.context.frame.stack.pop();
				const object = this.context.frame.stack.pop();
				object[key] = value;
				this.context.frame.stack.push(value);
				break;
			}
			case Opcode.PushFrame: {
				// 调用约定：PushFrame 后紧跟 Jmp target（共 2 字节）。
				// 返回地址 = getPc() + 2，即 Jmp 指令整体之后的首字节。
				const args = this.context.frame.stack.pop();
				const returnPc = this.reader.getPc() + 2;
				const frame = new Frame(returnPc, args);
				this.context.pushFrame(frame);
				break;
			}
			case Opcode.PopFrame: {
				const frame = this.context.popFrame();
				this.reader.jump(frame.getTracebackPc());
				this.context.frame.stack.push(frame.stack.pop());
				break;
			}
			case Opcode.BuildArray: {
				const length = this.reader.read();
				console.log("🤖 BuildArray: %s", length);
				const array = [];
				for (let i = 0; i < length; i++) {
					array.unshift(this.context.frame.stack.pop());
				}
				this.context.frame.stack.push(array);
				break;
			}
			case Opcode.BuildObject: {
				const length = this.reader.read();
				console.log("🤖 BuildObject: %s", length);
				const object: Record<string, unknown> = {};
				for (let i = 0; i < length; i++) {
					const value = this.context.frame.stack.pop();
					const key = this.context.frame.stack.pop();
					object[key] = value;
				}
				this.context.frame.stack.push(object);
				break;
			}
			case Opcode.LoadParameter: {
				const index = this.reader.read();
				const parameter = this.context.frame.getParameter(index);
				this.context.frame.stack.push(parameter);
				break;
			}
			// ── 闭包扩展 ──────────────────────────────────────────────────
			case Opcode.MakeClosure: {
				// 格式：MakeClosure <entryPc> <numCaptures> [slot0 slot1 ...]
				// 从当前帧按槽位快照外层局部变量，生成闭包值推入栈
				const entryPc = this.reader.read();
				const numCaptures = this.reader.read();
				const caps: unknown[] = [];
				for (let i = 0; i < numCaptures; i++) {
					const slot = this.reader.read();
					caps.push(this.context.frame.variables.get(slot));
				}
				this.context.frame.stack.push({ $pc: entryPc, $caps: caps } as ClosureValue);
				break;
			}
			case Opcode.LoadCapture: {
				// 从当前帧的 captures 数组按下标加载捕获值
				const index = this.reader.read();
				this.context.frame.stack.push(this.context.frame.captures[index]);
				break;
			}
			case Opcode.InvokeValue: {
				// 调用栈上的函数值（闭包或原生函数），无 this
				// 栈序：args(下) func(上)
				const func = this.context.frame.stack.pop();
				const args = this.context.frame.stack.pop() as unknown[];
				if (isClosure(func)) {
					// 闭包：建帧、带入捕获、跳入函数体
					const returnPc = this.reader.getPc();
					const frame = new Frame(returnPc, args, func.$caps);
					this.context.pushFrame(frame);
					this.reader.jump(func.$pc);
				} else {
					// 原生函数
					const ret = await Promise.resolve((func as Function).apply(undefined, args));
					this.context.frame.stack.push(ret);
				}
				break;
			}
		case Opcode.Not: {
			const val = this.context.frame.stack.pop();
			this.context.frame.stack.push(!val);
			break;
		}
		case Opcode.Halt:
			break;
	}
	}
}

export default VM;
