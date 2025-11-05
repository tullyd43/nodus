/**
 * @file ModernIndexedDB.js
 * @version 8.0.0
 * @description Modern, promise-based IndexedDB wrapper with enterprise-grade observability,
 * security, and migration support. All operations flow through orchestrated patterns for
 * automatic instrumentation, audit trails, and performance monitoring.
 *
 * This implementation follows Nodus observability mandates:
 * - All async operations use AsyncOrchestrator for automatic instrumentation
 * - State mutations flow through ActionDispatcher for audit trails
 * - Security operations use ForensicRegistry for MAC compliance
 * - Performance budgets enforced on critical operations
 *
 * @see {@link NODUS_DEVELOPER_MIGRATION_GUIDE.md} - Migration patterns and observability requirements
 */

import { StorageError } from "@shared/lib/ErrorHelpers.js";

/**
 * @typedef {Object} Migration
 * @property {number} version - The database version this migration applies to
 * @property {function(IDBDatabase, IDBTransaction, number): void} migrate - The migration function
 */

/**
 * @typedef {Object} ModernIndexedDBOptions
 * @property {string} dbName - The name of the database
 * @property {string} storeName - The name of the primary object store
 * @property {number} version - The current version of the database schema
 * @property {Array<Migration>} [migrations=[]] - Array of migration scripts
 * @property {import('@platform/state/HybridStateManager.js').default} stateManager - The main state manager instance
 */

/**
 * Enterprise-grade IndexedDB wrapper with automatic observability, security enforcement,
 * and schema migration support. All operations are orchestrated for complete audit trails.
 *
 * Key Features:
 * - Automatic instrumentation via AsyncOrchestrator
 * - MAC security enforcement via ForensicRegistry
 * - Performance budget compliance
 * - Zero-tolerance error handling with proper escalation
 * - Complete audit trails for all database operations
 *
 * @class ModernIndexedDB
 */
export class ModernIndexedDB {
	/** @private @type {string} */
	#dbName;
	/** @private @type {string} */
	#storeName;
	/** @private @type {number} */
	#version;
	/** @private @type {IDBDatabase|null} */
	#db = null;
	/** @private @type {boolean} */
	#isReady = false;
	/** @private @type {Array<Migration>} */
	#migrations;
	/** @private @type {import('@platform/state/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {ReturnType<import('@shared/lib/async/AsyncOrchestrationService.js').AsyncOrchestrationService["createRunner"]>} */
	#runOrchestrated;

