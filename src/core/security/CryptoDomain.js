// src/core/security/CryptoDomain.js

/**
 * Maps a security label to a unique cryptographic domain string.
 * This string is used to select the correct Key Encryption Key (KEK) from a KMS/HSM
 * for envelope encryption, ensuring cryptographic separation between data of
 * different classifications and compartment sets.
 *
 * @param {object} label - The security label of the data.
 * @param {string} label.classification - The classification level (e.g., 'secret').
 * @param {string[]} [label.compartments=[]] - An array of compartment strings.
 * @returns {string} A unique domain string, e.g., "secret::alpha+blue".
 */
export function getCryptoDomain({ classification, compartments = [] }) {
	if (!classification) {
		throw new Error(
			"Classification is required to determine a crypto domain."
		);
	}

	const base = String(classification).toLowerCase();

	// Sort compartments for a canonical representation, ensuring
	// ['A','B'] and ['B','A'] map to the same domain.
	const safeCompartments = Array.isArray(compartments) ? compartments : [];
	const compKey =
		[...safeCompartments].sort().join("+").toLowerCase() || "none";

	return `${base}::${compKey}`;
}
