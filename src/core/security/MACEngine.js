// src/core/security/MACEngine.js
// Bell–LaPadula: simple lattice with dominance relation

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
const rank = (lvl) => LEVELS.indexOf(String(lvl || "").toLowerCase());

export class MACEngine {
	constructor({ getUserClearance, getObjectLabel }) {
		// getUserClearance: () => { level: 'secret', compartments: Set<string> }
		// getObjectLabel:   (entity|label) => { level, compartments: Set<string> }
		this.getUserClearance = getUserClearance;
		this.getObjectLabel = getObjectLabel;
	}

	// No Read Up: subject.level >= object.level AND subject.compartments ⊇ object.compartments
	canRead(subject, object) {
		const sl = rank(subject.level),
			ol = rank(object.level);
		if (sl < 0 || ol < 0) return false;
		if (sl < ol) return false;
		return this.#isSuperset(subject.compartments, object.compartments);
	}

	// No Write Down: subject.level <= object.level AND subject.compartments ⊆ object.compartments
	canWrite(subject, object) {
		const sl = rank(subject.level),
			ol = rank(object.level);
		if (sl > ol) return false;
		return this.#isSubset(subject.compartments, object.compartments);
	}

	enforceNoReadUp(subject, object) {
		if (!this.canRead(subject, object)) throw new Error("MAC_DENY_READ");
	}
	enforceNoWriteDown(subject, object) {
		if (!this.canWrite(subject, object)) throw new Error("MAC_DENY_WRITE");
	}

	// Helpers with safe defaults
	subject() {
		const s = this.getUserClearance?.() || {};
		return {
			level: s.level || "unclassified",
			compartments: s.compartments || new Set(),
		};
	}
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

	#isSuperset(a, b) {
		a = a || new Set();
		for (const x of b || []) if (!a.has(x)) return false;
		return true;
	}
	#isSubset(a, b) {
		a = a || new Set();
		b = b || new Set();
		for (const x of a) if (!b.has(x)) return false;
		return true;
	}
}

export default MACEngine;
