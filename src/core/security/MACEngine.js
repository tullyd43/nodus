// src/core/security/MACEngine.js
// Bell–LaPadula: simple lattice with dominance relation

/**
 * Implements a Mandatory Access Control (MAC) engine based on the Bell-LaPadula model.
 * It enforces "no read up" and "no write down" rules based on security levels and compartments.
 * This ensures that information flows only in authorized directions within the security lattice.
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
	 * @type {import('./SecurityManager.js').default|null}
	 */
	#securityManager = null;

	/**
	 * Creates an instance of the MACEngine.
	 * @param {object} config - The configuration object for the engine.
	 * @param {import('../HybridStateManager.js').default} config.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		// V8.0 Parity: The MACEngine depends on the SecurityManager to get subject and object labels.
		// It is derived from the stateManager to ensure the correct instance is used.
		this.#securityManager = stateManager?.managers?.securityManager ?? null;
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
		const sl = MACEngine.#rank(subject.level);
		const ol = MACEngine.#rank(object.level);
		if (sl < 0 || ol < 0) return false;
		if (sl < ol) return false;
		return this.#isSuperset(
			subject.compartments,
			object.compartments ?? new Set()
		);
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
		const sl = MACEngine.#rank(subject.level);
		const ol = MACEngine.#rank(object.level);
		if (sl > ol) return false;
		return this.#isSubset(
			subject.compartments,
			object.compartments ?? new Set()
		);
	}

	/**
	 * Throws an error if the subject is not permitted to read the object.
	 * @param {object} subject - The subject's security label.
	 * @param {object} object - The object's security label.
	 * @throws {Error} If the read operation is denied ("MAC_DENY_READ").
	 */
	enforceNoReadUp(subject, object) {
		if (!this.canRead(subject, object)) throw new Error("MAC_DENY_READ");
	}

	/**
	 * Throws an error if the subject is not permitted to write to the object.
	 * @param {object} subject - The subject's security label.
	 * @param {object} object - The object's security label.
	 * @throws {Error} If the write operation is denied ("MAC_DENY_WRITE").
	 */
	enforceNoWriteDown(subject, object) {
		if (!this.canWrite(subject, object)) throw new Error("MAC_DENY_WRITE");
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
}

export default MACEngine;
