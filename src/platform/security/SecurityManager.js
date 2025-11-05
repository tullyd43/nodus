/**
 * @file SecurityManager.js
 * @version 8.0.0 - MIGRATED TO AUTOMATIC OBSERVATION PATTERN
 * @description Manages the application's security context, including user identity,
 * clearance levels, and the enforcement of Mandatory Access Control (MAC) policies.
 *
 * KEY V8.0 MIGRATION CHANGES:
 * - All audit events now flow through ActionDispatcher (automatic observation)
 * - Manual forensicLogger.logAuditEvent() calls REMOVED
 * - Context changes trigger automatic security events
 * - AsyncOrchestrator pattern for all async operations
 * - Performance budgets on critical security paths
 */

/**
 * @class SecurityManager
 * @description Manages the application's security context with V8.0 automatic observation.
 * All security events are now automatically instrumented through ActionDispatcher.
 * @privateFields {#stateManager, #context, #mac, #isReady, #ttlCheckInterval, #errorHelpers, #metrics, #orchestrator}
 */
export class SecurityManager {
	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {object|null} The current user's security context. */
	#context = null;
	/** @private @type {import('./MACEngine.js').MACEngine|null} The Mandatory Access Control engine. */
	#mac = null;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('@shared/lib/async/AsyncOrchestrator.js').AsyncOrchestrator|null} */
	#orchestrator = null;
	/** @private @type {boolean} */
	#isReady = false;
	/** @private @type {ReturnType<typeof setInterval>|null} */
	#ttlCheckInterval = null;

	/**
	 * Creates an instance of SecurityManager.
	 * @param {object} context - The application context.
	 * @param {import('../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
		this.config = stateManager.config.securityManagerConfig || {
			ttlCheckIntervalMs: 60000,
		};
	}

	/**
	 * Initializes the SecurityManager by deriving dependencies and starting the TTL check.
	 * V8.0 Parity: Mandate 1.2 - All dependencies derived from stateManager.
	 * @returns {Promise<this>}
	 */
	async initialize() {
		// V8.0 Parity: Derive all dependencies from the stateManager
		const managers = this.#stateManager.managers;
		this.#mac = managers?.macEngine || null;
		this.#errorHelpers = managers?.errorHelpers || null;
		this.#metrics =
			this.#stateManager.metricsRegistry?.namespace("securityManager") ||
			null;
		this.#orchestrator = managers?.orchestrator || null;

		// Start periodic check for context expiration
		if (this.#ttlCheckInterval) clearInterval(this.#ttlCheckInterval);
		// Run TTL checks through orchestrator runner when available to comply with orchestration rule
		const ttlRunner = this.#orchestrator?.createRunner(
			"security_ttl_check"
		) || { run: (fn) => fn() };
		this.#ttlCheckInterval = setInterval(() => {
			ttlRunner.run(() => this.#checkContextTTL());
		}, this.config.ttlCheckIntervalMs);
		this.#isReady = true;

