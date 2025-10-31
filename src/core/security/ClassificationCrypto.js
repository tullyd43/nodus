// src/core/security/ClassificationCrypto.js
import { getCryptoDomain } from "./CryptoDomain.js";

/**
 * Provides classification-aware cryptographic services.
 * This class routes encryption and decryption operations to the correct cryptographic key
 * based on a data entity's security label (classification and compartments). It ensures
 * that data is protected with keys corresponding to its sensitivity level, a core
 * principle of data-at-rest security in multi-level systems.
 */
export class ClassificationCrypto {
	/** @private @type {import('../HybridStateManager.js').default|null} */
	/** @private @type {import('./KeyringAdapter.js').KeyringAdapter|null} */
	#keyring = null;

	/**
	 * Creates an instance of ClassificationCrypto.
	 * @param {object} config - The configuration object.
	 * @param {import('../HybridStateManager.js').default} config.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		// V8.0 Parity: The keyring is part of the storage instance's crypto module.
		// It is derived from the stateManager to ensure the correct instance (dev vs. prod) is used.
		this.#keyring =
			stateManager?.storage?.instance?._crypto?.keyring ?? null;

		if (!this.#keyring) {
			throw new Error(
				"[ClassificationCrypto] Keyring could not be derived from the state manager."
			);
		}
	}

	/**
	 * Encrypts a full entity object based on its security label.
	 * It correctly handles polyinstantiated objects by targeting the `instance_data` property.
	 * @param {string} storeName - The name of the store where the entity resides, used to detect polyinstantiation.
	 * @param {object} label - The security label of the entity.
	 * @param {string} label.classification - The classification level (e.g., 'secret').
	 * @param {string[]} [label.compartments] - An array of compartment strings.
	 * @param {object} entity - The entity object to encrypt.
	 * @returns {Promise<object>} A promise that resolves to the encrypted envelope object.
	 */
	async encryptEntity(storeName, label, entity) {
		const payload =
			storeName === "objects_polyinstantiated"
				? (entity.instance_data ?? {})
				: entity;
		return this.encrypt(
			label,
			new TextEncoder().encode(JSON.stringify(payload))
		);
	}

	/**
	 * Decrypts an entity from its envelope using the provided security label.
	 * @param {string} storeName - The name of the store where the entity resides. (Currently unused but maintained for API consistency).
	 * @param {object} label - The security label of the entity, used to derive the crypto domain.
	 * @param {string} label.classification - The classification level.
	 * @param {string[]} [label.compartments] - An array of compartment strings.
	 * @param {object} envelope - The encrypted envelope object.
	 * @returns {Promise<object>} A promise that resolves to the decrypted entity object.
	 */
	async decryptEntity(storeName, label, envelope) {
		const bytes = await this.decrypt(label, envelope);
		const decoded = JSON.parse(new TextDecoder().decode(bytes));
		return decoded; // Caller handles placement
	}

	/**
	 * Low-level method to encrypt raw bytes using a key derived from a security label.
	 * It determines the correct crypto domain, retrieves the corresponding key, and performs encryption.
	 * @param {object} label - The security label used to determine the crypto domain.
	 * @param {string} label.classification - The classification level.
	 * @param {string[]} [label.compartments] - An array of compartment strings.
	 * @param {Uint8Array} plaintextBytes - The raw data (as bytes) to encrypt.
	 * @returns {Promise<object>} A promise that resolves to the encrypted envelope.
	 */
	async encrypt(label, plaintextBytes) {
		const domain = getCryptoDomain(label);
		const key = await this.#keyring.getKey(domain);
		return key.encrypt(plaintextBytes);
	}

	/**
	 * Low-level method to decrypt an envelope into raw bytes using a key derived from a security label.
	 * It determines the correct crypto domain, retrieves the corresponding key, and performs decryption.
	 * @param {object} label - The security label used to determine the crypto domain.
	 * @param {string} label.classification - The classification level.
	 * @param {string[]} [label.compartments] - An array of compartment strings.
	 * @param {object} envelope - The encrypted envelope to decrypt.
	 * @returns {Promise<Uint8Array>} A promise that resolves to the decrypted raw data as bytes.
	 */
	async decrypt(label, envelope) {
		const domain = getCryptoDomain(label);
		const key = await this.#keyring.getKey(domain);
		return await key.decrypt(envelope);
	}
}
