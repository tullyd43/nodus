/**
 * @file TenantPolicyService.js
 * @version 8.0.0 - ENTERPRISE OBSERVABILITY MIGRATION
 * @description Multi-tenant policy service with automatic observability compliance.
 * Manages per-tenant policy overrides layered on top of SystemPolicies with complete audit trails.
 *
 * All policy operations are automatically instrumented through ActionDispatcher for
 * complete compliance audit trails and tenant policy governance.
 *
 * Key Features:
 * - Automatic observation of all policy access and mutations
 * - Multi-tenant policy isolation with complete audit trails
 * - Performance-optimized caching with bounded LRU eviction
 * - Zero-tolerance policy violations with automatic escalation
 *
 * @see {@link NODUS_DEVELOPER_MIGRATION_GUIDE.md} - Policy service observability requirements
 */

/**
 * @typedef {Object} PolicyOverride
 * @property {string} domain - Policy domain
 * @property {string} key - Policy key
 * @property {any} value - Policy value
 * @property {string} tenantId - Tenant identifier
 * @property {number} timestamp - Override timestamp
 */

/**
 * @typedef {Object} PolicyOperationResult
 * @property {boolean} success - Whether operation succeeded
 * @property {any} [value] - Policy value (for get operations)
 * @property {string} [reason] - Failure reason if applicable
 * @property {number} timestamp - Operation timestamp
 */

/**
 * Multi-tenant policy service with automatic observability and compliance auditing.
 *
 * Manages per-tenant policy overrides with complete audit trails for governance
 * and compliance requirements. All operations are automatically instrumented
 * for defense-grade policy management.
 *
 * @class TenantPolicyService
 */
