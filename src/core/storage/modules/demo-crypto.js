// src/core/storage/modules/demo-crypto.js

export default class DemoCrypto {
  constructor(config) {
    this.config = config;
    console.log("[DemoCrypto] Initialized with config:", config);
  }

  async encrypt(data) {
    console.log("[DemoCrypto] Encrypting data (demo):", data);
    return `encrypted(${JSON.stringify(data)})`;
  }

  async decrypt(encryptedData) {
    console.log("[DemoCrypto] Decrypting data (demo):", encryptedData);
    const match = encryptedData.match(/^encrypted\((.*)\)$/);
    if (match && match[1]) {
      return JSON.parse(match[1]);
    }
    return encryptedData;
  }
}