		console.warn(
			"[SecurityManager] Initialized with V8.0 automatic observation pattern."
		);
		return this;
	}

	/**
	 * Sets the current user's security context.
	 * V8.0 Migration: Uses ActionDispatcher for automatic audit events.
	 * @param {string} userId - The user's unique identifier.
	 * @param {string} clearanceLevel - The user's clearance level (e.g., 'secret').
	 * @param {string[]} [compartments=[]] - An array of security compartments.
	 * @param {number} [ttl=14400000] - Time-to-live for the context in ms (default: 4 hours).
	 */
	async setUserContext(
		userId,
		clearanceLevel,
		compartments = [],
		ttl = 4 * 3600000
	) {
		const runner = this.#orchestrator?.createRunner(
			"security_context_set"
		) || {
			run: (fn) => fn(),
		};

		/* PERFORMANCE_BUDGET: 10ms */
		return runner.run(() =>
			this.#runContextOperation("set", {
				userId,
				clearanceLevel,
				compartments,
				ttl,
			})
		);
	}

	/**
	 * Clears the current security context (e.g., on logout).
	 * V8.0 Migration: Uses ActionDispatcher for automatic audit events.
	 */
	async clearUserContext() {
		const runner = this.#orchestrator?.createRunner(
			"security_context_clear"
		) || {
			run: (fn) => fn(),
		};

		/* PERFORMANCE_BUDGET: 5ms */
		return runner.run(() => this.#runContextOperation("clear"));
	}

	/**
	 * V8.0 Migration: Centralized context operations that trigger automatic observations
	 * @private
	 */
	#runContextOperation(operation, params = {}) {
		return Promise.resolve().then(() => {
			switch (operation) {
				case "set":
					return this.#performSetContext(params);
				case "clear":
					return this.#performClearContext();
				default:
					throw new Error(`Unknown context operation: ${operation}`);
			}
		});
	}

	/**
	 * Internal implementation of setting user context
	 * @private
	 */
	#performSetContext({ userId, clearanceLevel, compartments, ttl }) {
		if (!userId || !clearanceLevel) {
			throw new Error(
				"User ID and clearance level are required to set security context."
			);
		}

		const previousContext = this.#context;
		this.#context = {
			userId,
			level: clearanceLevel,
			compartments: new Set(compartments || []),
			expires: Date.now() + ttl,
		};

		// V8.0 Migration: Automatic observation through ActionDispatcher
		this.#dispatchSecurityEvent("security.context_set", {
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
		});

		console.warn(
			`[SecurityManager] User context set for ${userId} at level ${clearanceLevel}.`
		);
		this.#stateManager?.emit?.("securityContextSet", { ...this.#context });
	}

	/**
	 * Internal implementation of clearing user context
	 * @private
	 */
	#performClearContext() {
		if (!this.#context) return; // No-op if already cleared

		const previousContext = { ...this.#context };
		this.#context = null;

		// V8.0 Migration: Automatic observation through ActionDispatcher
		this.#dispatchSecurityEvent("security.context_cleared", {
			userId: previousContext.userId,
			level: previousContext.level,
			clearedAt: Date.now(),
		});

		this.#stateManager?.emit?.("securityContextCleared");
		console.warn(
			`[SecurityManager] Security context cleared for user ${previousContext.userId}.`
		);
	}

	/**
	 * V8.0 Migration: Dispatch security events through ActionDispatcher for automatic observation
	 * @private
	 */
	#dispatchSecurityEvent(eventType, payload) {
		try {
			const actionDispatcher =
				this.#stateManager?.managers?.actionDispatcher;
			if (actionDispatcher?.dispatch) {
				// Fire-and-forget to avoid blocking security operations
				actionDispatcher
					.dispatch(eventType, {
						...payload,
						timestamp: Date.now(),
						component: "SecurityManager",
					})
					.catch((error) => {
						console.warn(
							"[SecurityManager] Failed to dispatch security event:",
							error
						);
					});
			}
		} catch (error) {
			console.warn(
				"[SecurityManager] ActionDispatcher not available for security event:",
				error
			);
		}
	}

	/**
	 * Checks if a valid, non-expired security context is currently set.
	 * @returns {boolean} True if the context is valid.
	 */
	hasValidContext() {
		return !!(this.#context && Date.now() < this.#context.expires);
	}

	/**
	 * Periodically checks if the context has expired and clears it if necessary.
	 * V8.0 Migration: Expiration events automatically observed.
	 * @private
	 */
	#checkContextTTL() {
		return Promise.resolve().then(() => {
			if (this.#context && !this.hasValidContext()) {
				const expiredUserId = this.#context.userId;
				console.warn(
					`[SecurityManager] Security context for user ${expiredUserId} has expired. Clearing context.`
				);

				// V8.0 Migration: Expiration is automatically observed
				this.#dispatchSecurityEvent("security.context_expired", {
					userId: expiredUserId,
					level: this.#context.level,
					expiredAt: Date.now(),
				});

				this.#metrics?.increment("context.expired");
				return this.clearUserContext();
			}
		});
	}

	/**
	 * Retrieves the current subject's (user's) security label for the MAC engine.
	 * @returns {{level: string, compartments: Set<string>}} The subject's label.
	 */
	getSubject() {
		if (this.hasValidContext()) {
			return {
				level: this.#context.level,
				compartments: this.#context.compartments,
			};
		}
		// Return a default, least-privileged label if no context is set.
		return { level: "public", compartments: new Set() };
	}

	/**
	 * Retrieves the security label from a data object for the MAC engine.
	 * @param {object} obj - The object to inspect.
	 * @param {object} [context={}] - Additional context, like the store name.
	 * @returns {{level: string, compartments: Set<string>}} The object's label.
	 */
	getLabel(obj, context = {}) {
		if (!obj) return { level: "public", compartments: new Set() };

		// V8.0 Parity: Robustly check for polyinstantiation markers.
		const isPoly =
			context?.storeName === "objects_polyinstantiated" ||
			Object.hasOwn(obj, "classification_level");

		const level =
			(isPoly ? obj.classification_level : obj.classification) ||
			"internal";
		const compartments = new Set(obj.compartments || []);

		return { level, compartments };
	}

	/**
	 * Provides direct access to the configured MACEngine instance.
	 * @returns {MACEngine|null} The MACEngine instance.
	 */
	get mac() {
		return this.#mac;
	}

	/**
	 * Provides direct access to the current user context.
	 * @returns {object|null} The user context.
	 */
	get context() {
		return this.#context;
	}

	/**
	 * Gets the ready state of the manager.
	 * @returns {boolean}
	 */
	get isReady() {
		return this.#isReady;
	}

	/**
	 * Gets the current user's ID.
	 * @returns {string|null}
	 */
	get userId() {
		return this.#context?.userId || null;
	}

	/**
	 * Retrieves an authentication token for the current user.
	 * V8.0 Migration: Token access automatically observed for security audits.
	 * @returns {string|null} The authentication token or null if not authenticated.
	 */
	getAuthToken() {
		if (!this.hasValidContext()) return null;

		// V8.0 Migration: Token access automatically observed
		this.#dispatchSecurityEvent("security.token_accessed", {
			userId: this.#context.userId,
			level: this.#context.level,
			accessedAt: Date.now(),
		});

		// Placeholder: In a real implementation, this would be a secure token (e.g., JWT)
		return `placeholder-token-for-user-${this.userId}`;
	}

	/**
	 * V8.0 Migration: Validates read access with automatic observation
	 * @param {object} subject - Subject security context
	 * @param {object} object - Object being accessed
	 * @returns {Promise<boolean>} Whether access is allowed
	 */
	async canRead(subject, object) {
		const runner = this.#orchestrator?.createRunner("mac_read_check") || {
			run: (fn) => fn(),
		};

		/* PERFORMANCE_BUDGET: 2ms */
		return runner.run(() => {
			const allowed = this.#mac?.canRead(subject, object) || false;

			// V8.0 Migration: Access decisions automatically observed
			this.#dispatchSecurityEvent("security.access_decision", {
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
			});

			return allowed;
		});
	}

	/**
	 * V8.0 Migration: Validates write access with automatic observation
	 * @param {object} subject - Subject security context
	 * @param {object} object - Object being accessed
	 * @returns {Promise<boolean>} Whether access is allowed
	 */
	async canWrite(subject, object) {
		const runner = this.#orchestrator?.createRunner("mac_write_check") || {
			run: (fn) => fn(),
		};

		/* PERFORMANCE_BUDGET: 2ms */
		return runner.run(() => {
			const allowed = this.#mac?.canWrite(subject, object) || false;

			// V8.0 Migration: Access decisions automatically observed
			this.#dispatchSecurityEvent("security.access_decision", {
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
			});

			return allowed;
		});
	}

	/**
	 * Cleans up resources, like the TTL check interval.
	 */
	cleanup() {
		if (this.#ttlCheckInterval) {
			clearInterval(this.#ttlCheckInterval);
			this.#ttlCheckInterval = null;
		}
		this.#isReady = false;
	}
}

export default SecurityManager;
