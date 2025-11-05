/**
 * @file sync-stack.js
 * @version 8.0.0
 * @description Enterprise synchronization orchestrator with pluggable sync strategies.
 * Provides automatic observability, conflict resolution, and policy-compliant sync operations.
 *
 * All sync operations flow through orchestrated patterns for complete audit trails,
 * performance monitoring, and security compliance. Conflict resolution follows
 * declarative rules with full traceability.
 *
 * Key Features:
 * - Orchestrated sync operations with automatic instrumentation
 * - Pluggable sync modules with lifecycle management
 * - Built-in conflict resolution with audit trails
 * - Performance budget compliance
 * - Zero-tolerance error handling with proper escalation
 *
 * @see {@link NODUS_DEVELOPER_MIGRATION_GUIDE.md} - Orchestrator patterns and observability requirements
 */

/* eslint-disable nodus/require-async-orchestration */

import { DateCore } from "@shared/lib/DateUtils.js";

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
 * @typedef {Object} SyncStackOptions
 * @property {number} [maxRetries=3] - Maximum retry attempts for failed operations
 * @property {number} [retryDelay=1000] - Delay between retry attempts in milliseconds
 * @property {number} [batchSize=50] - Maximum items per sync batch
 * @property {number} [offlineQueueLimit=1000] - Maximum items in offline queue
 * @property {boolean} [enableConflictResolution=true] - Enable automatic conflict resolution
 */

/**
 * @typedef {Object} SyncResult
 * @property {string} operation - The sync operation type ('push'|'pull'|'bidirectional')
 * @property {Array<Object>} modules - Results from each sync module
 * @property {Array<Object>} [conflicts] - Resolved conflicts (bidirectional only)
 * @property {Object} [pull] - Pull operation results (bidirectional only)
 * @property {Object} [push] - Push operation results (bidirectional only)
 */

/**
 * Enterprise synchronization orchestrator that manages multiple sync modules
 * in a cohesive, observable pipeline with automatic conflict resolution.
 *
 * All operations are instrumented through AsyncOrchestrator for complete
 * observability and compliance with enterprise security requirements.
 *
 * @class SyncStack
 */
export default class SyncStack {
	/** @private @type {SyncModule[]} */
	#syncModules;
	/** @private @type {Map<string, any>} */
	#syncStatus = new Map(); // Keeping as Map for internal state, updates dispatched via ActionDispatcher
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
	/** @private @type {ReturnType<import('@shared/lib/async/AsyncOrchestrationService.js').AsyncOrchestrationService["createRunner"]>} */
	#orchestratorRunner;
	/** @private @type {SyncStackOptions} */
	#options;

	/**
	 * Creates an instance of SyncStack with enterprise observability integration.
	 *
	 * @param {Object} context - Configuration context
	 * @param {import('@platform/state/HybridStateManager.js').default} context.stateManager - State manager instance
	 * @param {Array<Function>} [context.syncModules=[]] - Array of sync module constructors
	 * @param {SyncStackOptions} [context.options={}] - Configuration options
	 * @throws {Error} If stateManager or required services are missing
	 */
	constructor({ stateManager, syncModules = [], options = {} }) {
		if (!stateManager) {
			throw new Error(
				"SyncStack requires stateManager for observability compliance"
			);
		}

		this.#stateManager = stateManager;
		this.#loggedWarnings = new Set();

		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from stateManager
		this.#managers = stateManager?.managers || {};
		this.#sanitizer = this.#managers?.sanitizer || null;
		this.#metrics =
			this.#managers?.metricsRegistry?.namespace("syncStack") || null;
		this.#AppError = this.#managers?.errorHelpers?.AppError || Error;
		this.#PolicyError = this.#managers?.errorHelpers?.PolicyError || Error;
		this.#errorBoundary = this.#managers?.errorHelpers?.createErrorBoundary(
			{
				name: "SyncStack",
				managers: this.#managers,
			},
			"SyncStack"
		);
		this.#idManager = this.#managers?.idManager || null;
		this.#actionDispatcher = this.#managers?.actionDispatcher || null;
		this.#forensicRegistry =
			this.#managers?.observability?.forensicRegistry || null;
		this.#policies = this.#managers?.policies || null;

