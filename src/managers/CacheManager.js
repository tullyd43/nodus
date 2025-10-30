/**
 * @file CacheManager.js
 * @description A centralized manager for creating and monitoring all LRUCache instances in the application.
 * This ensures that all caches are integrated with core systems like metrics and security.
 */

import { AppError } from "../utils/ErrorHelpers.js";
import { LRUCache } from "../utils/LRUCache.js";

/**
 * @class CacheManager
 * @description Manages the lifecycle of all LRUCache instances. It acts as a factory
 * that automatically injects shared dependencies into each new cache.
 */
export class CacheManager {
	/**
	 * Creates an instance of CacheManager.
	 * @param {object} context - The global application context.
	 * @param {object} context.managers - The collection of system managers.
	 * @param {import('../utils/MetricsRegistry.js').MetricsRegistry} context.managers.metricsRegistry - The central metrics registry.
	 * @param {object} context.eventFlow - The application's EventFlowEngine.
	 */
	constructor(context = {}) {
		/**
		 * A map of all managed cache instances, keyed by name.
		 * @type {Map<string, LRUCache>}
		 * @private
		 */
		this.caches = new Map();
		this.context = context;
	}

	/**
	 * Retrieves an existing cache by name or creates a new one if it doesn't exist.
	 * @param {string} name - The unique name for the cache (e.g., 'entities', 'sessions').
	 * @param {number} [maxSize=1000] - The maximum number of items for the cache.
	 * @param {object} [options={}] - Additional LRUCache options (e.g., ttl, memoryLimit).
	 * @returns {LRUCache} The existing or newly created LRUCache instance.
	 */
	getCache(name, maxSize = 1000, options = {}) {
		if (this.caches.has(name)) {
			return this.caches.get(name);
		}

		if (!name) {
			throw new AppError("Cache must have a name.", {
				category: "configuration_error",
			});
		}

		// Create a new cache, injecting shared dependencies
		const newCache = new LRUCache(maxSize, {
			keyPrefix: name,
			...this.context, // Pass the full context down to the LRUCache
			...options,
		});

		this.caches.set(name, newCache);
		console.log(`[CacheManager] Created new cache: '${name}'`);
		return newCache;
	}

	/**
	 * Retrieves metrics from all managed caches.
	 * @returns {object} An object where keys are cache names and values are their metrics.
	 */
	getAllMetrics() {
		const allMetrics = {};
		for (const [name, cache] of this.caches.entries()) {
			allMetrics[name] = cache.getMetrics();
		}
		return allMetrics;
	}

	/**
	 * Clears all items from all managed caches.
	 * @returns {void}
	 */
	clearAll() {
		for (const cache of this.caches.values()) {
			cache.clear();
		}
		console.log(`[CacheManager] Cleared all ${this.caches.size} caches.`);
	}

	/**
	 * Destroys all managed caches, stopping any background processes.
	 * @returns {void}
	 */
	destroyAll() {
		for (const cache of this.caches.values()) {
			cache.destroy();
		}
		this.caches.clear();
		console.log(`[CacheManager] Destroyed all caches.`);
	}
}
