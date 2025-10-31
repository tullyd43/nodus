// src/core/storage/modules/demo-crypto.js

/**
 * @description
 * This class provides non-secure, placeholder implementations for encryption and decryption,
 * primarily for demonstration or testing purposes where actual security is not required.
 *
 * @warning This module provides **NO SECURITY** and should never be used in a production environment.
 * @module DemoCrypto
 */
export default class DemoCrypto {
	/** @private @type {object} */
	#config;
	/** @private @type {import('../../HybridStateManager.js').default} */
	#stateManager;

	/**
	 * Creates an instance of DemoCrypto.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @param {object} [context.options={}] - Configuration options for the module.
	 */
	constructor({ stateManager, options = {} }) {
		this.#stateManager = stateManager;
		this.#config = options;
		console.log("[DemoCrypto] Loaded with config:", this.#config);
	}

	/**
	 * Initializes the module. This is a stub for API consistency.
	 * @description
	 * "Encrypts" data by wrapping it in a string representation. This is not real encryption and provides no confidentiality.
	 *
	 * @param {*} data - The data to be "encrypted".
	 * @returns {Promise<string>} A string representing the "encrypted" data.
	 */
	async encrypt(data) {
		const metrics =
			this.#stateManager?.metricsRegistry?.namespace("demoCrypto");
		const startTime = performance.now();
		try {
			console.log("[DemoCrypto] Encrypting data (demo):", data);
			return `encrypted(${JSON.stringify(data)})`;
		} finally {
			const duration = performance.now() - startTime;
			metrics?.increment("encryptionCount");
			metrics?.updateAverage("encryptionTime", duration);
		}
	}

	/**
	 * @description
	 * "Decrypts" data by parsing the string representation created by the `encrypt` method. This is not real decryption.
	 *
	 * @param {string} encryptedData - The "encrypted" data string.
	 * @returns {Promise<*>} The original data.
	 */
	async decrypt(encryptedData) {
		const metrics =
			this.#stateManager?.metricsRegistry?.namespace("demoCrypto");
		const startTime = performance.now();
		try {
			console.log("[DemoCrypto] Decrypting data (demo):", encryptedData);
			const match = encryptedData.match(/^encrypted\((.*)\)$/);
			if (match && match[1]) {
				return JSON.parse(match[1]);
			}
			return encryptedData;
		} finally {
			const duration = performance.now() - startTime;
			metrics?.increment("decryptionCount");
			metrics?.updateAverage("decryptionTime", duration);
		}
	}
}
