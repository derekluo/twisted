import { default as traverse } from "@babel/traverse";
import * as parser from "@babel/parser";
import type { NodePath, Visitor } from "@babel/traverse";
import type { ParseResult } from "@babel/parser";

import {
	type VariableDeclarator,
	type Identifier,
	type Function,
	NumericLiteral,
	BinaryExpression,
	CallExpression,
	MemberExpression,
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
				enter: (path: NodePath<Function>) => {},
			},
			CallExpression: {
				exit: (path: NodePath<CallExpression>) => {
					const callee = path.node.callee;
					if (callee.type === "MemberExpression") {
						const memberExpression = callee as MemberExpression;
						const object = memberExpression.object;
						const property = memberExpression.property;
						if (object.type === "Identifier" && property.type === "Identifier") {
							const objectName = object.name;
							const propertyName = property.name;
							if (this.dependencies.includes(objectName) && this.consoleDependencyMethods.includes(propertyName)) {
								console.log("🤖 CallExpression RuntimeCall: %s.%s", objectName, propertyName);
								this.pushIr(createInstruction(Opcode.RuntimeCall, [{ kind: ArgKind.Number, value: 0 }]));
							}
						}
					}
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
				enter: (path: NodePath<Identifier>) => {
					if (!path.isReferencedIdentifier()) return;
					const varName = path.node.name;

					if (this.dependencies.includes(varName)) {
						return;
					}

					const binding = path.scope.getBinding(varName);
					if (!binding) return;
					if (binding.scope.path.isProgram()) {
						const index = this.globals.get(varName);
						console.log("🤖 Identifier Global variable: ", varName, index);
						this.pushIr(
							createInstruction(Opcode.Load, [
								{ kind: ArgKind.Number, value: index },
							]),
						);
					}
				},
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
					console.log("🤖 NumberLiteral: ", path.node.value);
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
