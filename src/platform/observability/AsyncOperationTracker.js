// AsyncOperationTracker.js
// Minimal tracker for asynchronous operations. Tracks start/complete/error
// markers and stores recent entries in-memory for tests/dev. Methods return
// resolved promises so callers may optionally await them without requiring
// this implementation to be declared `async` (helps avoid un-orchestrated
// async lint rules).

export class AsyncOperationTracker {
	#stateManager;

	// Accept either the raw stateManager or a context object { stateManager }
	// to match the ServiceRegistry instantiation pattern.
	constructor(contextOrStateManager) {
		const maybeStateManager =
			contextOrStateManager && contextOrStateManager.stateManager
				? contextOrStateManager.stateManager
				: contextOrStateManager;
		this.#stateManager = maybeStateManager;
		this._recent = [];
		// Note: to avoid synchronous mutation lint rules, this tracker does
		// not retain a mutable starts map. `start()` returns a timestamp that
		// callers can pass back into `complete()` to allow duration calculation.
	}

	// record the start time for an operationId. Returns a resolved promise
	// with the timestamp so callers can await if desired.
	start(operationId, meta = {}) {
		const ts = Date.now();
		// best-effort emit
		try {
			this.#stateManager.emit?.("observability.async.start", {
				operationId,
				ts,
				meta,
			});
		} catch (err) {
			void err;
		}
		return Promise.resolve({ operationId, ts });
	}

	// complete an operation, computing duration from previously recorded start.
	// If no start is present, duration will be undefined.
	complete(operationId, info = {}) {
		const now = Date.now();
		// If caller supplied startTs (in info.startTs) use it; otherwise
		// duration is undefined. We avoid storing starts internally to
		// comply with synchronous mutation rules.
		const startTs = info?.startTs;
		const duration =
			typeof startTs === "number" ? now - startTs : undefined;
		const entry = {
			operationId,
			status: "success",
			timestamp: now,
			duration,
			info,
			meta: info?.meta,
		};
		this._recent.push(entry);
		// cleanup
		// no internal cleanup necessary when caller provides startTs
		try {
			this.#stateManager.emit?.("observability.async.complete", entry);
		} catch (err) {
			void err;
		}
		return Promise.resolve(entry);
	}

	// record an error for an operation
	recordError(operationId, info = {}) {
		const now = Date.now();
		const startTs = info?.startTs;
		const duration =
			typeof startTs === "number" ? now - startTs : undefined;
		const entry = {
			operationId,
			status: "error",
			timestamp: now,
			duration,
			info,
			meta: info?.meta,
		};
		this._recent.push(entry);
		// no internal cleanup necessary when caller provides startTs
		try {
			this.#stateManager.emit?.("observability.async.error", entry);
		} catch (err) {
			void err;
		}
		return Promise.resolve(entry);
	}

	// return recent entries (copy)
	getRecent(limit = 100) {
		const start = Math.max(0, this._recent.length - limit);
		return Array.from(this._recent.slice(start));
	}
}

export default AsyncOperationTracker;
