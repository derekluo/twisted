import { describe, it, expect } from "vitest";
import Compiler from "../src/compiler/compiler.js";
import { Opcode, OPCODE_NAMES } from "../src/constant.js";
import { ArgKind, type Instruction } from "../src/instruction.js";

function compile(source: string): Instruction[] {
	return new Compiler(source).compile();
}

/** 最后一条须为 Halt（compile 末尾固定追加） */
function expectEndsWithHalt(ir: Instruction[]) {
	expect(ir.length).toBeGreaterThan(0);
	const last = ir[ir.length - 1];
	expect(last.opcode).toBe(Opcode.Halt);
	expect(last.args).toEqual([]);
}

describe("Compiler / 基础", () => {
	it("空程序仍生成 Halt", () => {
		const ir = compile("");
		expectEndsWithHalt(ir);
		expect(ir.length).toBe(1);
	});

	it("不支持的语句类型会抛错", () => {
		expect(() => compile("class A {}")).toThrow(/Unsupported statement type/);
	});
});

describe("Compiler / 字面量与表达式", () => {
	it("数字字面量 1 + 2 生成 Push, Push, Add", () => {
		const ir = compile("1 + 2;");
		expect(ir[0].opcode).toBe(Opcode.Push);
		expect(ir[0].args[0].kind).toBe(ArgKind.Number);
		expect(ir[0].args[0].value).toBe(1);
		expect(ir[1].opcode).toBe(Opcode.Push);
		expect(ir[1].args[0].value).toBe(2);
		expect(ir[2].opcode).toBe(Opcode.Add);
		expectEndsWithHalt(ir);
	});

	it("字符串字面量 Push(String)", () => {
		// 注意：顶层 `"hello";` 会被 Babel 解析为 directive，无语句体；用括号避免
		const ir = compile(`("hello");`);
		expect(ir[0].opcode).toBe(Opcode.Push);
		expect(ir[0].args[0].kind).toBe(ArgKind.String);
		expect(ir[0].args[0].value).toBe("hello");
		expectEndsWithHalt(ir);
	});

	it("布尔字面量", () => {
		const ir = compile("true;");
		expect(ir[0].opcode).toBe(Opcode.Push);
		expect(ir[0].args[0].kind).toBe(ArgKind.Number);
		expect(ir[0].args[0].value).toBe(1);
		expectEndsWithHalt(ir);
	});

	it("null 为 PushNull", () => {
		const ir = compile("null;");
		expect(ir[0].opcode).toBe(Opcode.PushNull);
		expect(ir[0].args).toEqual([]);
		expectEndsWithHalt(ir);
	});

	it("一元 ! 生成 Not", () => {
		const ir = compile("!false;");
		expect(ir[0].opcode).toBe(Opcode.Push);
		expect(ir[1].opcode).toBe(Opcode.Not);
		expectEndsWithHalt(ir);
	});

	it("一元负数字面量 -1 为单条 Push(-1)", () => {
		const ir = compile("-1;");
		expect(ir[0].opcode).toBe(Opcode.Push);
		expect(ir[0].args[0].kind).toBe(ArgKind.Number);
		expect(ir[0].args[0].value).toBe(-1);
		expectEndsWithHalt(ir);
	});
});

describe("Compiler / 二元运算 opcode", () => {
	const cases: { code: string; expected: Opcode }[] = [
		{ code: "1 - 2;", expected: Opcode.Sub },
		{ code: "2 * 3;", expected: Opcode.Mul },
		{ code: "8 / 2;", expected: Opcode.Div },
		{ code: "1 === 1;", expected: Opcode.Equal },
		{ code: "1 < 2;", expected: Opcode.LessThan },
		{ code: "2 <= 2;", expected: Opcode.LessThanOrEqual },
		{ code: "1 | 2;", expected: Opcode.BitOr },
		{ code: "3 ^ 3;", expected: Opcode.BitXor },
		{ code: "1 << 2;", expected: Opcode.ShiftLeft },
		{ code: "8 >>> 2;", expected: Opcode.ShiftRightUnsigned },
	];

	for (const { code, expected } of cases) {
		it(`\`${code.trim()}\` → ${OPCODE_NAMES[expected] ?? expected}`, () => {
			const ir = compile(code);
			expect(ir[2].opcode).toBe(expected);
			expectEndsWithHalt(ir);
		});
	}
});

describe("Compiler / 变量", () => {
	it("const 声明与 Load", () => {
		const ir = compile(`
			const a = 1;
			a;
		`);
		const push = ir.findIndex((i) => i.opcode === Opcode.Push && i.args[0]?.value === 1);
		expect(push).toBeGreaterThanOrEqual(0);
		expect(ir[push + 1].opcode).toBe(Opcode.Store);
		expect(ir[push + 1].args[0].kind).toBe(ArgKind.Variable);
		const loadIdx = ir.findIndex((i) => i.opcode === Opcode.Load);
		expect(loadIdx).toBeGreaterThan(0);
		expect(ir[loadIdx].args[0].kind).toBe(ArgKind.Variable);
		expectEndsWithHalt(ir);
	});
});

describe("Compiler / 控制流", () => {
	it("if (true) 分支含 JmpIf 与 Jmp", () => {
		const ir = compile(`
			if (true) {
				1;
			}
		`);
		const opcodes = ir.map((i) => i.opcode);
		expect(opcodes).toContain(Opcode.JmpIf);
		expect(opcodes).toContain(Opcode.Jmp);
		expect(opcodes.filter((o) => o === Opcode.Jmp).length).toBeGreaterThanOrEqual(1);
		expectEndsWithHalt(ir);
	});

	it("DynAddr 回填为 IR 下标（数字）", () => {
		const ir = compile(`
			if (true) {
				1;
			}
		`);
		const dyn = ir.flatMap((i) => i.args).filter((a) => a.kind === ArgKind.DynAddr);
		expect(dyn.length).toBeGreaterThan(0);
		for (const a of dyn) {
			expect(typeof a.value).toBe("number");
			expect(a.value).toBeGreaterThanOrEqual(0);
			expect(a.value).toBeLessThan(ir.length);
		}
	});
});

describe("Compiler / 函数声明", () => {
	it("含 function 时存在 Jmp 跳过函数体", () => {
		const ir = compile(`
			function f() {
				return 1;
			}
			2;
		`);
		const opcodes = ir.map((i) => i.opcode);
		expect(opcodes).toContain(Opcode.Jmp);
		expect(opcodes).toContain(Opcode.PopFrame);
		expectEndsWithHalt(ir);
	});
});

describe("Compiler / Debugger", () => {
	it("debugger 语句生成 Debugger", () => {
		const ir = compile("debugger;");
		expect(ir[0].opcode).toBe(Opcode.Debugger);
		expectEndsWithHalt(ir);
	});
});
