// core/security/ComposableSecurity.js
// Composable security layer for orchestrating MAC and RBAC.

import { PolicyError } from "../../utils/ErrorHelpers.js";

/**
 * @description
 * Provides a composable, multi-layered security engine for the application.
 * This class integrates Mandatory Access Control (MAC) via the Bell-LaPadula model,
 * Role-Based Access Control (RBAC), and zero-knowledge principles to make fine-grained
 * access decisions. It is designed to be the central authority for all security checks.
 */
export class ComposableSecurity {
	/** @private @type {import('../security/MACEngine.js').MACEngine|null} */
	#mac = null;
	/** @private @type {import('../../utils/LRUCache.js').LRUCache|null} */
	#accessCache = null;
	/** @private @type {object} */
	#config;
	/** @private @type {boolean} */
	#ready = false;
	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('../../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;

	/**
	 * Creates an instance of the ComposableSecurity layer.
	 * @param {object} context - The application context.
	 * @param {import('../HybridStateManager.js').default} context.stateManager - A global state manager for event emission.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager; // Keep a reference to the central state manager.

		this.#config = {
			...stateManager.config,
			auditLevel: stateManager.config.auditLevel || "standard",
			cache: {
				size: stateManager.config.security?.cacheSize || 1000,
				ttl: stateManager.config.security?.cacheTTL || 5 * 60 * 1000, // 5 minutes
			},
		};
	}

	/**
	 * Initializes the security layer and starts background tasks like cache cleanup.
	 * @returns {Promise<this>} The initialized security instance.
	 */
	async init() {
		if (this.#ready) return this;

		// V8.0 Parity: Derive dependencies at initialization time.
		this.#metrics =
			this.#stateManager?.metricsRegistry?.namespace("security");
		this.#mac = this.#stateManager?.managers?.securityManager?.mac;

		// V8.0 Parity: Use the centralized CacheManager.
		const cacheManager = this.#stateManager?.managers?.cacheManager;
		if (cacheManager) {
			this.#accessCache = cacheManager.getCache("securityAccess", {
				ttl: this.#config.cache?.ttl,
			});
		}

		this.#ready = true;
		this.#audit("security_initialized", {});
		console.log("[ComposableSecurity] Security layer is ready.");
		return this;
	}

	/**
	 * The primary access control decision point. It first enforces non-bypassable
	 * Mandatory Access Control (MAC) rules and then evaluates Role-Based Access Control (RBAC) policies.
	 * @param {object} entity - The data entity being accessed.
	 * @param {'read'|'write'|'delete'} action - The action being performed.
	 * @param {object} [context={}] - Additional context, like the store name.
	 * @returns {Promise<boolean>} True if access is granted.
	 * @throws {Error} If access is denied by either MAC or RBAC checks.
	 */
	async checkAccess(entity, action, context = {}) {
		try {
			// 1) MAC first (non-bypassable)
			const subject = this.#mac?.subject();
			const objectLabel = this.#mac.label(entity, context);

			if (action === "read") {
				this.#mac.enforceNoReadUp(subject, objectLabel);
			} else {
				this.#mac.enforceNoWriteDown(subject, objectLabel);
			}

			// 2) RBAC next (delegated to the loaded security module)
			// V8.0 Parity: This simplifies the flow by directly calling the RBAC check.
			const hasRbacAccess = await this.canAccess(
				objectLabel.level,
				Array.from(objectLabel.compartments ?? [])
			);

			if (!hasRbacAccess) {
				this.#audit("access_denied_rbac", {
					entityId: entity?.id,
					action,
					classification: objectLabel.level,
				});
				throw new PolicyError("RBAC_DENY");
			}

