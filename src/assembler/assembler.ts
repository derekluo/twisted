import type { Instruction } from "../compiler/instruction.js";
import { Opcode } from "../constant.js";

class Assembler {
	private bytecode: number[] = [];
	constructor() {
		this.bytecode = [];
    }

	assemble(ir: Instruction[]): number[] {
        ir.forEach(instruction => {
            switch (instruction.opcode) {
                case Opcode.Push:
                    this.bytecode.push(instruction.args[0].kind, ...instruction.args[0].value);
                    break;
                default:
                    throw new Error(`Unknown opcode: ${instruction.opcode}`);
            }
        });

		return ir.map(instruction => instruction.opcode);
	}
}

export default Assembler;