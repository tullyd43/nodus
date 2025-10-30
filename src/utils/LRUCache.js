/**
 * @class LRUCache
 * @description An enhanced Least Recently Used (LRU) cache implementation.
 * It provides memory-efficient caching for various data types, supporting
 * automatic eviction based on size, time-to-live (TTL), and memory limits.
 * Designed for unified entity storage with robust metrics and optional auditing.
 *
 * @template T The type of values stored in the cache.
 *
 * @property {number} maxSize - The maximum number of items the cache can hold.
 * @property {Map<string, object>} cache - The internal Map storing cache items. Keys are prefixed.
 * @property {object} options - Configuration options for the cache.
 * @property {object} metrics - Object tracking various cache performance metrics.
 * @property {Map<string, number>} ttlMap - Map storing expiration timestamps for each prefixed key.
 * @property {NodeJS.Timeout|null} cleanupInterval - The interval ID for the automatic TTL cleanup.
 */
export class LRUCache {
	/**
	 * Creates an instance of LRUCache.
	 * @param {number} [maxSize=1000] - The maximum number of items the cache can hold.
	 * @param {object} [options={}] - Configuration options for the cache.
	 * @param {number} [options.ttl=null] - Time to live for items in milliseconds. If set, items expire after this duration.
	 * @param {function(string, T, string): void} [options.onEvict=null] - Callback function invoked when an item is evicted (key, value, reason).
	 * @param {function(string, T): void} [options.onExpire=null] - Callback function invoked when an item expires (key, value).
	 * @param {boolean} [options.enableMetrics=true] - Whether to collect performance metrics.
	 * @param {boolean} [options.auditOperations=false] - Whether to log cache operations for auditing.
	 * @param {number} [options.memoryLimit=null] - Maximum memory (in bytes) the cache can consume.
	 * @param {string} [options.keyPrefix=""] - An optional prefix to apply to all keys for namespacing.
	 */
	constructor(maxSize = 1000, options = {}) {
		this.maxSize = maxSize;
		this.cache = new Map();

		// Enhanced options
		this.options = {
			/**
			 * Time to live for items in milliseconds. If set, items expire after this duration.
			 * @type {number|null}
			 */
			ttl: null,
			/**
			 * Callback function invoked when an item is evicted.
			 * @type {function(string, T, string): void|null}
			 */
			onEvict: null,
			/**
			 * Callback function invoked when an item expires.
			 * @type {function(string, T): void|null}
			 */
			onExpire: null,
			enableMetrics: options.enableMetrics !== false, // Default enabled
			/** @type {boolean} */
			auditOperations: false,
			/** @type {number|null} Memory limit in bytes. */
			memoryLimit: null,
			/** @type {string} Optional key prefix for namespacing. */
			keyPrefix: "",
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
			/**
			 * Map tracking the count of cached items per entity type.
			 * @type {Map<string, number>}
			 */
			entityTypes: new Map(), // Count by entity type
			/** @type {number} */
			averageEntitySize: 0,
			/** @type {number} */
			totalEntitiesCached: 0,
		};

		// TTL management
		/**
		 * Map storing expiration timestamps for each prefixed key.
		 * @type {Map<string, number>} */
		this.ttlMap = new Map(); // Key -> expiration time
		this.cleanupInterval = null;

		// Start automatic cleanup if TTL is enabled
		if (this.options.ttl) {
			this.startTTLCleanup();
		}
	}

