/**
 * @file QueryService.js
 * @description A unified search service that queries across local state, plugins, and AI embeddings.
 * It provides a single interface for global search, integrating results from multiple sources.
 */
import { ErrorHelpers } from "../utils/ErrorHelpers.js";

/**
 * @class QueryService
 * @classdesc Orchestrates search queries across different domains (local, plugin, AI),
 * then ranks and caches the results for performance.
 */
export class QueryService {
	/**
	 * Creates an instance of QueryService.
	 * @param {object} dependencies - The dependencies for the service.
	 * @param {import('../core/HybridStateManager.js').default} dependencies.stateManager - The main state manager.
	 * @param {import('../core/ManifestPluginSystem.js').default} dependencies.pluginSystem - The plugin system.
	 * @param {import('./EmbeddingManager.js').default} dependencies.embeddingManager - The embedding manager.
	 * @param {import('../managers/CacheManager.js').CacheManager} [dependencies.cacheManager] - The central cache manager.
	 * @param {import('../utils/MetricsRegistry.js').MetricsRegistry} dependencies.metricsRegistry - The central metrics registry.
	 */
	constructor({
		stateManager,
		pluginSystem,
		embeddingManager,
		cacheManager,
		metricsRegistry,
	}) {
		/** @type {import('../core/HybridStateManager.js').default} */
		this.stateManager = stateManager;
		/** @type {import('../core/ManifestPluginSystem.js').default} */
		this.pluginSystem = pluginSystem;
		/** @type {import('./EmbeddingManager.js').default} */
		this.embeddingManager = embeddingManager;
		/** @type {import('../utils/MetricsRegistry.js').MetricsRegistry|undefined} */
		this.metrics = metricsRegistry?.namespace("query");

		// Use the central cache manager for integrated caching
		this.cache = cacheManager?.getCache("queries", 200, { ttl: 60000 }); // 1 min TTL
		// Create a dedicated error boundary for this service
		this.errorBoundary = ErrorHelpers.createErrorBoundary(
			{
				eventFlow: this.stateManager?.eventFlow,
				managers: this.stateManager?.managers,
			},
			"QueryService"
		);
	}

	/**
	 * Executes a search across local state, plugins, and AI embeddings, then ranks and returns the results.
	 * @public
	 * @param {string} query - The search query string.
	 * @param {object} [options={}] - Search options.
	 * @param {string[]} [options.domains=[]] - Domains to limit search to (e.g., 'entities', 'plugins').
	 * @param {number} [options.limit=50] - The maximum number of results to return.
	 * @param {boolean} [options.includeAI=true] - Whether to include results from the AI semantic search.
	 * @returns {Promise<any[]>} A promise that resolves with a sorted list of search results.
	 */
	async search(query, options = {}) {
		return this.metrics?.timerAsync("search.duration", async () => {
			if (!query || typeof query !== "string") return [];

			const cacheKey = `${query}:${JSON.stringify(options)}`;
			const cached = this.cache?.get(cacheKey);
			if (cached) {
				this.metrics?.increment("cache_hit");
				return cached;
			}

			this.metrics?.increment("cache_miss");
			const results = [];
			const { domains = [], limit = 50, includeAI = true } = options;

			// 1️⃣ Local entities from HybridStateManager
			const localResults = await this.searchLocalEntities(query, domains);
			results.push(...localResults);

			// 2️⃣ Plugin results
			const pluginResults = await this.searchPlugins(query, domains);
			results.push(...pluginResults);

			// 3️⃣ AI Embeddings (if enabled and available)
			if (includeAI && this.embeddingManager) {
				const aiResults = await this.searchEmbeddings(query, { limit });
				results.push(...aiResults);
			}

			// Rank and limit results
			const rankedResults = this.rankResults(results).slice(0, limit);

			// Cache the results
			this.cache?.set(cacheKey, rankedResults);

			return rankedResults;
		});
	}

	/**
	 * Searches for entities within the local `HybridStateManager`.
	 * @private
	 * @param {string} query - The search query.
	 * @param {string[]} [domains=[]] - An array of domains to filter the results by.
	 * @returns {Promise<any[]>} A promise that resolves with an array of local search results.
	 */
	async searchLocalEntities(query, domains = []) {
		return this.errorBoundary.tryAsync(async () => {
			if (!this.stateManager?.queryLocalEntities) {
				return [];
			}
			const results = await this.stateManager.queryLocalEntities(query);

			// Filter by domains if specified
			if (domains.length > 0) {
				return (results || []).filter(
					(result) =>
						domains.includes(result.domain) ||
						domains.includes(result.type)
				);
			}

			return results;
		});
	}

	/**
	 * Searches for results across all active and searchable plugins.
	 * @private
	 * @param {string} query - The search query.
	 * @param {string[]} domains - The domains to search within.
	 * @returns {Promise<any[]>} A promise that resolves with an array of results from plugins.
	 */
	async searchPlugins(query, domains) {
		return this.errorBoundary.tryAsync(async () => {
			if (!this.pluginSystem?.activePlugins) {
				return [];
			}

			const searchPromises = [];

			for (const plugin of this.pluginSystem.activePlugins) {
				if (typeof plugin.search === "function") {
					// Wrap each plugin search in its own error boundary to prevent one failing plugin from stopping others
					const pluginSearch = ErrorHelpers.captureAsync(
						() => plugin.search(query, { domains }),
						this.stateManager?.eventFlow,
						{ component: `Plugin.${plugin.id}` }
					).then((pluginResults) => {
						if (!pluginResults) return [];
						// Add plugin metadata to results
						return pluginResults.map((result) => ({
							...result,
							source: "plugin",
							pluginId: plugin.id,
							pluginName: plugin.name || plugin.id,
						}));
					});
					searchPromises.push(pluginSearch);
				}
			}

			const allPluginResults = await Promise.all(searchPromises);
			return allPluginResults.flat().filter(Boolean);
		});
	}

	/**
	 * Performs a semantic search using the `EmbeddingManager`.
	 * @private
	 * @param {string} query - The search query.
	 * @param {object} options - The search options.
	 * @returns {Promise<any[]>} A promise that resolves with an array of AI-powered search results.
	 */
	async searchEmbeddings(query, options) {
		return this.errorBoundary.tryAsync(async () => {
			if (!this.embeddingManager?.semanticSearch) {
				return [];
			}
			const aiResults = await this.embeddingManager.semanticSearch(
				query,
				{
					topK: options.limit || 10,
					threshold: 0.7, // Minimum similarity threshold
				}
			);

			if (!aiResults) return [];

			// Add AI metadata to results
			return aiResults.map((result) => ({
				...result,
				source: "ai",
				searchType: "semantic",
			}));
		});
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
		return this.errorBoundary.tryAsync(async () => {
			if (!partialQuery || partialQuery.length < 2) return [];
			const results = await this.search(partialQuery, {
				limit: limit * 2,
			});

			if (!results) return [];

			// Extract unique suggestion terms
			const suggestions = new Set();

			results.forEach((result) => {
				if (result.title) suggestions.add(result.title);
				if (result.name) suggestions.add(result.name);
				if (result.tags)
					result.tags.forEach((tag) => suggestions.add(tag));
			});

			return Array.from(suggestions)
				.filter((suggestion) =>
					suggestion
						.toLowerCase()
						.includes(partialQuery.toLowerCase())
				)
				.slice(0, limit);
		});
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
	getStats() {
		return {
			cache: this.cache?.getMetrics(),
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
