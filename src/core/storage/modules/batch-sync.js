// modules/batch-sync.js
// Batch synchronization module for efficient bulk operations

/**
 * @description
 * Manages high-volume data synchronization through efficient batching of operations.
 * This module is crucial for offline-first scenarios, reducing network requests by
 * grouping multiple data changes (items) into single push or pull operations.
 * It includes features like automatic batching by size or age, parallel processing,
 * and optional payload compression.
 *
 * @module BatchSync
 */
export default class BatchSync {
	/**
	 * @private
	 * @type {object}
	 */
	#config;
	/**
	 * @private
	 * @type {Map<string, object>}
	 */
	#pendingBatches = new Map();
	/**
	 * @private
	 * @type {Array<object>}
	 */
	#syncQueue = [];
	/**
	 * @private
	 * @type {object}
	 */
	#metrics = {
		batchesProcessed: 0,
		itemsProcessed: 0,
		averageBatchSize: 0,
		averageProcessingTime: 0,
		compressionRatio: 0,
	};

	/**
	 * Creates an instance of BatchSync.
	 * @param {object} [options={}] - Configuration options for the batch sync module.
	 * @param {number} [options.batchSize=100] - The maximum number of items in a single batch.
	 * @param {number} [options.maxBatchAge=30000] - The maximum age of a batch in milliseconds before it's automatically processed.
	 * @param {number} [options.compressionThreshold=1024] - The payload size in bytes above which compression is attempted.
	 * @param {boolean} [options.enableCompression=true] - Whether to enable payload compression.
	 * @param {number} [options.retryAttempts=3] - The number of times to retry a failed batch.
	 * @param {number} [options.parallelBatches=3] - The number of batches to process in parallel.
	 */
	constructor(options = {}) {
		this.name = "BatchSync";
		this.supportsPush = true;
		this.supportsPull = true;

		this.#config = {
			batchSize: options.batchSize || 100,
			maxBatchAge: options.maxBatchAge || 30000, // 30 seconds
			compressionThreshold: options.compressionThreshold || 1024, // 1KB
			enableCompression: options.enableCompression !== false,
			retryAttempts: options.retryAttempts || 3,
			parallelBatches: options.parallelBatches || 3,
			...options,
		};

		console.log("[BatchSync] Loaded for batch synchronization");
	}

	/**
	 * Initializes the module and starts the background batch processor.
	 * The processor periodically checks for and sends batches that have reached their maximum age.
	 * @returns {Promise<this>} The initialized instance.
	 */
	async init() {
		// Start batch processing timer
		this.#startBatchProcessor();

		console.log("[BatchSync] Batch sync initialized");
		return this;
	}

	/**
	 * Pushes an array of items to the server, automatically grouping them into efficient batches.
	 * It processes batches in parallel to improve throughput.
	 * @param {object} options - The push operation options.
	 * @param {Array<object>} [options.items=[]] - The array of items to push.
	 * @param {string} [options.operation='update'] - The default operation type for the items.
	 * @returns {Promise<object>} A summary of the push operation, including counts of pushed/failed items and batch results.
	 */
	async push(options) {
		const { items = [], operation = "update" } = options;

		// Group items by operation type for optimal batching
		const groupedItems = this.#groupItemsByOperation(items, operation);
		const results = [];

		// Process each group in batches
		for (const [op, groupItems] of groupedItems.entries()) {
			const batches = this.#createBatches(
				groupItems,
				this.#config.batchSize
			);

			// Process batches in parallel (with limit)
			const batchPromises = batches.map((batch) =>
				this.#processPushBatch(batch, op)
			);
			const batchResults = await this.#processInParallel(
				batchPromises,
				this.#config.parallelBatches
			);

			results.push(...batchResults);
		}

		return {
			pushed: results.reduce(
				(sum, r) => sum + (r.success ? r.itemCount : 0),
				0
			),
			failed: results.reduce(
				(sum, r) => sum + (r.success ? 0 : r.itemCount),
				0
			),
			batches: results.length,
			results,
		};
	}

	/**
	 * Pulls a batch of data from the server.
	 * @param {object} options - The pull operation options.
	 * @param {string[]} [options.entityTypes=[]] - The types of entities to pull.
	 * @param {string|number} [options.since] - A timestamp or token indicating the last sync point.
	 * @param {number} [options.limit] - The maximum number of items to pull.
	 * @returns {Promise<{pulled: number, items: Array<object>, hasMore: boolean, nextToken: string|null}>} The pulled data and pagination info.
	 */
	async pull(options) {
		const { entityTypes = [], since, limit } = options;

		try {
			const batchRequest = {
				entityTypes,
				since,
				limit,
				batchSize: this.#config.batchSize,
			};

			const response = await this.#sendBatchPullRequest(batchRequest);

			return {
				pulled: response.items?.length || 0,
				items: response.items || [],
				hasMore: response.hasMore || false,
				nextToken: response.nextToken,
			};
		} catch (error) {
			console.error("[BatchSync] Batch pull failed:", error);
			throw error;
		}
	}

	/**
	 * Adds an item to the offline synchronization queue.
	 * The queue is automatically flushed when it reaches the configured batch size.
	 * @param {object} item - The item to queue.
	 * @param {string} [operation='update'] - The operation type for this item (e.g., 'create', 'update', 'delete').
	 */
	queueItem(item, operation = "update") {
		this.#syncQueue.push({
			item,
			operation,
			timestamp: Date.now(),
		});

		// Auto-flush if queue is full
		if (this.#syncQueue.length >= this.#config.batchSize) {
			this.#flushQueue();
		}
	}

	/**
	 * Manually flushes all items currently in the offline queue by processing them as a push operation.
	 * @private
	 * @returns {Promise<object>} The result of the push operation.
	 */
	async #flushQueue() {
		if (this.#syncQueue.length === 0) return;

		const items = this.#syncQueue.splice(0);
		const result = await this.push({
			items: items.map((i) => i.item),
			operation: "mixed", // Mixed operations in queue
		});

		console.log(
			`[BatchSync] Flushed queue: ${result.pushed} items processed`
		);
		return result;
	}

	/**
	 * Syncs a single item by adding it to the batch queue for later processing.
	 * This method is part of the sync module interface but is adapted for batching.
	 * @param {object} item - The item to sync.
	 * @param {string} operation - The operation type.
	 * @returns {Promise<{queued: boolean, batchPending: boolean}>} A promise that resolves immediately, indicating the item has been queued.
	 */
	async syncItem(item, operation) {
		// For batch sync, we queue the item rather than sync immediately
		this.queueItem(item, operation);

		// Return a promise that resolves when the batch containing this item is processed
		return new Promise((resolve) => {
			// In a real implementation, you'd track individual items through the batch process
			// For now, just resolve immediately since it's queued
			resolve({ queued: true, batchPending: true });
		});
	}

	/**
	 * Checks if an item is supported by this sync module.
	 * @param {object} item - The item to check.
	 * @returns {boolean} Always returns true as BatchSync supports all item types.
	 */
	supportsItem(item) {
		return true; // Batch sync supports all items
	}

	/**
	 * Get batch metrics
	 * @returns {object} An object containing performance and state metrics for the batch sync process.
	 */
	getMetrics() {
		return {
			...this.#metrics,
			queueSize: this.#syncQueue.length,
			pendingBatches: this.#pendingBatches.size,
		};
	}

	// Private methods
	/**
	 * Starts a timer that periodically processes batches that have exceeded their maximum age.
	 * @private
	 */
	#startBatchProcessor() {
		setInterval(() => {
			this.#processAgedBatches();
		}, 5000); // Check every 5 seconds
	}

	/**
	 * Iterates through pending batches and processes any that are older than the configured `maxBatchAge`.
	 * @private
	 */
	#processAgedBatches() {
		const now = Date.now();

		for (const [batchId, batch] of this.#pendingBatches.entries()) {
			if (now - batch.createdAt > this.#config.maxBatchAge) {
				this.#processPendingBatch(batchId);
			}
		}
	}

	/**
	 * Processes a single pending batch by its ID.
	 * @private
	 * @param {string} batchId - The ID of the batch to process.
	 */
	async #processPendingBatch(batchId) {
		const batch = this.#pendingBatches.get(batchId);
		if (!batch) return;

		this.#pendingBatches.delete(batchId);

		try {
			await this.#processPushBatch(batch.items, batch.operation);
		} catch (error) {
			console.error(
				`[BatchSync] Failed to process aged batch ${batchId}:`,
				error
			);
		}
	}

	/**
	 * Processes a single batch of items for a push operation.
	 * This includes optional compression and sending the request to the server.
	 * @private
	 * @param {Array<object>} items - The items in the batch.
	 * @param {string} operation - The operation type for this batch.
	 * @returns {Promise<object>} A result object for the processed batch.
	 */
	async #processPushBatch(items, operation) {
		const startTime = performance.now();
		const batchId = this.#generateBatchId();

		try {
			// Prepare batch payload
			let payload = {
				batchId,
				operation,
				items,
				timestamp: Date.now(),
			};

			// Compress if beneficial
			if (this.#config.enableCompression) {
				payload = await this.#compressBatch(payload);
			}

			// Send batch to server
			await this.#sendBatchRequest(payload);

			// Update metrics
			const processingTime = performance.now() - startTime;
			this.#updateBatchMetrics(
				items.length,
				processingTime,
				payload.compressed || false
			);

			return {
				batchId,
				success: true,
				itemCount: items.length,
				processingTime,
				compressed: payload.compressed || false,
			};
		} catch (error) {
			console.error(`[BatchSync] Batch ${batchId} failed:`, error);

			return {
				batchId,
				success: false,
				itemCount: items.length,
				error: error.message,
			};
		}
	}

	/**
	 * Groups an array of items by their operation type.
	 * @private
	 * @param {Array<object>} items - The items to group.
	 * @param {string} defaultOperation - The operation to use if an item doesn't specify one.
	 * @returns {Map<string, Array<object>>} A map where keys are operation types and values are arrays of items.
	 */
	#groupItemsByOperation(items, defaultOperation) {
		const groups = new Map();

		for (const item of items) {
			const operation = item._operation || defaultOperation;

			if (!groups.has(operation)) {
				groups.set(operation, []);
			}

			groups.get(operation).push(item);
		}

		return groups;
	}

	/**
	 * Splits a larger array of items into smaller batches based on the configured batch size.
	 * @private
	 * @param {Array<object>} items - The array of items to split.
	 * @param {number} batchSize - The maximum size of each batch.
	 * @returns {Array<Array<object>>} An array of smaller batch arrays.
	 */
	#createBatches(items, batchSize) {
		const batches = [];

		for (let i = 0; i < items.length; i += batchSize) {
			batches.push(items.slice(i, i + batchSize));
		}

		return batches;
	}

	/**
	 * A utility to execute an array of promises in parallel with a concurrency limit.
	 * @private
	 * @param {Array<Promise>} promises - The array of promises to execute.
	 * @param {number} limit - The maximum number of promises to run concurrently.
	 * @returns {Promise<Array<object>>} A promise that resolves with an array of all results.
	 */
	async #processInParallel(promises, limit) {
		const results = [];

		for (let i = 0; i < promises.length; i += limit) {
			const batch = promises.slice(i, i + limit);
			const batchResults = await Promise.allSettled(batch);

			results.push(
				...batchResults.map((r) =>
					r.status === "fulfilled"
						? r.value
						: { success: false, error: r.reason?.message }
				)
			);
		}

		return results;
	}

	/**
	 * Compresses a batch payload if it exceeds the configured size threshold.
	 * @private
	 * @param {object} payload - The batch payload to potentially compress.
	 * @returns {Promise<object>} The original or compressed payload.
	 */
	async #compressBatch(payload) {
		const payloadString = JSON.stringify(payload);

		if (payloadString.length < this.#config.compressionThreshold) {
			return payload;
		}

		try {
			// Simple compression using gzip (in real implementation)
			// For demo, just mark as compressed
			const originalSize = payloadString.length;
			const compressedSize = Math.floor(originalSize * 0.7); // Simulate 30% compression

			return {
				...payload,
				compressed: true,
				originalSize,
				compressedSize,
				data: `compressed:${payloadString}`, // Simulate compressed data
			};
		} catch (error) {
			console.warn(
				"[BatchSync] Compression failed, sending uncompressed:",
				error
			);
			return payload;
		}
	}

	/**
	 * Simulates sending a push batch request to a server API.
	 * @private
	 * @param {object} payload - The payload to send.
	 * @returns {Promise<object>} A promise that simulates the server response.
	 */
	async #sendBatchRequest(payload) {
		// Simulate API call
		return new Promise((resolve, reject) => {
			setTimeout(
				() => {
					// Simulate success/failure
					if (Math.random() > 0.1) {
						// 90% success rate
						resolve({
							batchId: payload.batchId,
							processed: payload.items?.length || 0,
							status: "success",
						});
					} else {
						reject(new Error("Batch processing failed"));
					}
				},
				200 + Math.random() * 300
			); // 200-500ms latency
		});
	}

	/**
	 * Simulates sending a pull batch request to a server API.
	 * @private
	 * @param {object} request - The request parameters.
	 * @returns {Promise<object>} A promise that simulates the server response with pulled data.
	 */
	async #sendBatchPullRequest(request) {
		// Simulate API call for pulling data
		return new Promise((resolve) => {
			setTimeout(
				() => {
					// Simulate returning some items
					const items = Array.from(
						{ length: Math.min(request.batchSize, 25) },
						(_, i) => ({
							id: `item_${Date.now()}_${i}`,
							entity_type: request.entityTypes[0] || "object",
							content: `Batch pulled item ${i}`,
							updated_at: new Date().toISOString(),
						})
					);

					resolve({
						items,
						hasMore: items.length === request.batchSize,
						nextToken:
							items.length > 0 ? `token_${Date.now()}` : null,
					});
				},
				150 + Math.random() * 200
			); // 150-350ms latency
		});
	}

	/**
	 * Updates the internal metrics object after a batch is processed.
	 * @private
	 * @param {number} itemCount - The number of items in the processed batch.
	 * @param {number} processingTime - The time taken to process the batch in milliseconds.
	 * @param {boolean} compressed - Whether the batch was compressed.
	 */
	#updateBatchMetrics(itemCount, processingTime, compressed) {
		this.#metrics.batchesProcessed++;
		this.#metrics.itemsProcessed += itemCount;

		// Update average batch size
		this.#metrics.averageBatchSize =
			this.#metrics.itemsProcessed / this.#metrics.batchesProcessed;

		// Update average processing time
		const totalTime =
			this.#metrics.averageProcessingTime *
				(this.#metrics.batchesProcessed - 1) +
			processingTime;
		this.#metrics.averageProcessingTime =
			totalTime / this.#metrics.batchesProcessed;

		// Update compression ratio
		if (compressed) {
			// In real implementation, track actual compression ratios
			this.#metrics.compressionRatio = 0.7; // 30% compression
		}
	}

	/**
	 * Generates a unique identifier for a batch.
	 * @private
	 * @returns {string} A unique batch ID string.
	 */
	#generateBatchId() {
		return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
	}
}