			this.#stateManager?.emit?.("accessGranted", {
				reason: "MAC+RBAC",
				entityId: entity.id,
				action,
			});
			return true;
		} catch (err) {
			this.#stateManager?.emit("accessDenied", {
				reason: err.message.includes("MAC") ? "MAC" : "RBAC",
				entityId: entity?.id,
				action,
			});
			throw new PolicyError("ACCESS_DENIED", {
				cause: err,
				context: { entityId: entity?.id, action },
			});
		}
	}

	/**
	 * Performs a Role-Based Access Control (RBAC) check to determine if the current user
	 * can access data with a specific classification and set of compartments.
	 * @param {string} classification - The classification level of the data.
	 * @param {string[]} [compartments=[]] - An array of compartments required for access.
	 * @returns {Promise<boolean>} True if access is permitted, false otherwise.
	 */
	async canAccess(classification, compartments = []) {
		const userContext =
			this.#stateManager?.managers?.securityManager?.getSubject();
		if (!userContext) {
			this.#audit("access_denied_no_context", { classification });
			return false;
		}

		const cacheKey = `${classification}:${compartments.sort().join(",")}`;

		// Check cache first
		const cachedAccess = this.#accessCache?.get(cacheKey);
		if (cachedAccess !== undefined) {
			this.#metrics?.increment("cacheHits");
			return cachedAccess;
		}
		this.#metrics?.increment("cacheMisses");
		this.#metrics?.increment("accessChecks");

		// Perform access check
		const hasAccess = await this.#performAccessCheck(
			userContext,
			classification,
			compartments
		);

		// Cache result
		this.#accessCache?.set(cacheKey, hasAccess);

		if (!hasAccess) {
			this.#metrics?.increment("accessDenied");
			this.#audit("access_denied", {
				classification,
				compartments,
			});
		}

		return hasAccess;
	}

	/**
	 * Checks if the current security context is still valid and has not expired.
	 * @returns {boolean} True if the context is valid.
	 */
	hasValidContext() {
		return (
			this.#stateManager?.managers?.securityManager?.hasValidContext() ??
			false
		);
	}

	/**
	 * Gets the cache hit rate for access control decisions, useful for performance monitoring.
	 * @returns {number} The cache hit rate as a value between 0 and 1.
	 */
	getCacheHitRate() {
		const hits = this.#metrics?.get("cacheHits")?.value || 0;
		const misses = this.#metrics?.get("cacheMisses")?.value || 0;
		const total = hits + misses;
		return total > 0 ? hits / total : 0;
	}

	/**
	 * Retrieves the most recent security audit events.
	 * @param {number} [limit=10] - The maximum number of events to return.
	 * @returns {Array<object>} An array of audit event objects.
	 */
	getRecentAuditEvents(limit = 10) {
		// V8.0 Parity: Delegate to the ForensicLogger.
		return this.#stateManager?.managers?.forensicLogger?.getAuditTrail({
			limit,
		});
	}

	/**
	 * Clears the current security context and purges the access cache.
	 * @returns {Promise<void>}
	 */
	async clear() {
		this.#accessCache?.clear();

		this.#audit("security_cleared", {});
	}

	/**
	 * Closes the security layer and cleans up resources.
	 */
	close() {
		this.clear();
		this.#ready = false;
	}

	// ===== PRIVATE ACCESS CONTROL METHODS =====

	/**
	 * The core logic for an RBAC access check, comparing user clearance and compartments against requirements.
	 * @private
	 * @param {string} classification - The required classification level.
	 * @param {string[]} compartments - The required compartments.
	 * @returns {boolean} True if access is permitted.
	 */
	async #performAccessCheck(userContext, classification, compartments) {
		// V8.0 Parity: Delegate all policy evaluation to the appropriate managers.
		// The `enterprise-security` module already performs these checks.
		const enterpriseSecurity =
			this.#stateManager?.storage?.instance?.security;

		if (
			enterpriseSecurity &&
			typeof enterpriseSecurity.canAccess === "function"
		) {
			// The enterprise security module handles MAC, RBAC, and compartment checks.
			return await enterpriseSecurity.canAccess(
				classification,
				compartments
			);
		}

		// Fallback for basic security setups without the enterprise module.
		const hasClearance = this.#hasSufficientClearance(
			userContext.level,
			classification
		);
		const hasCompartments = this.#hasRequiredCompartments(
			userContext.compartments,
			compartments
		);
		return hasClearance && hasCompartments;
	}

	/**
	 * Checks if the user's clearance level is greater than or equal to the required level.
	 * @private
	 * @param {string} userClearance - The user's clearance level.
	 * @param {string} requiredClearance - The required clearance level.
	 * @returns {boolean} True if clearance is sufficient.
	 */
	#hasSufficientClearance(userClearance, requiredClearance) {
		const clearanceLevels = [
			"public",
			"internal",
			"restricted",
			"confidential",
			"secret",
			"top_secret",
			"nato_restricted",
			"nato_confidential",
			"nato_secret",
			"cosmic_top_secret",
		];

		const userLevel = clearanceLevels.indexOf(userClearance);
		const requiredLevel = clearanceLevels.indexOf(requiredClearance);

		return userLevel >= requiredLevel;
	}

	/**
	 * Checks if the user's compartments are a superset of the required compartments.
	 * @private
	 * @param {Set<string>} userCompartments - The set of the user's compartments.
	 * @param {string[]} requiredCompartments - An array of required compartments.
	 * @returns {boolean} True if the user has all required compartments.
	 */
	#hasRequiredCompartments(userCompartments, requiredCompartments) {
		// User must have ALL required compartments
		for (const required of requiredCompartments) {
			if (!userCompartments.has(required)) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Creates and stores a security audit event.
	 * @private
	 * @param {string} eventType - The type of the event (e.g., 'access_denied').
	 * @param {object} data - The data associated with the event.
	 */
	#audit(eventType, data) {
		const forensicLogger = this.#stateManager?.managers?.forensicLogger;
		if (
			forensicLogger &&
			typeof forensicLogger.logAuditEvent === "function"
		) {
			forensicLogger.logAuditEvent(
				`COMPOSABLE_SECURITY_${eventType.toUpperCase()}`,
				data
			);
		} else {
			console.warn(
				`[ComposableSecurity] Audit event (no logger): ${eventType}`,
				data
			);
		}

		// Log security violations and errors
		if (eventType.includes("denied") || eventType.includes("failed")) {
			console.warn(`[Security] ${eventType}:`, data);
		}
	}

	/**
	 * Gets the current security context.
	 * @returns {object|null}
	 */
	get context() {
		return this.#stateManager?.managers?.securityManager?.context ?? null;
	}
	/**
	 * Gets the current metrics.
	 * @returns {boolean}
	 */
	get isReady() {
		return this.#ready;
	}
}

export default ComposableSecurity;
