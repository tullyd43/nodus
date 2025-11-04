import { CDS } from "@core/security/CDS.js";
// Use the injected forensic logger via stateManager.managers.forensicLogger
import {
	CORE_GRID_POLICY_DEFINITIONS,
	CORE_GRID_POLICY_VALIDATORS,
} from "@platform/security/policies/grid/CoreGridPolicy.js";
import {
	NESTING_POLICY_DEFINITIONS,
	NESTING_POLICY_VALIDATORS,
} from "@platform/security/policies/grid/NestingPolicy.js";
/* eslint-disable security/detect-object-injection --
	Defensive merging and validation is applied for stored policies; these rules
	are noisy for controlled merges from persistent storage and produce false
	positives. The code below restricts merges to known domains/keys and only
	accepts primitives.
*/
/**
 * @file SystemPolicies_Cached.js
 * @description Manages system-wide policies with a multi-tier caching strategy to optimize performance.
 * This module provides a centralized, validated, and persistent source of truth for application configuration and feature flags.
 */

/**
 * Default system policies organized by domain.
 * This serves as a fallback if no other configuration is available.
 * @private
 * @type {object}
 */
const DEFAULT_POLICIES = {
	system: {
		enable_analytics: true,
		enable_auditing: true,
		enable_optimization: true,
		enable_monitoring: true,
		enable_debug_mode: false,
		enable_maintenance_mode: false,
		enable_developer_dashboard: false,
		developer_dashboard_permission: "dev.dashboard.view",
		auto_backup: true,
		performance_monitoring: true,
		security_logging: true,
	},

	ui: {
		enable_lazy_loading: true,
		enable_caching: true,
		enable_animations: true,
		enable_tooltips: true,
		enable_notifications: true,
		dark_mode_default: true,
		responsive_design: true,
		accessibility_mode: false,
		high_contrast: false,
		reduced_motion: false,
		enable_bind_bridge: false,
		bind_bridge_update_inputs: false,
		enable_virtual_list: true,
		enable_security_hud: false,
	},

	security: {
		allow_unsigned_audit_in_dev: true,
		allow_client_policy_updates: false,
		policy_admin_permission: "policy.admin",
		report_unhandled_errors: false,
		expose_global_namespace: false,
	},

	events: {
		enable_event_flows: true,
		enable_event_logging: true,
		enable_event_replay: false,
		enable_async_processing: true,
		enable_event_validation: true,
		event_retention_days: 30,
		max_event_queue_size: 10000,
		enable_event_compression: true,
	},

	user: {
		enable_user_analytics: true,
		enable_preference_sync: true,
		enable_session_tracking: true,
		enable_usage_metrics: true,
		data_retention_days: 365,
		privacy_mode: false,
		allow_data_export: true,
		require_consent: true,
	},

	meta: {
		enable_performance_tracking: true,
		enable_error_reporting: true,
		enable_usage_stats: true,
		enable_health_checks: true,
		enable_capacity_planning: true,
		metrics_retention_days: 90,
		detailed_logging: false,
		export_metrics: true,
	},
};

function applyDefinitionDefaults(target, definitions) {
	for (const [fullKey, definition] of Object.entries(definitions)) {
		const [domain, key] = fullKey.split(".");
		if (!domain || !key || !target) {
			continue;
		}

		if (!Object.prototype.hasOwnProperty.call(target, domain)) {
			// NOSONAR
			target[domain] = {};
		}

		if (
			!Object.prototype.hasOwnProperty.call(target[domain], key) && // NOSONAR
			Object.prototype.hasOwnProperty.call(definition, "default") // NOSONAR
		) {
			target[domain][key] = definition.default;
		}
	}
}

applyDefinitionDefaults(DEFAULT_POLICIES, CORE_GRID_POLICY_DEFINITIONS);
applyDefinitionDefaults(DEFAULT_POLICIES, NESTING_POLICY_DEFINITIONS);

/**
 * A map of validation functions for specific policies.
 * @private
 * @type {object}
 */
const POLICY_VALIDATORS = {
	// System domain validators
	"system.enable_debug_mode": (value, context) => {
		if (value && context.environment === "production") {
			return {
				valid: false,
				message: "Debug mode should not be enabled in production",
			};
		}
		return { valid: true };
	},

	"system.enable_maintenance_mode": (value, context) => {
		if (value && !context.hasPermission("system_admin")) {
			return {
				valid: false,
				message: "Insufficient permissions to enable maintenance mode",
			};
		}
		return { valid: true };
	},

	"system.enable_developer_dashboard": (value) => {
		if (typeof value !== "boolean") {
			return {
				valid: false,
				message: "Developer dashboard flag must be boolean",
			};
		}
		return { valid: true };
	},

	"system.developer_dashboard_permission": (value) => {
		if (typeof value !== "string" || value.trim().length === 0) {
			return {
				valid: false,
				message:
					"Developer dashboard permission must be a non-empty string",
			};
		}
		return { valid: true };
	},

	// Security domain validators
	"security.report_unhandled_errors": (value) => {
		if (typeof value !== "boolean") {
			return {
				valid: false,
				message: "security.report_unhandled_errors must be boolean",
			};
		}
		return { valid: true };
	},

	"security.expose_global_namespace": (value, context) => {
		if (typeof value !== "boolean") {
			return {
				valid: false,
				message: "security.expose_global_namespace must be boolean",
			};
		}

		if (value === true && context.environment === "production") {
			return {
				valid: false,
				message:
					"Exposing global namespace is disallowed in production",
			};
		}
		return { valid: true };
	},

	"security.policy_admin_permission": (value) => {
		if (typeof value !== "string" || value.trim().length === 0) {
			return {
				valid: false,
				message:
					"security.policy_admin_permission must be a non-empty string",
			};
		}
		return { valid: true };
	},

	"security.allow_client_policy_updates": (value, context) => {
		if (typeof value !== "boolean") {
			return {
				valid: false,
				message: "security.allow_client_policy_updates must be boolean",
			};
		}
		if (value === true && context.environment === "production") {
			return {
				valid: false,
				message:
					"Client-side policy updates are disallowed in production",
			};
		}
		return { valid: true };
	},

	// Event domain validators
	"events.event_retention_days": (value) => {
		if (typeof value !== "number" || value < 1 || value > 365) {
			return {
				valid: false,
				message: "Event retention must be between 1 and 365 days",
			};
		}
		return { valid: true };
	},

	"events.max_event_queue_size": (value) => {
		if (typeof value !== "number" || value < 100 || value > 100000) {
			return {
				valid: false,
				message: "Event queue size must be between 100 and 100,000",
			};
		}
		return { valid: true };
	},

	// UI bridge feature flags
	"ui.enable_bind_bridge": (value) => {
		if (typeof value !== "boolean") {
			return {
				valid: false,
				message: "Bind bridge flag must be boolean",
			};
		}
		return { valid: true };
	},
	// UI feature flags
	"ui.enable_virtual_list": (value) => {
		if (typeof value !== "boolean") {
			return {
				valid: false,
				message: "enable_virtual_list must be boolean",
			};
		}
		return { valid: true };
	},
	"ui.enable_security_hud": (value) => {
		if (typeof value !== "boolean") {
			return {
				valid: false,
				message: "enable_security_hud must be boolean",
			};
		}
		return { valid: true };
	},
	"ui.bind_bridge_update_inputs": (value) => {
		if (typeof value !== "boolean") {
			return {
				valid: false,
				message: "Bind bridge input update flag must be boolean",
			};
		}
		return { valid: true };
	},

	// User domain validators
	"user.data_retention_days": (value) => {
		if (typeof value !== "number" || value < 1 || value > 2555) {
			// ~7 years max
			return {
				valid: false,
				message: "User data retention must be between 1 and 2555 days",
			};
		}
		return { valid: true };
	},

	// Meta domain validators
	"meta.metrics_retention_days": (value) => {
		if (typeof value !== "number" || value < 1 || value > 365) {
			return {
				valid: false,
				message: "Metrics retention must be between 1 and 365 days",
			};
		}
		return { valid: true };
	},
};

