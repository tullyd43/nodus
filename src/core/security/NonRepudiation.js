/**
 * @file NonRepudiation.js
 * @description Provides cryptographic signing for user actions to ensure non-repudiation.
 * This is a critical security feature for audit trails and compliance, ensuring that
 * an action can be cryptographically proven to have been initiated by a specific user.
 */

/**
 * Provides a mechanism for creating non-repudiable records of user actions.
 * This is a critical security feature for audit trails and compliance, ensuring that
 * an action can be cryptographically proven to have been initiated by a specific user
 * at a specific time. It directly supports the **Compliance** pillar of the development philosophy.
 */
export class NonRepudiation {
	/** @private @type {CryptoKeyPair | null} */
	#keyPair = null;
	/** @private @type {Promise<void> | null} */
	#initPromise = null;
	/** @private @type {import('./ClassificationCrypto.js').ClassificationCrypto|null} */
	#crypto = null;

	/**
	 * @param {import('./ClassificationCrypto.js').ClassificationCrypto} cryptoInstance - The main crypto instance which holds the keyring.
	 */
	constructor(cryptoInstance) {
		if (!cryptoInstance?.keyring) {
			throw new Error(
				"[NonRepudiation] A crypto instance with a keyring is required."
			);
		}
		this.#crypto = cryptoInstance;
		this.#initPromise = this.#initializeKeys("system-audit");
	}

	/**
	 * Derives or generates an ECDSA key pair for signing and verification.
	 * @private
	 * @param {string} domain - The cryptographic domain for the signing key.
	 * @returns {Promise<void>}
	 */
	async #initializeKeys(domain) {
		try {
			// Use the keyring to derive a stable signing key.
			// This ensures the same key is used across sessions for the same domain.
			this.#keyPair = await this.#crypto.keyring.derive(
				"signing",
				domain
			);
		} catch (error) {
			console.error(
				"[NonRepudiation] Failed to generate signing keys:",
				error
			);
		}
	}

	/**
	 * Ensures that the cryptographic keys are initialized before use.
	 * @private
	 */
	async #ensureInitialized() {
		if (!this.#initPromise) {
			this.#initPromise = this.#initializeKeys();
		}
		await this.#initPromise;
		if (!this.#keyPair) {
			throw new Error(
				"Cryptographic keys for signing are not available."
			);
		}
	}

	/**
	 * Creates a digital signature for a specific user action.
	 * This method takes the user's identity, the action they performed, and the security
	 * context (label) of the action, and generates a signed payload.
	 *
	 * @param {object} params - The parameters for the signing action.
	 * @param {string} params.userId - The unique identifier of the user performing the action.
	 * @param {object} params.action - An object describing the action being performed (e.g., `{ type: 'create', entity: 'event' }`).
	 * @param {object} params.label - The security label of the context in which the action is performed (e.g., `{ classification: 'secret' }`).
	 * @returns {Promise<{signature: string, algorithm: string, timestamp: string}>} A promise that resolves to an object containing the signature, the algorithm used (currently a stub), and an ISO 8601 timestamp.
	 */
	async signAction({ userId, action, label }) {
		await this.#ensureInitialized();

		const payload = JSON.stringify({
			userId,
			action,
			label,
			ts: Date.now(),
		});

		const encodedPayload = new TextEncoder().encode(payload);
		const signatureBuffer = await crypto.subtle.sign(
			{
				name: "ECDSA",
				hash: { name: "SHA-256" },
			},
			this.#keyPair.privateKey,
			encodedPayload
		);

		// Convert the signature to a Base64 string for storage/transmission.
		const signature = btoa(
			String.fromCharCode(...new Uint8Array(signatureBuffer))
		);

		return {
			signature,
			algorithm: "ECDSA-P256-SHA256",
			timestamp: new Date().toISOString(),
		};
	}

	/**
	 * Verifies a digital signature against a payload.
	 * @param {string} signature - The Base64-encoded signature.
	 * @param {object} payload - The original payload object that was signed.
	 * @returns {Promise<boolean>} A promise that resolves to true if the signature is valid, false otherwise.
	 */
	async verifySignature(signature, payload) {
		await this.#ensureInitialized();

		try {
			const signatureBuffer = Uint8Array.from(atob(signature), (c) =>
				c.charCodeAt(0)
			);
			const encodedPayload = new TextEncoder().encode(
				JSON.stringify(payload)
			);

			return await crypto.subtle.verify(
				{
					name: "ECDSA",
					hash: { name: "SHA-256" },
				},
				this.#keyPair.publicKey,
				signatureBuffer,
				encodedPayload
			);
		} catch (error) {
			console.error(
				"[NonRepudiation] Signature verification failed:",
				error
			);
			return false;
		}
	}
}
