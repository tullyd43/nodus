// modules/enterprise-security.js
// Enterprise security module for organizational access control

/**
 * @description
 * Implements enterprise-grade security controls, including Role-Based Access Control (RBAC),
 * clearance levels, and organization-wide security policies. This module is designed for
 * multi-user environments where access to data must be strictly controlled based on user roles,
 * security clearances, and organizational policies. It directly supports the **Compliance** pillar.
 *
 * @module EnterpriseSecurity
 */
export default class EnterpriseSecurity {
	/** @private @type {import('../../../utils/LRUCache.js').LRUCache|null} */
	#accessCache = null;
	/** @private @type {import('../../HybridStateManager.js').default} */
	#stateManager = null;
	/** @private @type {import('../../security/SecurityManager.js').default|null} */
	#securityManager = null;
	/** @private @type {import('../../ForensicLogger.js').default|null} */
	#forensicLogger = null;
	/** @private @type {import('../../../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../../SystemPolicies_Cached.js').SystemPolicies|null} */
	#policyManager = null;

	/** @public @type {string} */
	name = "EnterpriseSecurity";

	/**
	 * Creates an instance of EnterpriseSecurity.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
		// V8.0 Parity: Derive dependencies from the stateManager.
		this.#securityManager = stateManager?.managers?.securityManager;
		this.#forensicLogger = stateManager?.managers?.forensicLogger;
		this.#policyManager = stateManager?.managers?.policies;
	}

	/**
	 * Initializes the security module.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @returns {Promise<this>} The initialized instance.
	 */
	async init() {
		// V8.0 Parity: Use the centralized CacheManager and MetricsRegistry.
		this.#metrics =
			this.#stateManager?.metricsRegistry?.namespace(
				"enterpriseSecurity"
			);
		this.#accessCache =
			this.#stateManager?.managers?.cacheManager?.getCache(
				"enterpriseSecurityAccess"
			);
		return this;
	}

	/**
	 * Checks if the current user has access to data with a given classification and compartments.
	 * This is the primary access control check, evaluating clearance, compartments, roles, and policies.
	 * @param {string} classification - The classification level of the data being accessed.
	 * @param {string[]} [compartments=[]] - The compartments required to access the data.
	 * @returns {Promise<boolean>} True if access is permitted, false otherwise.
	 */
	async canAccess(classification, compartments = []) {
		if (!this.#securityManager?.hasValidContext()) {
			this.#audit("access_denied_expired", { classification });
			return false; // Fail closed if no valid context
		}

		const userContext = this.#securityManager.getSubject();

		// 1. MAC Check: Delegate clearance and compartment checks to the MACEngine for mandatory access control.
		const mac = this.#securityManager.mac;
		const canRead =
			mac?.canRead(userContext, {
				level: classification,
				compartments,
			}) ?? false;

		if (!canRead) {
			this.#audit("access_denied_clearance", {
				classification,
				userClearance: userContext?.level,
				requiredCompartments: compartments,
				userCompartments: Array.from(userContext?.compartments || []),
			});
			return false;
		}

		// 2. RBAC Check: Delegate role-based access checks to the PolicyManager for discretionary access control.
		const hasRoleAccess = await this.#policyManager?.evaluatePolicy(
			"canAccessData",
			{
				user: userContext,
				resource: { classification, compartments },
			}
		);

		if (!hasRoleAccess) {
			this.#audit("access_denied_role", {
				resource: classification,
				userRoles: userContext.roles || [],
			});
			return false;
		}

		return true;
	}

	/**
	 * Checks if the current user has a specific permission (e.g., 'data:export').
	 * It checks both direct user permissions and permissions granted through their roles.
	 * @param {string} permission - The permission string to check for.
	 * @returns {Promise<boolean>} True if the user has the permission, false otherwise.
	 */
	async hasPermission(permission) {
		if (!this.#securityManager?.hasValidContext()) return false;
		const userContext = this.#securityManager.getSubject();
		if (!userContext) return false;

		// V8.0 Parity: Delegate permission checks to the PolicyManager.
		return (
			this.#policyManager?.evaluatePolicy("hasPermission", {
				user: userContext,
				permission,
			}) ?? false // Default to false if policy manager is not available
		);
	}

	/**
	 * Checks if the current user can perform a specific action on a given resource.
	 * This method uses caching to improve performance for repeated checks.
	 * @param {string} resourceType - The type of the resource (e.g., 'object', 'event').
	 * @param {string} resourceId - The unique identifier of the resource.
	 * @param {string} [action='read'] - The action being performed (e.g., 'read', 'write', 'delete').
	 * @returns {Promise<boolean>} True if access is permitted, false otherwise.
	 */
	async canAccessResource(resourceType, resourceId, action = "read") {
		if (!this.#securityManager?.hasValidContext()) return false;
		const userContext = this.#securityManager.getSubject();
		if (!userContext) return false;

		const cacheKey = `${resourceType}:${resourceId}:${action}`;

		// V8.0 Parity: Use the centralized LRUCache.
		const cachedAccess = this.#accessCache?.get(cacheKey);
		if (cachedAccess !== undefined) {
			this.#metrics?.increment("cacheHits");
			return cachedAccess;
		}
		this.#metrics?.increment("cacheMisses");

		// Check resource-specific permissions
		const hasAccess = await this.#checkResourcePermission(
			userContext,
			resourceType,
			resourceId,
			action
		);

		// Cache result using the centralized cache.
		this.#accessCache?.set(cacheKey, hasAccess);

		if (!hasAccess) {
			this.#audit("resource_access_denied", {
				resourceType,
				resourceId,
				action,
				userId: userContext.userId,
			});
		}

		return hasAccess;
	}

	/**
	 * Clears the internal access cache for this module.
	 * This is useful after a user's permissions have changed.
	 * Note: This does not clear the user's security context, which is handled by the SecurityManager.
	 */
	clearAccessCache() {
		this.#audit("enterprise_context_cleared", {});
		this.#accessCache?.clear();
	}

	// Private methods

	/**
	 * Checks resource-specific permissions by delegating to the PolicyManager.
	 * @private
	 * @param {object} userContext - The user's security context.
	 * @param {string} resourceType - The type of the resource.
	 * @param {string} resourceId - The ID of the resource.
	 * @param {string} action - The action being performed.
	 * @returns {Promise<boolean>} True if the action is permitted.
	 */
	async #checkResourcePermission(
		userContext,
		resourceType,
		resourceId,
		action
	) {
		// V8.0 Parity: Delegate resource access checks to the PolicyManager.
		return (
			this.#policyManager?.evaluatePolicy("canAccessResource", {
				user: userContext,
				resource: { type: resourceType, id: resourceId },
				action,
			}) ?? false
		);
	}

	/**
	 * Adds an event to the internal audit log.
	 * @private
	 * @param {string} eventType - The type of event to log.
	 * @param {object} data - The data associated with the event.
	 */
	#audit(eventType, data) {
		if (
			this.#forensicLogger &&
			typeof this.#forensicLogger.logAuditEvent === "function"
		) {
			this.#forensicLogger.logAuditEvent(
				`ENTERPRISE_${eventType.toUpperCase()}`,
				data
			);
		} else {
			console.warn(
				`[EnterpriseSecurity] Audit event (no logger): ${eventType}`,
				data
			);
		}

		if (eventType.includes("denied")) {
			console.warn(`[Enterprise Security] ${eventType}:`, data);
		}
	}
}