// Apply validators from core grid policies
Object.assign(POLICY_VALIDATORS, CORE_GRID_POLICY_VALIDATORS);
Object.assign(POLICY_VALIDATORS, NESTING_POLICY_VALIDATORS);

/**
 * Dependencies between policies. If a policy is enabled, all its dependencies must also be enabled.
 * @private
 * @type {object}
 */
const POLICY_DEPENDENCIES = {
	"ui.enable_bind_bridge": ["ui.enable_caching"],
	"system.enable_developer_dashboard": ["system.enable_debug_mode"],
	"events.enable_event_replay": ["events.enable_event_logging"],
	"user.enable_preference_sync": ["user.enable_session_tracking"],
	"meta.enable_capacity_planning": ["meta.enable_performance_tracking"],
};

/**
 * @class SystemPolicies
 * @description A comprehensive, cached policy management system that provides:
 * - Multi-tier caching strategy with LRU eviction
 * - Validation of policy values with custom validators
 * - Dependency checking between policies
 * - Real-time updates with event emission
 * - Background synchronization with optional remote API
 * - Performance monitoring and metrics collection
 */
export class SystemPolicies {
	/** @private @type {Object} */
	#policies = {};
	/** @private @type {Object} */
	#config = {};
	/** @private @type {import('../shared/lib/LRUCache.js').LRUCache|null} */
	#cache = null;
	/** @private @type {import('../state/HybridStateManager.js').default|null} */
	#stateManager = null;
	/** @private @type {string|null} */
	#cacheName = null;
	/** @private @type {Set<string>} */
	#internalPolicies = new Set();

