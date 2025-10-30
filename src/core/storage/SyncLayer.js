// core/sync/SyncLayer.js
// Bidirectional sync with conflict resolution - separate from validation

/**
 * @file SyncLayer.js
 * @description Manages bidirectional data synchronization between the client and a remote server.
 * This layer is responsible for handling network resilience, conflict detection and resolution,
 * and efficient batch processing of data changes. It is distinct from the validation layer,
 * which ensures data correctness before synchronization.
 */

/**
 * @class SyncLayer
 * @classdesc Orchestrates the synchronization of data between the local offline storage and a remote server.
 * It implements strategies for conflict resolution, handles network interruptions with retry logic,
 * and uses batching to efficiently process large numbers of changes.
 */
export class SyncLayer {
	/**
	 * @private
	 * @type {import('./ModularOfflineStorage').default}
	 */
	#storage;
	/**
	 * @private
	 * @type {object}
	 */
	#config;
	/**
	 * @private
	 * @type {Array<object>}
	 */
	#syncQueue = [];
	/**
	 * @private
	 * @type {Array<object>}
	 */
	#conflictQueue = [];
	/**
	 * @private
	 * @type {object}
	 */
	#metrics;
	/**
	 * @private
	 * @type {boolean}
	 */
	#ready = false;
	/**
	 * @private
	 * @type {boolean}
	 */
	#syncInProgress = false;
	/**
	 * @private
	 * @type {number|null}
	 */
	#autoSyncInterval = null;
	/**
	 * @private
	 * @type {number|null}
	 */
	#syncDebounceTimeout = null;
	/**
	 * @private
	 * @type {Map<string, number>}
	 */
	#retryTimeouts = new Map();
	/**
	 * A reference to the application's HybridStateManager for event emission.
	 * @type {import('../HybridStateManager.js').HybridStateManager|null}
	 */
	/** @type {import('../HybridStateManager.js').HybridStateManager|null} */
	stateManager = null;

	/**
	 * Binds the HybridStateManager to this instance.
	 * @public
	 * @param {import('../HybridStateManager.js').HybridStateManager} manager - The state manager instance.
	 * @returns {void}
	 */
	bindStateManager(manager) {
		this.stateManager = manager;
	}

	/**
	 * Creates an instance of SyncLayer.
	 * @param {import('./ModularOfflineStorage').default} storage - The storage instance to sync with.
	 * @param {object} [options={}] - Configuration options for the sync layer.
	 * @param {string} [options.apiEndpoint='/api/sync'] - The server endpoint for synchronization.
	 * @param {'user_guided'|'last_write_wins'|'first_write_wins'|'auto_merge'} [options.conflictResolution='user_guided'] - The strategy for resolving conflicts.
	 * @param {number} [options.maxRetries=3] - The maximum number of times to retry a failed sync item.
	 * @param {number} [options.retryDelay=1000] - The base delay for retries in milliseconds.
	 * @param {number} [options.batchSize=100] - The number of items to process in a single sync batch.
	 * @param {number} [options.syncInterval=30000] - The interval for automatic background sync in milliseconds.
	 * @param {boolean} [options.enableAutoSync=true] - Whether to enable automatic background synchronization.
	 */
	constructor(storage, options = {}) {
		this.#storage = storage;
		this.#config = {
			apiEndpoint: options.apiEndpoint || "/api/sync",
			conflictResolution: options.conflictResolution || "user_guided",
			maxRetries: options.maxRetries || 3,
			retryDelay: options.retryDelay || 1000,
			batchSize: options.batchSize || 100,
			syncInterval: options.syncInterval || 30000, // 30 seconds
			enableAutoSync: options.enableAutoSync !== false,
			...options,
		};

