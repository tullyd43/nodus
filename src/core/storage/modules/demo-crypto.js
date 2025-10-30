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
	/**
	 * Creates an instance of DemoCrypto.
	 * @param {object} [config={}] - Configuration options for the module.
	 */
	constructor(config = {}) {
		/**
		 * @private
		 * @type {object}
		 */
		this.config = config;
		console.log("[DemoCrypto] Initialized with config:", config);
	}

	/**
	 * @description
	 * "Encrypts" data by wrapping it in a string representation. This is not real encryption and provides no confidentiality.
	 *
	 * @param {*} data - The data to be "encrypted".
	 * @returns {Promise<string>} A string representing the "encrypted" data.
	 */
	async encrypt(data) {
		console.log("[DemoCrypto] Encrypting data (demo):", data);
		return `encrypted(${JSON.stringify(data)})`;
	}

	/**
	 * @description
	 * "Decrypts" data by parsing the string representation created by the `encrypt` method. This is not real decryption.
	 *
	 * @param {string} encryptedData - The "encrypted" data string.
	 * @returns {Promise<*>} The original data.
	 */
	async decrypt(encryptedData) {
		console.log("[DemoCrypto] Decrypting data (demo):", encryptedData);
		const match = encryptedData.match(/^encrypted\((.*)\)$/);
		if (match && match[1]) {
			return JSON.parse(match[1]);
		}
		return encryptedData;
	}
}
