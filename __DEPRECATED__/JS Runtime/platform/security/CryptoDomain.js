// src/core/security/CryptoDomain.js

/**
 * @private
 * @description A simple, bounded cache for memoizing crypto domain strings.
 * This prevents re-computing the same domain string for frequently used labels.
 * @type {Map<string, string>}
 */
const domainCache = new Map();
const MAX_CACHE_SIZE = 256; // Limit cache size to prevent unbounded memory growth.

/**
 * Maps a security label to a unique cryptographic domain string.
 * This canonical string is used to select the correct cryptographic key from the keyring,
 * ensuring cryptographic separation between data of different classifications and compartment sets.
 * The result is memoized to improve performance on hot paths.
 *
 * @param {object} label - The security label of the data.
 * @param {string} label.classification - The classification level (e.g., 'secret').
 * @param {string[]} [label.compartments=[]] - An array of compartment strings.
 * @returns {string} A unique domain string, e.g., "secret::alpha+blue".
 */
export function getCryptoDomain({ classification, compartments = [] }) {
		if (!classification) {
		// Per Mandate 5.1, errors should be specific and helpful.
		throw new TypeError(
			"[getCryptoDomain] Classification is required to determine a crypto domain."
		);
	}

	const base = String(classification).toLowerCase();

	// V8.0 Parity: Sort compartments for a canonical representation, ensuring
	// ['A','B'] and ['B','A'] map to the same domain. Use `??` for safer defaults.
	const compKey =
		[...(compartments ?? [])].sort().join("+").toLowerCase() || "none";
	const cacheKey = `${base}::${compKey}`;

	if (domainCache.has(cacheKey)) return domainCache.get(cacheKey);

	if (domainCache.size >= MAX_CACHE_SIZE)
		domainCache.delete(domainCache.keys().next().value);
	domainCache.set(cacheKey, cacheKey);
	return cacheKey;
}
