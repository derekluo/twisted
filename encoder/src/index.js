import fileUtils from './utils/file.js'
import StringTransformer from './transformers/string.js'
import FLATransformer from './transformers/fla.js'
import OLLVMObfuscator from './obfuscator/ollvm.js'
import Compiler from './compiler.js'

function main() {
    const args = process.argv.slice(2)
    const inputFile = args[0]
    const outputFile = inputFile.replace('.js', '.encoder.js')
    const input = fileUtils.readFile(inputFile)

    const transformers = [
        new StringTransformer(),
        new FLATransformer()
    ]

    const obfuscator = new OLLVMObfuscator(input, transformers)
    obfuscator.obfuscate()
    const output = obfuscator.generate()
    console.log("Obfuscated code successfully generated")
    fileUtils.writeFile(outputFile, output)
}

function compile() {
    // const args = process.argv.slice(2)
    // const inputFile = args[0]
    const code = `
const result = 10 + 20;
const test = 101;
    `
    const compiler = new Compiler(code)
    const bytecode = compiler.compile()
    console.log(bytecode)
}

compile()