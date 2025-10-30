// modules/aes-crypto.js
// AES crypto module for enterprise security

/**
 * AES Crypto Module
 * Loaded for: confidential, secret classifications
 * Bundle size: ~3KB (balanced security/performance)
 * Provides enterprise-grade encryption using AES-GCM. It derives a key from user credentials
 * and uses it for symmetric encryption and decryption operations.
 */
export default class AESCrypto {
	/** @private */
	#key;
	/** @private */
	#keyVersion = 1;
	/** @private */
	#ready = false;
	/** @private */
	#authContext;
	/** @private */
	#metrics = {
		encryptionCount: 0,
		decryptionCount: 0,
		latencySum: 0,
	};

	/**
	 * Creates an instance of AESCrypto.
	 * @param {Array<Object>} [additionalModules=[]] - A list of additional modules, not used in this implementation.
	 */
	constructor(additionalModules = []) {
		console.log("[AESCrypto] Loaded for enterprise-grade encryption");
	}

	/**
	 * Initializes the crypto module by deriving the encryption key.
	 * @param {object} authContext - The authentication context containing user credentials.
	 * @param {string} authContext.userId - The user's unique identifier.
	 * @param {string} authContext.password - The user's password, used for key derivation.
	 * @returns {Promise<this>} The initialized AESCrypto instance.
	 */
	async init(authContext) {
		this.#authContext = authContext;
		this.#key = await this.#deriveKey();
		this.#ready = true;
		console.log("[AESCrypto] Enterprise crypto initialized");
		return this;
	}

	/**
	 * Encrypts data using AES-GCM.
	 * @param {any} data - The plaintext data to encrypt.
	 * @returns {Promise<object>} An object containing the encrypted data, initialization vector (iv), and metadata.
	 * @throws {Error} If the crypto module is not initialized or if encryption fails.
	 */
	async encrypt(data) {
		if (!this.#ready) throw new Error("Crypto not initialized");

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

			this.#metrics.encryptionCount++;
			this.#metrics.latencySum += performance.now() - startTime;

			return result;
		} catch (error) {
			throw new Error("AES encryption failed");
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

		const startTime = performance.now();

		try {
			const decryptedData = await crypto.subtle.decrypt(
				{ name: "AES-GCM", iv: encryptedData.iv },
				this.#key,
				encryptedData.data
			);

			const plaintext = new TextDecoder().decode(decryptedData);
			const result = JSON.parse(plaintext);

			this.#metrics.decryptionCount++;
			this.#metrics.latencySum += performance.now() - startTime;

			return result;
		} catch (error) {
			throw new Error("AES decryption failed");
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
	 * Gets the current version of the encryption key.
	 * @returns {number} The key version.
	 */
	getVersion() {
		return this.#keyVersion;
	}

	/**
	 * Calculates the average latency for encryption and decryption operations.
	 * @returns {number} The average latency in milliseconds.
	 */
	getAverageLatency() {
		const totalOps =
			this.#metrics.encryptionCount + this.#metrics.decryptionCount;
		return totalOps > 0 ? this.#metrics.latencySum / totalOps : 0;
	}

	/**
	 * Securely destroys the encryption key and authentication context from memory.
	 * @returns {Promise<void>}
	 */
	async destroyKeys() {
		this.#key = null;
		this.#authContext = null;
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
		const keyMaterial = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(this.#authContext.password),
			{ name: "PBKDF2" },
			false,
			["deriveKey"]
		);

		return await crypto.subtle.deriveKey(
			{
				name: "PBKDF2",
				salt: new TextEncoder().encode(
					"aes-salt-" + this.#authContext.userId
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
}
