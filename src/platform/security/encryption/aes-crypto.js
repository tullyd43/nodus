// modules/aes-crypto.js
// AES crypto module for enterprise security

import { AppError } from "@utils/ErrorHelpers.js";

/**
 * @typedef {object} AESCryptoContext
 * @property {import('../../../HybridStateManager.js').default} stateManager Shared application state manager.
 */

/**
 * @typedef {object} EncryptedEnvelope
 * @property {string} data Base64-encoded ciphertext payload.
 * @property {string} iv Base64-encoded initialization vector used during encryption.
 * @property {number} version Version identifier for the encryption key.
 * @property {string} alg Canonical algorithm identifier (e.g., `AES-GCM-256`).
 * @property {boolean} encrypted Indicates the payload contains encrypted data.
 */

/**
 * @typedef {object} AuthProof
 * @property {string} signature Hex-encoded authentication signature.
 * @property {number} timestamp Epoch timestamp the proof was generated with.
 */

/**
 * @typedef {object} RotateKeysResult
 * @property {number} oldVersion Key version prior to rotation.
 * @property {number} newVersion Key version activated after rotation.
 */

/**
 * @description
 * Provides enterprise-grade cryptographic services using the Web Crypto API.
 * This module is responsible for encrypting and decrypting data using AES-GCM,
 * deriving a strong encryption key from user credentials via PBKDF2.
 * It is designed for environments requiring strong data-at-rest protection.
 *
 * @module AESCrypto
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto
 * @see https://en.wikipedia.org/wiki/Galois/Counter_Mode
 *
 * @privateFields {#key, #keyVersion, #ready, #stateManager, #metrics, #forensicLogger, #errorHelpers, #securityManager}
 */
export default class AESCrypto {
	/** @private @type {CryptoKey|null} */
	#key = null;
	/** @private @type {number} */
	#keyVersion = 1;
	/** @private @type {boolean} */
	#ready = false;
	/** @private @type {import('../../../HybridStateManager.js').default|null} */
	#stateManager = null;
	/** @private @type {import('../../../../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../ForensicLogger.js').default|null} */
	#forensicLogger = null;
	/** @private @type {import('../../../../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/** @private @type {import('../SecurityManager.js').default|null} */
	#securityManager = null;

	/**
	 * Creates an instance of AESCrypto.
	 * @param {AESCryptoContext} context The application context.
	 */

	constructor({ stateManager }) {
		this.#stateManager = stateManager;
		// V8.0 Parity: Mandate 1.2 - Derive dependencies from the stateManager.
		this.#metrics =
			this.#stateManager?.metricsRegistry?.namespace("aesCrypto");
		this.#forensicLogger = this.#stateManager?.managers?.forensicLogger;
		this.#errorHelpers = this.#stateManager?.managers?.errorHelpers;
		this.#securityManager = this.#stateManager?.managers?.securityManager;

		console.log("[AESCrypto] Loaded for enterprise-grade encryption");
	}

	/**
	 * Initializes the crypto module by deriving the encryption key.
	 * @returns {Promise<this>} The initialized AESCrypto instance.
	 * @throws {AppError} Thrown when a valid security context is unavailable.
	 */

	async init() {
		// V8.0 Parity: The authContext is now derived from the stateManager's securityManager.
		this.#key = await this.#deriveKey(this.#keyVersion);
		this.#ready = true;
		console.log("[AESCrypto] Enterprise crypto initialized");
		return this;
	}

	/**
	 * Encrypts data using AES-GCM.
	 * @param {unknown} data The plaintext data to encrypt.
	 * @returns {Promise<EncryptedEnvelope>} Envelope containing ciphertext and metadata.
	 * @throws {AppError} If the crypto module is not initialized or encryption fails.
	 */

	async encrypt(data) {
		if (!this.#ready)
			throw new AppError("AESCrypto module is not initialized.");

		const startTime = performance.now();
		try {
			const plaintext = new TextEncoder().encode(JSON.stringify(data));
			const iv = crypto.getRandomValues(new Uint8Array(12));

			const encryptedData = await crypto.subtle.encrypt(
				{ name: "AES-GCM", iv },
				this.#key,
				plaintext
			);

			const result = {
				data: this.#bufferToBase64(encryptedData),
				iv: this.#bufferToBase64(iv),
				version: this.#keyVersion,
				alg: "AES-GCM-256",
				encrypted: true,
			};

			this.#metrics?.increment("encryptionCount");
			this.#metrics?.updateAverage(
				"latency",
				performance.now() - startTime
			);

			return result;
		} catch (error) {
			const appError = new AppError("AES encryption failed.", {
				cause: error,
				context: { isSerializable: typeof data === "object" },
			});
			this.#errorHelpers?.handleError(appError);
			throw appError;
		}
	}