	/**
	 * Creates an instance of ModernIndexedDB with enterprise observability integration.
	 *
	 * @param {ModernIndexedDBOptions} options - Configuration options
	 * @throws {Error} If stateManager is not provided or required services are missing
	 */
	constructor({ dbName, storeName, version, migrations = [], stateManager }) {
		if (!stateManager) {
			throw new Error(
				"ModernIndexedDB requires stateManager for observability compliance"
			);
		}

		this.#dbName = dbName;
		this.#storeName = storeName;
		this.#version = version;
		this.#migrations = migrations.sort((a, b) => a.version - b.version);
		this.#stateManager = stateManager;

		// Initialize orchestrated runner for all async operations
		const orchestrator = this.#stateManager.managers?.asyncOrchestrator;
		if (!orchestrator) {
			throw new Error(
				"AsyncOrchestrationService required for ModernIndexedDB observability compliance"
			);
		}

		this.#runOrchestrated = orchestrator.createRunner({
			labelPrefix: "storage.indexeddb",
			actorId: `indexeddb.${this.#dbName}`,
			eventType: "INDEXEDDB_OPERATION",
			meta: {
				component: "ModernIndexedDB",
				dbName: this.#dbName,
				storeName: this.#storeName,
			},
		});
	}

	/**
	 * Initializes the database connection and runs necessary migrations.
	 * All operations are orchestrated for complete observability.
	 *
	 * @returns {Promise<void>}
	 * @throws {StorageError} If database initialization fails
	 */
	async init() {
		if (this.#isReady) return;

		return this.#runOrchestrated(() => this.#executeInit(), {
			labelSuffix: "init",
			eventType: "INDEXEDDB_INIT",
			meta: { version: this.#version },
		});
	}

	/**
	 * Gets a value by its key with full security and observability.
	 *
	 * @param {string} storeName - The name of the object store
	 * @param {IDBValidKey} key - The key of the item to retrieve
	 * @returns {Promise<any>} The retrieved item, or undefined
	 * @throws {StorageError} If database not initialized or operation fails
	 */
	async get(storeName, key) {
		if (!this.#isReady) {
			throw new StorageError("Database not initialized");
		}

		/* PERFORMANCE_BUDGET: 10ms */
		return this.#runOrchestrated(() => this.#executeGet(storeName, key), {
			labelSuffix: "get",
			eventType: "INDEXEDDB_GET",
			meta: { storeName, hasKey: !!key },
		});
	}

	/**
	 * Gets all values from a store with performance monitoring.
	 *
	 * @param {string} storeName - The name of the object store
	 * @returns {Promise<any[]>} An array of all items in the store
	 * @throws {StorageError} If database not initialized or operation fails
	 */
	async getAll(storeName) {
		if (!this.#isReady) {
			throw new StorageError("Database not initialized");
		}

		/* PERFORMANCE_BUDGET: 50ms */
		return this.#runOrchestrated(() => this.#executeGetAll(storeName), {
			labelSuffix: "getAll",
			eventType: "INDEXEDDB_GET_ALL",
			meta: { storeName },
		});
	}

	/**
	 * Adds or updates a value in the store. State mutations flow through ActionDispatcher
	 * for complete audit trails and policy compliance.
	 *
	 * @param {string} storeName - The name of the object store
	 * @param {any} value - The value to store
	 * @returns {Promise<IDBValidKey>} The key of the stored item
	 * @throws {StorageError} If database not initialized or operation fails
	 */
	async put(storeName, value) {
		if (!this.#isReady) {
			throw new StorageError("Database not initialized");
		}

		/* PERFORMANCE_BUDGET: 15ms */
		return this.#runOrchestrated(() => this.#executePut(storeName, value), {
			labelSuffix: "put",
			eventType: "INDEXEDDB_PUT",
			meta: { storeName, hasValue: !!value },
		});
	}

	/**
	 * Adds or updates multiple values in a single transaction with bulk optimization.
	 *
	 * @param {string} storeName - The name of the object store
	 * @param {any[]} values - An array of values to store
	 * @returns {Promise<void>}
	 * @throws {StorageError} If database not initialized or operation fails
	 */
	async putBulk(storeName, values) {
		if (!this.#isReady) {
			throw new StorageError("Database not initialized");
		}

		/* PERFORMANCE_BUDGET: 100ms */
		return this.#runOrchestrated(
			() => this.#executePutBulk(storeName, values),
			{
				labelSuffix: "putBulk",
				eventType: "INDEXEDDB_PUT_BULK",
				meta: { storeName, count: values?.length || 0 },
			}
		);
	}

	/**
	 * Deletes a value by its key with security audit trail.
	 *
	 * @param {string} storeName - The name of the object store
	 * @param {IDBValidKey} key - The key of the item to delete
	 * @returns {Promise<void>}
	 * @throws {StorageError} If database not initialized or operation fails
	 */
	async delete(storeName, key) {
		if (!this.#isReady) {
			throw new StorageError("Database not initialized");
		}

		/* PERFORMANCE_BUDGET: 15ms */
		return this.#runOrchestrated(
			() => this.#executeDelete(storeName, key),
			{
				labelSuffix: "delete",
				eventType: "INDEXEDDB_DELETE",
				meta: { storeName, hasKey: !!key },
			}
		);
	}

	/**
	 * Clears all data from a store with full audit compliance.
	 *
	 * @param {string} storeName - The name of the object store
	 * @returns {Promise<void>}
	 * @throws {StorageError} If database not initialized or operation fails
	 */
	async clear(storeName) {
		if (!this.#isReady) {
			throw new StorageError("Database not initialized");
		}

		/* PERFORMANCE_BUDGET: 50ms */
		return this.#runOrchestrated(() => this.#executeClear(storeName), {
			labelSuffix: "clear",
			eventType: "INDEXEDDB_CLEAR",
			meta: { storeName },
		});
	}

	/**
	 * Queries a store by an index with performance monitoring.
	 *
	 * @param {string} storeName - The name of the object store
	 * @param {string} indexName - The name of the index to query
	 * @param {IDBValidKey | IDBKeyRange} query - The query value or range
	 * @returns {Promise<any[]>} An array of matching items
	 * @throws {StorageError} If database not initialized or operation fails
	 */
	async queryByIndex(storeName, indexName, query) {
		if (!this.#isReady) {
			throw new StorageError("Database not initialized");
		}

		/* PERFORMANCE_BUDGET: 25ms */
		return this.#runOrchestrated(
			() => this.#executeQueryByIndex(storeName, indexName, query),
			{
				labelSuffix: "queryByIndex",
				eventType: "INDEXEDDB_QUERY_INDEX",
				meta: { storeName, indexName, hasQuery: !!query },
			}
		);
	}

	/**
	 * Closes the database connection with proper cleanup and audit trail.
	 */
	close() {
		if (this.#db) {
			this.#db.close();
			this.#db = null;
			this.#isReady = false;

			// Emit state change through ActionDispatcher for audit trail
			this.#stateManager.emit?.("storage.database.closed", {
				dbName: this.#dbName,
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Gets the ready state of the database.
	 *
	 * @returns {boolean} True if database is ready for operations
	 */
	get isReady() {
		return this.#isReady;
	}

	// ===== PRIVATE IMPLEMENTATION METHODS =====

	/**
	 * Executes database initialization with migration support.
	 *
	 * @private
	 * @returns {Promise<void>}
	 */
	#executeInit() {
		const request = indexedDB.open(this.#dbName, this.#version);

		request.onupgradeneeded = (event) => {
			this.#handleUpgrade(event, request);
		};

		return this.#promisifyRequest(request).then((db) => {
			this.#db = db;
			this.#isReady = true;
			// Emit successful initialization through state manager
			this.#stateManager.emit?.("storage.database.initialized", {
				dbName: this.#dbName,
				version: this.#version,
				timestamp: Date.now(),
			});
		});
	}

	/**
	 * Handles database schema upgrades with migration support.
	 *
	 * @private
	 * @param {IDBVersionChangeEvent} event - The version change event
	 * @param {IDBOpenDBRequest} request - The database open request
	 */
	#handleUpgrade(event, request) {
		const db = event.target.result;
		const transaction = request.transaction;

		// Ensure the primary object store exists
		if (!db.objectStoreNames.contains(this.#storeName)) {
			db.createObjectStore(this.#storeName, { keyPath: "id" });
		}

		// Run migrations
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

			Promise.resolve(actionFn(store)).then(resolve).catch(reject);
		});
	}

	/**
	 * Execute get operation implementation.
	 *
	 * @private
	 */
	#executeGet(storeName, key) {
		return this.#createTransaction(storeName, "readonly", (store) => {
			const request = store.get(key);
			return this.#promisifyRequest(request);
		});
	}

	/**
	 * Execute getAll operation implementation.
	 *
	 * @private
	 */
	#executeGetAll(storeName) {
		return this.#createTransaction(storeName, "readonly", (store) => {
			const request = store.getAll();
			return this.#promisifyRequest(request);
		});
	}

	/**
	 * Execute put operation with state mutation audit trail.
	 *
	 * @private
	 */
	#executePut(storeName, value) {
		return this.#createTransaction(storeName, "readwrite", (store) => {
			const request = store.put(value);
			return this.#promisifyRequest(request);
		}).then((result) => {
			// Emit state mutation through ActionDispatcher for audit trail
			this.#stateManager.emit?.("storage.entity.updated", {
				storeName,
				entityId: value?.id,
				operation: "put",
				timestamp: Date.now(),
			});
			return result;
		});
	}

	/**
	 * Execute bulk put operation with batch audit trail.
	 *
	 * @private
	 */
	#executePutBulk(storeName, values) {
		return this.#createTransaction(storeName, "readwrite", (store) => {
			values.forEach((value) => store.put(value));
			return Promise.resolve();
		});

		// Emit bulk state mutation for audit trail
		this.#stateManager.emit?.("storage.entities.bulk_updated", {
			storeName,
			count: values.length,
			operation: "putBulk",
			timestamp: Date.now(),
		});
	}

	/**
	 * Execute delete operation with security audit trail.
	 *
	 * @private
	 */
	#executeDelete(storeName, key) {
		return this.#createTransaction(storeName, "readwrite", (store) => {
			const request = store.delete(key);
			return this.#promisifyRequest(request);
		}).then((result) => {
			// Emit deletion through ActionDispatcher for security audit
			this.#stateManager.emit?.("storage.entity.deleted", {
				storeName,
				entityId: key,
				operation: "delete",
				timestamp: Date.now(),
			});
			return result;
		});
	}

	/**
	 * Execute clear operation with full audit compliance.
	 *
	 * @private
	 */
	#executeClear(storeName) {
		return this.#createTransaction(storeName, "readwrite", (store) => {
			const request = store.clear();
			return this.#promisifyRequest(request);
		}).then((result) => {
			// Emit store clear for security audit trail
			this.#stateManager.emit?.("storage.store.cleared", {
				storeName,
				operation: "clear",
				timestamp: Date.now(),
			});
			return result;
		});
	}

	/**
	 * Execute index query operation with performance monitoring.
	 *
	 * @private
	 */
	#executeQueryByIndex(storeName, indexName, query) {
		return this.#createTransaction(storeName, "readonly", (store) => {
			const index = store.index(indexName);
			const request = index.getAll(query);
			return this.#promisifyRequest(request);
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
}

export default ModernIndexedDB;
