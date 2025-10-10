import Obfuscator from './base.js'


class OLLVMObfuscator extends Obfuscator {
    constructor(code, transformers) {
        super(code, transformers)
    }

    obfuscate() {
        this.transformers.forEach(transformer => {
            console.log(this.ast)
            this.ast = transformer.transform(this.ast)
        })
        return this.generate()
    }
}

export default OLLVMObfuscator