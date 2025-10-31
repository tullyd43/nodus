// src/core/storage/modules/basic-crypto.js
// BasicCrypto — foundational cryptographic module for Nodus storage systems.

import { AppError } from "../../../utils/ErrorHelpers.js";
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
 *
 * @privateFields {#config, #stateManager, #metrics, #errorHelpers}
 */
export default class BasicCrypto {
	/** @private @type {import('../../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('../../../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../../../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;

	/**
	 * Creates an instance of BasicCrypto.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @param {object} [context.options={}] - Configuration options for the module.
	 */
	constructor({ stateManager, options = {} }) {
		this.#stateManager = stateManager;

		// V8.0 Parity: Mandate 1.2 - Derive dependencies from the stateManager.
		this.#metrics =
			this.#stateManager?.metricsRegistry?.namespace("basicCrypto");
		this.#errorHelpers = this.#stateManager?.managers?.errorHelpers;
	}

	/**
	 * Initializes the BasicCrypto module. This is a stub implementation as no asynchronous setup is required.
	 * @returns {Promise<this>} The initialized instance.
	 */
	async init() {
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
		const startTime = performance.now();
		try {
			const data = new TextEncoder().encode(input);
			const hashBuffer = await crypto.subtle.digest("SHA-256", data);
			return Array.from(new Uint8Array(hashBuffer))
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
		} finally {
			const duration = performance.now() - startTime;
			this.#metrics?.increment("hashCount");
			this.#metrics?.updateAverage("hashTime", duration);
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
		const startTime = performance.now();
		try {
			const encoded = btoa(JSON.stringify(data));
			return `enc:${encoded}`;
		} finally {
			const duration = performance.now() - startTime;
			this.#metrics?.increment("encryptionCount");
			this.#metrics?.updateAverage("encryptionTime", duration);
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
		const startTime = performance.now();
		try {
			if (typeof payload !== "string" || !payload.startsWith("enc:")) {
				throw new AppError(
					"Invalid or malformed payload for decryption."
				);
			}
			const decoded = atob(payload.slice(4));
			return JSON.parse(decoded);
		} catch (error) {
			const appError = new AppError("Basic decryption failed.", {
				cause: error,
			});
			this.#errorHelpers?.handleError(appError);
			throw appError;
		} finally {
			const duration = performance.now() - startTime;
			this.#metrics?.increment("decryptionCount");
			this.#metrics?.updateAverage("decryptionTime", duration);
		}
	}
}
