// core/security/ComposableSecurity.js
// Composable security with zero-knowledge access control

/**
 * @description
 * Provides a composable, multi-layered security engine for the application.
 * This class integrates Mandatory Access Control (MAC) via the Bell-LaPadula model,
 * Role-Based Access Control (RBAC), and zero-knowledge principles to make fine-grained
 * access decisions. It is designed to be the central authority for all security checks.
 *
 * @property {import('../security/MACEngine.js').MACEngine|null} #mac - The Mandatory Access Control engine.
 * @property {import('./modules/aes-crypto.js').default} #crypto - The cryptographic module for handling encryption and proofs.
 * @property {object|null} #context - The current user's security context.
 * @property {Map<string, {access: boolean, expires: number}>} #accessCache - A cache for access control decisions.
 * @property {Array<object>} #auditLog - A log of security-relevant events.
 * @property {object} #config - The configuration for the security layer.
 * @property {object} #metrics - Performance and usage metrics.
 * @property {boolean} #ready - A flag indicating if the layer is initialized.
 * @property {Map<string, Function[]>} #eventListeners - A map for event listeners.
 * @property {object|null} stateManager - A reference to the global state manager for emitting events.
 *
 * @example
 * // Zero-Knowledge Principles:
 * - Access decisions made on encrypted hints, not actual data
 * - Classification metadata encrypted alongside content
 * - Server never sees cleartext security levels
 * - Client-side access control with cryptographic proof
 */
export class ComposableSecurity {
	/** @private */
	#mac;
	/** @private */
	#crypto;
	/** @private */
	#context = null;
	/** @private */
	#accessCache = new Map();
	/** @private */
	#auditLog = [];
	/** @private */
	#config;
	/** @private */
	#metrics;
	/** @private */
	#ready = false;
	/** @private */
	#eventListeners;
	/** @type {object|null} */
	stateManager = null;

	/**
	 * Creates an instance of the ComposableSecurity layer.
	 * @param {import('./modules/aes-crypto.js').default} crypto - The cryptographic module instance.
	 * @param {object} [options={}] - Configuration options.
	 * @param {object} [options.stateManager] - A global state manager for event emission.
	 * @param {string} [options.auditLevel='standard'] - The level of detail for audit logging.
	 * @param {number} [options.cacheSize=1000] - The maximum number of entries in the access cache.
	 * @param {number} [options.cacheTTL=300000] - The time-to-live for cache entries in milliseconds.
	 * @param {Function} [options.metricsCallback] - A callback for reporting metrics.
	 * @param {import('../security/MACEngine.js').MACEngine} mac - The Mandatory Access Control engine instance.
	 */
	constructor(crypto, options = {}, mac) {
		const manager = options.stateManager;
		this.stateManager = manager;
		this.#crypto = crypto;
		this.#mac = mac; // <— inject MAC
		this.#config = {
			auditLevel: options.auditLevel || "standard",
			cacheSize: options.cacheSize || 1000,
			cacheTTL: options.cacheTTL || 5 * 60 * 1000, // 5 minutes
			metricsCallback: options.metricsCallback || (() => {}),
			...options,
		};

