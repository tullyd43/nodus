// src/core/storage/modules/demo-crypto.js

/**
 * A demonstration cryptography module.
 * This class provides non-secure, placeholder implementations for encryption and decryption,
 * primarily for demonstration or testing purposes where actual security is not required.
 * It should NOT be used in a production environment.
 */
export default class DemoCrypto {
	/**
	 * Creates an instance of DemoCrypto.
	 * @param {object} config - Configuration options for the module.
	 */
	constructor(config) {
		this.config = config;
		console.log("[DemoCrypto] Initialized with config:", config);
	}

	/**
	 * "Encrypts" data by wrapping it in a string representation. This is not real encryption.
	 * @param {*} data - The data to be "encrypted".
	 * @returns {Promise<string>} A string representing the "encrypted" data.
	 */
	async encrypt(data) {
		console.log("[DemoCrypto] Encrypting data (demo):", data);
		return `encrypted(${JSON.stringify(data)})`;
	}

	/**
	 * "Decrypts" data by parsing the string representation. This is not real decryption.
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
