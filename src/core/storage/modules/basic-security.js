// src/core/storage/modules/basic-security.js

/**
 * A basic security module providing placeholder implementations for security checks.
 * This is intended for demonstration or development environments and does not provide
 * real security enforcement.
 */
export default class BasicSecurity {
	/**
	 * Creates an instance of BasicSecurity.
	 * @param {object} config - Configuration options for the module.
	 */
	constructor(config) {
		this.config = config;
		console.log("[BasicSecurity] Initialized with config:", config);
	}

	/**
	 * Checks if a user has permission to perform an action on a resource.
	 * This is a demo implementation and always returns true.
	 * @param {string} user - The user identifier.
	 * @param {string} action - The action being performed (e.g., 'read', 'write').
	 * @param {string} resource - The resource being accessed.
	 * @returns {Promise<boolean>} Always returns true.
	 */
	async checkPermission(user, action, resource) {
		console.log(
			`[BasicSecurity] Checking permission for user ${user} to ${action} ${resource}`
		);
		return true; // Always allow for demo
	}

	/**
	 * "Encrypts" data using a basic, non-secure method.
	 * @param {*} data - The data to "encrypt".
	 * @returns {Promise<string>} A string representing the "encrypted" data.
	 */
	async encrypt(data) {
		console.log("[BasicSecurity] Encrypting data (basic):", data);
		return `basic_encrypted(${JSON.stringify(data)})`;
	}

	/**
	 * "Decrypts" data that was "encrypted" by this module.
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
