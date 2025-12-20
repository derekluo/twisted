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
import { ArgKind, createArg, createInstruction, type Instruction } from "../instruction.js";

class Compiler {
	private program: Program;
	public ir: Instruction[];
	private dependencies: string[];

	constructor(source: string) {
		this.program = parser.parse(source, { sourceType: "module" }).program;
		this.ir = [];
		this.dependencies = ["window", "console"];
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
				console.log("🤖 Compiling ExpressionStatement");
				this.compileExpression(node.expression);
				break;
			default:
				throw new Error(`Unsupported statement type: ${node.type}`);
		}
	}

	private compileExpression(node: Expression) {
		switch (node.type) {
			case "CallExpression":
				this.compileCallExpression(node as CallExpression);
				break;
			case "BinaryExpression":
				console.log("🤖 Compiling BinaryExpression");
				this.compileBinaryExpression(node as BinaryExpression);
				break;
			case "Identifier":
				this.compileIdentifier(node as Identifier);
				break;
			case "MemberExpression":
				this.compileMemberExpression(node as MemberExpression);
				break;
			case "NumericLiteral":
				this.compileNumericLiteral(node as NumericLiteral);
				break;
			default:
				throw new Error(`Unsupported expression type: ${node.type}`);
		}
	}

	private compileCallExpression(node: CallExpression) {
		switch (node.callee.type) {
			case "Identifier":
				this.compileIdentifier(node.callee as Identifier);
				break;
			case "MemberExpression":
				this.compileMemberExpression(node.callee as MemberExpression);
				break;
			case "CallExpression":
				this.compileCallExpression(node.callee as CallExpression);
				break;
			default:
				throw new Error(`Unsupported callee type: ${node.callee.type}`);
		}
		node.arguments.forEach(argument => {
			this.compileExpression(argument as Expression);
		});
		const ir = createInstruction(Opcode.Call, [createArg(ArgKind.ArgLength, node.arguments.length)]);
		this.pushIr(ir);
		console.log("🤖 Compiling CallExpression");
	}

	private compileIdentifier(node: Identifier) {
		console.log("🤖 Compiling Identifier name: %s", node.name);
	}

	private compileMemberExpression(node: MemberExpression) {
		const object = node.object;
		const property = node.property;
		switch (object.type) {
			case "Identifier":
				if (this.dependencies.includes(object.name)) {
					console.log("🤖 Identifier fetch dependency %s", object.name);
					const index = this.dependencies.indexOf(object.name);
					const ir = createInstruction(Opcode.Push, [createArg(ArgKind.Dependency, index)]);
					this.pushIr(ir);
				} else {
					this.compileIdentifier(object as Identifier);
				}
				break;
			case "MemberExpression":
				this.compileMemberExpression(object as MemberExpression);
				break;
			case "CallExpression":
				this.compileCallExpression(object as CallExpression);
				break;
			default:
				throw new Error(`Unsupported object type: ${object.type}`);
		}
		switch (property.type) {
			case "Identifier":
				console.log("🤖 Compiling MemberExpression property: %s", property.name);
				const ir = createInstruction(Opcode.Push, [createArg(ArgKind.Property, property.name)]);
				this.pushIr(ir);
				break;
			default:
				throw new Error(`Unsupported property type: ${property.type}`);
		}
		console.log("🤖 Compiling MemberExpression");
	}

	private compileNumericLiteral(node: NumericLiteral) {
		this.pushIr(createInstruction(Opcode.Push, [createArg(ArgKind.Number, node.value)]));
		console.log("🤖 Compiling NumericLiteral");
	}

	private compileBinaryExpression(node: BinaryExpression) {
		const left = node.left;
		const right = node.right;
		const operator = node.operator;
		this.compileExpression(left as Expression);
		this.compileExpression(right as Expression);
		switch (operator) {
			case "+":
				this.pushIr(createInstruction(Opcode.Add));
				break;
			case "-":
				this.pushIr(createInstruction(Opcode.Sub));
				break;
			default:
				throw new Error(`Unsupported operator: ${operator}`);
		}
	}

	private pushIr(instruction: Instruction) {
		this.ir.push(instruction);
	}
}

export default Compiler;