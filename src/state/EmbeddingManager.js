/**
 * @file EmbeddingManager.js
 * @description Manages the creation, caching, and searching of vector embeddings for AI-powered semantic features.
 * This class integrates with the HybridStateManager for persistence and provides an API for semantic search and similarity analysis.
 */

import { DateCore } from "../utils/DateUtils.js";
/**
 * @privateFields {#stateManager, #managers, #idManager, #metrics, #NetworkError, #PolicyError, #errorBoundary, #options, #cache, #pendingEmbeddings, #similarityCache}
 * @class EmbeddingManager
 * @classdesc Handles all operations related to vector embeddings, including generation via API or placeholders,
 * caching, semantic search, and persistence through the HybridStateManager.
 */
export class EmbeddingManager {
	// V8.0 Parity: Mandate 3.1 - All internal properties MUST be private.
	/** @private @type {import('../core/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {object} */
	#managers;
	/** @private @type {import('../core/IdManager.js').default} */
	#idManager;
	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|undefined} */
	#metrics;
	/** @private @type {ErrorConstructor} */
	#NetworkError;
	/** @private @type {ErrorConstructor} */
	#PolicyError;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorBoundary} */
	#errorBoundary;
	/** @private @type {object} */
	#options;
	/** @private @type {import('../utils/caching/LRUCache.js').LRUCache} */
	#cache;
	/** @private @type {Map<string, Promise<any>>} */
	#pendingEmbeddings;
	/** @private @type {import('../utils/caching/LRUCache.js').LRUCache} */
	#similarityCache;

	/**
	 * Creates an instance of EmbeddingManager.
	 * @param {object} dependencies - The dependencies for the service.
	 * @param {import('../core/HybridStateManager.js').default} dependencies.stateManager - The main state manager, providing access to all other managers.
	 * @param {string} [options.model='text-embedding'] - The name of the embedding model to use.
	 * @param {number} [options.embeddingDimensions=384] - The dimensionality of the embedding vectors.
	 * @param {number} [options.batchSize=10] - The default batch size for processing multiple embeddings.
	 * @param {string|null} [options.apiEndpoint=null] - The API endpoint for the embedding generation service.
	 */
	constructor({ stateManager, ...options } = {}) {
		this.#stateManager = stateManager;
		this.#managers = stateManager.managers;
		this.#idManager = this.#managers.idManager;
		this.#metrics =
			this.#managers.metricsRegistry?.namespace("ai.embeddings");

		// V8.0 Parity: Mandate 1.2 - Derive ErrorHelpers from the stateManager.
		const ErrorHelpers = this.#managers.errorHelpers;
		this.#NetworkError = ErrorHelpers.NetworkError;
		this.#PolicyError = ErrorHelpers.PolicyError;

		this.#errorBoundary = ErrorHelpers?.createErrorBoundary(
			// Pass the full context so errors can be audited and enriched
			{ managers: this.#managers },
			"EmbeddingManager"
		);

		this.#options = {
			model: "text-embedding",
			embeddingDimensions: 384,
			batchSize: 10,
			apiEndpoint: null,
			...options,
		};

		this.#cache = this.#managers.cacheManager?.getCache("embeddings", 1000);
		this.#pendingEmbeddings = new Map(); // Deduplication for concurrent requests
		this.#similarityCache = this.#managers.cacheManager?.getCache(
			"similarity",
			5000
		);
	}

	/**
	 * Security gate to verify read access before processing.
	 * @private
	 * @param {object} entity - The entity whose content is to be embedded.
	 * @returns {Promise<boolean>} - True if access is granted, otherwise throws an error.
	 */
	async #checkAccess(entity) {
		const securityManager = this.#managers?.securityManager;
		if (!securityManager || this.#stateManager.config.demoMode) {
			return true; // Bypass in demo mode or if MAC is not configured
		}

		const subject = securityManager.getSubject();
		const canRead = await securityManager.canRead(
			subject,
			entity.securityLabel
		);
		if (!canRead) {
			// Use a specific, categorized error for better handling
			throw new this.#PolicyError(
				"Insufficient clearance to read entity for embedding.",
				{ entityId: entity.id, requiredLabel: entity.securityLabel }
			);
		}
		return true;
	}

	/**
	 * Generates a vector embedding for a given piece of text.
	 * It uses caching and deduplication to avoid redundant processing.
	 * @param {string} text - The text to generate an embedding for.
	 * @param {object} [meta={}] - Additional metadata to associate with the embedding.
	 * @returns {Promise<{id: string, vector: number[], cached: boolean}|null>} A promise that resolves with the embedding object, or null if the input is invalid.
	 * @public
	 */
	async generateEmbedding(text, meta = {}, entity = null) {
		return this.#errorBoundary.tryAsync(async () => {
			// If an entity is provided, perform a security check first.
			if (entity) {
				await this.#checkAccess(entity);
			}

			if (!text || typeof text !== "string") return null;

			const id =
				meta.id ||
				this.#idManager.generate({
					prefix: "emb",
					entityType: "embedding",
				});

			// Use the central cache
			const cached = this.#cache.get(id);
			if (cached) {
				this.#metrics?.increment("cache_hit");
				return { id, vector: cached.vector, cached: true };
			}

			if (this.#pendingEmbeddings.has(id)) {
				this.#metrics?.increment("pending_hit");
				return await this.#pendingEmbeddings.get(id);
			}

			const embeddingPromise = this.#processEmbedding(text, id, meta);
			this.#pendingEmbeddings.set(id, embeddingPromise);

			const result = await embeddingPromise;
			this.#pendingEmbeddings.delete(id);
			this.#metrics?.increment("generated");
			return result;
		});
	}

	/**
	 * The core logic for processing a single embedding request. It either calls an external API or generates a placeholder.
	 * @private
	 * @param {string} text - The text to process.
	 * @param {string} id - The unique ID for the embedding.
	 * @param {object} meta - Metadata associated with the text.
	 * @returns {Promise<{id: string, vector: number[], cached: boolean}>} The generated embedding object.
	 */
	async #processEmbedding(text, id, meta) {
		const start = performance.now();
		let vector;

		if (this.#options.apiEndpoint) {
			vector = await this.#callEmbeddingAPI(text);
		} else {
			vector = await this.#generatePlaceholderEmbedding(text);
		}

		const embeddingData = {
			vector,
			meta: {
				...meta,
				text_preview: text.substring(0, 100),
				timestamp: DateCore.timestamp(),
				dimensions: vector.length,
			},
		};

		// Use the central cache
		this.#cache.set(id, embeddingData);

		const duration = performance.now() - start;
		this.#metrics?.timer("generation_time", duration);
		return { id, vector, cached: false };
	}

	/**
	 * Calls an external API to generate an embedding for the given text.
	 * @private
	 * @param {string} text - The text to send to the API.
	 * @returns {Promise<number[]>} A promise that resolves with the embedding vector.
	 */
	async #callEmbeddingAPI(text) {
		const response = await fetch(this.#options.apiEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.#options.apiKey}`,
			},
			body: JSON.stringify({ model: this.#options.model, input: text }),
		});

		if (!response.ok) {
			// Use a specific, categorized error for network issues
			throw new this.#NetworkError(
				`Embedding API request failed: ${response.status} ${response.statusText}`
			);
		}
		const data = await response.json();
		return data.data[0].embedding;
	}

	/**
	 * Generates a deterministic, placeholder embedding vector from a text string.
	 * Used when no external API is configured.
	 * @private
	 * @param {string} text - The text to generate a placeholder for.
	 * @returns {Promise<number[]>} A promise that resolves with the placeholder vector.
	 */
	async #generatePlaceholderEmbedding(text) {
		const hash = this.#hashText(text);
		const vector = [];
		for (let i = 0; i < this.#options.embeddingDimensions; i++) {
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
	 * Performs a semantic search by comparing a query's embedding against all cached embeddings.
	 * @public
	 * @param {string} query - The search query string.
	 * @param {object} [options={}] - Options for the search.
	 * @param {number} [options.topK=5] - The maximum number of results to return.
	 * @param {number} [options.threshold=0.5] - The minimum similarity score for a result to be included.
	 * @returns {Promise<Array<{id: string, relevance: number, meta: object}>>} A promise that resolves with an array of ranked search results.
	 */
	async semanticSearch(query, options = {}) {
		return this.#errorBoundary.tryAsync(async () => {
			const { topK = 5, threshold = 0.5, includeText = false } = options;
			if (!query) return [];

			// A query is public, so no entity-based security check is needed here.
			const queryEmbedding = await this.generateEmbedding(query);
			if (!queryEmbedding) return [];
			const queryVector = queryEmbedding.vector;
			const results = [];

			for (const [id, data] of this.#cache.entries()) {
				const similarity = this.cosineSimilarity(
					queryVector,
					data.vector
				);
				if (similarity >= threshold) {
					const result = {
						id,
						relevance: similarity,
						meta: data.meta,
					};

					if (includeText && data.meta?.text_preview) {
						result.text = data.meta.text_preview;
					}

					results.push(result);
				}
			}

			const top = results
				.sort((a, b) => b.relevance - a.relevance)
				.slice(0, topK);
			this.#metrics?.increment("semantic_search.executed");
			return top;
		});
	}

	/**
	 * Generates embeddings for an array of texts in batches.
	 * @public
	 * @param {string[]} texts - An array of text strings to process.
	 * @param {object[]} [metas=[]] - An array of corresponding metadata objects.
	 * @returns {Promise<Array<{id: string, vector: number[], cached: boolean}|null>>} A promise that resolves with an array of embedding results.
	 */
	async generateBatchEmbeddings(texts, metas = []) {
		return this.#errorBoundary.tryAsync(async () => {
			const results = [];
			const batches = this.#createBatches(texts, this.#options.batchSize);
			const start = performance.now();

			for (const batch of batches) {
				const batchPromises = batch.map((text, index) => {
					// Note: This batch method does not support entity-based security checks.
					const meta = metas[index] || {};
					return this.generateEmbedding(text, meta);
				});

				const batchResults = await Promise.allSettled(batchPromises);
				batchResults.forEach((result) => {
					if (result.status === "fulfilled")
						results.push(result.value);
					else results.push(null); // Error already handled by generateEmbedding
				});
			}

			const duration = performance.now() - start;
			this.#metrics?.timer("batch_generation_time", duration);
			return results;
		});
	}

	/**
	 * Calculates the cosine similarity between two vectors.
	 * @public
	 * @param {number[]} a - The first vector.
	 * @param {number[]} b - The second vector.
	 * @returns {number} The cosine similarity score, between -1 and 1.
	 */
	cosineSimilarity(a, b) {
		if (a.length !== b.length)
			throw new Error("Vectors must have same dimensions");
		const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
		const magA = Math.sqrt(a.reduce((s, ai) => s + ai * ai, 0));
		const magB = Math.sqrt(b.reduce((s, bi) => s + bi * bi, 0));
		return magA && magB ? dot / (magA * magB) : 0;
	}

	/**
	 * Finds entities that are semantically similar to a target entity.
	 * @public
	 * @param {string} targetId - The ID of the entity to find similar items for.
	 * @param {number} [topK=5] - The maximum number of similar items to return.
	 * @param {object} [options={}] - Options for the search, including `threshold` and `includeText`.
	 * @returns {Promise<Array<{id: string, relevance: number, meta: object}>>} A promise that resolves with an array of similar items.
	 */
	async findSimilar(targetId, topK = 5, options = {}) {
		const { threshold = 0.7, includeText = false } = options;
		return this.#errorBoundary.tryAsync(async () => {
			const targetData = this.#cache.get(targetId);
			if (!targetData)
				throw new Error(`Embedding not found: ${targetId}`);
			const results = [];
			for (const [id, data] of this.#cache.entries()) {
				if (id === targetId) continue;
				const similarity = this.cosineSimilarity(
					targetData.vector,
					data.vector
				);
				if (similarity >= threshold) {
					const result = {
						id,
						relevance: similarity,
						meta: data.meta,
					};

					if (includeText && data.meta?.text_preview) {
						result.text = data.meta.text_preview;
					}

					results.push(result);
				}
			}
			this.#metrics?.increment("similarity_search.executed");
			return results
				.sort((a, b) => b.relevance - a.relevance)
				.slice(0, topK);
		});
	}

	/**
	 * Attaches an embedding to an entity and saves it through the HybridStateManager.
	 * @public
	 * @param {string} entityId - The ID of the entity to update.
	 * @param {number[]} vector - The embedding vector to attach.
	 * @param {string} [version='v1'] - The version of the embedding model used.
	 * @returns {Promise<void>}
	 */
	async upsertEmbedding(entityId, vector, version = "v1") {
		return this.#errorBoundary.tryAsync(async () => {
			const entity =
				this.#stateManager?.clientState?.entities.get(entityId);
			if (!entity) return;

			entity.embeddings = entity.embeddings || {};
			entity.embeddings.default = vector;
			entity.embedding_version = version;
			entity.embedding_updated_at = DateCore.timestamp();

			await this.#stateManager.storage.instance.put("objects", entity);
			this.#stateManager.emit?.("entitySaved", {
				store: "objects",
				item: entity,
			});
			this.#updateSimilarityCache(entityId, vector);

			this.#metrics?.increment("entity_embedding_upserted");
		});
	}

	/**
	 * Attaches embeddings to multiple entities in a single bulk operation.
	 * @public
	 * @param {Array<{id: string, vector: number[]}>} [embeddings=[]] - An array of embedding objects to upsert.
	 * @param {string} [version='v1'] - The version of the embedding model used.
	 */
	async bulkUpsertEmbeddings(embeddings = [], version = "v1") {
		return this.#errorBoundary.tryAsync(async () => {
			if (!embeddings.length) return;
			const storage = this.#stateManager?.storage?.instance;
			const updated = [];

			for (const { id, vector } of embeddings) {
				const entity =
					this.#stateManager?.clientState?.entities.get(id);
				if (!entity) continue;

				entity.embeddings = entity.embeddings || {};
				entity.embeddings.default = vector;
				entity.embedding_version = version;
				entity.embedding_updated_at = DateCore.timestamp();
				await this.#checkAccess(entity); // Security check for each entity in the batch
				updated.push(entity);
				this.#updateSimilarityCache(id, vector);
			}

			if (storage?.bulkPut) await storage.bulkPut("objects", updated);
			else for (const e of updated) await storage.put("objects", e);

			this.#stateManager.emit?.("embeddingsBatchUpdated", {
				count: updated.length,
				version,
				entities: updated.map((e) => e.id),
			});

			this.#metrics?.increment(
				"bulk_embeddings_upserted",
				updated.length
			);
		});
	}

	/**
	 * Updates the internal cache used for fast similarity lookups.
	 * @private
	 * @param {string} entityId - The ID of the entity.
	 * @param {number[]} vector - The embedding vector.
	 */
	#updateSimilarityCache(entityId, vector) {
		if (!vector?.length) return;
		this.#similarityCache.set(entityId, this.normalizeVector(vector));
	}

	/**
	 * Normalizes a vector to have a magnitude of 1.
	 * @private
	 * @param {number[]} vec - The vector to normalize.
	 * @returns {number[]} The normalized vector.
	 */
	normalizeVector(vec) {
		const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
		return mag ? vec.map((v) => v / mag) : vec;
	}

	/**
	 * Creates a simple hash from a text string for use as a cache key.
	 * @private
	 * @param {string} text - The text to hash.
	 * @returns {number} The calculated hash.
	 */
	#hashText(text) {
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			hash = (hash << 5) - hash + text.charCodeAt(i);
			hash &= hash;
		}
		return Math.abs(hash);
	}

	/**
	 * Splits an array into smaller chunks (batches).
	 * @private
	 * @param {Array} array - The array to split.
	 * @param {number} batchSize - The size of each batch.
	 * @returns {Array<Array>} An array of batches.
	 */
	#createBatches(array, batchSize) {
		const batches = [];
		for (let i = 0; i < array.length; i += batchSize) {
			batches.push(array.slice(i, i + batchSize));
		}
		return batches;
	}

	/**
	 * Retrieves statistics about the state of the EmbeddingManager.
	 * @public
	 * @returns {object} An object containing statistics.
	 */
	getStats() {
		return {
			cache: this.#cache?.getMetrics(),
			pendingEmbeddings: this.#pendingEmbeddings.size,
			embeddingDimensions: this.#options.embeddingDimensions,
			apiConfigured: !!this.#options.apiEndpoint,
			metrics: this.#metrics?.getAllAsObject(),
		};
	}

	/**
	 * Clears all in-memory caches.
	 * @public
	 */
	clearCache() {
		this.#cache?.clear();
		this.#similarityCache?.clear();
		this.#pendingEmbeddings.clear();
		this.#metrics?.increment("cache_cleared");
	}

	/**
	 * Exports all cached embeddings to a serializable object.
	 * @public
	 * @returns {object} An object containing all cached embeddings.
	 */
	exportEmbeddings() {
		const exported = {};
		for (const [id, data] of this.#cache.entries()) {
			exported[id] = { vector: data.vector, meta: data.meta };
		}
		return exported;
	}

	/**
	 * Imports embeddings from a previously exported object.
	 * @public
	 * @param {object} exported - The object containing embeddings to import.
	 * @returns {number} The number of embeddings successfully imported.
	 */
	importEmbeddings(exported) {
		let imported = 0;
		for (const [id, data] of Object.entries(exported)) {
			this.#cache.set(id, data);
			imported++;
		}
		this.#metrics?.increment("imported", imported);
		return imported;
	}
}

export default EmbeddingManager;
