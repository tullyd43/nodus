/**
 * EmbeddingManager.js
 * Handles vector embeddings for AI semantic search and context in Nodus V7.1
 * Integrates with HybridStateManager and provides caching for performance
 */

export class EmbeddingManager {
  constructor(stateManager, options = {}) {
    this.stateManager = stateManager;
    this.options = {
      model: "text-embedding",
      maxCacheSize: 1000,
      embeddingDimensions: 384,
      batchSize: 10,
      apiEndpoint: null, // Set to use real API
      ...options
    };
    
    this.vectors = new Map(); // In-memory vector cache
    this.pendingEmbeddings = new Map(); // Deduplication for concurrent requests
    this.processingQueue = [];
    this.isProcessing = false;
    
    this.initializeCache();
  }

  /**
   * Initialize the embedding cache from HybridStateManager
   */
  async initializeCache() {
    try {
      if (this.stateManager?.getEmbeddingCache) {
        const cachedVectors = await this.stateManager.getEmbeddingCache();
        for (const [id, data] of cachedVectors) {
          this.vectors.set(id, data);
        }
        console.log(`[EmbeddingManager] Loaded ${cachedVectors.size} cached embeddings`);
      }
    } catch (error) {
      console.warn('[EmbeddingManager] Failed to load cached embeddings:', error);
    }
  }

  /**
   * Generate embedding for text with metadata
   * @param {string} text - Text to embed
   * @param {object} meta - Metadata to associate with embedding
   * @returns {Promise<object>} Embedding result with id and vector
   */
  async generateEmbedding(text, meta = {}) {
    if (!text || typeof text !== 'string') {
      return null;
    }

    const textHash = this.hashText(text);
    const id = meta.id || `emb_${textHash}`;

    // Check if we already have this embedding
    if (this.vectors.has(id)) {
      return {
        id,
        vector: this.vectors.get(id).vector,
        cached: true
      };
    }

    // Check if embedding is already being processed
    if (this.pendingEmbeddings.has(textHash)) {
      return await this.pendingEmbeddings.get(textHash);
    }

    // Create promise for this embedding
    const embeddingPromise = this.processEmbedding(text, id, meta);
    this.pendingEmbeddings.set(textHash, embeddingPromise);

    try {
      const result = await embeddingPromise;
      this.pendingEmbeddings.delete(textHash);
      return result;
    } catch (error) {
      this.pendingEmbeddings.delete(textHash);
      throw error;
    }
  }

  /**
   * Process a single embedding
   */
  async processEmbedding(text, id, meta) {
    try {
      let vector;
      
      if (this.options.apiEndpoint) {
        // Use real API endpoint
        vector = await this.callEmbeddingAPI(text);
      } else {
        // Use placeholder implementation
        vector = await this.generatePlaceholderEmbedding(text);
      }

      const embeddingData = {
        vector,
        meta: {
          ...meta,
          text: text.substring(0, 100), // Store truncated text for debugging
          timestamp: Date.now(),
          dimensions: vector.length
        }
      };

      // Store in cache
      this.vectors.set(id, embeddingData);
      
      // Persist to HybridStateManager
      if (this.stateManager?.saveEmbedding) {
        await this.stateManager.saveEmbedding(id, embeddingData);
      }

      // Manage cache size
      this.manageCacheSize();

      return { id, vector, cached: false };
    } catch (error) {
      console.error('[EmbeddingManager] Failed to generate embedding:', error);
      throw error;
    }
  }

