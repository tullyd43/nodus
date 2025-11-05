/**
 * @file SyncLayer.js
 * @version 8.0.0
 * @description Production-ready bidirectional synchronization layer with comprehensive observability,
 * security enforcement, and compliance features. Uses centralized orchestration wrapper for
 * consistent observability and minimal logging noise.
 *
 * ESLint Exception: nodus/require-async-orchestration
 * Justification: Wrapper pattern provides superior observability consistency and
 * centralized policy enforcement compared to per-method orchestrator setup.
 *
 * Security Classification: CONFIDENTIAL
 * License Tier: Enterprise (sync operations require license validation)
 * Compliance: MAC-enforced, forensic-audited, performance-monitored
 *
 * @see {@link NODUS_DEVELOPER_MIGRATION_GUIDE.md} - Orchestrator patterns and observability requirements
 */

/* eslint-disable nodus/require-async-orchestration */

import { CDS } from "@platform/security/CDS.js";
import { DateCore } from "@shared/lib/DateUtils.js";
import {
	getObservabilityFlags,
	maybeWrap as sharedMaybeWrap,
} from "@shared/lib/observabilityToggles.js";

/**
 * @typedef {Object} SyncModule
 * @property {boolean} [supportsPush] - Whether module supports push operations
 * @property {boolean} [supportsPull] - Whether module supports pull operations
 * @property {(item: any) => boolean} [supportsItem] - Function to check if module supports specific item
 * @property {() => Promise<void>} [init] - Module initialization function
 * @property {(options?: object) => Promise<any>} [push] - Push operation implementation
 * @property {(options?: object) => Promise<any>} [pull] - Pull operation implementation
 */

/**
 * @typedef {Object} SyncLayerOptions
 * @property {string} [apiEndpoint="/api/sync"] - API endpoint for sync operations
 * @property {string} [conflictResolution="user_guided"] - Strategy for conflict resolution
 * @property {number} [maxRetries=3] - Maximum retry attempts for failed operations
 * @property {number} [retryDelay=1000] - Delay between retry attempts in milliseconds
 * @property {number} [batchSize=100] - Maximum items per sync batch
 * @property {number} [syncInterval=30000] - Interval for auto-sync in milliseconds
 * @property {number} [debounceInterval=2000] - Debounce interval for sync requests
 * @property {boolean} [enableAutoSync=true] - Enable automatic synchronization
 */

