import { OPCODE } from "../constant.js";

interface Arg {
	type: number;
	value: any;
}

interface Instruction {
	opcode: OPCODE;
	args: Arg[];
	tags: string[];
}

interface BasicBlock {
	id: number;
	start: number;
	end: number;
	instructions: Instruction[];
	predecessors: BasicBlock[]
	successors: BasicBlock[]
}

interface ControlFlowGraph {
	entry: number;
	exit: number;
	blocks: Map<number, BasicBlock>;
}

function createInstruction(opcode: OPCODE, args: Arg[], tags: string[]): Instruction {
	return {
		opcode,
		args,
		tags,
	};
}

export { Instruction, Arg, createInstruction };
