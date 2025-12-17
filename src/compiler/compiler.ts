import { default as traverse } from "@babel/traverse";
import * as parser from "@babel/parser";
import type { NodePath, Visitor } from "@babel/traverse";
import type { ParseResult } from "@babel/parser";

import {
	VariableDeclarator,
	Identifier,
	Function,
	NumericLiteral,
	BinaryExpression,
	CallExpression,
	LogicalExpression,
	ThrowStatement,
	MemberExpression,
	Expression,
	Program,
	Statement,
} from "@babel/types";
import { Opcode } from "../constant.js";
import { ArgKind, createInstruction, type Instruction } from "../instruction.js";

class Compiler {
	private program: Program;
	public ir: Instruction[];
	private globals: Map<string, number>;
	private globalIndex: number;
	private dependencies: string[];
	private consoleDependencyMethods: string[];

	constructor(source: string) {
		this.program = parser.parse(source, { sourceType: "module" }).program;
		this.ir = [];
		this.globals = new Map();
		this.globalIndex = 0;
		this.dependencies = ["window", "console"];
		this.consoleDependencyMethods = ["log", "warn", "error", "info", "debug"];
	}

	compile(): Instruction[] {
		if (!this.program) {
			throw new Error("Failed to parse program");
		}
		this.program.body.forEach(element => {
			this.compileStatement(element);
		});
		console.log("🤖 Compiled intermediate representation.");
		return this.ir;
	}

	private compileStatement(node: Statement) {
		switch (node.type) {
			case "ExpressionStatement":
				console.log("🤖 Compiling VariableDeclaration");
				break;
			default:
				throw new Error(`Unsupported statement type: ${node.type}`);
		}
	}

	private pushIr(instruction: Instruction) {
		this.ir.push(instruction);
	}
}

export default Compiler;