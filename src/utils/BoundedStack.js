// Minimal BoundedStack implementation used by DeveloperDashboard and other dev tools.
export class BoundedStack {
	constructor(limit = 100) {
		this.limit = Math.max(1, Number(limit) || 100);
		this._arr = [];
	}

	push(item) {
		this._arr.push(item);
		while (this._arr.length > this.limit) this._arr.shift();
	}

	toArray() {
		return this._arr.slice();
	}

	clear() {
		this._arr.length = 0;
	}

	get length() {
		return this._arr.length;
	}
}
export default BoundedStack;
