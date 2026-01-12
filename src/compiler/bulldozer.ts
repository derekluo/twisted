import { LabelType } from "../constant.js";
import { ArgKind, Instruction } from "../instruction.js";

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
		if (!this.backpatchs.has(id)) {
			this.backpatchs.set(id, []);
		}
		this.backpatchs.get(id)!.push(position);
	}

	public record(id: number, position: number) {
		const label = this.labels.get(id);
		if (!label) {
			throw new Error(`Label ${id} not found`);
		}
		label.position = position;
	}

	public backpatch(ir: Instruction[]) {
		for (const [labelId, positions] of this.backpatchs) {
			const label = this.labels.get(labelId);
			if (!label) {
				throw new Error(`Label ${labelId} not found`);
			}
			if (label.position === undefined) {
				throw new Error(`Label ${labelId} position not recorded`);
			}
			
			// 回填所有需要回填的位置
			for (const pos of positions) {
				const arg = ir[pos].args[0];
				if (arg.kind === ArgKind.DynAddr && arg.value === undefined) {
					arg.value = label.position;
				} else {
					throw new Error(`Invalid placeholder at position ${pos}`);
				}
			}
		}
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