	/**
	 * Retrieves an item from the cache.
	 * If the item exists and is not expired, it's marked as most recently used.
	 * Metrics are updated for hits and misses.
	 * @param {string} key - The key of the item to retrieve.
	 * @returns {T|undefined} The cached value, or `undefined` if not found or expired.
	 * @fires LRUCache#cache_get
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
	 * Adds or updates an item in the cache.
	 * Handles eviction of the least recently used item if `maxSize` is exceeded,
	 * or oldest items if `memoryLimit` is exceeded. Updates TTL and metrics.
	 * @param {string} key - The key for the item.
	 * @param {T} value - The value to cache.
	 * @param {number} [ttlOverride=null] - An optional TTL for this specific item, overriding the cache's default.
	 * @returns {void}
	 * @fires LRUCache#cache_set
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
	 * Retrieves all cached entities of a specific type.
	 * Only returns non-expired items.
	 * @param {string} entityType - The type of entities to retrieve.
	 * @returns {Map<string, T>} A Map where keys are unprefixed cache keys and values are the cached entities.
	 * @example
	 * const users = cache.getEntitiesByType('User'); // Map<userId, UserObject>
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
	 * Retrieves all cached entities that satisfy a given predicate function.
	 * Only returns non-expired items.
	 * @param {function(T, string): boolean} predicate - A function that tests each cached value and its unprefixed key.
	 *   It should return `true` to include the item in the results, `false` otherwise.
	 * @returns {Map<string, T>} A Map where keys are unprefixed cache keys and values are the cached entities.
	 * @example
	 * const activeUsers = cache.getEntitiesWhere(user => user.status === 'active');
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
	 * Retrieves a specified number of the most recently accessed entities.
	 * Only returns non-expired items.
	 * @param {number} [count=10] - The maximum number of recently accessed entities to return.
	 * @returns {Map<string, T>} A Map where keys are unprefixed cache keys and values are the cached entities,
	 *   sorted from most to least recently accessed.
	 * @example
	 * const lastFiveAccessed = cache.getRecentlyAccessed(5);
	 */
	getRecentlyAccessed(count = 10) {
		const items = Array.from(this.cache.entries())
			.filter(([key]) => !this.isExpired(key))
			.sort(([, a], [, b]) => b.accessed - a.accessed)
			.slice(0, count);

		return new Map(
			items.map(([key, item]) => [this.getUnprefixedKey(key), item.value])
		);
	}

