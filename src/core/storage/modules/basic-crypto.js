// src/core/storage/modules/basic-crypto.js
// BasicCrypto — foundational cryptographic module for Nodus storage systems.
// Handles lightweight encryption, hashing, and key generation utilities.
// This acts as a default fallback when higher-level (enterprise/NATO) crypto modules are not loaded.

/**
 * BasicCrypto provides foundational cryptographic utilities for Nodus storage systems.
 * It serves as a default fallback for hashing and placeholder encryption when more
 * advanced crypto modules are not available.
 */
export default class BasicCrypto {
	/**
	 * Creates an instance of BasicCrypto.
	 * @param {object} [config={}] - Configuration options for the crypto module.
	 */
	constructor(config = {}) {
		/** @type {object} */
		this.config = config;
		console.log("[BasicCrypto] Initialized with config:", config);
	}

	/**
	 * Initializes the BasicCrypto module. This is a stub implementation.
	 * @returns {Promise<this>} The initialized instance.
	 */
	async init() {
		console.log("[BasicCrypto] Ready (stub implementation)");
		return this;
	}

	// 🔐 Simple hashing placeholder
	/**
	 * Hashes an input string using SHA-256.
	 * @param {string} input - The string to hash.
	 * @returns {Promise<string>} The resulting hash as a hexadecimal string.
	 */
	async hash(input) {
		const data = new TextEncoder().encode(input);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		return Array.from(new Uint8Array(hashBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	// 🔑 Simple encryption placeholder
	/**
	 * A simple placeholder for encryption. It stringifies and base64-encodes the data.
	 * This is NOT secure and should be replaced by a real encryption module in production.
	 * @param {any} data - The data to "encrypt".
	 * @returns {Promise<string>} The base64-encoded string, prefixed with "enc:".
	 */
	async encrypt(data) {
		const encoded = btoa(JSON.stringify(data));
		return `enc:${encoded}`;
	}

	// 🔓 Simple decryption placeholder
	/**
	 * A simple placeholder for decryption. It base64-decodes and parses the JSON data.
	 * This is NOT secure.
	 * @param {string} payload - The "encrypted" payload, expected to start with "enc:".
	 * @returns {Promise<any>} The original data.
	 * @throws {Error} If the payload is invalid.
	 */
	async decrypt(payload) {
		if (!payload.startsWith("enc:")) throw new Error("Invalid payload");
		const decoded = atob(payload.slice(4));
		return JSON.parse(decoded);
	}
}
