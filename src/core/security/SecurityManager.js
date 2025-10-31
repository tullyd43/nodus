// src/core/security/SecurityManager.js
// Centralizes user context, security policies, and MAC enforcement.

import { MACEngine } from "./MACEngine.js";

/**
 * @description Manages the application's security context, including user identity,
 * clearance levels, and the enforcement of Mandatory Access Control (MAC) policies.
 * It serves as the single source of truth for the current subject's security profile.
 */
export class SecurityManager {
	/** @private @type {import('../HybridStateManager.js').HybridStateManager|null} */
	#stateManager;
	/** @private @type {object|null} The current user's security context. */
	#context = null;
	/** @private @type {MACEngine|null} The Mandatory Access Control engine. */
	#mac = null;
	/** @private @type {boolean} */
	#isReady = false;
	/** @private @type {ReturnType<typeof setInterval>|null} */
	#ttlCheckInterval = null; // V8.0 Parity: Use a more specific type for the interval ID.

	/**
	 * Creates an instance of SecurityManager.
	 * @param {object} context - The application context.
	 * @param {import('../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
		const options = stateManager?.config?.securityManagerConfig || {};

		this.config = {
			ttlCheckIntervalMs: 60000, // 1 minute
			...options,
		};
	}

	/**
	 * Initializes the SecurityManager and its MAC engine.
	 * @returns {Promise<this>} The initialized instance.
	 */
	async initialize() {
		if (this.#isReady) return this;

		// V8.0 Parity: Instantiate the MACEngine by passing the stateManager.
		// The MACEngine will then derive its own dependencies (like this SecurityManager) from it.
		this.#mac = new MACEngine({ stateManager: this.#stateManager });

		// Start periodic check for context expiration
		if (this.#ttlCheckInterval) clearInterval(this.#ttlCheckInterval);
		this.#ttlCheckInterval = setInterval(
			() => this.#checkContextTTL(),
			this.config.ttlCheckIntervalMs
		);

		this.#isReady = true;
		console.log("[SecurityManager] Initialized and ready.");
		return this;
	}

	/**
	 * Sets the current user's security context.
	 * @param {string} userId - The user's unique identifier.
	 * @param {string} clearanceLevel - The user's clearance level (e.g., 'secret').
	 * @param {string[]} [compartments=[]] - An array of security compartments.
	 * @param {number} [ttl=14400000] - Time-to-live for the context in ms (default: 4 hours).
	 */
	setUserContext(
		userId,
		clearanceLevel,
		compartments = [],
		ttl = 4 * 3600000
	) {
		if (!userId || !clearanceLevel) {
			throw new Error(
				"User ID and clearance level are required to set security context."
			);
		}

		this.#context = {
			userId,
			level: clearanceLevel,
			compartments: new Set(compartments || []),
			expires: Date.now() + ttl,
		};

		console.log(
			`[SecurityManager] User context set for ${userId} at level ${clearanceLevel}.`
		);
		this.#stateManager?.emit?.("securityContextSet", { ...this.#context });
	}

	/**
	 * Clears the current security context (e.g., on logout).
	 */
	clearUserContext() {
		if (!this.#context) return; // No-op if already cleared
		this.#context = null;
		console.log("[SecurityManager] User context cleared.");
		this.#stateManager?.emit?.("securityContextCleared");
	}

	/**
	 * Checks if a valid, non-expired security context is currently set.
	 * @returns {boolean} True if the context is valid.
	 */
	hasValidContext() {
		return this.#context && Date.now() < this.#context.expires;
	}

	/**
	 * Periodically checks if the context has expired and clears it if necessary.
	 * @private
	 */
	#checkContextTTL() {
		if (this.#context && !this.hasValidContext()) {
			console.warn(
				`[SecurityManager] Security context for user ${this.#context.userId} has expired. Clearing context.`
			);
			this.clearUserContext();
		}
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

		const isPoly =
			context?.storeName === "objects_polyinstantiated" ||
			"classification_level" in obj;
		const level =
			(isPoly ? obj.classification_level : obj.classification) ||
			"public";
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
	 * In a real system, this would be a JWT or similar secure token.
	 * @returns {string|null} The authentication token or null if not authenticated.
	 */
	getAuthToken() {
		if (!this.hasValidContext()) return null;
		// Placeholder: In a real implementation, this would be a secure token (e.g., JWT)
		// obtained during the authentication process.
		return `placeholder-token-for-user-${this.userId}`;
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
