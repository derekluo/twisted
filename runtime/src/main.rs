mod vm;

use vm::Vm;


fn main() {
    let mut vm = Vm::new();
    // let value = Value::Int(123);
    // let program = [OpCode::Push(value), OpCode::Test];
    let program = [0x04];
    let result = vm.run(&program);
    println!("Result: {result:?}")
}
