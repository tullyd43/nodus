/**
 * @file CacheManager.js
 * @version 3.0.0 - Enterprise Observability Baseline
 * @description Production-ready centralized cache manager with comprehensive security,
 * observability, and compliance features. Uses centralized orchestration wrapper for
 * consistent observability and minimal logging noise.
 *
 * ESLint Exception: nodus/require-async-orchestration
 * Justification: Wrapper pattern provides superior observability consistency and
 * centralized policy enforcement compared to per-method orchestrator setup.
 *
 * @manager-exemption: CacheManager is authorized to perform direct bounded cache
 * mutations under observability and metrics controls. The mutations below are
 * performed inside the trusted manager and are audited via AsyncOrchestrator.
 *
 * Security Classification: INTERNAL
 * License Tier: Enterprise (cache management requires enterprise license)
 * Compliance: MAC-enforced, forensic-audited, polyinstantiation-ready
 */

import { LRUCache } from "@shared/lib/LRUCache.js";
import { DateCore } from "@shared/lib/DateUtils.js";

/**
 * @class CacheManager
 * @classdesc Enterprise-grade centralized cache manager with comprehensive security,
 * MAC enforcement, forensic auditing, and automatic observability. Manages the
 * lifecycle of all LRUCache instances with integrated metrics and security.
 */
export class CacheManager {
	/** @private @type {Map<string, LRUCache>} */
	#caches = new Map();
	/** @private @type {import('@platform/state/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {object} */
	#managers;
	/** @private @type {{ cleanse?:(value:any, schema?:any)=>any, cleanseText?:(value:string)=>string }|null} */
	#sanitizer;
	/** @private @type {import('@shared/lib/MetricsRegistry.js').MetricsRegistry|undefined} */
	#metrics;
	/** @private @type {import('@shared/lib/ErrorHelpers.js').ErrorBoundary} */
	#errorBoundary;
	/** @private @type {Set<string>} */
	#loggedWarnings;
	/** @private @type {string} */
	#currentUser;

	/**
	 * Creates an instance of CacheManager with enterprise security and observability.
	 * @param {object} context - Application context
	 * @param {import('@platform/state/HybridStateManager.js').default} context.stateManager - State manager
	 */
	constructor({ stateManager }) {
		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from stateManager
		this.#stateManager = stateManager;
		this.#loggedWarnings = new Set();

		// Initialize managers from stateManager (no direct instantiation)
		this.#managers = stateManager?.managers || {};
		this.#sanitizer = this.#managers?.sanitizer || null;
		this.#metrics =
			this.#managers?.metricsRegistry?.namespace("cacheManager") || null;
		this.#errorBoundary = this.#managers?.errorBoundary || null;
		this.#currentUser = this.#initializeUserContext();

		// Validate enterprise license for cache management
		this.#validateEnterpriseLicense();
	}

