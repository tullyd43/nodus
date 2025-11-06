// src/core/security/Keyring.js
/**
 * Manages cryptographic keys in a temporary in-memory store.
 * This class is designed for development and testing purposes.
 * In a production environment, this implementation **must** be replaced with a robust
 * Hardware Security Module (HSM) or Key Management Service (KMS) like AWS KMS, Azure Key Vault, or GCP KMS
 * to ensure proper key security, rotation, and access control.
 */

/* eslint-disable nodus/require-async-orchestration */

import { AppError } from "@utils/ErrorHelpers.js";

/**
 * @privateFields {#stateManager, #cache, #metrics, #errorHelpers, #asyncService, #run}
 */
export class InMemoryKeyring {
	// Mandate 3.1: All internal properties MUST be private.
	/** @private @type {import('../HybridStateManager.js').default|null} */
	#stateManager = null;
	/** @private @type {import('../../services/cache/CacheManager.js').LRUCache|null} */
	#cache = null;
	/** @private @type {import('../../../shared/lib/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../../../shared/lib/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/** @private @type {ReturnType<import("@shared/lib/async/AsyncOrchestrationService.js").AsyncOrchestrationService["createRunner"]>} */
	#run;
	/** @private @type {import("@shared/lib/async/AsyncOrchestrationService.js").AsyncOrchestrationService|null} */
	#asyncService = null;

	static #DEFAULT_CACHE_SIZE = 128;

	/**
	 * @private
	 * @class A private nested class to represent a development key and its operations.
	 */
	static #DevKey = class {
		/** @private @type {CryptoKey} */
		#key;
		/** @public @type {string} */
		alg = "AES-GCM-256";
		/** @public @type {string} */
		kid;

		/**
		 * @param {CryptoKey} key - The raw AES-GCM key.
		 * @param {string} kid - The key identifier.
		 */
		constructor(key, kid) {
			this.#key = key;
			this.kid = kid;
		}

		/**
		 * Encrypts plaintext using AES-GCM.
		 * @param {Uint8Array} plaintext - The data to encrypt.
		 * @param {Uint8Array} [aad] - Additional authenticated data.
		 * @returns {Promise<object>} An encrypted envelope.
		 */
		async encrypt(plaintext, aad) {
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const ciphertext = await crypto.subtle.encrypt(
				{ name: "AES-GCM", iv, additionalData: aad },
				this.#key,
				plaintext
			);
			return {
				alg: this.alg,
				kid: this.kid,
				iv,
				ciphertext: new Uint8Array(ciphertext),
			};
		}

