/**
 * @file SecurityManager.js
 * @version 8.0.0 - ENTERPRISE OBSERVABILITY MIGRATION
 * @description Enterprise security context management with automatic observability compliance.
 * Manages user identity, clearance levels, and MAC policy enforcement with complete audit trails.
 *
 * All security context operations are automatically instrumented through ActionDispatcher
 * for complete compliance audit trails and forensic analysis.
 *
 * Key Features:
 * - Automatic observation of all security context changes
 * - TTL-based context expiration with automatic cleanup
 * - MAC engine integration with performance optimization
 * - Zero-tolerance security violations with automatic escalation
 *
 * @see {@link NODUS_DEVELOPER_MIGRATION_GUIDE.md} - Security context observability requirements
 */

/**
 * @typedef {Object} SecurityContext
 * @property {string} userId - Unique user identifier
 * @property {string} level - User's clearance level
 * @property {Set<string>} compartments - User's security compartments
 * @property {number} expires - Context expiration timestamp
 * @property {Array<string>} [roles] - User's assigned roles
 * @property {string} [tenantId] - User's tenant identifier
 */

/**
 * @typedef {Object} SecurityLabel
 * @property {string} level - Security classification level
 * @property {Set<string>} compartments - Security compartments
 */

/**
 * Enterprise security context manager with automatic observability and MAC integration.
 *
 * Manages the application's security context including user identity, clearance levels,
 * and MAC policy enforcement. All operations are automatically instrumented for
 * defense-grade compliance requirements.
 *
 * @class SecurityManager
 */
export class SecurityManager {
	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {SecurityContext|null} */
	#context = null;
	/** @private @type {import('./MACEngine.js').MACEngine|null} */
	#mac = null;
	/** @private @type {boolean} */
	#isReady = false;
	/** @private @type {ReturnType<typeof setInterval>|null} */
	#ttlCheckInterval = null;
	/** @private @type {Object} */
	#config;
	/** @private @type {ReturnType<import('@shared/lib/async/AsyncOrchestrationService.js').AsyncOrchestrationService["createRunner"]>} */
	#runOrchestrated;

	/**
	 * Creates an instance of SecurityManager with enterprise observability integration.
	 *
	 * @param {Object} context - Configuration context
	 * @param {import('../HybridStateManager.js').default} context.stateManager - State manager instance
	 * @throws {Error} If stateManager or required services are missing
	 */
	constructor({ stateManager }) {
		if (!stateManager) {
			throw new Error(
				"SecurityManager requires stateManager for observability compliance"
			);
		}

		this.#stateManager = stateManager;
		this.#config = {
			ttlCheckIntervalMs: 60000, // 1 minute
			defaultTTL: 4 * 3600000, // 4 hours
			...stateManager.config.securityManagerConfig,
		};

		// Enterprise license validation for advanced security features
		this.#validateEnterpriseLicense();

		// Initialize orchestrated runner for all security operations
		const orchestrator = this.#stateManager.managers?.asyncOrchestrator;
		if (!orchestrator) {
			throw new Error(
				"AsyncOrchestrationService required for SecurityManager observability compliance"
			);
		}

