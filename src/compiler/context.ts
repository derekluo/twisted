import { Scope } from "./scope.js";

class Context {
    private scopes: Scope[]

    constructor() {
        this.scopes = [];
    }

    public enter() {
        this.scopes.push(new Scope());
    }

    public exit() {
        this.scopes.pop();
    }

    public declare(name: string) {
        this.scopes[this.scopes.length - 1].declare(name);
    }

    public resolve(name: string) {
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            const scope = this.scopes[i];
            const result = scope.resolve(name);
            if (result !== undefined) {
                return result;
            }
        }
        return null;
    }
}

export { Context };