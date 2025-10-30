// src/core/security/SecurityManager.js
// Centralizes user context, security policies, and MAC enforcement.

import { MACEngine } from "./MACEngine.js";

/**
 * @description Manages the application's security context, including user identity,
 * clearance levels, and the enforcement of Mandatory Access Control (MAC) policies.
 * It serves as the single source of truth for the current subject's security profile.
 */
export class SecurityManager {
	/** @type {import('../HybridStateManager.js').HybridStateManager|null} */
	stateManager = null;
	/** @private @type {object|null} The current user's security context. */
	#context = null;
	/** @private @type {MACEngine|null} The Mandatory Access Control engine. */
	#mac = null;
	/** @private @type {boolean} */
	#ready = false;
	/** @private @type {number|null} */
	#ttlCheckInterval = null;

	/**
	 * Creates an instance of SecurityManager.
	 * @param {object} [options={}] Configuration options.
	 * @param {number} [options.ttlCheckIntervalMs=60000] - How often to check for expired contexts (ms).
	 */
	constructor(options = {}) {
		this.config = {
			ttlCheckIntervalMs: 60000, // 1 minute
			...options,
		};
	}

	/**
	 * Binds the HybridStateManager to this instance.
	 * @param {import('../HybridStateManager.js').HybridStateManager} manager - The state manager instance.
	 */
	bindStateManager(manager) {
		this.stateManager = manager;
	}

	/**
	 * Initializes the SecurityManager and its MAC engine.
	 * @returns {Promise<this>} The initialized instance.
	 */
	async initialize() {
		if (this.#ready) return this;

		// The MACEngine is instantiated here, using methods that will pull from
		// this manager's internal #context once it's set.
		this.#mac = new MACEngine({
			getUserClearance: () => this.getSubject(),
			getObjectLabel: (entity, context) => this.getLabel(entity, context),
		});

		// Start periodic check for context expiration
		if (this.#ttlCheckInterval) clearInterval(this.#ttlCheckInterval);
		this.#ttlCheckInterval = setInterval(
			() => this.#checkContextTTL(),
			this.config.ttlCheckIntervalMs
		);

		this.#ready = true;
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
		this.stateManager?.emit?.("securityContextSet", { ...this.#context });
	}

	/**
	 * Clears the current security context (e.g., on logout).
	 */
	clearUserContext() {
		if (!this.#context) return; // No-op if already cleared
		this.#context = null;
		console.log("[SecurityManager] User context cleared.");
		this.stateManager?.emit?.("securityContextCleared");
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
		return this.#ready;
	}

	/**
	 * Gets the current user's ID.
	 * @returns {string|null}
	 */
	get userId() {
		return this.#context?.userId || null;
	}

	/**
	 * Cleans up resources, like the TTL check interval.
	 */
	cleanup() {
		if (this.#ttlCheckInterval) {
			clearInterval(this.#ttlCheckInterval);
			this.#ttlCheckInterval = null;
		}
		this.#ready = false;
	}
}

export default SecurityManager;
