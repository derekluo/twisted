#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Int(i64),
    String(String),
    Null,
}

#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq)]
#[repr(u8)]
pub enum OpCode {
    // 常量指令
    Push(Value) = 0x00,
    Pop = 0x01,
    // 算术指令
    Add = 0x02,
    Sub = 0x03,

    // test
    Test = 0x04,
}

impl From<u8> for OpCode {
    fn from(value: u8) -> Self {
        match value {
            0x00 => OpCode::Push(Value::Null),
            0x01 => OpCode::Pop,
            0x02 => OpCode::Add,
            0x03 => OpCode::Sub,
            0x04 => OpCode::Test,
            _ => panic!("Invalid opcode: {}", value),
        }
    }
}

impl From<OpCode> for u8 {
    fn from(value: OpCode) -> Self {
        match value {
            OpCode::Push(_) => 0x00,
            OpCode::Pop => 0x01,
            OpCode::Add => 0x02,
            OpCode::Sub => 0x03,
            OpCode::Test => 0x04,
        }
    }
}
#[derive(Debug, Clone)]
pub struct Vm {
    stack: Vec<Value>,
    pc: usize,
}

impl Vm {
    pub fn new() -> Self {
        Self {
            stack: Vec::new(),
            pc: 0,
        }
    }

    pub fn run<T>(&mut self, program: &[T]) -> Option<Value>
    where T: Into<OpCode> + Into<u8> + Clone
    {
        while self.pc < program.len() {
            let op = program[self.pc].clone().into();
            match op {
                OpCode::Push(value) => {
                    self.stack.push(value);
                    self.pc += 1;
                }
                OpCode::Pop => {
                    let _ = self.stack.pop().unwrap();
                    self.pc += 1;
                }
                OpCode::Add => {
                    let Some(Value::Int(value1)) = self.stack.pop() else {
                        return None;
                    };
                    let Some(Value::Int(value2)) = self.stack.pop() else {
                        return None;
                    };
                    self.stack.push(Value::Int(value1 + value2));
                    self.pc += 1;
                }
                OpCode::Sub => {
                    let Some(Value::Int(value1)) = self.stack.pop() else {
                        return None;
                    };
                    let Some(Value::Int(value2)) = self.stack.pop() else {
                        return None;
                    };
                    self.stack.push(Value::Int(value1 - value2));
                    self.pc += 1;
                }
                OpCode::Test => {
                    self.stack.push(Value::String("Hello, world!".to_string()));
                    self.pc += 1;
                }
            }
        }
        self.stack.last().cloned()
    }
}

#[cfg(test)]
mod tests {

    use super::*;

    #[test]
    fn test_vm() {
        let mut vm = Vm::new();
        let program = [
            OpCode::Push(Value::Int(1)),
            OpCode::Push(Value::Int(2)),
            OpCode::Add,
        ];
        let stack = vm.run(&program);
        assert_eq!(stack, Some(Value::Int(3)));
    }
}
