class Scope {

    private variables: Map<string, number>
    private counter: number

    constructor() {
        this.variables = new Map();
        this.counter = 0;
    }
 
    public declare(name: string) {
        this.variables.set(name, this.counter);
        this.counter++;
    }
    
    public resolve(name: string) {
        return this.variables.get(name);
    }
}

export { Scope };