export class TenantPolicyService {
	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('../services/cache/CacheManager.js').LRUCache} */
	#cache;
	/** @private @type {string} */
	#STORE = "system_settings";
	/** @private @type {ReturnType<import('@shared/lib/async/AsyncOrchestrationService.js').AsyncOrchestrationService["createRunner"]>} */
	#runOrchestrated;

	/**
	 * Creates an instance of TenantPolicyService with enterprise observability integration.
	 *
	 * @param {Object} context - Configuration context
	 * @param {import('../HybridStateManager.js').default} context.stateManager - State manager instance
	 * @throws {Error} If stateManager or required services are missing
	 */
	constructor({ stateManager }) {
		if (!stateManager) {
			throw new Error(
				"TenantPolicyService requires stateManager for observability compliance"
			);
		}

		this.#stateManager = stateManager;

		// Enterprise license validation for multi-tenant policies
		this.#validateEnterpriseLicense();

		// Initialize bounded cache for tenant policies
		this.#cache = stateManager.managers?.cacheManager?.getCache(
			"tenantPolicies",
			{
				maxSize: 100,
				ttl: 30000, // 30 second TTL
			}
		);

		// Initialize orchestrated runner for all policy operations
		const orchestrator = this.#stateManager.managers?.asyncOrchestrator;
		if (!orchestrator) {
			throw new Error(
				"AsyncOrchestrationService required for TenantPolicyService observability compliance"
			);
		}

		this.#runOrchestrated = orchestrator.createRunner({
			labelPrefix: "security.tenant_policy",
			actorId: "tenant_policy_service",
			eventType: "TENANT_POLICY_OPERATION",
			meta: {
				component: "TenantPolicyService",
			},
		});
	}

	/**
	 * Initializes the tenant policy service.
	 * Operations are orchestrated for complete observability.
	 *
	 * @returns {void}
	 */
	initialize() {
		// Emit initialization event
		this.#stateManager.emit?.(
			"security.tenant_policy_service_initialized",
			{
				cacheEnabled: !!this.#cache,
				storeName: this.#STORE,
				timestamp: Date.now(),
				component: "TenantPolicyService",
			}
		);
	}

	/**
	 * Gets a policy value for a specific tenant with automatic observation.
	 *
	 * @param {string} domain - Policy domain
	 * @param {string} key - Policy key
	 * @param {string} [tenantId=null] - Explicit tenant ID
	 * @returns {Promise<any>} Policy value or undefined
	 */
	async getPolicy(domain, key, tenantId = null) {
		if (!domain || !key) {
			return undefined;
		}

		/* PERFORMANCE_BUDGET: 5ms */
		return this.#runOrchestrated(
			() => this.#executeGetPolicy(domain, key, tenantId),
			{
				labelSuffix: "getPolicy",
				eventType: "TENANT_POLICY_GET",
				meta: { domain, key, hasTenantId: !!tenantId },
			}
		);
	}

	/**
	 * Sets a policy value for a specific tenant with automatic observation.
	 *
	 * @param {string} domain - Policy domain
	 * @param {string} key - Policy key
	 * @param {any} value - Policy value
	 * @param {string} [tenantId=null] - Explicit tenant ID
	 * @returns {Promise<boolean>} Success status
	 */
	async setPolicy(domain, key, value, tenantId = null) {
		if (!domain || !key) {
			return false;
		}

		/* PERFORMANCE_BUDGET: 15ms */
		return this.#runOrchestrated(
			() => this.#executeSetPolicy(domain, key, value, tenantId),
			{
				labelSuffix: "setPolicy",
				eventType: "TENANT_POLICY_SET",
				meta: {
					domain,
					key,
					operation:
						value === undefined || value === null
							? "delete"
							: "set",
					hasTenantId: !!tenantId,
				},
			}
		);
	}

	/**
	 * Gets comprehensive policy service metrics.
	 *
	 * @returns {Object} Policy service metrics and statistics
	 */
	getPolicyMetrics() {
		return {
			component: "TenantPolicyService",
			cacheSize: this.#cache?.size || 0,
			cacheHitRate: this.#cache?.stats?.hitRate || 0,
			storeName: this.#STORE,
			isInitialized: true,
			lastOperationTime: Date.now(),
		};
	}

	// ===== PRIVATE IMPLEMENTATION METHODS =====

	/**
	 * Validates enterprise license for multi-tenant policy features.
	 *
	 * @private
	 * @throws {Error} If required enterprise license is missing
	 */
	#validateEnterpriseLicense() {
		const license = this.#stateManager.managers?.license;

		if (!license?.hasFeature("multi_tenant_policies")) {
			// Emit license validation failure
			this.#stateManager.emit?.("security.license_validation_failed", {
				feature: "multi_tenant_policies",
				tier: "enterprise",
				component: "TenantPolicyService",
				error: "Missing required enterprise license feature",
				timestamp: Date.now(),
			});

			throw new Error(
				"Multi-tenant policy management requires enterprise license"
			);
		}

		// Emit successful license validation
		this.#stateManager.emit?.("security.license_validated", {
			feature: "multi_tenant_policies",
			tier: "enterprise",
			component: "TenantPolicyService",
			timestamp: Date.now(),
		});
	}

	/**
	 * Executes policy retrieval with access control and audit trail.
	 *
	 * @private
	 * @param {string} domain - Policy domain
	 * @param {string} key - Policy key
	 * @param {string} tenantId - Tenant identifier
	 * @returns {Promise<any>}
	 */
	#executeGetPolicy(domain, key, tenantId) {
		const tid = this.#resolveTenantId(tenantId);
		if (!tid) {
			this.#stateManager.emit?.("security.policy_access_denied", {
				domain,
				key,
				reason: "no_tenant_context",
				timestamp: Date.now(),
				component: "TenantPolicyService",
			});
			return Promise.resolve(undefined);
		}

		// Emit policy access attempt
		this.#stateManager.emit?.("security.policy_access_attempt", {
			domain,
			key,
			tenantId: tid,
			timestamp: Date.now(),
			component: "TenantPolicyService",
		});

		// Check if policy is exposed to tenants
		const systemPolicies = this.#stateManager.managers?.systemPolicies;
		if (systemPolicies?.isPolicyExposedToTenants) {
			if (!systemPolicies.isPolicyExposedToTenants(domain, key)) {
				this.#stateManager.emit?.("security.policy_access_denied", {
					domain,
					key,
					tenantId: tid,
					reason: "internal_policy",
					timestamp: Date.now(),
					component: "TenantPolicyService",
				});
				return undefined;
			}
		}

		return this.#loadTenantData(tid).then((data) => {
			const value = data?.overrides?.[`${domain}.${key}`];

			// Emit policy access result
			this.#stateManager.emit?.("security.policy_accessed", {
				domain,
				key,
				tenantId: tid,
				hasValue: value !== undefined,
				timestamp: Date.now(),
				component: "TenantPolicyService",
			});

			return value;
		});
	}

	/**
	 * Executes policy mutation with validation and audit trail.
	 *
	 * @private
	 * @param {string} domain - Policy domain
	 * @param {string} key - Policy key
	 * @param {any} value - Policy value
	 * @param {string} tenantId - Tenant identifier
	 * @returns {Promise<boolean>}
	 * @throws {Error} If enterprise license required for tenant policy management
	 */
	#executeSetPolicy(domain, key, value, tenantId) {
		const tid = this.#resolveTenantId(tenantId);
		if (!tid) {
			this.#stateManager.emit?.("security.policy_mutation_denied", {
				domain,
				key,
				reason: "no_tenant_context",
				timestamp: Date.now(),
				component: "TenantPolicyService",
			});
			return false;
		}

		return this.#runOrchestrated(
			"executeSetPolicy",
			() => this.#performSetPolicy(domain, key, value, tid),
			{
				labelSuffix: "setPolicy",
				eventType: "TENANT_POLICY_SET",
				meta: {
					domain,
					key,
					operation:
						value === undefined || value === null
							? "delete"
							: "set",
					hasTenantId: !!tenantId,
				},
			}
		);
	}

	#performSetPolicy(domain, key, value, tid) {
		// This logic was moved from #executeSetPolicy to be wrapped by the orchestrator.
		const operation =
			value === undefined || value === null ? "delete" : "set";

		// Emit policy mutation attempt
		this.#stateManager.emit?.("security.policy_mutation_attempt", {
			domain,
			key,
			tenantId: tid,
			operation,
			licenseValidated: true,
			timestamp: Date.now(),
			component: "TenantPolicyService",
		});

		// Validate policy can be set by tenants
		const systemPolicies = this.#stateManager.managers?.systemPolicies;
		if (systemPolicies?.isPolicyExposedToTenants) {
			if (!systemPolicies.isPolicyExposedToTenants(domain, key)) {
				this.#stateManager.emit?.("security.policy_mutation_denied", {
					domain,
					key,
					tenantId: tid,
					reason: "internal_policy",
					timestamp: Date.now(),
					component: "TenantPolicyService",
				});
				return false;
			}
		}

		return this.#loadTenantData(tid)
			.then((data) => {
				data.overrides = data.overrides || {};

				const previousValue = data.overrides[`${domain}.${key}`];

				// Apply mutation
				if (operation === "delete") {
					delete data.overrides[`${domain}.${key}`];
				} else {
					data.overrides[`${domain}.${key}`] = value;
				}

				// Update cache
				const cacheKey = this.#getCacheKey(tid);
				this.#cache?.set(cacheKey, data);

				// Persist to storage if available
				if (this.#stateManager.storage?.ready) {
					return this.#stateManager.storage.instance
						.put(this.#STORE, {
							id: cacheKey,
							...data,
						})
						.then(() => ({ data, previousValue })); // Pass data to the next .then()
				}
				// Pass both data and previousValue to the next step
				return Promise.resolve({ data, previousValue });
			})
			.then(({ previousValue }) => {
				// Emit successful mutation
				this.#stateManager.emit?.("security.policy_mutated", {
					domain,
					key,
					tenantId: tid,
					operation,
					previousValue,
					newValue: value,
					timestamp: Date.now(),
					component: "TenantPolicyService",
				});

				// Legacy event for compatibility
				this.#stateManager.emit?.("policyEvent", {
					type: "tenant_policy_updated",
					data: { tenantId: tid, domain, key, value },
				});

				return true;
			})
			.catch((error) => {
				// Emit operation failure
				this.#stateManager.emit?.("security.policy_operation_failed", {
					domain,
					key,
					tenantId: tid,
					operation,
					error: error.message,
					timestamp: Date.now(),
					component: "TenantPolicyService",
				});

				return false;
			});
	}

	/**
	 * Resolves tenant ID from explicit parameter or current context.
	 *
	 * @private
	 * @param {string|null} explicitTenantId - Explicitly provided tenant ID
	 * @returns {string|null} Resolved tenant ID
	 */
	#resolveTenantId(explicitTenantId) {
		if (explicitTenantId) {
			return explicitTenantId;
		}

		try {
			const securityManager =
				this.#stateManager.managers?.securityManager;
			return securityManager?.getSubject()?.tenantId || null;
		} catch {
			return null;
		}
	}

	/**
	 * Generates cache key for tenant policy data.
	 *
	 * @private
	 * @param {string} tenantId - Tenant identifier
	 * @returns {string} Cache key
	 */
	#getCacheKey(tenantId) {
		return `tenant_policies:${tenantId}`;
	}

	/**
	 * Loads tenant policy data with caching and fallback handling.
	 *
	 * @private
	 * @param {string} tenantId - Tenant identifier
	 * @returns {Promise<Object>} Tenant policy data
	 */
	#loadTenantData(tenantId) {
		if (!tenantId) {
			return Promise.resolve({ overrides: {} });
		}

		const cacheKey = this.#getCacheKey(tenantId);

		// Check cache first
		const cached = this.#cache?.get(cacheKey);
		if (cached) {
			this.#stateManager.emit?.("observability.cache_hit", {
				cache: "tenantPolicies",
				key: cacheKey,
				timestamp: Date.now(),
				component: "TenantPolicyService",
			});
			return Promise.resolve(cached);
		}

		// Cache miss - load from storage
		this.#stateManager.emit?.("observability.cache_miss", {
			cache: "tenantPolicies",
			key: cacheKey,
			timestamp: Date.now(),
			component: "TenantPolicyService",
		});

		if (!this.#stateManager.storage?.ready) {
			return Promise.resolve({ overrides: {} });
		}

		return this.#stateManager.storage.instance
			.get(this.#STORE, cacheKey)
			.then((record) => {
				const data = record || { id: cacheKey, overrides: {} };

				// Cache the loaded data
				this.#cache?.set(cacheKey, data);

				return data;
			})
			.catch((error) => {
				// Emit storage error but continue with empty data
				this.#stateManager.emit?.("security.policy_storage_error", {
					tenantId,
					error: error.message,
					timestamp: Date.now(),
					component: "TenantPolicyService",
				});

				return { overrides: {} };
			});
	}
}

export default TenantPolicyService;
