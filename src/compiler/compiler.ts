import { default as traverse } from "@babel/traverse";
import * as parser from "@babel/parser";
import type { NodePath, Visitor } from "@babel/traverse";
import type { ParseResult } from "@babel/parser";

import { type VariableDeclarator, type Identifier, type Function, NumericLiteral, BinaryExpression } from "@babel/types";
import { OPCODE } from "../constant.js";

interface Instruction {
	opcode: OPCODE;
	args?: any[];
}

interface ScopeInfo {
	locals: Map<string, number>;
	localIndex: number;
}

class Compiler {
	private ast: ParseResult;
	public ir: Instruction[];
	private globals: Map<string, number>;
	private globalIndex: number;
	private functionScopes: Map<number, ScopeInfo>;
	private dependencies: string[];

	constructor(source: string) {
		this.ast = parser.parse(source, { sourceType: "module" });
		this.ir = [];
		this.globals = new Map();
		this.globalIndex = 0;
		this.functionScopes = new Map();
        this.dependencies = ["window", "console"];
	}

	compile(): Instruction[] {
		traverse.default(this.ast, this.visitor());
		console.log("🤖 Compiled intermediate representation.");
		return this.ir;
	}

    private visitor(): Visitor {
		return {
			Function: {
				enter: (path: NodePath<Function>) => {
				},
			},
			VariableDeclarator: {
				exit: (path: NodePath<VariableDeclarator>) => {
					const varName = (path.node.id as Identifier).name;
					const binding = path.scope.getBinding(varName);
					if (!binding) return;
					if (binding.scope.path.isProgram()) {
						if (!this.globals.has(varName)) {
                            this.globals.set(varName, this.globalIndex);
                            console.log("🤖 VariableDeclarator Global variable: ", varName, this.globalIndex);
                            this.ir.push({ opcode: OPCODE.GlobalStore, args: [this.globalIndex] });
                            this.globalIndex++;
						}
					} else {
                        console.log("🤖 VariableDeclarator Local variable: ", varName);
                    }
				},
			},
			Identifier: {
				enter: (path: NodePath<Identifier>) => {
					if (!path.isReferencedIdentifier()) return;
					const varName = path.node.name;
					const binding = path.scope.getBinding(varName);
					if (!binding) return;
					if (binding.scope.path.isProgram()) {
                        const index = this.globals.get(varName);
                        console.log("🤖 Identifier Global variable: ", varName, index);
                        this.ir.push({ opcode: OPCODE.GlobalLoad, args: [index] });
					}
				},
			},
            BinaryExpression: {
                exit: (path: NodePath<BinaryExpression>) => {
                    console.log("🤖 BinaryExpression: ", path.node.operator);
                    const operatorMap: Record<string, OPCODE> = {
                        "+": OPCODE.Add,
                        "-": OPCODE.Sub,
                        "*": OPCODE.Mul,
                        "/": OPCODE.Div,
                    };
                    const operator = operatorMap[path.node.operator];
                    if (operator) {
                        this.ir.push({ opcode: operator, args: [] });
                    } else {
                        throw new Error(`🤖 Unknown operator: ${path.node.operator}`);
                    }
                }
            },
            NumericLiteral: {
                exit: (path: NodePath<NumericLiteral>) => {
                    console.log("🤖 NumberLiteral: ", path.node.value);
                    this.ir.push({ opcode: OPCODE.Push, args: [path.node.value] });
                }
            }
		};
	}
}

export default Compiler;
