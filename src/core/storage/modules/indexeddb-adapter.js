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
		this.#audit("db_ready", { dbName: this.#dbName, version: this.#version });
		return this;
	}

	/**
	 * Stores or updates a single item in the specified object store.
	 * @param {string} storeName - The name of the object store.
	 * @param {object} item - The item to store.
	 * @returns {Promise<IDBValidKey>} A promise that resolves with the key of the stored item.
	 */
	async put(storeName, item) {
		const startTime = performance.now();

		try {
			const result = await this.#performTransaction(
				storeName,
				"readwrite",
				(store) => store.put(item)
			);

			this.#updateMetrics("writes", performance.now() - startTime);
			return result;
		} catch (error) {
			this.#metrics?.increment("errors");
			this.#stateManager?.managers?.errorHelpers?.handleError(
				new StorageError("Put operation failed", { cause: error })
			);
			throw error;
		}
	}

	/**
	 * Stores or updates multiple items in a single transaction for efficiency.
	 * @param {string} storeName - The name of the object store.
	 * @param {Array<object>} items - An array of items to store.
	 * @returns {Promise<IDBValidKey[]>} A promise that resolves with an array of keys for the stored items.
	 */
	async putBulk(storeName, items) {
		const startTime = performance.now();

		try {
			const results = await this.#performTransaction(
				storeName,
				"readwrite",
				(store) => {
					const promises = items.map((item) => store.put(item));
					return Promise.all(promises);
				}
			);

			this.#updateMetrics(
				"writes",
				performance.now() - startTime,
				items.length
			);
			return results;
		} catch (error) {
			this.#metrics?.increment("errors");
			this.#stateManager?.managers?.errorHelpers?.handleError(
				new StorageError("Bulk put operation failed", { cause: error })
			);
			throw error;
		}
	}

	/**
	 * Retrieves a single item from the specified object store by its key.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey} key - The key of the item to retrieve.
	 * @returns {Promise<object|undefined>} A promise that resolves with the retrieved item, or undefined if not found.
	 */
	async get(storeName, key) {
		const startTime = performance.now();

		try {
			const result = await this.#performTransaction(
				storeName,
				"readonly",
				(store) => store.get(key)
			);

			this.#updateMetrics("reads", performance.now() - startTime);
			return result;
		} catch (error) {
			this.#metrics?.increment("errors");
			this.#stateManager?.managers?.errorHelpers?.handleError(
				new StorageError("Get operation failed", { cause: error })
			);
			throw error;
		}
	}

	/**
	 * Retrieves multiple items from the specified object store by their keys in a single transaction.
	 * @param {string} storeName - The name of the object store.
	 * @param {Array<IDBValidKey>} keys - An array of keys to retrieve.
	 * @returns {Promise<object[]>} A promise that resolves with an array of the found items.
	 */
	async getBulk(storeName, keys) {
		const startTime = performance.now();

		try {
			const results = await this.#performTransaction(
				storeName,
				"readonly",
				(store) => {
					const promises = keys.map((key) => store.get(key));
					return Promise.all(promises);
				}
			);

			this.#updateMetrics(
				"reads",
				performance.now() - startTime,
				keys.length
			);
			return results.filter((result) => result !== undefined);
		} catch (error) {
			this.#metrics?.increment("errors");
			this.#stateManager?.managers?.errorHelpers?.handleError(
				new StorageError("Bulk get operation failed", { cause: error })
			);
			throw error;
		}
	}

	/**
	 * Retrieves all items from an object store.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey|IDBKeyRange} [query] - An optional key or key range to query.
	 * @param {number} [count] - The optional maximum number of items to retrieve.
	 * @returns {Promise<object[]>} A promise that resolves with an array of all items in the store.
	 */
	async getAll(storeName, query = null, count = null) {
		const startTime = performance.now();

		try {
			const results = await this.#performTransaction(
				storeName,
				"readonly",
				(store) => store.getAll(query, count)
			);

			this.#updateMetrics(
				"reads",
				performance.now() - startTime,
				results.length
			);
			return results;
		} catch (error) {
			this.#metrics?.increment("errors");
			this.#stateManager?.managers?.errorHelpers?.handleError(
				new StorageError("GetAll operation failed", { cause: error })
			);
			throw error;
		}
	}

	/**
	 * Performs a query against a specific index in an object store.
	 * @param {string} storeName - The name of the object store.
	 * @param {string} indexName - The name of the index to query.
	 * @param {IDBValidKey|IDBKeyRange} query - The key or key range to query within the index.
	 * @param {object} [options={}] - Additional options.
	 * @param {boolean} [options.keys=false] - If true, retrieves only the keys instead of the full objects.
	 * @returns {Promise<any[]>} A promise that resolves with an array of matching items or keys.
	 */
	async queryByIndex(storeName, indexName, query, options = {}) {
		const startTime = performance.now();

		try {
			const results = await this.#performTransaction(
				storeName,
				"readonly",
				(store) => {
					if (!this.#db.objectStoreNames.contains(storeName)) {
						throw new Error(`Store not found: ${storeName}`);
					}
					const index = store.index(indexName);

					if (options.keys) {
						return index.getAllKeys(query, options.count);
					} else {
						return index.getAll(query, options.count);
					}
				}
			);

			this.#updateMetrics(
				"reads",
				performance.now() - startTime,
				results.length
			);
			return results;
		} catch (error) {
			this.#metrics?.increment("errors");
			this.#stateManager?.managers?.errorHelpers?.handleError(
				new StorageError("Index query failed", { cause: error })
			);
			throw error;
		}
	}

	/**
	 * Deletes a single item from the specified object store by its key.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey} key - The key of the item to delete.
	 * @returns {Promise<void>} A promise that resolves when the deletion is complete.
	 */
	async delete(storeName, key) {
		const startTime = performance.now();

		try {
			const result = await this.#performTransaction(
				storeName,
				"readwrite",
				(store) => store.delete(key)
			);

			this.#updateMetrics("deletes", performance.now() - startTime);
			return result;
		} catch (error) {
			this.#metrics?.increment("errors");
			this.#stateManager?.managers?.errorHelpers?.handleError(
				new StorageError("Delete operation failed", { cause: error })
			);
			throw error;
		}
	}

	/**
	 * Deletes multiple items from the specified object store by their keys in a single transaction.
	 * @param {string} storeName - The name of the object store.
	 * @param {Array<IDBValidKey>} keys - An array of keys to delete.
	 * @returns {Promise<void[]>} A promise that resolves when all deletions are complete.
	 */
	async deleteBulk(storeName, keys) {
		const startTime = performance.now();

		try {
			const results = await this.#performTransaction(
				storeName,
				"readwrite",
				(store) => {
					const promises = keys.map((key) => store.delete(key));
					return Promise.all(promises);
				}
			);

			this.#updateMetrics(
				"deletes",
				performance.now() - startTime,
				keys.length
			);
			return results;
		} catch (error) {
			this.#metrics?.increment("errors");
			this.#stateManager?.managers?.errorHelpers?.handleError(
				new StorageError("Bulk delete operation failed", {
					cause: error,
				})
			);
			throw error;
		}
	}

	/**
	 * Clears all items from an object store.
	 * @param {string} storeName - The name of the object store to clear.
	 * @returns {Promise<void>} A promise that resolves when the store is cleared.
	 */
	async clear(storeName) {
		try {
			await this.#performTransaction(storeName, "readwrite", (store) =>
				store.clear()
			);

			this.#audit("store_cleared", { storeName });
		} catch (error) {
			this.#metrics?.increment("errors");
			this.#stateManager?.managers?.errorHelpers?.handleError(
				new StorageError("Clear operation failed", { cause: error })
			);
			throw error;
		}
	}

	/**
	 * Counts the number of items in an object store, optionally matching a query.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey|IDBKeyRange} [query] - An optional key or key range to count.
	 * @returns {Promise<number>} A promise that resolves with the total number of items.
	 */
	async count(storeName, query = null) {
		try {
			const count = await this.#performTransaction(
				storeName,
				"readonly",
				(store) => store.count(query)
			);

			return count;
		} catch (error) {
			this.#metrics?.increment("errors");
			this.#stateManager?.managers?.errorHelpers?.handleError(
				new StorageError("Count operation failed", { cause: error })
			);
			throw error;
		}
	}

	/**
	 * Iterates over items in an object store using a cursor.
	 * @param {string} storeName - The name of the object store.
	 * @param {Function} callback - A callback function executed for each item. It receives `(value, key)`. If it returns `false`, iteration stops.
	 * @param {object} [options={}] - Options for the cursor.
	 * @returns {Promise<void>} A promise that resolves when iteration is complete.
	 */
	async iterate(storeName, callback, options = {}) {
		try {
			await this.#performTransaction(
				storeName,
				"readonly",
				(store) =>
					new Promise((resolve, reject) => {
						const request = store.openCursor(
							options.query,
							options.direction
						);

						request.onsuccess = (event) => {
							const cursor = event.target.result;

							if (cursor) {
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
									reject(error);
								}
							} else {
								resolve(); // No more entries
							}
						};

						request.onerror = () => reject(request.error);
					})
			);
		} catch (error) {
			this.#metrics?.increment("errors");
			this.#stateManager?.managers?.errorHelpers?.handleError(
				new StorageError("Iteration failed", { cause: error })
			);
			throw error;
		}
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
	#updateMetrics(operation, duration, itemCount = 1) {
		this.#metrics?.increment(operation, itemCount);

		const avgField =
			operation === "reads"
				? "averageReadTime"
				: operation === "writes"
					? "averageWriteTime"
					: null;

		if (avgField) this.#metrics?.updateAverage(avgField, duration);
	}
}
