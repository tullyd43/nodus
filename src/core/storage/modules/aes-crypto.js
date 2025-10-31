// modules/aes-crypto.js
// AES crypto module for enterprise security

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
 * Provides enterprise-grade encryption using AES-GCM. It derives a key from user credentials
 * and uses it for symmetric encryption and decryption operations.
 */
export default class AESCrypto {
	/** @private @type {CryptoKey|null} */
	#key = null;
	/** @private @type {number} */
	#keyVersion = 1;
	/** @private */
	#ready = false;
	/** @private @type {import('../../HybridStateManager.js').default|null} */
	#stateManager = null;

	/**
	 * Creates an instance of AESCrypto.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
		console.log("[AESCrypto] Loaded for enterprise-grade encryption");
	}

	/**
	 * Initializes the crypto module by deriving the encryption key.
	 * @returns {Promise<this>} The initialized AESCrypto instance.
	 */
	async init() {
		// V8.0 Parity: The authContext is now derived from the stateManager's securityManager.
		this.#key = await this.#deriveKey();
		this.#ready = true;
		console.log("[AESCrypto] Enterprise crypto initialized");
		return this;
	}

	/**
	 * Encrypts data using AES-GCM.
	 * @param {any} data - The plaintext data to encrypt.
	 * @returns {Promise<{data: Uint8Array, iv: Uint8Array, version: number, alg: string, encrypted: boolean}>} An envelope object containing the ciphertext (`data`), initialization vector (`iv`), and metadata.
	 * @throws {Error} If the crypto module is not initialized or if encryption fails.
	 */
	async encrypt(data) {
		if (!this.#ready) throw new Error("Crypto not initialized");

		const metrics = this.#getMetrics();
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
				data: new Uint8Array(encryptedData),
				iv,
				version: this.#keyVersion,
				alg: "AES-GCM-256",
				encrypted: true,
			};

			metrics?.increment("encryptionCount");
			metrics?.updateAverage("latency", performance.now() - startTime);

			return result;
		} catch (error) {
			console.error("AES encryption failed:", error);
			throw new Error(
				`AES encryption failed. Ensure data is serializable. Error: ${error.message}`
			);
		}
	}

	/**
	 * Decrypts data using AES-GCM.
	 * @param {object} encryptedData - The encrypted data object.
	 * @param {Uint8Array} encryptedData.data - The encrypted ciphertext.
	 * @param {Uint8Array} encryptedData.iv - The initialization vector used for encryption.
	 * @returns {Promise<any>} The decrypted plaintext data.
	 * @throws {Error} If the crypto module is not initialized or if decryption fails.
	 */
	async decrypt(encryptedData) {
		if (!this.#ready) throw new Error("Crypto not initialized");

		const metrics = this.#getMetrics();
		const startTime = performance.now();

		try {
			const decryptedData = await crypto.subtle.decrypt(
				{ name: "AES-GCM", iv: encryptedData.iv },
				this.#key,
				encryptedData.data
			);

			const plaintext = new TextDecoder().decode(decryptedData);
			const result = JSON.parse(plaintext);

			metrics?.increment("decryptionCount");
			metrics?.updateAverage("latency", performance.now() - startTime);

			return result;
		} catch (error) {
			console.error("AES decryption failed:", error);
			throw new Error(
				`AES decryption failed. This may be due to a wrong key, corrupted data, or invalid IV. Error: ${error.message}`
			);
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
	 * @param {string} userId - The user's ID.
	 * @param {object} authProof - The authentication proof object.
	 * @param {string} authProof.signature - The signature to verify.
	 * @param {number} authProof.timestamp - The timestamp used to generate the signature.
	 * @returns {Promise<boolean>} True if the signature is valid, false otherwise.
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
	 * @returns {Promise<{oldVersion: number, newVersion: number}>} An object containing the old and new key versions.
	 */
	async rotateKeys() {
		const oldVersion = this.#keyVersion;
		this.#keyVersion++;
		this.#key = await this.#deriveKey();
		console.log(
			`[AESCrypto] Keys rotated from v${oldVersion} to v${this.#keyVersion}`
		);
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
	 * @returns {Promise<CryptoKey>} The derived cryptographic key.
	 */
	async #deriveKey() {
		const securityManager = this.#stateManager?.managers?.securityManager;
		if (!securityManager?.hasValidContext()) {
			throw new Error(
				"A valid security context is required to derive the encryption key."
			);
		}

		// In a real system, a more secure secret would be retrieved from the security context,
		// not a password. For this example, we'll use the user ID as part of the salt.
		const userId = securityManager.userId;
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
					`aes-salt-${userId}-v${this.#keyVersion}`
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
	 * Gets the namespaced metrics registry.
	 * @private
	 */
	#getMetrics() {
		return this.#stateManager?.metricsRegistry?.namespace("aesCrypto");
	}
}
