/**
 * @file src/ui/components/base/BaseComponent.js
 * @description Base class for all Web Components with reactive state management
 * @pattern Web Component + Observable State
 */

class ObservableState {
	constructor(initialState = {}) {
		this._state = initialState;
		this._subscribers = new Set();
	}

	get(key) {
		return this._state[key];
	}

	set(key, value) {
		if (this._state[key] === value) return; // No update if same value

		const oldValue = this._state[key];
		this._state[key] = value;

		this._notify({
			type: "SET",
			key,
			oldValue,
			newValue: value,
		});
	}

	update(updates) {
		const changed = {};
		let hasChanges = false;

		for (const [key, value] of Object.entries(updates)) {
			if (this._state[key] !== value) {
				changed[key] = value;
				hasChanges = true;
			}
		}

		if (!hasChanges) return;

		const oldState = { ...this._state };
		Object.assign(this._state, changed);

		this._notify({
			type: "UPDATE",
			changes: changed,
			oldState,
			newState: { ...this._state },
		});
	}

	subscribe(callback) {
		this._subscribers.add(callback);
		return () => this._subscribers.delete(callback);
	}

	_notify(change) {
		this._subscribers.forEach((callback) => {
			try {
				callback(change);
			} catch (error) {
				console.error("State subscriber error:", error);
			}
		});
	}
}

class BaseComponent extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: "open" });
		this.state = new ObservableState();
		this.subscriptions = new Set();
	}

	connectedCallback() {
		// Subscribe to state changes
		const unsubscribe = this.state.subscribe((change) => {
			this.onStateChange(change);
		});
		this.subscriptions.add(unsubscribe);

		this.render();
		this.bindEvents();
	}

	disconnectedCallback() {
		this.cleanup();
	}

	// Initialize state - override in subclasses
	initializeState(initialState = {}) {
		this.state = new ObservableState(initialState);
		const unsubscribe = this.state.subscribe((change) => {
			this.onStateChange(change);
		});
		this.subscriptions.add(unsubscribe);
	}

	// Called when state changes - override to handle specific changes
	onStateChange(change) {
		// By default, only re-render on major updates
		// Subclasses can override for granular updates
		if (change.type === "UPDATE") {
			this.render();
		}
	}

	// Event binding - override in subclasses
	bindEvents() {
		// Override in subclasses
	}

	// Cleanup - override in subclasses if needed
	cleanup() {
		this.subscriptions.forEach((unsubscribe) => unsubscribe());
		this.subscriptions.clear();
	}

	// Rendering
	render() {
		this.shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      ${this.getTemplate()}
    `;
		this.bindEvents();
	}

	getStyles() {
		return ""; // Override in subclasses
	}

	getTemplate() {
		return ""; // Override in subclasses
	}

	// ViewModel integration
	connectToViewModel(viewModel) {
		const unsubscribe = viewModel.subscribe((change) => {
			this.onViewModelChange(change);
		});
		this.subscriptions.add(unsubscribe);
	}

	onViewModelChange(change) {
		// Override in subclasses
	}

	// Utility: emit custom event
	emit(eventName, detail = {}) {
		this.dispatchEvent(
			new CustomEvent(eventName, {
				detail,
				bubbles: true,
				composed: true,
			})
		);
	}
}

window.BaseComponent = BaseComponent;
export { BaseComponent, ObservableState };