		this.#runOrchestrated = orchestrator.createRunner({
			labelPrefix: "security.manager",
			actorId: "security_manager",
			eventType: "SECURITY_MANAGER_OPERATION",
			meta: {
				component: "SecurityManager",
			},
		});
	}

	/**
	 * Initializes the SecurityManager with dependency injection and TTL monitoring.
	 * Operations are orchestrated for complete observability.
	 *
	 * @returns {Promise<SecurityManager>} The initialized instance
	 */
	async initialize() {
		return this.#runOrchestrated(() => this.#executeInitialize(), {
			labelSuffix: "initialize",
			eventType: "SECURITY_MANAGER_INIT",
			meta: {
				ttlCheckInterval: this.#config.ttlCheckIntervalMs,
			},
		});
	}

	/**
	 * Sets user security context with automatic observation and TTL management.
	 *
	 * @param {string} userId - Unique user identifier
	 * @param {string} clearanceLevel - User's clearance level
	 * @param {Array<string>} [compartments=[]] - Security compartments
	 * @param {number} [ttl] - Time-to-live in milliseconds
	 * @returns {Promise<void>}
	 * @throws {Error} If userId or clearanceLevel are invalid
	 */
	async setUserContext(
		userId,
		clearanceLevel,
		compartments = [],
		ttl = this.#config.defaultTTL
	) {
		if (!userId || !clearanceLevel) {
			throw new Error("User ID and clearance level are required");
		}

		/* PERFORMANCE_BUDGET: 10ms */
		return this.#runOrchestrated(
			() =>
				this.#executeSetUserContext(
					userId,
					clearanceLevel,
					compartments,
					ttl
				),
			{
				labelSuffix: "setUserContext",
				eventType: "SECURITY_MANAGER_SET_CONTEXT",
				meta: {
					userId,
					clearanceLevel,
					compartmentCount: compartments.length,
					ttl,
				},
			}
		);
	}

	/**
	 * Clears the security context with automatic observation.
	 *
	 * @returns {Promise<void>}
	 */
	async clearUserContext() {
		/* PERFORMANCE_BUDGET: 5ms */
		return this.#runOrchestrated(() => this.#executeClearUserContext(), {
			labelSuffix: "clearUserContext",
			eventType: "SECURITY_MANAGER_CLEAR_CONTEXT",
		});
	}

	/**
	 * Validates read access with automatic observation and caching.
	 *
	 * @param {SecurityLabel} subject - Subject security context
	 * @param {SecurityLabel} object - Object being accessed
	 * @returns {Promise<boolean>} Whether access is allowed
	 */
	async canRead(subject, object) {
		/* PERFORMANCE_BUDGET: 2ms */
		return this.#runOrchestrated(
			() => this.#executeCanRead(subject, object),
			{
				labelSuffix: "canRead",
				eventType: "SECURITY_MANAGER_CAN_READ",
				meta: {
					subjectLevel: subject?.level,
					objectLevel: object?.level,
				},
			}
		);
	}

	/**
	 * Validates write access with automatic observation and caching.
	 *
	 * @param {SecurityLabel} subject - Subject security context
	 * @param {SecurityLabel} object - Object being accessed
	 * @returns {Promise<boolean>} Whether access is allowed
	 */
	async canWrite(subject, object) {
		/* PERFORMANCE_BUDGET: 2ms */
		return this.#runOrchestrated(
			() => this.#executeCanWrite(subject, object),
			{
				labelSuffix: "canWrite",
				eventType: "SECURITY_MANAGER_CAN_WRITE",
				meta: {
					subjectLevel: subject?.level,
					objectLevel: object?.level,
				},
			}
		);
	}

	/**
	 * Checks if a valid, non-expired security context exists.
	 *
	 * @returns {boolean} Whether context is valid
	 */
	hasValidContext() {
		return !!(this.#context && Date.now() < this.#context.expires);
	}

	/**
	 * Gets the current subject's security label for MAC operations.
	 *
	 * @returns {SecurityLabel} Subject's security label
	 */
	getSubject() {
		if (this.hasValidContext()) {
			return {
				level: this.#context.level,
				compartments: this.#context.compartments,
				userId: this.#context.userId,
				roles: this.#context.roles,
				tenantId: this.#context.tenantId,
			};
		}

		// Return default least-privileged label
		return {
			level: "public",
			compartments: new Set(),
			userId: null,
			roles: [],
			tenantId: null,
		};
	}

	/**
	 * Extracts security label from data object with polyinstantiation support.
	 *
	 * @param {Object} obj - Object to extract label from
	 * @param {Object} [context={}] - Additional context
	 * @param {string} [context.storeName] - Store name for polyinstantiation detection
	 * @returns {SecurityLabel} Object's security label
	 */
	getLabel(obj, context = {}) {
		if (!obj) {
			return { level: "public", compartments: new Set() };
		}

		// Check for polyinstantiation markers
		const isPolyinstantiated =
			context?.storeName === "objects_polyinstantiated" ||
			Object.hasOwn(obj, "classification_level");

		const level = isPolyinstantiated
			? obj.classification_level
			: obj.classification || "internal";

		const compartments = new Set(obj.compartments || []);

		return { level, compartments };
	}

	/**
	 * Gets authentication token with automatic access observation and license validation.
	 *
	 * @returns {string|null} Authentication token or null if not authenticated
	 * @throws {Error} If enterprise license required but not available
	 */
	getAuthToken() {
		if (!this.hasValidContext()) {
			return null;
		}

		// Enterprise license validation for advanced auth features
		const license = this.#stateManager.managers?.license;
		if (
			this.#context.level !== "public" &&
			!license?.hasFeature("enterprise_auth")
		) {
			throw new Error(
				"Enterprise license required for classified authentication tokens"
			);
		}

		// Emit token access event for security audit
		this.#stateManager.emit?.("security.token_accessed", {
			userId: this.#context.userId,
			level: this.#context.level,
			licenseValidated: !!license?.hasFeature("enterprise_auth"),
			timestamp: Date.now(),
			component: "SecurityManager",
		});

		// Placeholder: Real implementation would return secure token (e.g., JWT)
		return `auth-token-${this.#context.userId}-${Date.now()}`;
	}

	/**
	 * Provides direct access to the MAC engine instance.
	 *
	 * @returns {import('./MACEngine.js').MACEngine|null} MAC engine instance
	 */
	get mac() {
		return this.#mac;
	}

	/**
	 * Provides read-only access to current security context.
	 *
	 * @returns {SecurityContext|null} Current security context
	 */
	get context() {
		return this.#context ? { ...this.#context } : null;
	}

	/**
	 * Gets the current user's ID.
	 *
	 * @returns {string|null} User ID or null if not authenticated
	 */
	get userId() {
		return this.#context?.userId || null;
	}

	/**
	 * Gets the ready state of the manager.
	 *
	 * @returns {boolean} Whether manager is ready
	 */
	get isReady() {
		return this.#isReady;
	}

	/**
	 * Cleans up resources including TTL check interval.
	 */
	cleanup() {
		if (this.#ttlCheckInterval) {
			clearInterval(this.#ttlCheckInterval);
			this.#ttlCheckInterval = null;
		}
		this.#isReady = false;

		// Emit cleanup event
		this.#stateManager.emit?.("security.manager_cleanup", {
			timestamp: Date.now(),
			component: "SecurityManager",
		});
	}

	// ===== PRIVATE IMPLEMENTATION METHODS =====

	/**
	 * Validates enterprise license for advanced security features.
	 *
	 * @private
	 * @throws {Error} If required enterprise license is missing
	 */
	#validateEnterpriseLicense() {
		const license = this.#stateManager.managers?.license;

		if (!license?.hasFeature("advanced_security")) {
			// Emit license validation failure
			this.#stateManager.emit?.("security.license_validation_failed", {
				feature: "advanced_security",
				tier: "enterprise",
				component: "SecurityManager",
				error: "Missing required enterprise license feature",
				timestamp: Date.now(),
			});

			throw new Error(
				"Advanced security features require enterprise license"
			);
		}

		// Emit successful license validation
		this.#stateManager.emit?.("security.license_validated", {
			feature: "advanced_security",
			tier: "enterprise",
			component: "SecurityManager",
			timestamp: Date.now(),
		});
	}

	/**
	 * Executes SecurityManager initialization.
	 *
	 * @private
	 * @returns {Promise<SecurityManager>}
	 */
	async #executeInitialize() {
		// Initialize dependencies from state manager
		const managers = this.#stateManager.managers;
		this.#mac = managers?.macEngine || null;

		// Start TTL monitoring with orchestrated execution
		this.#startTTLMonitoring();
		this.#isReady = true;

		// Emit initialization event
		this.#stateManager.emit?.("security.manager_initialized", {
			hasMACEngine: !!this.#mac,
			ttlMonitoring: true,
			timestamp: Date.now(),
			component: "SecurityManager",
		});

		return this;
	}

	/**
	 * Executes user context setting with validation and audit trail.
	 *
	 * @private
	 * @param {string} userId - User identifier
	 * @param {string} clearanceLevel - User's clearance level
	 * @param {Array<string>} compartments - Security compartments
	 * @param {number} ttl - Time-to-live
	 * @returns {Promise<void>}
	 */
	async #executeSetUserContext(userId, clearanceLevel, compartments, ttl) {
		const previousContext = this.#context ? { ...this.#context } : null;

		this.#context = {
			userId,
			level: clearanceLevel,
			compartments: new Set(compartments),
			expires: Date.now() + ttl,
			roles: [], // Will be populated by role resolution
			tenantId: null, // Will be populated by tenant resolution
		};

		// Emit context set event
		this.#stateManager.emit?.("security.context_set", {
			userId,
			level: clearanceLevel,
			compartments: Array.from(this.#context.compartments),
			previousContext: previousContext
				? {
						userId: previousContext.userId,
						level: previousContext.level,
					}
				: null,
			ttl,
			timestamp: Date.now(),
			component: "SecurityManager",
		});

		// Emit state manager event for legacy compatibility
		this.#stateManager.emit?.("securityContextSet", { ...this.#context });
	}

	/**
	 * Executes user context clearing with audit trail.
	 *
	 * @private
	 * @returns {Promise<void>}
	 */
	async #executeClearUserContext() {
		if (!this.#context) {
			return; // No-op if already cleared
		}

		const previousContext = { ...this.#context };
		this.#context = null;

		// Emit context cleared event
		this.#stateManager.emit?.("security.context_cleared", {
			userId: previousContext.userId,
			level: previousContext.level,
			timestamp: Date.now(),
			component: "SecurityManager",
		});

		// Emit state manager event for legacy compatibility
		this.#stateManager.emit?.("securityContextCleared");
	}

	/**
	 * Executes read access validation with automatic observation.
	 *
	 * @private
	 * @param {SecurityLabel} subject - Subject security label
	 * @param {SecurityLabel} object - Object security label
	 * @returns {Promise<boolean>}
	 */
	async #executeCanRead(subject, object) {
		const allowed = this.#mac?.canRead(subject, object) || false;

		// Emit access decision event
		this.#stateManager.emit?.("security.access_decision", {
			operation: "read",
			subject: {
				level: subject.level,
				compartments: Array.from(subject.compartments || []),
			},
			object: {
				level: object.level,
				compartments: Array.from(object.compartments || []),
			},
			allowed,
			timestamp: Date.now(),
			component: "SecurityManager",
		});

		return allowed;
	}

	/**
	 * Executes write access validation with automatic observation.
	 *
	 * @private
	 * @param {SecurityLabel} subject - Subject security label
	 * @param {SecurityLabel} object - Object security label
	 * @returns {Promise<boolean>}
	 */
	async #executeCanWrite(subject, object) {
		const allowed = this.#mac?.canWrite(subject, object) || false;

		// Emit access decision event
		this.#stateManager.emit?.("security.access_decision", {
			operation: "write",
			subject: {
				level: subject.level,
				compartments: Array.from(subject.compartments || []),
			},
			object: {
				level: object.level,
				compartments: Array.from(object.compartments || []),
			},
			allowed,
			timestamp: Date.now(),
			component: "SecurityManager",
		});

		return allowed;
	}

	/**
	 * Starts TTL monitoring with orchestrated execution.
	 *
	 * @private
	 */
	#startTTLMonitoring() {
		if (this.#ttlCheckInterval) {
			clearInterval(this.#ttlCheckInterval);
		}

		this.#ttlCheckInterval = setInterval(() => {
			// Run TTL checks through orchestrator for observability
			this.#runOrchestrated(() => this.#checkContextTTL(), {
				labelSuffix: "ttlCheck",
				eventType: "SECURITY_MANAGER_TTL_CHECK",
			}).catch(() => {
				// Silent failure for TTL checks to avoid blocking
			});
		}, this.#config.ttlCheckIntervalMs);
	}

	/**
	 * Checks context TTL and clears expired contexts.
	 *
	 * @private
	 * @returns {Promise<void>}
	 */
	#checkContextTTL() {
		if (this.#context && !this.hasValidContext()) {
			const expiredUserId = this.#context.userId;

			// Emit context expiration event
			this.#stateManager.emit?.("security.context_expired", {
				userId: expiredUserId,
				level: this.#context.level,
				timestamp: Date.now(),
				component: "SecurityManager",
			});

			// Clear expired context
			return this.clearUserContext();
		}
	}
}

export default SecurityManager;
