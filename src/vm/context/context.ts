import Frame from "./frame/frame.js";

class Context {
	private frames: Frame[];

	constructor() {
		this.frames = [];
		this.frames.push(new Frame());
	}

	public pushFrame(frame: Frame) {
		this.frames.push(frame);
	}

	public popFrame() {
		if (this.frames.length <= 1) {
			throw new Error("🤖 Cannot pop global frame");
		}
		this.frames.pop();
	}

	public get frame(): Frame {
		return this.frames[this.frames.length - 1];
	}

}

export default Context;
