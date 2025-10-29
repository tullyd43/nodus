/**
 * LRUCache v2.1 - Enhanced Least Recently Used Cache
 * Memory-efficient caching for unified entity storage
 *
 * PARADIGM CORRECTION:
 * - Removed level-specific caching logic
 * - Focused on unified entity storage
 * - Simplified for single data model approach
 * - Enhanced for type-based operations
 *
 * PHILOSOPHY ALIGNMENT:
 * ✅ Composability: Single cache for all entity types
 * ✅ Simplicity: No complex level management
 * ✅ Robustness: TTL expiration, memory bounds, graceful degradation
 * ✅ Non-redundancy: Single caching solution for all data
 * ✅ Performance: O(1) operations, memory monitoring, automatic cleanup
 * ✅ Extensibility: Configurable eviction callbacks, metrics hooks
 * ✅ Compliance: Optional audit integration for cache operations
 */

export class LRUCache {
  constructor(maxSize = 1000, options = {}) {
    this.maxSize = maxSize;
    this.cache = new Map();

    // Enhanced options
    this.options = {
      ttl: options.ttl || null, // Time to live in milliseconds
      onEvict: options.onEvict || null, // Callback when items are evicted
      onExpire: options.onExpire || null, // Callback when items expire
      enableMetrics: options.enableMetrics !== false, // Default enabled
      auditOperations: options.auditOperations || false,
      memoryLimit: options.memoryLimit || null, // Memory limit in bytes
      keyPrefix: options.keyPrefix || "", // Optional key prefix for namespacing
      ...options,
    };

    // Metrics tracking
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      sets: 0,
      deletes: 0,
      memoryUsage: 0,
      operationTimes: [],
      lastCleanup: Date.now(),

      // Entity-specific metrics
      entityTypes: new Map(), // Count by entity type
      averageEntitySize: 0,
      totalEntitiesCached: 0,
    };

    // TTL management
    this.ttlMap = new Map(); // Key -> expiration time
    this.cleanupInterval = null;

