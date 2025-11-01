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
		// Grid UX toggles surfaced in grid control panel
		grid_auto_save_layouts: true,
		grid_save_feedback: true,
		grid_ai_suggestions: false,
		grid_auto_save_layout_id: "default",
		grid_auto_save_layout_scope: "tenant",
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
		allow_unsigned_audit_in_dev: false,
		allow_client_policy_updates: false,
		policy_admin_permission: "policy.admin",
		report_unhandled_errors: false,
		expose_global_namespace: false,
	},

	grid: {
		enable_analytics: true,
		// Grid-wide defaults for runtime renderer
		default_columns: 24,
		default_min_w: 1,
		default_min_h: 1,
		default_max_w: 24,
		default_max_h: 1000,
		// Allowed runtime components (whitelist applied by ComponentRegistry)
		allowed_component_types: ["text", "html", "grid", "block", "button"],
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
			return { valid: false, message: "Developer dashboard flag must be boolean" };
		}
		return { valid: true };
	},

	// Grid UX toggles (under system.* per existing UI integration)
	"system.grid_auto_save_layouts": (value) => {
		if (typeof value !== "boolean") {
			return { valid: false, message: "system.grid_auto_save_layouts must be boolean" };
		}
		return { valid: true };
	},
	"system.grid_save_feedback": (value) => {
		if (typeof value !== "boolean") {
			return { valid: false, message: "system.grid_save_feedback must be boolean" };
		}
		return { valid: true };
	},
	"system.grid_ai_suggestions": (value) => {
		if (typeof value !== "boolean") {
			return { valid: false, message: "system.grid_ai_suggestions must be boolean" };
		}
		return { valid: true };
	},
	"system.grid_auto_save_layout_id": (value) => {
		if (typeof value !== "string" || value.trim().length === 0) {
			return { valid: false, message: "system.grid_auto_save_layout_id must be a non-empty string" };
		}
		return { valid: true };
	},
 	"system.grid_auto_save_layout_scope": (value) => {
 		if (typeof value !== "string") {
 			return { valid: false, message: "system.grid_auto_save_layout_scope must be a string" };
 		}
 		const v = value.toLowerCase();
 		if (!['user','tenant','global'].includes(v)) {
 			return { valid: false, message: "grid_auto_save_layout_scope must be one of: user, tenant, global" };
 		}
 		return { valid: true };
 	},

	"system.developer_dashboard_permission": (value) => {
		if (typeof value !== "string" || value.trim().length === 0) {
			return { valid: false, message: "Developer dashboard permission must be a non-empty string" };
		}
		return { valid: true };
	},

	// Security domain validators
	"security.report_unhandled_errors": (value) => {
		if (typeof value !== "boolean") {
			return { valid: false, message: "security.report_unhandled_errors must be boolean" };
		}
		return { valid: true };
	},

	"security.expose_global_namespace": (value, context) => {
		if (typeof value !== "boolean") {
			return { valid: false, message: "security.expose_global_namespace must be boolean" };
		}
		if (value === true && context.environment === "production") {
			return { valid: false, message: "Exposing global namespace is disallowed in production" };
		}
		return { valid: true };
	},

	"security.policy_admin_permission": (value) => {
		if (typeof value !== "string" || value.trim().length === 0) {
			return { valid: false, message: "security.policy_admin_permission must be a non-empty string" };
		}
		return { valid: true };
	},

	"security.allow_client_policy_updates": (value, context) => {
		if (typeof value !== "boolean") {
			return { valid: false, message: "security.allow_client_policy_updates must be boolean" };
		}
		if (value === true && context.environment === "production") {
			return { valid: false, message: "Client-side policy updates are disallowed in production" };
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
			return { valid: false, message: "Bind bridge flag must be boolean" };
		}
		return { valid: true };
	},
	// UI feature flags
	"ui.enable_virtual_list": (value) => {
		if (typeof value !== "boolean") {
			return { valid: false, message: "enable_virtual_list must be boolean" };
		}
		return { valid: true };
	},
	"ui.enable_security_hud": (value) => {
		if (typeof value !== "boolean") {
			return { valid: false, message: "enable_security_hud must be boolean" };
		}
		return { valid: true };
	},
	"ui.bind_bridge_update_inputs": (value) => {
		if (typeof value !== "boolean") {
			return { valid: false, message: "Bind bridge input update flag must be boolean" };
		}
		return { valid: true };
	},

	// Security policy: allow unsigned audits in dev only
	"security.allow_unsigned_audit_in_dev": (value, context) => {
		if (typeof value !== "boolean") {
			return { valid: false, message: "allow_unsigned_audit_in_dev must be boolean" };
		}
		if (value === true && String(context?.environment).toLowerCase() === "production") {
			return { valid: false, message: "Unsigned audits are not allowed in production" };
		}
		return { valid: true };
	},

	// Grid feature flags
	"grid.enable_analytics": (value) => {
		if (typeof value !== "boolean") {
			return { valid: false, message: "grid.enable_analytics must be boolean" };
		}
		return { valid: true };
	},

	"grid.allowed_component_types": (value) => {
		if (!Array.isArray(value)) {
			return { valid: false, message: "grid.allowed_component_types must be an array of strings" };
		}
		if (value.some(v => typeof v !== "string" || !v.trim())) {
			return { valid: false, message: "grid.allowed_component_types entries must be non-empty strings" };
		}
		return { valid: true };
	},

	// Grid defaults validators
	"grid.default_columns": (value) => {
		if (!Number.isInteger(value) || value < 1 || value > 96) {
			return { valid: false, message: "grid.default_columns must be an integer between 1 and 96" };
		}
		return { valid: true };
	},
	"grid.default_min_w": (value) => {
		if (!Number.isInteger(value) || value < 1) {
			return { valid: false, message: "grid.default_min_w must be a positive integer" };
		}
		return { valid: true };
	},
	"grid.default_min_h": (value) => {
		if (!Number.isInteger(value) || value < 1) {
			return { valid: false, message: "grid.default_min_h must be a positive integer" };
		}
		return { valid: true };
	},
	"grid.default_max_w": (value, ctx) => {
		if (!Number.isInteger(value) || value < 1) {
			return { valid: false, message: "grid.default_max_w must be a positive integer" };
		}
		return { valid: true };
	},
	"grid.default_max_h": (value) => {
		if (!Number.isInteger(value) || value < 1) {
			return { valid: false, message: "grid.default_max_h must be a positive integer" };
		}
		return { valid: true };
	},

	// User domain validators
	"user.data_retention_days": (value) => {
		if (typeof value !== "number" || value < 30 || value > 2555) {
			// Max ~7 years
			return {
				valid: false,
				message: "User data retention must be between 30 and 2555 days",
			};
		}
		return { valid: true };
	},

	// Meta domain validators
	"meta.metrics_retention_days": (value) => {
		if (typeof value !== "number" || value < 7 || value > 730) {
			// Max 2 years
			return {
				valid: false,
				message: "Metrics retention must be between 7 and 730 days",
			};
		}
		return { valid: true };
	},
};

