// src/core/security/MACEngine.js
// Bell–LaPadula: simple lattice with dominance relation

/**
 * An ordered array of security classification levels, from lowest to highest.
 * This array defines the lattice structure for the MAC engine.
 * @type {string[]}
 */
const LEVELS = [
	"public", // Equivalent to unclassified
	"internal",
	"unclassified", // Explicitly including for compatibility
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
 * Calculates the numeric rank of a given security level string.
 * A higher rank indicates a higher security level.
 * Returns -1 if the level is not found.
 * @param {string} lvl - The security level string (e.g., 'secret').
 * @returns {number} The numeric rank of the level.
 */
const rank = (lvl) => LEVELS.indexOf(String(lvl || "").toLowerCase());

/**
 * Implements a Mandatory Access Control (MAC) engine based on the Bell-LaPadula model.
 * It enforces "no read up" and "no write down" rules based on security levels and compartments.
 * This ensures that information flows only in authorized directions within the security lattice.
 */
export class MACEngine {
	/**
	 * Creates an instance of the MACEngine.
	 * @param {object} config - The configuration object for the engine.
	 * @param {Function} config.getUserClearance - A function that returns the current user's security clearance. Should return an object like `{ level: 'secret', compartments: Set<string> }`.
	 * @param {Function} config.getObjectLabel - A function that takes an entity or label and returns its security label. Should return an object like `{ level: 'confidential', compartments: Set<string> }`.
	 */
	constructor({ getUserClearance, getObjectLabel }) {
		/**
		 * A function to retrieve the current user's clearance.
		 * @type {Function}
		 * @private
		 */
		this.getUserClearance = getUserClearance;
		/**
		 * A function to retrieve an object's security label.
		 * @type {Function}
		 * @private
		 */
		this.getObjectLabel = getObjectLabel;
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
		const sl = rank(subject.level),
			ol = rank(object.level);
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
		const sl = rank(subject.level),
			ol = rank(object.level);
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
		const s = this.getUserClearance?.() || {};
		return {
			level: s.level || "unclassified",
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
		if (!obj) return { level: "unclassified", compartments: new Set() };
		const isPoly =
			storeName === "objects_polyinstantiated" ||
			Object.prototype.hasOwnProperty.call(obj, "classification_level");
		const level = isPoly
			? (obj.classification_level ?? obj.classification ?? "unclassified")
			: (obj.classification ?? "unclassified");
		const compartments = new Set(obj.compartments || []);
		return { level, compartments };
	}

	/**
	 * Checks if set 'a' is a superset of set 'b'.
	 * @param {Set<string>} a - The potential superset.
	 * @param {Set<string>} b - The potential subset.
	 * @returns {boolean} True if 'a' contains all elements of 'b'.
	 * @private
	 */
	#isSuperset(a, b) {
		a = a || new Set();
		for (const x of b) if (!a.has(x)) return false;
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
		a = a || new Set();
		b = b || new Set();
		for (const x of a) if (!b.has(x)) return false;
		return true;
	}
}

export default MACEngine;
