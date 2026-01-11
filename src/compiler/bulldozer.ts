import { LabelType } from "../constant.js";
import { Instruction } from "../instruction.js";

class Bulldozer {

	public name: string;
	public labels: Map<string, Label>;

	constructor(name: string) {
		this.name = name;
		this.labels = new Map();
	}

	public backpatch(ir: Instruction[]) {
		throw new Error("Not implemented");
	}
}

class Label {

	public readonly name: string;
	public readonly type: LabelType;
	public readonly position: number;

	constructor(name: string, type: LabelType, position: number) {
		this.name = name;
		this.type = type;
		this.position = position;
	}

}
