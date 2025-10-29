/**
 * EmbeddingManager.js
 * Handles vector embeddings for AI semantic search and context in Nodus V7.x
 * Integrates with HybridStateManager, MetricsReporter, and caching for performance.
 */

export class EmbeddingManager {
	constructor(stateManager, options = {}) {
		this.stateManager = stateManager;
		this.metrics = stateManager?.metrics || null;

		this.options = {
			model: "text-embedding",
			maxCacheSize: 1000,
			embeddingDimensions: 384,
			batchSize: 10,
			apiEndpoint: null,
			...options,
		};

		this.vectors = new Map(); // In-memory embedding cache
		this.pendingEmbeddings = new Map(); // Deduplication for concurrent requests
		this.processingQueue = [];
		this.isProcessing = false;
		this.similarityCache = new Map(); // Semantic similarity cache

		this.initializeCache();
	}

	/**
	 * Initialize the embedding cache from HybridStateManager
	 */
	async initializeCache() {
		try {
			if (this.stateManager?.getEmbeddingCache) {
				const cachedVectors =
					await this.stateManager.getEmbeddingCache();
				for (const [id, data] of cachedVectors) {
					this.vectors.set(id, data);
				}
				console.log(
					`[EmbeddingManager] Loaded ${cachedVectors.size} cached embeddings`
				);
				this.recordMetric("embeddings_cache_load", cachedVectors.size);
			}
		} catch (error) {
			console.warn(
				"[EmbeddingManager] Failed to load cached embeddings:",
				error
			);
		}
	}

	/**
	 * Generate embedding for text with metadata
	 */
	async generateEmbedding(text, meta = {}) {
		if (!text || typeof text !== "string") return null;

		const textHash = this.hashText(text);
		const id = meta.id || `emb_${textHash}`;

		if (this.vectors.has(id)) {
			this.recordMetric("embeddings_cache_hit");
			return { id, vector: this.vectors.get(id).vector, cached: true };
		}

		if (this.pendingEmbeddings.has(textHash)) {
			this.recordMetric("embeddings_pending_hit");
			return await this.pendingEmbeddings.get(textHash);
		}

		const embeddingPromise = this.processEmbedding(text, id, meta);
		this.pendingEmbeddings.set(textHash, embeddingPromise);

		try {
			const result = await embeddingPromise;
			this.pendingEmbeddings.delete(textHash);
			this.recordMetric("embeddings_generated");
			return result;
		} catch (error) {
			this.pendingEmbeddings.delete(textHash);
			this.recordMetric("embeddings_failed");
			throw error;
		}
	}

	async processEmbedding(text, id, meta) {
		try {
			const start = performance.now();
			let vector;

			if (this.options.apiEndpoint) {
				vector = await this.callEmbeddingAPI(text);
			} else {
				vector = await this.generatePlaceholderEmbedding(text);
			}

			const embeddingData = {
				vector,
				meta: {
					...meta,
					text: text.substring(0, 100),
					timestamp: Date.now(),
					dimensions: vector.length,
				},
			};

			this.vectors.set(id, embeddingData);

			if (this.stateManager?.saveEmbedding) {
				await this.stateManager.saveEmbedding(id, embeddingData);
			}

			this.manageCacheSize();

			const duration = performance.now() - start;
			this.recordMetric("embedding_generation_time", duration);
			return { id, vector, cached: false };
		} catch (error) {
			console.error(
				"[EmbeddingManager] Failed to generate embedding:",
				error
			);
			throw error;
		}
	}

