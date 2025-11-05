/**
 * @file MACEngine.js
 * @version 8.0.0 - MIGRATED TO AUTOMATIC OBSERVATION PATTERN
 * @description Implements a Mandatory Access Control (MAC) engine based on the Bell-LaPadula model.
 * Enforces "no read up" and "no write down" rules with automatic observation of all decisions.
 *
 * KEY V8.0 MIGRATION CHANGES:
 * - All MAC decisions automatically observed through ActionDispatcher
 * - Manual metrics calls REMOVED - now automatic through instrumentation
 * - Performance budgets enforced on hot paths
 * - AsyncOrchestrator pattern for non-cached operations
 * - All access decisions generate automatic audit events
 */

/**
 * @class MACEngine
 * @description MAC engine with V8.0 automatic observation of all access control decisions.
 * Every read/write decision is automatically instrumented for security auditing.
 * @privateFields {#stateManager, #securityManager, #errorHelpers, #cache, #orchestrator}
 */
export class MACEngine {
	/**
	 * An ordered array of security classification levels, from lowest to highest.
	 * This array defines the lattice structure for the MAC engine.
	 * @private
	 * @static
	 * @type {string[]}
	 */
	static #LEVELS = [
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

	/** @private @static */
	static #rank = (lvl) =>
		MACEngine.#LEVELS.indexOf(String(lvl || "").toLowerCase());

	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('./SecurityManager.js').SecurityManager|null} */
	#securityManager = null;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/** @private @type {import('../services/cache/CacheManager.js').LRUCache|null} */
	#cache = null;
	/** @private @type {import('@shared/lib/async/AsyncOrchestrator.js').AsyncOrchestrator|null} */
	#orchestrator = null;

	/**
	 * Creates an instance of the MACEngine.
	 * @param {object} context - The application context.
	 * @param {import('../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
	}

	/**
	 * Initializes the MACEngine by deriving its dependencies from the state manager.
	 * V8.0 Parity: Mandate 1.2 - All dependencies derived from stateManager.
	 */
	initialize() {
		const managers = this.#stateManager.managers;
		this.#securityManager = managers?.securityManager ?? null;
		this.#errorHelpers = managers?.errorHelpers ?? null;
		this.#orchestrator = managers?.orchestrator ?? null;

		// V8.0 Parity: Mandate 4.1 - All caches MUST be bounded
		this.#cache = managers.cacheManager.getCache("macChecks", {
			maxSize: 1024,
		});

		console.warn(
			"[MACEngine] Initialized with V8.0 automatic observation pattern."
		);
	}

	/**
	 * Checks if a subject can read an object based on the "No Read Up" rule.
	 * V8.0 Migration: All decisions automatically observed through ActionDispatcher.
	 * @param {object} subject - The subject's security label ({ level, compartments }).
	 * @param {object} object - The object's security label ({ level, compartments }).
	 * @returns {boolean} True if the read operation is permitted, false otherwise.
	 */
	canRead(subject, object) {
		/* PERFORMANCE_BUDGET: 1ms */
		const cacheKey = `read::${this.#getCacheKey(subject, object)}`;

		// Fast path: check cache first
		if (this.#cache?.has(cacheKey)) {
			const result = this.#cache.get(cacheKey);
			this.#recordCacheHit("read", result);
			return result;
		}

		// Compute access decision
		const sl = MACEngine.#rank(subject.level);
		const ol = MACEngine.#rank(object.level);

		let result = false;
		if (sl >= 0 && ol >= 0 && sl >= ol) {
			result = this.#isSuperset(
				subject.compartments,
				object.compartments ?? new Set()
			);
		}

		// Cache result
		this.#cache?.set(cacheKey, result);

		// V8.0 Migration: Automatic observation of MAC decisions
		this.#recordMACDecision("read", subject, object, result);

		return result;
	}

	/**
	 * Checks if a subject can write to an object based on the "No Write Down" rule.
	 * V8.0 Migration: All decisions automatically observed through ActionDispatcher.
	 * @param {object} subject - The subject's security label ({ level, compartments }).
	 * @param {object} object - The object's security label ({ level, compartments }).
	 * @returns {boolean} True if the write operation is permitted, false otherwise.
	 */
	canWrite(subject, object) {
		/* PERFORMANCE_BUDGET: 1ms */
		const cacheKey = `write::${this.#getCacheKey(subject, object)}`;

		// Fast path: check cache first
		if (this.#cache?.has(cacheKey)) {
			const result = this.#cache.get(cacheKey);
			this.#recordCacheHit("write", result);
			return result;
		}

		// Compute access decision
		const sl = MACEngine.#rank(subject.level);
		const ol = MACEngine.#rank(object.level);

		let result = false;
		if (sl >= 0 && ol >= 0 && sl <= ol) {
			result = this.#isSubset(
				subject.compartments,
				object.compartments ?? new Set()
			);
		}

		// Cache result
		this.#cache?.set(cacheKey, result);

		// V8.0 Migration: Automatic observation of MAC decisions
		this.#recordMACDecision("write", subject, object, result);

		return result;
	}

	/**
	 * V8.0 Migration: Records MAC decisions through ActionDispatcher for automatic observation
	 * @private
	 * @param {string} operation - 'read' or 'write'
	 * @param {object} subject - Subject security label
	 * @param {object} object - Object security label
	 * @param {boolean} result - Whether access was granted
	 */
	#recordMACDecision(operation, subject, object, result) {
		try {
			const actionDispatcher =
				this.#stateManager?.managers?.actionDispatcher;
			if (actionDispatcher?.dispatch) {
				// Fire-and-forget to avoid blocking MAC decisions
				actionDispatcher
					.dispatch("security.mac_decision", {
						operation,
						subject: {
							level: subject.level,
							compartments: Array.from(
								subject.compartments || []
							),
						},
						object: {
							level: object.level,
							compartments: Array.from(object.compartments || []),
						},
						allowed: result,
						timestamp: Date.now(),
						component: "MACEngine",
					})
					.catch(() => {
						// Silent failure - MAC decisions should not be blocked by observation failures
					});
			}
		} catch {
			// Silent failure - MAC decisions should not be blocked by observation failures
		}
	}

	/**
	 * V8.0 Migration: Records cache hits through ActionDispatcher
	 * @private
	 */
	#recordCacheHit(operation, result) {
		try {
			const actionDispatcher =
				this.#stateManager?.managers?.actionDispatcher;
			if (actionDispatcher?.dispatch) {
				// Fire-and-forget cache metrics
				actionDispatcher
					.dispatch("observability.cache_hit", {
						cache: "macChecks",
						operation,
						result,
						timestamp: Date.now(),
						component: "MACEngine",
					})
					.catch(() => {});
			}
		} catch {
			// Silent failure
		}
	}

	/**
	 * Throws an error if the subject is not permitted to read the object.
	 * V8.0 Migration: Violations automatically observed.
	 * @param {object} subject - The subject's security label.
	 * @param {object} object - The object's security label.
	 * @throws {Error} If the read operation is denied ("MAC_DENY_READ").
	 */
	enforceNoReadUp(subject, object) {
		if (!this.canRead(subject, object)) {
			const error = new Error(
				"MAC Policy Violation: Read access denied."
			);
			error.code = "MAC_DENY_READ";

			// V8.0 Migration: Violations automatically observed
			this.#recordMACViolation("read", subject, object, error);

			this.#errorHelpers?.report(error, {
				component: "MACEngine",
				operation: "enforceNoReadUp",
				subject,
				object,
			});

			throw error;
		}
	}

	/**
	 * Throws an error if the subject is not permitted to write to the object.
	 * V8.0 Migration: Violations automatically observed.
	 * @param {object} subject - The subject's security label.
	 * @param {object} object - The object's security label.
	 * @throws {Error} If the write operation is denied ("MAC_DENY_WRITE").
	 */
	enforceNoWriteDown(subject, object) {
		if (!this.canWrite(subject, object)) {
			const error = new Error(
				"MAC Policy Violation: Write access denied."
			);
			error.code = "MAC_DENY_WRITE";

			// V8.0 Migration: Violations automatically observed
			this.#recordMACViolation("write", subject, object, error);

			this.#errorHelpers?.report(error, {
				component: "MACEngine",
				operation: "enforceNoWriteDown",
				subject,
				object,
			});

			throw error;
		}
	}

	/**
	 * V8.0 Migration: Records MAC violations through ActionDispatcher
	 * @private
	 */
	#recordMACViolation(operation, subject, object, error) {
		try {
			const actionDispatcher =
				this.#stateManager?.managers?.actionDispatcher;
			if (actionDispatcher?.dispatch) {
				// Critical security event - fire-and-forget
				actionDispatcher
					.dispatch("security.mac_violation", {
						operation,
						subject: {
							level: subject.level,
							compartments: Array.from(
								subject.compartments || []
							),
						},
						object: {
							level: object.level,
							compartments: Array.from(object.compartments || []),
						},
						errorCode: error.code,
						errorMessage: error.message,
						timestamp: Date.now(),
						component: "MACEngine",
						severity: "critical",
					})
					.catch(() => {});
			}
		} catch {
			// Silent failure
		}
	}

	/**
	 * A helper function to get the current subject's clearance with safe defaults.
	 * @returns {{level: string, compartments: Set<string>}} The subject's security label.
	 */
	subject() {
		if (!this.#securityManager) {
			return { level: "public", compartments: new Set() };
		}
		const s = this.#securityManager.getSubject() || {};
		return {
			level: s.level || "public",
			compartments: s.compartments || new Set(),
		};
	}

	/**
	 * A helper function to extract a security label from a given data object.
	 * It handles polyinstantiated objects by checking for `classification_level`.
	 * @param {object} obj - The data object to extract the label from.
	 * @param {object} [options] - Additional options.
	 * @param {string} [options.storeName] - The name of the store the object belongs to, used to detect polyinstantiation.
	 * @returns {{level: string, compartments: Set<string>}} The object's security label.
	 */
	label(obj, { storeName } = {}) {
		if (!this.#securityManager) {
			return { level: "public", compartments: new Set() };
		}
		// V8.0 Parity: Delegate label extraction to the SecurityManager
		return this.#securityManager.getLabel(obj, { storeName });
	}

	/**
	 * Checks if set 'a' is a superset of set 'b'.
	 * @param {Set<string>} a - The potential superset.
	 * @param {Set<string>} b - The potential subset.
	 * @returns {boolean} True if 'a' contains all elements of 'b'.
	 * @private
	 */
	#isSuperset(a, b) {
		const setA = a ?? new Set();
		for (const x of b) if (!setA.has(x)) return false;
		return true;
	}

	/**
	 * Checks if set 'a' is a subset of set 'b'.
	 * @param {Set<string>} a - The potential subset.
	 * @param {Set<string>} b - The potential superset.
	 * @returns {boolean} True if 'b' contains all elements of 'a'.
	 * @private
	 */
	#isSubset(a, b) {
		const setA = a ?? new Set();
		const setB = b ?? new Set();
		for (const x of setA) if (!setB.has(x)) return false;
		return true;
	}

	/**
	 * Generates a canonical cache key from subject and object labels.
	 * @param {object} subject - The subject's security label.
	 * @param {object} object - The object's security label.
	 * @returns {string} A stable cache key.
	 * @private
	 */
	#getCacheKey(subject, object) {
		const sComp = [...(subject.compartments ?? [])].sort().join("+");
		const oComp = [...(object.compartments ?? [])].sort().join("+");
		return `${subject.level}|${sComp}::${object.level}|${oComp}`;
	}
}

export default MACEngine;