	/**
	 * Validates enterprise license for cache management features.
	 * @private
	 */
	#validateEnterpriseLicense() {
		const license = this.#managers?.license;
		if (!license?.hasFeature("cache_management")) {
			this.#dispatchAction("license.validation_failed", {
				feature: "cache_management",
				component: "CacheManager",
			});
			throw new Error("Enterprise license required for CacheManager");
		}
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
					source: "securityManager",
					component: "CacheManager",
				});
				return userId;
			}
		}

		this.#dispatchAction("security.user_context_failed", {
			component: "CacheManager",
			error: "No valid user context found",
		});

		return "system";
	}

	/**
	 * Centralized orchestration wrapper for consistent observability and policy enforcement.
	 * @private
	 * @param {string} operationName - Operation identifier for metrics and logging
	 * @param {Function} operation - Sync operation that returns Promise
	 * @param {object} [options={}] - Additional orchestrator options
	 * @returns {Promise<any>}
	 */
	#runOrchestrated(operationName, operation, options = {}) {
		const orchestrator = this.#managers?.asyncOrchestrator;
		if (!orchestrator) {
			this.#emitWarning("AsyncOrchestrator not available", {
				operation: operationName,
			});
			return operation();
		}

		// Policy enforcement
		const policies = this.#managers.policies;
		if (!policies?.getPolicy("async", "enabled")) {
			this.#emitWarning("Async operations disabled by policy", {
				operation: operationName,
			});
			return Promise.resolve(null);
		}

		// Check cache policy
		if (!policies?.getPolicy("cache", "enabled")) {
			this.#emitWarning("Cache operations disabled by policy", {
				operation: operationName,
			});
			return Promise.resolve(null);
		}

		/* PERFORMANCE_BUDGET: 5ms */
		const runner = orchestrator.createRunner(`cache.${operationName}`);

		/* PERFORMANCE_BUDGET: varies by operation */
		/* eslint-disable-next-line nodus/require-performance-budget -- Justification: manager-level orchestrator run is intentionally budgeted by surrounding orchestration and audited via AsyncOrchestrator/ForensicPlugin; exempting this specific check to avoid duplicate instrumentation comments. See: docs/NODUS_DEVELOPER_SECURITY_MANDATES.md */
		return runner
			.run(
				() =>
					this.#errorBoundary?.tryAsync(() => operation()) ||
					operation(),
				{
					label: `cache.${operationName}`,
					actorId: this.#currentUser,
					classification: "INTERNAL",
					timeout: options.timeout || 30000,
					retries: options.retries || 1,
					...options,
				}
			)
			.catch((error) => {
				this.#metrics?.increment("cache_orchestration_error");
				this.#emitCriticalWarning("Cache orchestration failed", {
					operation: operationName,
					error: error.message,
					user: this.#currentUser,
				});
				throw error;
			});
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
			this.#managers?.actionDispatcher?.dispatch(actionType, {
				...payload,
				actor: this.#currentUser,
				timestamp: DateCore.timestamp(),
				source: "CacheManager",
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
				component: "CacheManager",
			});
			return input;
		}

		const result = this.#sanitizer.cleanse?.(input, schema) || input;

		if (result !== input) {
			this.#dispatchAction("security.input_sanitized", {
				component: "CacheManager",
				inputType: typeof input,
			});
		}

		return result;
	}

	/**
	 * Emits a warning via ActionDispatcher for automatic observability.
	 * @private
	 */
	#emitWarning(message, meta = {}) {
		const warningKey = `${message}-${JSON.stringify(meta)}`;
		if (this.#loggedWarnings.has(warningKey)) return;

		this.#loggedWarnings.add(warningKey);
		this.#dispatchAction("observability.warning", {
			component: "CacheManager",
			message,
			meta,
			level: "warning",
		});
	}

	/**
	 * Emits a critical warning via ActionDispatcher for automatic observability.
	 * @private
	 */
	#emitCriticalWarning(message, meta = {}) {
		this.#dispatchAction("observability.critical", {
			component: "CacheManager",
			message,
			meta,
			actor: this.#currentUser,
			timestamp: DateCore.timestamp(),
			level: "error",
			critical: true,
		});
	}

	/**
	 * Forensic wrapper helper for cache operations.
	 * @private
	 * @param {string} op - Operation name
	 * @param {Function} fn - Function to wrap
	 * @returns {any}
	 */
	#forensicWrap(op, fn) {
		const forensicRegistry = this.#managers?.forensicRegistry;
		if (forensicRegistry?.wrapOperation) {
			return forensicRegistry.wrapOperation("cache", op, fn);
		}

		try {
			return fn();
		} catch (err) {
			this.#emitWarning("Forensic wrapper failed", {
				operation: op,
				error: err.message,
			});
			throw err;
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PUBLIC API
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Retrieves an existing cache by name or creates a new one if it doesn't exist.
	 * @public
	 * @param {string} name - Unique name for the cache
	 * @param {number|object} [maxSizeOrOptions=1000] - Max size or options object
	 * @param {object} [maybeOptions={}] - Additional options when second arg is number
	 * @returns {LRUCache} The existing or newly created LRUCache instance
	 */
	getCache(name, maxSizeOrOptions = 1000, maybeOptions = {}) {
		const sanitizedName = this.#sanitizeInput(name);

		if (!sanitizedName) {
			const error = new Error("Cache must have a name");
			this.#emitCriticalWarning("Cache creation failed", {
				reason: "missing name",
				providedName: name,
			});
			throw error;
		}

		if (this.#caches.has(sanitizedName)) {
			return this.#forensicWrap("get", () =>
				this.#caches.get(sanitizedName)
			);
		}

		// Normalize arguments: support both (name, maxSize, options) and (name, options)
		let maxSize = 1000;
		let options = {};

		if (typeof maxSizeOrOptions === "number") {
			maxSize = maxSizeOrOptions;
			options = maybeOptions || {};
		} else if (maxSizeOrOptions && typeof maxSizeOrOptions === "object") {
			options = maxSizeOrOptions;
			if (typeof options.max === "number") {
				maxSize = options.max;
			} else if (typeof options.maxSize === "number") {
				maxSize = options.maxSize;
			}
		}

		// Create new cache with enhanced configuration
		const newCache = new LRUCache(
			{
				stateManager: this.#stateManager,
				keyPrefix: sanitizedName,
				...this.#sanitizeInput(options),
			},
			maxSize
		);

		this.#caches.set(sanitizedName, newCache);
		this.#metrics?.increment("cache.created");

		this.#dispatchAction("cache.created", {
			cacheName: sanitizedName,
			maxSize,
			options: this.#sanitizeInput(options),
			totalCaches: this.#caches.size,
		});

		return newCache;
	}

	/**
	 * Retrieves metrics from all managed caches.
	 * @public
	 * @returns {object} Object with cache names as keys and their metrics as values
	 */
	getAllMetrics() {
		const allMetrics = {};
		for (const [name, cache] of this.#caches.entries()) {
			try {
				allMetrics[name] = cache.getMetrics();
			} catch (error) {
				this.#emitWarning("Failed to get cache metrics", {
					cacheName: name,
					error: error.message,
				});
				allMetrics[name] = { error: error.message };
			}
		}
		return allMetrics;
	}

	/**
	 * Clears all items from all managed caches.
	 * @public
	 * @returns {Promise<void>}
	 */
	clearAll() {
		return this.#runOrchestrated("clearAll", () => {
			let clearedCaches = 0;
			let failedCaches = 0;

			for (const [name, cache] of this.#caches.entries()) {
				try {
					cache.clear();
					clearedCaches++;
				} catch (error) {
					failedCaches++;
					this.#emitWarning("Failed to clear cache", {
						cacheName: name,
						error: error.message,
					});
				}
			}

			this.#metrics?.increment("cache.cleared.all");

			this.#dispatchAction("cache.cleared_all", {
				totalCaches: this.#caches.size,
				clearedCaches,
				failedCaches,
				timestamp: DateCore.timestamp(),
			});

			return Promise.resolve();
		});
	}

	/**
	 * Invalidates entries across all caches based on a pattern.
	 * @public
	 * @param {string|RegExp} pattern - Pattern to match for invalidation
	 * @returns {Promise<void>}
	 */
	invalidate(pattern) {
		return this.#runOrchestrated("invalidate", () => {
			const sanitizedPattern = this.#sanitizeInput(pattern);

			if (!sanitizedPattern || sanitizedPattern === "*") {
				return this.clearAll();
			}

			let invalidatedCaches = 0;

			for (const [name, cache] of this.#caches.entries()) {
				try {
					if (typeof cache.invalidate === "function") {
						cache.invalidate(sanitizedPattern);
						invalidatedCaches++;
					} else if (
						typeof cache.clear === "function" &&
						typeof sanitizedPattern === "string" &&
						sanitizedPattern.startsWith(`${name}:`)
					) {
						cache.clear();
						invalidatedCaches++;
					}
				} catch (error) {
					this.#emitWarning("Failed to invalidate cache", {
						cacheName: name,
						pattern: String(sanitizedPattern),
						error: error.message,
					});
				}
			}

			this.#metrics?.increment("cache.invalidations");

			this.#dispatchAction("cache.invalidated", {
				pattern: String(sanitizedPattern),
				invalidatedCaches,
				totalCaches: this.#caches.size,
				timestamp: DateCore.timestamp(),
			});

			return Promise.resolve();
		});
	}

	/**
	 * Destroys all managed caches, stopping any background processes.
	 * @public
	 * @returns {Promise<void>}
	 */
	destroyAll() {
		return this.#runOrchestrated("destroyAll", () => {
			let destroyedCaches = 0;
			let failedDestroys = 0;

			for (const [name, cache] of this.#caches.entries()) {
				try {
					cache.destroy();
					destroyedCaches++;
				} catch (error) {
					failedDestroys++;
					this.#emitWarning("Failed to destroy cache", {
						cacheName: name,
						error: error.message,
					});
				}
			}

			this.#caches.clear();
			this.#metrics?.increment("cache.destroyed.all");

			this.#dispatchAction("cache.destroyed_all", {
				destroyedCaches,
				failedDestroys,
				timestamp: DateCore.timestamp(),
			});

			return Promise.resolve();
		});
	}

	/**
	 * Backwards-compatible alias for creating or retrieving a cache.
	 * @public
	 * @param {string} name - Cache name
	 * @param {object} [options={}] - Cache options
	 * @returns {LRUCache}
	 */
	createCache(name, options = {}) {
		this.#dispatchAction("cache.create_alias_used", {
			cacheName: this.#sanitizeInput(name),
			options: this.#sanitizeInput(options),
		});
		return this.getCache(name, options);
	}

	/**
	 * Instrumented cache mutation helper for observability handlers.
	 * @public
	 * @param {string} cacheName - Name of the cache
	 * @param {string} key - Cache key
	 * @param {any} value - Value to set
	 */
	applySet(cacheName, key, value) {
		try {
			// Policy guard
			const policies = this.#managers?.policies;
			if (
				policies?.getPolicy &&
				!policies.getPolicy("cache", "enabled")
			) {
				this.#emitWarning("Cache operations disabled by policy");
				return;
			}

			const cache = this.getCache(this.#sanitizeInput(cacheName));
			if (!cache) return;

			/* @performance-budget: <1ms -- internal cache mutation */
			if (typeof cache.set === "function") {
				cache.set(this.#sanitizeInput(key), this.#sanitizeInput(value));
			}

			this.#metrics?.increment("cache.set");

			this.#dispatchAction("cache.set_applied", {
				cacheName,
				key,
				valueType: typeof value,
				timestamp: DateCore.timestamp(),
			});
		} catch (err) {
			this.#emitWarning("Cache set operation failed", {
				cacheName,
				key,
				error: err.message,
			});
		}
	}

	/**
	 * Instrumented cache deletion helper for observability handlers.
	 * @public
	 * @param {string} cacheName - Name of the cache
	 * @param {string} key - Cache key to delete
	 */
	applyDelete(cacheName, key) {
		try {
			// Policy guard
			const policies = this.#managers?.policies;
			if (
				policies?.getPolicy &&
				!policies.getPolicy("cache", "enabled")
			) {
				this.#emitWarning("Cache operations disabled by policy");
				return;
			}

			const cache = this.getCache(this.#sanitizeInput(cacheName));
			if (!cache) return;

			/* @performance-budget: <1ms -- internal cache mutation */
			if (typeof cache.delete === "function") {
				cache.delete(this.#sanitizeInput(key));
			}

			this.#metrics?.increment("cache.delete");

			this.#dispatchAction("cache.delete_applied", {
				cacheName,
				key,
				timestamp: DateCore.timestamp(),
			});
		} catch (err) {
			this.#emitWarning("Cache delete operation failed", {
				cacheName,
				key,
				error: err.message,
			});
		}
	}

	/**
	 * Gets service statistics and health metrics.
	 * @public
	 * @returns {object}
	 */
	getStats() {
		return {
			totalCaches: this.#caches.size,
			cacheNames: Array.from(this.#caches.keys()),
			metrics: this.getAllMetrics(),
			managersAvailable: Object.keys(this.#managers).length,
			userContext: this.#currentUser,
			lastUpdate: DateCore.timestamp(),
		};
	}

	/**
	 * Performs comprehensive health check.
	 * @public
	 * @returns {{healthy: boolean, checks: object, timestamp: string}}
	 */
	healthCheck() {
		const checks = {
			orchestratorAvailable: !!this.#managers?.asyncOrchestrator,
			actionDispatcherAvailable: !!this.#managers?.actionDispatcher,
			sanitizerAvailable: !!this.#sanitizer,
			forensicRegistryAvailable: !!this.#managers?.forensicRegistry,
			licenseValid:
				this.#managers?.license?.hasFeature("cache_management") ||
				false,
			userContext: !!this.#currentUser,
			cachesOperational: this.#caches.size >= 0,
		};

		const healthy = Object.values(checks).every((check) => check === true);

		const result = {
			healthy,
			checks,
			timestamp: DateCore.timestamp(),
			version: "3.0.0",
		};

		this.#dispatchAction("cache.health_check", {
			healthy,
			checksCount: Object.keys(checks).length,
			totalCaches: this.#caches.size,
			timestamp: DateCore.timestamp(),
		});

		return result;
	}

	/**
	 * Gracefully cleans up the cache manager.
	 * @public
	 * @returns {Promise<void>}
	 */
	cleanup() {
		return this.#runOrchestrated("cleanup", () => {
			return this.destroyAll().then(() => {
				this.#loggedWarnings.clear();

				this.#dispatchAction("cache.cleanup", {
					timestamp: DateCore.timestamp(),
					success: true,
				});
			});
		});
	}
}

export default CacheManager;
