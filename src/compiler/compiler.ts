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
} from "@babel/types";
import { Opcode } from "../constant.js";
import { ArgKind, createInstruction, type Instruction } from "../instruction.js";

class Compiler {
	private ast: ParseResult;
	public ir: Instruction[];
	private globals: Map<string, number>;
	private globalIndex: number;
	private dependencies: string[];
	private consoleDependencyMethods: string[];

	constructor(source: string) {
		this.ast = parser.parse(source, { sourceType: "module" });
		this.ir = [];
		this.globals = new Map();
		this.globalIndex = 0;
		this.dependencies = ["window", "console"];
		this.consoleDependencyMethods = ["log", "warn", "error", "info", "debug"];
	}

	compile(): Instruction[] {
		traverse.default(this.ast, this.visitor());
		console.log("🤖 Compiled intermediate representation.");
		return this.ir;
	}

	private visitor(): Visitor {
		return {
			Function: {
				exit: (path: NodePath<Function>) => {},
			},
			CallExpression: {
				exit: (path: NodePath<CallExpression>) => {
					console.log("🤖 CallExpression length: ", path.node.arguments.length);
					console.log("🤖 CallExpression callee: ", path.node.callee.type);
				}
			},
			LogicalExpression: {
				exit: (path: NodePath<LogicalExpression>) => {
					console.log("🤖 LogicalExpression: ", path.node.operator);
				}
			},
			ThrowStatement: {
				exit: (path: NodePath<ThrowStatement>) => {
					console.log("🤖 ThrowStatement: ", path.node.argument.type);
				}
			},
			VariableDeclarator: {
				exit: (path: NodePath<VariableDeclarator>) => {
					const varName = (path.node.id as Identifier).name;
					const binding = path.scope.getBinding(varName);
					if (!binding) return;
					switch (path.parent.type) {
						case "VariableDeclarator":
							console.log("🤖 VariableDeclarator parent type: %s, value: %s", path.parent.type, varName);
							break;
						default:
							console.log("🤖 VariableDeclarator parent type: %s, value: %s", path.parent.type, varName);
							break;
					}
				},
			},
			Identifier: {
				exit: (path: NodePath<Identifier>) => {
					if (!path.isReferencedIdentifier()) return;
					if (this.dependencies.includes(path.node.name)) {
						console.log("🤖 Identifier %s is a dependency", path.node.name);
					} else {
						console.log("🤖 Identifier %s: %s", path.node.name, path.parentPath?.node?.type);
					}
				},
			},
			MemberExpression: {
				exit: (path: NodePath<MemberExpression>) => {
					if (path.node.computed) return
					const object = path.node.object as Identifier | Expression;
					const property = path.node.property as Identifier | Expression;
					if (property.type === "Identifier") {
						console.log("🤖 MemberExpression fetch dependency %s", property.name);
					}
				}
			},
			BinaryExpression: {
				exit: (path: NodePath<BinaryExpression>) => {
					console.log("🤖 BinaryExpression: ", path.node.operator);
					const operatorMap: Record<string, Opcode> = {
						"+": Opcode.Add,
						"-": Opcode.Sub,
						"*": Opcode.Mul,
						"/": Opcode.Div,
					};
					const operator = operatorMap[path.node.operator];
					if (operator) {
						this.pushIr(createInstruction(operator));
					} else {
						throw new Error(`🤖 Unknown operator: ${path.node.operator}`);
					}
				},
			},
			NumericLiteral: {
				exit: (path: NodePath<NumericLiteral>) => {
					console.log("🤖 NumericLiteral: ", path.node.value);
					this.pushIr(
						createInstruction(Opcode.Push, [
							{ kind: ArgKind.Number, value: path.node.value },
						]),
					);
				},
			},
		};
	}

	private pushIr(instruction: Instruction) {
		this.ir.push(instruction);
	}
}

export default Compiler;