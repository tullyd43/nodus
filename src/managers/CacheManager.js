/**
 * @file CacheManager.js
 * @description A centralized manager for creating and monitoring all LRUCache instances in the application.
 * This ensures that all caches are integrated with core systems like metrics and security.
 */

import { LRUCache } from "../utils/LRUCache.js";

/**
 * @class CacheManager
 * @description Manages the lifecycle of all LRUCache instances. It acts as a factory
 * that automatically injects shared dependencies into each new cache.
 * @privateFields {#caches, #stateManager, #metrics, #errorHelpers}
 */
export class CacheManager {
	/** @private @type {Map<string, LRUCache>} */
	#caches = new Map();
	/** @private @type {import('../core/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers;

	/**
	 * Creates an instance of CacheManager.
	 * @param {object} context - The global application context.
	 * @param {import('../core/HybridStateManager.js').default} context.stateManager - The main state manager, providing access to all other managers.
	 */
	constructor({ stateManager }) {
		// V8.0 Parity: The stateManager is the single source of truth for all dependencies.
		this.#stateManager = stateManager;
		this.#metrics = stateManager.metricsRegistry?.namespace("cacheManager");
		this.#errorHelpers = stateManager.managers.errorHelpers;
	}

	/**
	 * Retrieves an existing cache by name or creates a new one if it doesn't exist.
	 * @param {string} name - The unique name for the cache (e.g., 'entities', 'sessions').
	 * @param {number} [maxSize=1000] - The maximum number of items for the cache.
	 * @param {object} [options={}] - Additional LRUCache options (e.g., ttl, memoryLimit).
	 * @returns {LRUCache} The existing or newly created LRUCache instance.
	 */
	getCache(name, maxSize = 1000, options = {}) {
		if (this.#caches.has(name)) {
			return this.#caches.get(name);
		}

		if (!name) {
			const error = new Error("Cache must have a name.");
			this.#errorHelpers?.handleError(error, {
				component: "CacheManager",
				operation: "getCache",
				category: "configuration_error",
			});
			throw error;
		}

		// Create a new cache, injecting shared dependencies
		const newCache = new LRUCache(maxSize, {
			stateManager: this.#stateManager, // Pass the stateManager directly.
			keyPrefix: name,
			...options,
		});

		this.#caches.set(name, newCache);
		this.#metrics?.increment("cache.created");
		console.log(`[CacheManager] Created new cache: '${name}'`);
		return newCache;
	}

	/**
	 * Retrieves metrics from all managed caches.
	 * @returns {object} An object where keys are cache names and values are their metrics.
	 */
	getAllMetrics() {
		const allMetrics = {};
		for (const [name, cache] of this.#caches.entries()) {
			allMetrics[name] = cache.getMetrics();
		}
		return allMetrics;
	}

	/**
	 * Clears all items from all managed caches.
	 * @returns {void}
	 */
	clearAll() {
		for (const cache of this.#caches.values()) {
			cache.clear();
		}
		this.#metrics?.increment("cache.cleared.all");
		console.log(`[CacheManager] Cleared all ${this.#caches.size} caches.`);
	}

	/**
	 * Destroys all managed caches, stopping any background processes.
	 * @returns {void}
	 */
	destroyAll() {
		for (const cache of this.#caches.values()) {
			cache.destroy();
		}
		this.#caches.clear();
		this.#metrics?.increment("cache.destroyed.all");
		console.log(`[CacheManager] Destroyed all caches.`);
	}
}
