import { ArgKind, Instruction } from "../instruction.js";

class Bulldozer {

	private marks: Map<number, number>;

	constructor() {
		this.marks = new Map();
	}

	public mark(irIndex: number, bytecodeIndex: number) {
		this.marks.set(irIndex, bytecodeIndex);
	}

    public backpatch(bytecode: number[], ir: Instruction[]) {        
        for (let i = 0; i < ir.length; i++) {
            const instruction = ir[i];
            let bytecodeIndex = this.marks.get(i);
            if (bytecodeIndex === undefined) {
                throw new Error(`Bytecode index not found for IR index: ${i}`);
            }
			// skip opcode
            bytecodeIndex++;
            for (const arg of instruction.args) {
                if (arg.kind === ArgKind.DynAddr && arg.value !== undefined) {
                    const targetBytecodeIndex = this.marks.get(arg.value);
                    
                    if (targetBytecodeIndex === undefined) {
                        throw new Error(`Bytecode index not found for IR index: ${arg.value}`);
                    }
					// backpatch dyn addr
                    bytecode[bytecodeIndex] = targetBytecodeIndex;
                    console.log(`Backpatch: bytecode[${bytecodeIndex}]: IR[${arg.value}] -> bytecode[${targetBytecodeIndex}]`);
                }
				// next arg
				bytecodeIndex++;
            }
        }
    }
}

export { Bulldozer };