	/**
	 * Checks if a key exists in the cache and its corresponding item has not expired.
	 * If an item is found but expired, it is removed.
	 * @param {string} key - The key to check.
	 * @returns {boolean} `true` if the key exists and is valid, `false` otherwise.
	 * @fires LRUCache#cache_expire (if an item is found and expired)
	 * @fires LRUCache#cache_delete (if an item is found and expired)
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
	 * Deletes an item from the cache.
	 * Updates memory usage, entity type counts, and metrics.
	 * @param {string} key - The key of the item to delete.
	 * @returns {boolean} `true` if the item was successfully deleted, `false` if it was not found.
	 * @fires LRUCache#cache_delete
	 * @fires LRUCache#audit_cache_delete (if auditing is enabled)
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
	 * Clears all items from the cache.
	 * Invokes the `onEvict` callback for each item if configured.
	 * Resets memory usage, entity type counts, and updates eviction metrics.
	 * @returns {number} The number of items that were cleared.
	 * @fires LRUCache#cache_clear
	 * @fires LRUCache#audit_cache_clear (if auditing is enabled)
	 */
	clear() {
		const clearedCount = this.cache.size;

		// Call eviction callback for all items if configured
		if (this.options.onEvict) {
			for (const [key, item] of this.cache.entries()) {
				this.options.onEvict(
					this.getUnprefixedKey(key),
					item.value,
					"clear"
				);
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
	 * Gets the current number of items in the cache.
	 * Automatically cleans up expired items before returning the size if TTL is enabled.
	 * @type {number}
	 * @fires LRUCache#cache_expire (during cleanup)
	 * @fires LRUCache#cache_delete (during cleanup)
	 */
	get size() {
		// Clean expired items first
		if (this.options.ttl) {
			this.cleanupExpired();
		}
		return this.cache.size;
	}

	/**
	 * Adds or updates multiple items in the cache in a batch.
	 * Each item is processed individually, and results are returned for each operation.
	 * @param {Array<[string, T]>} entries - An array of `[key, value]` pairs to set.
	 * @param {number} [ttlOverride=null] - An optional TTL for this batch of items.
	 * @returns {Array<{key: string, success: boolean, error?: string}>} An array of results for each operation.
	 * @fires LRUCache#cache_set (for each item)
	 * @fires LRUCache#audit_cache_set (for each item, if auditing is enabled)
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
	 * Retrieves multiple items from the cache in a batch.
	 * Only items that are found and not expired are included in the results.
	 * @param {string[]} keys - An array of keys to retrieve.
	 * @returns {Map<string, T>} A Map where keys are the requested keys and values are the cached items.
	 * @fires LRUCache#cache_get (for each item)
	 * @fires LRUCache#cache_expire (for each item, if expired)
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
	 * Applies the configured key prefix to a given key.
	 * @private
	 * @param {string} key - The original key.
	 * @returns {string} The prefixed key.
	 * @example
	 * cache.options.keyPrefix = "myApp"; cache.getPrefixedKey("data") // "myApp:data"
	 */
	getPrefixedKey(key) {
		return this.options.keyPrefix
			? `${this.options.keyPrefix}:${key}`
			: key;
	}

	getUnprefixedKey(prefixedKey) {
		if (
			/**
			 * Removes the configured key prefix from a prefixed key.
			 * @private
			 * @param {string} prefixedKey - The prefixed key.
			 * @returns {string} The original, unprefixed key.
			 */
			this.options.keyPrefix &&
			prefixedKey.startsWith(this.options.keyPrefix + ":")
		) {
			return prefixedKey.substring(this.options.keyPrefix.length + 1);
		}
		return prefixedKey;
	}

	/**
	 * Attempts to extract an entity type from a cached value for metrics tracking.
	 * It looks for properties like `type_id`, `type`, or `entityType` on the value object.
	 * @private
	 * @param {T} value - The cached value.
	 * @returns {string} The extracted entity type, or "primitive" if the value is not an object,
	 *   or "unknown" if no type property is found on an object.
	 */
	extractEntityType(value) {
		if (value && typeof value === "object") {
			return value.type_id || value.type || value.entityType || "unknown";
		}
		return "primitive";
	}

	/**
	 * Updates the internal count of items per entity type.
	 * Used when items are added, removed, or evicted.
	 * @private
	 * @param {string} entityType - The type of the entity.
	 * @param {number} delta - The change in count (e.g., `1` for add, `-1` for remove).
	 * @returns {void}
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
			this.metrics.totalEntitiesCached + delta
		);
	}

	/**
	 * Estimates the memory size of a cache item (key + value + overhead) in bytes.
	 * This is a rough heuristic and not a precise measurement.
	 * @private
	 * @param {string} key - The key of the item.
	 * @param {T} value - The value of the item.
	 * @returns {number} The estimated size of the item in bytes.
	 * @see {@link LRUCache#estimateValueSize} for value-specific estimation.
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

	/**
	 * Recursively estimates the memory size of a JavaScript value in bytes.
	 * This is a rough heuristic and not a precise measurement.
	 * @private
	 * @param {*} value - The value to estimate.
	 * @returns {number} The estimated size of the value in bytes. */
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
				value.reduce(
					(sum, item) => sum + this.estimateValueSize(item),
					0
				) + 100
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

	/**
	 * Enforces the configured `memoryLimit` by evicting the oldest items
	 * until the cache's total memory usage falls below the limit.
	 * This is called before adding a new item if the limit would be exceeded.
	 * @private
	 * @param {number} newItemSize - The size of the item about to be added.
	 */
	enforceMemoryLimit(newItemSize) {
		const targetMemory = this.options.memoryLimit - newItemSize;

		while (this.metrics.memoryUsage > targetMemory && this.cache.size > 0) {
			this.evictOldestItem();
		}
	}

	/**
	 * Checks if a cached item has expired based on its TTL.
	 * @private
	 * @param {string} key - The prefixed key of the item to check.
	 * @returns {boolean} `true` if the item has expired, `false` otherwise.
	 * @fires LRUCache#cache_expire (if an item is found and expired)
	 * @fires LRUCache#cache_delete (if an item is found and expired)
	 */
	isExpired(key) {
		if (!this.options.ttl) return false;

		const expireTime = this.ttlMap.get(key);
		return expireTime && Date.now() > expireTime;
	}

	/**
	 * Removes an expired item from the cache.
	 * Invokes the `onExpire` callback if configured.
	 * @private
	 * @param {string} key - The prefixed key of the item to expire.
	 * @fires LRUCache#cache_expire
	 * @fires LRUCache#audit_cache_expire (if auditing is enabled) */
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
			this.auditOperation("cache_expire", {
				key,
				entityType: item.entityType,
			});
		}
	}

	/**
	 * Evicts the least recently used item from the cache.
	 * This is called when `maxSize` is exceeded or `memoryLimit` is enforced.
	 * Invokes the `onEvict` callback if configured.
	 * @private
	 * @fires LRUCache#cache_evict
	 * @fires LRUCache#audit_cache_evict (if auditing is enabled) */
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
				"lru"
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

	/**
	 * Iterates through the `ttlMap` and removes all expired items from the cache.
	 * This method is called periodically by `startTTLCleanup`.
	 * @private
	 * @fires LRUCache#expireItem (for each expired item)
	 */
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

	/**
	 * Starts a periodic interval to automatically clean up expired cache items.
	 * The interval duration is determined by `options.ttl` or a default.
	 * @private
	 */
	startTTLCleanup() {
		if (this.cleanupInterval) return;

		// Cleanup every 30 seconds or TTL/10, whichever is smaller
		const interval = Math.min(30000, this.options.ttl / 10);

		this.cleanupInterval = setInterval(() => {
			this.cleanupExpired();
		}, interval);
	}

	/**
	 * Stops the automatic TTL cleanup interval.
	 * @private
	 */
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
		/**
		 * Records the duration of a cache operation.
		 * Only records if `options.enableMetrics` is true.
		 * @private
		 * @param {number} time - The duration of the operation in milliseconds.
		 */
		this.metrics.operationTimes.push(time);

		// Keep only recent measurements
		if (this.metrics.operationTimes.length > 1000) {
			this.metrics.operationTimes =
				this.metrics.operationTimes.slice(-500);
		}
	}

