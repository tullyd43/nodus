// src/core/ui/AsyncView.js
export class AsyncView {
	constructor(loader) {
		this.loader = loader;
		this.ctrl = null;
		this.state = "idle";
	}

	async load() {
		this.ctrl?.abort();
		this.ctrl = new AbortController();
		this.state = "loading";
		try {
			const data = await this.loader({ signal: this.ctrl.signal });
			this.state = "ready";
			return data;
		} catch (err) {
			if (err.name === "AbortError") return;
			this.state = "error";
			throw err;
		}
	}

	dispose() {
		this.ctrl?.abort();
		this.state = "disposed";
	}
}
