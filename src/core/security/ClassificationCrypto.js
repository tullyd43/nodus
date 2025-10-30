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

	async encryptEntity(storeName, label, entity) {
		const payload =
			storeName === "objects_polyinstantiated"
				? entity.instance_data ?? {}
				: entity;
		return this.encrypt(
			label,
			new TextEncoder().encode(JSON.stringify(payload))
		);
	}

	async decryptEntity(storeName, label, envelope) {
		const bytes = await this.decrypt(label, envelope);
		const decoded = JSON.parse(new TextDecoder().decode(bytes));
		return decoded; // Caller handles placement
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
