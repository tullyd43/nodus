// src/core/security/ClassificationCrypto.js
import { getCryptoDomain } from "./CryptoDomain.js";

/**
 * Provides classification-aware cryptographic services.
 * This class routes encryption and decryption operations to the correct cryptographic key
 * based on a data entity's security label (classification and compartments). It ensures
 * that data is protected with keys corresponding to its sensitivity level, a core
 * principle of data-at-rest security in multi-level systems.
 */
/**
 * @privateFields {#stateManager, #keyring, #errorHelpers, #metrics}
 */
export class ClassificationCrypto {
	// V8.0 Parity: Mandate 3.1 - All internal properties MUST be private.
	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('./KeyringAdapter.js').KeyringAdapter|null} */
	#keyring = null;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;

	/**
	 * Creates an instance of ClassificationCrypto.
	 * @param {object} context - The application context.
	 * @param {import('../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
	}

	/**
	 * Initializes the crypto service by deriving its dependencies from the state manager.
	 */
	initialize() {
		this.#keyring = this.#stateManager.managers.keyring;
		this.#errorHelpers = this.#stateManager.managers.errorHelpers;
		this.#metrics = this.#stateManager.metricsRegistry?.namespace("crypto");
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
		return this.#errorHelpers.tryAsync(
			async () => {
				const payload =
					storeName === "objects_polyinstantiated"
						? (entity.instance_data ?? {})
						: entity;
				const plaintextBytes = new TextEncoder().encode(
					JSON.stringify(payload)
				);
				return this.encrypt(label, plaintextBytes);
			},
			{
				component: "ClassificationCrypto",
				operation: "encryptEntity",
				context: {
					storeName,
					classification: label.classification,
					entityId: entity.id,
				},
			}
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
		return this.#errorHelpers.tryAsync(
			async () => {
				const bytes = await this.decrypt(label, envelope);
				const decoded = JSON.parse(new TextDecoder().decode(bytes));
				return decoded; // Caller handles placement
			},
			{
				component: "ClassificationCrypto",
				operation: "decryptEntity",
				context: {
					storeName,
					classification: label.classification,
					kid: envelope?.kid,
				},
			}
		);
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
		const timer = this.#metrics?.timer("encrypt.duration", {
			classification: label.classification,
		});
		try {
			const domain = getCryptoDomain(label);
			const key = await this.#keyring.getKey(domain);
			if (!key?.encrypt) {
				throw new Error(
					`No valid encryption key found for domain: ${domain}`
				);
			}
			return await key.encrypt(plaintextBytes);
		} catch (error) {
			this.#metrics?.increment("encrypt.errors");
			this.#errorHelpers?.report(error, {
				component: "ClassificationCrypto",
				operation: "encrypt",
			});
			throw error; // Re-throw to allow the caller's try/catch to handle it.
		} finally {
			timer?.stop();
		}
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
		const timer = this.#metrics?.timer("decrypt.duration", {
			classification: label.classification,
		});
		try {
			const domain = getCryptoDomain(label);
			const key = await this.#keyring.getKey(domain);
			if (!key?.decrypt) {
				throw new Error(
					`No valid decryption key found for domain: ${domain}`
				);
			}
			return await key.decrypt(envelope);
		} catch (error) {
			this.#metrics?.increment("decrypt.errors");
			this.#errorHelpers?.report(error, {
				component: "ClassificationCrypto",
				operation: "decrypt",
			});
			throw error;
		} finally {
			timer?.stop();
		}
	}
}
