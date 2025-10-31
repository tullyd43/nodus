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

export default class SyncStack {
	/** @private @type {SyncModule[]} */
	#syncModules;
	/** @private @type {SyncStackOptions} */
	#config;
	/** @private @type {Map<string, any>} */
	#syncStatus = new Map();
	/** @private @type {any} */
	#conflictResolver = null;
	/** @private @type {import('../../HybridStateManager.js').default|null} */
	#stateManager;
	/** @private @type {import('../../../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics;

	/**
	 * @private
	 * @static
	 * @class Simple conflict resolver (pluggable later)
	 */
	static #ConflictResolver = class {
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
	};

	constructor({ stateManager, syncModules = [], options = {} }) {
		this.#stateManager = stateManager;
		this.#syncModules = syncModules;
		this.#config = {
			maxRetries: 3,
			retryDelay: 1000,
			batchSize: 50,
			offlineQueueLimit: 1000,
			enableConflictResolution: true,
			...options,
		};

		this.#metrics =
			this.#stateManager?.metricsRegistry?.namespace("syncStack");
	}

	async init() {
		for (const mod of this.#syncModules) {
			if (typeof mod?.init === "function") {
				// V8.0 Parity: The stateManager is now passed in the constructor of each module,
				// so the legacy bindStateManager call is no longer needed.
				await mod.init();
			}
		}
		if (this.#config.enableConflictResolution) {
			this.#conflictResolver = new SyncStack.#ConflictResolver(
				this.#config
			);
		}
		console.log("[SyncStack] Sync stack initialized");
	}

	/**
	 * @param {{operation?:'push'|'pull'|'bidirectional'}} [options]
	 */
	async performSync(options = {}) {
		const op = options.operation ?? "bidirectional";
		const startTime = performance.now();
		const syncId = this.#generateSyncId();
		this.#syncStatus.set(syncId, {
			status: "in_progress",
			startTime,
			operation: op,
		});

		try {
			let result;
			if (op === "push") {
				result = await this.#performPush(options);
			} else if (op === "pull") {
				result = await this.#performPull(options);
			} else {
				result = await this.#performBidirectionalSync(options);
			}

			return result;
		} catch (err) {
			this.#syncStatus.set(syncId, {
				status: "failed",
				startTime,
				endTime: performance.now(),
				error: String(err), // Corrected incomplete line
			});
			throw err;
		} finally {
			const endTime = performance.now();
			const currentStatus = this.#syncStatus.get(syncId);
			if (currentStatus.status === "in_progress") {
				currentStatus.status = "completed";
			}
			currentStatus.endTime = endTime;
			this.#updateSyncMetrics(
				currentStatus.status === "completed",
				endTime - startTime
			);
		}
	}

	/**
	 * @returns {{queueSize:number, activeSyncs:number, metrics:any} | any}
	 */
	getSyncStatus(syncId = null) {
		if (syncId) return this.#syncStatus.get(syncId);
		return {
			queueSize: 0, // no internal queue here by design
			activeSyncs: Array.from(this.#syncStatus.values()).filter(
				(s) => s.status === "in_progress"
			).length,
			metrics: this.#metrics?.getAllAsObject(),
		};
	}

	// ---------- Internals

	async #performPush(options = {}) {
		const results = [];
		for (const mod of this.#syncModules) {
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

	async #performPull(options = {}) {
		const results = [];
		for (const mod of this.#syncModules) {
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

	async #performBidirectionalSync(options = {}) {
		const pullResult = await this.#performPull(options);

		let conflicts = [];
		if (this.#conflictResolver) {
			conflicts =
				await this.#conflictResolver.resolveConflicts(pullResult);
			this.#metrics?.increment("conflictsResolved", conflicts.length);
		}

		const pushResult = await this.#performPush(options);
		return {
			operation: "bidirectional",
			pull: pullResult,
			push: pushResult,
			conflicts,
		};
	}

	#generateSyncId() {
		return `sync_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
	}

	#updateSyncMetrics(success, durationMs) {
		this.#metrics?.increment("syncOperations");
		this.#metrics?.updateAverage("averageSyncTime", durationMs);
		this.#metrics?.set("lastSyncTime", Date.now());
		if (!success) this.#metrics?.increment("syncErrors");
	}
}
