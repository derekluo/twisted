import Scope from "./scope.ts/scope.js";

class Context {
	private scopes: Scope[];
	private functions: Map<string, number>;
	private functionCounter: number;

	constructor() {
		this.scopes = [];
		this.scopes.push(new Scope());
		this.functions = new Map();
		this.functionCounter = 0;
	}

	public enter() {
		const scope = new Scope();
		this.scopes.push(scope);
	}

	public exit() {
		if (this.scopes.length <= 1) {
			throw new Error("🤖 Cannot exit global scope");
		}
		this.scopes.pop();
	}

	public get scope(): Scope {
		return this.scopes[this.scopes.length - 1];
	}

	public hasFunction(name: string): boolean {
		return this.functions.has(name);
	}

	public getFunction(name: string): number {
		const index = this.functions.get(name);
		if (index === undefined) {
			throw new Error(`Function name not found for name: ${name}`);
		}
		return index as number;
	}

	public setFunction(name: string): void {
		this.functions.set(name, this.functionCounter);
		this.functionCounter++;
	}

}

export default Context;
