// Minimal VirtualList shim used by the app bootstrap.
// Intended to be replaced by a full implementation; provides mount() and refresh().
export default class VirtualList {
	constructor({
		container,
		itemHeight = 40,
		count = () => 0,
		keyOf = (i) => i,
		render = () => {},
	} = {}) {
		this.container = container;
		this.itemHeight = itemHeight;
		this.count = count;
		this.keyOf = keyOf;
		this.renderItem = render;
		this._items = new Map();
	}

	mount() {
		if (!this.container) return;
		this.container.innerHTML = "";
		this._viewport = document.createElement("div");
		this._viewport.className = "vlist-viewport";
		this.container.appendChild(this._viewport);
		this.refresh();
	}

	refresh() {
		const total = this.count();
		// simple full render (not virtualized) for shim
		while (this._viewport.firstChild)
			this._viewport.removeChild(this._viewport.firstChild);
		for (let i = 0; i < total; i++) {
			const el = document.createElement("div");
			el.className = "vlist-row";
			el.style.height = `${this.itemHeight}px`;
			try {
				this.renderItem(el, i);
			} catch (e) {
				el.textContent = `error rendering row ${i}`;
			}
			this._viewport.appendChild(el);
		}
	}

	unmount() {
		if (this.container && this._viewport)
			this.container.removeChild(this._viewport);
	}
}
