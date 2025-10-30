// src/core/storage/modules/basic-security.js

/**
 * @description
 * A basic security module providing placeholder implementations for security checks and cryptography.
 * This is intended for demonstration or development environments where real security enforcement
 * is not required. It serves as a fallback when more advanced security modules are not loaded.
 *
 * @warning This module is **NOT SECURE**. It provides no real access control or encryption
 * and should never be used in a production environment.
 * @module BasicSecurity
 */
export default class BasicSecurity {
	/**
	 * Creates an instance of BasicSecurity.
	 * @param {object} [config={}] - Configuration options for the module.
	 */
	constructor(config = {}) {
		/**
		 * @private
		 * @type {object}
		 */
		this.config = config;
		console.log("[BasicSecurity] Initialized with config:", config);
	}

	/**
	 * @description
	 * Checks if a user has permission to perform an action on a resource.
	 *
	 * @warning This is a placeholder implementation and **always returns true**. It does not
	 * perform any actual permission checks.
	 *
	 * @param {string} user - The user identifier.
	 * @param {string} action - The action being performed (e.g., 'read', 'write').
	 * @param {string} resource - The resource being accessed.
	 * @returns {Promise<boolean>} A promise that always resolves to `true`.
	 */
	async checkPermission(user, action, resource) {
		console.log(
			`[BasicSecurity] Checking permission for user ${user} to ${action} ${resource}`
		);
		return true; // Always allow for demonstration purposes
	}

	/**
	 * @description
	 * A placeholder for encryption. It wraps the data in a simple string representation.
	 *
	 * @warning This method provides **NO CONFIDENTIALITY** and is easily reversible.
	 *
	 * @param {*} data - The data to "encrypt".
	 * @returns {Promise<string>} A string representing the "encrypted" data.
	 */
	async encrypt(data) {
		console.log("[BasicSecurity] Encrypting data (basic):", data);
		return `basic_encrypted(${JSON.stringify(data)})`;
	}

	/**
	 * @description
	 * A placeholder for decryption. It reverses the `encrypt` method's placeholder logic.
	 *
	 * @warning This method provides **NO SECURITY**.
	 *
	 * @param {string} encryptedData - The "encrypted" data string.
	 * @returns {Promise<*>} The original data.
	 */
	async decrypt(encryptedData) {
		console.log("[BasicSecurity] Decrypting data (basic):", encryptedData);
		const match = encryptedData.match(/^basic_encrypted\((.*)\)$/);
		if (match && match[1]) {
			return JSON.parse(match[1]);
		}
		return encryptedData;
	}
}
