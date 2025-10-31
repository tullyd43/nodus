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
 * @privateFields {#syncQueue, #isResyncNeeded, #conflictQueue, #syncInProgress, #autoSyncInterval, #retryTimeouts, #stateManager, #config, #ready, #forensicLogger, #securityManager, #metrics, #errorHelpers, #cacheManager, #debouncedSync}
 */
export class SyncLayer {
	/** @private @type {Array<object>} */
	#syncQueue = [];
	/** @private @type {Array<object>} */
	#conflictQueue = [];
	/** @private @type {boolean} */
	#isResyncNeeded = false;
	/** @private @type {boolean} */
	#syncInProgress = false;
	/** @private @type {number|null} */
	#autoSyncInterval = null;
	/**
	 * @private
	 * @description V8.0 Parity: Mandate 4.1 - Use a bounded cache for retry timeouts.
	 * @type {import('../../utils/LRUCache.js').LRUCache|null}
	 */
	#retryTimeouts = null;
	/**
	 * @private @type {import('../HybridStateManager.js').default}
	 */
	#stateManager = null;
	/**
	 * @private @type {object}
	 */
	#config;
	/**
	 * @private @type {boolean}
	 */
	#ready = false;
	/** @private @type {import('../ForensicLogger.js').default|null} */
	#forensicLogger = null;
	/** @private @type {import('../security/SecurityManager.js').default|null} */
	#securityManager = null;
	/** @private @type {import('../../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/** @private @type {import('../managers/CacheManager.js').default|null} */
	#cacheManager = null;
	/**
	 * A debounced function to trigger synchronization.
	 * @private
	 * @type {Function}
	 */
	#debouncedSync;

	/**
	 * Creates an instance of SyncLayer.
	 * @param {object} context - The application context.
	 * @param {import('../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;

		// V8.0 Parity: All configuration is derived from the stateManager.
		const options = this.#stateManager?.config?.syncLayerConfig || {};
		this.#config = {
			apiEndpoint: options.apiEndpoint || "/api/sync",
			conflictResolution: options.conflictResolution || "user_guided",
			maxRetries: options.maxRetries || 3,
			retryDelay: options.retryDelay || 1000,
			batchSize: options.batchSize || 100,
			syncInterval: options.syncInterval || 30000, // 30 seconds
			debounceInterval: options.debounceInterval || 2000, // 2 seconds
			enableAutoSync: options.enableAutoSync !== false,
			...options,
		};

		// Mandate 3.1: Private methods should be bound if needed, not defined as properties.
		this.#debouncedSync = this.#debounce(() => {
			this.performSync().catch(console.warn);
		}, this.#config.debounceInterval);
	}

	/**
	 * Initializes the sync layer, setting up automatic synchronization and network listeners.
	 * @public
	 * @returns {Promise<this>} The initialized SyncLayer instance.
	 */
	async init() {
		if (this.#ready) return this;

		// V8.0 Parity: Mandate 1.2 - Derive dependencies from the stateManager.
		const managers = this.#stateManager.managers;
		this.#forensicLogger = managers?.forensicLogger ?? null;
		this.#securityManager = managers?.securityManager ?? null;
		this.#errorHelpers = managers?.errorHelpers ?? null;
		this.#cacheManager = managers?.cacheManager ?? null;
		this.#metrics = this.#stateManager.metricsRegistry?.namespace("sync");

		// V8.0 Parity: Mandate 4.1 - Use the central CacheManager for bounded caches.
		this.#retryTimeouts = this.#cacheManager?.getCache("syncRetries", {
			ttl: 24 * 60 * 60 * 1000, // 24 hours for a retry timeout
		});

		this.#audit("sync_layer_initialized", {
			autoSync: this.#config.enableAutoSync,
			conflictStrategy: this.#config.conflictResolution,
		});

		// Setup auto-sync if enabled
		if (this.#config.enableAutoSync) {
			this.#setupAutoSync();
		}

		// Setup network change listeners
		this.#setupNetworkListeners();

		// Mandate 4.3: Apply metrics decorator to performance-critical methods.
		const measure =
			this.#stateManager.managers.metricsRegistry?.measure.bind(
				this.#stateManager.managers.metricsRegistry
			);
		if (measure) {
			// Wrap the core sync method for performance tracking.
			this.performSync = measure("sync.performSync", {
				source: "SyncLayer",
			})(this.performSync.bind(this));
		}

		this.#ready = true;
		console.log("[SyncLayer] Ready with bidirectional sync.");
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
		if (!this.#ready) throw new Error("SyncLayer not initialized.");
		if (this.#syncInProgress && !options?.force) {
			console.log(
				"[SyncLayer] Sync already in progress, queuing request."
			);
			this.#isResyncNeeded = true; // Flag that a sync is wanted after the current one.
			return; // Exit and let the current sync loop handle the next run.
		}

		this.#syncInProgress = true;

		const syncOptions = {
			direction: "bidirectional",
			conflictResolution: this.#config.conflictResolution,
			batchSize: this.#config.batchSize,
			...options,
		};

		const result = { up: null, down: null, conflicts: [] };

		try {
			const startTime = performance.now();
			const capturedSync = async () => {
				// Upload changes to server
				if (
					syncOptions.direction === "up" ||
					syncOptions.direction === "bidirectional"
				) {
					result.up = await this.#syncUp(syncOptions.batchSize);
				}

				// Download changes from server
				if (
					syncOptions.direction === "down" ||
					syncOptions.direction === "bidirectional"
				) {
					result.down = await this.#syncDown(syncOptions.batchSize);
				}
				return result;
			};

			await this.#errorHelpers?.captureAsync(capturedSync, {
				component: "SyncLayer.performSync",
				operation: "performSync",
			});
			const latency = performance.now() - startTime;
			this.#recordSync(true, latency, result);

			console.log(
				`[SyncLayer] Sync completed in ${latency.toFixed(2)}ms.`
			);
			this.#stateManager.emit("syncCompleted", result);

			return result;
		} catch (error) {
			// Latency is not meaningful on failure, but we log the attempt.
			this.#recordSync(false, 0, null, error);
			this.#audit("sync_failed", {
				error: error?.message,
				stack: error.stack,
			});
			this.#stateManager.emit("syncError", error);

			console.error("[SyncLayer] Sync failed:", error);
			throw error;
		} finally {
			this.#syncInProgress = false;
			// If another sync was requested while this one was running, start it now.
			if (this.#isResyncNeeded || this.#syncQueue.length > 0) {
				this.#isResyncNeeded = false;
				this.performSync().catch(console.warn);
			}
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
		this.#metrics?.set("queue_size", this.#syncQueue.length);
		this.#audit("entity_queued_for_sync", {
			entityId: entity.id,
			entityType: entity.entity_type,
			operation,
			queueSize: this.#syncQueue.length,
		});

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

		// V8.0 Parity: Use stateManager's storage instance directly.
		await this.#stateManager.storage.instance.put(
			storeName,
			resolvedEntity
		);

		// Remove from conflict queue
		this.#conflictQueue.splice(conflictIndex, 1);
		this.#metrics?.set("conflict_queue_size", this.#conflictQueue.length);

		this.#audit("conflict_resolved", {
			conflictId,
			resolution,
			entityId: resolvedEntity.id,
			finalEntityType: resolvedEntity.entity_type,
		});

		console.log(
			`[SyncLayer] Resolved conflict ${conflictId} using ${resolution}`
		);
		return resolvedEntity;
	}

	/**
	 * Gets performance and state metrics for the sync layer.
	 * @public
	 * @type {object}
	 */
	get stats() {
		return {
			...this.#metrics?.getAllAsObject(),
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

		// Clear retry timeouts from the LRUCache
		// The LRUCache's `onEvict` would be the ideal place, but a manual clear is also fine.
		this.#retryTimeouts?.forEach((timeout) => {
			clearTimeout(timeout.value);
		});

		this.#audit("sync_layer_cleanup", {
			clearedRetries: this.#retryTimeouts?.size ?? 0,
		});
		this.#retryTimeouts?.clear();

		this.#ready = false;
	}

	// ===== PRIVATE SYNC METHODS =====

	/**
	 * Pushes a batch of local changes from the sync queue to the server.
	 * @private
	 * @param {number} batchSize - The number of items to include in the batch.
	 * @returns {Promise<{synced: number, conflicts: object[], errors: object[]}>} A summary of the upload operation.
	 */
	async #syncUp(batchSize) {
		if (this.#syncQueue.length === 0) {
			return { synced: 0, conflicts: [], errors: [] };
		}

		const batch = this.#syncQueue.splice(0, batchSize);
		const conflicts = [];
		const errors = [];
		let synced = 0;

		for (const item of batch) {
			try {
				const response = await this.#sendToServer(item);
				this.#audit("sync_up_item_sent", {
					entityId: item.entity.id,
					operation: item.operation,
					responseStatus: response.status,
				});

				if (response.conflict) {
					const newConflict = {
						id: crypto.randomUUID(),
						entityId: item.entity.id,
						entityType: item.entity.entity_type,
						type: response.conflictType,
						localEntity: item.entity,
						remoteEntity: response.remoteEntity,
						timestamp: Date.now(),
					};
					this.#audit("sync_up_conflict_detected", {
						entityId: item.entity.id,
						conflictType: response.conflictType,
					});
					conflicts.push(newConflict);
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

		this.#metrics?.set("queue_size", this.#syncQueue.length);
		return { synced, conflicts, errors };
	}

	/**
	 * Pulls a batch of remote changes from the server since the last sync.
	 * @private
	 * @param {number} batchSize - The number of items to request from the server.
	 * @returns {Promise<{synced: number, conflicts: object[], errors: object[]}>} A summary of the download operation.
	 */
	async #syncDown(batchSize) {
		try {
			const lastSyncTimestampISO =
				this.#metrics?.get("last_sync")?.value ||
				new Date(0).toISOString();

			// Mandate 4.2: Pre-parse the date outside the loop.
			const lastSyncTime = new Date(lastSyncTimestampISO).getTime();

			const response = (await this.#fetchFromServer({
				since: lastSyncTimestampISO,
				limit: batchSize,
				organizationId: this.#stateManager.config.organizationId,
			})) ?? { entities: [] };

			const conflicts = [];
			const errors = [];
			let synced = 0;

			for (const remoteEntity of response.entities) {
				try {
					const storeName = remoteEntity.classification_level
						? "objects_polyinstantiated"
						: "objects"; // V8.0 Parity: Use stateManager's storage instance.
					const entityId =
						storeName === "objects_polyinstantiated"
							? remoteEntity.logical_id
							: remoteEntity.id;

					const localEntity =
						await this.#stateManager.storage.instance?.get(
							storeName,
							entityId
						);

					if (
						localEntity &&
						this.#hasConflict(
							localEntity,
							remoteEntity,
							lastSyncTime
						)
					) {
						const newConflict = {
							id: crypto.randomUUID(),
							entityId: remoteEntity.id,
							entityType: remoteEntity.entity_type,
							type: "update_conflict",
							localEntity,
							remoteEntity,
							timestamp: Date.now(),
						};
						conflicts.push(newConflict);
						this.#audit("sync_down_conflict_detected", {
							entityId: remoteEntity.id,
						});
					} else {
						// No conflict, apply remote changes
						await this.#applyRemoteChange(storeName, remoteEntity);
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
	 * Detects if a conflict exists between a local and remote entity based on their update timestamps.
	 * @private
	 * @param {object} localEntity - The local version of the entity.
	 * @param {object} remoteEntity - The remote version of the entity.
	 * @param {number} lastSyncTime - The timestamp of the last successful sync.
	 * @returns {boolean} True if a conflict is detected.
	 */
	#hasConflict(localEntity, remoteEntity, lastSyncTime) {
		// Mandate 3: Robustness. A conflict exists if the local entity has changed since the last sync,
		// and the remote entity's timestamp doesn't match the local one.
		// Mandate 4.2: Pre-parse dates to avoid parsing in a hot path.
		const localTime = new Date(localEntity.updated_at).getTime();
		const remoteTime = new Date(remoteEntity.updated_at).getTime();

		const localHasChangedSinceSync = localTime > lastSyncTime;
		const timestampsDiffer = localTime !== remoteTime;

		// It's a conflict if the local version has been modified since we last synced,
		// and the remote version is different.
		return localHasChangedSinceSync && timestampsDiffer;
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
		return this.#securityManager?.getAuthToken() || "demo-token";
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
			window.addEventListener(
				"online",
				() => {
					console.log("[SyncLayer] Network online, triggering sync.");
					this.performSync().catch(console.warn);
				},
				{ passive: true }
			);

			window.addEventListener(
				"offline",
				() => {
					console.log("[SyncLayer] Network offline, sync paused.");
				},
				{ passive: true }
			);
		}
	}

	/**
	 * Wraps the storage `put` operation to handle security errors during sync-down.
	 * @private
	 * @param {string} storeName - The name of the object store.
	 * @param {object} entity - The entity to save.
	 * @returns {Promise<void>}
	 * @throws {Error} Throws an error if the write operation fails for non-security reasons.
	 */
	async #applyRemoteChange(storeName, entity) {
		try {
			// Mandate 2.3: All data access MUST be filtered. The `put` method enforces MAC.
			await this.#stateManager.storage.instance?.put(storeName, entity);
		} catch (error) {
			// If the error is a MAC violation, it's a sync issue, not a critical failure.
			// This prevents the sync loop from crashing on a permissions error.
			if (error.message.includes("MAC_WRITE_DENIED")) {
				this.#audit("sync_down_mac_denied", {
					entityId: entity.id,
					entityType: entity.entity_type,
				});
				// Re-throw as a specific, catchable error for the sync-down loop.
				throw new Error(
					`MAC policy denied applying remote change for entity ${entity.id}.`
				);
			}
			// For other errors, re-throw to let the main error handler catch it.
			throw error;
		}
	}

	/**
	 * Triggers a sync operation after a short delay to debounce multiple rapid requests.
	 * @private
	 */
	#scheduleRetry(item) {
		const delay = this.#config.retryDelay * Math.pow(2, item.retries - 1); // Exponential backoff

		const timeout = setTimeout(() => {
			this.queueEntityForSync(item.entity, item.operation); // Re-queue it
			this.#retryTimeouts?.delete(item.entity.id);
		}, delay);

		this.#retryTimeouts?.set(item.entity.id, timeout); // This will now use the LRUCache
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
		this.#metrics?.increment("sync_count");
		const timestamp = new Date().toISOString();
		this.#metrics?.set("last_sync", timestamp);

		if (!success) {
			this.#metrics?.increment("error_count");
			this.#metrics?.set("last_sync_error", timestamp);
		}
		this.#metrics?.updateAverage("average_latency", latency);
	}

	/**
	 * Logs an audit event if the forensic logger is available.
	 * @private
	 * @param {string} eventType - The type of the event (e.g., 'SYNC_COMPLETED').
	 * @param {object} data - The data associated with the event.
	 */
	#audit(eventType, data) {
		this.#forensicLogger?.logAuditEvent(eventType, data, {
			component: "SyncLayer",
			// Mandate 2.4: Pass the full user context for attribution.
			userContext: this.#securityManager?.getSubject(),
		});
	}

	/**
	 * Creates a debounced function that delays invoking `func` until after `wait` milliseconds have elapsed.
	 * @private
	 * @param {Function} func The function to debounce.
	 * @param {number} wait The number of milliseconds to delay.
	 * @returns {Function} Returns the new debounced function.
	 */
	#debounce(func, wait) {
		let timeout;
		return function executedFunction(...args) {
			const later = () => {
				clearTimeout(timeout);
				func.apply(this, args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}
}

export default SyncLayer;
