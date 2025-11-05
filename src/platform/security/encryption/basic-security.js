// src/core/storage/modules/basic-security.js

import { AppError } from "@utils/ErrorHelpers.js";

/**
 * @description
 * A basic security module providing placeholder implementations for security checks and cryptography.
 * This is intended for demonstration or development environments where real security enforcement
 * is not required. It serves as a fallback when more advanced security modules are not loaded.
 *
 * @warning This module is **NOT SECURE**. It provides no real access control or encryption
 * and should never be used in a production environment.
 * @module BasicSecurity
 *
 * @privateFields {#config, #stateManager, #metrics, #forensicLogger, #errorHelpers}
 */
export default class BasicSecurity {
	/** @private @type {import('../../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('../../../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../../ForensicLogger.js').default|null} */
	#forensicLogger = null;
	/** @private @type {import('../../../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;

	/**
	 * Creates an instance of BasicSecurity.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @param {object} [context.options={}] - Configuration options for the module.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;

		// V8.0 Parity: Mandate 1.2 - Derive dependencies from the stateManager.
		this.#metrics =
			this.#stateManager?.metricsRegistry?.namespace("basicSecurity");
		this.#forensicLogger = this.#stateManager?.managers?.forensicLogger;
		this.#errorHelpers = this.#stateManager?.managers?.errorHelpers;
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
		const startTime = performance.now();
		try {
			// Mandate 2.4: All auditable events MUST use a unified envelope.
			this.#forensicLogger?.logAuditEvent("BASIC_PERMISSION_CHECK", {
				user,
				action,
				resource,
				result: "allowed_by_default",
			});
			return true; // Always allow for demonstration purposes
		} finally {
			const duration = performance.now() - startTime;
			this.#metrics?.increment("permissionChecks");
			this.#metrics?.updateAverage("permissionCheckTime", duration);
		}
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
		const startTime = performance.now();
		try {
			return `basic_encrypted(${JSON.stringify(data)})`;
		} finally {
			const duration = performance.now() - startTime;
			this.#metrics?.increment("encryptionCount");
			this.#metrics?.updateAverage("encryptionTime", duration);
		}
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
		const startTime = performance.now();
		try {
			if (
				typeof encryptedData !== "string" ||
				!encryptedData.startsWith("basic_encrypted(")
			) {
				throw new AppError("Invalid payload for basic decryption.");
			}
			const match = encryptedData.match(/^basic_encrypted\((.*)\)$/);
			if (match && match[1]) {
				return JSON.parse(match[1]);
			}
			return encryptedData;
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
