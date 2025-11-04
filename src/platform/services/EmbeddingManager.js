/**
 * @file EmbeddingManager.js
 * @description Manages the creation, caching, and searching of vector embeddings for AI-powered semantic features.
 * This class integrates with the HybridStateManager for persistence and provides an API for semantic search and similarity analysis.
 * @ voldoes V8.0 Parity
 */

import { CDS } from "@platform/security/cds.js";
import { DateCore } from "@shared/lib/DateUtils.js";

/**
 * @class EmbeddingManager
 * @classdesc Handles all operations related to vector embeddings, including generation via API or placeholders,
 * caching, semantic search, and persistence through the HybridStateManager. It adheres to Nodus security
 * and observability mandates, using AsyncOrchestrator for operations and providing automatic instrumentation.
 */
export class EmbeddingManager {
	/** @private @type {import('@platform/state/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {object} */
	#managers;
	/** @private @type {{ cleanse?:(value:any, schema?:any)=>any, cleanseText?:(value:string)=>string }|null} */
	#sanitizer;
	/** @private @type {import('@platform/core/IdManager.js').default} */
	#idManager;
	/** @private @type {import('@shared/lib/MetricsRegistry.js').MetricsRegistry|undefined} */
	#metrics;
	/** @private @type {ErrorConstructor} */
	#NetworkError;
	/** @private @type {ErrorConstructor} */
	#PolicyError;
	/** @private @type {import('@shared/lib/ErrorHelpers.js').ErrorBoundary} */
	#errorBoundary;
	/** @private @type {object} */
	#options;
	/** @private @type {import('@platform/utils/caching/LRUCache.js').LRUCache} */
	#cache;
	/** @private @type {Map<string, Promise<any>>} */
	#pendingEmbeddings;
	/** @private @type {import('@platform/utils/caching/LRUCache.js').LRUCache} */
	#similarityCache;

	/**
	 * Creates an instance of EmbeddingManager.
	 * @param {object} dependencies - The dependencies for the service.
	 * @param {import('@platform/state/HybridStateManager.js').default} dependencies.stateManager - The main state manager, providing access to all other managers.
	 * @param {object} [options={}] - Configuration options for the manager.
	 * @param {string} [options.model='text-embedding'] - The name of the embedding model to use.
	 * @param {number} [options.embeddingDimensions=384] - The dimensionality of the embedding vectors.
	 * @param {number} [options.batchSize=10] - The default batch size for processing multiple embeddings.
	 * @param {string|null} [options.apiEndpoint=null] - The API endpoint for the embedding generation service.
	 * @param {string|null} [options.apiKey=null] - The API key for the embedding service.
	 */
	constructor({ stateManager, ...options } = {}) {
		this.#stateManager = stateManager;
		this.#managers = stateManager.managers;
		this.#idManager = this.#managers.idManager;
		this.#metrics = this.#managers.metricsRegistry?.namespace("ai.embeddings");
		this.#sanitizer = this.#managers?.sanitizer ?? null;

		this.#NetworkError = this.#managers.errorHelpers.NetworkError;
		this.#PolicyError = this.#managers.errorHelpers.PolicyError;

		this.#errorBoundary = this.#managers.errorHelpers?.createErrorBoundary(
			{ name: "EmbeddingManager", managers: this.#managers },
			"EmbeddingManager"
		);

		this.#options = {
			model: "text-embedding",
			embeddingDimensions: 384,
			batchSize: 10,
			apiEndpoint: null,
			apiKey: null,
			...options,
		};

