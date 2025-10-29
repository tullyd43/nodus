/**
 * QueryService.js
 * Unified global/AI/plugin search interface for Nodus V7.1
 * Integrates with HybridStateManager, plugin system, and AI embeddings
 */

export class QueryService {
  constructor(stateManager, pluginSystem, embeddingManager) {
    this.stateManager = stateManager;
    this.pluginSystem = pluginSystem;
    this.embeddingManager = embeddingManager;
    this.cache = new Map(); // Query result cache
    this.cacheTTL = 60000; // 1 minute cache
  }

  /**
   * Search across local state, plugins, and AI embeddings.
   * @param {string} query - Search query string
   * @param {object} [options] - Search options
   * @param {string[]} [options.domains] - Limit search to specific domains
   * @param {number} [options.limit] - Maximum results to return
   * @param {boolean} [options.includeAI] - Include AI semantic search
   * @returns {Promise<Array>} sorted list of results
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
   * Search local entities in HybridStateManager
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
            domains.includes(result.domain) || domains.includes(result.type),
        );
      }

      return results;
    } catch (error) {
      console.warn("[QueryService] Local entity search failed:", error);
      return [];
    }
  }

  /**
   * Search across active plugins
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
            err,
          );
        }
      }
    }

    return results;
  }

  /**
   * Search using AI embeddings
   */
  async searchEmbeddings(query, options) {
    if (!this.embeddingManager?.semanticSearch) {
      return [];
    }

    try {
      const aiResults = await this.embeddingManager.semanticSearch(query, {
        topK: options.limit || 10,
        threshold: 0.7, // Minimum similarity threshold
      });

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
   * Rank results by relevance, recency, and source priority
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
   * Get suggestions for query completion
   */
  async getSuggestions(partialQuery, limit = 5) {
    if (!partialQuery || partialQuery.length < 2) return [];

    try {
      const results = await this.search(partialQuery, { limit: limit * 2 });

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
          suggestion.toLowerCase().includes(partialQuery.toLowerCase()),
        )
        .slice(0, limit);
    } catch (error) {
      console.warn("[QueryService] Suggestions failed:", error);
      return [];
    }
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.results;
    }
    this.cache.delete(key);
    return null;
  }

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
   * Clear the query cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get search analytics
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

export default QueryService;
