

class Instruction {
    constructor(opcode) {
        this.opcode = opcode
    }

    buildPush(value) {
        return {
            opcode: this.opcode.Push,
            args: [{ type: 0, value: value }]
        }
    }
}