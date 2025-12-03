// encoder/src/compiler.js
import { parse } from '@babel/parser'
import traverse from '@babel/traverse'

class Compiler {
    constructor(source, opcode) {
        this.ast = this.parse(source)
        this.opcode = opcode
        this.dependencies = ['console']
    }

    parse(source) {
        const ast = parse(source, { sourceType: 'module' })
        return ast
    }

    compile() {
        traverse.default(this.ast, this.visitor())
        console.log("🤖 Compiled intermediate representation.")
        return this.bytecode
    }

    visitor() {
        const visitor = {
            VariableDeclaration: {
                enter: (path) => {
                    console.log(path.node.type)
                }
                
            },
            Identifier: {
                enter: (path) => {
                    if (this.dependencies.includes(path.node.name)) {
                        console.log(`🤖 Dependency found: ${path.node.name}`)
                        return
                    }
                    if (path.parent.type === 'MemberExpression' && path.parent.property === path.node && !path.parent.computed) {
                        console.log(`🤖 String for dependency found: ${path.node.name}`)
                        return
                    }
                    console.log(path.node.name)
                }
            },
        }
        return visitor
    }
}

export default Compiler