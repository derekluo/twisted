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
        let bytecodePos = 0;
        
        for (let i = 0; i < ir.length; i++) {
            const instruction = ir[i];
            bytecodePos++; // 跳过 opcode
            
            for (const arg of instruction.args) {
                if (arg.kind === ArgKind.DynAddr && arg.value !== undefined) {
                    // ✅ 先保存原值（IR 索引）
                    const targetIrIndex = arg.value;
                    
                    // ✅ 查找对应的字节码位置
                    const targetBytecodePos = this.marks.get(targetIrIndex);
                    
                    if (targetBytecodePos === undefined) {
                        console.error(`❌ 回填失败:`);
                        console.error(`  - 字节码位置: ${bytecodePos}`);
                        console.error(`  - 目标 IR 索引: ${targetIrIndex}`);
                        console.error(`  - marks Map:`, Array.from(this.marks.entries()));
                        throw new Error(`Invalid IR index: ${targetIrIndex}`);
                    }
                    
                    // ✅ 直接修改字节码
                    bytecode[bytecodePos] = targetBytecodePos;
                    console.log(`🔧 回填: bytecode[${bytecodePos}]: IR[${targetIrIndex}] -> bytecode[${targetBytecodePos}]`);
                }
                
                bytecodePos++; // 移动到下一个参数位置
            }
        }
    }
}

export { Bulldozer };