/**
 * Defines dependencies between policies, where enabling one requires another to be enabled.
 * @private
 * @type {object}
 */
const POLICY_DEPENDENCIES = {
	"system.enable_optimization": ["system.enable_monitoring"],
	"system.enable_debug_mode": ["system.enable_auditing"],
	"events.enable_event_replay": ["events.enable_event_logging"],
	"user.enable_preference_sync": ["user.enable_session_tracking"],
	"meta.enable_capacity_planning": ["meta.enable_performance_tracking"],
};

/**
 * @class SystemPolicies
 * @classdesc Manages system-wide policies with a multi-tier caching strategy (in-memory, state manager, localStorage, API)
 * to ensure high performance and resilience. It handles loading, validation, persistence, and background synchronization of policies.
 * @privateFields {#stateManager, #metrics, #errorHelpers, #forensicLogger, #config, #policies, #cache}
 */
export class SystemPolicies {
	// V8.0 Parity: Declare all private fields at the top of the class.
	/** @private @type {import('./HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/** @private @type {import('./ForensicLogger.js').ForensicLogger|null} */
	#forensicLogger = null;
	/** @private @type {object} */
	#config;
	/** @private @type {object|null} */
	#policies = null;
	/** @private @type {import('../utils/LRUCache.js').LRUCache|null} */
	#cache = null;

