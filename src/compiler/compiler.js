// encoder/src/compiler.js
import { parse } from '@babel/parser'

class Compiler {
    constructor(source, opcode) {
        this.ast = this.parse(source)
        this.opcode = opcode
    }

    parse(source) {
        const ast = parse(source, { sourceType: 'module' })
        return ast
    }

    compile() {
        const ir = this.buildIr(this.ast.program.body)
        // traverse.default(ast, visitor)
        console.log("🤖 Compiled intermediate representation.")
        return this.bytecode
    }

    buildIr(nodes) {
        nodes.forEach((node) => {
            switch (node.type) {
                case 'VariableDeclaration':
                    this.buildVariableDeclaration(node)
                    break
                case 'BinaryExpression':
                    this.buildBinaryExpression(node)
                default:
                    break
            }
        })
    }

    buildVariableDeclaration(node) {
        node.declarations.forEach((declaration) => {
            switch (declaration.id.type) {
                case 'Identifier':
                    console.log(declaration.id.name)
                    break
                default:
                    throw new Error(`Unsupported variable declaration type: ${declaration.id.type}`)
            }
        })
    }

    buildBinaryExpression(node) {
        console.log(node.type)
    }
}

export default Compiler