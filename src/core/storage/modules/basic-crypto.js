// src/core/storage/modules/basic-crypto.js
// BasicCrypto — foundational cryptographic module for Nodus storage systems.
// Handles lightweight encryption, hashing, and key generation utilities.
// This acts as a default fallback when higher-level (enterprise/NATO) crypto modules are not loaded.

export default class BasicCrypto {
	constructor(config = {}) {
		this.config = config;
		console.log("[BasicCrypto] Initialized with config:", config);
	}

	async init() {
		console.log("[BasicCrypto] Ready (stub implementation)");
		return this;
	}

	// 🔐 Simple hashing placeholder
	async hash(input) {
		const data = new TextEncoder().encode(input);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		return Array.from(new Uint8Array(hashBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	// 🔑 Simple encryption placeholder
	async encrypt(data) {
		const encoded = btoa(JSON.stringify(data));
		return `enc:${encoded}`;
	}

	// 🔓 Simple decryption placeholder
	async decrypt(payload) {
		if (!payload.startsWith("enc:")) throw new Error("Invalid payload");
		const decoded = atob(payload.slice(4));
		return JSON.parse(decoded);
	}
}