	/**
	 * @param {object} context - The application context provided by the manager loader.
	 * @param {import('./HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
		this.#config = stateManager.config.policiesConfig || {};

		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from the stateManager in the constructor.
		this.#metrics =
			this.#stateManager.metricsRegistry?.namespace("systemPolicies");
		this.#errorHelpers = this.#stateManager.managers.errorHelpers;
		this.#forensicLogger = this.#stateManager.managers.forensicLogger;
	}

	/**
	 * Initializes the policy system by setting up caching and loading policies.
	 * @returns {Promise<void>}
	 */
	async initialize() {
		const cacheManager = this.#stateManager.managers.cacheManager;

		// V8.0 Parity: Use the central CacheManager to get a dedicated cache instance.
		if (cacheManager) {
			this.#cache = cacheManager.getCache("systemPolicies", {
				ttl: this.#config.cacheTTL || 300000, // 5 minutes default
				onEvict: (key, value, reason) => {
					console.log(`Policy cache eviction: ${key} (${reason})`);
					this.#metrics?.increment("cacheEvictions");
				},
				onExpire: (key) => {
					console.log(`Policy cache expiration: ${key}`);
					this.#backgroundRefresh(key);
				},
			});
		}

		try {
			// Load policies with caching
			await this.loadPolicies();

			// Validate all policies
			if (this.#config.validationEnabled !== false) {
				await this.#validateAllPolicies();
			}

			// Set up background sync if API is available
			if (
				this.#config.persistenceEnabled !== false &&
				this.#config.apiEndpoint
			) {
				this.#setupBackgroundSync(this.#config.syncInterval || 60000); // 1 minute default
			}

			console.log("SystemPolicies initialized:", {
				environment: this.#config.environment || "development",
				validation: this.#config.validationEnabled !== false,
				persistence: this.#config.persistenceEnabled !== false,
				domains: Object.keys(this.#policies),
				cacheEnabled: !!this.#cache,
				apiEndpoint: this.#config.apiEndpoint,
			});
		} catch (error) {
			console.error("Failed to initialize SystemPolicies:", error);
			// Fall back to defaults
			this.#policies = JSON.parse(JSON.stringify(DEFAULT_POLICIES));
		}
	}

	/**
	 * Loads policies using a multi-tier caching strategy: memory, persistent storage, and finally API.
	 * @returns {Promise<void>}
	 */
	async loadPolicies() {
		return this.#errorHelpers?.tryOr(
			async () => {
				// Tier 1: Memory cache
				const cached = this.getCachedPolicies();
				if (cached) {
					this.#policies = cached;
					this.#metrics?.increment("cacheHits");
					console.log("Policies loaded from memory cache");
					return;
				}

				// Tier 2: Persistent storage (via HybridStateManager)
				if (
					this.#config.persistenceEnabled !== false &&
					this.#stateManager.storage.ready
				) {
					const stored =
						await this.#stateManager.storage.instance.get(
							"system_settings",
							"system_policies"
						);
					if (stored?.policies) {
						this.#policies = this.#mergePolicies(
							DEFAULT_POLICIES,
							stored.policies
						);
						this.setCachedPolicies(this.#policies);
						this.#metrics?.increment("cacheMisses"); // A miss for memory cache, but a hit for persistent storage
						console.log("Policies loaded from persistent storage");
						return;
					}
				}

				// Tier 4: API fetch (if available)
				if (this.#config.apiEndpoint) {
					try {
						const apiPolicies = await this.#fetchPoliciesFromAPI();
						this.#policies = this.#mergePolicies(
							DEFAULT_POLICIES,
							apiPolicies
						);
						this.setCachedPolicies(this.#policies);
						await this.savePolicies();
						this.#metrics?.increment("apiCalls");
						console.log("Policies loaded from API");
						return;
					} catch (apiError) {
						console.warn(
							"Failed to load policies from API:",
							apiError
						);
					}
				}

				// Fallback: Use defaults
				this.#policies = JSON.parse(JSON.stringify(DEFAULT_POLICIES));
				this.setCachedPolicies(this.#policies);
				await this.savePolicies();
				console.log("Policies initialized with defaults");
			},
			null,
			{
				component: "SystemPolicies",
				operation: "loadPolicies",
			}
		);
	}

	/**
	 * Registers multiple policy definitions at once.
	 * @param {object} definitions - An object where keys are policy paths (e.g., 'system.new_policy') and values are definition objects.
	 */
	registerPolicyDefinitions(definitions) {
		for (const [key, definition] of Object.entries(definitions)) {
			// This is a simplified registration. A real implementation might merge into DEFAULT_POLICIES
			// or a separate definitions map before loading.
			const [domain, policyKey] = key.split(".");
			if (domain && policyKey && !this.#policies[domain]?.[policyKey]) {
				if (!this.#policies[domain]) this.#policies[domain] = {};
				this.#policies[domain][policyKey] = definition.default;
			}
		}
	}

	/**
	 * Registers multiple policy validators at once.
	 * @param {object} validators - An object where keys are policy paths and values are validator functions.
	 */
	registerPolicyValidators(validators) {
		Object.assign(POLICY_VALIDATORS, validators);
	}

	/**
	 * Retrieves the full policies object from the in-memory cache.
	 * @returns {object|null} The cached policies object, or null if not found.
	 */
	getCachedPolicies() {
		if (!this.#cache) return null;
		return this.#cache.get("system_policies");
	}

	/**
	 * Sets the full policies object in the in-memory cache.
	 * @param {object} policies - The policies object to cache.
	 */
	setCachedPolicies(policies) {
		if (!this.#cache) return;
		this.#cache.set(
			"system_policies",
			JSON.parse(JSON.stringify(policies))
		);
	}

	/**
	 * Invalidates all policy-related caches (in-memory and StateManager).
	 */
	invalidateCache() {
		if (this.#cache) {
			this.#cache.delete("system_policies");
		}
	}

	/**
	 * Saves the current policies to all configured persistence layers (cache, localStorage, API).
	 * @returns {Promise<void>}
	 */
	async savePolicies() {
		if (this.#config.persistenceEnabled === false || !this.#policies)
			return;

		try {
			// Save to memory cache
			this.setCachedPolicies(this.#policies);

			// Save to persistent storage
			if (this.#stateManager.storage.ready) {
				await this.#stateManager.storage.instance.put(
					"system_settings",
					{
						id: "system_policies",
						policies: this.#policies,
						updatedAt: new Date().toISOString(),
					}
				);
			}

			// Save to API (async, don't block)
			if (this.#config.apiEndpoint) {
				this.#savePoliciesAPI(this.#policies).catch((error) => {
					console.error("Background API save failed:", error);
				});
			}

			// Emit save event
			this.#emitPolicyEvent("policies_saved", {
				timestamp: new Date().toISOString(),
				domains: Object.keys(this.#policies),
			});
		} catch (error) {
			console.error("Failed to save policies:", error);
		}
	}

	/**
	 * Gets a copy of all current policies, prioritizing the cache.
	 * @returns {object} The full policies object.
	 */
	getAllPolicies() {
		// Try cache first
		const cached = this.getCachedPolicies();
		if (cached) {
			this.#metrics?.increment("cacheHits");
			return JSON.parse(JSON.stringify(cached));
		}

		// Fallback to loaded policies
		this.#metrics?.increment("cacheMisses");
		return this.#policies ? JSON.parse(JSON.stringify(this.#policies)) : {};
	}

	/**
	 * Gets all policies for a specific domain, with caching.
	 * @param {string} domain - The domain to retrieve policies for (e.g., 'ui', 'system').
	 * @returns {object} An object containing the policies for the specified domain.
	 */
	getDomainPolicies(domain) {
		const cacheKey = `domain_policies_${domain}`;

		// Check cache first
		if (this.#cache) {
			const cached = this.#cache.get(cacheKey);
			if (cached) {
				this.#metrics?.increment("cacheHits");
				return { ...cached };
			}
		}

		// Generate and cache result
		const result = this.#policies?.[domain]
			? { ...this.#policies[domain] }
			: {};

		if (this.#cache) {
			this.#cache.set(cacheKey, result, 60000); // 1 minute TTL for domain-specific cache
		}

		this.#metrics?.increment("cacheMisses");
		return result;
	}

	/**
	 * Gets the value of a specific policy, with caching.
	 * @param {string} domain - The domain of the policy.
	 * @param {string} key - The key of the policy.
	 * @returns {*} The value of the policy, or undefined if not found.
	 */
	getPolicy(domain, key) {
		const cacheKey = `policy_${domain}_${key}`;

		// Check cache first
		if (this.#cache) {
			const cached = this.#cache.get(cacheKey);
			if (cached !== undefined) {
				this.#metrics?.increment("cacheHits");
				return JSON.parse(JSON.stringify(cached));
			}
		}

		// Generate and cache result
		const result = this.#policies?.[domain]?.[key];

		if (this.#cache) {
			this.#cache.set(cacheKey, result, 30000); // 30 seconds TTL for individual policies
		}

		this.#metrics?.increment("cacheMisses");
		return result;
	}

	/**
	 * Updates a specific policy value, performs validation, checks dependencies, and persists the change.
	 * @param {string} domain - The domain of the policy to update.
	 * @param {string} key - The key of the policy to update.
	 * @param {*} value - The new value for the policy.
	 * @param {object} [context={}] - Additional context for validation.
	 * @returns {Promise<void>}
	 */
	async update(domain, key, value, context = {}) {
		if (!this.#policies) {
			throw new Error("Policies not initialized");
		}

		const policyPath = `${domain}.${key}`;

		// Validate the update
		if (this.#config.validationEnabled !== false) {
			const validation = this.#validatePolicy(policyPath, value, context);
			if (!validation.valid) {
				throw new Error(
					`Policy validation failed: ${validation.message}`
				);
			}
		}

		// Check dependencies
		const depCheck = this.#checkDependencies(domain, key, value);
		if (!depCheck.valid) {
			throw new Error(
				`Policy dependency check failed: ${depCheck.message}`
			);
		}

		// Store old value for rollback
		const oldValue = this.#policies[domain]?.[key];

		try {
			// Update the policy
			if (!this.#policies[domain]) {
				this.#policies[domain] = {};
			}
			this.#policies[domain][key] = value;

			// Invalidate related cache entries
			this.#invalidatePolicyCache(domain, key); // Corrected to be a private method call

			// Save to persistent storage
			await this.savePolicies();

			// V8.0 Parity: Mandate 2.4 - Log the policy change as a forensic event.
			await this.#forensicLogger?.logAuditEvent(
				"POLICY_UPDATED",
				{
					policy: policyPath,
					oldValue,
					newValue: value,
				},
				context
			);

			// Emit change event
			this.#emitPolicyEvent("policy_updated", {
				domain,
				key,
				oldValue,
				newValue: value,
				timestamp: new Date().toISOString(),
				context,
			});

			console.log(`Policy updated: ${policyPath} = ${value}`);
		} catch (error) {
			// Rollback on failure
			if (oldValue !== undefined) {
				this.#policies[domain][key] = oldValue;
			} else {
				delete this.#policies[domain][key];
			}

			// Re-invalidate cache to ensure consistency
			this.#invalidatePolicyCache(domain, key); // Corrected to be a private method call

			throw error;
		}
	}

	/**
	 * Retrieves performance metrics related to the caching system.
	 * @returns {object} An object containing cache metrics.
	 */
	getCacheMetrics() {
		const cacheStats = this.#cache ? this.#cache.getStatistics() : null;

		return {
			...this.#metrics?.getAllAsObject(),
			cacheStatistics: cacheStats,
		};
	}

	/**
	 * Forces a full refresh of policies from the API, bypassing all caches.
	 * @returns {Promise<void>}
	 */
	async forceRefresh() {
		console.log("Force refreshing policies from API...");

		// Clear all caches
		this.invalidateCache();
		localStorage.removeItem("system_policies");
		localStorage.removeItem("system_policies_modified");

		// Reload policies
		await this.loadPolicies();

		this.#emitPolicyEvent("policies_force_refreshed", {
			timestamp: new Date().toISOString(),
		});
	}

	/**
	 * Gets the list of dependencies for a specific policy.
	 * @param {string} domain - The domain of the policy.
	 * @param {string} key - The key of the policy.
	 * @returns {string[]} An array of dependency policy paths.
	 */
	getPolicyDependencies(domain, key) {
		const policyPath = `${domain}.${key}`;
		return POLICY_DEPENDENCIES[policyPath] || [];
	}

	/**
	 * Retrieves statistics about the current state of all policies.
	 * @returns {object|null} An object containing policy statistics, or null if not initialized.
	 */
	getStatistics() {
		if (!this.#policies) return null;

		const stats = {
			totalDomains: Object.keys(this.#policies).length,
			totalPolicies: 0,
			enabledPolicies: 0,
			domainStats: {},
			cacheMetrics: this.getCacheMetrics(),
		};

		for (const [domain, domainPolicies] of Object.entries(this.#policies)) {
			const domainCount = Object.keys(domainPolicies).length;
			const enabledCount =
				Object.values(domainPolicies).filter(Boolean).length;

			stats.totalPolicies += domainCount;
			stats.enabledPolicies += enabledCount;

			stats.domainStats[domain] = {
				total: domainCount,
				enabled: enabledCount,
				disabled: domainCount - enabledCount,
			};
		}

		return stats;
	}

	/**
	 * Cleans up resources, such as caches and listeners, when the system is shut down.
	 */
	cleanup() {
		if (this.#cache) {
			// The cache is managed by CacheManager, so we don't destroy it here, just clear our reference.
			this.#cache = null;
		}
		this.#policies = null;
	}

	// --- Private Helper Methods ---

	/**
	 * Fetches the latest policies from the remote API endpoint.
	 * @private
	 * @returns {Promise<object>} The policies object from the API.
	 */
	async #fetchPoliciesFromAPI() {
		const response = await fetch(this.#config.apiEndpoint, {
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
	}

	/**
	 * Saves the current policies to the remote API endpoint.
	 * @private
	 * @param {object} policies - The policies object to save.
	 * @returns {Promise<void>}
	 */
	async #savePoliciesAPI(policies) {
		if (!this.#config.apiEndpoint) return;

		try {
			const response = await fetch(this.#config.apiEndpoint, {
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

			console.log("Policies saved to API successfully");
		} catch (error) {
			console.error("Failed to save policies to API:", error);
			throw error;
		}
	}

	/**
	 * Triggers a background refresh of policies when a cache entry expires.
	 * @private
	 * @param {string} key - The cache key that expired.
	 * @returns {Promise<void>}
	 */
	async #backgroundRefresh(key) {
		if (key === "system_policies") {
			try {
				console.log("Background refresh triggered for policies");
				this.#metrics?.increment("backgroundRefreshes");
				await this.loadPolicies();
				this.#emitPolicyEvent("policies_refreshed", {
					timestamp: new Date().toISOString(),
					trigger: "background_refresh",
				});
			} catch (error) {
				this.#metrics?.increment("backgroundRefreshErrors");
				console.error("Background refresh failed:", error);
			}
		}
	}

	/**
	 * Sets up a periodic interval to check for policy updates from the server.
	 * @private
	 * @param {number} interval - The synchronization interval in milliseconds.
	 */
	#setupBackgroundSync(interval) {
		setInterval(async () => {
			try {
				const cacheAge = this.#cache
					? this.#cache.getAge("system_policies")
					: Infinity;

				if (cacheAge > 300000) {
					// 5 minutes
					await this.loadPolicies();
				}
			} catch (error) {
				console.error("Background sync failed:", error);
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
		this.#cache.delete(`policy_${domain}_${key}`);

		// Invalidate domain cache
		this.#cache.delete(`domain_policies_${domain}`);

		// Invalidate main policies cache
		this.#cache.delete("system_policies");
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
	 * Deeply merges a stored policies object into a defaults object.
	 * @private
	 * @param {object} defaults - The default policies object.
	 * @param {object} stored - The stored policies object to merge.
	 * @returns {object} The merged policies object.
	 */
	#mergePolicies(defaults, stored) {
		const merged = JSON.parse(JSON.stringify(defaults));

		for (const [domain, domainPolicies] of Object.entries(stored)) {
			if (merged[domain]) {
				Object.assign(merged[domain], domainPolicies);
			} else {
				merged[domain] = domainPolicies;
			}
		}

		return merged;
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
	}

	/**
	 * Validates all loaded policies against their validators.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #validateAllPolicies() {
		for (const domain in this.#policies) {
			for (const key in this.#policies[domain]) {
				const policyPath = `${domain}.${key}`;
				const value = this.#policies[domain][key];
				this.#validatePolicy(policyPath, value);
			}
		}
	}
}

export default SystemPolicies;
