/**
 * @file KeyringAdapter.js
 * @description Provides a bridge to switch between development (in-memory) and production (HSM) keyrings.
 * This allows the application to run with a simple, self-contained keyring during development
 * and switch to a secure, hardware-backed keyring for production without changing the core crypto logic.
 */

import { InMemoryKeyring } from "./Keyring.js";

/**
 * @class KeyringAdapter
 * @description Adapts the keyring implementation based on the operational mode ('dev' or 'prod').
 */
export class KeyringAdapter {
	/**
	 * Placeholder for a real Hardware Security Module (HSM) or Key Management Service (KMS) keyring.
	 * In a production environment, this class would be replaced with a real implementation
	 * that communicates with a secure key store.
	 * @private
	 * @class
	 */
	static #HSMKeyring = class {
		constructor(config) {
			console.warn(
				"[HSMKeyring] HSMKeyring is a placeholder and not secure for production."
			);
			// In a real implementation, this would connect to a KMS, HSM, or other secure key store.
		}
		async derive(purpose, classification) {
			// This would involve a call to the HSM/KMS.
			throw new Error("HSMKeyring.derive() is not implemented.");
		}
		async getKey(kid) {
			throw new Error("HSMKeyring.getKey() is not implemented.");
		}
	};

	/** @private @type {'dev'|'prod'} */
	#mode;
	/** @private @type {InMemoryKeyring|KeyringAdapter.#HSMKeyring} */
	#implementation;

	/**
	 * @param {object} context - The application context.
	 * @param {import('../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		if (!stateManager?.config) {
			throw new Error(
				"[KeyringAdapter] StateManager with a config object is required."
			);
		}

		// V8.0 Parity: The mode is determined by the stateManager's configuration.
		this.#mode = stateManager.config.demoMode ? "dev" : "prod";
		this.#implementation =
			this.#mode === "dev"
				? new InMemoryKeyring()
				: new KeyringAdapter.#HSMKeyring(stateManager.config);

		console.log(`[KeyringAdapter] Initialized in '${this.#mode}' mode.`);
	}

	/**
	 * Delegates the derive call to the active keyring implementation.
	 * @param {string} purpose - The purpose for the key (e.g., 'encryption', 'signing').
	 * @param {string} classification - The security classification level.
	 * @returns {Promise<CryptoKey>}
	 */
	async derive(purpose, classification) {
		return await this.#implementation.derive(purpose, classification);
	}

	/**
	 * Delegates the getKey call to the active keyring implementation.
	 * @param {string} domain - The security domain for the encryption key.
	 * @returns {Promise<object>}
	 */
	async getKey(domain) {
		// No special logging for dev mode here, as this can be very noisy.
		return await this.#implementation.getKey(domain);
	}
}