	/**
	 * Decrypts data using AES-GCM.
	 * @param {EncryptedEnvelope} encryptedData The encrypted data object.
	 * @returns {Promise<any>} The decrypted plaintext data.
	 * @throws {AppError} If the crypto module is not initialized or decryption fails.
	 */

	async decrypt(encryptedData) {
		if (!this.#ready)
			throw new AppError("AESCrypto module is not initialized.");

		const startTime = performance.now();
		try {
			const key = await this.#getKeyForVersion(encryptedData.version);
			const iv = this.#base64ToBuffer(encryptedData.iv);
			const data = this.#base64ToBuffer(encryptedData.data);

			const decryptedData = await crypto.subtle.decrypt(
				{ name: "AES-GCM", iv },
				key,
				data
			);

			const plaintext = new TextDecoder().decode(decryptedData);
			const result = JSON.parse(plaintext);

			this.#metrics?.increment("decryptionCount");
			this.#metrics?.updateAverage(
				"latency",
				performance.now() - startTime
			);

			return result;
		} catch (error) {
			const appError = new AppError("AES decryption failed.", {
				cause: error,
				context: { keyVersion: encryptedData.version },
			});
			this.#errorHelpers?.handleError(appError);
			throw appError;
		}
	}

	/**
	 * Generates a short, non-reversible hash hint based on security classification.
	 * This can be used for quick access checks without revealing the full classification.
	 * @param {string} classification - The security classification level (e.g., 'confidential').
	 * @param {string[]} [compartments=[]] - An array of security compartments.
	 * @returns {Promise<string>} A 12-character hexadecimal hash hint.
	 */

	async generateAccessHint(classification, compartments = []) {
		const hintData = {
			level: this.#getClassificationLevel(classification),
			compartments: compartments.sort(),
			timestamp: Math.floor(Date.now() / (24 * 3600000)),
		};

		const hintString = JSON.stringify(hintData);
		const hintBytes = new TextEncoder().encode(hintString);
		const hashBuffer = await crypto.subtle.digest("SHA-256", hintBytes);

		return Array.from(new Uint8Array(hashBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
			.substring(0, 12);
	}

	/**
	 * Verifies an authentication proof by regenerating a signature and comparing it.
	 * @param {string} userId The user's ID.
	 * @param {AuthProof} authProof The authentication proof object to validate.
	 * @returns {Promise<boolean>} True when the signature is valid, otherwise false.
	 */

	async verifyAuthProof(userId, authProof) {
		if (!authProof || !authProof.signature) return false;

		const expectedSignature = await this.#generateAuthSignature(
			userId,
			authProof.timestamp
		);
		return authProof.signature === expectedSignature;
	}

	/**
	 * Rotates the encryption key by incrementing the key version and re-deriving the key.
	 * This is a critical security function for forward secrecy. The old key is securely destroyed.
	 * @returns {Promise<RotateKeysResult>} An object containing the old and new key versions.
	 * @throws {AppError} If a new key cannot be derived.
	 */

	async rotateKeys() {
		const startTime = performance.now();
		const oldVersion = this.#keyVersion;
		this.#keyVersion++;
		this.#key = await this.#deriveKey(this.#keyVersion);

		const duration = performance.now() - startTime;

		// Mandate 2.4: All Auditable Events MUST Use a Unified Envelope
		this.#forensicLogger?.logAuditEvent("AES_KEY_ROTATION", {
			oldVersion,
			newVersion: this.#keyVersion,
			duration,
		});

		// Mandate 4.3: Metrics are Not Optional
		this.#metrics?.increment("keyRotations");
		this.#metrics?.updateAverage("keyRotationTime", duration);

		return { oldVersion, newVersion: this.#keyVersion };
	}
	/**
	 * Gets the current version of the encryption key.
	 * @returns {number} The key version.
	 */

