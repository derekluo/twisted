class Frame {
	private stack: any[];
	private variables: any[];
	private returnPc: number;
	private parameters: any[];

	constructor() {
		this.stack = [];
		this.variables = [];
		this.returnPc = 0;
		this.parameters = [];
	}

	public declare(name: string) {
		this.stack.push(name);
	}

	public resolve(name: string) {
		return this.stack.indexOf(name);
	}
}

export { Frame };
