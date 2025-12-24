import { Frame } from "./frame.js";

class Context {
	private frames: Frame[];

	constructor() {
		this.frames = [];
	}

	public pushFrame(frame: Frame) {
		this.frames.push(frame);
	}

	public popFrame() {
		this.frames.pop();
	}

}

export { Context };
