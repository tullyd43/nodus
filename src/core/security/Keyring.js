// src/core/security/Keyring.js

/**
 * Temporary in-memory keyring.
 * In production, this will be replaced with an HSM or KMS (AWS, Azure, GCP).
 */
export class InMemoryKeyring {
	constructor() {
		this.map = new Map();
	}

	async getKey(domain) {
		if (!this.map.has(domain)) {
			const kid = `local:${domain}`;
			this.map.set(domain, {
				alg: "AES-256-GCM",
				kid,
				async encrypt(plaintext) {
					// ⚠️ placeholder encryption
					return {
						alg: this.alg,
						kid: this.kid,
						iv: crypto.getRandomValues(new Uint8Array(12)),
						ciphertext: plaintext,
						tag: new Uint8Array(16),
					};
				},
				async decrypt(envelope) {
					return envelope.ciphertext;
				},
			});
		}
		return this.map.get(domain);
	}
}
