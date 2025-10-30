// src/core/ExtensionManager.js
// Placeholder ExtensionManager to satisfy dynamic import until the real module is implemented

export class ExtensionManager {
	constructor(stateManager) {
		this.stateManager = stateManager;
		this.extensions = new Map();
	}

	async initialize() {
		console.log("[ExtensionManager] Initialized (stub)");
	}

	async discover() {
		console.log("[ExtensionManager] Discovery placeholder");
		return [];
	}

	registerExtension(id, extension) {
		this.extensions.set(id, extension);
		console.log(`[ExtensionManager] Registered extension: ${id}`);
	}

	getExtension(id) {
		return this.extensions.get(id);
	}

	destroy() {
		this.extensions.clear();
		console.log("[ExtensionManager] Destroyed (stub)");
	}
}

export default ExtensionManager;
