// modules/indexeddb-adapter.js
// IndexedDB adapter module for offline storage operations

/**
 * IndexedDB Adapter Module
 * Loaded for: all configurations requiring local storage
 * Bundle size: ~3KB (database operations)
 */
export default class IndexedDBAdapter {
	#db;
	#dbName;
	#version;
	#stores;
	#ready = false;
	#transactions = new Map();
	#metrics = {
		reads: 0,
		writes: 0,
		deletes: 0,
		averageReadTime: 0,
		averageWriteTime: 0,
		cacheHits: 0,
		errors: 0,
	};

	constructor(opts = {}) {
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

		console.log(`[IndexedDBAdapter] Loaded for database: ${this.#dbName}`);
	}

	async init() {
		if (this.#ready) return this;

		this.#db = await this.#openDatabase();
		this.#ready = true;

		console.log(`[IndexedDBAdapter] Database ${this.#dbName} ready`);
		return this;
	}

	/**
	 * Store single item
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
			this.#metrics.errors++;
			throw new Error(`Put operation failed: ${error.message}`);
		}
	}

	/**
	 * Store multiple items efficiently
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
			this.#metrics.errors++;
			throw new Error(`Bulk put operation failed: ${error.message}`);
		}
	}

	/**
	 * Get single item by key
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
			this.#metrics.errors++;
			throw new Error(`Get operation failed: ${error.message}`);
		}
	}

	/**
	 * Get multiple items by keys
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
			this.#metrics.errors++;
			throw new Error(`Bulk get operation failed: ${error.message}`);
		}
	}

	/**
	 * Get all items from store
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
			this.#metrics.errors++;
			throw new Error(`GetAll operation failed: ${error.message}`);
		}
	}

	/**
	 * Query by index
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
			this.#metrics.errors++;
			throw new Error(`Index query failed: ${error.message}`);
		}
	}

	/**
	 * Delete item by key
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
			this.#metrics.errors++;
			throw new Error(`Delete operation failed: ${error.message}`);
		}
	}

	/**
	 * Delete multiple items
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
			this.#metrics.errors++;
			throw new Error(`Bulk delete operation failed: ${error.message}`);
		}
	}

	/**
	 * Clear entire store
	 */
	async clear(storeName) {
		try {
			await this.#performTransaction(storeName, "readwrite", (store) =>
				store.clear()
			);

			console.log(`[IndexedDBAdapter] Store ${storeName} cleared`);
		} catch (error) {
			this.#metrics.errors++;
			throw new Error(`Clear operation failed: ${error.message}`);
		}
	}

	/**
	 * Count items in store
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
			this.#metrics.errors++;
			throw new Error(`Count operation failed: ${error.message}`);
		}
	}

	/**
	 * Iterate through store with cursor
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
			this.#metrics.errors++;
			throw new Error(`Iteration failed: ${error.message}`);
		}
	}

	/**
	 * Get database metrics
	 */
	getMetrics() {
		return {
			...this.#metrics,
			isReady: this.#ready,
			dbName: this.#dbName,
			version: this.#version,
			stores: Object.keys(this.#stores),
			activeTransactions: this.#transactions.size,
		};
	}

	/**
	 * Close database connection
	 */
	close() {
		if (this.#db) {
			this.#db.close();
			this.#db = null;
			this.#ready = false;
			console.log(`[IndexedDBAdapter] Database ${this.#dbName} closed`);
		}
	}

	// Private methods
	async #openDatabase() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.#dbName, this.#version);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);

			request.onupgradeneeded = (event) => {
				const db = event.target.result;
				this.#handleUpgrade(db, event.oldVersion, event.newVersion);
			};
		});
	}

	#handleUpgrade(db, oldVersion, newVersion) {
		console.log(
			`[IndexedDBAdapter] Upgrading database from v${oldVersion} to v${newVersion}`
		);

		// Create or update object stores
		for (const [storeName, def] of Object.entries(this.#stores)) {
			if (!db.objectStoreNames.contains(storeName)) {
				const os = db.createObjectStore(storeName, {
					keyPath: def.keyPath || "id",
				});
				console.log(`[IndexedDBAdapter] Created store: ${storeName}`);
				(def.indexes || []).forEach((idx) => {
					os.createIndex(idx.name, idx.keyPath, idx.options || {});
					console.log(
						`[IndexedDBAdapter] Created index: ${storeName}.${idx.name}`
					);
				});
			}
		}
	}

	async #performTransaction(storeName, mode, operation) {
		if (!this.#ready) {
			throw new Error("Database not initialized");
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
				reject(new Error("Transaction aborted"));
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

	#updateMetrics(operation, duration, itemCount = 1) {
		this.#metrics[operation] += itemCount;

		const avgField =
			operation === "reads"
				? "averageReadTime"
				: operation === "writes"
					? "averageWriteTime"
					: null;

		if (avgField) {
			const totalOps = this.#metrics[operation];
			const totalTime =
				this.#metrics[avgField] * (totalOps - itemCount) + duration;
			this.#metrics[avgField] = totalTime / totalOps;
		}
	}
}
