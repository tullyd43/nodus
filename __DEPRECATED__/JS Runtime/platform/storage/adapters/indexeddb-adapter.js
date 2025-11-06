// modules/indexeddb-adapter.js
// IndexedDB adapter module for offline storage operations

import { StorageError } from "@shared/lib/ErrorHelpers.js";

/**
 * @file indexeddb-adapter.js
 * @version 8.0.0 - Nodus v8 Compliant
 * @description Modern, promise-based IndexedDB adapter with enterprise-grade observability,
 * security, and migration support. All operations flow through orchestrated patterns for
 * automatic instrumentation, audit trails, and performance monitoring.
 *
 * @description
 * @description
 * Provides a robust, high-performance adapter for the browser's IndexedDB API.
 * This module is the foundation for the application's offline-first architecture,
 * enabling reliable local storage and retrieval of all core data structures. It handles
 * database creation, schema upgrades, and all CRUD (Create, Read, Update, Delete) operations.
 *
 * @privateFields {#db, #dbName, #version, #stores, #ready, #transactions, #stateManager, #metrics, #forensicLogger, #errorHelpers}
 * @privateFields {#db, #dbName, #version, #stores, #ready, #stateManager, #runner, #migrations, #errorHelpers}
 * @module IndexedDBAdapter
 * @implements {ModularOfflineStorage.indexeddb}
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

	/** @private @type {import('../../../state/HybridStateManager.js').default|null} */
	#stateManager;
	/** @private @type {ReturnType<import('../../../shared/lib/async/AsyncOrchestrationService.js').AsyncOrchestrationService["createRunner"]>} */
	#runner;
	/** @private @type {Array<object>} */
	#migrations;
	/** @private @type {import('../../../shared/lib/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers;

	/**
	 * Creates an instance of IndexedDBAdapter.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @param {object} [context.opts={}] - Configuration options for the database.
	 */
	constructor({ stateManager, opts = {} }) {
		this.#stateManager = stateManager;
		if (!stateManager) {
			throw new Error(
				"IndexedDBAdapter requires a stateManager instance."
			);
		}

		this.#errorHelpers = stateManager.managers?.errorHelpers;
		this.#dbName = String(opts.dbName || "nodus_offline");
		this.#version = Number(opts.version || 3); // Bump version for schema upgrade
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
			system_settings: {
				keyPath: "id",
				indexes: [],
			},
			audit_events: {
				keyPath: "id",
				indexes: [
					{ name: "type", keyPath: "type" },
					{ name: "timestamp", keyPath: "timestamp" },
				],
			},
		};

		// In a real scenario, migrations would be passed in or loaded dynamically.
		// For this refactor, we'll use an empty array.
		this.#migrations = (opts.migrations || []).sort(
			(a, b) => a.version - b.version
		);

		const orchestrator = this.#stateManager.managers?.asyncOrchestrator;
		if (!orchestrator) {
			throw new StorageError(
				"AsyncOrchestrationService is required for IndexedDBAdapter."
			);
		}

		this.#runner = orchestrator.createRunner({
			labelPrefix: "storage.indexeddb",
			actorId: `indexeddb.${this.#dbName}`,
			eventType: "INDEXEDDB_OPERATION",
			meta: {
				component: "IndexedDBAdapter",
				dbName: this.#dbName,
			},
		});
	}

	/**
	 * Centralized orchestration wrapper for this storage component.
	 * Ensures all async operations run through the AsyncOrchestrator runner.
	 * @private
	 * @param {string} operationName - The name of the operation for observability.
	 * @param {Function} operation - The async operation to run (synchronous function that returns a Promise).
	 * @param {object} [options] - Runner options (eventType, meta, etc.).
	 * @returns {Promise<any>}
	 */
	#runOrchestrated(operationName, operation, options = {}) {
		return this.#runner(operation, {
			labelSuffix: operationName,
			eventType: `INDEXEDDB_${operationName.toUpperCase()}`,
			meta: { operation: operationName, ...options.meta },
			...options,
		});
	}

	/**
	 * Initializes the adapter by opening a connection to the IndexedDB database.
	 * This method handles database creation and schema upgrades.
	 * @returns {Promise<this>} The initialized adapter instance.
	 */
	async init() {
		if (this.#ready) return this;

		return this.#runOrchestrated("init", () => {
			return this.#openDatabase().then((db) => {
				this.#db = db;
				this.#ready = true;
				this.#stateManager.managers.logger.info(
					`[IndexedDBAdapter] Database ${this.#dbName} ready.`
				);
				return this;
			});
		});
	}

	/**
	 * Stores or updates a single item in the specified object store.
	 * @param {string} storeName - The name of the object store.
	 * @param {object} item - The item to store.
	 * @returns {Promise<IDBValidKey>} A promise that resolves with the key of the stored item.
	 */
	async put(storeName, item) {
		if (!this.#ready) throw new StorageError("Database not initialized");
		/* PERFORMANCE_BUDGET: 15ms */
		return this.#runOrchestrated(
			"put",
			() => this.#executePut(storeName, item),
			{ meta: { storeName, hasValue: !!item } }
		);
	}

	/**
	 * Stores or updates multiple items in a single transaction for efficiency.
	 * @param {string} storeName - The name of the object store.
	 * @param {Array<object>} items - An array of items to store.
	 * @returns {Promise<void>} A promise that resolves when the bulk operation is complete.
	 */
	async putBulk(storeName, items) {
		if (!this.#ready) throw new StorageError("Database not initialized");
		/* PERFORMANCE_BUDGET: 100ms */
		return this.#runOrchestrated(
			"putBulk",
			() => this.#executePutBulk(storeName, items),
			{ meta: { storeName, count: items?.length || 0 } }
		);
	}

	/**
	 * Retrieves a single item from the specified object store by its key.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey} key - The key of the item to retrieve.
	 * @returns {Promise<object|undefined>} A promise that resolves with the retrieved item, or undefined if not found.
	 */
	async get(storeName, key) {
		if (!this.#ready) throw new StorageError("Database not initialized");
		/* PERFORMANCE_BUDGET: 10ms */
		return this.#runOrchestrated(
			"get",
			() => this.#executeGet(storeName, key),
			{ meta: { storeName, hasKey: !!key } }
		);
	}

	/**
	 * Retrieves multiple items from the specified object store by their keys in a single transaction.
	 * @param {string} storeName - The name of the object store.
	 * @param {Array<IDBValidKey>} keys - An array of keys to retrieve.
	 * @returns {Promise<object[]>} A promise that resolves with an array of the found items.
	 */
	async getBulk(storeName, keys) {
		if (!this.#ready) throw new StorageError("Database not initialized");
		/* PERFORMANCE_BUDGET: 75ms */
		return this.#runOrchestrated(
			"getBulk",
			() =>
				this.#createTransaction(storeName, "readonly", (store) =>
					Promise.all(
						keys.map((key) =>
							this.#promisifyRequest(store.get(key))
						)
					)
				).then((results) => results.filter(Boolean)),
			{ meta: { storeName, count: keys?.length || 0 } }
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
		if (!this.#ready) throw new StorageError("Database not initialized");
		/* PERFORMANCE_BUDGET: 50ms */
		return this.#runOrchestrated(
			"getAll",
			() => this.#executeGetAll(storeName, query, count),
			{ meta: { storeName } }
		);
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
		if (!this.#ready) throw new StorageError("Database not initialized");
		/* PERFORMANCE_BUDGET: 25ms */
		return this.#runOrchestrated(
			"queryByIndex",
			() =>
				this.#executeQueryByIndex(storeName, indexName, query, options),
			{ meta: { storeName, indexName, hasQuery: !!query } }
		);
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
		if (!this.#ready) throw new StorageError("Database not initialized");
		/* PERFORMANCE_BUDGET: 50ms */
		return this.#runOrchestrated(
			"query",
			() =>
				this.iterate(
					storeName,
					(value, _key, results) => {
						results.push(value);
						if (options.limit && results.length >= options.limit) {
							return false; // Stop iteration
						}
					},
					options
				),
			{
				meta: {
					storeName,
					index: options.index,
					hasRange: !!options.range,
				},
			}
		);
	}

	/**
	 * Deletes a single item from the specified object store by its key.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey} key - The key of the item to delete.
	 * @returns {Promise<void>} A promise that resolves when the deletion is complete.
	 */
	async delete(storeName, key) {
		if (!this.#ready) throw new StorageError("Database not initialized");
		/* PERFORMANCE_BUDGET: 15ms */
		return this.#runOrchestrated(
			"delete",
			() => this.#executeDelete(storeName, key),
			{ meta: { storeName, hasKey: !!key } }
		);
	}

	/**
	 * Deletes multiple items from the specified object store by their keys in a single transaction.
	 * @param {string} storeName - The name of the object store.
	 * @param {Array<IDBValidKey>} keys - An array of keys to delete.
	 * @returns {Promise<void>} A promise that resolves when all deletions are complete.
	 */
	async deleteBulk(storeName, keys) {
		if (!this.#ready) throw new StorageError("Database not initialized");
		/* PERFORMANCE_BUDGET: 100ms */
		return this.#runOrchestrated(
			"deleteBulk",
			() => this.#executeDeleteBulk(storeName, keys),
			{ meta: { storeName, count: keys?.length || 0 } }
		);
	}

	/**
	 * Clears all items from an object store.
	 * @param {string} storeName - The name of the object store to clear.
	 * @returns {Promise<void>} A promise that resolves when the store is cleared.
	 */
	async clear(storeName) {
		if (!this.#ready) throw new StorageError("Database not initialized");
		/* PERFORMANCE_BUDGET: 50ms */
		return this.#runOrchestrated(
			"clear",
			() => this.#executeClear(storeName),
			{ meta: { storeName } }
		);
	}

	/**
	 * Counts the number of items in an object store, optionally matching a query.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey|IDBKeyRange} [query] - An optional key or key range to count.
	 * @returns {Promise<number>} A promise that resolves with the total number of items.
	 */
	async count(storeName, query = null) {
		if (!this.#ready) throw new StorageError("Database not initialized");
		/* PERFORMANCE_BUDGET: 15ms */
		return this.#runOrchestrated(
			"count",
			() => this.#executeCount(storeName, query),
			{ meta: { storeName, hasQuery: !!query } }
		);
	}

	/**
	 * Iterates over items in an object store using a cursor.
	 * @param {string} storeName - The name of the object store.
	 * @param {Function} callback - A callback function executed for each item. It receives `(value, key)`. If it returns `false`, iteration stops.
	 * @param {object} [options={}] - Options for the cursor.
	 * @returns {Promise<void>} A promise that resolves when iteration is complete.
	 */
	/**
	 * @param {string} storeName - The name of the object store.
	 * @param {Function} callback - A callback function executed for each item. It receives `(value, key, results)`. If it returns `false`, iteration stops.
	 * @param {object} [options={}] - Options for the cursor.
	 * @returns {Promise<any[]>} A promise that resolves with the array of results from the callback.
	 */
	async iterate(storeName, callback, options = {}) {
		if (!this.#ready) throw new StorageError("Database not initialized");
		/* PERFORMANCE_BUDGET: 50ms */
		// Iteration is not orchestrated itself, but is called by orchestrated methods like `query`.
		const results = [];
		return this.#createTransaction(storeName, "readonly", (store) => {
			return new Promise((resolve, reject) => {
				const source = options.index
					? store.index(options.index)
					: store;
				const request = source.openCursor(
					options.range,
					options.direction || "next"
				);
				let advanced = false;

				request.onerror = () => reject(request.error);
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
								cursor.key,
								results
							);
							if (shouldContinue !== false) {
								cursor.continue();
							} else {
								resolve(results);
							}
						} catch (error) {
							reject(error);
						}
					} else {
						resolve(results); // No more entries
					}
				};
			});
		}).then(() => results);
	}

	/**
	 * Retrieves performance and state metrics for the database adapter.
	 * @returns {object} An object containing various metrics.
	 */
	getMetrics() {
		// Metrics are now handled by the orchestrator and collected by MetricsRegistry.
		// This method can be a simple proxy or be removed if not used.
		const metrics =
			this.#stateManager.managers?.metricsRegistry?.namespace(
				"storage.indexeddb"
			);
		return {
			isReady: this.#ready,
			dbName: this.#dbName,
			version: this.#version,
			...(metrics?.getAllAsObject() || {}),
		};
	}

	/**
	 * Closes the connection to the IndexedDB database.
	 */
	close() {
		if (this.#db) {
			this.#db.close();
			this.#db = null;
			this.#ready = false;
			this.#stateManager.managers.logger.info(
				`[IndexedDBAdapter] Database ${this.#dbName} closed`
			);
		}
	}

	// Private methods
	/**
	 * Opens and initializes the IndexedDB database, handling version upgrades.
	 * @private
	 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
	 */
	#openDatabase() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.#dbName, this.#version);

			request.onerror = (event) => reject(event.target.error);
			request.onsuccess = (event) => resolve(event.target.result);
			request.onupgradeneeded = (event) => {
				const _db = event.target.result;
				this.#handleUpgrade(event, request);
			};
			request.onblocked = () => {
				console.warn(
					`[IndexedDBAdapter] Open blocked for ${this.#dbName}. Close other tabs.`
				);
			};
		});
	}

	/**
	 * Handles the `upgradeneeded` event to create or modify the database schema.
	 * @private
	 * @param {IDBDatabase} db - The database instance.
	 * @param {IDBOpenDBRequest} request - The database open request.
	 */
	#handleUpgrade(event, request) {
		const db = event.target.result;
		const transaction = request.transaction;
		this.#stateManager.managers.logger.info(
			`[IndexedDBAdapter] Upgrading DB '${this.#dbName}' from v${event.oldVersion} to v${event.newVersion}`
		);

		// Create or update object stores
		for (const [storeName, def] of Object.entries(this.#stores)) {
			let os;
			if (!db.objectStoreNames.contains(storeName)) {
				os = db.createObjectStore(storeName, {
					keyPath: def.keyPath || "id",
				});
			} else {
				os = transaction.objectStore(storeName);
			}

			(def.indexes || []).forEach((idx) => {
				if (!os.indexNames.contains(idx.name)) {
					os.createIndex(idx.name, idx.keyPath, idx.options || {});
				}
			});
		}

		// Run declarative migrations
		for (const { version, migrate } of this.#migrations) {
			if (version > event.oldVersion && version <= event.newVersion) {
				try {
					migrate(db, transaction, event.oldVersion);
				} catch (error) {
					const migrationError = new StorageError(
						`Migration for version ${version} failed`,
						{ cause: error }
					);
					transaction.abort();
					throw migrationError;
				}
			}
		}
	}

	/**
	 * Creates and manages an IndexedDB transaction with security compliance.
	 *
	 * @private
	 * @param {string|string[]} storeNames - The store name(s) for the transaction
	 * @param {IDBTransactionMode} mode - The transaction mode
	 * @param {function(IDBObjectStore|IDBObjectStore[]): Promise<any>} actionFn - The action function
	 * @returns {Promise<any>}
	 */
	#createTransaction(storeNames, mode, actionFn) {
		return new Promise((resolve, reject) => {
			const transaction = this.#db.transaction(storeNames, mode, {
				durability: "strict",
			});

			transaction.oncomplete = () => {};
			transaction.onerror = (event) => reject(event.target.error);

			const store = Array.isArray(storeNames)
				? storeNames.map((name) => transaction.objectStore(name))
				: transaction.objectStore(storeNames);

			actionFn(store).then(resolve).catch(reject);
		});
	}

	/**
	 * Converts an IDBRequest into a Promise with proper error handling.
	 *
	 * @private
	 * @param {IDBRequest} request - The IndexedDB request
	 * @returns {Promise<any>}
	 */
	#promisifyRequest(request) {
		return new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	// ===== PRIVATE ORCHESTRATED IMPLEMENTATIONS =====

	#executeGet(storeName, key) {
		return this.#createTransaction(storeName, "readonly", (store) =>
			this.#promisifyRequest(store.get(key))
		);
	}

	#executeGetAll(storeName, query, count) {
		return this.#createTransaction(storeName, "readonly", (store) =>
			this.#promisifyRequest(store.getAll(query, count))
		);
	}

	#executePut(storeName, value) {
		return this.#createTransaction(storeName, "readwrite", (store) =>
			this.#promisifyRequest(store.put(value))
		).then((result) => {
			this.#stateManager.emit?.("storage.entity.updated", {
				storeName,
				entityId: value?.id,
				operation: "put",
			});
			return result;
		});
	}

	#executePutBulk(storeName, values) {
		return this.#createTransaction(storeName, "readwrite", () => {
			values.forEach((value) => store.put(value));
			return Promise.resolve();
		}).then(() => {
			this.#stateManager.emit?.("storage.entities.bulk_updated", {
				storeName,
				count: values.length,
				operation: "putBulk",
			});
		});
	}

	#executeDelete(storeName, key) {
		return this.#createTransaction(storeName, "readwrite", (store) =>
			this.#promisifyRequest(store.delete(key))
		).then((result) => {
			this.#stateManager.emit?.("storage.entity.deleted", {
				storeName,
				entityId: key,
				operation: "delete",
			});
			return result;
		});
	}

	#executeDeleteBulk(storeName, keys) {
		return this.#createTransaction(storeName, "readwrite", (store) => {
			keys.forEach((key) => store.delete(key));
			return Promise.resolve();
		}).then(() => {
			this.#stateManager.emit?.("storage.entities.bulk_deleted", {
				storeName,
				count: keys.length,
				operation: "deleteBulk",
			});
		});
	}

	#executeClear(storeName) {
		return this.#createTransaction(storeName, "readwrite", (store) =>
			this.#promisifyRequest(store.clear())
		).then((result) => {
			this.#stateManager.emit?.("storage.store.cleared", {
				storeName,
				operation: "clear",
			});
			return result;
		});
	}

	#executeCount(storeName, query) {
		return this.#createTransaction(storeName, "readonly", (store) =>
			this.#promisifyRequest(store.count(query))
		);
	}

	#executeQueryByIndex(storeName, indexName, query, options) {
		return this.#createTransaction(storeName, "readonly", (store) => {
			const index = store.index(indexName);
			if (options.keys) {
				return this.#promisifyRequest(
					index.getAllKeys(query, options.count)
				);
			}
			return this.#promisifyRequest(index.getAll(query, options.count));
		});
	}
}
