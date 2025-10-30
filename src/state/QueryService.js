/**
 * @file QueryService.js
 * @description A unified search service that queries across local state, plugins, and AI embeddings.
 * It provides a single interface for global search, integrating results from multiple sources.
 */

/**
 * @class QueryService
 * @classdesc Orchestrates search queries across different domains (local, plugin, AI),
 * then ranks and caches the results for performance.
 */
export class QueryService {
	/**
	 * Creates an instance of QueryService.
	 * @param {import('../core/HybridStateManager.js').default} stateManager - The main application state manager.
	 * @param {import('../core/ManifestPluginSystem.js').default} pluginSystem - The plugin management system.
	 * @param {import('./EmbeddingManager.js').default} embeddingManager - The manager for AI-powered semantic search.
	 */
	constructor(stateManager, pluginSystem, embeddingManager) {
		/** @type {import('../core/HybridStateManager.js').default} */
		this.stateManager = stateManager;
		/** @type {import('../core/ManifestPluginSystem.js').default} */
		this.pluginSystem = pluginSystem;
		/** @type {import('./EmbeddingManager.js').default} */
		this.embeddingManager = embeddingManager;
		/** @private @type {Map<string, {results: any[], timestamp: number}>} */
		this.cache = new Map(); // Query result cache
		/** @private @type {number} */
		this.cacheTTL = 60000; // 1 minute cache
	}

	/**
	 * Executes a search across local state, plugins, and AI embeddings, then ranks and returns the results.
	 * @public
	 * @param {string} query - The search query string.
	 * @param {object} [options={}] - Search options.
	 * @param {string[]} [options.domains=[]] - An array of domains to limit the search to (e.g., 'entities', 'plugins').
	 * @param {number} [options.limit=50] - The maximum number of results to return.
	 * @param {boolean} [options.includeAI=true] - Whether to include results from the AI semantic search.
	 * @returns {Promise<any[]>} A promise that resolves with a sorted list of search results.
	 */
	async search(query, options = {}) {
		if (!query || typeof query !== "string") return [];

		const cacheKey = `${query}:${JSON.stringify(options)}`;
		const cached = this.getFromCache(cacheKey);
		if (cached) return cached;

		const results = [];
		const { domains = [], limit = 50, includeAI = true } = options;

		try {
			// 1️⃣ Local entities from HybridStateManager
			const localResults = await this.searchLocalEntities(query, domains);
			results.push(...localResults);

			// 2️⃣ Plugin results
			const pluginResults = await this.searchPlugins(query, options);
			results.push(...pluginResults);

			// 3️⃣ AI Embeddings (if enabled and available)
			if (includeAI && this.embeddingManager) {
				const aiResults = await this.searchEmbeddings(query, options);
				results.push(...aiResults);
			}

			// Rank and limit results
			const rankedResults = this.rankResults(results).slice(0, limit);

			// Cache the results
			this.setCache(cacheKey, rankedResults);

			return rankedResults;
		} catch (error) {
			console.error("[QueryService] Search failed:", error);
			return [];
		}
	}

	/**
	 * Searches for entities within the local `HybridStateManager`.
	 * @private
	 * @param {string} query - The search query.
	 * @param {string[]} [domains=[]] - An array of domains to filter the results by.
	 * @returns {Promise<any[]>} A promise that resolves with an array of local search results.
	 */
	async searchLocalEntities(query, domains = []) {
		if (!this.stateManager?.queryLocalEntities) {
			return [];
		}

		try {
			const results = await this.stateManager.queryLocalEntities(query);

			// Filter by domains if specified
			if (domains.length > 0) {
				return results.filter(
					(result) =>
						domains.includes(result.domain) ||
						domains.includes(result.type)
				);
			}

			return results;
		} catch (error) {
			console.warn("[QueryService] Local entity search failed:", error);
			return [];
		}
	}

	/**
	 * Searches for results across all active and searchable plugins.
	 * @private
	 * @param {string} query - The search query.
	 * @param {object} options - The search options to pass to the plugins.
	 * @returns {Promise<any[]>} A promise that resolves with an array of results from plugins.
	 */
	async searchPlugins(query, options) {
		if (!this.pluginSystem?.activePlugins) {
			return [];
		}

		const results = [];

		for (const plugin of this.pluginSystem.activePlugins) {
			if (typeof plugin.search === "function") {
				try {
					const pluginResults = await plugin.search(query, options);

					// Add plugin metadata to results
					const enrichedResults = pluginResults.map((result) => ({
						...result,
						source: "plugin",
						pluginId: plugin.id,
						pluginName: plugin.name || plugin.id,
					}));

					results.push(...enrichedResults);
				} catch (err) {
					console.warn(
						`[QueryService] Plugin search failed: ${plugin.id}`,
						err
					);
				}
			}
		}

		return results;
	}

