/**
 * @file ClassificationCrypto.js
 * @version 8.0.0 - MIGRATED TO AUTOMATIC OBSERVATION PATTERN
 * @description Provides classification-aware cryptographic services with V8.0 automatic observation.
 * Routes encryption and decryption operations to the correct cryptographic key based on security labels.
 *
 * KEY V8.0 MIGRATION CHANGES:
 * - All crypto operations automatically observed through ActionDispatcher
 * - Manual metrics calls REMOVED - now automatic through orchestrator
 * - Performance budgets enforced on encryption/decryption operations
 * - AsyncOrchestrator pattern for all async crypto operations
 * - All key access and crypto events generate automatic audit trails
 */

import { getCryptoDomain } from "./CryptoDomain.js";

/**
 * @class ClassificationCrypto
 * @description Classification-aware cryptographic services with V8.0 automatic observation.
 * All encryption and decryption operations are automatically instrumented for security auditing.
 * @privateFields {#stateManager, #keyring, #errorHelpers, #orchestrator}
 */
export class ClassificationCrypto {
	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('./KeyringAdapter.js').KeyringAdapter|null} */
	#keyring = null;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/** @private @type {import('@shared/lib/async/AsyncOrchestrator.js').AsyncOrchestrator|null} */
	#orchestrator = null;

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
	 * V8.0 Parity: Mandate 1.2 - All dependencies derived from stateManager.
	 */
	initialize() {
		const managers = this.#stateManager.managers;
		this.#keyring = managers?.keyring || null;
		this.#errorHelpers = managers?.errorHelpers || null;
		this.#orchestrator = managers?.orchestrator || null;

		console.warn(
			"[ClassificationCrypto] Initialized with V8.0 automatic observation pattern."
		);
	}

	/**
	 * Encrypts a full entity object based on its security label.
	 * V8.0 Migration: All encryption operations automatically observed.
	 * @param {string} storeName - The name of the store where the entity resides.
	 * @param {object} label - The security label of the entity.
	 * @param {object} entity - The entity object to encrypt.
	 * @returns {Promise<object>} A promise that resolves to the encrypted envelope object.
	 */
	async encryptEntity(storeName, label, entity) {
		const runner = this.#orchestrator?.createRunner(
			"crypto_encrypt_entity"
		) || {
			run: (fn) => fn(),
		};

		/* PERFORMANCE_BUDGET: 20ms */
		return runner.run(() =>
			this.#performEntityEncryption(storeName, label, entity)
		);
	}

	/**
	 * Internal entity encryption implementation
	 * @private
	 */
	#performEntityEncryption(storeName, label, entity) {
		return Promise.resolve()
			.then(() => {
				// V8.0 Migration: Entity encryption attempt automatically observed
				this.#dispatchCryptoEvent("crypto.entity_encryption_attempt", {
					storeName,
					classification: label.classification,
					compartments: label.compartments || [],
					entityId: entity?.id,
					isPolyinstantiated:
						storeName === "objects_polyinstantiated",
					timestamp: Date.now(),
				});

				const payload =
					storeName === "objects_polyinstantiated"
						? (entity.instance_data ?? {})
						: entity;

				const plaintextBytes = new TextEncoder().encode(
					JSON.stringify(payload)
				);
				return this.encrypt(label, plaintextBytes);
			})
			.then((envelope) => {
				// V8.0 Migration: Successful entity encryption automatically observed
				this.#dispatchCryptoEvent("crypto.entity_encrypted", {
					storeName,
					classification: label.classification,
					entityId: entity?.id,
					envelopeSize: JSON.stringify(envelope).length,
					timestamp: Date.now(),
				});

				return envelope;
			});
	}

	/**
	 * Decrypts an entity from its envelope using the provided security label.
	 * V8.0 Migration: All decryption operations automatically observed.
	 * @param {string} storeName - The name of the store where the entity resides.
	 * @param {object} label - The security label of the entity.
	 * @param {object} envelope - The encrypted envelope object.
	 * @returns {Promise<object>} A promise that resolves to the decrypted entity object.
	 */
	async decryptEntity(storeName, label, envelope) {
		const runner = this.#orchestrator?.createRunner(
			"crypto_decrypt_entity"
		) || {
			run: (fn) => fn(),
		};

		/* PERFORMANCE_BUDGET: 15ms */
		return runner.run(() =>
			this.#performEntityDecryption(storeName, label, envelope)
		);
	}

	/**
	 * Internal entity decryption implementation
	 * @private
	 */
	#performEntityDecryption(storeName, label, envelope) {
		return Promise.resolve()
			.then(() => {
				// V8.0 Migration: Entity decryption attempt automatically observed
				this.#dispatchCryptoEvent("crypto.entity_decryption_attempt", {
					storeName,
					classification: label.classification,
					compartments: label.compartments || [],
					kid: envelope?.kid,
					envelopeSize: JSON.stringify(envelope).length,
					timestamp: Date.now(),
				});

				return this.decrypt(label, envelope);
			})
			.then((bytes) => {
				const decoded = JSON.parse(new TextDecoder().decode(bytes));

				// V8.0 Migration: Successful entity decryption automatically observed
				this.#dispatchCryptoEvent("crypto.entity_decrypted", {
					storeName,
					classification: label.classification,
					decodedSize: JSON.stringify(decoded).length,
					timestamp: Date.now(),
				});

				return decoded;
			});
	}

	/**
	 * Low-level method to encrypt raw bytes using a key derived from a security label.
	 * V8.0 Migration: All encryption operations automatically observed.
	 * @param {object} label - The security label used to determine the crypto domain.
	 * @param {Uint8Array} plaintextBytes - The raw data (as bytes) to encrypt.
	 * @returns {Promise<object>} A promise that resolves to the encrypted envelope.
	 */
	async encrypt(label, plaintextBytes) {
		const runner = this.#orchestrator?.createRunner("crypto_encrypt") || {
			run: (fn) => fn(),
		};

		/* PERFORMANCE_BUDGET: 10ms */
		return runner.run(() => this.#performEncryption(label, plaintextBytes));
	}

	/**
	 * Internal encryption implementation
	 * @private
	 */
	#performEncryption(label, plaintextBytes) {
		return Promise.resolve()
			.then(() => {
				const domain = getCryptoDomain(label);

				// V8.0 Migration: Encryption attempt automatically observed
				this.#dispatchCryptoEvent("crypto.encryption_attempt", {
					classification: label.classification,
					compartments: label.compartments || [],
					domain,
					plaintextSize: plaintextBytes.length,
					timestamp: Date.now(),
				});

				return this.#keyring.getKey(domain);
			})
			.then((key) => {
				if (!key?.encrypt) {
					const domain = getCryptoDomain(label);
					throw new Error(
						`No valid encryption key found for domain: ${domain}`
					);
				}

				return key.encrypt(plaintextBytes);
			})
			.then((envelope) => {
				// V8.0 Migration: Successful encryption automatically observed
				this.#dispatchCryptoEvent("crypto.data_encrypted", {
					classification: label.classification,
					domain: getCryptoDomain(label),
					plaintextSize: plaintextBytes.length,
					envelopeSize: JSON.stringify(envelope).length,
					timestamp: Date.now(),
				});

				return envelope;
			})
			.catch((error) => {
				// V8.0 Migration: Encryption failure automatically observed
				this.#dispatchCryptoEvent("crypto.encryption_failed", {
					classification: label.classification,
					domain: getCryptoDomain(label),
					error: error.message,
					timestamp: Date.now(),
				});

				this.#errorHelpers?.report(error, {
					component: "ClassificationCrypto",
					operation: "encrypt",
				});

				throw error;
			});
	}

	/**
	 * Low-level method to decrypt an envelope into raw bytes using a key derived from a security label.
	 * V8.0 Migration: All decryption operations automatically observed.
	 * @param {object} label - The security label used to determine the crypto domain.
	 * @param {object} envelope - The encrypted envelope to decrypt.
	 * @returns {Promise<Uint8Array>} A promise that resolves to the decrypted raw data as bytes.
	 */
	async decrypt(label, envelope) {
		const runner = this.#orchestrator?.createRunner("crypto_decrypt") || {
			run: (fn) => fn(),
		};

		/* PERFORMANCE_BUDGET: 8ms */
		return runner.run(() => this.#performDecryption(label, envelope));
	}

	/**
	 * Internal decryption implementation
	 * @private
	 */
	#performDecryption(label, envelope) {
		return Promise.resolve()
			.then(() => {
				const domain = getCryptoDomain(label);

				// V8.0 Migration: Decryption attempt automatically observed
				this.#dispatchCryptoEvent("crypto.decryption_attempt", {
					classification: label.classification,
					compartments: label.compartments || [],
					domain,
					envelopeSize: JSON.stringify(envelope).length,
					timestamp: Date.now(),
				});

				return this.#keyring.getKey(domain);
			})
			.then((key) => {
				if (!key?.decrypt) {
					const domain = getCryptoDomain(label);
					throw new Error(
						`No valid decryption key found for domain: ${domain}`
					);
				}

				return key.decrypt(envelope);
			})
			.then((bytes) => {
				// V8.0 Migration: Successful decryption automatically observed
				this.#dispatchCryptoEvent("crypto.data_decrypted", {
					classification: label.classification,
					domain: getCryptoDomain(label),
					decryptedSize: bytes.length,
					timestamp: Date.now(),
				});

				return bytes;
			})
			.catch((error) => {
				// V8.0 Migration: Decryption failure automatically observed
				this.#dispatchCryptoEvent("crypto.decryption_failed", {
					classification: label.classification,
					domain: getCryptoDomain(label),
					error: error.message,
					timestamp: Date.now(),
				});

				this.#errorHelpers?.report(error, {
					component: "ClassificationCrypto",
					operation: "decrypt",
				});

				throw error;
			});
	}

	/**
	 * V8.0 Migration: Dispatch crypto events through ActionDispatcher for automatic observation
	 * @private
	 */
	#dispatchCryptoEvent(eventType, payload) {
		try {
			const actionDispatcher =
				this.#stateManager?.managers?.actionDispatcher;
			if (actionDispatcher?.dispatch) {
				// Fire-and-forget to avoid blocking crypto operations
				actionDispatcher
					.dispatch(eventType, {
						...payload,
						component: "ClassificationCrypto",
					})
					.catch(() => {
						// Silent failure - crypto operations should not be blocked by observation failures
					});
			}
		} catch {
			// Silent failure - crypto operations should not be blocked by observation failures
		}
	}
}
