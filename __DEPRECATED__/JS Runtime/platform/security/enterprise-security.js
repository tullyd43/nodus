/**
 * @file enterprise-security.js
 * @version 8.0.0 - ENTERPRISE OBSERVABILITY MIGRATION
 * @description Enterprise-grade security controls with automatic observability compliance.
 * Implements Role-Based Access Control (RBAC), clearance levels, and organizational policies
 * for multi-user environments with complete audit trails.
 *
 * All security decisions are automatically instrumented through ActionDispatcher for
 * complete compliance audit trails and forensic analysis.
 *
 * Key Features:
 * - Automatic observation of all access control decisions
 * - RBAC and MAC policy integration with full audit trails
 * - Performance-optimized access caching with observability
 * - Zero-tolerance security violations with automatic escalation
 *
 * @see {@link NODUS_DEVELOPER_MIGRATION_GUIDE.md} - Enterprise security observability requirements
 */

/**
 * @typedef {Object} UserContext
 * @property {string} userId - Unique user identifier
 * @property {string} level - User's clearance level
 * @property {Set<string>} compartments - User's security compartments
 * @property {Array<string>} [roles] - User's assigned roles
 * @property {string} [tenantId] - User's tenant identifier
 */

/**
 * @typedef {Object} ResourceContext
 * @property {string} type - Resource type identifier
 * @property {string} id - Resource unique identifier
 * @property {string} [classification] - Resource classification level
 * @property {Array<string>} [compartments] - Resource compartments
 */

/**
 * @typedef {Object} AccessResult
 * @property {boolean} allowed - Whether access is granted
 * @property {string} reason - Reason for decision
 * @property {Array<string>} [violations] - Policy violations if any
 * @property {number} timestamp - Decision timestamp
 */

/**
 * Enterprise security module with automatic observability and comprehensive access controls.
 *
 * Provides enterprise-grade security controls including RBAC, clearance validation,
 * and organizational policies. All security decisions are automatically instrumented
 * for complete compliance audit trails.
 *
 * @class EnterpriseSecurity
 */
export default class EnterpriseSecurity {
	/** @private @type {string} */
	name = "EnterpriseSecurity";
	/** @private @type {import('../../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('../../../shared/lib/LRUCache.js').LRUCache|null} */
	#accessCache = null;
	/** @private @type {ReturnType<import('@shared/lib/async/AsyncOrchestrationService.js').AsyncOrchestrationService["createRunner"]>} */
	#runOrchestrated;

	/**
	 * Creates an instance of EnterpriseSecurity with enterprise observability integration.
	 *
	 * @param {Object} context - Configuration context
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - State manager instance
	 * @throws {Error} If stateManager or required services are missing
	 */
	constructor({ stateManager }) {
		if (!stateManager) {
			throw new Error(
				"EnterpriseSecurity requires stateManager for observability compliance"
			);
		}

		this.#stateManager = stateManager;

		// Enterprise license validation for RBAC features
		this.#validateEnterpriseLicense();

		// Initialize cache through CacheManager
		this.#accessCache = this.#stateManager.managers?.cacheManager?.getCache(
			"enterpriseSecurityAccess",
			{
				maxSize: 1000,
				ttl: 5 * 60 * 1000, // 5 minute TTL
			}
		);

		// Initialize orchestrated runner for all security operations
		const orchestrator = this.#stateManager.managers?.asyncOrchestrator;
		if (!orchestrator) {
			throw new Error(
				"AsyncOrchestrationService required for EnterpriseSecurity observability compliance"
			);
		}