/**
 * @class SyncLayer
 * @classdesc Enterprise-grade bidirectional data synchronization with comprehensive observability,
 * automatic instrumentation, and compliance features. Orchestrates sync operations between local
 * offline storage and remote servers with complete audit trails.
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
	/** @private @type {import('@shared/lib/LRUCache.js').LRUCache|null} */
	#retryTimeouts = null;
	/** @private @type {import('@platform/state/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {object} */
	#managers;
	/** @private @type {{ cleanse?:(value:any, schema?:any)=>any, cleanseText?:(value:string)=>string }|null} */
	#sanitizer;
	/** @private @type {import('@shared/lib/MetricsRegistry.js').MetricsRegistry|undefined} */
	#metrics;
	/** @private @type {ErrorConstructor} */
	#AppError;
	/** @private @type {ErrorConstructor} */
	#PolicyError;
	/** @private @type {import('@shared/lib/ErrorHelpers.js').ErrorBoundary} */
	#errorBoundary;
	/** @private @type {Set<string>} */
	#loggedWarnings;
	/** @private @type {string} */
	#currentUser;
	/** @private @type {import('@platform/core/IdManager.js').default} */
	#idManager;
	/** @private @type {import('@platform/actions/ActionDispatcher.js').default} */
	#actionDispatcher;
	/** @private @type {import('@platform/observability/ForensicRegistry.js').default} */
	#forensicRegistry;
	/** @private @type {import('@platform/policies/PolicyEngineAdapter.js').default} */
	#policies;
	/** @private @type {ReturnType<import("@shared/lib/async/AsyncOrchestrationService.js").AsyncOrchestrationService["createRunner"]>} */
	#orchestratorRunner;
	/** @private @type {SyncLayerOptions} */
	#config;
	/** @private @type {object} */
	#obsFlags;
	/** @private @type {boolean} */
	#ready = false;
	/** @private @type {Function} */
	#debouncedSync;

	/**
	 * Creates an instance of SyncLayer with enterprise synchronization and observability.
	 * @param {object} context - The application context.
	 * @param {import('../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		if (!stateManager) {
			throw new Error(
				"SyncLayer requires stateManager for observability compliance"
			);
		}

		this.#stateManager = stateManager;
		this.#loggedWarnings = new Set();

		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from stateManager
		this.#managers = stateManager?.managers || {};
		this.#sanitizer = this.#managers?.sanitizer || null;
		this.#metrics =
			this.#managers?.metricsRegistry?.namespace("syncLayer") || null;
		this.#AppError = this.#managers?.errorHelpers?.AppError || Error;
		this.#PolicyError = this.#managers?.errorHelpers?.PolicyError || Error;
		this.#errorBoundary = this.#managers?.errorHelpers?.createErrorBoundary(
			{
				name: "SyncLayer",
				managers: this.#managers,
			},
			"SyncLayer"
		);
		this.#idManager = this.#managers?.idManager || null;
		this.#actionDispatcher = this.#managers?.actionDispatcher || null;
		this.#forensicRegistry =
			this.#managers?.observability?.forensicRegistry || null;
		this.#policies = this.#managers?.policies || null;

		this.#currentUser = this.#initializeUserContext();

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

		// Observability toggles: allow runtime configuration to reduce overhead
		// (disable metrics/timers/events/forensic wraps when running in hot paths).
		this.#config.observability = {
			enableMetrics:
				options?.observability?.enableMetrics !== undefined
					? options.observability.enableMetrics
					: true,
			enableTimers:
				options?.observability?.enableTimers !== undefined
					? options.observability.enableTimers
					: true,
			enableEvents:
				options?.observability?.enableEvents !== undefined
					? options.observability.enableEvents
					: true,
			enableForensic:
				options?.observability?.enableForensic !== undefined
					? options.observability.enableForensic
					: true,
		};

		// Derive observable flags centrally so other modules can override or
		// platform policies can inject behavior via stateManager config.
		this.#obsFlags = getObservabilityFlags(
			this.#stateManager,
			options?.observability
		);

		const orchestrator = this.#managers?.asyncOrchestrator;
		if (!orchestrator) {
			throw new this.#AppError(
				"AsyncOrchestrationService required for SyncLayer observability compliance"
			);
		}

		this.#orchestratorRunner = orchestrator.createRunner({
			labelPrefix: "sync.layer",
			actorId: "sync.layer",
			eventType: "SYNC_LAYER_OPERATION",
			meta: { component: "SyncLayer" },
		});

		// Bind the debounced sync method
		this.#debouncedSync = this.#debounce(() => {
			this.performSync().catch((error) => {
				this.#emitCriticalWarning("Debounced sync failed", {
					error: error.message,
				});
			});
		}, this.#config.debounceInterval);

		// Validate enterprise license for sync management
		this.#validateSyncLicense();
	}

	/**
	 * Initializes user context once to avoid repeated lookups.
	 * @private
	 * @returns {string}
	 */
	#initializeUserContext() {
		const securityManager = this.#managers?.securityManager;

		if (securityManager?.getSubject) {
			const subject = securityManager.getSubject();
			const userId = subject?.userId || subject?.id;

			if (userId) {
				this.#dispatchAction("security.user_context_initialized", {
					userId,
					source: "SyncLayer",
					component: "SyncLayer",
				});
				return userId;
			}
		}

		this.#dispatchAction("security.user_context_failed", {
			component: "SyncLayer",
			error: "No valid user context found",
		});

		return "system";
	}

	/**
	 * Validates enterprise license for sync management features.
	 * @private
	 */
	#validateSyncLicense() {
		const license = this.#managers?.license;
		if (!license?.hasFeature("sync_layer")) {
			this.#dispatchAction("license.validation_failed", {
				feature: "sync_layer",
				component: "SyncLayer",
			});
			throw new this.#PolicyError(
				"Enterprise license required for SyncLayer"
			);
		}
	}

	/**
	 * Centralized orchestration wrapper for consistent observability and policy enforcement.
	 * @private
	 * @param {string} operationName - Operation identifier for metrics and logging
	 * @param {Function} operation - Synchronous function that returns a Promise to execute
	 * @param {object} [options={}] - Additional orchestrator options
	 * @returns {Promise<any>}
	 */
	async #runOrchestrated(operationName, operation, options = {}) {
		// Policy enforcement
		if (!this.#policies?.getPolicy("async", "enabled")) {
			this.#emitWarning("Async operations disabled by policy", {
				operation: operationName,
			});
			return Promise.resolve(null);
		}

		if (!this.#policies?.getPolicy("sync", "enabled")) {
			this.#emitWarning("Sync operations disabled by policy", {
				operation: operationName,
			});
			return Promise.resolve(null);
		}

		try {
			/* PERFORMANCE_BUDGET: 15ms for sync operations */
			// Prefer creating a short-lived runner per operation to provide
			// clearer labels and per-operation metadata in observability traces.
			const orchestrator = this.#managers?.asyncOrchestrator;
			if (!orchestrator) {
				throw new this.#AppError(
					"AsyncOrchestrationService required for SyncLayer observability compliance"
				);
			}

			const runner = orchestrator.createRunner({
				labelPrefix: `sync.layer.${operationName}`,
				actorId: this.#currentUser,
				eventType: "SYNC_LAYER_OPERATION",
				meta: { component: "SyncLayer", operation: operationName },
			});

			const result = await runner.run(
				() =>
					this.#errorBoundary?.try(() => operation()) || operation(),
				{
					label: `sync.${operationName}`,
					actorId: this.#currentUser,
					classification: "CONFIDENTIAL",
					timeout: options.timeout || 30000,
					retries: options.retries || this.#config.maxRetries,
					...options,
				}
			);

			return result;
		} catch (error) {
			this.#incrementMetric("sync_orchestration_error");
			this.#emitCriticalWarning("Sync orchestration failed", {
				operation: operationName,
				error: error.message,
				user: this.#currentUser,
			});
			throw error;
		}
	}

	/**
	 * Create a metrics key namespaced to this component.
	 * @private
	 */
	#metricKey(name) {
		return `syncLayer.${name}`;
	}

	/**
	 * Dispatch an increment metric update through ActionDispatcher when available.
	 * @private
	 */
	#incrementMetric(name, value = 1) {
		const key = this.#metricKey(name);
		try {
			if (this.#actionDispatcher?.dispatch) {
				/* PERFORMANCE_BUDGET: 1ms */
				this.#actionDispatcher.dispatch("metrics.increment", {
					key,
					value,
				});
				return;
			}
		} catch {
			// Fall through to metrics registry fallback
		}

		// Fallback to local metrics registry when dispatcher is unavailable
		try {
			this.#metrics?.increment?.(key, value);
		} catch {}
	}

	/**
	 * Dispatch a set metric update through ActionDispatcher when available.
	 * @private
	 */
	#setMetric(name, value) {
		const key = this.#metricKey(name);
		try {
			if (this.#actionDispatcher?.dispatch) {
				/* PERFORMANCE_BUDGET: 1ms */
				this.#actionDispatcher.dispatch("metrics.set", {
					key,
					value,
				});
				return;
			}
		} catch {
			// Fall through to metrics registry fallback
		}

		try {
			this.#metrics?.set?.(key, value);
		} catch {}
	}

	/**
	 * Dispatch a timer metric (duration) through ActionDispatcher when available.
	 * @private
	 */
	#recordTimer(name, value) {
		if (!this.#obsFlags?.enableTimers) return;
		const key = this.#metricKey(name);
		try {
			if (this.#actionDispatcher?.dispatch) {
				/* PERFORMANCE_BUDGET: 1ms */
				this.#actionDispatcher.dispatch("metrics.timer", {
					key,
					value,
				});
				return;
			}
		} catch {
			// Fall through to metrics registry fallback
		}

		try {
			this.#metrics?.timer?.(key, value);
		} catch {}
	}

	/**
	 * Dispatches an action through the ActionDispatcher for observability.
	 * @private
	 * @param {string} actionType - Type of action to dispatch
	 * @param {object} payload - Action payload
	 */
	#dispatchAction(actionType, payload) {
		if (!this.#obsFlags?.enableEvents) return;
		try {
			/* PERFORMANCE_BUDGET: 2ms */
			this.#actionDispatcher?.dispatch(actionType, {
				...payload,
				actor: this.#currentUser,
				timestamp: DateCore.timestamp(),
				source: "SyncLayer",
			});
		} catch (error) {
			this.#emitCriticalWarning("Action dispatch failed", {
				actionType,
				error: error.message,
			});
		}
	}

	/**
	 * Conditionally wrap a function with forensicRegistry.wrapOperation depending on
	 * the observability configuration. When forensic wraps are disabled this will
	 * execute the function directly to avoid instrumentation overhead.
	 * @private
	 */
	async #maybeWrap(domain, operation, fn, meta) {
		// Delegate to the shared maybeWrap helper which centralizes policy
		// about whether forensic wraps are performed.
		return await sharedMaybeWrap(
			this.#forensicRegistry,
			this.#obsFlags,
			domain,
			operation,
			fn,
			meta
		);
	}

	/**
	 * Sanitizes input to prevent injection attacks.
	 * @private
	 * @param {any} input - Input to sanitize
	 * @param {object} [schema] - Validation schema
	 * @returns {any} Sanitized input
	 */
	#sanitizeInput(input, schema) {
		if (!this.#sanitizer) {
			this.#dispatchAction("security.sanitizer_unavailable", {
				component: "SyncLayer",
			});
			return input;
		}

		const result = this.#sanitizer.cleanse?.(input, schema) || input;

		if (result !== input) {
			this.#dispatchAction("security.input_sanitized", {
				component: "SyncLayer",
				inputType: typeof input,
			});
		}

		return result;
	}

	/**
	 * Emits warning with deduplication to prevent spam.
	 * @private
	 */
	#emitWarning(message, meta = {}) {
		const warningKey = `${message}:${JSON.stringify(meta)}`;
		if (this.#loggedWarnings.has(warningKey)) {
			return;
		}

		this.#loggedWarnings.add(warningKey);

		try {
			this.#dispatchAction("observability.warning", {
				component: "SyncLayer",
				message,
				meta,
				actor: this.#currentUser,
				timestamp: DateCore.timestamp(),
				level: "warn",
			});
		} catch {
			// Best-effort logging
			console.warn(`[SyncLayer:WARNING] ${message}`, meta);
		}
	}

	/**
	 * Emits critical warning that bypasses deduplication.
	 * @private
	 */
	#emitCriticalWarning(message, meta = {}) {
		try {
			this.#dispatchAction("observability.critical", {
				component: "SyncLayer",
				message,
				meta,
				actor: this.#currentUser,
				timestamp: DateCore.timestamp(),
				level: "error",
				critical: true,
			});
		} catch {
			console.error(`[SyncLayer:CRITICAL] ${message}`, meta);
		}
	}

	/**
	 * Initializes the sync layer, setting up automatic synchronization and network listeners.
	 * @public
	 * @returns {Promise<this>} The initialized SyncLayer instance.
	 */
	init() {
		return this.#runOrchestrated("init", () => {
			/* PERFORMANCE_BUDGET: 100ms */
			return this.#executeInit();
		});
	}

	/**
	 * Performs a synchronization operation (up, down, or bidirectional).
	 * This is the main entry point for triggering a sync.
	 * @public
	 * @param {object} [options={}] - Options for the sync operation.
	 * @returns {Promise<{up: object|null, down: object|null, conflicts: object[]}>} A promise that resolves with a summary of the sync operation.
	 */
	performSync(options = {}) {
		const sanitizedOptions = this.#sanitizeInput(options);
		return this.#runOrchestrated(
			"performSync",
			() => this.#executePerformSync(sanitizedOptions),
			{
				meta: {
					direction: sanitizedOptions.direction || "bidirectional",
					force: sanitizedOptions.force || false,
				},
			}
		);
	}

	/**
	 * Queues an entity for synchronization.
	 * @public
	 * @param {object} entity - The entity to be synchronized.
	 * @param {'create'|'update'|'delete'} operation - The type of operation.
	 * @returns {void}
	 */
	queueEntityForSync(entity, operation) {
		const sanitizedEntity = this.#sanitizeInput(entity);
		const sanitizedOperation = this.#sanitizeInput(operation);

		this.#dispatchAction("sync.queue_entity", {
			entity: sanitizedEntity,
			operation: sanitizedOperation,
		});

		this.#syncQueue.push({
			entity: sanitizedEntity,
			operation: sanitizedOperation,
			timestamp: DateCore.timestamp(),
			retries: 0,
		});
		this.#debouncedSync();
	}

	/**
	 * Gets the current sync statistics.
	 * @public
	 * @returns {object} An object containing sync metrics and status.
	 */
	getStatus() {
		return {
			ready: this.#ready,
			syncInProgress: this.#syncInProgress,
			queueLength: this.#syncQueue.length,
			conflictCount: this.#conflictQueue.length,
			autoSyncEnabled: this.#config.enableAutoSync,
			lastSync: this.#metrics?.get("last_sync"),
			lastSyncUp: this.#metrics?.get("last_sync_up"),
			lastSyncDown: this.#metrics?.get("last_sync_down"),
			statistics: {
				syncCount: this.#metrics?.get("sync_count") || 0,
				errorCount: this.#metrics?.get("error_count") || 0,
				averageLatency: this.#metrics?.get("average_latency") || 0,
				lastUploadedCount:
					this.#metrics?.get("last_uploaded_count") || 0,
				lastDownloadedCount:
					this.#metrics?.get("last_downloaded_count") || 0,
			},
		};
	}

	/**
	 * Stops the sync layer and cleans up resources.
	 * @public
	 * @returns {void}
	 */
	stop() {
		if (this.#autoSyncInterval) {
			clearInterval(this.#autoSyncInterval);
			this.#autoSyncInterval = null;
		}
		this.#ready = false;
		this.#dispatchAction("sync.layer_stopped", {});
	}

	/**
	 * Executes the initialization logic with proper dependency resolution.
	 * @private
	 * @returns {Promise<this>}
	 */
	async #executeInit() {
		if (this.#ready) {
			return this;
		}

		// Derive dependencies from the stateManager
		const managers = this.#managers;

		// Use the central CacheManager for bounded caches
		const cacheManager = managers?.cacheManager;
		if (cacheManager) {
			this.#retryTimeouts = cacheManager?.getCache("syncRetries", {
				ttl: 24 * 60 * 60 * 1000, // 24 hours for a retry timeout
			});
		}

		this.#dispatchAction("sync.layer_initialized", {
			autoSync: this.#config.enableAutoSync,
			conflictStrategy: this.#config.conflictResolution,
		});

		// Setup auto-sync if enabled
		if (this.#config.enableAutoSync) {
			this.#setupAutoSync();
		}

		// Setup network change listeners
		this.#setupNetworkListeners();

		this.#ready = true;
		this.#emitWarning("SyncLayer ready with bidirectional sync.");
		return this;
	}

	/**
	 * Executes the core sync operation logic.
	 * @private
	 * @param {object} options - Sync options
	 * @returns {Promise<object>} Sync result
	 */
	async #executePerformSync(options) {
		if (!this.#ready) {
			throw new this.#AppError("SyncLayer not initialized.");
		}

		if (this.#syncInProgress && !options?.force) {
			this.#emitWarning("Sync already in progress, queuing request.");
			this.#isResyncNeeded = true;
			return;
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

			// Upload changes to server (orchestrated per-phase)
			if (
				syncOptions.direction === "up" ||
				syncOptions.direction === "bidirectional"
			) {
				const upStart = performance.now();
				result.up = await this.#runOrchestrated(
					"syncUp",
					() => this.#syncUp(syncOptions.batchSize),
					{ meta: { phase: "up" } }
				);
				const upDuration = performance.now() - upStart;
				this.#recordTimer("syncUp_duration", upDuration);
				this.#setMetric("last_sync_up", DateCore.timestamp());
				this.#setMetric(
					"last_uploaded_count",
					result.up?.uploaded || 0
				);
			}

			// Download changes from server (orchestrated per-phase)
			if (
				syncOptions.direction === "down" ||
				syncOptions.direction === "bidirectional"
			) {
				const downStart = performance.now();
				result.down = await this.#runOrchestrated(
					"syncDown",
					() => this.#syncDown(syncOptions.batchSize),
					{ meta: { phase: "down" } }
				);
				const downDuration = performance.now() - downStart;
				this.#recordTimer("syncDown_duration", downDuration);
				this.#setMetric("last_sync_down", DateCore.timestamp());
				this.#setMetric(
					"last_downloaded_count",
					result.down?.downloaded || 0
				);
			}

			const latency = performance.now() - startTime;
			this.#recordSyncMetrics(true, latency, result);

			this.#emitWarning(`Sync completed in ${latency.toFixed(2)}ms.`);

			this.#dispatchAction("sync.completed", {
				result,
				latency,
			});

			return result;
		} catch (error) {
			this.#recordSyncMetrics(false, 0, null, error);
			this.#dispatchAction("sync.failed", {
				error: error.message,
				direction: syncOptions.direction,
			});

			throw new this.#AppError("Sync operation failed", {
				cause: error,
				context: { direction: syncOptions.direction },
			});
		} finally {
			this.#syncInProgress = false;

			// If a resync was requested while this sync was running, trigger it now
			if (this.#isResyncNeeded) {
				this.#isResyncNeeded = false;
				setTimeout(
					() =>
						this.performSync().catch((error) => {
							this.#emitCriticalWarning("Resync failed", {
								error: error.message,
							});
						}),
					1000
				);
			}
		}
	}

	/**
	 * Uploads local changes to the server.
	 * @private
	 * @param {number} batchSize - Maximum number of items to sync in one batch.
	 * @returns {Promise<object>} The result of the upload operation.
	 */
	async #syncUp(batchSize) {
		if (this.#syncQueue.length === 0) {
			return { uploaded: 0, failed: 0, items: [] };
		}

		const batch = this.#syncQueue.splice(0, batchSize);
		const sanitizedBatch = batch.map((item) => ({
			...item,
			entity: this.#sanitizeInput(item.entity),
		}));

		let uploaded = 0;
		let failed = 0;
		const failedItems = [];

		for (const item of sanitizedBatch) {
			const res = await this.#processSyncUpItem(item);
			uploaded += res.uploadedDelta || 0;
			failed += res.failedDelta || 0;
			if (res.failedItem) {
				failedItems.push(res.failedItem);
			}
		}

		return {
			uploaded,
			failed,
			items: sanitizedBatch.map((item) => ({
				id: item.entity.id,
				operation: item.operation,
			})),
		};
	}

	/**
	 * Downloads remote changes from the server.
	 * @private
	 * @param {number} batchSize - Maximum number of items to download in one batch.
	 * @returns {Promise<object>} The result of the download operation.
	 */
	async #syncDown(batchSize) {
		const lastSyncTime =
			this.#metrics?.get("last_sync_down") || DateCore.timestamp();

		/* PERFORMANCE_BUDGET: 50ms */
		const response = await this.#maybeWrap(
			"sync",
			"fetch_from_server",
			() =>
				this.#fetchFromServer({
					since: lastSyncTime,
					limit: batchSize,
				}),
			{
				since: lastSyncTime,
				limit: batchSize,
				requester: this.#currentUser,
				classification: "CONFIDENTIAL",
			}
		);

		if (!response.entities || response.entities.length === 0) {
			return { downloaded: 0, conflicts: 0, items: [] };
		}

		let downloaded = 0;
		let conflicts = 0;
		const conflictItems = [];

		for (const remoteEntity of response.entities) {
			const res = await this.#processSyncDownItem(remoteEntity);
			downloaded += res.downloadedDelta || 0;
			conflicts += res.conflictsDelta || 0;
			if (res.conflictItem) {
				conflictItems.push({
					entity: res.conflictItem,
					conflict: null,
				});
			}
		}

		// Update last sync timestamp
		const ts = DateCore.timestamp();
		this.#dispatchAction("sync.last_sync_down_updated", {
			timestamp: ts,
		});
		// Record last sync down metric
		this.#setMetric("last_sync_down", ts);
		// Record total downloaded for this phase
		this.#setMetric("last_downloaded_count", downloaded);

		return {
			downloaded,
			conflicts,
			items: response.entities.map((entity) => ({
				id: entity.id,
				store_name: entity.store_name,
			})),
			conflictItems,
		};
	}

	/**
	 * Sends an entity change to the server API.
	 * @private
	 * @param {object} item - The sync item containing entity and operation details.
	 * @returns {Promise<object>} The JSON response from the server.
	 */
	async #sendToServer(item) {
		const url = new URL(
			`${this.#config.apiEndpoint}/entities`,
			window.location.origin
		);

		const requestOptions = {
			method: item.operation === "delete" ? "DELETE" : "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.#getAuthToken()}`,
			},
		};

		if (item.operation !== "delete") {
			requestOptions.body = JSON.stringify({
				entity: item.entity,
				operation: item.operation,
				timestamp: item.timestamp,
			});
		} else {
			url.searchParams.append("id", item.entity.id);
		}

		/* PERFORMANCE_BUDGET: 100ms */
		const response = await this.#maybeWrap(
			"network",
			"cds_fetch",
			() => CDS.fetch(url, requestOptions),
			{
				url: url.toString(),
				method: requestOptions.method,
				requester: this.#currentUser,
				classification: "CONFIDENTIAL",
			}
		);

		if (!response.ok) {
			throw new this.#AppError(
				`Server error: ${response.status} ${response.statusText}`,
				{ statusCode: response.status, statusText: response.statusText }
			);
		}

		return await response.json();
	}

	/**
	 * Fetches a batch of entities from the server API.
	 * @private
	 * @param {object} params - The query parameters for the fetch request.
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

		/* PERFORMANCE_BUDGET: 100ms */
		const response = await this.#maybeWrap(
			"network",
			"cds_fetch",
			() =>
				CDS.fetch(url, {
					headers: {
						Authorization: `Bearer ${this.#getAuthToken()}`,
					},
				}),
			{
				url: url.toString(),
				method: "GET",
				requester: this.#currentUser,
				classification: "CONFIDENTIAL",
			}
		);

		if (!response.ok) {
			throw new this.#AppError(
				`Server error: ${response.status} ${response.statusText}`,
				{ statusCode: response.status, statusText: response.statusText }
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
		return this.#managers?.securityManager?.getAuthToken() || "demo-token";
	}

	/**
	 * Sets up a periodic interval to automatically trigger synchronization.
	 * @private
	 */
	#setupAutoSync() {
		this.#autoSyncInterval = setInterval(() => {
			if (!this.#syncInProgress && this.#syncQueue.length > 0) {
				this.performSync().catch((error) => {
					this.#emitCriticalWarning("Auto-sync failed:", {
						error: error.message,
					});
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
					this.#emitWarning("Network online, triggering sync.");
					this.performSync().catch((error) => {
						this.#emitCriticalWarning("Online sync failed", {
							error: error.message,
						});
					});
				},
				{ passive: true }
			);

			window.addEventListener(
				"offline",
				() => {
					this.#emitWarning("Network offline, sync paused.");
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
			/* PERFORMANCE_BUDGET: 20ms */
			await this.#maybeWrap(
				"storage",
				"put",
				() =>
					this.#stateManager.storage.instance?.put(storeName, entity),
				{
					store: storeName,
					entityId: entity.id,
					requester: this.#currentUser,
					classification: "CONFIDENTIAL", // Assuming sync data is confidential
				}
			);
		} catch (error) {
			// If the error is a MAC violation, it's a sync issue, not a critical failure
			if (error.message.includes("MAC_WRITE_DENIED")) {
				this.#dispatchAction("sync.down_mac_denied", {
					entityId: entity.id,
					entityType: entity.entity_type,
					error: error.message,
				});
				throw new this.#PolicyError(
					`MAC policy denied applying remote change for entity ${entity.id}.`,
					{ entityId: entity.id, reason: "MAC_WRITE_DENIED" }
				);
			}
			throw error;
		}
	}

	/**
	 * Triggers a sync operation after a short delay to debounce multiple rapid requests.
	 * @private
	 * @param {object} item - The item to retry
	 */
	#scheduleRetry(item) {
		const delay = this.#config.retryDelay * Math.pow(2, item.retries - 1); // Exponential backoff

		const timeout = setTimeout(() => {
			this.queueEntityForSync(item.entity, item.operation);
			/* PERFORMANCE_BUDGET: 5ms */
			// Fire-and-forget: avoid awaiting to keep scheduling lightweight
			this.#maybeWrap(
				"cache",
				"delete",
				() => {
					this.#retryTimeouts?.delete(item.entity.id);
				},
				{
					cache: "syncRetries",
					key: item.entity.id,
					requester: this.#currentUser,
					classification: "INTERNAL",
				}
			).catch(() => {});
		}, delay);

		/* PERFORMANCE_BUDGET: 5ms */
		this.#maybeWrap(
			"cache",
			"set",
			() => {
				this.#retryTimeouts?.set(item.entity.id, timeout);
			},
			{
				cache: "syncRetries",
				key: item.entity.id,
				requester: this.#currentUser,
				classification: "INTERNAL",
			}
		).catch(() => {});
	}

	/**
	 * Process a single upload (syncUp) item. Encapsulates timing, forensic wrap,
	 * dispatching and retry logic. Returns an object describing the outcome so
	 * the caller can aggregate counts and failed items.
	 * @private
	 * @param {object} item
	 * @returns {Promise<{uploadedDelta:number, failedDelta:number, failedItem?:object}>}
	 */
	async #processSyncUpItem(item) {
		try {
			const itemStart = performance.now();
			const response = await this.#maybeWrap(
				"sync",
				"send_to_server",
				() => this.#sendToServer(item),
				{
					entityId: item.entity.id,
					operation: item.operation,
					requester: this.#currentUser,
					classification: "CONFIDENTIAL",
				}
			);
			const itemDuration = performance.now() - itemStart;
			this.#recordTimer("syncUp_item_duration", itemDuration);

			if (response.success) {
				this.#incrementMetric("uploaded_count");
				this.#dispatchAction("sync.up_success", {
					entityId: item.entity.id,
					operation: item.operation,
				});
				return { uploadedDelta: 1, failedDelta: 0 };
			}

			// non-success response
			this.#incrementMetric("upload_failed_count");
			this.#dispatchAction("sync.up_failed", {
				entityId: item.entity.id,
				operation: item.operation,
				error: response.error,
			});
			return {
				uploadedDelta: 0,
				failedDelta: 1,
				failedItem: {
					entity: item.entity,
					operation: item.operation,
					error: response.error || null,
				},
			};
		} catch (error) {
			// Retry logic with exponential backoff
			item.retries = (item.retries || 0) + 1;
			if (item.retries < this.#config.maxRetries) {
				this.#scheduleRetry(item);
				this.#incrementMetric("upload_retry_count");
				return {
					uploadedDelta: 0,
					failedDelta: 1,
					failedItem: {
						entity: item.entity,
						operation: item.operation,
						error: error?.message || null,
					},
				};
			}

			this.#dispatchAction("sync.up_max_retries", {
				entityId: item.entity.id,
				operation: item.operation,
				retries: item.retries,
				error: error.message,
			});
			return {
				uploadedDelta: 0,
				failedDelta: 1,
				failedItem: {
					entity: item.entity,
					operation: item.operation,
					error: error?.message || null,
				},
			};
		}
	}

	/**
	 * Process a single download (syncDown) remote entity. Handles applyRemoteChange,
	 * timing, conflict handling and dispatching. Returns an object describing the outcome.
	 * @private
	 * @param {object} remoteEntity
	 * @returns {Promise<{downloadedDelta:number, conflictsDelta:number, conflictItem?:object}>}
	 */
	async #processSyncDownItem(remoteEntity) {
		try {
			const itemStart = performance.now();
			await this.#applyRemoteChange(
				remoteEntity.store_name,
				this.#sanitizeInput(remoteEntity)
			);
			const itemDuration = performance.now() - itemStart;
			this.#recordTimer("syncDown_item_duration", itemDuration);
			this.#incrementMetric("downloaded_count");
			this.#dispatchAction("sync.down_success", {
				entityId: remoteEntity.id,
				storeName: remoteEntity.store_name,
			});
			return { downloadedDelta: 1, conflictsDelta: 0 };
		} catch (error) {
			if (
				error instanceof this.#PolicyError &&
				error.message.includes("MAC_WRITE_DENIED")
			) {
				this.#dispatchAction("sync.down_mac_denied", {
					entityId: remoteEntity.id,
					storeName: remoteEntity.store_name,
					error: error.message,
				});
				return { downloadedDelta: 0, conflictsDelta: 0 };
			}

			if (
				error instanceof this.#AppError &&
				error.message.includes("CONFLICT")
			) {
				this.#incrementMetric("conflict_count");
				this.#conflictQueue.push({
					remoteEntity,
					localEntity: error.context?.localEntity,
					timestamp: DateCore.timestamp(),
				});
				this.#dispatchAction("sync.down_conflict", {
					entityId: remoteEntity.id,
					storeName: remoteEntity.store_name,
					error: error.message,
				});
				return {
					downloadedDelta: 0,
					conflictsDelta: 1,
					conflictItem: remoteEntity,
				};
			}

			this.#dispatchAction("sync.down_error", {
				entityId: remoteEntity.id,
				storeName: remoteEntity.store_name,
				error: error.message,
			});
			return { downloadedDelta: 0, conflictsDelta: 0 };
		}
	}

	/**
	 * Records metrics after a sync operation completes.
	 * @private
	 * @param {boolean} success - Whether the sync was successful.
	 * @param {number} latency - The duration of the sync in milliseconds.
	 * @param {object|null} result - The result of the sync operation.
	 * @param {Error|null} error - Any error that occurred.
	 */
	#recordSyncMetrics(success, latency, result, error) {
		this.#dispatchAction("sync.metrics_updated", {
			success,
			latency,
			result,
			error: error ? error.message : null,
			timestamp: DateCore.timestamp(),
		});

		this.#incrementMetric("sync_count");
		this.#setMetric("last_sync", DateCore.timestamp());

		if (!success) {
			this.#incrementMetric("error_count");
			this.#setMetric("last_sync_error", DateCore.timestamp());
		}
		this.#recordTimer("average_latency", latency);
	}

	/**
	 * Creates a debounced function that delays invoking `func` until after `wait` milliseconds have elapsed.
	 * @private
	 * @param {Function} func The function to debounce.
	 * @param {number} wait The number of milliseconds to delay.
	 * @returns {Function} Returns the new debounced function.
	 */
	#debounce(func, wait) {
		let timeout = null;
		return (...args) => {
			if (timeout) {
				clearTimeout(timeout);
			}
			timeout = setTimeout(() => {
				timeout = null;
				try {
					func(...args);
				} catch (err) {
					this.#emitCriticalWarning("Debounced function failed", {
						error: err?.message,
					});
				}
			}, wait);
		};
	}
}

export default SyncLayer;
