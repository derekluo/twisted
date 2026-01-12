import { LabelType } from "../constant.js";
import { Instruction } from "../instruction.js";

class Bulldozer {

	private labels: Map<number, Label>;
	private backpatchs: Map<number, number[]>;
	private counter: number;

	constructor() {
		this.labels = new Map();
		this.backpatchs = new Map();
		this.counter = 0;
	}

	public label(type: LabelType): number {
		const id = this.counter;
		this.labels.set(id, new Label(id, type, undefined));
		this.counter++;
		return id;
	}

	public remember(id: number, position: number) {
		this.labels.get(id)!.position = position;
		this.backpatchs.set(id, [position]);
	}

	public record(id: number, position: number) {
		this.backpatchs.get(id)!.push(position);
	}

	public backpatch(ir: Instruction[]) {
		throw new Error("Not implemented");
	}
}

class Label {

	public id: number;
	public type: LabelType;
	public position: number | undefined;

	constructor(id: number, type: LabelType, position: number | undefined) {
		this.id = id;
		this.type = type
		this.position = position;
	}

}

export { Bulldozer, Label };