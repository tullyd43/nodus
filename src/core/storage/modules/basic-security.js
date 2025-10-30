// src/core/storage/modules/basic-security.js

export default class BasicSecurity {
  constructor(config) {
    this.config = config;
    console.log("[BasicSecurity] Initialized with config:", config);
  }

  async checkPermission(user, action, resource) {
    console.log(`[BasicSecurity] Checking permission for user ${user} to ${action} ${resource}`);
    return true; // Always allow for demo
  }

  async encrypt(data) {
    console.log("[BasicSecurity] Encrypting data (basic):", data);
    return `basic_encrypted(${JSON.stringify(data)})`;
  }

  async decrypt(encryptedData) {
    console.log("[BasicSecurity] Decrypting data (basic):", encryptedData);
    const match = encryptedData.match(/^basic_encrypted\((.*)\)$/);
    if (match && match[1]) {
      return JSON.parse(match[1]);
    }
    return encryptedData;
  }
}
