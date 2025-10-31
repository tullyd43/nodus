// src/core/security/MACEngine.js
// Bell–LaPadula: simple lattice with dominance relation

/**
 * Implements a Mandatory Access Control (MAC) engine based on the Bell-LaPadula model.
 * It enforces "no read up" and "no write down" rules based on security levels and compartments.
 * This ensures that information flows only in authorized directions within the security lattice.
 */
/**
 * @privateFields {#stateManager, #securityManager, #errorHelpers, #metrics, #cache}
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

	/**
	 * @private
	 * @type {import('../HybridStateManager.js').default}
	 */
	#stateManager;

	/**
	 * @private
	 * @type {import('./SecurityManager.js').SecurityManager|null}
	 */
	#securityManager = null;

	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;

	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;

	/** @private @type {import('../../managers/CacheManager.js').LRUCache|null} */
	#cache = null;

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
	 * This follows Mandate 1.2 for service initialization.
	 */
	initialize() {
		const managers = this.#stateManager.managers;
		// V8.0 Parity: The MACEngine depends on the SecurityManager to get subject/object labels.
		this.#securityManager = managers?.securityManager ?? null;
		this.#errorHelpers = managers?.errorHelpers ?? null;
		this.#metrics = this.#stateManager.metricsRegistry?.namespace("mac");

		// Mandate 4.1: All caches MUST be bounded.
		// This cache memoizes MAC check results to avoid re-computation in hot paths.
		this.#cache = managers.cacheManager.getCache("macChecks", {
			maxSize: 1024,
		});

		// V8.0 Parity: Mandate 4.3 - Apply performance measurement decorator to critical methods.
		// This standardizes metric collection for hot paths.
		const measure = (fn, name) =>
			this.#metrics?.measure(name, { component: "MACEngine" })(
				fn.bind(this)
			);

		if (this.#metrics) {
			this.canRead = measure(this.canRead, "canRead");
			this.canWrite = measure(this.canWrite, "canWrite");
		}
	}

	/**
	 * Checks if a subject can read an object based on the "No Read Up" rule.
	 * Access is granted if the subject's level is greater than or equal to the object's level,
	 * and the subject's compartments are a superset of the object's compartments.
	 * @param {object} subject - The subject's security label ({ level, compartments }).
	 * @param {object} object - The object's security label ({ level, compartments }).
	 * @returns {boolean} True if the read operation is permitted, false otherwise.
	 */
	canRead(subject, object) {
		// The @measure decorator handles timing and call counts.
		const cacheKey = `read::${this.#getCacheKey(subject, object)}`;
		if (this.#cache?.has(cacheKey)) {
			this.#metrics?.increment("canRead.cache_hit");
			return this.#cache.get(cacheKey);
		}

		const sl = MACEngine.#rank(subject.level);
		const ol = MACEngine.#rank(object.level);

		let result = false;
		if (sl >= 0 && ol >= 0 && sl >= ol) {
			result = this.#isSuperset(
				subject.compartments,
				object.compartments ?? new Set()
			);
		}

		this.#cache?.set(cacheKey, result);
		this.#metrics?.increment("decision.read", {
			result,
			subject_level: subject.level,
			object_level: object.level,
		});
		return result;
	}

	/**
	 * Checks if a subject can write to an object based on the "No Write Down" rule (axiomatic version).
	 * Access is granted if the subject's level is less than or equal to the object's level,
	 * and the subject's compartments are a subset of the object's compartments.
	 * @param {object} subject - The subject's security label ({ level, compartments }).
	 * @param {object} object - The object's security label ({ level, compartments }).
	 * @returns {boolean} True if the write operation is permitted, false otherwise.
	 */
	canWrite(subject, object) {
		// The @measure decorator handles timing and call counts.
		const cacheKey = `write::${this.#getCacheKey(subject, object)}`;
		if (this.#cache?.has(cacheKey)) {
			this.#metrics?.increment("canWrite.cache_hit");
			return this.#cache.get(cacheKey);
		}

		const sl = MACEngine.#rank(subject.level);
		const ol = MACEngine.#rank(object.level);

		let result = false;
		if (sl >= 0 && ol >= 0 && sl <= ol) {
			result = this.#isSubset(
				subject.compartments,
				object.compartments ?? new Set()
			);
		}

		this.#cache?.set(cacheKey, result);
		this.#metrics?.increment("decision.write", {
			result,
			subject_level: subject.level,
			object_level: object.level,
		});
		return result;
	}

	/**
	 * Throws an error if the subject is not permitted to read the object.
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
			// V8.0 Parity: Mandate 5.1 - Report specific errors for better diagnostics.
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
			// V8.0 Parity: Mandate 5.1 - Report specific errors for better diagnostics.
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
		// V8.0 Parity: Delegate label extraction to the SecurityManager, which is the authority on this.
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