	/**
	 * Performs a semantic search using the `EmbeddingManager`.
	 * @private
	 * @param {string} query - The search query.
	 * @param {object} options - The search options.
	 * @returns {Promise<any[]>} A promise that resolves with an array of AI-powered search results.
	 */
	async searchEmbeddings(query, options) {
		if (!this.embeddingManager?.semanticSearch) {
			return [];
		}

		try {
			const aiResults = await this.embeddingManager.semanticSearch(
				query,
				{
					topK: options.limit || 10,
					threshold: 0.7, // Minimum similarity threshold
				}
			);

			// Add AI metadata to results
			return aiResults.map((result) => ({
				...result,
				source: "ai",
				searchType: "semantic",
			}));
		} catch (error) {
			console.warn("[QueryService] AI search failed:", error);
			return [];
		}
	}

	/**
	 * Ranks an array of search results based on relevance score, source priority, and recency.
	 * @private
	 * @param {any[]} results - The array of search results to rank.
	 * @returns {any[]} The sorted array of results.
	 */
	rankResults(results) {
		return results.sort((a, b) => {
			// Primary sort by relevance score
			const relevanceA = a.relevance || 0;
			const relevanceB = b.relevance || 0;

			if (relevanceA !== relevanceB) {
				return relevanceB - relevanceA;
			}

			// Secondary sort by source priority (local > plugin > ai)
			const sourcePriority = { local: 3, plugin: 2, ai: 1 };
			const priorityA = sourcePriority[a.source] || 0;
			const priorityB = sourcePriority[b.source] || 0;

			if (priorityA !== priorityB) {
				return priorityB - priorityA;
			}

			// Tertiary sort by recency
			const timeA = new Date(a.timestamp || a.created || 0).getTime();
			const timeB = new Date(b.timestamp || b.created || 0).getTime();

			return timeB - timeA;
		});
	}

	/**
	 * Generates auto-complete suggestions based on a partial query string.
	 * @public
	 * @param {string} partialQuery - The partial query string to get suggestions for.
	 * @param {number} [limit=5] - The maximum number of suggestions to return.
	 * @returns {Promise<string[]>} A promise that resolves with an array of suggestion strings.
	 */
	async getSuggestions(partialQuery, limit = 5) {
		if (!partialQuery || partialQuery.length < 2) return [];

		try {
			const results = await this.search(partialQuery, {
				limit: limit * 2,
			});

			// Extract unique suggestion terms
			const suggestions = new Set();

			results.forEach((result) => {
				if (result.title) {
					suggestions.add(result.title);
				}
				if (result.name) {
					suggestions.add(result.name);
				}
				if (result.tags) {
					result.tags.forEach((tag) => suggestions.add(tag));
				}
			});

			return Array.from(suggestions)
				.filter((suggestion) =>
					suggestion
						.toLowerCase()
						.includes(partialQuery.toLowerCase())
				)
				.slice(0, limit);
		} catch (error) {
			console.warn("[QueryService] Suggestions failed:", error);
			return [];
		}
	}

	/**
	 * Retrieves results from the cache if they are valid and not expired.
	 * @private
	 * @param {string} key - The cache key for the query.
	 * @returns {any[]|null} The cached results, or null if not found or expired.
	 */
	getFromCache(key) {
		const cached = this.cache.get(key);
		if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
			return cached.results;
		}
		this.cache.delete(key);
		return null;
	}

	/**
	 * Stores a set of query results in the cache.
	 * @private
	 * @param {string} key - The cache key for the query.
	 * @param {any[]} results - The search results to cache.
	 */
	setCache(key, results) {
		this.cache.set(key, {
			results,
			timestamp: Date.now(),
		});

		// Cleanup old cache entries
		if (this.cache.size > 100) {
			const oldestKey = this.cache.keys().next().value;
			this.cache.delete(oldestKey);
		}
	}

	/**
	 * Clears the entire query result cache.
	 * @public
	 */
	clearCache() {
		this.cache.clear();
	}

	/**
	 * Retrieves analytics and status information about the `QueryService`.
	 * @public
	 * @returns {{cacheSize: number, cacheTTL: number, localSearchAvailable: boolean, pluginSearchAvailable: boolean, aiSearchAvailable: boolean}}
	 * An object containing analytics data.
	 */
	getAnalytics() {
		return {
			cacheSize: this.cache.size,
			cacheTTL: this.cacheTTL,
			localSearchAvailable: !!this.stateManager?.queryLocalEntities,
			pluginSearchAvailable: !!this.pluginSystem?.activePlugins?.length,
			aiSearchAvailable: !!this.embeddingManager?.semanticSearch,
		};
	}
}

/**
 * A utility function to query entities directly from the state manager's storage instance.
 * @param {import('../core/HybridStateManager.js').default} stateManager - The application's state manager.
 * @param {object} [options={}] - The query options.
 * @param {string} [options.store='objects'] - The name of the object store to query.
 * @param {string} options.index - The name of the index to use for the query.
 * @param {IDBValidKey|IDBKeyRange} options.query - The query value or range.
 * @param {Function} [options.fallbackFilter] - An optional filter function to apply to the results.
 * @returns {Promise<any[]>} A promise that resolves with an array of matching entities.
 */
export async function queryEntities(
	stateManager,
	{ store = "objects", index, query, fallbackFilter } = {}
) {
	const results = await stateManager.storage.instance.query(
		store,
		index,
		query
	);
	if (fallbackFilter) return results.filter(fallbackFilter);
	return results;
}

export default QueryService;
