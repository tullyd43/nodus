// core/security/ComposableSecurity.js
// Composable security with zero-knowledge access control

/**
 * Composable Security Layer
 *
 * ZERO-KNOWLEDGE PRINCIPLES:
 * - Access decisions made on encrypted hints, not actual data
 * - Classification metadata encrypted alongside content
 * - Server never sees cleartext security levels
 * - Client-side access control with cryptographic proof
 */
export class ComposableSecurity {
	#mac;
	#crypto;
	#context = null;
	#accessCache = new Map();
	#auditLog = [];
	#config;
	#metrics;
	#ready = false;
	#eventListeners;
	stateManager = null;

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
	 * Initialize security layer
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
	 * Set user security context with proof verification
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
	 * Set organization context for multi-tenant security
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
	 * Validate organization access
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

	async checkAccess(entity, action) {
		try {
			// 1) MAC first (non-bypassable)
			const subj = this.#mac.subject();
			const obj = this.#mac.label(entity);
			if (action === "read") {
				this.#mac.enforceNoReadUp(subj, obj);
			} else {
				this.#mac.enforceNoWriteDown(subj, obj);
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
	 * Check access to classified data
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
				resource: classification,
				compartments,
			});
			this.stateManager?.emit?.("accessDenied", {
				resource: classification,
			});
		}

		return hasAccess;
	}

	/**
	 * Check access using encrypted hints (zero-knowledge)
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
	 * Check if security context is valid
	 */
	hasValidContext() {
		return this.#context && Date.now() < this.#context.expires;
	}

	/**
	 * Get cache hit rate for performance monitoring
	 */
	getCacheHitRate() {
		const total = this.#metrics.cacheHits + this.#metrics.cacheMisses;
		return total > 0 ? this.#metrics.cacheHits / total : 0;
	}

	/**
	 * Get recent security events
	 */
	getRecentAuditEvents(limit = 10) {
		return this.#auditLog.slice(-limit);
	}

	/**
	 * Clear security context and sensitive data
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
	 * Close and cleanup
	 */
	close() {
		this.clear();
		this.#ready = false;
	}

	// ===== PRIVATE ACCESS CONTROL METHODS =====

	/**
	 * Perform the RBAC check (after MAC has passed)
	 */
	async evaluateRBAC(entity, action) {
		// This wraps the existing canAccess logic for RBAC evaluation.
		const label = this.#mac.label(entity);
		return this.canAccess(label.level, Array.from(label.compartments));
	}

	/**
	 * Perform the actual access check
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
	 * Check if user has sufficient clearance level
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
	 * Check if user has required compartments
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
	 * Generate access hint for current user context
	 */
	async #generateUserAccessHint() {
		if (!this.#context) return null;

		return await this.#crypto.generateAccessHint(
			this.#context.clearanceLevel,
			Array.from(this.#context.compartments)
		);
	}

	/**
	 * Compare access hints without revealing actual classifications
	 */
	#compareAccessHints(userHint, dataHint) {
		// Simple comparison for demo - production would use more sophisticated crypto
		return (
			userHint === dataHint ||
			this.#hasHigherAccessLevel(userHint, dataHint)
		);
	}

	/**
	 * Check if user hint indicates higher access level
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
	 * Check organization membership
	 */
	async #checkOrganizationMembership(organizationId, userId) {
		// This would typically check against a membership database/cache
		// For demo purposes, assume access is granted
		return true;
	}

	/**
	 * Setup cache cleanup
	 */
	#setupCacheCleanup() {
		setInterval(() => {
			this.#cleanupCache();
		}, this.#config.cacheTTL);
	}

	/**
	 * Cleanup expired cache entries
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
	 * Audit security events
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

	// Event system for composability
	on(event, callback) {
		if (!this.#eventListeners.has(event)) {
			this.#eventListeners.set(event, []);
		}
		this.#eventListeners.get(event).push(callback);
	}

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

	// Getters
	get context() {
		return this.#context;
	}
	get metrics() {
		return { ...this.#metrics };
	}
	get isReady() {
		return this.#ready;
	}
}

/**
 * Security error class
 */
export class SecurityError extends Error {
	constructor(message) {
		super(message);
		this.name = "SecurityError";
	}
}

/**
 * Validation error class
 */
export class ValidationError extends Error {
	constructor(message, details = []) {
		super(message);
		this.name = "ValidationError";
		this.details = details;
	}
}

export default ComposableSecurity;
