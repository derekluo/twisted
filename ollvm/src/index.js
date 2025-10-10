import fileUtils from './utils/file.js'
import StringTransformer from './transformers/string.js'
import OLLVMObfuscator from './obfuscator/ollvm.js'

function main() {
    const args = process.argv.slice(2)
    const inputFile = args[0]
    const outputFile = inputFile.replace('.js', '.ollvm.js')
    const input = fileUtils.readFile(inputFile)


    const transformers = [
        new StringTransformer(input)
    ]

    const obfuscator = new OLLVMObfuscator(input, transformers)

    const output = obfuscator.obfuscate()
    console.log(output)
    fileUtils.writeFile(outputFile, output)
}

main()