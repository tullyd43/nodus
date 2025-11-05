/**
 * @file MACEngine.js
 * @version 8.0.0 - ENTERPRISE OBSERVABILITY MIGRATION
 * @description Mandatory Access Control (MAC) engine implementing Bell-LaPadula model
 * with automatic observability and performance optimization.
 *
 * Enforces "no read up" and "no write down" rules with complete audit trails
 * for all access control decisions. Critical for defense-grade security compliance.
 *
 * Key Features:
 * - Automatic observation of all MAC decisions through ActionDispatcher
 * - Performance-optimized caching with bounded LRU eviction
 * - Zero-tolerance security violations with automatic escalation
 * - Complete audit trails for compliance and forensic analysis
 *
 * @see {@link NODUS_DEVELOPER_MIGRATION_GUIDE.md} - MAC security observability requirements
 */

/**
 * @typedef {Object} SecurityLabel
 * @property {string} level - Security classification level
 * @property {Set<string>} compartments - Security compartments
 */

/**
 * @typedef {Object} MACDecision
 * @property {boolean} allowed - Whether access is granted
 * @property {string} operation - Type of operation ('read'|'write')
 * @property {SecurityLabel} subject - Subject security label
 * @property {SecurityLabel} object - Object security label
 * @property {string} reason - Decision rationale
 * @property {number} timestamp - Decision timestamp
 */

/**
 * Enterprise MAC engine with automatic observability and performance optimization.
 *
 * Implements the Bell-LaPadula mandatory access control model with complete
 * audit trails for all security decisions. All operations are automatically
 * instrumented for defense-grade compliance requirements.
 *
 * @class MACEngine
 */