	getMetrics() {
		/**
		 * Retrieves a comprehensive object of current cache performance and usage metrics.
		 * Includes hit rate, memory usage, operation times, and entity type distribution.
		 * @returns {object} An object containing various cache metrics.
		 * @property {number} hitRate - The cache hit rate as a percentage.
		 * @property {number} avgOperationTime - The average time taken for cache operations in milliseconds. */
		const hitRate =
			this.metrics.hits + this.metrics.misses > 0
				? (this.metrics.hits /
						(this.metrics.hits + this.metrics.misses)) *
					100
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
						(this.metrics.memoryUsage / this.options.memoryLimit) *
							100
					)
				: null,
			itemCount: this.cache.size,
			maxSize: this.maxSize,
			utilizationPercent: Math.round(
				(this.cache.size / this.maxSize) * 100
			),
			entityTypeDistribution: Object.fromEntries(
				this.metrics.entityTypes
			),
		};
	}

	resetMetrics() {
		/**
		 * Resets all collected metrics to their initial state, except for current memory usage and total entity count.
		 * @returns {void}
		 */
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
	 * Placeholder for audit integration.
	 * If `options.auditOperations` is enabled, this method would typically
	 * emit an event or log to an external auditing system.
	 * Currently, it logs to the console if metrics are enabled.
	 * @private
	 * @param {string} operation - The type of cache operation (e.g., 'cache_set', 'cache_delete').
	 * @param {object} metadata - Additional context about the operation.
	 * @returns {void}
	 */
	auditOperation(operation, metadata) {
		// This would integrate with the audit system
		if (this.options.enableMetrics) {
			console.log(`Cache audit: ${operation}`, metadata);
		}
	}

	/**
	 * Destroys the cache instance, stopping all background processes
	 * and clearing all cached items.
	 * @returns {void}
	 * @fires LRUCache#stopTTLCleanup
	 * @fires LRUCache#clear
	 */
	destroy() {
		this.stopTTLCleanup();
		this.clear();
	}

	/**
	 * Updates the cache's configuration options.
	 * Handles changes to `ttl` (restarting cleanup) and `maxSize` (triggering eviction if needed).
	 * @param {object} newOptions - An object containing new configuration options to apply.
	 * @returns {void}
	 * @fires LRUCache#startTTLCleanup (if TTL is enabled)
	 * @fires LRUCache#stopTTLCleanup (if TTL is disabled)
	 * @fires LRUCache#evictOldestItem (if maxSize is reduced)
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
