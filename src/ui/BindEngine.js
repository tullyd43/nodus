// src/core/ui/BindEngine.js
export class BindEngine {
	constructor(stateManager) {
		this.stateManager = stateManager;
		this.bindings = new Map();
	}

	init(root = document) {
		root.querySelectorAll("[data-bind]").forEach((el) => {
			const path = el.dataset.bind;
			const unsub = this.stateManager.on(
				"stateChange",
				({ path: changed, value }) => {
					if (changed === path) el.textContent = this._format(value);
				}
			);
			this.bindings.set(el, unsub);
		});
	}

	_format(v) {
		return v == null ? "" : String(v);
	}

	dispose() {
		for (const unsub of this.bindings.values()) unsub();
		this.bindings.clear();
	}
}
