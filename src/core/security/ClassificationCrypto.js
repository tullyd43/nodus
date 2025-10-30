// src/core/security/ClassificationCrypto.js
import { getCryptoDomain } from "./CryptoDomain.js";

/**
 * Routes encryption/decryption operations to the correct domain key
 * based on classification and compartments.
 */
export class ClassificationCrypto {
	constructor({ keyring }) {
		this.keyring = keyring;
	}

	async encrypt(label, plaintextBytes) {
		const domain = getCryptoDomain(label);
		const key = await this.keyring.getKey(domain);
		return key.encrypt(plaintextBytes);
	}

	async decrypt(label, envelope) {
		const domain = getCryptoDomain(label);
		const key = await this.keyring.getKey(domain);
		return key.decrypt(envelope);
	}
}
