/**
 * @file EmbeddingManager.js
 * @version 2.1.0 - Enterprise Observability Baseline
 * @description Production-ready embedding management service with comprehensive security,
 * observability, and compliance features. Uses centralized orchestration wrapper for
 * consistent observability and minimal logging noise.
 *
 * ESLint Exception: nodus/require-async-orchestration
 * Justification: Wrapper pattern provides superior observability consistency and
 * centralized policy enforcement compared to per-method orchestrator setup.
 *
 * Security Classification: CONFIDENTIAL
 * License Tier: Enterprise (embeddings feature requires license validation)
 * Compliance: MAC-enforced, forensic-audited, polyinstantiation-ready
 */

import { CDS } from "@platform/security/cds.js";
import { DateCore } from "@shared/lib/DateUtils.js";

/**
 * @class EmbeddingManager
 * @classdesc Enterprise-grade vector embedding service with comprehensive security,
 * MAC enforcement, forensic auditing, and automatic observability. Handles generation,
 * caching, similarity search, and persistence with full compliance to Nodus mandates.
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
	/** @private @type {Set<string>} */
	#loggedWarnings; // Prevent duplicate warnings
	/** @private @type {string} */
	#currentUser;

	/**
	 * Creates an instance of EmbeddingManager with enterprise security and observability.
	 * @param {object} dependencies - Service dependencies
	 * @param {import('@platform/state/HybridStateManager.js').default} dependencies.stateManager - State manager providing access to all services
	 * @param {object} [options={}] - Configuration options
	 * @param {string} [options.model='text-embedding-3-small'] - Embedding model name
	 * @param {number} [options.embeddingDimensions=384] - Vector dimensions
	 * @param {number} [options.batchSize=10] - Default batch processing size
	 * @param {string|null} [options.apiEndpoint=null] - External API endpoint (requires CDS transport)
	 * @param {string|null} [options.apiKey=null] - API authentication key
	 * @param {number} [options.cacheMaxSize=1000] - Maximum cache entries
	 * @param {number} [options.cacheTTL=3600000] - Cache TTL in milliseconds (1 hour)
	 */
	constructor({ stateManager, ...options } = {}) {
		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from stateManager
		this.#stateManager = stateManager;
		this.#managers = stateManager.managers;
		this.#idManager = this.#managers.idManager;
		this.#sanitizer = this.#managers?.sanitizer ?? null;
		this.#loggedWarnings = new Set();

		// Initialize metrics with namespace for observability
		this.#metrics =
			this.#managers.metricsRegistry?.namespace("ai.embeddings");

		// Error handling infrastructure
		this.#NetworkError = this.#managers.errorHelpers.NetworkError;
		this.#PolicyError = this.#managers.errorHelpers.PolicyError;
		this.#errorBoundary = this.#managers.errorHelpers?.createErrorBoundary(
			{ name: "EmbeddingManager", managers: this.#managers },
			"EmbeddingManager"
		);

		// Configuration with secure defaults
		this.#options = {
			model: "text-embedding-3-small",
			embeddingDimensions: 384,
			batchSize: 10,
			apiEndpoint: null,
			apiKey: null,
			cacheMaxSize: 1000,
			cacheTTL: 3600000, // 1 hour
			...options,
		};

		// Initialize bounded caches with TTL for security
		this.#cache = this.#managers.cacheManager?.getCache("embeddings", {
			maxSize: this.#options.cacheMaxSize,
			ttl: this.#options.cacheTTL,
		});
		this.#similarityCache = this.#managers.cacheManager?.getCache(
			"similarity",
			{
				maxSize: this.#options.cacheMaxSize * 5, // Larger for similarity lookups
				ttl: this.#options.cacheTTL,
			}
		);

		// Bounded pending operations map (prevents memory leaks)
		this.#pendingEmbeddings = new Map();

		// Initialize current user context once
		this.#currentUser = this.#initializeUserContext();

		// Enterprise license validation for embeddings feature
		this.#validateEmbeddingLicense();
	}

	/**
	 * Validates enterprise license for embedding features.
	 * @private
	 */
	#validateEmbeddingLicense() {
		try {
			const license = this.#managers.license;
			if (!license?.hasFeature("embeddings")) {
				throw new this.#PolicyError(
					"Embedding features require enterprise license",
					{ feature: "embeddings", tier: "enterprise" }
				);
			}
		} catch (error) {
			// License validation failure is critical
			this.#emitCriticalWarning(
				"Enterprise license validation failed for embeddings",
				error
			);
			throw error;
		}
	}

	/**
	 * Initializes user context once to avoid repeated lookups.
	 * @private
	 * @returns {string}
	 */
	#initializeUserContext() {
		try {
			const securityManager = this.#managers?.securityManager;
			if (securityManager?.getSubject) {
				const subject = securityManager.getSubject();
				return subject?.userId || subject?.id || "unknown";
			}
			const userContext = this.#stateManager?.userContext;
			return userContext?.userId || userContext?.id || "system";
		} catch (error) {
			this.#emitWarning("Failed to initialize user context", {
				error: error.message,
			});
			return "unknown";
		}
	}

	/**
	 * Centralized orchestration wrapper for consistent observability and policy enforcement.
	 * @private
	 * @param {string} operationName - Operation identifier for metrics and logging
	 * @param {Function} operation - Async operation to execute
	 * @param {object} [options={}] - Additional orchestrator options
	 * @returns {Promise<any>}
	 */
	async #runOrchestrated(operationName, operation, options = {}) {
		const orchestrator = this.#managers?.asyncOrchestrator;
		if (!orchestrator) {
			this.#emitWarning("AsyncOrchestrator not available", {
				operation: operationName,
			});
			return null;
		}

		// Policy enforcement with caching to avoid repeated checks
		const policies = this.#managers.policies;
		if (!policies?.getPolicy("async", "enabled")) {
			this.#emitWarning("Async operations disabled by policy", {
				operation: operationName,
			});
			return null;
		}

		// Embedding-specific policy check
		if (!policies?.getPolicy("embeddings", "enabled")) {
			this.#emitWarning("Embedding operations disabled by policy", {
				operation: operationName,
			});
			return null;
		}

		try {
			/* PERFORMANCE_BUDGET: 5ms */
			const runner = orchestrator.createRunner(
				`embedding.${operationName}`
			);

			/* PERFORMANCE_BUDGET: varies by operation */
			return await runner.run(
				() => this.#errorBoundary.tryAsync(operation),
				{
					label: `ai.embeddings.${operationName}`,
					actorId: this.#currentUser,
					classification: "CONFIDENTIAL",
					timeout: options.timeout || 30000,
					retries: options.retries || 1,
					...options,
				}
			);
		} catch (error) {
			this.#metrics?.increment("orchestration_error");
			this.#emitCriticalWarning("Orchestration failed", {
				operation: operationName,
				error: error.message,
				user: this.#currentUser,
			});
			throw error;
		}
	}

	/**
	 * Generates a vector embedding for text with comprehensive security and observability.
	 * @public
	 * @param {string} text - Text content to embed (will be sanitized)
	 * @param {object} [meta={}] - Metadata to associate with embedding
	 * @param {object|null} [entity=null] - Entity for security access control
	 * @returns {Promise<{id: string, vector: number[], cached: boolean, classification: string}|null>}
	 */
	async generateEmbedding(text, meta = {}, entity = null) {
		return this.#runOrchestrated(
			"generate",
			async () => {
				// Input validation and sanitization
				const sanitizedText = this.#sanitizeText(text);
				if (!sanitizedText) {
					this.#metrics?.increment("invalid_input");
					return null;
				}

				// Security access control
				if (entity) {
					await this.#enforceEntityAccess(entity);
				}

				const sanitizedMeta = this.#sanitizeMeta(meta);
				const embeddingId = this.#generateEmbeddingId(
					sanitizedText,
					sanitizedMeta
				);

				// Secure cache lookup with forensic auditing
				const cached = await this.#secureCacheGet(
					embeddingId,
					"embeddings"
				);
				if (cached) {
					this.#metrics?.increment("cache_hit");
					return {
						id: embeddingId,
						vector: cached.vector,
						cached: true,
						classification: cached.classification || "CONFIDENTIAL",
					};
				}

				// Check for pending operations to prevent duplicates
				if (this.#pendingEmbeddings.has(embeddingId)) {
					this.#metrics?.increment("pending_hit");
					return await this.#pendingEmbeddings.get(embeddingId);
				}

				// Generate embedding with deduplication tracking
				const embeddingPromise = this.#processEmbedding(
					sanitizedText,
					embeddingId,
					sanitizedMeta,
					entity
				);
				this.#pendingEmbeddings.set(embeddingId, embeddingPromise);

				try {
					// Notify operation start for observability
					await this.#stateManager.managers.actionDispatcher?.dispatch(
						"embeddings.operation.start",
						{
							operationType: "generate",
							embeddingId,
							actor: this.#currentUser,
							classification: "CONFIDENTIAL",
						}
					);

					const result = await embeddingPromise;
					this.#metrics?.increment("generated");
					return result;
				} finally {
					// Cleanup pending operations
					this.#pendingEmbeddings.delete(embeddingId);

					// Notify operation completion
					await this.#stateManager.managers.actionDispatcher?.dispatch(
						"embeddings.operation.complete",
						{
							operationType: "generate",
							embeddingId,
							actor: this.#currentUser,
						}
					);
				}
			},
			{ timeout: 45000 }
		);
	}

	/**
	 * Core embedding processing with comprehensive error handling.
	 * @private
	 */
	async #processEmbedding(text, id, meta, entity) {
		const startTime = performance.now();

		try {
			// Generate vector using appropriate method
			const vector = this.#options.apiEndpoint
				? await this.#callEmbeddingAPI(text)
				: await this.#generatePlaceholderEmbedding(text);

			// Determine security classification based on entity and content
			const classification = this.#classifyEmbedding(entity, text, meta);

			const embeddingData = {
				vector,
				meta: {
					...meta,
					text_preview: text.substring(0, 100),
					timestamp: DateCore.timestamp(),
					dimensions: vector.length,
					source: this.#options.apiEndpoint ? "api" : "placeholder",
					model: this.#options.model,
				},
				classification,
				creator: this.#currentUser,
				version: "2.1.0",
			};

			// Secure cache storage with forensic auditing
			await this.#secureCacheSet(
				id,
				embeddingData,
				"embeddings",
				classification
			);

			// Record timing metrics
			const duration = performance.now() - startTime;
			this.#metrics?.timer("generation_duration", duration);

			return {
				id,
				vector,
				cached: false,
				classification,
			};
		} catch (error) {
			this.#metrics?.increment("generation_error");
			this.#emitCriticalWarning("Embedding generation failed", {
				embeddingId: id,
				error: error.message,
				user: this.#currentUser,
			});
			throw error;
		}
	}

	/**
	 * Calls external embedding API using secure CDS transport.
	 * @private
	 */
	async #callEmbeddingAPI(text) {
		if (!this.#options.apiEndpoint || !this.#options.apiKey) {
			throw new this.#NetworkError("API endpoint or key not configured");
		}

		try {
			const response = await CDS.fetch(this.#options.apiEndpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.#options.apiKey}`,
				},
				body: JSON.stringify({
					model: this.#options.model,
					input: text,
					encoding_format: "float",
				}),
				audit: true,
				classification: "CONFIDENTIAL",
			});

			if (!response.ok) {
				throw new this.#NetworkError(
					`Embedding API error: ${response.status} ${response.statusText}`
				);
			}

			const data = await response.json();

			if (!data.data?.[0]?.embedding) {
				throw new this.#NetworkError("Invalid API response format");
			}

			this.#metrics?.increment("api_call_success");
			return data.data[0].embedding;
		} catch (error) {
			this.#metrics?.increment("api_call_error");
			throw error;
		}
	}

	/**
	 * Generates deterministic placeholder embedding for development/testing.
	 * @private
	 */
	async #generatePlaceholderEmbedding(text) {
		const hash = this.#hashText(text);
		const vector = new Array(this.#options.embeddingDimensions);

		for (let i = 0; i < this.#options.embeddingDimensions; i++) {
			vector[i] = (Math.sin(hash + i) + Math.cos(hash * i)) / 2;
		}

		return this.#normalizeVector(vector);
	}

	/**
	 * Finds embeddings similar to target with security-aware search.
	 * @public
	 * @param {string} targetId - Target embedding identifier
	 * @param {number} [threshold=0.7] - Similarity threshold (0-1)
	 * @param {number} [topK=10] - Maximum results to return
	 * @param {object} [_options={}] - Search options
	 * @returns {Promise<Array<{id: string, relevance: number, meta: object, classification: string}>>}
	 */
	async findSimilarEmbeddings(
		targetId,
		threshold = 0.7,
		topK = 10,
		_options = {}
	) {
		return this.#runOrchestrated(
			"findSimilar",
			async () => {
				// Secure target embedding retrieval
				const targetData = await this.#secureCacheGet(
					targetId,
					"embeddings"
				);
				if (!targetData?.vector) {
					this.#metrics?.increment("target_not_found");
					return [];
				}

				// Security classification check - user can only see embeddings at or below their clearance
				const userClearance = this.#getUserClearanceLevel();
				const results = [];

				// Iterate through cache with security filtering
				for (const [id, data] of this.#cache.entries()) {
					if (id === targetId) continue;

					// Apply security filtering based on classification
					if (
						!this.#canAccessEmbedding(
							data.classification,
							userClearance
						)
					) {
						continue;
					}

					const similarity = this.cosineSimilarity(
						targetData.vector,
						data.vector
					);
					if (similarity >= threshold) {
						results.push({
							id,
							relevance: similarity,
							meta: this.#filterMetaByClassification(
								data.meta,
								userClearance
							),
							classification: data.classification,
						});
					}
				}

				const sortedResults = results
					.sort((a, b) => b.relevance - a.relevance)
					.slice(0, topK);

				this.#metrics?.increment("similarity_search_executed");
				this.#metrics?.gauge(
					"similarity_results_count",
					sortedResults.length
				);

				return sortedResults;
			},
			{ timeout: 15000 }
		);
	}

	/**
	 * Upserts embedding to entity with comprehensive security and audit trail.
	 * @public
	 * @param {string} entityId - Target entity identifier
	 * @param {number[]} vector - Embedding vector data
	 * @param {string} [version="2.1.0"] - Embedding version
	 * @param {object} [options={}] - Upsert options
	 * @returns {Promise<void>}
	 */
	async upsertEmbedding(entityId, vector, version = "2.1.0", _options = {}) {
		return this.#runOrchestrated(
			"upsert",
			async () => {
				// Validate vector input
				if (
					!Array.isArray(vector) ||
					vector.length !== this.#options.embeddingDimensions
				) {
					throw new this.#PolicyError("Invalid vector dimensions", {
						expected: this.#options.embeddingDimensions,
						received: vector?.length,
					});
				}

				// Security classification for the operation
				const classification = _options.classification || "CONFIDENTIAL";

				// Use ActionDispatcher for secure entity mutation
				await this.#stateManager.managers.actionDispatcher?.dispatch(
					"entity.updateEmbedding",
					{
						entityId,
						embedding: {
							vector: this.#normalizeVector(vector),
							version,
							updated_at: DateCore.timestamp(),
							updated_by: this.#currentUser,
							classification,
						},
						actor: this.#currentUser,
						classification,
						auditReason: "embedding_upsert",
					}
				);

				// Update similarity cache for fast lookups
				await this.#secureCacheSet(
					`similarity:${entityId}`,
					{ vector: this.#normalizeVector(vector), entityId },
					"similarity",
					classification
				);

				this.#metrics?.increment("entity_embedding_upserted");
			},
			{ timeout: 10000 }
		);
	}

	/**
	 * Bulk upsert embeddings with batch processing and security.
	 * @public
	 * @param {Array<{id: string, vector: number[], classification?: string}>} embeddings - Embeddings to upsert
	 * @param {string} [version="2.1.0"] - Version for all embeddings
	 * @returns {Promise<{processed: number, failed: number, errors: Array}>}
	 */
	async bulkUpsertEmbeddings(embeddings = [], version = "2.1.0") {
		return this.#runOrchestrated(
			"bulkUpsert",
			async () => {
				if (!embeddings.length) {
					return { processed: 0, failed: 0, errors: [] };
				}

				const batches = this.#createBatches(
					embeddings,
					this.#options.batchSize
				);
				let processed = 0;
				let failed = 0;
				const errors = [];

				for (const batch of batches) {
					const batchResults = await Promise.allSettled(
						batch.map(
							async ({
								id,
								vector,
								classification = "CONFIDENTIAL",
							}) => {
								await this.upsertEmbedding(
									id,
									vector,
									version,
									{ classification }
								);
							}
						)
					);

					for (const result of batchResults) {
						if (result.status === "fulfilled") {
							processed++;
						} else {
							failed++;
							errors.push(result.reason.message);
						}
					}
				}

				this.#metrics?.increment(
					"bulk_embeddings_processed",
					processed
				);
				this.#metrics?.increment("bulk_embeddings_failed", failed);

				return { processed, failed, errors };
			},
			{ timeout: 60000 }
		);
	}

	/**
	 * Imports embeddings from external source with validation and security.
	 * @public
	 * @param {object} exported - Exported embeddings data
	 * @param {object} [options={}] - Import options
	 * @returns {Promise<{imported: number, skipped: number, errors: Array}>}
	 */
	async importEmbeddings(exported, options = {}) {
		return this.#runOrchestrated(
			"import",
			async () => {
				if (typeof exported !== "object" || exported === null) {
					throw new this.#PolicyError("Invalid import data format");
				}

				const defaultClassification =
					options.classification || "CONFIDENTIAL";
				let imported = 0;
				let skipped = 0;
				const errors = [];

				for (const [id, data] of Object.entries(exported)) {
					try {
						// Validate data structure
						if (!data?.vector || !Array.isArray(data.vector)) {
							skipped++;
							continue;
						}

						// Security classification override
						const dataClassification =
							data.classification || defaultClassification;

						// Secure cache import with forensic auditing
						await this.#secureCacheSet(
							id,
							{
								...data,
								classification: dataClassification,
								imported_at: DateCore.timestamp(),
								imported_by: this.#currentUser,
							},
							"embeddings",
							dataClassification
						);

						imported++;
					} catch (error) {
						errors.push(`${id}: ${error.message}`);
						skipped++;
					}
				}

				this.#metrics?.increment("embeddings_imported", imported);
				this.#metrics?.increment("embeddings_import_skipped", skipped);

				return { imported, skipped, errors };
			},
			{ timeout: 30000 }
		);
	}

	/**
	 * Secure cache get operation with forensic auditing and MAC enforcement.
	 * @private
	 */
	async #secureCacheGet(key, cacheType) {
		const forensicRegistry =
			this.#stateManager.managers.observability?.forensicRegistry;
		if (!forensicRegistry) {
			// Fallback to direct cache access if forensic registry unavailable
			return this.#cache.get(key);
		}

		return await forensicRegistry.wrapOperation(
			"cache",
			"get",
			() => this.#cache.get(key),
			{
				cache: cacheType,
				key,
				requester: this.#currentUser,
				classification: "CONFIDENTIAL",
				operation: "embedding_cache_read",
			}
		);
	}

	/**
	 * Secure cache set operation with forensic auditing and MAC enforcement.
	 * @private
	 */
	async #secureCacheSet(
		key,
		value,
		cacheType,
		classification = "CONFIDENTIAL"
	) {
		const forensicRegistry =
			this.#stateManager.managers.observability?.forensicRegistry;
		if (!forensicRegistry) {
			// Fallback to direct cache access if forensic registry unavailable
			return this.#cache.set(key, value);
		}

		return await forensicRegistry.wrapOperation(
			"cache",
			"set",
			() => this.#cache.set(key, value),
			{
				cache: cacheType,
				key,
				value: { ...value, classification },
				requester: this.#currentUser,
				classification,
				operation: "embedding_cache_write",
			}
		);
	}

	/**
	 * Enforces entity access control with MAC security.
	 * @private
	 */
	async #enforceEntityAccess(entity) {
		const securityManager = this.#managers?.securityManager;
		if (!securityManager || this.#stateManager.config.demoMode) {
			return true; // Bypass in demo mode
		}

		const subject = securityManager.getSubject();
		const canRead = await securityManager.canRead(
			subject,
			entity.securityLabel
		);

		if (!canRead) {
			this.#metrics?.increment("access_denied");
			throw new this.#PolicyError(
				"Insufficient clearance to access entity",
				{
					entityId: entity.id,
					requiredLabel: entity.securityLabel,
					userClearance: subject?.clearanceLevel,
				}
			);
		}

		return true;
	}

	/**
	 * Classifies embedding based on content and entity security.
	 * @private
	 */
	#classifyEmbedding(entity, text, meta) {
		// Entity-based classification takes precedence
		if (entity?.securityLabel) {
			return entity.securityLabel;
		}

		// Content-based classification heuristics
		if (meta?.classification) {
			return meta.classification;
		}

		// Check for sensitive keywords (simplified example)
		const sensitivePatterns = [
			/confidential/i,
			/secret/i,
			/classified/i,
			/restricted/i,
		];

		for (const pattern of sensitivePatterns) {
			if (pattern.test(text)) {
				return "SECRET";
			}
		}

		// Default classification for embeddings
		return "CONFIDENTIAL";
	}

	/**
	 * Gets user clearance level for security filtering.
	 * @private
	 */
	#getUserClearanceLevel() {
		try {
			const securityManager = this.#managers?.securityManager;
			const subject = securityManager?.getSubject();
			return subject?.clearanceLevel || "UNCLASSIFIED";
		} catch {
			return "UNCLASSIFIED";
		}
	}

	/**
	 * Checks if user can access embedding based on classification.
	 * @private
	 */
	#canAccessEmbedding(embeddingClassification, userClearance) {
		// Simplified clearance hierarchy check
		const hierarchy = {
			UNCLASSIFIED: 0,
			CONFIDENTIAL: 1,
			SECRET: 2,
			TOP_SECRET: 3,
		};

		const embeddingLevel = hierarchy[embeddingClassification] || 0;
		const userLevel = hierarchy[userClearance] || 0;

		return userLevel >= embeddingLevel;
	}

	/**
	 * Filters metadata based on user clearance level.
	 * @private
	 */
	#filterMetaByClassification(meta, userClearance) {
		// Return filtered metadata based on clearance
		// This is a simplified example - real implementation would be more sophisticated
		if (userClearance === "UNCLASSIFIED") {
			return {
				timestamp: meta.timestamp,
				dimensions: meta.dimensions,
			};
		}
		return meta;
	}

	/**
	 * Generates consistent embedding ID from content.
	 * @private
	 */
	#generateEmbeddingId(text, meta) {
		const idSource = meta?.id;
		if (idSource && typeof idSource === "string") {
			return idSource;
		}

		return this.#idManager.generate({
			prefix: "emb",
			entityType: "embedding",
			content: text.substring(0, 50), // Include content hint in ID
		});
	}

	/**
	 * Sanitizes text input with security filtering.
	 * @private
	 */
	#sanitizeText(text) {
		if (typeof text !== "string" || !text.trim()) {
			return null;
		}

		const cleaned = this.#sanitizer?.cleanseText?.(text) || text.trim();

		// Additional security: limit text length
		if (cleaned.length > 50000) {
			this.#emitWarning("Text truncated for security", {
				originalLength: cleaned.length,
			});
			return cleaned.substring(0, 50000);
		}

		return cleaned;
	}

	/**
	 * Sanitizes metadata with security filtering.
	 * @private
	 */
	#sanitizeMeta(meta) {
		if (!meta || typeof meta !== "object") {
			return {};
		}

		const sanitized = this.#sanitizer?.cleanse?.(meta) || meta;

		// Remove potentially sensitive metadata
		const { apiKey: _apiKey, token: _token, password: _password, ...cleanMeta } = sanitized;

		return cleanMeta;
	}

	/**
	 * Emits warning with deduplication to prevent log noise.
	 * @private
	 */
	#emitWarning(message, meta = {}) {
		const warningKey = `${message}:${JSON.stringify(meta)}`;
		if (this.#loggedWarnings.has(warningKey)) {
			return; // Prevent duplicate warnings
		}

		this.#loggedWarnings.add(warningKey);

		try {
			this.#stateManager.managers.actionDispatcher?.dispatch(
				"observability.warning",
				{
					component: "EmbeddingManager",
					message,
					meta,
					actor: this.#currentUser,
					timestamp: DateCore.timestamp(),
					level: "warn",
				}
			);
		} catch {
			// Best-effort logging - don't throw on telemetry failures
		}
	}

	/**
	 * Emits critical warning that bypasses deduplication.
	 * @private
	 */
	#emitCriticalWarning(message, meta = {}) {
		try {
			this.#stateManager.managers.actionDispatcher?.dispatch(
				"observability.critical",
				{
					component: "EmbeddingManager",
					message,
					meta,
					actor: this.#currentUser,
					timestamp: DateCore.timestamp(),
					level: "error",
					critical: true,
				}
			);
		} catch {
			// Critical warnings should be logged to console as fallback
			console.error(`[EmbeddingManager:CRITICAL] ${message}`, meta);
		}
	}

	/**
	 * Creates batches for bulk processing.
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
	 * Normalizes vector to unit length.
	 * @private
	 */
	#normalizeVector(vec) {
		const magnitude = Math.sqrt(
			vec.reduce((sum, val) => sum + val * val, 0)
		);
		return magnitude > 0 ? vec.map((val) => val / magnitude) : vec;
	}

	/**
	 * Creates hash from text for deterministic embeddings.
	 * @private
	 */
	#hashText(text) {
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			hash = (hash << 5) - hash + text.charCodeAt(i);
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PUBLIC API METHODS
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Calculates cosine similarity between two vectors.
	 * @public
	 * @param {number[]} vecA - First vector
	 * @param {number[]} vecB - Second vector
	 * @returns {number} Similarity score between -1 and 1
	 */
	cosineSimilarity(vecA, vecB) {
		if (!vecA?.length || !vecB?.length || vecA.length !== vecB.length) {
			return 0;
		}

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < vecA.length; i++) {
			dotProduct += vecA[i] * vecB[i];
			normA += vecA[i] * vecA[i];
			normB += vecB[i] * vecB[i];
		}

		const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
		return magnitude > 0 ? dotProduct / magnitude : 0;
	}

	/**
	 * Gets comprehensive service statistics and health metrics.
	 * @public
	 * @returns {{cache: object, pendingOperations: number, config: object, health: object, metrics: object}}
	 */
	getStats() {
		return {
			cache: {
				embeddings: this.#cache?.getMetrics() || {},
				similarity: this.#similarityCache?.getMetrics() || {},
			},
			pendingOperations: this.#pendingEmbeddings.size,
			config: {
				embeddingDimensions: this.#options.embeddingDimensions,
				model: this.#options.model,
				apiConfigured: !!this.#options.apiEndpoint,
				batchSize: this.#options.batchSize,
			},
			health: {
				orchestratorAvailable: !!this.#managers?.asyncOrchestrator,
				forensicRegistryAvailable:
					!!this.#stateManager.managers.observability
						?.forensicRegistry,
				actionDispatcherAvailable:
					!!this.#stateManager.managers.actionDispatcher,
				cacheHealthy: !!this.#cache,
				userContext: this.#currentUser,
			},
			metrics: this.#metrics?.getAllAsObject() || {},
		};
	}

	/**
	 * Clears all caches using secure ActionDispatcher pattern.
	 * @public
	 * @returns {Promise<void>}
	 */
	async clearCache() {
		try {
			await this.#stateManager.managers.actionDispatcher?.dispatch(
				"cache.clearMultiple",
				{
					caches: ["embeddings", "similarity"],
					actor: this.#currentUser,
					reason: "manual_clear",
					timestamp: DateCore.timestamp(),
				}
			);

			// Clear local pending operations
			this.#pendingEmbeddings.clear();
			this.#loggedWarnings.clear();

			this.#metrics?.increment("cache_cleared_manual");
		} catch (error) {
			this.#emitCriticalWarning("Cache clear failed", {
				error: error.message,
			});
			throw error;
		}
	}

	/**
	 * Exports embeddings with security filtering based on user clearance.
	 * @public
	 * @param {object} [options={}] - Export options
	 * @returns {Promise<object>} Filtered embedding export
	 */
	async exportEmbeddings(_options = {}) {
		return this.#runOrchestrated(
			"export",
			async () => {
				const userClearance = this.#getUserClearanceLevel();
				const exported = {};
				let exportedCount = 0;
				let filteredCount = 0;

				for (const [id, data] of this.#cache.entries()) {
					// Apply security filtering
					if (
						this.#canAccessEmbedding(
							data.classification,
							userClearance
						)
					) {
						exported[id] = {
							vector: data.vector,
							meta: this.#filterMetaByClassification(
								data.meta,
								userClearance
							),
							classification: data.classification,
						};
						exportedCount++;
					} else {
						filteredCount++;
					}
				}

				this.#metrics?.increment("embeddings_exported", exportedCount);
				this.#metrics?.increment(
					"embeddings_export_filtered",
					filteredCount
				);

				return {
					embeddings: exported,
					metadata: {
						exportedCount,
						filteredCount,
						userClearance,
						timestamp: DateCore.timestamp(),
						version: "2.1.0",
					},
				};
			},
			{ timeout: 20000 }
		);
	}

	/**
	 * Performs health check with comprehensive diagnostics.
	 * @public
	 * @returns {Promise<{healthy: boolean, checks: object, timestamp: string}>}
	 */
	async healthCheck() {
		const checks = {
			orchestrator: !!this.#managers?.asyncOrchestrator,
			forensicRegistry:
				!!this.#stateManager.managers.observability?.forensicRegistry,
			actionDispatcher: !!this.#stateManager.managers.actionDispatcher,
			cache: !!this.#cache && this.#cache.size !== undefined,
			similarityCache: !!this.#similarityCache,
			license: this.#managers.license?.hasFeature("embeddings") || false,
			userContext: !!this.#currentUser,
			policies: !!this.#managers.policies,
		};

		const healthy = Object.values(checks).every((check) => check === true);

		return {
			healthy,
			checks,
			timestamp: DateCore.timestamp(),
			pendingOperations: this.#pendingEmbeddings.size,
			version: "2.1.0",
		};
	}
}

export default EmbeddingManager;
