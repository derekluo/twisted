import { Opcode } from "../constant.js";

class VM {
	private stack: any[];
	private globals: any[];
	private pc: number;
	private dependencies: object[];

	constructor(dependencies: object[]) {
		this.stack = [];
		this.globals = [];
		this.pc = 0;
		this.dependencies = dependencies;
	}

	execute(bytecode: number[]) {
		this.stack = [];
		this.globals = [];
		this.pc = 0;
		while (this.pc < bytecode.length) {
			const opcode = bytecode[this.pc];
			switch (opcode) {
				// stack commands
				case Opcode.Push:
					this.stack.push(bytecode[this.pc + 1]);
					this.pc += 1;
					break;
				case Opcode.Pop:
					this.stack.pop();
					break;
				// arithmetic commands
				case Opcode.Add:
					const a = this.stack.pop();
					const b = this.stack.pop();
					if (typeof a === "number" && typeof b === "number") {
						this.stack.push(a + b);
					} else {
						throw new Error("Invalid operands for Add");
					}
					break;
				case Opcode.Sub: {
					const a = this.stack.pop();
					const b = this.stack.pop();
					if (typeof a === "number" && typeof b === "number") {
						this.stack.push(a - b);
					} else {
						throw new Error("Invalid operands for Sub");
					}
					break;
				}
				case Opcode.Mul: {
					const a = this.stack.pop();
					const b = this.stack.pop();
					if (typeof a === "number" && typeof b === "number") {
						this.stack.push(a * b);
					} else {
						throw new Error("Invalid operands for Mul");
					}
					break;
				}
				case Opcode.Div: {
					const a = this.stack.pop();
					const b = this.stack.pop();
					if (typeof a === "number" && typeof b === "number") {
						this.stack.push(a / b);
					} else {
						throw new Error("Invalid operands for Div");
					}
					break;
				}
				// control flow commands
				case Opcode.Jmp: {
					const target = bytecode[this.pc + 1];
					this.pc = target;
					break;
				}
				case Opcode.JmpIf: {
					const condition = this.stack.pop();
					const target = bytecode[this.pc + 1];
					if (condition) {
						this.pc = target;
					} else {
						this.pc += 1;
					}
					break;
				}
				// global commands
				case Opcode.Store: {
					const value = this.stack.pop();
					const index = bytecode[this.pc + 1];
					this.globals[index] = value;
					this.pc += 1;
					break;
				}
				case Opcode.Load: {
					const index = bytecode[this.pc + 1];
					const value = this.globals[index];
					this.stack.push(value);
					this.pc += 1;
					break;
				}
				case Opcode.Call: {
					const argsLength = bytecode[this.pc + 1];
					var args = [];
					for (let i = 0; i < argsLength; i++) {
						args.push(this.stack.pop());
					}
					args.reverse();
					const dependency = this.stack.pop();
					console.log("🤖 Calling dependency: %s", dependency);
					dependency(...args);
					this.pc += 1;
					break;
				}
				case Opcode.Dependency: {
					const index = bytecode[this.pc + 1];
					const dependency = this.dependencies[index];
					console.log("🤖 Dependency index: %s, dependency: %s", index);
					this.stack.push(dependency);
					this.pc += 1;
					break;
				}
				case Opcode.Property: {
					const dependency = this.stack.pop();
					const property = bytecode[this.pc + 1];
					this.stack.push(dependency[property]);
					this.pc += 1;
					break;
				}
			}
			this.pc += 1;
		}
		return this.stack[this.stack.length - 1];
	}
}

export default VM;