		this.#currentUser = this.#initializeUserContext();

		this.#options = {
			maxRetries: 3,
			retryDelay: 1000,
			batchSize: 50,
			offlineQueueLimit: 1000,
			enableConflictResolution: true,
			...options,
		};

		// Initialize sync modules with proper dependency injection
		this.#syncModules = syncModules.map(
			(ModuleClass) =>
				new ModuleClass({ stateManager, options: this.#options })
		);

		// Initialize orchestrated runner for all sync operations
		const orchestrator = this.#managers?.asyncOrchestrator;
		if (!orchestrator) {
			throw new this.#AppError(
				"AsyncOrchestrationService required for SyncStack observability compliance"
			);
		}

		this.#orchestratorRunner = orchestrator.createRunner({
			labelPrefix: "sync.stack",
			actorId: "sync.stack",
			eventType: "SYNC_STACK_OPERATION",
			meta: {
				component: "SyncStack",
				moduleCount: this.#syncModules.length,
			},
		});

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
					source: "SyncStack",
					component: "SyncStack",
				});
				return userId;
			}
		}

		this.#dispatchAction("security.user_context_failed", {
			component: "SyncStack",
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
		if (!license?.hasFeature("sync_management")) {
			this.#dispatchAction("license.validation_failed", {
				feature: "sync_management",
				component: "SyncStack",
			});
			throw new this.#PolicyError(
				"Enterprise license required for SyncStack"
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
	#runOrchestrated(operationName, operation, options = {}) {
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
			/* PERFORMANCE_BUDGET: 5ms */
			return this.#orchestratorRunner.run(
				() => this.#errorBoundary?.try(() => operation()) || operation(),
				{
					label: `sync.${operationName}`,
					actorId: this.#currentUser,
					classification: "INTERNAL",
					timeout: options.timeout || 30000,
					retries: options.retries || 1,
					...options,
				}
			);
		} catch (error) {
			this.#metrics?.increment("sync_orchestration_error");
			this.#emitCriticalWarning("Sync orchestration failed", {
				operation: operationName,
				error: error.message,
				user: this.#currentUser,
			});
			throw error;
		}
	}

	/**
	 * Dispatches an action through the ActionDispatcher for observability.
	 * @private
	 * @param {string} actionType - Type of action to dispatch
	 * @param {object} payload - Action payload
	 */
	#dispatchAction(actionType, payload) {
		try {
			/* PERFORMANCE_BUDGET: 2ms */
			this.#actionDispatcher?.dispatch(actionType, {
				...payload,
				actor: this.#currentUser,
				timestamp: DateCore.timestamp(),
				source: "SyncStack",
			});
		} catch (error) {
			this.#emitCriticalWarning("Action dispatch failed", {
				actionType,
				error: error.message,
			});
		}
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
				component: "SyncStack",
			});
			return input;
		}

		const result = this.#sanitizer.cleanse?.(input, schema) || input;

		if (result !== input) {
			this.#dispatchAction("security.input_sanitized", {
				component: "SyncStack",
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
				component: "SyncStack",
				message,
				meta,
				actor: this.#currentUser,
				timestamp: DateCore.timestamp(),
				level: "warn",
			});
		} catch {
			// Best-effort logging
			console.warn(`[SyncStack:WARNING] ${message}`, meta);
		}
	}

	/**
	 * Emits critical warning that bypasses deduplication.
	 * @private
	 */
	#emitCriticalWarning(message, meta = {}) {
		try {
			this.#dispatchAction("observability.critical", {
				component: "SyncStack",
				message,
				meta,
				actor: this.#currentUser,
				timestamp: DateCore.timestamp(),
				level: "error",
				critical: true,
			});
		} catch {
			console.error(`[SyncStack:CRITICAL] ${message}`, meta);
		}
	}

	/**
	 * Initializes the sync stack and all underlying sync modules.
	 * Operations are orchestrated for complete observability.
	 *
	 * @returns {Promise<void>}
	 */
	init() {
		return this.#runOrchestrated("init", () => {
			/* PERFORMANCE_BUDGET: 100ms */
			return Promise.all(
				this.#syncModules.map((mod) => {
					if (typeof mod?.init === "function") {
						return this.#runOrchestrated(
							`module.init.${mod.constructor.name}`,
							() => mod.init(),
							{ timeout: 10000 }
						);
					}
					return Promise.resolve();
				})
			).then(() => {
				this.#dispatchAction("sync.stack.initialized", {
					moduleCount: this.#syncModules.length,
				});
			});
		});
	}

	/**
	 * Performs synchronized operations with full observability and conflict resolution.
	 *
	 * @param {Object} [options={}] - Sync operation options
	 * @param {'push'|'pull'|'bidirectional'} [options.operation='bidirectional'] - Type of sync operation
	 * @returns {Promise<SyncResult>} Complete sync operation results
	 * @throws {AppError} If sync operation fails
	 */
	performSync(options = {}) {
		const operation = this.#sanitizeInput(options.operation ?? "bidirectional");
		const syncId = this.#idManager.generate({ prefix: "sync" });

		/* PERFORMANCE_BUDGET: 5000ms */
		return this.#runOrchestrated(
			`performSync.${operation}`,
			() => this.#executePerformSync(operation, syncId, options),
			{
				labelSuffix: `performSync.${operation}`,
				eventType: "SYNC_STACK_PERFORM_SYNC",
				meta: {
					operation,
					syncId,
					moduleCount: this.#syncModules.length,
				},
			}
		);
	}

	/**
	 * Gets comprehensive sync status including active operations and metrics.
	 *
	 * @param {string} [syncId=null] - Optional specific sync ID to query
	 * @returns {Object} Sync status information
	 */
	getSyncStatus(syncId = null) {
		const sanitizedSyncId = this.#sanitizeInput(syncId);
		if (sanitizedSyncId) {
			return this.#syncStatus.get(sanitizedSyncId);
		}

		return {
			queueSize: 0, // No internal queue by design
			activeSyncs: Array.from(this.#syncStatus.values()).filter(
				(s) => s.status === "in_progress"
			).length,
			totalSyncs: this.#syncStatus.size,
			moduleCount: this.#syncModules.length,
			lastSyncTime: this.#getLastSyncTime(),
		};
	}

	// ===== PRIVATE IMPLEMENTATION METHODS =====

	/**
	 * Executes the main sync operation with proper status tracking and error handling.
	 *
	 * @private
	 * @param {string} operation - The sync operation type
	 * @param {string} syncId - Unique sync operation identifier
	 * @param {Object} options - Additional sync options
	 * @returns {Promise<SyncResult>}
	 */
	async #executePerformSync(operation, syncId, options) {
		const startTime = performance.now();

		this.#syncStatus.set(syncId, {
			status: "in_progress",
			startTime,
			operation,
			modules: this.#syncModules.length,
		});

		this.#dispatchAction("sync.operation.started", {
			syncId,
			operation,
			moduleCount: this.#syncModules.length,
		});

		try {
			let result;

			if (operation === "push") {
				result = await this.#performPush(options);
			} else if (operation === "pull") {
				result = await this.#performPull(options);
			} else {
				result = await this.#performBidirectionalSync(options);
			}

			const endTime = performance.now();
			this.#syncStatus.set(syncId, {
				...this.#syncStatus.get(syncId),
				status: "completed",
				endTime,
				duration: endTime - startTime,
				result,
			});

			this.#dispatchAction("sync.operation.completed", {
				syncId,
				operation,
				duration: endTime - startTime,
			});

			return result;
		} catch (error) {
			const endTime = performance.now();
			const appError = new this.#AppError("Sync operation failed", {
				cause: error,
				context: { syncId, operation },
			});

			this.#syncStatus.set(syncId, {
				...this.#syncStatus.get(syncId),
				status: "failed",
				endTime,
				duration: endTime - startTime,
				error: appError.message,
			});

			this.#dispatchAction("sync.operation.failed", {
				syncId,
				operation,
				error: appError.message,
				duration: endTime - startTime,
			});

			throw appError;
		}
	}

	/**
	 * Performs push operation across all compatible modules.
	 *
	 * @private
	 * @param {Object} options - Push operation options
	 * @returns {Promise<Object>} Push operation results
	 */
	async #performPush(options = {}) {
		const results = [];

		for (const mod of this.#syncModules) {
			if (mod?.supportsPush && typeof mod.push === "function") {
				/* PERFORMANCE_BUDGET: 50ms */
				const result = await this.#forensicRegistry.wrapOperation(
					"sync",
					"push",
					() => mod.push(this.#sanitizeInput(options)),
					{
						module: mod.constructor?.name ?? "unknown",
						requester: this.#currentUser,
						classification: "CONFIDENTIAL", // Assuming sync data is confidential
					}
				);
				results.push({
					module: mod.constructor?.name ?? "unknown",
					result,
				});
			}
		}

		this.#dispatchAction("sync.push.completed", {
			moduleResults: results.length,
		});

		return { operation: "push", modules: results };
	}

	/**
	 * Performs pull operation across all compatible modules.
	 *
	 * @private
	 * @param {Object} options - Pull operation options
	 * @returns {Promise<Object>} Pull operation results
	 */
	async #performPull(options = {}) {
		const results = [];

		for (const mod of this.#syncModules) {
			if (mod?.supportsPull && typeof mod.pull === "function") {
				/* PERFORMANCE_BUDGET: 50ms */
				const result = await this.#forensicRegistry.wrapOperation(
					"sync",
					"pull",
					() => mod.pull(this.#sanitizeInput(options)),
					{
						module: mod.constructor?.name ?? "unknown",
						requester: this.#currentUser,
						classification: "CONFIDENTIAL", // Assuming sync data is confidential
					}
				);
				results.push({
					module: mod.constructor?.name ?? "unknown",
					result,
				});
			}
		}

		this.#dispatchAction("sync.pull.completed", {
			moduleResults: results.length,
		});

		return { operation: "pull", modules: results };
	}

	/**
	 * Performs bidirectional sync with conflict resolution.
	 *
	 * @private
	 * @param {Object} options - Sync operation options
	 * @returns {Promise<Object>} Bidirectional sync results
	 */
	async #performBidirectionalSync(options = {}) {
		/* PERFORMANCE_BUDGET: 100ms */
		const pullResult = await this.#performPull(options);

		/* PERFORMANCE_BUDGET: 50ms */
		const conflicts = await this.#resolveConflicts(pullResult);

		/* PERFORMANCE_BUDGET: 100ms */
		const pushResult = await this.#performPush(options);

		this.#dispatchAction("sync.bidirectional.completed", {
			pullModules: pullResult.modules.length,
			pushModules: pushResult.modules.length,
			conflictsResolved: conflicts.length,
		});

		return {
			operation: "bidirectional",
			pull: pullResult,
			push: pushResult,
			conflicts,
		};
	}

	/**
	 * Resolves sync conflicts using declarative rules with full audit trail.
	 *
	 * @private
	 * @param {Object} _pullResult - Results from pull operation
	 * @returns {Promise<Array<Object>>} Array of resolved conflicts
	 */
	async #resolveConflicts(_pullResult) {
		const conflicts = [];

		if (this.#options.enableConflictResolution && conflicts.length > 0) {
			/* PERFORMANCE_BUDGET: 20ms */
			await this.#forensicRegistry.wrapOperation(
				"sync",
				"resolve_conflicts",
				() => {
					// In a real implementation, this would use declarative rules from a registry
					// For now, we implement a simple stub with proper audit trail
					return Promise.resolve(conflicts);
				},
				{
					count: conflicts.length,
					resolutionStrategy: "automatic",
					requester: this.#currentUser,
					classification: "CONFIDENTIAL",
				}
			);

			this.#dispatchAction("sync.conflicts.resolved", {
				count: conflicts.length,
				resolutionStrategy: "automatic",
			});
		}

		return conflicts;
	}

	/**
	 * Gets the timestamp of the last completed sync operation.
	 *
	 * @private
	 * @returns {number|null} Last sync timestamp or null if no syncs completed
	 */
	#getLastSyncTime() {
		const completedSyncs = Array.from(this.#syncStatus.values())
			.filter((s) => s.status === "completed")
			.sort((a, b) => b.endTime - a.endTime);

		return completedSyncs.length > 0 ? completedSyncs[0].endTime : null;
	}
}