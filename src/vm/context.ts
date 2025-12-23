import { Frame } from "./frame.js";

class Context {
	private frames: Frame[] = [];

	constructor() {
		this.frames = [new Frame()];
	}
}

export { Context };