		this.#metrics = {
			syncCount: 0,
			conflictCount: 0,
			errorCount: 0,
			averageLatency: 0,
			lastSync: null,
			queueSize: 0,
			recentConflicts: [],
		};
	}

	/**
	 * Initializes the sync layer, setting up automatic synchronization and network listeners.
	 * @public
	 * @returns {Promise<this>} The initialized SyncLayer instance.
	 */
	async init() {
		if (this.#ready) return this;

		// Setup auto-sync if enabled
		if (this.#config.enableAutoSync) {
			this.#setupAutoSync();
		}

		// Setup network change listeners
		this.#setupNetworkListeners();

		this.#ready = true;
		console.log("[SyncLayer] Ready with bidirectional sync");
		return this;
	}

	/**
	 * Performs a synchronization operation (up, down, or bidirectional).
	 * This is the main entry point for triggering a sync.
	 * @public
	 * @param {object} [options={}] - Options for the sync operation.
	 * @returns {Promise<{up: object|null, down: object|null, conflicts: object[]}>} A promise that resolves with a summary of the sync operation.
	 */
	async performSync(options = {}) {
		if (!this.#ready) throw new Error("SyncLayer not initialized");
		if (this.#syncInProgress) {
			console.log(
				"[SyncLayer] Sync already in progress, queuing request"
			);
			return this.#queueSyncRequest(options);
		}

		this.#syncInProgress = true;
		const startTime = performance.now();

		try {
			const {
				direction = "bidirectional",
				conflictResolution = this.#config.conflictResolution,
				batchSize = this.#config.batchSize,
				force = false,
			} = options;

			let result = { up: null, down: null, conflicts: [] };

			// Upload changes to server
			if (direction === "up" || direction === "bidirectional") {
				result.up = await this.#syncUp(batchSize, force);
			}

			// Download changes from server
			if (direction === "down" || direction === "bidirectional") {
				result.down = await this.#syncDown(batchSize, force);
			}

			// Handle conflicts
			if (
				result.up?.conflicts?.length > 0 ||
				result.down?.conflicts?.length > 0
			) {
				const allConflicts = [
					...(result.up?.conflicts || []),
					...(result.down?.conflicts || []),
				];
				result.conflicts = await this.#resolveConflicts(
					allConflicts,
					conflictResolution
				);
			}

			const latency = performance.now() - startTime;
			this.#recordSync(true, latency, result);

			this.stateManager?.emit?.("syncCompleted", result);

			console.log(
				`[SyncLayer] Sync completed in ${latency.toFixed(2)}ms`
			);
			return result;
		} catch (error) {
			const latency = performance.now() - startTime;
			this.#recordSync(false, latency, null, error);

			this.stateManager?.emit?.("syncError", error);

			console.error("[SyncLayer] Sync failed:", error);
			throw error;
		} finally {
			this.#syncInProgress = false;
			this.#processQueuedSyncs();
		}
	}

	/**
	 * Adds an entity to the offline queue for future synchronization.
	 * @param {object} entity - The entity to queue.
	 * @public
	 * @param {'upsert'|'delete'} [operation='upsert'] - The operation type for the entity.
	 */
	queueEntityForSync(entity, operation = "upsert") {
		const queueItem = {
			id: entity.id,
			entity,
			operation, // 'upsert', 'delete'
			timestamp: Date.now(),
			retries: 0,
		};

		this.#syncQueue.push(queueItem);
		this.#metrics.queueSize = this.#syncQueue.length;

		// Trigger sync if auto-sync is enabled
		if (this.#config.enableAutoSync) {
			this.#debouncedSync();
		}
	}

	/**
	 * Retrieves a list of conflicts that require user intervention to be resolved.
	 * @public
	 * @returns {object[]} An array of pending conflict objects.
	 */
	getPendingConflicts() {
		return this.#conflictQueue.map((conflict) => ({
			id: conflict.id,
			entityType: conflict.entityType,
			conflictType: conflict.type,
			local: conflict.localEntity,
			remote: conflict.remoteEntity,
			timestamp: conflict.timestamp,
		}));
	}

	/**
	 * Resolves a pending conflict based on a specified resolution strategy.
	 * @public
	 * @param {string} conflictId - The ID of the conflict to resolve.
	 * @param {'use_local'|'use_remote'|'merge_auto'|'use_custom'} resolution - The chosen resolution strategy.
	 * @param {object|null} [customEntity=null] - The custom merged entity, required if `resolution` is 'use_custom'.
	 * @returns {Promise<object>} A promise that resolves with the final, resolved entity.
	 * @throws {Error} If the conflict is not found or the resolution is invalid.
	 */
	async resolveConflict(conflictId, resolution, customEntity = null) {
		const conflictIndex = this.#conflictQueue.findIndex(
			(c) => c.id === conflictId
		);
		if (conflictIndex === -1) {
			throw new Error(`Conflict ${conflictId} not found`);
		}

		const conflict = this.#conflictQueue[conflictIndex];
		let resolvedEntity;

		switch (resolution) {
			case "use_local":
				resolvedEntity = conflict.localEntity;
				break;
			case "use_remote":
				resolvedEntity = conflict.remoteEntity;
				break;
			case "merge_auto":
				resolvedEntity = this.#autoMergeEntities(
					conflict.localEntity,
					conflict.remoteEntity
				);
				break;
			case "use_custom":
				if (!customEntity) {
					throw new Error(
						"Custom entity required for custom resolution"
					);
				}
				resolvedEntity = customEntity;
				break;
			default:
				throw new Error(`Unknown conflict resolution: ${resolution}`);
		}

		// Apply resolution
		// Determine the correct store based on the entity's properties
		const storeName = resolvedEntity.classification_level
			? "objects_polyinstantiated"
			: "objects";

		// The ID for polyinstantiated objects is the logical_id
		const id =
			storeName === "objects_polyinstantiated"
				? resolvedEntity.logical_id
				: resolvedEntity.id;

		await this.#storage.put(storeName, resolvedEntity);

		// Remove from conflict queue
		this.#conflictQueue.splice(conflictIndex, 1);

		console.log(
			`[SyncLayer] Resolved conflict ${conflictId} using ${resolution}`
		);
		return resolvedEntity;
	}

	/**
	 * Retrieves performance and state metrics for the sync layer.
	 * @public
	 * @returns {object} An object containing various metrics.
	 */
	getStats() {
		return {
			...this.#metrics,
			queueSize: this.#syncQueue.length,
			conflictQueueSize: this.#conflictQueue.length,
			isReady: this.#ready,
			syncInProgress: this.#syncInProgress,
		};
	}

	/**
	 * Cleans up resources, stopping any running timers or intervals.
	 * @public
	 */
	cleanup() {
		if (this.#autoSyncInterval) {
			clearInterval(this.#autoSyncInterval);
		}

		// Clear retry timeouts
		for (const timeout of this.#retryTimeouts.values()) {
			clearTimeout(timeout);
		}
		this.#retryTimeouts.clear();

		this.#ready = false;
	}

	// ===== PRIVATE SYNC METHODS =====

	/**
	 * Pushes a batch of local changes from the sync queue to the server.
	 * @private
	 * @param {number} batchSize - The number of items to include in the batch.
	 * @param {boolean} force - If true, syncs even if the queue is empty.
	 * @returns {Promise<{synced: number, conflicts: object[], errors: object[]}>} A summary of the upload operation.
	 */
	async #syncUp(batchSize, force) {
		if (this.#syncQueue.length === 0 && !force) {
			return { synced: 0, conflicts: [], errors: [] };
		}

		const batch = this.#syncQueue.splice(0, batchSize);
		const conflicts = [];
		const errors = [];
		let synced = 0;

		for (const item of batch) {
			try {
				const response = await this.#sendToServer(item);

				if (response.conflict) {
					conflicts.push({
						id: crypto.randomUUID(),
						entityId: item.entity.id,
						entityType: item.entity.entity_type,
						type: response.conflictType,
						localEntity: item.entity,
						remoteEntity: response.remoteEntity,
						timestamp: Date.now(),
					});
				} else {
					synced++;
				}
			} catch (error) {
				console.warn(`Failed to sync entity ${item.entity.id}:`, error);
				errors.push({
					entityId: item.entity.id,
					error: error.message,
					retries: item.retries,
				});

				// Retry logic
				if (item.retries < this.#config.maxRetries) {
					item.retries++;
					this.#scheduleRetry(item);
				}
			}
		}

		this.#metrics.queueSize = this.#syncQueue.length;
		return { synced, conflicts, errors };
	}

	/**
	 * Pulls a batch of remote changes from the server since the last sync.
	 * @private
	 * @param {number} batchSize - The number of items to request from the server.
	 * @param {boolean} force - If true, performs the pull even if not strictly necessary.
	 * @returns {Promise<{synced: number, conflicts: object[], errors: object[]}>} A summary of the download operation.
	 */
	async #syncDown(batchSize, force) {
		try {
			const lastSync =
				this.#metrics.lastSync || new Date(0).toISOString();
			const response = await this.#fetchFromServer({
				since: lastSync,
				limit: batchSize,
				organizationId: this.#storage.currentOrganization,
			});

			const conflicts = [];
			const errors = [];
			let synced = 0;

			for (const remoteEntity of response.entities) {
				try {
					// Check for local version
					const storeName = remoteEntity.classification_level
						? "objects_polyinstantiated"
						: "objects";
					const id =
						storeName === "objects_polyinstantiated"
							? remoteEntity.logical_id
							: remoteEntity.id;

					const localEntity = await this.#storage.get(storeName, id);

					if (
						localEntity &&
						this.#hasConflict(localEntity, remoteEntity)
					) {
						conflicts.push({
							id: crypto.randomUUID(),
							entityId: remoteEntity.id,
							entityType: remoteEntity.entity_type,
							type: "update_conflict",
							localEntity,
							remoteEntity,
							timestamp: Date.now(),
						});
					} else {
						// No conflict, apply remote changes
						await this.#storage.put(storeName, remoteEntity);
						synced++;
					}
				} catch (error) {
					console.warn(
						`Failed to apply remote entity ${remoteEntity.id}:`,
						error
					);
					errors.push({
						entityId: remoteEntity.id,
						error: error.message,
					});
				}
			}

			return { synced, conflicts, errors };
		} catch (error) {
			console.error("[SyncLayer] Failed to fetch from server:", error);
			throw error;
		}
	}

	/**
	 * Orchestrates the resolution of a list of conflicts based on the specified strategy.
	 * @private
	 * @param {object[]} conflicts - An array of conflict objects to resolve.
	 * @param {string} strategy - The conflict resolution strategy to apply.
	 * @returns {Promise<{resolved: object[], unresolved: object[]}>} An object containing arrays of resolved and unresolved conflicts.
	 */
	async #resolveConflicts(conflicts, strategy) {
		const resolved = [];
		const unresolved = [];

		for (const conflict of conflicts) {
			try {
				let resolution;

				switch (strategy) {
					case "last_write_wins":
						resolution = this.#resolveLastWriteWins(conflict);
						break;
					case "first_write_wins":
						resolution = this.#resolveFirstWriteWins(conflict);
						break;
					case "auto_merge":
						resolution = this.#autoMergeEntities(
							conflict.localEntity,
							conflict.remoteEntity
						);
						break;
					case "user_guided":
						// Add to conflict queue for user resolution
						this.#conflictQueue.push(conflict);
						unresolved.push(conflict);
						continue;
					default:
						throw new Error(
							`Unknown conflict resolution strategy: ${strategy}`
						);
				}

				if (resolution) {
					const storeName = resolution.classification_level
						? "objects_polyinstantiated"
						: "objects";

					await this.#storage.put(storeName, resolution);

					resolved.push({
						conflictId: conflict.id,
						resolution: strategy,
						entity: resolution,
					});
				}
			} catch (error) {
				console.warn(
					`Failed to resolve conflict ${conflict.id}:`,
					error
				);
				unresolved.push(conflict);
			}
		}

		this.#metrics.conflictCount += conflicts.length;
		this.#metrics.recentConflicts.push(...conflicts.slice(0, 10));

		// Keep only recent conflicts
		if (this.#metrics.recentConflicts.length > 50) {
			this.#metrics.recentConflicts =
				this.#metrics.recentConflicts.slice(-50);
		}

		return { resolved, unresolved };
	}

	/**
	 * Detects if a conflict exists between a local and remote entity based on their update timestamps.
	 * @private
	 * @param {object} localEntity - The local version of the entity.
	 * @param {object} remoteEntity - The remote version of the entity.
	 * @returns {boolean} True if a conflict is detected.
	 */
	#hasConflict(localEntity, remoteEntity) {
		// Simple timestamp-based conflict detection
		const localTime = new Date(localEntity.updated_at).getTime();
		const remoteTime = new Date(remoteEntity.updated_at).getTime();

		// If both have been updated since last sync, it's a conflict
		const lastSyncTime = this.#metrics.lastSync
			? new Date(this.#metrics.lastSync).getTime()
			: 0;

		return (
			localTime > lastSyncTime &&
			remoteTime > lastSyncTime &&
			localTime !== remoteTime
		);
	}

	/**
	 * Performs a simple, automatic merge of two entities, preferring newer field values.
	 * @private
	 * @param {object} localEntity - The local version of the entity.
	 * @param {object} remoteEntity - The remote version of the entity.
	 * @returns {object} The merged entity.
	 */
	#autoMergeEntities(localEntity, remoteEntity) {
		const merged = { ...localEntity };

		// Merge fields, preferring newer values
		for (const [key, value] of Object.entries(remoteEntity)) {
			if (key === "id") continue; // Never change ID

			if (key === "updated_at" || key === "created_at") {
				// Keep the later timestamp
				const localTime = new Date(localEntity[key] || 0).getTime();
				const remoteTime = new Date(value || 0).getTime();
				merged[key] = remoteTime > localTime ? value : localEntity[key];
			} else if (
				localEntity[key] === undefined ||
				localEntity[key] === null
			) {
				// Use remote value if local is empty
				merged[key] = value;
			} else if (value !== undefined && value !== null) {
				// Both have values, use remote (could be more sophisticated)
				merged[key] = value;
			}
		}

		// Update modification timestamp
		merged.updated_at = new Date().toISOString();

		return merged;
	}

	/**
	 * Resolves a conflict by choosing the entity with the most recent `updated_at` timestamp.
	 * @private
	 * @param {object} conflict - The conflict object.
	 * @returns {object} The winning entity.
	 */
	#resolveLastWriteWins(conflict) {
		const localTime = new Date(conflict.localEntity.updated_at).getTime();
		const remoteTime = new Date(conflict.remoteEntity.updated_at).getTime();

		return remoteTime > localTime
			? conflict.remoteEntity
			: conflict.localEntity;
	}

	/**
	 * Resolves a conflict by choosing the entity with the oldest `updated_at` timestamp.
	 * @private
	 * @param {object} conflict - The conflict object.
	 * @returns {object} The winning entity.
	 */
	#resolveFirstWriteWins(conflict) {
		const localTime = new Date(conflict.localEntity.updated_at).getTime();
		const remoteTime = new Date(conflict.remoteEntity.updated_at).getTime();

		return localTime < remoteTime
			? conflict.localEntity
			: conflict.remoteEntity;
	}

	/**
	 * Sends a single sync item (entity + operation) to the server API.
	 * @private
	 * @param {object} item - The sync queue item.
	 * @returns {Promise<object>} The JSON response from the server.
	 */
	async #sendToServer(item) {
		const response = await fetch(`${this.#config.apiEndpoint}/entities`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.#getAuthToken()}`,
			},
			body: JSON.stringify({
				entity: item.entity,
				operation: item.operation,
				timestamp: item.timestamp,
			}),
		});

		if (!response.ok) {
			throw new Error(
				`Server error: ${response.status} ${response.statusText}`
			);
		}

		return await response.json();
	}

	/**
	 * Fetches a batch of entities from the server API.
	 * @private
	 * @param {object} params - The query parameters for the fetch request (e.g., `since`, `limit`).
	 * @returns {Promise<object>} The JSON response from the server.
	 */
	async #fetchFromServer(params) {
		const url = new URL(
			`${this.#config.apiEndpoint}/entities`,
			window.location.origin
		);
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined && value !== null) {
				url.searchParams.append(key, value);
			}
		});

		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${this.#getAuthToken()}`,
			},
		});

		if (!response.ok) {
			throw new Error(
				`Server error: ${response.status} ${response.statusText}`
			);
		}

		return await response.json();
	}

	/**
	 * Retrieves the authentication token for API requests.
	 * @private
	 * @returns {string} The authentication token.
	 */
	#getAuthToken() {
		// This would come from your auth system
		return localStorage.getItem("auth_token") || "demo-token";
	}

	/**
	 * Sets up a periodic interval to automatically trigger synchronization.
	 * @private
	 */
	#setupAutoSync() {
		this.#autoSyncInterval = setInterval(() => {
			if (!this.#syncInProgress && this.#syncQueue.length > 0) {
				this.performSync().catch((error) => {
					console.warn("[SyncLayer] Auto-sync failed:", error);
				});
			}
		}, this.#config.syncInterval);
	}

	/**
	 * Sets up event listeners to automatically trigger a sync when the network status changes to 'online'.
	 * @private
	 */
	#setupNetworkListeners() {
		if (typeof window !== "undefined" && "navigator" in window) {
			window.addEventListener("online", () => {
				console.log("[SyncLayer] Network online, triggering sync");
				this.performSync().catch(console.warn);
			});

			window.addEventListener("offline", () => {
				console.log("[SyncLayer] Network offline, sync paused");
			});
		}
	}

	/**
	 * Triggers a sync operation after a short delay to debounce multiple rapid requests.
	 * @private
	 */
	#debouncedSync() {
		clearTimeout(this.#syncDebounceTimeout);
		this.#syncDebounceTimeout = setTimeout(() => {
			if (!this.#syncInProgress) {
				this.performSync().catch(console.warn);
			}
		}, 1000);
	}

	/**
	 * Schedules a failed sync item to be re-added to the queue after an exponential backoff delay.
	 * @private
	 * @param {object} item - The failed sync queue item.
	 */
	#scheduleRetry(item) {
		const delay = this.#config.retryDelay * Math.pow(2, item.retries - 1); // Exponential backoff

		const timeout = setTimeout(() => {
			this.#syncQueue.push(item);
			this.#metrics.queueSize = this.#syncQueue.length;
			this.#retryTimeouts.delete(item.entity.id);
		}, delay);

		this.#retryTimeouts.set(item.entity.id, timeout);
	}

	/**
	 * Queues a sync request if another sync operation is already in progress.
	 * @private
	 * @param {object} options - The options for the sync operation to queue.
	 */
	async #queueSyncRequest(options) {
		return new Promise((resolve, reject) => {
			const checkAndExecute = () => {
				if (!this.#syncInProgress) {
					this.performSync(options).then(resolve).catch(reject);
				} else {
					setTimeout(checkAndExecute, 100);
				}
			};
			checkAndExecute();
		});
	}

	/**
	 * Processes any queued sync requests after the current operation completes.
	 * @private
	 */
	#processQueuedSyncs() {
		// If there are items in the queue and we're not syncing, trigger another sync
		if (this.#syncQueue.length > 0 && !this.#syncInProgress) {
			setTimeout(() => {
				this.performSync().catch(console.warn);
			}, 100);
		}
	}

	/**
	 * Records metrics after a sync operation completes.
	 * @private
	 * @param {boolean} success - Whether the sync was successful.
	 * @param {number} latency - The duration of the sync in milliseconds.
	 * @param {object|null} result - The result of the sync operation.
	 * @param {Error|null} [error=null] - Any error that occurred.
	 */
	#recordSync(success, latency, result, error = null) {
		this.#metrics.syncCount++;
		this.#metrics.lastSync = new Date().toISOString();

		if (!success) {
			this.#metrics.errorCount++;
		}

		// Update average latency
		this.#metrics.averageLatency =
			(this.#metrics.averageLatency * (this.#metrics.syncCount - 1) +
				latency) /
			this.#metrics.syncCount;
	}
}

export default SyncLayer;
