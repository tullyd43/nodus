// src/core/security/CryptoDomain.js

/**
 * Maps a security label to a unique cryptographic domain string.
 * This canonical string is used to select the correct cryptographic key from the keyring,
 * ensuring cryptographic separation between data of different classifications and compartment sets.
 *
 * @param {object} label - The security label of the data.
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

	// V8.0 Parity: Sort compartments for a canonical representation, ensuring
	// ['A','B'] and ['B','A'] map to the same domain. Use `??` for safer defaults.
	const compKey =
		[...(compartments ?? [])].sort().join("+").toLowerCase() || "none";

	return `${base}::${compKey}`;
}