		this.#metrics = {
			accessChecks: 0,
			accessDenied: 0,
			cacheHits: 0,
			cacheMisses: 0,
			auditEvents: 0,
		};

		this.#eventListeners = new Map();
	}

	/**
	 * Initializes the security layer and starts background tasks like cache cleanup.
	 * @returns {Promise<this>} The initialized security instance.
	 */
	async init() {
		if (this.#ready) return this;

		// Setup cache cleanup
		this.#setupCacheCleanup();

		this.#ready = true;
		this.#audit("security_initialized", {});
		console.log(
			"[ComposableSecurity] Ready with zero-knowledge access control"
		);
		return this;
	}

	/**
	 * Sets the current user's security context after verifying their authentication proof.
	 * This context is used for all subsequent access control decisions.
	 * @param {string} userId - The unique identifier of the user.
	 * @param {string} clearanceLevel - The user's security clearance level (e.g., 'secret').
	 * @param {string[]} [compartments=[]] - An array of security compartments the user has access to.
	 * @param {object} authProof - A cryptographic proof of authentication.
	 * @param {number} [ttl=14400000] - The time-to-live for this context in milliseconds (default: 4 hours).
	 * @returns {Promise<this>} The instance with the context set.
	 * @throws {SecurityError} If the authentication proof is invalid.
	 */
	async setContext(
		userId,
		clearanceLevel,
		compartments = [],
		authProof,
		ttl = 4 * 3600000
	) {
		// Verify authentication proof
		if (!(await this.#crypto.verifyAuthProof(userId, authProof))) {
			this.#audit("auth_proof_failed", { userId });
			throw new SecurityError("Invalid authentication proof");
		}

		// Set security context
		this.#context = {
			userId,
			clearanceLevel,
			compartments: new Set(compartments),
			authProof,
			expires: Date.now() + ttl,
			created: Date.now(),
		};

		// Clear access cache when context changes
		this.#accessCache.clear();

		this.#audit("context_set", {
			userId,
			clearanceLevel,
			compartmentCount: compartments.length,
		});

		return this;
	}

	/**
	 * Sets the organization context for multi-tenant security policies.
	 * @param {string} organizationId - The unique identifier of the organization.
	 * @returns {Promise<this>} The instance with the organization context set.
	 */
	async setOrganizationContext(organizationId) {
		if (!this.#context) {
			throw new SecurityError(
				"User context must be set before organization context"
			);
		}

		this.#context.organizationId = organizationId;
		this.#accessCache.clear(); // Clear cache for new org context

		this.#audit("organization_context_set", { organizationId });
		return this;
	}

	/**
	 * Validates if the current user has access to a specific organization.
	 * @param {string} organizationId - The ID of the organization to check.
	 * @param {object} securityContext - The user's security context.
	 * @returns {Promise<boolean>} True if access is permitted, false otherwise.
	 */
	async validateOrganizationAccess(organizationId, securityContext) {
		if (!this.#context) {
			return false;
		}

		// Check if user has access to this organization
		// This would typically involve checking org membership
		const hasAccess = await this.#checkOrganizationMembership(
			organizationId,
			this.#context.userId
		);

		if (!hasAccess) {
			this.#audit("organization_access_denied", {
				organizationId,
				userId: this.#context.userId,
			});
		}

		return hasAccess;
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
		const { storeName } = context;
		try {
			// 1) MAC first (non-bypassable)
			const subj = this.#mac.subject();
			const obj = this.#mac.label(entity, { storeName });
			if (action === "read") {
				// For reads, the entity is what comes from the DB.
				// The label function needs to know if it's from the poly store.
				this.#mac.enforceNoReadUp(subj, obj, { storeName });
			} else {
				// For writes, the entity is the logical object before it's stored.
				// The label function should look for `classification`.
				// The `storeName` hint helps resolve ambiguity.
				this.#mac.enforceNoWriteDown(subj, obj, { storeName });
			}

			// 2) RBAC next (your existing role/perm evaluation)
			const ok = await this.evaluateRBAC(entity, action);
			if (!ok) throw new Error("RBAC_DENY");

			this.stateManager?.emit?.("accessGranted", {
				reason: "MAC+RBAC",
				entityId: entity.id,
				action,
			});
			return true;
		} catch (err) {
			this.stateManager?.emit?.("accessDenied", {
				reason: err.message.includes("MAC") ? "MAC" : "RBAC",
				entityId: entity?.id,
				action,
			});
			throw new Error("ACCESS_DENIED");
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
		if (!this.#context) {
			this.#audit("access_denied_no_context", { classification });
			return false;
		}

		// Check context expiration
		if (Date.now() > this.#context.expires) {
			this.#audit("access_denied_context_expired", {
				classification,
				expired: this.#context.expires,
			});
			return false;
		}

		const cacheKey = `${classification}:${compartments.sort().join(",")}`;

		// Check cache first
		if (this.#accessCache.has(cacheKey)) {
			const cached = this.#accessCache.get(cacheKey);
			if (Date.now() < cached.expires) {
				this.#metrics.cacheHits++;
				return cached.access;
			} else {
				this.#accessCache.delete(cacheKey);
			}
		}

		this.#metrics.cacheMisses++;
		this.#metrics.accessChecks++;

		// Perform access check
		const hasAccess = this.#performAccessCheck(
			classification,
			compartments
		);

		// Cache result
		this.#accessCache.set(cacheKey, {
			access: hasAccess,
			expires: Date.now() + this.#config.cacheTTL,
		});

		// Cleanup cache if too large
		if (this.#accessCache.size > this.#config.cacheSize) {
			this.#cleanupCache();
		}

		if (!hasAccess) {
			this.#metrics.accessDenied++;
			this.#audit("access_denied", {
				classification,
				compartments,
				userClearance: this.#context.clearanceLevel,
				userCompartments: Array.from(this.#context.compartments),
			});
			// Emit event through the state manager as per the parity plan
			this.stateManager?.emit?.("accessDenied", {
				classification,
				compartments, // This was already shorthand, which is great!
			});
			this.stateManager?.emit?.("accessDenied", {
				resource: classification,
			});
		}

		return hasAccess;
	}

	/**
	 * Performs a zero-knowledge access check by comparing an encrypted hint from the data
	 * with a hint generated from the user's context. This allows access decisions without
	 * decrypting the data's actual security label.
	 * @param {string} accessHint - The encrypted access hint from the data object.
	 * @returns {Promise<boolean>} True if the hints suggest access is permitted.
	 */
	async canAccessEncrypted(accessHint) {
		if (!this.#context) {
			return false;
		}

		// Generate our own hint for comparison
		const userHint = await this.#generateUserAccessHint();

		// Compare hints to determine access without decryption
		return this.#compareAccessHints(userHint, accessHint);
	}

	/**
	 * Checks if the current security context is still valid and has not expired.
	 * @returns {boolean} True if the context is valid.
	 */
	hasValidContext() {
		return this.#context && Date.now() < this.#context.expires;
	}

	/**
	 * Gets the cache hit rate for access control decisions, useful for performance monitoring.
	 * @returns {number} The cache hit rate as a value between 0 and 1.
	 */
	getCacheHitRate() {
		const total = this.#metrics.cacheHits + this.#metrics.cacheMisses;
		return total > 0 ? this.#metrics.cacheHits / total : 0;
	}

	/**
	 * Retrieves the most recent security audit events.
	 * @param {number} [limit=10] - The maximum number of events to return.
	 * @returns {Array<object>} An array of audit event objects.
	 */
	getRecentAuditEvents(limit = 10) {
		return this.#auditLog.slice(-limit);
	}

	/**
	 * Clears the current security context and purges the access cache.
	 * @returns {Promise<void>}
	 */
	async clear() {
		this.#context = null;
		this.#accessCache.clear();

		// Clear audit log if configured
		if (this.#config.auditLevel === "minimal") {
			this.#auditLog = [];
		}

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
	 * A wrapper to perform the RBAC check after a MAC check has already passed.
	 * @private
	 * @param {object} entity - The entity being accessed.
	 * @param {string} action - The action being performed.
	 * @param {object} [context={}] - Additional context.
	 * @returns {Promise<boolean>} The result of the `canAccess` RBAC check.
	 */
	async evaluateRBAC(entity, action, context = {}) {
		const { storeName } = context;
		// This wraps the existing canAccess logic for RBAC evaluation.
		// The label function needs to correctly identify the classification field.
		const { level, compartments } = this.#mac.label(entity, {
			storeName,
			isRBACCheck: true,
		});
		return this.canAccess(level, Array.from(compartments ?? []));
	}

	/**
	 * The core logic for an RBAC access check, comparing user clearance and compartments against requirements.
	 * @private
	 * @param {string} classification - The required classification level.
	 * @param {string[]} compartments - The required compartments.
	 * @returns {boolean} True if access is permitted.
	 */
	#performAccessCheck(classification, compartments) {
		const userClearance = this.#context.clearanceLevel;
		const userCompartments = this.#context.compartments;

		// 1. Check clearance level
		if (!this.#hasSufficientClearance(userClearance, classification)) {
			return false;
		}

		// 2. Check compartment access
		if (!this.#hasRequiredCompartments(userCompartments, compartments)) {
			return false;
		}

		return true;
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
	 * Generates an encrypted access hint for the current user's security context.
	 * @private
	 * @returns {Promise<string|null>} The generated access hint.
	 */
	async #generateUserAccessHint() {
		if (!this.#context) return null;

		return await this.#crypto.generateAccessHint(
			this.#context.clearanceLevel,
			Array.from(this.#context.compartments)
		);
	}

	/**
	 * Compares the user's access hint with the data's access hint.
	 * @private
	 * @param {string} userHint - The user's generated hint.
	 * @param {string} dataHint - The hint from the data object.
	 * @returns {boolean} True if the hints suggest access is permitted.
	 */
	#compareAccessHints(userHint, dataHint) {
		// Simple comparison for demo - production would use more sophisticated crypto
		return (
			userHint === dataHint ||
			this.#hasHigherAccessLevel(userHint, dataHint)
		);
	}

	/**
	 * A simplified check to see if a user's hint represents a higher access level than the data's hint.
	 * @private
	 * @param {string} userHint - The user's hint.
	 * @param {string} dataHint - The data's hint.
	 * @returns {boolean} True if the user's hint level is greater than or equal to the data's.
	 */
	#hasHigherAccessLevel(userHint, dataHint) {
		// This is a simplified check - production would use proper cryptographic comparison
		// The actual implementation would depend on how hints encode access levels

		// For now, assume hints encode access level in a comparable way
		const userLevel = parseInt(userHint.substring(0, 2), 16) || 0;
		const dataLevel = parseInt(dataHint.substring(0, 2), 16) || 0;

		return userLevel >= dataLevel;
	}

	/**
	 * A mock implementation to check if a user belongs to an organization.
	 * @private
	 * @param {string} organizationId - The ID of the organization.
	 * @param {string} userId - The ID of the user.
	 * @returns {Promise<boolean>} True if the user is a member.
	 */
	async #checkOrganizationMembership(organizationId, userId) {
		// This would typically check against a membership database/cache
		// For demo purposes, assume access is granted
		return true;
	}

	/**
	 * Sets up a periodic interval to clean up expired entries from the access cache.
	 * @private
	 */
	#setupCacheCleanup() {
		setInterval(() => {
			this.#cleanupCache();
		}, this.#config.cacheTTL);
	}

	/**
	 * Cleans up expired and oversized entries from the access cache.
	 * @private
	 */
	#cleanupCache() {
		const now = Date.now();
		const toDelete = [];

		for (const [key, value] of this.#accessCache.entries()) {
			if (now >= value.expires) {
				toDelete.push(key);
			}
		}

		for (const key of toDelete) {
			this.#accessCache.delete(key);
		}

		// If still too large, remove oldest entries
		if (this.#accessCache.size > this.#config.cacheSize) {
			const entries = Array.from(this.#accessCache.entries());
			const toRemove = entries.slice(
				0,
				entries.length - this.#config.cacheSize
			);

			for (const [key] of toRemove) {
				this.#accessCache.delete(key);
			}
		}
	}

	/**
	 * Creates and stores a security audit event.
	 * @private
	 * @param {string} eventType - The type of the event (e.g., 'access_denied').
	 * @param {object} data - The data associated with the event.
	 */
	#audit(eventType, data) {
		const auditEvent = {
			type: eventType,
			data,
			timestamp: Date.now(),
			userId: this.#context?.userId || null,
			organizationId: this.#context?.organizationId || null,
		};

		this.#auditLog.push(auditEvent);
		this.#metrics.auditEvents++;

		// Keep audit log size reasonable
		if (this.#auditLog.length > 1000) {
			this.#auditLog = this.#auditLog.slice(-500);
		}

		// Report metrics
		this.#config.metricsCallback("security_event", {
			type: eventType,
			timestamp: auditEvent.timestamp,
		});

		// Log security violations and errors
		if (
			[
				"access_denied",
				"auth_proof_failed",
				"organization_access_denied",
			].includes(eventType)
		) {
			console.warn(`[Security] ${eventType}:`, data);
		}
	}

	/**
	 * Registers an event listener for a specific security event.
	 * @param {string} event - The name of the event to listen for.
	 * @param {Function} callback - The callback function to execute.
	 */
	on(event, callback) {
		if (!this.#eventListeners.has(event)) {
			this.#eventListeners.set(event, []);
		}
		this.#eventListeners.get(event).push(callback);
	}

	/**
	 * Emits a security event, triggering all registered listeners.
	 * @param {string} event - The name of the event to emit.
	 * @param {object} data - The data to pass to the listeners.
	 */
	emit(event, data) {
		if (!this.#eventListeners?.has(event)) return;

		for (const callback of this.#eventListeners.get(event)) {
			try {
				callback(data);
			} catch (error) {
				console.error(
					`[ComposableSecurity] Event callback error:`,
					error
				);
			}
		}
	}

	/**
	 * Gets the current security context.
	 * @returns {object|null}
	 */
	get context() {
		return this.#context;
	}
	/**
	 * Gets the current metrics.
	 * @returns {object}
	 */
	get metrics() {
		return { ...this.#metrics };
	}
	/**
	 * Gets the ready state of the security layer.
	 * @returns {boolean}
	 */
	get isReady() {
		return this.#ready;
	}
}

/**
 * Custom error class for security-related failures.
 */
export class SecurityError extends Error {
	/**
	 * Creates an instance of SecurityError.
	 * @param {string} message - The error message.
	 */
	constructor(message) {
		super(message);
		this.name = "SecurityError";
	}
}

/**
 * Custom error class for validation failures.
 */
export class ValidationError extends Error {
	/**
	 * Creates an instance of ValidationError.
	 * @param {string} message - The error message.
	 * @param {Array<string>} [details=[]] - An array of detailed error strings.
	 */
	constructor(message, details = []) {
		super(message);
		this.name = "ValidationError";
		this.details = details;
	}
}

export default ComposableSecurity;