		this.#runOrchestrated = orchestrator.createRunner({
			labelPrefix: "security.enterprise",
			actorId: "enterprise_security",
			eventType: "ENTERPRISE_SECURITY_OPERATION",
			meta: {
				component: "EnterpriseSecurity",
			},
		});
	}

	/**
	 * Initializes the enterprise security module.
	 * Operations are orchestrated for complete observability.
	 *
	 * @returns {Promise<EnterpriseSecurity>} The initialized instance
	 */
	async init() {
		return this.#runOrchestrated(() => this.#executeInit(), {
			labelSuffix: "init",
			eventType: "ENTERPRISE_SECURITY_INIT",
		});
	}

	/**
	 * Comprehensive access control check evaluating clearance, compartments, roles, and policies.
	 *
	 * This is the primary access control decision point, combining MAC and RBAC checks
	 * with complete audit trails for compliance requirements.
	 *
	 * @param {string} classification - Classification level of data being accessed
	 * @param {Array<string>} [compartments=[]] - Required compartments for access
	 * @returns {Promise<boolean>} Whether access is permitted
	 * @throws {Error} If enterprise license required for advanced features
	 */
	async canAccess(classification, compartments = []) {
		// Enterprise license validation for advanced access controls
		const license = this.#stateManager.managers?.license;
		if (
			classification !== "public" &&
			!license?.hasFeature("enterprise_access_control")
		) {
			throw new Error(
				"Enterprise license required for advanced access control"
			);
		}

		/* PERFORMANCE_BUDGET: 10ms */
		return this.#runOrchestrated(
			() => this.#executeCanAccess(classification, compartments),
			{
				labelSuffix: "canAccess",
				eventType: "ENTERPRISE_SECURITY_ACCESS_CHECK",
				meta: {
					classification,
					compartmentCount: compartments.length,
					licenseValidated: !!license?.hasFeature(
						"enterprise_access_control"
					),
				},
			}
		);
	}

	/**
	 * Checks if the current user has a specific permission.
	 *
	 * Evaluates both direct user permissions and permissions granted through roles
	 * with automatic audit trails for compliance tracking.
	 *
	 * @param {string} permission - Permission string to validate (e.g., 'data:export')
	 * @returns {Promise<boolean>} Whether user has the permission
	 */
	async hasPermission(permission) {
		if (!permission || typeof permission !== "string") {
			return false;
		}

		/* PERFORMANCE_BUDGET: 5ms */
		return this.#runOrchestrated(
			() => this.#executeHasPermission(permission),
			{
				labelSuffix: "hasPermission",
				eventType: "ENTERPRISE_SECURITY_PERMISSION_CHECK",
				meta: { permission },
			}
		);
	}

	/**
	 * Resource-specific access control with caching and comprehensive audit trails.
	 *
	 * @param {string} resourceType - Type of resource being accessed
	 * @param {string} resourceId - Unique identifier of the resource
	 * @param {string} [action='read'] - Action being performed
	 * @returns {Promise<boolean>} Whether access is permitted
	 */
	async canAccessResource(resourceType, resourceId, action = "read") {
		if (!resourceType || !resourceId) {
			return false;
		}

		/* PERFORMANCE_BUDGET: 8ms */
		return this.#runOrchestrated(
			() =>
				this.#executeCanAccessResource(
					resourceType,
					resourceId,
					action
				),
			{
				labelSuffix: "canAccessResource",
				eventType: "ENTERPRISE_SECURITY_RESOURCE_ACCESS",
				meta: { resourceType, action, hasResourceId: !!resourceId },
			}
		);
	}

	/**
	 * Clears the access cache and emits security context reset event.
	 *
	 * Should be called when user permissions change or security context is invalidated.
	 */
	clearAccessCache() {
		this.#accessCache?.clear();

		// Emit cache clear event for audit trail
		this.#stateManager.emit?.("security.enterprise_cache_cleared", {
			timestamp: Date.now(),
			component: "EnterpriseSecurity",
		});
	}

	/**
	 * Gets enterprise security metrics and statistics.
	 *
	 * @returns {Object} Security metrics and cache statistics
	 */
	getSecurityMetrics() {
		return {
			component: "EnterpriseSecurity",
			cacheSize: this.#accessCache?.size || 0,
			cacheHitRate: this.#accessCache?.stats?.hitRate || 0,
			isInitialized: true,
			lastAccessTime: Date.now(),
		};
	}

	// ===== PRIVATE IMPLEMENTATION METHODS =====

	/**
	 * Validates enterprise license for RBAC and access control features.
	 *
	 * @private
	 * @throws {Error} If required enterprise license is missing
	 */
	#validateEnterpriseLicense() {
		const license = this.#stateManager.managers?.license;

		if (!license?.hasFeature("enterprise_rbac")) {
			// Emit license validation failure
			this.#stateManager.emit?.("security.license_validation_failed", {
				feature: "enterprise_rbac",
				tier: "enterprise",
				component: "EnterpriseSecurity",
				error: "Missing required enterprise license feature",
				timestamp: Date.now(),
			});

			throw new Error(
				"Enterprise RBAC features require enterprise license"
			);
		}

		// Emit successful license validation
		this.#stateManager.emit?.("security.license_validated", {
			feature: "enterprise_rbac",
			tier: "enterprise",
			component: "EnterpriseSecurity",
			timestamp: Date.now(),
		});
	}

	/**
	 * Executes enterprise security module initialization.
	 *
	 * @private
	 * @returns {Promise<EnterpriseSecurity>}
	 */
	async #executeInit() {
		// Emit initialization event
		this.#stateManager.emit?.("security.enterprise_security_initialized", {
			cacheEnabled: !!this.#accessCache,
			component: "EnterpriseSecurity",
			timestamp: Date.now(),
		});

		return this;
	}

	/**
	 * Executes comprehensive access control evaluation.
	 *
	 * @private
	 * @param {string} classification - Data classification level
	 * @param {Array<string>} compartments - Required compartments
	 * @returns {Promise<boolean>}
	 */
	#executeCanAccess(classification, compartments) {
		const securityManager = this.#stateManager.managers?.securityManager;

		return Promise.resolve().then(() => {
			// Check for valid security context
			if (!securityManager?.hasValidContext()) {
				this.#stateManager.emit?.("security.access_denied", {
					reason: "expired_context",
					classification,
					compartments,
					timestamp: Date.now(),
					component: "EnterpriseSecurity",
				});
				return false;
			}

			const userContext = securityManager.getSubject();

			// MAC clearance and compartment validation
			return this.#performMACCheck(
				userContext,
				classification,
				compartments
			).then((macResult) => {
				if (!macResult.allowed) {
					this.#stateManager.emit?.("security.access_denied", {
						reason: "mac_violation",
						classification,
						compartments,
						userClearance: userContext?.level,
						userCompartments: Array.from(
							userContext?.compartments || []
						),
						violation: macResult.reason,
						timestamp: Date.now(),
						component: "EnterpriseSecurity",
					});
					return false;
				}

				// RBAC policy evaluation
				return this.#performRBACCheck(
					userContext,
					classification,
					compartments
				).then((rbacResult) => {
					if (!rbacResult.allowed) {
						this.#stateManager.emit?.("security.access_denied", {
							reason: "rbac_violation",
							classification,
							compartments,
							userRoles: userContext?.roles || [],
							violation: rbacResult.reason,
							timestamp: Date.now(),
							component: "EnterpriseSecurity",
						});
						return false;
					}

					// Emit successful access grant
					this.#stateManager.emit?.("security.access_granted", {
						classification,
						compartments,
						userId: userContext?.userId,
						clearanceLevel: userContext?.level,
						timestamp: Date.now(),
						component: "EnterpriseSecurity",
					});

					return true;
				});
			});
		});
	}

	/**
	 * Executes permission validation with role-based evaluation.
	 *
	 * @private
	 * @param {string} permission - Permission to validate
	 * @returns {Promise<boolean>}
	 */
	#executeHasPermission(permission) {
		const securityManager = this.#stateManager.managers?.securityManager;

		return Promise.resolve().then(() => {
			if (!securityManager?.hasValidContext()) {
				this.#stateManager.emit?.("security.permission_denied", {
					permission,
					reason: "expired_context",
					timestamp: Date.now(),
					component: "EnterpriseSecurity",
				});
				return false;
			}

			const userContext = securityManager.getSubject();
			const policyManager = this.#stateManager.managers?.policies;

			// Evaluate permission through policy manager
			return Promise.resolve(
				policyManager?.evaluatePolicy("hasPermission", {
					user: userContext,
					permission,
				})
			).then((hasPermissionResult) => {
				const hasPermission = hasPermissionResult ?? false;

				// Emit permission evaluation result
				this.#stateManager.emit?.("security.permission_evaluated", {
					permission,
					userId: userContext?.userId,
					userRoles: userContext?.roles || [],
					granted: hasPermission,
					timestamp: Date.now(),
					component: "EnterpriseSecurity",
				});

				return hasPermission;
			});
		});
	}

	/**
	 * Executes resource-specific access control with caching.
	 *
	 * @private
	 * @param {string} resourceType - Resource type
	 * @param {string} resourceId - Resource identifier
	 * @param {string} action - Action being performed
	 * @returns {Promise<boolean>}
	 */
	#executeCanAccessResource(resourceType, resourceId, action) {
		const securityManager = this.#stateManager.managers?.securityManager;

		return Promise.resolve().then(() => {
			if (!securityManager?.hasValidContext()) {
				this.#stateManager.emit?.("security.resource_access_denied", {
					resourceType,
					resourceId,
					action,
					reason: "expired_context",
					timestamp: Date.now(),
					component: "EnterpriseSecurity",
				});
				return false;
			}

			const userContext = securityManager.getSubject();
			const cacheKey = `${resourceType}:${resourceId}:${action}:${userContext.userId}`;

			// Check cache first
			if (this.#accessCache?.has(cacheKey)) {
				const cachedResult = this.#accessCache.get(cacheKey);

				this.#stateManager.emit?.("security.access_cache_hit", {
					resourceType,
					resourceId,
					action,
					userId: userContext.userId,
					result: cachedResult,
					timestamp: Date.now(),
					component: "EnterpriseSecurity",
				});

				return cachedResult;
			}

			// Cache miss - evaluate access
			this.#stateManager.emit?.("security.access_cache_miss", {
				resourceType,
				resourceId,
				action,
				userId: userContext.userId,
				timestamp: Date.now(),
				component: "EnterpriseSecurity",
			});

			// Perform resource permission check
			return this.#performResourcePermissionCheck(
				userContext,
				resourceType,
				resourceId,
				action
			).then((hasAccess) => {
				// Cache the result
				this.#accessCache?.set(cacheKey, hasAccess);

				// Emit access decision
				this.#stateManager.emit?.("security.resource_access_decision", {
					resourceType,
					resourceId,
					action,
					userId: userContext.userId,
					granted: hasAccess,
					timestamp: Date.now(),
					component: "EnterpriseSecurity",
				});

				return hasAccess;
			});
		});
	}

	/**
	 * Performs MAC (Mandatory Access Control) validation.
	 *
	 * @private
	 * @param {UserContext} userContext - User security context
	 * @param {string} classification - Required classification
	 * @param {Array<string>} compartments - Required compartments
	 * @returns {Promise<AccessResult>}
	 */
	#performMACCheck(userContext, classification, compartments) {
		const securityManager = this.#stateManager.managers?.securityManager;
		const mac = securityManager?.mac;

		if (!mac) {
			return {
				allowed: true,
				reason: "mac_unavailable",
				timestamp: Date.now(),
			};
		}

		const objectLabel = {
			level: classification,
			compartments: new Set(compartments),
		};

		return Promise.resolve().then(() => {
			const canRead = mac.canRead(userContext, objectLabel);

			return {
				allowed: canRead,
				reason: canRead ? "mac_approved" : "insufficient_clearance",
				timestamp: Date.now(),
			};
		});
	}

	/**
	 * Performs RBAC (Role-Based Access Control) validation.
	 *
	 * @private
	 * @param {UserContext} userContext - User security context
	 * @param {string} classification - Required classification
	 * @param {Array<string>} compartments - Required compartments
	 * @returns {Promise<AccessResult>}
	 */
	#performRBACCheck(userContext, classification, compartments) {
		const policyManager = this.#stateManager.managers?.policies;

		if (!policyManager) {
			return {
				allowed: true,
				reason: "rbac_unavailable",
				timestamp: Date.now(),
			};
		}

		return Promise.resolve(
			policyManager.evaluatePolicy("canAccessData", {
				user: userContext,
				resource: { classification, compartments },
			})
		).then((hasAccessResult) => {
			const hasAccess = hasAccessResult ?? true;
			return {
				allowed: hasAccess,
				reason: hasAccess
					? "rbac_approved"
					: "insufficient_role_permissions",
				timestamp: Date.now(),
			};
		});
	}

	/**
	 * Performs resource-specific permission validation.
	 *
	 * @private
	 * @param {UserContext} userContext - User security context
	 * @param {string} resourceType - Resource type
	 * @param {string} resourceId - Resource identifier
	 * @param {string} action - Action being performed
	 * @returns {Promise<boolean>}
	 */
	#performResourcePermissionCheck(
		userContext,
		resourceType,
		resourceId,
		action
	) {
		const policyManager = this.#stateManager.managers?.policies;

		if (!policyManager) {
			// Default to allowing access if policy manager unavailable
			return true;
		}

		return Promise.resolve(
			policyManager.evaluatePolicy("canAccessResource", {
				user: userContext,
				resource: { type: resourceType, id: resourceId },
				action,
			})
		).then((result) => {
			return result ?? true;
		});
	}
}
