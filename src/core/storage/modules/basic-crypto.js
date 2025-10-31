// src/core/storage/modules/basic-crypto.js
// BasicCrypto — foundational cryptographic module for Nodus storage systems.
// Handles lightweight encryption, hashing, and key generation utilities.
// This acts as a default fallback when higher-level (enterprise/NATO) crypto modules are not loaded.

/**
 * @description
 * BasicCrypto provides foundational cryptographic utilities for Nodus storage systems.
 * It serves as a default fallback for hashing and placeholder encryption when more
 * advanced crypto modules (like AESCrypto) are not loaded or required.
 *
 * @warning This module's encryption methods are **NOT SECURE** and are for placeholder/demonstration purposes only.
 * They should never be used to protect sensitive data in a production environment.
 * @module BasicCrypto
 */
export default class BasicCrypto {
	/**
	 * Configuration for the module.
	 * @private
	 * @type {object}
	 */
	#config;
	/** @private @type {import('../../HybridStateManager.js').default} */
	#stateManager;

	/**
	 * Creates an instance of BasicCrypto.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @param {object} [context.options={}] - Configuration options for the module.
	 */
	constructor({ stateManager, options = {} }) {
		this.#stateManager = stateManager;
		this.#config = options;
		console.log("[BasicCrypto] Loaded with config:", this.#config);
	}

	/**
	 * Initializes the BasicCrypto module. This is a stub implementation as no asynchronous setup is required.
	 * @returns {Promise<this>} The initialized instance.
	 */
	async init() {
		console.log("[BasicCrypto] Ready (stub implementation)");
		return this;
	}

	/**
	 * @description
	 * Hashes an input string using SHA-256.
	 * This is a one-way cryptographic hash function suitable for creating checksums or verifying data integrity.
	 *
	 * @param {string} input - The string to hash.
	 * @returns {Promise<string>} The resulting hash as a hexadecimal string.
	 * @example
	 * const crypto = new BasicCrypto();
	 * const hashed = await crypto.hash("hello world");
	 * // hashed will be "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
	 */
	async hash(input) {
		const metrics =
			this.#stateManager?.metricsRegistry?.namespace("basicCrypto");
		const startTime = performance.now();
		try {
			const data = new TextEncoder().encode(input);
			const hashBuffer = await crypto.subtle.digest("SHA-256", data);
			return Array.from(new Uint8Array(hashBuffer))
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
		} finally {
			const duration = performance.now() - startTime;
			metrics?.increment("hashCount");
			metrics?.updateAverage("hashTime", duration);
		}
	}

	/**
	 * @description
	 * A simple placeholder for encryption. It stringifies and base64-encodes the data.
	 *
	 * @warning This method provides **NO CONFIDENTIALITY**. It is easily reversible and should
	 * only be used for development, testing, or when the data being handled is public and non-sensitive.
	 *
	 * @param {any} data - The data to "encrypt".
	 * @returns {Promise<string>} The base64-encoded string, prefixed with "enc:".
	 */
	async encrypt(data) {
		const metrics =
			this.#stateManager?.metricsRegistry?.namespace("basicCrypto");
		const startTime = performance.now();
		try {
			const encoded = btoa(JSON.stringify(data));
			return `enc:${encoded}`;
		} finally {
			const duration = performance.now() - startTime;
			metrics?.increment("encryptionCount");
			metrics?.updateAverage("encryptionTime", duration);
		}
	}

	// 🔓 Simple decryption placeholder
	/**
	 * @description
	 * A simple placeholder for decryption. It base64-decodes and parses the JSON data.
	 *
	 * @warning This method provides **NO SECURITY**. It simply reverses the placeholder `encrypt` method.
	 *
	 * @param {string} payload - The "encrypted" payload, expected to start with "enc:".
	 * @returns {Promise<any>} The original data.
	 * @throws {Error} If the payload is malformed or does not start with "enc:".
	 */
	async decrypt(payload) {
		const metrics =
			this.#stateManager?.metricsRegistry?.namespace("basicCrypto");
		const startTime = performance.now();
		try {
			if (!payload.startsWith("enc:")) throw new Error("Invalid payload");
			const decoded = atob(payload.slice(4));
			return JSON.parse(decoded);
		} finally {
			const duration = performance.now() - startTime;
			metrics?.increment("decryptionCount");
			metrics?.updateAverage("decryptionTime", duration);
		}
	}
}