		/**
		 * Decrypts an envelope using AES-GCM.
		 * @param {object} envelope - The encrypted envelope object.
		 * @param {Uint8Array} [aad] - Additional authenticated data.
		 * @returns {Promise<Uint8Array>} The original plaintext.
		 */
		async decrypt(envelope, aad) {
			const plaintext = await crypto.subtle.decrypt(
				{ name: "AES-GCM", iv: envelope.iv, additionalData: aad },
				this.#key,
				envelope.ciphertext
			);
			return new Uint8Array(plaintext);
		}
	};

	/**
	 * The constructor is intentionally empty as no setup is needed.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
		this.#asyncService =
			this.#stateManager?.managers?.asyncOrchestrator ?? null;
		if (!this.#asyncService) {
			throw new AppError(
				"AsyncOrchestrationService is required for InMemoryKeyring."
			);
		}
		this.#run = this.#asyncService.createRunner({
			labelPrefix: "security.keyring",
			actorId: "keyring.service",
			eventType: "SECURITY_KEYRING_OPERATION",
			meta: { component: "InMemoryKeyring" },
		});
	}

	// Metric helpers: prefer ActionDispatcher, fallback to registry
	#metricKey(name) {
		const key = String(name || "");
		if (key.startsWith("keyring") || key.startsWith("keyring.")) return key;
		return `keyring.${key}`;
	}

	#incrementMetric(name, value = 1) {
		const dispatcher = this.#stateManager?.managers?.actionDispatcher;
		const key = this.#metricKey(name);
		try {
			if (dispatcher?.dispatch) {
				dispatcher.dispatch("metrics.increment", { key, value });
				return;
			}
		} catch {
			// swallow
		}
		try {
			this.#metrics?.increment?.(key, value);
		} catch {
			// swallow
		}
	}

	/**
	 * Initializes the keyring by setting up its cache and metrics dependencies.
	 */
	initialize() {
		const managers = this.#stateManager?.managers;
		if (!managers?.cacheManager) {
			throw new Error("[InMemoryKeyring] CacheManager is not available.");
		}
		// Mandate 4.1: All caches MUST be bounded.
		this.#cache = managers.cacheManager.getCache("inMemoryKeys", {
			maxSize: InMemoryKeyring.#DEFAULT_CACHE_SIZE,
		});
		this.#metrics =
			this.#stateManager.metricsRegistry?.namespace("keyring");
		this.#errorHelpers = managers.errorHelpers;
	}

	/**
	 * Retrieves a cryptographic key for a given security domain.
	 * If a key for the specified domain does not exist in the keyring, a placeholder
	 * key object with mock encryption and decryption functions is generated and stored.
	 *
	 * @param {string} domain - The security domain for which to retrieve the key (e.g., "secret::alpha+beta").
	 * @returns {Promise<object>} A promise that resolves to a key object.
	 *   The key object has the following structure:
	 *   - `alg`: {string} The algorithm (e.g., "AES-256-GCM").
	 *   - `kid`: {string} The Key ID (e.g., "dev:secret::alpha+beta").
	 *   - `encrypt`: {Function} An asynchronous function to encrypt plaintext.
	 *   - `decrypt`: {Function} An asynchronous function to decrypt an envelope.
	 */
	getKey(domain) {
		const execute = () => {
			const task = async () => {
				if (this.#cache.has(domain)) {
					this.#incrementMetric("get.cache_hit");
					return this.#cache.get(domain);
				}

				this.#incrementMetric("get.cache_miss");
				const timer = this.#metrics?.timer("get.generation_duration");

				const kid = `dev:${domain}`;
				// Generate a real AES-GCM key for development use.
				const key = await crypto.subtle.generateKey(
					{ name: "AES-GCM", length: 256 },
					true, // extractable
					["encrypt", "decrypt"]
				);

				// V8.0 Parity: Encapsulate key operations in a dedicated private class.
				const devKey = new InMemoryKeyring.#DevKey(key, kid);
				this.#cache.set(domain, devKey);

				timer?.stop();
				return devKey;
			};

			if (this.#errorHelpers?.tryAsync) {
				return this.#errorHelpers.tryAsync(task, {
					component: "InMemoryKeyring",
					operation: "getKey",
					context: { domain },
				});
			}

			return task();
		};

		return this.#run(execute, {
			labelSuffix: "getKey",
			meta: { domain },
		});
	}

	/**
	 * Derives or generates a stable cryptographic key for a given purpose and domain.
	 * For `InMemoryKeyring`, this generates a deterministic key pair for signing.
	 * @param {string} purpose - The purpose of the key (e.g., 'signing').
	 * @param {string} domain - The security domain for the key.
	 * @returns {Promise<CryptoKey|CryptoKeyPair>} A promise that resolves to the derived key or key pair.
	 */
	derive(purpose, domain) {
		const execute = () => {
			const task = async () => {
				const keyId = `${purpose}::${domain}`;
				if (this.#cache.has(keyId)) {
					this.#incrementMetric("derive.cache_hit");
					return this.#cache.get(keyId);
				}

				this.#incrementMetric("derive.cache_miss");
				const timer = this.#metrics?.timer(
					"derive.generation_duration"
				);

				if (purpose === "signing") {
					const keyPair = await crypto.subtle.generateKey(
						{
							name: "ECDSA",
							namedCurve: "P-384", // V8.0 Parity: Use a stronger curve for signing.
						},
						true, // extractable
						["sign", "verify"]
					);
					this.#cache.set(keyId, keyPair);
					timer?.stop();
					return keyPair;
				}

				throw new Error(
					`Unsupported purpose for key derivation: ${purpose}`
				);
			};

			if (this.#errorHelpers?.tryAsync) {
				return this.#errorHelpers.tryAsync(task, {
					component: "InMemoryKeyring",
					operation: "derive",
					context: { purpose, domain },
				});
			}

			return task();
		};

		return this.#run(execute, {
			labelSuffix: "derive",
			meta: { purpose, domain },
		});
	}
}