  /**
   * Call real embedding API
   */
  async callEmbeddingAPI(text) {
    const response = await fetch(this.options.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify({
        model: this.options.model,
        input: text
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  /**
   * Generate placeholder embedding for development/testing
   */
  async generatePlaceholderEmbedding(text) {
    // Create deterministic but varied embeddings based on text content
    const hash = this.hashText(text);
    const vector = [];
    
    for (let i = 0; i < this.options.embeddingDimensions; i++) {
      const seed = (hash * (i + 1)) % 2147483647;
      const normalized = (Math.sin(seed) + 1) / 2; // Normalize to 0-1
      vector.push((normalized - 0.5) * 2); // Center around 0
    }
    
    // Normalize the vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(val => val / magnitude);
  }

  /**
   * Perform semantic search using embeddings
   * @param {string} query - Search query
   * @param {object} options - Search options
   * @returns {Promise<Array>} Ranked results
   */
  async semanticSearch(query, options = {}) {
    const {
      topK = 5,
      threshold = 0.5,
      includeText = false
    } = options;

    if (!query) return [];

    try {
      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query);
      if (!queryEmbedding) return [];

      const queryVector = queryEmbedding.vector;
      const results = [];

      // Calculate similarity with all cached embeddings
      for (const [id, data] of this.vectors.entries()) {
        const similarity = this.cosineSimilarity(queryVector, data.vector);
        
        if (similarity >= threshold) {
          results.push({
            id,
            relevance: similarity,
            meta: data.meta,
            text: includeText ? data.meta.text : undefined
          });
        }
      }

      // Sort by relevance and return top K
      return results
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, topK);

    } catch (error) {
      console.error('[EmbeddingManager] Semantic search failed:', error);
      return [];
    }
  }

  /**
   * Batch process multiple texts for embeddings
   */
  async generateBatchEmbeddings(texts, metas = []) {
    const results = [];
    const batches = this.createBatches(texts, this.options.batchSize);

    for (const batch of batches) {
      const batchPromises = batch.map((text, index) => {
        const meta = metas[index] || {};
        return this.generateEmbedding(text, meta);
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`[EmbeddingManager] Batch embedding ${index} failed:`, result.reason);
          results.push(null);
        }
      });
    }

    return results;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vectorA, vectorB) {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    const dotProduct = vectorA.reduce((sum, a, i) => sum + a * vectorB[i], 0);
    const magnitudeA = Math.sqrt(vectorA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vectorB.reduce((sum, b) => sum + b * b, 0));

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Find similar embeddings to a given embedding
   */
  async findSimilar(targetId, topK = 5, threshold = 0.7) {
    const targetData = this.vectors.get(targetId);
    if (!targetData) {
      throw new Error(`Embedding not found: ${targetId}`);
    }

    const targetVector = targetData.vector;
    const results = [];

    for (const [id, data] of this.vectors.entries()) {
      if (id === targetId) continue; // Skip self

      const similarity = this.cosineSimilarity(targetVector, data.vector);
      
      if (similarity >= threshold) {
        results.push({
          id,
          relevance: similarity,
          meta: data.meta
        });
      }
    }

    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, topK);
  }

  /**
   * Utility methods
   */
  hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  manageCacheSize() {
    if (this.vectors.size > this.options.maxCacheSize) {
      // Remove oldest entries (simple LRU)
      const entries = Array.from(this.vectors.entries());
      entries.sort((a, b) => a[1].meta.timestamp - b[1].meta.timestamp);
      
      const toRemove = entries.slice(0, entries.length - this.options.maxCacheSize);
      toRemove.forEach(([id]) => this.vectors.delete(id));
      
      console.log(`[EmbeddingManager] Removed ${toRemove.length} old embeddings from cache`);
    }
  }

  /**
   * Get embedding statistics
   */
  getStats() {
    return {
      cacheSize: this.vectors.size,
      maxCacheSize: this.options.maxCacheSize,
      pendingEmbeddings: this.pendingEmbeddings.size,
      embeddingDimensions: this.options.embeddingDimensions,
      apiConfigured: !!this.options.apiEndpoint
    };
  }

  /**
   * Clear all cached embeddings
   */
  clearCache() {
    this.vectors.clear();
    this.pendingEmbeddings.clear();
    console.log('[EmbeddingManager] Cache cleared');
  }

  /**
   * Export embeddings for backup or analysis
   */
  exportEmbeddings() {
    const exported = {};
    for (const [id, data] of this.vectors.entries()) {
      exported[id] = {
        vector: data.vector,
        meta: data.meta
      };
    }
    return exported;
  }

  /**
   * Import embeddings from backup
   */
  importEmbeddings(exported) {
    let imported = 0;
    for (const [id, data] of Object.entries(exported)) {
      this.vectors.set(id, data);
      imported++;
    }
    console.log(`[EmbeddingManager] Imported ${imported} embeddings`);
    return imported;
  }
}

export default EmbeddingManager;