export class MACEngine {
	/**
	 * Ordered security classification levels from lowest to highest.
	 * Defines the lattice structure for MAC enforcement.
	 *
	 * @private
	 * @static
	 * @type {Array<string>}
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

	/**
	 * Gets the numeric rank of a classification level.
	 *
	 * @private
	 * @static
	 * @param {string} level - Classification level
	 * @returns {number} Numeric rank (-1 if invalid)
	 */
	static #rank = (level) =>
		MACEngine.#LEVELS.indexOf(String(level || "").toLowerCase());

	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('../services/cache/CacheManager.js').LRUCache|null} */
	#cache = null;

	/**
	 * Creates an instance of MACEngine with enterprise observability integration.
	 *
	 * @param {Object} context - Configuration context
	 * @param {import('../HybridStateManager.js').default} context.stateManager - State manager instance
	 * @throws {Error} If stateManager is not provided
	 */
	constructor({ stateManager }) {
		if (!stateManager) {
			throw new Error(
				"MACEngine requires stateManager for observability compliance"
			);
		}

		this.#stateManager = stateManager;

		// Enterprise license validation for MAC enforcement
		this.#validateEnterpriseLicense();
	}

	/**
	 * Initializes the MAC engine with bounded caching and observability integration.
	 *
	 * @returns {void}
	 */
	initialize() {
		const managers = this.#stateManager.managers;

		// Initialize bounded cache for MAC decisions
		this.#cache = managers?.cacheManager?.getCache("macChecks", {
			maxSize: 1024,
			ttl: 5 * 60 * 1000, // 5 minute TTL
		});

		// Emit initialization event
		this.#stateManager.emit?.("security.mac_engine_initialized", {
			cacheEnabled: !!this.#cache,
			supportedLevels: MACEngine.#LEVELS.length,
			timestamp: Date.now(),
			component: "MACEngine",
		});
	}

	/**
	 * Evaluates read access under "No Read Up" rule with automatic observation.
	 *
	 * @param {SecurityLabel} subject - Subject's security label
	 * @param {SecurityLabel} object - Object's security label
	 * @returns {boolean} Whether read access is permitted
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

		// Compute MAC decision
		const result = this.#evaluateReadAccess(subject, object);

		// Cache result
		this.#cache?.set(cacheKey, result);

		// Automatic observation of MAC decision
		this.#recordMACDecision("read", subject, object, result);

		return result;
	}

	/**
	 * Evaluates write access under "No Write Down" rule with automatic observation.
	 *
	 * @param {SecurityLabel} subject - Subject's security label
	 * @param {SecurityLabel} object - Object's security label
	 * @returns {boolean} Whether write access is permitted
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

		// Compute MAC decision
		const result = this.#evaluateWriteAccess(subject, object);

		// Cache result
		this.#cache?.set(cacheKey, result);

		// Automatic observation of MAC decision
		this.#recordMACDecision("write", subject, object, result);

		return result;
	}

	/**
	 * Enforces read access with automatic violation tracking.
	 *
	 * @param {SecurityLabel} subject - Subject's security label
	 * @param {SecurityLabel} object - Object's security label
	 * @throws {Error} If read access is denied
	 */
	enforceNoReadUp(subject, object) {
		if (!this.canRead(subject, object)) {
			const error = new Error("MAC Policy Violation: Read access denied");
			error.code = "MAC_DENY_READ";

			// Automatic observation of MAC violation
			this.#recordMACViolation("read", subject, object, error);

			throw error;
		}
	}

	/**
	 * Enforces write access with automatic violation tracking.
	 *
	 * @param {SecurityLabel} subject - Subject's security label
	 * @param {SecurityLabel} object - Object's security label
	 * @throws {Error} If write access is denied
	 */
	enforceNoWriteDown(subject, object) {
		if (!this.canWrite(subject, object)) {
			const error = new Error(
				"MAC Policy Violation: Write access denied"
			);
			error.code = "MAC_DENY_WRITE";

			// Automatic observation of MAC violation
			this.#recordMACViolation("write", subject, object, error);

			throw error;
		}
	}

	/**
	 * Gets the current subject's security label with safe defaults.
	 *
	 * @returns {SecurityLabel} Subject's security label
	 */
	subject() {
		const securityManager = this.#stateManager.managers?.securityManager;

		if (!securityManager) {
			return { level: "public", compartments: new Set() };
		}

		const subject = securityManager.getSubject() || {};
		return {
			level: subject.level || "public",
			compartments: subject.compartments || new Set(),
		};
	}

	/**
	 * Extracts security label from a data object with polyinstantiation support.
	 *
	 * @param {Object} obj - Data object to extract label from
	 * @param {Object} [options={}] - Extraction options
	 * @param {string} [options.storeName] - Store name for polyinstantiation detection
	 * @returns {SecurityLabel} Object's security label
	 */
	label(obj, { storeName } = {}) {
		const securityManager = this.#stateManager.managers?.securityManager;

		if (!securityManager) {
			return { level: "public", compartments: new Set() };
		}

		return securityManager.getLabel(obj, { storeName });
	}

	// ===== PRIVATE IMPLEMENTATION METHODS =====

	/**
	 * Validates enterprise license for MAC enforcement features.
	 *
	 * @private
	 * @throws {Error} If required enterprise license is missing
	 */
	#validateEnterpriseLicense() {
		const license = this.#stateManager.managers?.license;

		if (!license?.hasFeature("mac_enforcement")) {
			// Emit license validation failure
			this.#stateManager.emit?.("security.license_validation_failed", {
				feature: "mac_enforcement",
				tier: "defense",
				component: "MACEngine",
				error: "Missing required defense-grade license feature",
				timestamp: Date.now(),
			});

			throw new Error("MAC enforcement requires defense-grade license");
		}

		// Emit successful license validation
		this.#stateManager.emit?.("security.license_validated", {
			feature: "mac_enforcement",
			tier: "defense",
			component: "MACEngine",
			timestamp: Date.now(),
		});
	}

	/**
	 * Evaluates read access under Bell-LaPadula "No Read Up" rule.
	 *
	 * @private
	 * @param {SecurityLabel} subject - Subject's security label
	 * @param {SecurityLabel} object - Object's security label
	 * @returns {boolean} Whether read access is permitted
	 */
	#evaluateReadAccess(subject, object) {
		const subjectRank = MACEngine.#rank(subject.level);
		const objectRank = MACEngine.#rank(object.level);

		// Invalid classifications default to denial
		if (subjectRank < 0 || objectRank < 0) {
			return false;
		}

		// Subject clearance must be >= object classification
		if (subjectRank < objectRank) {
			return false;
		}

		// Subject compartments must be superset of object compartments
		return this.#isSuperset(
			subject.compartments,
			object.compartments ?? new Set()
		);
	}

	/**
	 * Evaluates write access under Bell-LaPadula "No Write Down" rule.
	 *
	 * @private
	 * @param {SecurityLabel} subject - Subject's security label
	 * @param {SecurityLabel} object - Object's security label
	 * @returns {boolean} Whether write access is permitted
	 */
	#evaluateWriteAccess(subject, object) {
		const subjectRank = MACEngine.#rank(subject.level);
		const objectRank = MACEngine.#rank(object.level);

		// Invalid classifications default to denial
		if (subjectRank < 0 || objectRank < 0) {
			return false;
		}

		// Subject clearance must be <= object classification
		if (subjectRank > objectRank) {
			return false;
		}

		// Subject compartments must be subset of object compartments
		return this.#isSubset(
			subject.compartments,
			object.compartments ?? new Set()
		);
	}

	/**
	 * Records MAC decision through ActionDispatcher for automatic observation.
	 *
	 * @private
	 * @param {string} operation - Operation type ('read'|'write')
	 * @param {SecurityLabel} subject - Subject security label
	 * @param {SecurityLabel} object - Object security label
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
	 * Records cache hits through ActionDispatcher for performance monitoring.
	 *
	 * @private
	 * @param {string} operation - Operation type
	 * @param {boolean} result - Cached result
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
	 * Records MAC violations through ActionDispatcher for security escalation.
	 *
	 * @private
	 * @param {string} operation - Operation type
	 * @param {SecurityLabel} subject - Subject security label
	 * @param {SecurityLabel} object - Object security label
	 * @param {Error} error - Violation error
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
	 * Checks if set 'a' is a superset of set 'b'.
	 *
	 * @private
	 * @param {Set<string>} a - Potential superset
	 * @param {Set<string>} b - Potential subset
	 * @returns {boolean} Whether 'a' contains all elements of 'b'
	 */
	#isSuperset(a, b) {
		const setA = a ?? new Set();
		for (const element of b) {
			if (!setA.has(element)) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Checks if set 'a' is a subset of set 'b'.
	 *
	 * @private
	 * @param {Set<string>} a - Potential subset
	 * @param {Set<string>} b - Potential superset
	 * @returns {boolean} Whether 'b' contains all elements of 'a'
	 */
	#isSubset(a, b) {
		const setA = a ?? new Set();
		const setB = b ?? new Set();
		for (const element of setA) {
			if (!setB.has(element)) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Generates a canonical cache key from security labels.
	 *
	 * @private
	 * @param {SecurityLabel} subject - Subject security label
	 * @param {SecurityLabel} object - Object security label
	 * @returns {string} Stable cache key
	 */
	#getCacheKey(subject, object) {
		const subjectCompartments = [...(subject.compartments ?? [])]
			.sort()
			.join("+");
		const objectCompartments = [...(object.compartments ?? [])]
			.sort()
			.join("+");
		return `${subject.level}|${subjectCompartments}::${object.level}|${objectCompartments}`;
	}
}

export default MACEngine;