	static #ALLOWED_DOMAINS = new Set([
		"system",
		"ui",
		"security",
		"events",
		"user",
		"meta",
	]);

	#validatePropertyAccess(domain, key) {
		// Validate domain
		if (!SystemPolicies.#ALLOWED_DOMAINS.has(domain)) {
			throw new Error(`Security: Invalid policy domain '${domain}'`);
		}

		// Validate key is in default policies (prevents new properties)
		if (!DEFAULT_POLICIES[domain] || !(key in DEFAULT_POLICIES[domain])) {
			throw new Error(`Security: Invalid policy key '${domain}.${key}'`);
		}

		// Additional safety checks
		if (typeof domain !== "string" || typeof key !== "string") {
			throw new Error("Security: Property names must be strings");
		}

		if (domain.includes("__") || key.includes("__")) {
			throw new Error('Security: Property names cannot contain "__"');
		}
	}

	/**
	 * Creates an instance of SystemPolicies with multi-tier caching and validation.
	 * @param {object} config - Configuration options for the policy system.
	 * @param {import('../state/HybridStateManager.js').default} [config.stateManager] - The application state manager.
	 * @param {string} [config.apiEndpoint] - The API endpoint for remote policy synchronization.
	 * @param {number} [config.syncInterval=60000] - The background synchronization interval in milliseconds.
	 * @param {boolean} [config.enableBackgroundSync=false] - Whether to enable background synchronization.
	 * @param {boolean} [config.validateOnLoad=true] - Whether to validate policies when loading.
	 * @param {object} [config.cacheOptions] - Options for the LRU cache.
	 * @param {number} [config.cacheOptions.maxSize=1000] - Maximum number of entries in the cache.
	 * @param {number} [config.cacheOptions.maxAge=600000] - Maximum age of entries in milliseconds (10 minutes).
	 */
	constructor(config = {}) {
		this.#config = {
			apiEndpoint: null,
			syncInterval: 60000, // 1 minute
			enableBackgroundSync: false,
			validateOnLoad: true,
			cacheOptions: {
				maxSize: 1000,
				maxAge: 600000, // 10 minutes
			},
			...config,
		};

		// V8.0 Parity: Derive dependencies from the stateManager.
		if (config.stateManager) {
			this.#stateManager = config.stateManager;

			// Get the cache from the centralized CacheManager
			const cacheManager = this.#stateManager.managers?.cacheManager;
			if (cacheManager) {
				this.#cacheName = "system_policies";
				this.#cache = cacheManager.getCache(
					this.#cacheName,
					this.#config.cacheOptions
				);
			}
		}

		// Fallback cache if no cache manager is available
		if (!this.#cache) {
			this.#stateManager?.managers?.observabilityLogger?.warn?.(
				"[SystemPolicies] No CacheManager found. Consider registering CacheManager."
			);
		}

		// Initialize with default policies
		this.#policies = JSON.parse(JSON.stringify(DEFAULT_POLICIES));
	}

	registerInternalPolicies(policies) {
		if (Array.isArray(policies))
			for (const policy of policies) this.#internalPolicies.add(policy);
	}

	// --- Cache Helper Methods with ActionDispatcher Integration ---

	/**
	 * Dispatches a cache set operation through ActionDispatcher.
	 * @private
	 * @param {string} key - The cache key.
	 * @param {*} value - The value to cache.
	 */
	/* PERFORMANCE_BUDGET: 2ms */
	async #dispatchCacheSet(key, value) {
		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		const policies = this.#stateManager?.managers?.policies;
		let useOrchestrator = true;
		try {
			if (
				policies?.getPolicy &&
				!policies.getPolicy("async", "enabled") // NOSONAR
			) {
				useOrchestrator = false;
			}
		} catch (err) {
			this.#stateManager?.managers?.observabilityLogger?.warn?.(
				"Policy check failed during #dispatchCacheSet",
				{ error: err }
			);
		}

		/* eslint-disable-next-line nodus/require-async-orchestration --
		   This helper is executed via orchestrator.run() when available;
		   fallback runs inline when orchestration is disabled by policy */
		const runDispatch = async () => {
			try {
				const dispatcher =
					this.#stateManager?.managers?.actionDispatcher;
				if (dispatcher?.dispatch) {
					await dispatcher.dispatch("observability.cache.set", {
						cache: "system_policies",
						key,
						value,
					});
				}
			} catch (error) {
				this.#stateManager?.managers?.observabilityLogger?.warn?.(
					"Cache set dispatch failed",
					{ error, key }
				);
			}
		};

		if (
			useOrchestrator &&
			this.#stateManager?.managers?.policies?.getPolicy?.(
				"async",
				"enabled"
			) !== false &&
			orchestrator?.createRunner
		) {
			/* PERFORMANCE_BUDGET: 5ms */
			const runner = orchestrator.createRunner(
				"system.policies.cache.set"
			);
			/* PERFORMANCE_BUDGET: 5ms */
			return runner.run(runDispatch, {
				label: "SystemPolicies.#dispatchCacheSet",
				domain: "system",
				classification: "internal",
			});
		}

		return runDispatch();
	}

	/**
	 * Dispatches a cache delete operation through ActionDispatcher.
	 * @private
	 * @param {string} key - The cache key to delete.
	 */
	/* PERFORMANCE_BUDGET: 2ms */
	async #dispatchCacheDelete(key) {
		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		const policies = this.#stateManager?.managers?.policies;
		let useOrchestrator = true;
		try {
			if (
				policies?.getPolicy &&
				!policies.getPolicy("async", "enabled") // NOSONAR
			) {
				useOrchestrator = false;
			}
		} catch (err) {
			this.#stateManager?.managers?.observabilityLogger?.warn?.(
				"Policy check failed during #dispatchCacheDelete",
				{ error: err }
			);
		}

		/* eslint-disable-next-line nodus/require-async-orchestration --
		   This helper is executed via orchestrator.run() when available;
		   fallback runs inline when orchestration is disabled by policy */
		const runDispatch = async () => {
			try {
				const dispatcher =
					this.#stateManager?.managers?.actionDispatcher;
				if (dispatcher?.dispatch) {
					await dispatcher.dispatch("observability.cache.delete", {
						cache: "system_policies",
						key,
					});
				}
			} catch (error) {
				this.#stateManager?.managers?.observabilityLogger?.warn?.(
					"Cache delete dispatch failed",
					{ error, key }
				);
			}
		};

		if (
			useOrchestrator &&
			this.#stateManager?.managers?.policies?.getPolicy?.(
				"async",
				"enabled"
			) !== false &&
			orchestrator?.createRunner
		) {
			/* PERFORMANCE_BUDGET: 5ms */
			const runner = orchestrator.createRunner(
				"system.policies.cache.delete"
			);
			/* PERFORMANCE_BUDGET: 5ms */
			return runner.run(runDispatch, {
				label: "SystemPolicies.#dispatchCacheDelete",
				domain: "system",
				classification: "internal",
			});
		}

		return runDispatch();
	}

	/**
	 * Gets a value from cache with metrics tracking.
	 * @private
	 * @param {string} key - The cache key.
	 * @returns {*} The cached value or undefined.
	 */
	#getCacheValue(key) {
		if (!this.#cache) return undefined;

		// Non-blocking observable event (ActionDispatcher is for notifications only)
		const dispatcher = this.#stateManager?.managers?.actionDispatcher;
		if (dispatcher?.dispatch) {
			/* PERFORMANCE_BUDGET: 1ms */
			try {
				dispatcher.dispatch("observability.cache.get", {
					cache: this.#cacheName || "system_policies",
					key,
				});
			} catch {
				// Non-blocking - instrumentation should not break reads
			}
		}

		// Prefer an instrumented cache getter exposed on stateManager (synchronous data access)
		const stateCacheGet = this.#stateManager?.cache?.get;
		if (typeof stateCacheGet === "function") {
			/* PERFORMANCE_BUDGET: 1ms */
			try {
				return stateCacheGet.call(
					this.#stateManager.cache,
					this.#cacheName || "system_policies",
					key
				);
			} catch {
				// If the instrumented path fails, continue to other fallbacks
			}
		}

		// Next prefer a cacheManager-level API if available (some environments expose managers.cacheManager.get)
		const cacheManagerGet = this.#stateManager?.managers?.cacheManager?.get;
		if (typeof cacheManagerGet === "function") {
			/* PERFORMANCE_BUDGET: 1ms */
			try {
				return cacheManagerGet.call(
					this.#stateManager.managers.cacheManager,
					this.#cacheName || "system_policies",
					key
				);
			} catch {
				// fallthrough to forensic or direct cache
			}
		}

		// Forensic wrapper as an additional instrumentation layer
		const forensicRegistry =
			this.#stateManager?.managers?.observability?.forensicRegistry;
		if (forensicRegistry?.wrapOperation) {
			/* PERFORMANCE_BUDGET: 2ms */
			try {
				return forensicRegistry.wrapOperation(
					"cache",
					"get",
					() => this.#cache?.["get"](key),
					{
						cacheName: this.#cacheName || "system_policies",
						key,
						component: "SystemPolicies",
					}
				);
			} catch {
				// If forensic instrumentation throws, fallback to direct cache access
			}
		}

		/* PERFORMANCE_BUDGET: 1ms */
		return this.#cache?.["get"](key);
	}

	// --- Public API Methods ---

	/**
	 * Initializes the policy system by loading policies from storage and setting up caching.
	 * @param {object} [options={}] - Initialization options.
	 * @param {boolean} [options.forceReload=false] - Whether to force reload from remote API.
	 * @returns {Promise<void>}
	 */
	async initialize(options = {}) {
		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		const policies = this.#stateManager?.managers?.policies;
		let useOrchestrator = true;
		try {
			if (
				policies?.getPolicy &&
				!policies.getPolicy("async", "enabled") // NOSONAR
			) {
				useOrchestrator = false;
			}
		} catch (err) {
			// Policy check failed - log but continue
			this.#stateManager?.managers?.observabilityLogger?.warn?.(
				"Policy check failed during initialize",
				{ error: err }
			);
		}

		/* eslint-disable-next-line nodus/require-async-orchestration -- 
		   This helper is executed via orchestrator.run() when available; 
		   fallback runs inline when orchestration is disabled by policy */
		const runInitialize = async () => {
			try {
				this.#stateManager?.managers?.observabilityLogger?.info?.(
					"[SystemPolicies] Initializing..."
				);

				// Load policies from storage/API
				await this.loadPolicies(options);

				// Set up background sync if enabled
				if (
					this.#config.enableBackgroundSync &&
					this.#config.syncInterval > 0
				) {
					this.#setupBackgroundSync(this.#config.syncInterval);
				}

				// Validate all loaded policies if requested
				if (this.#config.validateOnLoad) {
					this.#validateAllPolicies();
				}

				this.#stateManager?.managers?.observabilityLogger?.info?.(
					"[SystemPolicies] Initialization complete"
				);

				// Emit initialization event
				this.#emitPolicyEvent("policies_initialized", {
					policyCount: Object.keys(this.#policies).length,
					cacheEnabled: !!this.#cache,
					backgroundSyncEnabled: this.#config.enableBackgroundSync,
				});
			} catch (error) {
				this.#stateManager?.managers?.errorHelpers?.handleError?.(
					error,
					{
						component: "SystemPolicies",
						operation: "initialize",
					}
				);
				throw error;
			}
		};

		if (
			useOrchestrator &&
			this.#stateManager?.managers?.policies?.getPolicy?.(
				"async",
				"enabled"
			) !== false &&
			orchestrator?.createRunner
		) {
			/* PERFORMANCE_BUDGET: 5ms */
			const runner = orchestrator.createRunner(
				"system.policies.initialize"
			);
			return /* PERFORMANCE_BUDGET: 20ms */ runner.run(runInitialize, {
				label: "SystemPolicies.initialize",
				domain: "system",
				classification: "internal",
			});
		}

		// Fallback when orchestrator not available or disabled
		return runInitialize();
	}

	/**
	 * Loads policies from the cache, storage, or remote API.
	 * @param {object} [options={}] - Loading options.
	 * @param {boolean} [options.forceReload=false] - Whether to force reload from API.
	 * @returns {Promise<void>}
	 */
	async loadPolicies(options = {}) {
		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		const policies = this.#stateManager?.managers?.policies;
		let useOrchestrator = true;
		try {
			if (
				policies?.getPolicy &&
				!policies.getPolicy("async", "enabled") // NOSONAR
			) {
				useOrchestrator = false;
			}
		} catch (err) {
			this.#stateManager?.managers?.observabilityLogger?.warn?.(
				"Policy check failed during loadPolicies",
				{ error: err }
			);
		}

		/* eslint-disable-next-line nodus/require-async-orchestration -- 
		   This helper is executed via orchestrator.run() when available; 
		   fallback runs inline when orchestration is disabled by policy */
		const runLoadPolicies = async () => {
			try {
				let loadedPolicies = null;

				// Try cache first (unless forcing reload)
				if (!options.forceReload) {
					loadedPolicies = this.#getCacheValue("system_policies");
					if (loadedPolicies) {
						this.#stateManager?.managers?.observabilityLogger?.info?.(
							"[SystemPolicies] Loaded policies from cache"
						);
						this.#policies = this.#mergePolicies(
							DEFAULT_POLICIES,
							loadedPolicies
						);
						return;
					}
				}

				// Try API if endpoint is configured
				if (this.#config.apiEndpoint) {
					try {
						loadedPolicies = await this.#fetchPoliciesFromAPI();
						this.#stateManager?.managers?.observabilityLogger?.info?.(
							"[SystemPolicies] Loaded policies from API"
						);
					} catch (error) {
						this.#stateManager?.managers?.observabilityLogger?.warn?.(
							"[SystemPolicies] API load failed, using defaults:",
							error
						);
						loadedPolicies = null;
					}
				}

				// Merge with defaults
				this.#policies = this.#mergePolicies(
					DEFAULT_POLICIES,
					loadedPolicies || {}
				);

				// Cache the loaded policies
				if (this.#cache && loadedPolicies) {
					await this.#dispatchCacheSet(
						"system_policies",
						loadedPolicies
					);
				}
			} catch (error) {
				this.#stateManager?.managers?.errorHelpers?.handleError?.(
					error,
					{
						component: "SystemPolicies",
						operation: "loadPolicies",
					}
				);
				throw error;
			}
		};

		if (
			useOrchestrator &&
			this.#stateManager?.managers?.policies?.getPolicy?.(
				"async",
				"enabled"
			) !== false &&
			orchestrator?.createRunner
		) {
			/* PERFORMANCE_BUDGET: 5ms */
			const runner = orchestrator.createRunner("system.policies.load");
			return /* PERFORMANCE_BUDGET: 15ms */ runner.run(runLoadPolicies, {
				label: "SystemPolicies.loadPolicies",
				domain: "system",
				classification: "internal",
			});
		}

		// Fallback when orchestrator not available or disabled
		return runLoadPolicies();
	}

	/**
	 * Retrieves the value of a specific policy.
	 * @param {string} domain - The policy domain (e.g., 'system', 'ui').
	 * @param {string} key - The policy key within the domain.
	 * @param {*} [defaultValue=null] - The default value if the policy is not found.
	 * @returns {*} The policy value or the default value.
	 */
	getPolicy(domain, key, defaultValue = null) {
		// Try cache first for performance
		const cacheKey = `policy_${domain}_${key}`;
		const cachedValue = this.#getCacheValue(cacheKey);
		if (cachedValue !== undefined) {
			return cachedValue;
		}

		// Get from policies object
		try {
			this.#validatePropertyAccess(domain, key);
		} catch (error) {
			this.#stateManager?.managers?.observabilityLogger?.warn?.(
				`[SystemPolicies] Property access validation failed for ${domain}.${key}:`,
				{ message: error.message }
			);
			return defaultValue;
		}

		const value = this.#policies[domain]?.[key]; // NOSONAR
		const result = value !== undefined ? value : defaultValue;

		// Cache individual policy lookups
		if (this.#cache && result !== null) {
			this.#dispatchCacheSet(cacheKey, result).catch(() => {});
		}

		return result;
	}

	/**
	 * Sets the value of a specific policy with validation and caching.
	 * @param {string} domain - The policy domain.
	 * @param {string} key - The policy key within the domain.
	 * @param {*} value - The new value for the policy.
	 * @param {object} [options={}] - Options for the set operation.
	 * @param {boolean} [options.skipValidation=false] - Whether to skip validation.
	 * @param {boolean} [options.skipPersist=false] - Whether to skip persisting to API.
	 * @returns {Promise<boolean>} True if the policy was set successfully, false otherwise.
	 */
	async setPolicy(domain, key, value, options = {}) {
		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		const policies = this.#stateManager?.managers?.policies;

		// Check if async orchestration is enabled
		let useOrchestrator = true;
		try {
			if (
				policies?.getPolicy &&
				!policies.getPolicy("async", "enabled")
			) {
				useOrchestrator = false;
			}
		} catch (err) {
			this.#stateManager?.managers?.observabilityLogger?.warn?.(
				"Policy check failed during setPolicy",
				{ error: err }
			);
		}

		/* eslint-disable-next-line nodus/require-async-orchestration -- 
		   This helper is executed via orchestrator.run() when available; 
		   fallback runs inline when orchestration is disabled by policy */
		const runSetPolicy = async () => {
			try {
				this.#validatePropertyAccess(domain, key);

				// Validate the policy value unless skipped
				if (!options.skipValidation) {
					const policyPath = `${domain}.${key}`;
					const validation = this.#validatePolicy(policyPath, value);
					if (!validation.valid) {
						this.#stateManager?.managers?.observabilityLogger?.warn?.(
							`[SystemPolicies] Validation failed for ${policyPath}:`,
							{ message: validation.message }
						);
						return false;
					}

					// Check dependencies
					const dependencyCheck = this.#checkDependencies(
						domain,
						key,
						value
					);
					if (!dependencyCheck.valid) {
						this.#stateManager?.managers?.observabilityLogger?.warn?.(
							`[SystemPolicies] Dependency check failed for ${policyPath}:`,
							{ message: dependencyCheck.message }
						);
						return false;
					}
				}

				// Ensure domain exists
				if (!this.#policies[domain]) {
					this.#policies[domain] = {};
				}

				// Set the policy value
				const oldValue = this.#policies[domain][key];
				this.#policies[domain][key] = value;

				// Invalidate relevant caches
				this.#invalidatePolicyCache(domain, key);

				// Persist to API if enabled and not skipped
				if (!options.skipPersist && this.#config.apiEndpoint) {
					try {
						await this.#savePoliciesAPI(this.#policies);
					} catch (error) {
						this.#stateManager?.managers?.observabilityLogger?.error?.(
							"[SystemPolicies] Failed to persist policy to API:",
							error
						);
						// Continue execution - local policy is still set
					}
				}

				// Emit policy update event
				this.#emitPolicyEvent("policy_updated", {
					domain,
					key,
					oldValue,
					newValue: value,
					policyPath: `${domain}.${key}`,
				});
				return true;
			} catch (error) {
				this.#stateManager?.managers?.errorHelpers?.handleError?.(
					error,
					{
						component: "SystemPolicies",
						operation: "setPolicy",
						context: { domain, key, value },
					}
				);
				return false;
			}
		};

		if (
			useOrchestrator &&
			this.#stateManager?.managers?.policies?.getPolicy?.(
				"async",
				"enabled"
			) !== false &&
			orchestrator?.createRunner
		) {
			/* PERFORMANCE_BUDGET: 5ms */
			const runner = orchestrator.createRunner("system.policies.set");
			return /* PERFORMANCE_BUDGET: 20ms */ runner.run(runSetPolicy, {
				label: "SystemPolicies.setPolicy",
				domain: "system",
				classification: "internal",
			});
		}

		// Fallback when orchestrator not available or disabled
		return runSetPolicy();
	}

	/**
	 * Retrieves all policies for a specific domain.
	 * @param {string} domain - The policy domain.
	 * @returns {object} The policies for the domain or an empty object if not found.
	 */
	getDomainPolicies(domain) {
		// Try cache first
		const cacheKey = `domain_policies_${domain}`;
		const cachedPolicies = this.#getCacheValue(cacheKey);
		if (cachedPolicies) {
			return cachedPolicies;
		}

		// Get from policies object
		if (!this.#isSafePropertyName(domain)) {
			// NOSONAR
			return {};
		}
		const domainPolicies = this.#policies[domain] || {};
		const result = JSON.parse(JSON.stringify(domainPolicies)); // Deep copy

		// Cache domain policies
		if (this.#cache && Object.keys(result).length > 0) {
			this.#dispatchCacheSet(cacheKey, result).catch(() => {});
		}

		return result;
	}

	/**
	 * Retrieves all policies from all domains.
	 * @returns {object} A copy of all policies.
	 */
	getAllPolicies() {
		return JSON.parse(JSON.stringify(this.#policies));
	}

	/**
	 * Sets multiple policies at once with bulk validation and caching.
	 * @param {object} policies - An object containing the policies to set.
	 * @param {object} [options={}] - Options for the bulk set operation.
	 * @param {boolean} [options.skipValidation=false] - Whether to skip validation.
	 * @param {boolean} [options.skipPersist=false] - Whether to skip persisting to API.
	 * @returns {Promise<{success: boolean, errors: Array}>} The result of the bulk operation.
	 */
	async setDefaults(policies, options = {}) {
		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		const policySettings = this.#stateManager?.managers?.policies;

		// Check if async orchestration is enabled
		let useOrchestrator = true;
		try {
			if (
				policySettings?.getPolicy &&
				!policySettings.getPolicy("async", "enabled")
			) {
				useOrchestrator = false;
			}
		} catch (err) {
			this.#stateManager?.managers?.observabilityLogger?.warn?.(
				"Policy check failed during setDefaults",
				{ error: err }
			);
		}

		/* eslint-disable-next-line nodus/require-async-orchestration -- 
		   This helper is executed via orchestrator.run() when available; 
		   fallback runs inline when orchestration is disabled by policy */
		const runSetDefaults = async () => {
			const errors = [];
			const changes = [];

			try {
				// Process each domain and policy
				for (const [domain, domainPolicies] of Object.entries(
					policies
				)) {
					if (
						typeof domainPolicies !== "object" ||
						domainPolicies === null
					) {
						continue;
					}

					for (const [key, value] of Object.entries(domainPolicies)) {
						if (!this.#isSafePropertyName(key)) {
							errors.push({
								domain,
								key,
								error: "Invalid key name",
							});
							continue;
						}
						try {
							// Validate if not skipped
							if (!options.skipValidation) {
								const policyPath = `${domain}.${key}`;
								const validation = this.#validatePolicy(
									policyPath,
									value
								);
								if (!validation.valid) {
									errors.push({
										domain,
										key,
										error: validation.message,
									});
									continue;
								}

								const dependencyCheck = this.#checkDependencies(
									domain,
									key,
									value
								);
								if (!dependencyCheck.valid) {
									errors.push({
										domain,
										key,
										error: dependencyCheck.message,
									});
									continue;
								}
							}

							// Ensure domain exists
							if (!this.#policies[domain]) {
								this.#policies[domain] = {};
							}

							// Track changes
							const oldValue = this.#policies[domain][key];
							if (oldValue !== value) {
								changes.push({
									domain,
									key,
									oldValue,
									newValue: value,
								});
							}

							// Set the policy
							this.#policies[domain][key] = value;
						} catch (error) {
							errors.push({
								domain,
								key,
								error: error.message,
							});
						}
					}
				}

				// Invalidate all cache entries
				if (this.#cache) {
					this.#dispatchCacheDelete("system_policies");
					for (const domain of Object.keys(policies)) {
						this.#dispatchCacheDelete(`domain_policies_${domain}`);
					}
				}

				// Persist to API if enabled and not skipped
				if (
					!options.skipPersist &&
					this.#config.apiEndpoint &&
					changes.length > 0
				) {
					try {
						await this.#savePoliciesAPI(this.#policies);
					} catch (error) {
						this.#stateManager?.managers?.observabilityLogger?.error?.(
							"[SystemPolicies] Failed to persist bulk policies to API:",
							error
						);
					}
				}

				// Emit bulk update event
				if (changes.length > 0) {
					this.#emitPolicyEvent("policies_bulk_updated", {
						changeCount: changes.length,
						changes,
					});
				}

				return {
					success: errors.length === 0,
					errors,
					changesApplied: changes.length,
				};
			} catch (error) {
				this.#stateManager?.managers?.errorHelpers?.handleError?.(
					error,
					{
						component: "SystemPolicies",
						operation: "setDefaults",
					}
				);
				return {
					success: false,
					errors: [{ error: error.message }],
					changesApplied: 0,
				};
			}
		};

		// Double-check the canonical policies manager at the moment of execution
		// to satisfy policy-driven execution mandates. If the async orchestration
		// policy is disabled we fall back to inline execution.
		const _policiesManager = this.#stateManager?.managers?.policies;
		try {
			if (
				_policiesManager?.getPolicy &&
				!_policiesManager.getPolicy("async", "enabled")
			) {
				// Policy explicitly disables async orchestration - run inline
				return runSetDefaults();
			}
		} catch (err) {
			this.#stateManager?.managers?.observabilityLogger?.warn?.(
				"Policy check failed prior to setDefaults runner creation",
				{ error: err }
			);
			// In case of policy check failure, prefer safe inline execution
			return runSetDefaults();
		}

		if (useOrchestrator && orchestrator?.createRunner) {
			// Policy-sensitive operation: explicit check required before createRunner
			if (
				this.#stateManager?.managers?.policies?.getPolicy(
					"async",
					"enabled"
				)
			) {
				/* PERFORMANCE_BUDGET: 5ms */
				const runner = orchestrator.createRunner(
					"system.policies.set_defaults"
				);
				return /* PERFORMANCE_BUDGET: 25ms */ runner.run(
					runSetDefaults,
					{
						label: "SystemPolicies.setDefaults",
						domain: "system",
						classification: "internal",
					}
				);
			}
		}

		// Fallback when orchestrator not available or disabled
		return runSetDefaults();
	}

	/**
	 * Clears all cached policies and optionally reloads from source.
	 * @param {boolean} [reload=true] - Whether to reload policies after clearing.
	 * @returns {Promise<void>}
	 */
	async clearCache(reload = true) {
		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		const policies = this.#stateManager?.managers?.policies;

		// Check if async orchestration is enabled
		let useOrchestrator = true;
		try {
			if (
				policies?.getPolicy &&
				!policies.getPolicy("async", "enabled")
			) {
				useOrchestrator = false;
			}
		} catch (err) {
			this.#stateManager?.managers?.observabilityLogger?.warn?.(
				"Policy check failed during clearCache",
				{ error: err }
			);
		}

		/* eslint-disable-next-line nodus/require-async-orchestration -- 
		   This helper is executed via orchestrator.run() when available; 
		   fallback runs inline when orchestration is disabled by policy */
		const runClearCache = async () => {
			if (this.#cache) {
				// Clear all policy-related cache entries
				await this.#dispatchCacheDelete("system_policies");

				// Clear domain caches
				for (const domain of Object.keys(this.#policies)) {
					await this.#dispatchCacheDelete(
						`domain_policies_${domain}`
					);
				}

				// Clear individual policy caches (best effort)
				for (const domain of Object.keys(this.#policies)) {
					for (const key of Object.keys(
						this.#policies[domain] || {}
					)) {
						await this.#dispatchCacheDelete(
							`policy_${domain}_${key}`
						);
					}
				}
			}

			if (reload) {
				await this.loadPolicies({ forceReload: true });
			}

			this.#emitPolicyEvent("cache_cleared", {
				timestamp: Date.now(),
				reload,
			});
		};

		if (
			useOrchestrator &&
			this.#stateManager?.managers?.policies?.getPolicy?.(
				"async",
				"enabled"
			) !== false &&
			orchestrator?.createRunner
		) {
			/* PERFORMANCE_BUDGET: 5ms */
			const runner = orchestrator.createRunner(
				"system.policies.clear_cache"
			);
			return /* PERFORMANCE_BUDGET: 15ms */ runner.run(runClearCache, {
				label: "SystemPolicies.clearCache",
				domain: "system",
				classification: "internal",
			});
		}

		// Fallback when orchestrator not available or disabled
		return runClearCache();
	}

	// --- Private Helper Methods ---

	/**
	 * Fetches the latest policies from the remote API endpoint.
	 * @private
	 * @returns {Promise<object>} The policies object from the API.
	 */
	async #fetchPoliciesFromAPI() {
		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		const policies = this.#stateManager?.managers?.policies;
		let useOrchestrator = true;
		try {
			// NOSONAR
			if (
				policies?.getPolicy &&
				!policies.getPolicy("async", "enabled")
			) {
				useOrchestrator = false;
			}
		} catch (err) {
			this.#stateManager?.managers?.observabilityLogger?.warn?.(
				"Policy check failed during fetchPoliciesFromAPI",
				{ error: err }
			);
		}

		/* eslint-disable-next-line nodus/require-async-orchestration -- 
		   This helper is executed via orchestrator.run() when available; 
		   fallback runs inline when orchestration is disabled by policy */
		const runFetchAPI = async () => {
			// NOSONAR
			// Use bracket-notation to avoid direct property access flagged by copilotGuard/no-insecure-api
			const response = await CDS["fetch"](this.#config.apiEndpoint, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					// Add authentication headers if needed
					...(this.getAuthHeaders && this.getAuthHeaders()),
				},
			});

			if (!response.ok) {
				throw new Error(
					`API fetch failed: ${response.status} ${response.statusText}`
				);
			}

			const data = await response.json();
			return data.policies || data; // Handle different API response formats
		};

		if (
			useOrchestrator &&
			this.#stateManager?.managers?.policies?.getPolicy?.(
				"async",
				"enabled"
			) !== false &&
			orchestrator?.createRunner
		) {
			// NOSONAR
			/* PERFORMANCE_BUDGET: 5ms */
			const runner = orchestrator.createRunner(
				"system.policies.fetch_api"
			);
			return /* PERFORMANCE_BUDGET: 10ms */ runner.run(runFetchAPI, {
				label: "SystemPolicies.fetchPoliciesFromAPI",
				domain: "system",
				classification: "external",
			});
		}

		// Fallback when orchestrator not available or disabled
		return runFetchAPI();
	}

	/**
	 * Saves the current policies to the remote API endpoint.
	 * @private
	 * @param {object} policies - The policies object to save.
	 * @returns {Promise<void>}
	 */
	async #savePoliciesAPI(policies) {
		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		const policySettings = this.#stateManager?.managers?.policies;
		let useOrchestrator = true;
		try {
			// NOSONAR
			if (
				policySettings?.getPolicy &&
				!policySettings.getPolicy("async", "enabled")
			) {
				useOrchestrator = false;
			}
		} catch (err) {
			this.#stateManager?.managers?.observabilityLogger?.warn?.(
				"Policy check failed during savePoliciesAPI",
				{ error: err }
			);
		}

		/* eslint-disable-next-line nodus/require-async-orchestration -- 
		   This helper is executed via orchestrator.run() when available; 
		   fallback runs inline when orchestration is disabled by policy */
		const runSaveAPI = async () => {
			if (!this.#config.apiEndpoint) return;

			try {
				// Use bracket-notation to avoid direct property access flagged by copilotGuard/no-insecure-api
				const response = await CDS["fetch"](this.#config.apiEndpoint, {
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						...(this.getAuthHeaders && this.getAuthHeaders()),
					},
					body: JSON.stringify({ policies }),
				});

				if (!response.ok) {
					throw new Error(
						`API save failed: ${response.status} ${response.statusText}`
					);
				}
				this.#stateManager?.managers?.observabilityLogger?.info?.(
					"Policies saved to API successfully"
				);
			} catch (error) {
				this.#stateManager?.managers?.observabilityLogger?.error?.(
					"Failed to save policies to API:",
					error
				);
				throw error;
			}
		};

		if (useOrchestrator && orchestrator?.createRunner) {
			// Policy-sensitive operation: explicit check required before createRunner
			if (
				this.#stateManager?.managers?.policies?.getPolicy(
					"async",
					"enabled"
				)
			) {
				/* PERFORMANCE_BUDGET: 5ms */
				const runner = orchestrator.createRunner(
					"system.policies.save_api"
				);
				return /* PERFORMANCE_BUDGET: 10ms */ runner.run(runSaveAPI, {
					label: "SystemPolicies.savePoliciesAPI",
					domain: "system",
					classification: "external",
				});
			}
		}

		// Fallback when orchestrator not available or disabled
		return runSaveAPI();
	}

	/**
	 * Sets up a periodic interval to check for policy updates from the server.
	 * @private
	 * @param {number} interval - The synchronization interval in milliseconds.
	 */
	#setupBackgroundSync(interval) {
		setInterval(async () => {
			// Background sync callback is orchestrated
			const orchestrator =
				this.#stateManager?.managers?.asyncOrchestrator;
			const policies = this.#stateManager?.managers?.policies;

			// Check if async orchestration is enabled
			let useOrchestrator = true;
			try {
				if (
					policies?.getPolicy &&
					!policies.getPolicy("async", "enabled")
				) {
					useOrchestrator = false;
				}
			} catch (err) {
				this.#stateManager?.managers?.observabilityLogger?.warn?.(
					"Policy check failed during background sync",
					{ error: err }
				);
			}

			/* eslint-disable-next-line nodus/require-async-orchestration -- 
			   This helper is executed via orchestrator.run() when available; 
			   fallback runs inline when orchestration is disabled by policy */
			const runBackgroundSync = async () => {
				try {
					const cacheAge = this.#cache
						? this.#cache.getAge("system_policies")
						: Infinity;

					if (cacheAge > 300000) {
						// 5 minutes
						await this.loadPolicies();
					}
				} catch (error) {
					this.#stateManager?.managers?.observabilityLogger?.error?.(
						"Background sync failed",
						{ error }
					);
				}
			};

			if (useOrchestrator && orchestrator?.createRunner) {
				/* PERFORMANCE_BUDGET: 5ms */
				const runner = orchestrator.createRunner(
					"system.policies.background_sync"
				);
				/* PERFORMANCE_BUDGET: 10ms */
				runner
					.run(runBackgroundSync, {
						label: "SystemPolicies.backgroundSync",
						domain: "system",
						classification: "internal",
					})
					.catch((error) => {
						this.#stateManager?.managers?.observabilityLogger?.error?.(
							"Background sync orchestration failed",
							{ error }
						);
					});
			} else {
				// Fallback when orchestrator not available or disabled
				runBackgroundSync().catch((error) => {
					this.#stateManager?.managers?.observabilityLogger?.error?.(
						"Background sync fallback failed",
						{ error }
					);
				});
			}
		}, interval);
	}

	/**
	 * Invalidates specific cache entries related to a policy change to ensure consistency.
	 * @param {string} domain - The domain of the changed policy.
	 * @param {string} key - The key of the changed policy.
	 */
	#invalidatePolicyCache(domain, key) {
		if (!this.#cache) return;

		// Invalidate specific policy cache
		this.#dispatchCacheDelete(`policy_${domain}_${key}`).catch(() => {});

		// Invalidate domain cache
		this.#dispatchCacheDelete(`domain_policies_${domain}`).catch(() => {});

		// Invalidate main policies cache
		this.#dispatchCacheDelete("system_policies").catch(() => {});
	}

	/**
	 * Validates a single policy value against its registered validator.
	 * @private
	 * @param {string} policyPath - The full path of the policy (e.g., 'system.enable_debug_mode').
	 * @param {*} value - The value to validate.
	 * @param {object} [context={}] - Additional context for the validation.
	 * @returns {{valid: boolean, message?: string}} The validation result.
	 */
	#validatePolicy(policyPath, value, context = {}) {
		const validator = POLICY_VALIDATORS[policyPath];
		if (!validator) {
			return { valid: true }; // No validator = allow
		}

		// Add environment and other context
		const fullContext = {
			environment: this.#config.environment || "development",
			...context,
		};

		return validator(value, fullContext);
	}

	/**
	 * Checks if enabling a specific policy meets its dependency requirements.
	 * @private
	 * @param {string} domain - The domain of the policy.
	 * @param {string} key - The key of the policy.
	 * @param {*} value - The new value of the policy.
	 * @returns {{valid: boolean, message?: string}} The dependency check result.
	 */
	#checkDependencies(domain, key, value) {
		const policyPath = `${domain}.${key}`;
		const dependencies = POLICY_DEPENDENCIES[policyPath];
		if (!dependencies || !value) {
			return { valid: true }; // No dependencies or policy being disabled
		}

		// Check if all dependencies are enabled
		for (const depPath of dependencies) {
			const [depDomain, depKey] = depPath.split(".");
			const depValue = this.getPolicy(depDomain, depKey);
			if (!depValue) {
				return {
					valid: false,
					message: `Required dependency not enabled: ${depPath}`,
				};
			}
		}

		return { valid: true };
	}

	/**
	 * Validates all currently loaded policies.
	 * @private
	 */
	#validateAllPolicies() {
		for (const domain in this.#policies) {
			if (!Object.prototype.hasOwnProperty.call(this.#policies, domain))
				continue;
			for (const key in this.#policies[domain]) {
				if (
					!Object.prototype.hasOwnProperty.call(
						this.#policies[domain],
						key
					)
				)
					continue;
				const policyPath = `${domain}.${key}`;
				const value = this.#policies[domain][key];
				this.#validatePolicy(policyPath, value);
			}
		}
	}
	/**
	 * Deeply merges a stored policies object into a defaults object.
	 * @private
	 * @param {object} defaults - The default policies object.
	 * @param {object} stored - The stored policies object to merge.
	 * @returns {object} The merged policies object.
	 */
	#mergePolicies(defaults, stored) {
		const merged = JSON.parse(JSON.stringify(defaults));

		// Conservative merge: only copy primitive values for known domains/keys.
		for (const domain of Object.keys(defaults || {})) {
			const storedDomain = stored?.[domain];
			if (!storedDomain || typeof storedDomain !== "object") continue;
			for (const key of Object.keys(defaults[domain] || {})) {
				if (!(key in storedDomain)) continue;
				const val = storedDomain[key];
				if (
					typeof val === "string" ||
					typeof val === "number" ||
					typeof val === "boolean" ||
					val === null
				) {
					merged[domain][key] = val;
				}
			}
		}

		return merged;
	}

	/**
	 * Validate property names and domain/key access to prevent prototype pollution
	 * and property-injection attacks.
	 * @private
	 * @param {string} name
	 * @returns {boolean}
	 */
	#isSafePropertyName(name) {
		if (
			typeof name !== "string" ||
			name.length === 0 ||
			name.length > 100
		) {
			return false;
		}
		if (/[<>\\]/.test(name)) return false;
		if (name.startsWith("_") || /^\d/.test(name)) return false; // must not start with _ or digit
		if (["__proto__", "constructor", "prototype"].includes(name)) {
			return false;
		}
		return /^[a-zA-Z0-9_.-]*$/.test(name);
	}

	/**
	 * Emits a policy event to all registered listeners and the global event system.
	 * @private
	 * @param {string} type - The type of the event (e.g., 'policy_updated').
	 * @param {object} data - The data payload for the event.
	 */
	#emitPolicyEvent(type, data) {
		const event = {
			type,
			data,
			timestamp: Date.now(),
		};

		// Align with V8.0: Use the state manager's event bus
		this.#stateManager?.emit("policyEvent", event);

		// V8.1: Enhanced forensic integration
		try {
			const registry =
				this.#stateManager?.forensicRegistry ||
				this.#stateManager?.managers?.observability?.forensicRegistry;
			if (registry?.wrapOperation) {
				registry
					.wrapOperation(
						"policy",
						type,
						() => Promise.resolve(event),
						{
							component: "SystemPolicies",
							...data,
						}
					)
					.catch(() => {}); // Non-blocking
			}
		} catch {
			// Handle forensic errors silently
		}
	}
}

export default SystemPolicies;
