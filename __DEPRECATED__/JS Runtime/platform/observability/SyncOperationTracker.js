// SyncOperationTracker.js
// Lightweight tracker for synchronous UI operations. This is a minimal
// implementation used during initial wiring and tests. It records success
// and error markers and returns resolved promises.

export class SyncOperationTracker {
	#stateManager;

	constructor(stateManager) {
		this.#stateManager = stateManager;
		// store recent ops in-memory for tests/dev; production would persist
		this._recent = [];
	}

	// These operations are lightweight and return resolved promises so callers
	// can optionally await them without requiring this implementation to be
	// an `async` function (avoids un-orchestrated async functions warnings).
	recordSuccess(operationId, info = {}) {
		const entry = {
			operationId,
			status: "success",
			timestamp: Date.now(),
			info,
		};
		this._recent.push(entry);
		// best-effort: emit an event if stateManager supports emit. Swallow
		// errors intentionally — emissions are best-effort for observability.
		try {
			this.#stateManager.emit?.("observability.sync.success", entry);
		} catch (err) {
			void err; // swallow intentionally
		}
		return Promise.resolve(entry);
	}

	recordError(operationId, info = {}) {
		const entry = {
			operationId,
			status: "error",
			timestamp: Date.now(),
			info,
		};
		this._recent.push(entry);
		try {
			this.#stateManager.emit?.("observability.sync.error", entry);
		} catch (err) {
			void err; // swallow intentionally
		}
		return Promise.resolve(entry);
	}

	getRecent() {
		return Array.from(this._recent);
	}
}

export default SyncOperationTracker;
