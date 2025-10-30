// src/core/security/Keyring.js

/**
 * Manages cryptographic keys in a temporary in-memory store.
 * This class is designed for development and testing purposes.
 * In a production environment, this implementation **must** be replaced with a robust
 * Hardware Security Module (HSM) or Key Management Service (KMS) like AWS KMS, Azure Key Vault, or GCP KMS
 * to ensure proper key security, rotation, and access control.
 */
export class InMemoryKeyring {
	/**
	 * Creates an instance of InMemoryKeyring.
	 * Initializes an internal map to store cryptographic keys, indexed by their domain.
	 */
	constructor() {
		/**
		 * A map to store cryptographic key objects, indexed by their domain string.
		 * @type {Map<string, object>}
		 * @private
		 */
		this.map = new Map();
	}

	/**
	 * Retrieves a cryptographic key for a given security domain.
	 * If a key for the specified domain does not exist in the keyring, a placeholder
	 * key object with mock encryption and decryption functions is generated and stored.
	 *
	 * @note The `encrypt` and `decrypt` methods provided by the generated key are
	 * **placeholders** and offer no actual cryptographic security. They are for
	 * demonstration and testing only.
	 *
	 * @param {string} domain - The security domain for which to retrieve the key (e.g., "secret::alpha+beta").
	 * @returns {Promise<object>} A promise that resolves to a key object.
	 *   The key object has the following structure:
	 *   - `alg`: {string} The algorithm (e.g., "AES-256-GCM").
	 *   - `kid`: {string} The Key ID (e.g., "dev:secret::alpha+beta").
	 *   - `encrypt`: {Function} An asynchronous function to encrypt plaintext.
	 *   - `decrypt`: {Function} An asynchronous function to decrypt an envelope.
	 */
	async getKey(domain) {
		if (!this.map.has(domain)) {
			const kid = `dev:${domain}`;
			// Generate a real AES-GCM key for development use.
			const key = await crypto.subtle.generateKey(
				{ name: "AES-GCM", length: 256 },
				true, // extractable
				["encrypt", "decrypt"]
			);

			this.map.set(domain, {
				alg: "AES-256-GCM",
				kid,
				/**
				 * Encrypts plaintext using AES-GCM.
				 * @param {Uint8Array} plaintext - The data to encrypt.
				 * @param {Uint8Array} aad - Additional authenticated data.
				 * @returns {Promise<object>} An encrypted envelope.
				 */
				async encrypt(plaintext, aad) {
					const iv = crypto.getRandomValues(new Uint8Array(12));
					const ciphertext = await crypto.subtle.encrypt(
						{ name: "AES-GCM", iv, additionalData: aad },
						key,
						plaintext
					);
					return {
						alg: this.alg,
						kid: this.kid,
						iv,
						ciphertext: new Uint8Array(ciphertext),
					};
				},
				/**
				 * Decrypts an envelope using AES-GCM.
				 * @param {object} envelope - The encrypted envelope object.
				 * @param {Uint8Array} aad - Additional authenticated data.
				 * @returns {Promise<Uint8Array>} The original plaintext.
				 */
				async decrypt(envelope, aad) {
					const plaintext = await crypto.subtle.decrypt(
						{
							name: "AES-GCM",
							iv: envelope.iv,
							additionalData: aad,
						},
						key,
						envelope.ciphertext
					);
					return new Uint8Array(plaintext);
				},
			});
		}
		return this.map.get(domain);
	}

	/**
	 * Derives or generates a stable cryptographic key for a given purpose and domain.
	 * For `InMemoryKeyring`, this generates a deterministic key pair for signing.
	 * @param {string} purpose - The purpose of the key (e.g., 'signing').
	 * @param {string} domain - The security domain for the key.
	 * @returns {Promise<CryptoKey|CryptoKeyPair>} A promise that resolves to the derived key or key pair.
	 */
	async derive(purpose, domain) {
		const keyId = `${purpose}::${domain}`;
		if (this.map.has(keyId)) {
			return this.map.get(keyId);
		}

		if (purpose === "signing") {
			const keyPair = await crypto.subtle.generateKey(
				{
					name: "ECDSA",
					namedCurve: "P-256",
				},
				true, // extractable
				["sign", "verify"]
			);
			this.map.set(keyId, keyPair);
			return keyPair;
		}

		throw new Error(`Unsupported purpose for key derivation: ${purpose}`);
	}
}