		this.#cache = this.#managers.cacheManager?.getCache("embeddings", { maxSize: 1000 });
		this.#pendingEmbeddings = new Map();
		this.#similarityCache = this.#managers.cacheManager?.getCache("similarity", { maxSize: 5000 });
	}

	/**
	 * A private helper to wrap an async operation with the AsyncOrchestrator.
	 * @private
	 * @param {string} operationName - The name of the operation for observability.
	 * @param {Function} operation - The async function to execute.
	 * @returns {Promise<any>}
	 */
	async #runOrchestrated(operationName, operation) {
		const orchestrator = this.#managers?.asyncOrchestrator;
		if (!orchestrator) {
			this.#emitWarning(`AsyncOrchestrator not available. Skipping ${operationName}.`);
			return;
		}

		const policies = this.#managers.policies;
		if (!policies.getPolicy('async', 'enabled')) {
			this.#emitWarning(`Async operations disabled by policy. Skipping ${operationName}.`);
			return;
		}

		/* @performance-budget: 5ms */
		const runner = orchestrator.createRunner(operationName);
		return runner.run(() => this.#errorBoundary.tryAsync(operation));
	}

	/**
	 * Security gate to verify read access before processing an entity.
	 * @private
	 * @param {object} entity - The entity whose content is to be embedded.
	 * @returns {Promise<boolean>} - True if access is granted.
	 * @throws {PolicyError} If the current user lacks read permissions for the entity.
	 */
	async #checkAccess(entity) {
		return this.#runOrchestrated("embedding.checkAccess", async () => {
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
				throw new this.#PolicyError(
					"Insufficient clearance to read entity for embedding.",
					{ entityId: entity.id, requiredLabel: entity.securityLabel }
				);
			}
			return true;
		});
	}

	/**
	 * Generates a vector embedding for a given piece of text.
	 * @public
	 * @param {string} text - The text to generate an embedding for.
	 * @param {object} [meta={}] - Additional metadata to associate with the embedding.
	 * @param {object|null} [entity=null] - The entity associated with the text, used for security checks.
	 * @returns {Promise<{id: string, vector: number[], cached: boolean}|null>}
	 */
	async generateEmbedding(text, meta = {}, entity = null) {
		return this.#runOrchestrated("embedding.generate", async () => {
			if (entity) {
				await this.#checkAccess(entity);
			}

			const sanitizedText = this.#sanitizeText(text);
			if (!sanitizedText) return null;

			const sanitizedMeta = this.#sanitizeMeta(meta);
			const metaObject = (sanitizedMeta && typeof sanitizedMeta === "object") ? sanitizedMeta : {};

			const idSource = (typeof metaObject.id === "string" && metaObject.id) || (typeof meta?.id === "string" && meta.id) || null;
			const id = idSource || this.#idManager.generate({ prefix: "emb", entityType: "embedding" });

			const cached = this.#cache.get(id);
			if (cached) {
				this.#metrics?.increment("cache_hit");
				return { id, vector: cached.vector, cached: true };
			}

			if (this.#pendingEmbeddings.has(id)) {
				this.#metrics?.increment("pending_hit");
				return this.#pendingEmbeddings.get(id);
			}

			const embeddingPromise = this.#processEmbedding(sanitizedText, id, metaObject);
			this.#pendingEmbeddings.set(id, embeddingPromise);

			try {
				const result = await embeddingPromise;
				this.#metrics?.increment("generated");
				return result;
			} finally {
				this.#pendingEmbeddings.delete(id);
			}
		});
	}

	/**
	 * The core logic for processing a single embedding request.
	 * @private
	 */
	async #processEmbedding(text, id, meta) {
		return this.#runOrchestrated("embedding._process", async () => {
			const start = performance.now();
			const vector = this.#options.apiEndpoint
				? await this.#callEmbeddingAPI(text)
				: await this.#generatePlaceholderEmbedding(text);

			const embeddingData = {
				vector,
				meta: {
					...(meta && typeof meta === "object" ? meta : {}),
					text_preview: text.substring(0, 100),
					timestamp: DateCore.timestamp(),
					dimensions: vector.length,
				},
			};

			this.#cache.set(id, embeddingData);
			const duration = performance.now() - start;
			this.#metrics?.timer("generation_time", duration);

			return { id, vector, cached: false };
		});
	}

	/**
	 * Calls an external API to generate an embedding.
	 * @private
	 */
	async #callEmbeddingAPI(text) {
		const response = await CDS["fetch"](this.#options.apiEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${this.#options.apiKey}`,
			},
			body: JSON.stringify({ model: this.#options.model, input: text }),
		});

		if (!response.ok) {
			throw new this.#NetworkError(`Embedding API request failed: ${response.status} ${response.statusText}`);
		}
		const data = await response.json();
		return data.data[0].embedding;
	}

	/**
	 * Generates a deterministic, placeholder embedding vector.
	 * @private
	 */
	async #generatePlaceholderEmbedding(text) {
		const hash = this.#hashText(text);
		const vector = [];
		for (let i = 0; i < this.#options.embeddingDimensions; i++) {
			const seed = (hash * (i + 1)) % 2147483647;
			const normalized = (Math.sin(seed) + 1) / 2;
			vector.push((normalized - 0.5) * 2);
		}
		return this.#normalizeVector(vector);
	}

	/**
	 * Resolves the sanitizer from the state manager.
	 * @private
	 */
	#getSanitizer() {
		if (!this.#sanitizer) {
			this.#sanitizer = this.#managers?.sanitizer ?? null;
		}
		return this.#sanitizer;
	}

	/**
	 * Produces a sanitized text string.
	 * @private
	 */
	#sanitizeText(value) {
		const sanitizer = this.#getSanitizer();
		const asString = typeof value === "string" ? value : String(value ?? "");
		if (!sanitizer?.cleanseText) return asString;

		try {
			return sanitizer.cleanseText(asString);
		} catch (error) {
			this.#emitWarning("[EmbeddingManager] Failed to sanitize text.", error);
			return String(value ?? "");
		}
	}

	/**
	 * Sanitizes metadata.
	 * @private
	 */
	#sanitizeMeta(meta) {
		const sanitizer = this.#getSanitizer();
		const obj = meta && typeof meta === "object" ? { ...meta } : {};
		if (!sanitizer?.cleanse) return obj;

		try {
			return sanitizer.cleanse(obj) ?? {};
		} catch (error) {
			this.#emitWarning("[EmbeddingManager] Failed to sanitize metadata.", error);
			return obj;
		}
	}

	/**
	 * Performs a semantic search.
	 * @public
	 * @returns {Promise<Array<{id: string, relevance: number, meta: object}>>}
	 */
	async semanticSearch(query, options = {}) {
		return this.#runOrchestrated("embedding.semanticSearch", async () => {
			const { topK = 5, threshold = 0.5 } = options;
			const sanitizedQuery = this.#sanitizeText(query);
			if (!sanitizedQuery) return [];

			const queryEmbedding = await this.generateEmbedding(sanitizedQuery);
			if (!queryEmbedding) return [];

			const queryVector = queryEmbedding.vector;
			const results = [];

			for (const [id, data] of this.#cache.entries()) {
				const similarity = this.cosineSimilarity(queryVector, data.vector);
				if (similarity >= threshold) {
					results.push({ id, relevance: similarity, meta: data.meta });
				}
			}

			this.#metrics?.increment("semantic_search.executed");
			return results.sort((a, b) => b.relevance - a.relevance).slice(0, topK);
		});
	}

	/**
	 * Generates embeddings for an array of texts in batches.
	 * @public
	 * @returns {Promise<Array<{id: string, vector: number[], cached: boolean}|null>>}
	 */
	async generateBatchEmbeddings(texts, metas = []) {
		return this.#runOrchestrated("embedding.generateBatch", async () => {
			const results = [];
			const batches = this.#createBatches(texts, this.#options.batchSize);
			const start = performance.now();

			for (const batch of batches) {
				const batchPromises = batch.map((text, index) => {
					const meta = metas[index] || {};
					return this.generateEmbedding(text, meta);
				});
				const batchResults = await Promise.allSettled(batchPromises);
				results.push(...batchResults.map(r => (r.status === "fulfilled" ? r.value : null)));
			}

			const duration = performance.now() - start;
			this.#metrics?.timer("batch_generation_time", duration);
			return results;
		});
	}

	/**
	 * Calculates the cosine similarity between two vectors.
	 * @public
	 */
	cosineSimilarity(a, b) {
		if (a.length !== b.length) throw new Error("Vectors must have same dimensions");
		const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
		const magA = Math.sqrt(a.reduce((s, ai) => s + ai * ai, 0));
		const magB = Math.sqrt(b.reduce((s, bi) => s + bi * bi, 0));
		return magA && magB ? dot / (magA * magB) : 0;
	}

	/**
	 * Finds entities that are semantically similar to a target entity.
	 * @public
	 * @returns {Promise<Array<{id: string, relevance: number, meta: object}>>}
	 */
	async findSimilar(targetId, topK = 5, options = {}) {
		return this.#runOrchestrated("embedding.findSimilar", async () => {
			const { threshold = 0.7 } = options;
			const targetData = this.#cache.get(targetId);
			if (!targetData) throw new Error(`Embedding not found: ${targetId}`);

			const results = [];
			for (const [id, data] of this.#cache.entries()) {
				if (id === targetId) continue;
				const similarity = this.cosineSimilarity(targetData.vector, data.vector);
				if (similarity >= threshold) {
					results.push({ id, relevance: similarity, meta: data.meta });
				}
			}

			this.#metrics?.increment("similarity_search.executed");
			return results.sort((a, b) => b.relevance - a.relevance).slice(0, topK);
		});
	}

	/**
	 * Attaches an embedding to an entity and saves it.
	 * @public
	 * @returns {Promise<void>}
	 */
	async upsertEmbedding(entityId, vector, version = "v1") {
		return this.#runOrchestrated("embedding.upsert", async () => {
			const entity = this.#stateManager?.clientState?.entities.get(entityId);
			if (!entity) return;

			await this.#checkAccess(entity);

			entity.embeddings = entity.embeddings || {};
			entity.embeddings.default = vector;
			entity.embedding_version = version;
			entity.embedding_updated_at = DateCore.timestamp();

			await this.#stateManager.storage.instance.put("objects", entity);

			this.#stateManager.emit?.("entitySaved", { store: "objects", item: entity });
			this.#updateSimilarityCache(entityId, vector);
			this.#metrics?.increment("entity_embedding_upserted");
		});
	}

	/**
	 * Attaches embeddings to multiple entities in a single bulk operation.
	 * @public
	 * @returns {Promise<void>}
	 */
	async bulkUpsertEmbeddings(embeddings = [], version = "v1") {
		return this.#runOrchestrated("embedding.bulkUpsert", async () => {
			if (!embeddings.length) return;

			const storage = this.#stateManager?.storage?.instance;
			const updated = [];

			for (const { id, vector } of embeddings) {
				const entity = this.#stateManager?.clientState?.entities.get(id);
				if (!entity) continue;

				await this.#checkAccess(entity);

				entity.embeddings = entity.embeddings || {};
				entity.embeddings.default = vector;
				entity.embedding_version = version;
				entity.embedding_updated_at = DateCore.timestamp();
				updated.push(entity);
				this.#updateSimilarityCache(id, vector);
			}

			if (storage?.bulkPut) {
				await storage.bulkPut("objects", updated);
			} else {
				for (const e of updated) {
					await storage.put("objects", e);
				}
			}

			this.#stateManager.emit?.("embeddingsBatchUpdated", {
				count: updated.length,
				version,
				entities: updated.map((e) => e.id),
			});
			this.#metrics?.increment("bulk_embeddings_upserted", updated.length);
		});
	}

	/**
	 * Updates the internal cache used for fast similarity lookups.
	 * @private
	 */
	#updateSimilarityCache(entityId, vector) {
		if (!vector?.length) return;
		this.#similarityCache.set(entityId, this.#normalizeVector(vector));
	}

	/**
	 * Normalizes a vector to have a magnitude of 1.
	 * @private
	 */
	#normalizeVector(vec) {
		const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
		return mag ? vec.map((v) => v / mag) : vec;
	}

	/**
	 * Creates a simple hash from a text string for use as a cache key.
	 * @private
	 */
	#hashText(text) {
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			hash = (hash << 5) - hash + text.charCodeAt(i);
			hash |= 0; // Convert to 32bit integer
		}
		return Math.abs(hash);
	}

	/**
	 * Emits a warning via ActionDispatcher for automatic observability.
	 * @private
	 */
	#emitWarning(message, meta) {
		try {
			this.#managers?.actionDispatcher?.dispatch?.("observability.warning", { message, meta });
		} catch (_e) {
			// Best-effort only; do not throw from non-critical telemetry paths.
		}
	}

	/**
	 * Splits an array into smaller chunks (batches).
	 * @private
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
	 * @returns {{cache: object, pendingEmbeddings: number, embeddingDimensions: number, apiConfigured: boolean, metrics: object}}
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
	 * @returns {object}
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
	 * @returns {number} The number of embeddings successfully imported.
	 */
	importEmbeddings(exported) {
		let imported = 0;
		if (typeof exported !== 'object' || exported === null) return 0;
		for (const [id, data] of Object.entries(exported)) {
			if (data && data.vector && data.meta) {
				this.#cache.set(id, data);
				imported++;
			}
		}
		this.#metrics?.increment("imported", imported);
		return imported;
	}
}

export default EmbeddingManager;
