// src/core/storage/modules/sync-stack.js
// SyncStack — a thin orchestrator over pluggable sync strategies.
// No private class fields (avoids eslint/parser issues). Fully JSDoc’d.

/**
 * @typedef {object} SyncModule
 * @property {boolean} [supportsPush]
 * @property {boolean} [supportsPull]
 * @property {(item:any)=>boolean} [supportsItem]
 * @property {()=>Promise<void>} [init]
 * @property {(options?:object)=>Promise<any>} [push]
 * @property {(options?:object)=>Promise<any>} [pull]
 */

/**
 * @typedef {object} SyncStackOptions
 * @property {number} [maxRetries=3]
 * @property {number} [retryDelay=1000]
 * @property {number} [batchSize=50]
 * @property {number} [offlineQueueLimit=1000]
 * @property {boolean} [enableConflictResolution=true]
 */

/**
 * Simple conflict resolver (pluggable later)
 */
class ConflictResolver {
	constructor(options = {}) {
		this.options = options;
	}
	/**
	 * @param {{pulled:any[]}} result
	 * @returns {Promise<any[]>}
	 */
	async resolveConflicts(result) {
		// Stub: no-op. In a real impl, decide merges here.
		return [];
	}
}

export default class SyncStack {
	/** @type {SyncModule[]} */ _syncModules;
	/** @type {SyncStackOptions} */ _config;
	/** @type {Map<string, any>} */ _syncStatus;
	/** @type {{syncOperations:number, conflictsResolved:number, syncErrors:number, averageSyncTime:number, lastSyncTime:number|null}} */ _metrics;
	/** @type {any} */ _conflictResolver;

	constructor(syncModules = [], options = {}) {
		this._syncModules = Array.isArray(syncModules) ? syncModules : [];
		this._config = {
			maxRetries: 3,
			retryDelay: 1000,
			batchSize: 50,
			offlineQueueLimit: 1000,
			enableConflictResolution: true,
			...options,
		};

		this._syncStatus = new Map();
		this._metrics = {
			syncOperations: 0,
			conflictsResolved: 0,
			syncErrors: 0,
			averageSyncTime: 0,
			lastSyncTime: null,
		};

		this._conflictResolver = null;
	}

	async init() {
		for (const mod of this._syncModules) {
			if (typeof mod?.init === "function") {
				await mod.init();
			}
		}
		if (this._config.enableConflictResolution) {
			this._conflictResolver = new ConflictResolver(this._config);
		}
		console.log("[SyncStack] Sync stack initialized");
	}

	/**
	 * @param {{operation?:'push'|'pull'|'bidirectional'}} [options]
	 */
	async performSync(options = {}) {
		const op = options.operation ?? "bidirectional";
		const start =
			typeof performance !== "undefined" ? performance.now() : Date.now();
		const syncId = this._generateSyncId();
		this._syncStatus.set(syncId, {
			status: "in_progress",
			startTime: start,
			operation: op,
		});

		try {
			let result;
			if (op === "push") {
				result = await this._performPush(options);
			} else if (op === "pull") {
				result = await this._performPull(options);
			} else {
				result = await this._performBidirectionalSync(options);
			}

			const end =
				typeof performance !== "undefined"
					? performance.now()
					: Date.now();
			this._updateSyncMetrics(true, end - start);
			this._syncStatus.set(syncId, {
				status: "completed",
				startTime: start,
				endTime: end,
				result,
			});
			return result;
		} catch (err) {
			const end =
				typeof performance !== "undefined"
					? performance.now()
					: Date.now();
			this._updateSyncMetrics(false, end - start);
			this._syncStatus.set(syncId, {
				status: "failed",
				startTime: start,
				endTime: end,
				error: String(err),
			});
			throw err;
		}
	}

	/**
	 * @returns {{queueSize:number, activeSyncs:number, metrics:any} | any}
	 */
	getSyncStatus(syncId = null) {
		if (syncId) return this._syncStatus.get(syncId);
		return {
			queueSize: 0, // no internal queue here by design
			activeSyncs: Array.from(this._syncStatus.values()).filter(
				(s) => s.status === "in_progress"
			).length,
			metrics: this._metrics,
		};
	}

	// ---------- Internals

	async _performPush(options = {}) {
		const results = [];
		for (const mod of this._syncModules) {
			if (mod?.supportsPush && typeof mod.push === "function") {
				const r = await mod.push(options);
				results.push({
					module: mod.constructor?.name ?? "unknown",
					result: r,
				});
			}
		}
		return { operation: "push", modules: results };
	}

	async _performPull(options = {}) {
		const results = [];
		for (const mod of this._syncModules) {
			if (mod?.supportsPull && typeof mod.pull === "function") {
				const r = await mod.pull(options);
				results.push({
					module: mod.constructor?.name ?? "unknown",
					result: r,
				});
			}
		}
		return { operation: "pull", modules: results };
	}

	async _performBidirectionalSync(options = {}) {
		const pullResult = await this._performPull(options);

		let conflicts = [];
		if (this._conflictResolver) {
			conflicts =
				await this._conflictResolver.resolveConflicts(pullResult);
			this._metrics.conflictsResolved += conflicts.length;
		}

		const pushResult = await this._performPush(options);
		return {
			operation: "bidirectional",
			pull: pullResult,
			push: pushResult,
			conflicts,
		};
	}

	_generateSyncId() {
		return `sync_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
	}

	_updateSyncMetrics(success, durationMs) {
		this._metrics.syncOperations += 1;
		const n = this._metrics.syncOperations;
		const prevAvg = this._metrics.averageSyncTime;
		this._metrics.averageSyncTime = prevAvg + (durationMs - prevAvg) / n;
		this._metrics.lastSyncTime = Date.now();
		if (!success) this._metrics.syncErrors += 1;
	}
}