	async callEmbeddingAPI(text) {
		const response = await fetch(this.options.apiEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.options.apiKey}`,
			},
			body: JSON.stringify({ model: this.options.model, input: text }),
		});

		if (!response.ok)
			throw new Error(`API request failed: ${response.status}`);
		const data = await response.json();
		return data.data[0].embedding;
	}

	async generatePlaceholderEmbedding(text) {
		const hash = this.hashText(text);
		const vector = [];
		for (let i = 0; i < this.options.embeddingDimensions; i++) {
			const seed = (hash * (i + 1)) % 2147483647;
			const normalized = (Math.sin(seed) + 1) / 2;
			vector.push((normalized - 0.5) * 2);
		}
		const magnitude = Math.sqrt(
			vector.reduce((sum, val) => sum + val * val, 0)
		);
		return vector.map((val) => val / magnitude);
	}

	/**
	 * Perform semantic search using embeddings
	 */
	async semanticSearch(query, options = {}) {
		const { topK = 5, threshold = 0.5, includeText = false } = options;
		if (!query) return [];

		try {
			const queryEmbedding = await this.generateEmbedding(query);
			if (!queryEmbedding) return [];
			const queryVector = queryEmbedding.vector;
			const results = [];

			for (const [id, data] of this.vectors.entries()) {
				const similarity = this.cosineSimilarity(
					queryVector,
					data.vector
				);
				if (similarity >= threshold) {
					results.push({
						id,
						relevance: similarity,
						meta: data.meta,
						text: includeText ? data.meta.text : undefined,
					});
				}
			}

			const top = results
				.sort((a, b) => b.relevance - a.relevance)
				.slice(0, topK);
			this.recordMetric("semantic_search_executed");
			return top;
		} catch (error) {
			console.error("[EmbeddingManager] Semantic search failed:", error);
			this.recordMetric("semantic_search_failed");
			return [];
		}
	}

	async generateBatchEmbeddings(texts, metas = []) {
		const results = [];
		const batches = this.createBatches(texts, this.options.batchSize);
		const start = performance.now();

		for (const batch of batches) {
			const batchPromises = batch.map((text, index) => {
				const meta = metas[index] || {};
				return this.generateEmbedding(text, meta);
			});

			const batchResults = await Promise.allSettled(batchPromises);
			batchResults.forEach((result, index) => {
				if (result.status === "fulfilled") results.push(result.value);
				else {
					console.error(
						`[EmbeddingManager] Batch embedding ${index} failed:`,
						result.reason
					);
					results.push(null);
				}
			});
		}

		const duration = performance.now() - start;
		this.recordMetric("batch_embedding_time", duration);
		return results;
	}

	cosineSimilarity(a, b) {
		if (a.length !== b.length)
			throw new Error("Vectors must have same dimensions");
		const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
		const magA = Math.sqrt(a.reduce((s, ai) => s + ai * ai, 0));
		const magB = Math.sqrt(b.reduce((s, bi) => s + bi * bi, 0));
		return magA && magB ? dot / (magA * magB) : 0;
	}

	async findSimilar(targetId, topK = 5, threshold = 0.7) {
		const targetData = this.vectors.get(targetId);
		if (!targetData) throw new Error(`Embedding not found: ${targetId}`);
		const results = [];
		for (const [id, data] of this.vectors.entries()) {
			if (id === targetId) continue;
			const similarity = this.cosineSimilarity(
				targetData.vector,
				data.vector
			);
			if (similarity >= threshold) {
				results.push({ id, relevance: similarity, meta: data.meta });
			}
		}
		this.recordMetric("similarity_search_executed");
		return results.sort((a, b) => b.relevance - a.relevance).slice(0, topK);
	}

	/**
	 * Entity persistence (HybridStateManager)
	 */
	async upsertEmbedding(entityId, vector, version = "v1") {
		const entity = this.stateManager?.clientState?.entities?.get(entityId);
		if (!entity) return;

		entity.embeddings = entity.embeddings || {};
		entity.embeddings.default = vector;
		entity.embedding_version = version;
		entity.embedding_updated_at = Date.now();

		await this.stateManager.storage.instance.put("objects", entity);
		this.stateManager.emit?.("entitySaved", {
			store: "objects",
			item: entity,
		});
		this.updateSimilarityCache(entityId, vector);

		this.recordMetric("entity_embedding_upserted");
	}

	async bulkUpsertEmbeddings(embeddings = [], version = "v1") {
		if (!embeddings.length) return;
		const storage = this.stateManager?.storage?.instance;
		const updated = [];

		for (const { id, vector } of embeddings) {
			const entity = this.stateManager?.clientState?.entities?.get(id);
			if (!entity) continue;

			entity.embeddings = entity.embeddings || {};
			entity.embeddings.default = vector;
			entity.embedding_version = version;
			entity.embedding_updated_at = Date.now();

			updated.push(entity);
			this.updateSimilarityCache(id, vector);
		}

		if (storage?.bulkPut) await storage.bulkPut("objects", updated);
		else for (const e of updated) await storage.put("objects", e);

		this.stateManager.emit?.("embeddingsBatchUpdated", {
			count: updated.length,
			version,
			entities: updated.map((e) => e.id),
		});

		this.recordMetric("bulk_embeddings_upserted", updated.length);
		console.log(
			`[EmbeddingManager] Bulk upserted ${updated.length} embeddings (v${version})`
		);
	}

	updateSimilarityCache(entityId, vector) {
		if (!vector?.length) return;
		this.similarityCache.set(entityId, this.normalizeVector(vector));
	}

	normalizeVector(vec) {
		const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
		return mag ? vec.map((v) => v / mag) : vec;
	}

	hashText(text) {
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			hash = (hash << 5) - hash + text.charCodeAt(i);
			hash &= hash;
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
			const entries = Array.from(this.vectors.entries());
			entries.sort((a, b) => a[1].meta.timestamp - b[1].meta.timestamp);
			const toRemove = entries.slice(
				0,
				entries.length - this.options.maxCacheSize
			);
			toRemove.forEach(([id]) => this.vectors.delete(id));
			console.log(
				`[EmbeddingManager] Removed ${toRemove.length} old embeddings from cache`
			);
			this.recordMetric("embeddings_cache_trimmed", toRemove.length);
		}
	}

	getStats() {
		return {
			cacheSize: this.vectors.size,
			maxCacheSize: this.options.maxCacheSize,
			pendingEmbeddings: this.pendingEmbeddings.size,
			embeddingDimensions: this.options.embeddingDimensions,
			apiConfigured: !!this.options.apiEndpoint,
		};
	}

	clearCache() {
		this.vectors.clear();
		this.pendingEmbeddings.clear();
		console.log("[EmbeddingManager] Cache cleared");
		this.recordMetric("embeddings_cache_cleared");
	}

	exportEmbeddings() {
		const exported = {};
		for (const [id, data] of this.vectors.entries()) {
			exported[id] = { vector: data.vector, meta: data.meta };
		}
		return exported;
	}

	importEmbeddings(exported) {
		let imported = 0;
		for (const [id, data] of Object.entries(exported)) {
			this.vectors.set(id, data);
			imported++;
		}
		console.log(`[EmbeddingManager] Imported ${imported} embeddings`);
		this.recordMetric("embeddings_imported", imported);
		return imported;
	}

	recordMetric(name, value = 1) {
		if (!this.metrics?.record) return;
		try {
			this.metrics.record("ai.embeddings", name, value);
		} catch (err) {
			console.warn(
				"[EmbeddingManager] Metric recording failed:",
				err.message
			);
		}
	}
}

export default EmbeddingManager;
