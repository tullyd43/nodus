// modules/indexeddb-adapter.js
// IndexedDB adapter module for offline storage operations

import { StorageError } from "../../../utils/ErrorHelpers.js";

/**
 * @description
 * Provides a robust, high-performance adapter for the browser's IndexedDB API.
 * This module is the foundation for the application's offline-first architecture,
 * enabling reliable local storage and retrieval of all core data structures. It handles
 * database creation, schema upgrades, and all CRUD (Create, Read, Update, Delete) operations.
 *
 * @privateFields {#db, #dbName, #version, #stores, #ready, #transactions, #stateManager, #metrics, #forensicLogger, #errorHelpers}
 *
 * @module IndexedDBAdapter
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
 */
export default class IndexedDBAdapter {
	/** @private @type {IDBDatabase|null} */
	#db = null;
	/** @private @type {string} */
	#dbName;
	/** @private @type {number} */
	#version;
	/** @private @type {object} */
	#stores;
	/** @private @type {boolean} */
	#ready = false;
	/** @private @type {Map<IDBTransaction, object>} */
	#transactions = new Map();

	/** @private @type {import('../../HybridStateManager.js').default|null} */
	#stateManager;
	/** @private @type {import('../../../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics;
	/** @private @type {import('../../ForensicLogger.js').default|null} */
	#forensicLogger;
	/** @private @type {import('../../../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers;

	/**
	 * Creates an instance of IndexedDBAdapter.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @param {object} [context.opts={}] - Configuration options for the database.
	 */
	constructor({ stateManager, opts = {} }) {
		this.#stateManager = stateManager;
		// V8.0 Parity: Derive dependencies from the stateManager.
		this.#forensicLogger = stateManager?.managers?.forensicLogger;
		this.#errorHelpers = stateManager?.managers?.errorHelpers;

		this.#metrics =
			this.#stateManager?.metricsRegistry?.namespace("indexeddbAdapter");

		this.#dbName = String(opts.dbName || "nodus_offline");
		this.#version = Number(opts.version || 2); // Bump version for schema upgrade
		this.#stores = opts.stores || {
			objects: {
				keyPath: "id",
				indexes: [
					{ name: "entity_type", keyPath: "entity_type" },
					{ name: "classification", keyPath: "classification" },
					{ name: "updated_at", keyPath: "updated_at" },
				],
			},
			objects_polyinstantiated: {
				keyPath: "id",
				indexes: [
					{ name: "logical_id", keyPath: "logical_id" },
					{
						name: "classification_level",
						keyPath: "classification_level",
					},
					{ name: "updated_at", keyPath: "updated_at" },
				],
			},
		};
	}

	/**
	 * Initializes the adapter by opening a connection to the IndexedDB database.
	 * This method handles database creation and schema upgrades.
	 * @returns {Promise<this>} The initialized adapter instance.
	 */
	async init() {
		if (this.#ready) return this;

		this.#db = await this.#openDatabase();
		this.#ready = true;
		this.#audit("db_ready", {
			dbName: this.#dbName,
			version: this.#version,
		});
		return this;
	}

	/**
	 * Stores or updates a single item in the specified object store.
	 * @param {string} storeName - The name of the object store.
	 * @param {object} item - The item to store.
	 * @returns {Promise<IDBValidKey>} A promise that resolves with the key of the stored item.
	 */
	async put(storeName, item) {
		return this.#measure("put", "writes", () =>
			this.#performTransaction(storeName, "readwrite", (store) =>
				store.put(item)
			)
		);
	}

	/**
	 * Stores or updates multiple items in a single transaction for efficiency.
	 * @param {string} storeName - The name of the object store.
	 * @param {Array<object>} items - An array of items to store.
	 * @returns {Promise<IDBValidKey[]>} A promise that resolves with an array of keys for the stored items.
	 */
	async putBulk(storeName, items) {
		return this.#measure(
			"putBulk",
			"writes",
			() =>
				this.#performTransaction(storeName, "readwrite", (store) => {
					for (const item of items) {
						store.put(item);
					}
				}),
			items.length
		);
	}

	/**
	 * Retrieves a single item from the specified object store by its key.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey} key - The key of the item to retrieve.
	 * @returns {Promise<object|undefined>} A promise that resolves with the retrieved item, or undefined if not found.
	 */
	async get(storeName, key) {
		return this.#measure("get", "reads", () =>
			this.#performTransaction(storeName, "readonly", (store) =>
				store.get(key)
			)
		);
	}

	/**
	 * Retrieves multiple items from the specified object store by their keys in a single transaction.
	 * @param {string} storeName - The name of the object store.
	 * @param {Array<IDBValidKey>} keys - An array of keys to retrieve.
	 * @returns {Promise<object[]>} A promise that resolves with an array of the found items.
	 */
	async getBulk(storeName, keys) {
		return this.#measure(
			"getBulk",
			"reads",
			async () => {
				const results = await this.#performTransaction(
					storeName,
					"readonly",
					(store) => {
						const promises = keys.map((key) => store.get(key));
						return Promise.all(promises);
					}
				);
				return results.filter((result) => result !== undefined);
			},
			keys.length
		);
	}

	/**
	 * Retrieves all items from an object store.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey|IDBKeyRange} [query] - An optional key or key range to query.
	 * @param {number} [count] - The optional maximum number of items to retrieve.
	 * @returns {Promise<object[]>} A promise that resolves with an array of all items in the store.
	 */
	async getAll(storeName, query = null, count = null) {
		return this.#measure("getAll", "reads", async () => {
			const results = await this.#performTransaction(
				storeName,
				"readonly",
				(store) => store.getAll(query, count)
			);
			// The itemCount for the metric will be based on the result length.
			this.#updateMetrics("reads", 0, results.length, false); // duration is handled by #measure
			return results;
		});
	}

	/**
	 * Performs a query against a specific index in an object store.
	 * @param {string} storeName - The name of the object store.
	 * @param {string} indexName - The name of the index to query.
	 * @param {IDBValidKey|IDBKeyRange} query - The key or key range to query within the index.
	 * @param {object} [options={}] - Additional options.
	 * @param {boolean} [options.keys=false] - If true, retrieves only the keys instead of the full objects.
	 * @param {number} [options.count] - The maximum number of items to retrieve.
	 * @returns {Promise<any[]>} A promise that resolves with an array of matching items or keys.
	 * @deprecated Use the more flexible `query` method instead.
	 */
	async queryByIndex(storeName, indexName, query, options = {}) {
		return this.#measure("queryByIndex", "reads", async () => {
			const results = await this.#performTransaction(
				storeName,
				"readonly",
				(store) => {
					const index = store.index(indexName);
					if (options.keys) {
						return index.getAllKeys(query, options.count);
					} else {
						return index.getAll(query, options.count);
					}
				}
			);
			this.#updateMetrics("reads", 0, results.length, false);
			return results;
		});
	}

	/**
	 * Performs a query against an object store or one of its indexes.
	 * @param {string} storeName - The name of the object store.
	 * @param {object} [options={}] - Query options.
	 * @param {string} [options.index] - The name of the index to query. If not provided, queries the primary key.
	 * @param {IDBKeyRange} [options.range] - The key range to query.
	 * @param {IDBCursorDirection} [options.direction='next'] - The direction of the cursor.
	 * @param {number} [options.limit] - The maximum number of results to return.
	 * @param {number} [options.offset] - The number of results to skip.
	 * @returns {Promise<any[]>} A promise that resolves with an array of matching items.
	 */
	async query(storeName, options = {}) {
		return this.#measure("query", "reads", async () => {
			const results = [];
			await this.iterate(
				storeName,
				(value) => {
					results.push(value);
					if (options.limit && results.length >= options.limit) {
						return false; // Stop iteration
					}
				},
				{
					index: options.index,
					range: options.range,
					direction: options.direction,
					offset: options.offset,
				}
			);
			this.#updateMetrics("reads", 0, results.length, false);
			return results;
		});
	}

	/**
	 * Deletes a single item from the specified object store by its key.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey} key - The key of the item to delete.
	 * @returns {Promise<void>} A promise that resolves when the deletion is complete.
	 */
	async delete(storeName, key) {
		return this.#measure("delete", "deletes", () =>
			this.#performTransaction(storeName, "readwrite", (store) =>
				store.delete(key)
			)
		);
	}

	/**
	 * Deletes multiple items from the specified object store by their keys in a single transaction.
	 * @param {string} storeName - The name of the object store.
	 * @param {Array<IDBValidKey>} keys - An array of keys to delete.
	 * @returns {Promise<void[]>} A promise that resolves when all deletions are complete.
	 */
	async deleteBulk(storeName, keys) {
		return this.#measure(
			"deleteBulk",
			"deletes",
			() =>
				this.#performTransaction(storeName, "readwrite", (store) => {
					for (const key of keys) {
						store.delete(key);
					}
				}),
			keys.length
		);
	}

	/**
	 * Clears all items from an object store.
	 * @param {string} storeName - The name of the object store to clear.
	 * @returns {Promise<void>} A promise that resolves when the store is cleared.
	 */
	async clear(storeName) {
		return this.#measure("clear", "deletes", async () => {
			await this.#performTransaction(storeName, "readwrite", (store) =>
				store.clear()
			);
			this.#audit("store_cleared", { storeName });
		});
	}

	/**
	 * Counts the number of items in an object store, optionally matching a query.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey|IDBKeyRange} [query] - An optional key or key range to count.
	 * @returns {Promise<number>} A promise that resolves with the total number of items.
	 */
	async count(storeName, query = null) {
		return this.#measure("count", "reads", () =>
			this.#performTransaction(storeName, "readonly", (store) =>
				store.count(query)
			)
		);
	}

	/**
	 * Iterates over items in an object store using a cursor.
	 * @param {string} storeName - The name of the object store.
	 * @param {Function} callback - A callback function executed for each item. It receives `(value, key)`. If it returns `false`, iteration stops.
	 * @param {object} [options={}] - Options for the cursor.
	 * @returns {Promise<void>} A promise that resolves when iteration is complete.
	 */
	async iterate(storeName, callback, options = {}) {
		return this.#measure("iterate", "reads", async () => {
			await this.#performTransaction(
				storeName,
				"readonly",
				(store) =>
					new Promise((resolve, reject) => {
						const source = options.index
							? store.index(options.index)
							: store;
						const request = source.openCursor(
							options.range,
							options.direction || "next"
						);
						let advanced = false;

						request.onsuccess = (event) => {
							const cursor = event.target.result;
							if (cursor) {
								if (options.offset && !advanced) {
									advanced = true;
									cursor.advance(options.offset);
									return;
								}

								try {
									const shouldContinue = callback(
										cursor.value,
										cursor.key
									);

									if (shouldContinue !== false) {
										cursor.continue();
									} else {
										resolve();
									}
								} catch (error) {
									this.#audit("iteration_callback_error", {
										storeName,
										error: error.message,
									});
									reject(error);
								}
							} else {
								resolve(); // No more entries
							}
						};
						request.onerror = () => reject(request.error);
					})
			);
		});
	}

	/**
	 * Retrieves performance and state metrics for the database adapter.
	 * @returns {object} An object containing various metrics.
	 */
	getMetrics() {
		return {
			...this.#metrics?.getAllAsObject(),
			isReady: this.#ready,
			dbName: this.#dbName,
			version: this.#version,
			stores: Object.keys(this.#stores),
			activeTransactions: this.#transactions.size,
		};
	}

	/**
	 * Closes the connection to the IndexedDB database.
	 */
	close() {
		if (this.#db) {
			this.#db.close();
			this.#db = null;
			this.#audit("db_closed", { dbName: this.#dbName });
			this.#ready = false;
			console.log(`[IndexedDBAdapter] Database ${this.#dbName} closed`);
		}
	}

	// Private methods
	/**
	 * Opens and initializes the IndexedDB database, handling version upgrades.
	 * @private
	 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
	 */
	async #openDatabase() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.#dbName, this.#version);

			request.onerror = (event) => {
				this.#audit("db_open_failed", { error: event.target.error });
				reject(request.error);
			};
			request.onsuccess = (event) => {
				this.#audit("db_open_success", { version: this.#version });
				resolve(request.result);
			};

			request.onupgradeneeded = (event) => {
				const db = event.target.result;
				this.#handleUpgrade(db, event.oldVersion, event.newVersion);
			};
			request.onblocked = () => this.#audit("db_open_blocked", {});
		});
	}

	/**
	 * Handles the `upgradeneeded` event to create or modify the database schema.
	 * @private
	 * @param {IDBDatabase} db - The database instance.
	 * @param {number} oldVersion - The old version of the database.
	 * @param {number|null} newVersion - The new version of the database.
	 */
	#handleUpgrade(db, oldVersion, newVersion) {
		this.#audit("db_upgrade_started", {
			from: oldVersion,
			to: newVersion,
		});

		// Create or update object stores
		for (const [storeName, def] of Object.entries(this.#stores)) {
			if (!db.objectStoreNames.contains(storeName)) {
				const os = db.createObjectStore(storeName, {
					keyPath: def.keyPath || "id",
				});
				this.#audit("store_created", { storeName });
				(def.indexes || []).forEach((idx) => {
					os.createIndex(idx.name, idx.keyPath, idx.options || {});
					this.#audit("index_created", {
						storeName,
						indexName: idx.name,
					});
				});
			}
		}
		this.#audit("db_upgrade_complete", {
			from: oldVersion,
			to: newVersion,
		});
	}

	#audit(eventType, data) {
		if (this.#forensicLogger) {
			this.#forensicLogger.logAuditEvent(
				`INDEXEDDB_${eventType.toUpperCase()}`,
				data
			);
		}
	}

	/**
	 * A helper method to wrap IndexedDB operations in a transaction.
	 * @private
	 * @param {string} storeName - The name of the object store for the transaction.
	 * @param {IDBTransactionMode} mode - The transaction mode ('readonly' or 'readwrite').
	 * @param {Function} operation - A function that receives the object store and performs the operation.
	 * @returns {Promise<any>} A promise that resolves with the result of the operation.
	 */
	async #performTransaction(storeName, mode, operation) {
		if (!this.#ready) {
			throw new StorageError("Database not initialized");
		}

		return new Promise((resolve, reject) => {
			const transaction = this.#db.transaction([storeName], mode);
			const store = transaction.objectStore(storeName);

			transaction.oncomplete = () => {
				this.#transactions.delete(transaction);
			};

			transaction.onerror = () => {
				this.#transactions.delete(transaction);
				reject(transaction.error);
			};

			transaction.onabort = () => {
				this.#transactions.delete(transaction);
				reject(new StorageError("Transaction aborted"));
			};

			this.#transactions.set(transaction, {
				storeName,
				mode,
				startTime: performance.now(),
			});

			try {
				const request = operation(store);

				if (request && request.onsuccess !== undefined) {
					// It's an IDBRequest
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				} else if (request && typeof request.then === "function") {
					// It's a Promise
					request.then(resolve).catch(reject);
				} else {
					// Direct result
					resolve(request);
				}
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Updates internal metrics after a database operation.
	 * @private
	 * @param {'reads'|'writes'|'deletes'} operation - The type of operation performed.
	 * @param {number} duration - The duration of the operation in milliseconds.
	 * @param {number} [itemCount=1] - The number of items affected by the operation.
	 */
	#updateMetrics(operation, duration, itemCount = 1, updateAvg = true) {
		this.#metrics?.increment(operation, itemCount);

		if (updateAvg) {
			const avgField =
				operation === "reads"
					? "averageReadTime"
					: operation === "writes"
						? "averageWriteTime"
						: operation === "deletes"
							? "averageDeleteTime"
							: null;

			if (avgField) this.#metrics?.updateAverage(avgField, duration);
		}
	}

	/**
	 * Wraps a database operation to provide standardized metrics and error handling.
	 * @private
	 * @param {string} methodName - The name of the public method being called.
	 * @param {'reads'|'writes'|'deletes'} metricType - The type of metric to record.
	 * @param {Function} operationFn - The async function performing the database operation.
	 * @param {number} [itemCount=1] - The number of items being processed.
	 * @returns {Promise<any>} The result of the operation.
	 */
	async #measure(methodName, metricType, operationFn, itemCount = 1) {
		const startTime = performance.now();
		try {
			const result = await operationFn();
			const duration = performance.now() - startTime;
			this.#updateMetrics(metricType, duration, itemCount);
			return result;
		} catch (error) {
			this.#metrics?.increment("errors");
			const storageError = new StorageError(
				`${methodName} operation failed`,
				{ cause: error, context: { method: methodName } }
			);
			this.#errorHelpers?.handleError(storageError);
			throw storageError;
		}
	}
}