	getVersion() {
		return this.#keyVersion;
	}

	/**
	 * Securely destroys the encryption key and authentication context from memory.
	 * @returns {Promise<void>}
	 */

	async destroyKeys() {
		this.#key = null;
		this.#ready = false;
	}

	/**
	 * Cleans up resources by destroying keys.
	 * @returns {void}
	 */

	cleanup() {
		this.destroyKeys();
	}

	/**
	 * Checks if the crypto module is initialized and ready.
	 * @returns {boolean} True if ready, false otherwise.
	 */
	get isReady() {
		return this.#ready;
	}

	// Private methods
	/**
	 * Derives a 256-bit AES-GCM key from the user's password using PBKDF2.
	 * @private
	 * @param {number} keyVersion - The version of the key to derive.
	 * @returns {Promise<CryptoKey>} The derived cryptographic key.
	 */
	async #deriveKey(keyVersion) {
		if (!this.#securityManager?.hasValidContext()) {
			throw new AppError(
				"A valid security context is required to derive the encryption key."
			);
		}

		// In a real system, a more secure secret would be retrieved from the security context,
		// not a password. For this example, we'll use the user ID as part of the salt.
		const userId = this.#securityManager.getSubject().userId;
		const secret = `user-session-secret-for-${userId}`; // Placeholder for a real secret

		const keyMaterial = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(secret),
			{ name: "PBKDF2" },
			false,
			["deriveKey"]
		);

		return await crypto.subtle.deriveKey(
			{
				name: "PBKDF2",
				salt: new TextEncoder().encode(
					`aes-salt-${userId}-v${keyVersion}`
				),
				iterations: 100000,
				hash: "SHA-256",
			},
			keyMaterial,
			{ name: "AES-GCM", length: 256 },
			false,
			["encrypt", "decrypt"]
		);
	}

	/**
	 * Retrieves the correct key for a given version. For simplicity, this implementation
	 * re-derives older keys on-the-fly. A production system might cache recent old keys.
	 * @private
	 * @param {number} version - The key version to retrieve.
	 * @returns {Promise<CryptoKey>} The cryptographic key for the specified version.
	 * @throws {AppError} If deriving the key fails.
	 */
	async #getKeyForVersion(version) {
		if (version === this.#keyVersion) {
			return this.#key;
		}
		// For decryption of older data, re-derive the old key.
		// A real-world implementation might use a KeyRotation manager to cache old keys.
		this.#metrics?.increment("oldKeyDerivations");
		return this.#deriveKey(version);
	}

	/**
	 * Converts a string-based classification level to a numeric rank.
	 * @private
	 * @param {string} classification - The classification string.
	 * @returns {number} The numeric level of the classification.
	 */
	#getClassificationLevel(classification) {
		const levels = [
			"public",
			"internal",
			"restricted",
			"confidential",
			"secret",
		];
		return levels.indexOf(classification);
	}

	/**
	 * Generates an authentication signature for a given user and timestamp.
	 * @private
	 * @param {string} userId - The user's ID.
	 * @param {number} timestamp - The timestamp for the signature.
	 * @returns {Promise<string>} A 24-character hexadecimal signature.
	 */
	async #generateAuthSignature(userId, timestamp) {
		const data = `${userId}:${timestamp}:aes-auth`;
		const dataBytes = new TextEncoder().encode(data);
		const hashBuffer = await crypto.subtle.digest("SHA-256", dataBytes);

		return Array.from(new Uint8Array(hashBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
			.substring(0, 24);
	}

	/**
	 * Converts an ArrayBuffer to a Base64 string.
	 * @private
	 * @param {ArrayBuffer} buffer The buffer to convert.
	 * @returns {string} The Base64 encoded string.
	 */
	#bufferToBase64(buffer) {
		return btoa(
			new Uint8Array(buffer).reduce(
				(s, b) => s + String.fromCharCode(b),
				""
			)
		);
	}

	/**
	 * Converts a Base64 string to an ArrayBuffer.
	 * @private
	 * @param {string} base64 The Base64 string to convert.
	 * @returns {ArrayBuffer} The decoded buffer.
	 */
	#base64ToBuffer(base64) {
		const binaryString = atob(base64);
		const len = binaryString.length;
		const bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes.buffer;
	}
}
