/**
 * @file KeyringAdapter.js (DEPRECATED)
 * @description Provides a bridge to switch between development (in-memory) and production (HSM) keyrings.
 * This allows the application to run with a simple, self-contained keyring during development
 * and switch to a secure, hardware-backed keyring for production without changing the core crypto logic.
 */

import { InMemoryKeyring } from "./Keyring.js";

// V8.0 Parity: This file is now deprecated. The logic for selecting the correct keyring implementation
// has been moved to the ServiceRegistry. The ServiceRegistry now directly instantiates and provides
// the appropriate keyring (e.g., InMemoryKeyring) based on the application's configuration (demoMode).
// This change eliminates the violation of Mandate 1.2 (No Direct Instantiation) that was present
// in the old KeyringAdapter. Core services like ClassificationCrypto now receive the concrete
// keyring implementation directly from the stateManager's service registry.

/**
 * @class KeyringAdapter
 * @description Adapts the keyring implementation based on the operational mode ('dev' or 'prod').
 * @deprecated This class is no longer used. The ServiceRegistry now handles keyring selection.
 */
export class KeyringAdapter {
	/**
	 * @param {object} context - The application context.
	 * @param {import('../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		console.warn(
			"[KeyringAdapter] is deprecated and should not be instantiated. " +
				"The ServiceRegistry now provides the correct keyring implementation directly."
		);
		// Return a compliant, initialized InMemoryKeyring to prevent downstream breakages
		// during the transition period.
		const keyring = new InMemoryKeyring({ stateManager });
		keyring.initialize();
		return keyring;
	}
}
