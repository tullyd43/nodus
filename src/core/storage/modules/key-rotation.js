// modules/key-rotation.js
// Key rotation module for forward secrecy and compliance

/**
 * Key Rotation Module
 * Loaded for: zero-knowledge-crypto, aes-crypto with rotation requirements
 * Bundle size: ~2KB (key management utilities)
 */
export default class KeyRotation {
  #cryptoInstance;
  #rotationSchedule;
  #keyHistory = new Map();
  #rotationCallbacks = [];
  #metrics = {
    rotationCount: 0,
    lastRotation: null,
    averageRotationTime: 0,
    rotationTimes: []
  };

  constructor(cryptoInstance, options = {}) {
    this.#cryptoInstance = cryptoInstance;
    
    this.options = {
      rotationInterval: options.rotationInterval || 4 * 3600000, // 4 hours
      keyHistoryLimit: options.keyHistoryLimit || 10,
      autoRotate: options.autoRotate !== false,
      rotationJitter: options.rotationJitter || 0.1, // 10% jitter
      ...options
    };

    console.log('[KeyRotation] Loaded for crypto key management');
  }

  async init(cryptoInstance) {
    if (cryptoInstance) {
      this.#cryptoInstance = cryptoInstance;
    }

    if (this.options.autoRotate) {
      this.#scheduleNextRotation();
    }

    console.log('[KeyRotation] Key rotation initialized');
    return this;
  }

  /**
   * Manually trigger key rotation
   */
  async rotateKeys() {
    const startTime = performance.now();
    
    try {
      console.log('[KeyRotation] Starting key rotation...');
      
      // Store current key version for history
      const oldVersion = this.#cryptoInstance.getVersion();
      
      // Trigger rotation in crypto instance
      await this.#cryptoInstance.rotateKeys();
      
      const newVersion = this.#cryptoInstance.getVersion();
      
      // Record in history
      this.#keyHistory.set(oldVersion, {
        rotatedAt: Date.now(),
        rotatedTo: newVersion,
        reason: 'scheduled'
      });
      
      // Cleanup old history
      this.#cleanupKeyHistory();
      
      // Update metrics
      const rotationTime = performance.now() - startTime;
      this.#updateRotationMetrics(rotationTime);
      
      // Notify callbacks
      await this.#notifyRotationCallbacks(oldVersion, newVersion);
      
      console.log(`[KeyRotation] Key rotation complete: v${oldVersion} → v${newVersion} (${rotationTime.toFixed(2)}ms)`);
      
      // Schedule next rotation
      if (this.options.autoRotate) {
        this.#scheduleNextRotation();
      }
      
      return { oldVersion, newVersion, rotationTime };
      
    } catch (error) {
      console.error('[KeyRotation] Key rotation failed:', error);
      throw error;
    }
  }

  /**
   * Emergency key rotation (security incident)
   */
  async emergencyRotation(reason = 'security_incident') {
    console.warn(`[KeyRotation] Emergency rotation triggered: ${reason}`);
    
    // Cancel scheduled rotation
    this.#cancelScheduledRotation();
    
    // Perform immediate rotation
    const result = await this.rotateKeys();
    
    // Record emergency reason
    this.#keyHistory.set(result.oldVersion, {
      ...this.#keyHistory.get(result.oldVersion),
      reason: `emergency:${reason}`,
      emergency: true
    });
    
    return result;
  }

  /**
   * Register callback for rotation events
   */
  onKeyRotation(callback) {
    this.#rotationCallbacks.push(callback);
  }

  /**
   * Called when crypto instance is destroying keys
   */
  async onKeysDestroyed() {
    this.#cancelScheduledRotation();
    this.#keyHistory.clear();
    console.log('[KeyRotation] Keys destroyed, rotation stopped');
  }

  /**
   * Get rotation metrics
   */
  getRotationMetrics() {
    return {
      ...this.#metrics,
      nextRotationAt: this.#rotationSchedule?.scheduledTime || null,
      keyHistoryCount: this.#keyHistory.size,
      isAutoRotating: this.options.autoRotate
    };
  }

  /**
   * Get key history
   */
  getKeyHistory() {
    return Array.from(this.#keyHistory.entries()).map(([version, info]) => ({
      version,
      ...info
    }));
  }

  /**
   * Check if key rotation is due
   */
  isRotationDue() {
    if (!this.#metrics.lastRotation) return true;
    
    const timeSinceLastRotation = Date.now() - this.#metrics.lastRotation;
    return timeSinceLastRotation >= this.options.rotationInterval;
  }

  /**
   * Update rotation interval
   */
  updateRotationInterval(interval) {
    const oldInterval = this.options.rotationInterval;
    this.options.rotationInterval = interval;
    
    // Reschedule if auto-rotating
    if (this.options.autoRotate) {
      this.#cancelScheduledRotation();
      this.#scheduleNextRotation();
    }
    
    console.log(`[KeyRotation] Rotation interval updated: ${oldInterval}ms → ${interval}ms`);
  }

  /**
   * Enable/disable auto rotation
   */
  setAutoRotation(enabled) {
    this.options.autoRotate = enabled;
    
    if (enabled) {
      this.#scheduleNextRotation();
    } else {
      this.#cancelScheduledRotation();
    }
    
    console.log(`[KeyRotation] Auto rotation ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Cleanup and stop rotation
   */
  destroy() {
    this.#cancelScheduledRotation();
    this.#keyHistory.clear();
    this.#rotationCallbacks = [];
    console.log('[KeyRotation] Key rotation destroyed');
  }

  // Private methods
  #scheduleNextRotation() {
    this.#cancelScheduledRotation();
    
    // Add jitter to prevent synchronized rotations
    const jitter = this.options.rotationInterval * this.options.rotationJitter;
    const jitterAmount = (Math.random() - 0.5) * 2 * jitter;
    const rotationTime = this.options.rotationInterval + jitterAmount;
    
    this.#rotationSchedule = {
      timeout: setTimeout(() => {
        this.rotateKeys().catch(error => {
          console.error('[KeyRotation] Scheduled rotation failed:', error);
          // Retry in 5 minutes
          setTimeout(() => this.#scheduleNextRotation(), 5 * 60 * 1000);
        });
      }, rotationTime),
      scheduledTime: Date.now() + rotationTime
    };
    
    console.log(`[KeyRotation] Next rotation scheduled in ${Math.round(rotationTime / 1000 / 60)} minutes`);
  }

  #cancelScheduledRotation() {
    if (this.#rotationSchedule?.timeout) {
      clearTimeout(this.#rotationSchedule.timeout);
      this.#rotationSchedule = null;
    }
  }

  #cleanupKeyHistory() {
    if (this.#keyHistory.size <= this.options.keyHistoryLimit) return;
    
    // Remove oldest entries
    const entries = Array.from(this.#keyHistory.entries());
    entries.sort((a, b) => a[1].rotatedAt - b[1].rotatedAt);
    
    const toRemove = entries.slice(0, entries.length - this.options.keyHistoryLimit);
    for (const [version] of toRemove) {
      this.#keyHistory.delete(version);
    }
  }

  #updateRotationMetrics(rotationTime) {
    this.#metrics.rotationCount++;
    this.#metrics.lastRotation = Date.now();
    this.#metrics.rotationTimes.push(rotationTime);
    
    // Keep only recent rotation times
    if (this.#metrics.rotationTimes.length > 50) {
      this.#metrics.rotationTimes = this.#metrics.rotationTimes.slice(-25);
    }
    
    // Calculate average
    this.#metrics.averageRotationTime = this.#metrics.rotationTimes.reduce((a, b) => a + b, 0) / this.#metrics.rotationTimes.length;
  }

  async #notifyRotationCallbacks(oldVersion, newVersion) {
    const promises = this.#rotationCallbacks.map(async callback => {
      try {
        await callback(oldVersion, newVersion);
      } catch (error) {
        console.error('[KeyRotation] Callback error:', error);
      }
    });
    
    await Promise.allSettled(promises);
  }
}
