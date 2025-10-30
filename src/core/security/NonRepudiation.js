/**
 * @file NonRepudiation.js
 * @description Provides cryptographic signing for user actions to ensure non-repudiation.
 * This is a critical security feature for audit trails and compliance, ensuring that
 * an action can be cryptographically proven to have been initiated by a specific user.
 */

import { DateCore } from "@utils/DateUtils.js";

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
			ts: DateCore.timestamp(),
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
			timestamp: DateCore.now(),
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

	/**
	 * Creates a digital signature for an action using a key associated with a user certificate.
	 * This simulates a PKI-based signing process where the key is tied to a user's verified identity.
	 *
	 * @param {object} params - The parameters for the signing action.
	 * @param {object} params.action - An object describing the action being performed.
	 * @param {object} params.userCert - A mock user certificate object.
	 * @param {string} params.userCert.subject - The subject of the certificate (e.g., the user's ID).
	 * @param {string} params.userCert.domain - The security domain associated with the certificate.
	 * @returns {Promise<{signature: string, certFingerprint: string, algorithm: string, timestamp: string}>} A promise that resolves with the signature and certificate info.
	 */
	async signWithCertificate({ action, userCert }) {
		if (!userCert || !userCert.subject || !userCert.domain) {
			throw new Error("A valid user certificate object is required.");
		}

		// 1. Derive a user-specific signing key from the keyring using the cert's domain.
		// In a real system, this might involve interacting with a hardware token or OS keystore.
		const userKeyPair = await this.#crypto.keyring.derive(
			"signing",
			userCert.domain
		);

		if (!userKeyPair?.privateKey) {
			throw new Error(
				`Could not derive signing key for certificate domain: ${userCert.domain}`
			);
		}

		// 2. Create the payload to be signed.
		const payload = JSON.stringify({
			subject: userCert.subject,
			action,
			ts: DateCore.timestamp(),
		});

		// 3. Sign the payload with the user-specific private key.
		const encodedPayload = new TextEncoder().encode(payload);
		const signatureBuffer = await crypto.subtle.sign(
			{ name: "ECDSA", hash: { name: "SHA-256" } },
			userKeyPair.privateKey,
			encodedPayload
		);

		const signature = btoa(
			String.fromCharCode(...new Uint8Array(signatureBuffer))
		);

		// 4. Generate a mock fingerprint for the certificate.
		const certFingerprint = `sha256:${(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(userCert)))).toString()}`;

		return {
			signature,
			certFingerprint,
			algorithm: "ECDSA-P256-SHA256",
			timestamp: DateCore.now(),
		};
	}
}