    // Start automatic cleanup if TTL is enabled
    if (this.options.ttl) {
      this.startTTLCleanup();
    }
  }

  /**
   * Get item from cache with TTL checking
   */
  get(key) {
    const startTime = this.options.enableMetrics ? performance.now() : 0;

    try {
      const prefixedKey = this.getPrefixedKey(key);

      // Check if item exists
      if (!this.cache.has(prefixedKey)) {
        this.recordMetric("misses");
        return undefined;
      }

      // Check TTL if enabled
      if (this.options.ttl && this.isExpired(prefixedKey)) {
        this.expireItem(prefixedKey);
        this.recordMetric("misses");
        return undefined;
      }

      // Move to end (most recently used)
      const item = this.cache.get(prefixedKey);
      this.cache.delete(prefixedKey);
      this.cache.set(prefixedKey, item);

      // Update item access tracking
      item.accessed = Date.now();
      item.hits++;

      this.recordMetric("hits");
      return item.value;
    } finally {
      if (this.options.enableMetrics) {
        this.recordOperationTime(performance.now() - startTime);
      }
    }
  }

  /**
   * Set item in cache with optional TTL override
   */
  set(key, value, ttlOverride = null) {
    const startTime = this.options.enableMetrics ? performance.now() : 0;

    try {
      const prefixedKey = this.getPrefixedKey(key);
      const itemSize = this.estimateItemSize(prefixedKey, value);

      // Check memory limit if enabled
      if (
        this.options.memoryLimit &&
        this.metrics.memoryUsage + itemSize > this.options.memoryLimit
      ) {
        this.enforceMemoryLimit(itemSize);
      }

      // Create item wrapper with metadata
      const item = {
        value,
        size: itemSize,
        created: Date.now(),
        accessed: Date.now(),
        hits: 0,
        entityType: this.extractEntityType(value),
      };

      // Handle existing item
      if (this.cache.has(prefixedKey)) {
        const oldItem = this.cache.get(prefixedKey);
        this.metrics.memoryUsage -= oldItem.size;
        this.updateEntityTypeMetrics(oldItem.entityType, -1);
        this.cache.delete(prefixedKey);
      } else if (this.cache.size >= this.maxSize) {
        // Evict least recently used item
        this.evictOldestItem();
      }

      // Add new item
      this.cache.set(prefixedKey, item);
      this.metrics.memoryUsage += itemSize;
      this.updateEntityTypeMetrics(item.entityType, 1);

      // Set TTL
      const ttl = ttlOverride || this.options.ttl;
      if (ttl) {
        this.ttlMap.set(prefixedKey, Date.now() + ttl);
      }

      this.recordMetric("sets");

      // Generate audit event if enabled
      if (this.options.auditOperations) {
        this.auditOperation("cache_set", {
          key: prefixedKey,
          size: itemSize,
          ttl,
          entityType: item.entityType,
        });
      }
    } finally {
      if (this.options.enableMetrics) {
        this.recordOperationTime(performance.now() - startTime);
      }
    }
  }

  /**
   * Get entities by type - useful for type-based operations
   */
  getEntitiesByType(entityType) {
    const entities = new Map();

    for (const [key, item] of this.cache.entries()) {
      if (item.entityType === entityType && !this.isExpired(key)) {
        entities.set(this.getUnprefixedKey(key), item.value);
      }
    }

    return entities;
  }

  /**
   * Get entities matching predicate
   */
  getEntitiesWhere(predicate) {
    const entities = new Map();

    for (const [key, item] of this.cache.entries()) {
      if (
        !this.isExpired(key) &&
        predicate(item.value, this.getUnprefixedKey(key))
      ) {
        entities.set(this.getUnprefixedKey(key), item.value);
      }
    }

    return entities;
  }

  /**
   * Get recently accessed entities
   */
  getRecentlyAccessed(count = 10) {
    const items = Array.from(this.cache.entries())
      .filter(([key]) => !this.isExpired(key))
      .sort(([, a], [, b]) => b.accessed - a.accessed)
      .slice(0, count);

    return new Map(
      items.map(([key, item]) => [this.getUnprefixedKey(key), item.value]),
    );
  }

  /**
   * Check if key exists and is not expired
   */
  has(key) {
    const prefixedKey = this.getPrefixedKey(key);

    if (!this.cache.has(prefixedKey)) {
      return false;
    }

    if (this.options.ttl && this.isExpired(prefixedKey)) {
      this.expireItem(prefixedKey);
      return false;
    }

    return true;
  }

  /**
   * Delete item from cache
   */
  delete(key) {
    const prefixedKey = this.getPrefixedKey(key);
    const item = this.cache.get(prefixedKey);
    if (!item) {
      return false;
    }

    this.cache.delete(prefixedKey);
    this.ttlMap.delete(prefixedKey);
    this.metrics.memoryUsage -= item.size;
    this.updateEntityTypeMetrics(item.entityType, -1);
    this.recordMetric("deletes");

    if (this.options.auditOperations) {
      this.auditOperation("cache_delete", {
        key: prefixedKey,
        entityType: item.entityType,
      });
    }

    return true;
  }

  /**
   * Clear all items from cache
   */
  clear() {
    const clearedCount = this.cache.size;

    // Call eviction callback for all items if configured
    if (this.options.onEvict) {
      for (const [key, item] of this.cache.entries()) {
        this.options.onEvict(this.getUnprefixedKey(key), item.value, "clear");
      }
    }

    this.cache.clear();
    this.ttlMap.clear();
    this.metrics.memoryUsage = 0;
    this.metrics.entityTypes.clear();
    this.recordMetric("evictions", clearedCount);

    if (this.options.auditOperations) {
      this.auditOperation("cache_clear", { itemCount: clearedCount });
    }

    return clearedCount;
  }

  /**
   * Get cache size
   */
  get size() {
    // Clean expired items first
    if (this.options.ttl) {
      this.cleanupExpired();
    }
    return this.cache.size;
  }

  /**
   * Batch operations for efficiency
   */
  setMultiple(entries, ttlOverride = null) {
    const results = [];
    for (const [key, value] of entries) {
      try {
        this.set(key, value, ttlOverride);
        results.push({ key, success: true });
      } catch (error) {
        results.push({ key, success: false, error: error.message });
      }
    }
    return results;
  }

  /**
   * Batch get operations
   */
  getMultiple(keys) {
    const results = new Map();
    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        results.set(key, value);
      }
    }
    return results;
  }

  /**
   * Key management with optional prefixing
   */
  getPrefixedKey(key) {
    return this.options.keyPrefix ? `${this.options.keyPrefix}:${key}` : key;
  }

  getUnprefixedKey(prefixedKey) {
    if (
      this.options.keyPrefix &&
      prefixedKey.startsWith(this.options.keyPrefix + ":")
    ) {
      return prefixedKey.substring(this.options.keyPrefix.length + 1);
    }
    return prefixedKey;
  }

  /**
   * Extract entity type from value for metrics
   */
  extractEntityType(value) {
    if (value && typeof value === "object") {
      return value.type_id || value.type || value.entityType || "unknown";
    }
    return "primitive";
  }

  /**
   * Update entity type metrics
   */
  updateEntityTypeMetrics(entityType, delta) {
    if (!entityType) return;

    const current = this.metrics.entityTypes.get(entityType) || 0;
    const newCount = current + delta;

    if (newCount <= 0) {
      this.metrics.entityTypes.delete(entityType);
    } else {
      this.metrics.entityTypes.set(entityType, newCount);
    }

    // Update total count
    this.metrics.totalEntitiesCached = Math.max(
      0,
      this.metrics.totalEntitiesCached + delta,
    );
  }

  /**
   * Performance and memory management
   */
  estimateItemSize(key, value) {
    let size = 0;

    // Key size
    size += typeof key === "string" ? key.length * 2 : 100;

    // Value size estimation
    size += this.estimateValueSize(value);

    // Object overhead
    size += 200; // Rough estimate for item wrapper and Map overhead

    return size;
  }

  estimateValueSize(value) {
    if (value === null || value === undefined) return 0;

    if (typeof value === "string") {
      return value.length * 2; // UTF-16 encoding
    }

    if (typeof value === "number") {
      return 8; // 64-bit number
    }

    if (typeof value === "boolean") {
      return 4;
    }

    if (Array.isArray(value)) {
      return (
        value.reduce((sum, item) => sum + this.estimateValueSize(item), 0) + 100
      );
    }

    if (typeof value === "object") {
      let size = 0;
      for (const [key, val] of Object.entries(value)) {
        size += key.length * 2; // Key
        size += this.estimateValueSize(val); // Value
      }
      return size + 100; // Object overhead
    }

    return 1000; // Default estimate for unknown types
  }

  enforceMemoryLimit(newItemSize) {
    const targetMemory = this.options.memoryLimit - newItemSize;

    while (this.metrics.memoryUsage > targetMemory && this.cache.size > 0) {
      this.evictOldestItem();
    }
  }

  /**
   * TTL management
   */
  isExpired(key) {
    if (!this.options.ttl) return false;

    const expireTime = this.ttlMap.get(key);
    return expireTime && Date.now() > expireTime;
  }

  expireItem(key) {
    const item = this.cache.get(key);
    if (!item) return;

    this.cache.delete(key);
    this.ttlMap.delete(key);
    this.metrics.memoryUsage -= item.size;
    this.updateEntityTypeMetrics(item.entityType, -1);
    this.recordMetric("expirations");

    if (this.options.onExpire) {
      this.options.onExpire(this.getUnprefixedKey(key), item.value);
    }

    if (this.options.auditOperations) {
      this.auditOperation("cache_expire", { key, entityType: item.entityType });
    }
  }

  evictOldestItem() {
    if (this.cache.size === 0) return;

    const [oldestKey, oldestItem] = this.cache.entries().next().value;

    this.cache.delete(oldestKey);
    this.ttlMap.delete(oldestKey);
    this.metrics.memoryUsage -= oldestItem.size;
    this.updateEntityTypeMetrics(oldestItem.entityType, -1);
    this.recordMetric("evictions");

    if (this.options.onEvict) {
      this.options.onEvict(
        this.getUnprefixedKey(oldestKey),
        oldestItem.value,
        "lru",
      );
    }

    if (this.options.auditOperations) {
      this.auditOperation("cache_evict", {
        key: oldestKey,
        reason: "lru",
        entityType: oldestItem.entityType,
      });
    }
  }

  cleanupExpired() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, expireTime] of this.ttlMap.entries()) {
      if (now > expireTime) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.expireItem(key);
    }

    this.metrics.lastCleanup = now;
  }

  startTTLCleanup() {
    if (this.cleanupInterval) return;

    // Cleanup every 30 seconds or TTL/10, whichever is smaller
    const interval = Math.min(30000, this.options.ttl / 10);

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, interval);
  }

  stopTTLCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Metrics and monitoring
   */
  recordMetric(metricName, value = 1) {
    if (this.options.enableMetrics) {
      this.metrics[metricName] += value;
    }
  }

  recordOperationTime(time) {
    this.metrics.operationTimes.push(time);

    // Keep only recent measurements
    if (this.metrics.operationTimes.length > 1000) {
      this.metrics.operationTimes = this.metrics.operationTimes.slice(-500);
    }
  }

  getMetrics() {
    const hitRate =
      this.metrics.hits + this.metrics.misses > 0
        ? (this.metrics.hits / (this.metrics.hits + this.metrics.misses)) * 100
        : 0;

    const avgOperationTime =
      this.metrics.operationTimes.length > 0
        ? this.metrics.operationTimes.reduce((a, b) => a + b) /
          this.metrics.operationTimes.length
        : 0;

    // Calculate average entity size
    this.metrics.averageEntitySize =
      this.metrics.totalEntitiesCached > 0
        ? this.metrics.memoryUsage / this.metrics.totalEntitiesCached
        : 0;

    return {
      ...this.metrics,
      hitRate: Math.round(hitRate * 100) / 100,
      avgOperationTime: Math.round(avgOperationTime * 1000) / 1000,
      memoryUtilization: this.options.memoryLimit
        ? Math.round(
            (this.metrics.memoryUsage / this.options.memoryLimit) * 100,
          )
        : null,
      itemCount: this.cache.size,
      maxSize: this.maxSize,
      utilizationPercent: Math.round((this.cache.size / this.maxSize) * 100),
      entityTypeDistribution: Object.fromEntries(this.metrics.entityTypes),
    };
  }

  resetMetrics() {
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      sets: 0,
      deletes: 0,
      memoryUsage: this.metrics.memoryUsage, // Keep memory usage
      operationTimes: [],
      lastCleanup: Date.now(),
      entityTypes: new Map(),
      averageEntitySize: 0,
      totalEntitiesCached: this.metrics.totalEntitiesCached, // Keep entity count
    };
  }

  /**
   * Audit integration
   */
  auditOperation(operation, metadata) {
    // This would integrate with the audit system
    if (this.options.enableMetrics) {
      console.log(`Cache audit: ${operation}`, metadata);
    }
  }

  /**
   * Cleanup and destruction
   */
  destroy() {
    this.stopTTLCleanup();
    this.clear();
  }

  /**
   * Configuration updates
   */
  updateOptions(newOptions) {
    const oldTTL = this.options.ttl;
    this.options = { ...this.options, ...newOptions };

    // Handle TTL changes
    if (oldTTL !== this.options.ttl) {
      if (this.options.ttl && !oldTTL) {
        this.startTTLCleanup();
      } else if (!this.options.ttl && oldTTL) {
        this.stopTTLCleanup();
        this.ttlMap.clear();
      }
    }

    // Handle max size changes
    if (newOptions.maxSize && newOptions.maxSize < this.maxSize) {
      this.maxSize = newOptions.maxSize;
      while (this.cache.size > this.maxSize) {
        this.evictOldestItem();
      }
    } else if (newOptions.maxSize) {
      this.maxSize = newOptions.maxSize;
    }
  }
}
