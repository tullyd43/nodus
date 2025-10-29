// modules/aes-crypto.js
// AES crypto module for enterprise security

/**
 * AES Crypto Module
 * Loaded for: confidential, secret classifications
 * Bundle size: ~3KB (balanced security/performance)
 */
export default class AESCrypto {
  #key;
  #keyVersion = 1;
  #ready = false;
  #authContext;
  #metrics = {
    encryptionCount: 0,
    decryptionCount: 0,
    latencySum: 0
  };

  constructor(additionalModules = []) {
    console.log('[AESCrypto] Loaded for enterprise-grade encryption');
  }

  async init(authContext) {
    this.#authContext = authContext;
    this.#key = await this.#deriveKey();
    this.#ready = true;
    console.log('[AESCrypto] Enterprise crypto initialized');
    return this;
  }

  async encrypt(data) {
    if (!this.#ready) throw new Error('Crypto not initialized');
    
    const startTime = performance.now();
    
    try {
      const plaintext = new TextEncoder().encode(JSON.stringify(data));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        this.#key,
        plaintext
      );

      const result = {
        data: new Uint8Array(encryptedData),
        iv: iv,
        version: this.#keyVersion,
        alg: 'AES-GCM-256',
        encrypted: true
      };

      this.#metrics.encryptionCount++;
      this.#metrics.latencySum += performance.now() - startTime;
      
      return result;
    } catch (error) {
      throw new Error('AES encryption failed');
    }
  }

  async decrypt(encryptedData) {
    if (!this.#ready) throw new Error('Crypto not initialized');
    
    const startTime = performance.now();
    
    try {
      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: encryptedData.iv },
        this.#key,
        encryptedData.data
      );

      const plaintext = new TextDecoder().decode(decryptedData);
      const result = JSON.parse(plaintext);

      this.#metrics.decryptionCount++;
      this.#metrics.latencySum += performance.now() - startTime;
      
      return result;
    } catch (error) {
      throw new Error('AES decryption failed');
    }
  }

  async generateAccessHint(classification, compartments = []) {
    const hintData = {
      level: this.#getClassificationLevel(classification),
      compartments: compartments.sort(),
      timestamp: Math.floor(Date.now() / (24 * 3600000))
    };

    const hintString = JSON.stringify(hintData);
    const hintBytes = new TextEncoder().encode(hintString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', hintBytes);
    
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 12);
  }

  async verifyAuthProof(userId, authProof) {
    if (!authProof || !authProof.signature) return false;
    
    const expectedSignature = await this.#generateAuthSignature(userId, authProof.timestamp);
    return authProof.signature === expectedSignature;
  }

  getVersion() {
    return this.#keyVersion;
  }

  getAverageLatency() {
    const totalOps = this.#metrics.encryptionCount + this.#metrics.decryptionCount;
    return totalOps > 0 ? this.#metrics.latencySum / totalOps : 0;
  }

  async destroyKeys() {
    this.#key = null;
    this.#authContext = null;
    this.#ready = false;
  }

  cleanup() {
    this.destroyKeys();
  }

  get isReady() {
    return this.#ready;
  }

  // Private methods
  async #deriveKey() {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.#authContext.password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode('aes-salt-' + this.#authContext.userId),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  #getClassificationLevel(classification) {
    const levels = ['public', 'internal', 'restricted', 'confidential', 'secret'];
    return levels.indexOf(classification);
  }

  async #generateAuthSignature(userId, timestamp) {
    const data = `${userId}:${timestamp}:aes-auth`;
    const dataBytes = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
    
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 24);
  }
}
