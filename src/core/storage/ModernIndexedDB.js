// src/core/storage/ModernIndexedDB.js

import { StorageError } from "../../utils/ErrorHelpers.js";

/**
 * @typedef {object} Migration
 * @property {number} version - The database version this migration applies to.
 * @property {function(IDBDatabase, IDBTransaction): void} migrate - The migration function.
 */

/**
 * A modern, promise-based wrapper for IndexedDB with support for schema migrations.
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
	/** @private @type {import('../HybridStateManager.js').default|null} */
	#stateManager = null;

	/**
	 * Creates an instance of ModernIndexedDB.
	 * @param {object} context - The application context and configuration.
	 * @param {string} context.dbName - The name of the database.
	 * @param {string} context.storeName - The name of the primary object store.
	 * @param {number} context.version - The current version of the database schema.
	 * @param {Array<Migration>} [context.migrations=[]] - An array of migration scripts.
	 * @param {import('../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ dbName, storeName, version, migrations = [], stateManager }) {
		this.#dbName = dbName;
		this.#storeName = storeName;
		this.#version = version;
		this.#migrations = migrations.sort((a, b) => a.version - b.version);
		this.#stateManager = stateManager;
	}

	/**
	 * Initializes the database connection and runs necessary migrations.
	 * @returns {Promise<void>}
	 */
	async init() {
		if (this.#isReady) return;

		try {
			const request = indexedDB.open(this.#dbName, this.#version);

			request.onupgradeneeded = (event) => {
				this.#handleUpgrade(event, request);
			};

			this.#db = await this.#promisifyRequest(request);
			this.#isReady = true;

			this.#audit("DB_INIT_SUCCESS", {
				dbName: this.#dbName,
				version: this.#version,
			});
			console.log(
				`[ModernIndexedDB] Database '${this.#dbName}' initialized successfully.`
			);
		} catch (error) {
			const dbError = new StorageError(
				"Database initialization failed.",
				{
					cause: error,
				}
			);
			this.#audit("DB_INIT_FAILED", { error: error.message });
			this.#stateManager?.managers?.errorHelpers?.handleError(dbError, {
				component: "ModernIndexedDB",
			});
			throw dbError;
		}
	}

	/**
	 * Handles the onupgradeneeded event for the database.
	 * @private
	 * @param {IDBVersionChangeEvent} event - The event object.
	 * @param {IDBOpenDBRequest} request - The database open request.
	 */
	#handleUpgrade(event, request) {
		console.log(
			`[ModernIndexedDB] Upgrading database from version ${event.oldVersion} to ${event.newVersion}.`
		);
		this.#audit("DB_UPGRADE_START", {
			from: event.oldVersion,
			to: event.newVersion,
		});

		const db = event.target.result;
		const transaction = request.transaction;

		// Ensure the primary object store exists.
		if (!db.objectStoreNames.contains(this.#storeName)) {
			db.createObjectStore(this.#storeName, { keyPath: "id" });
			this.#audit("DB_STORE_CREATED", { storeName: this.#storeName });
			console.log(
				`[ModernIndexedDB] Created object store '${this.#storeName}'.`
			);
		}

		// Run migrations.
		for (const { version, migrate } of this.#migrations) {
			if (version > event.oldVersion && version <= event.newVersion) {
				try {
					console.log(
						`[ModernIndexedDB] Applying migration for version ${version}.`
					);
					migrate(db, transaction, event.oldVersion);
					this.#audit("DB_MIGRATION_APPLIED", { version });
				} catch (error) {
					const migrationError = new StorageError(
						`Migration for version ${version} failed.`,
						{ cause: error }
					);
					this.#audit("DB_MIGRATION_FAILED", {
						version,
						error: error.message,
					});
					this.#stateManager?.managers?.errorHelpers?.handleError(
						migrationError,
						{ component: "ModernIndexedDB" }
					);
					transaction.abort();
					throw migrationError; // This will cause the open request to fail.
				}
			}
		}
	}

	/**
	 * Wraps a database operation with performance metrics and error handling.
	 * @private
	 * @param {string} operationName - The name of the operation (e.g., 'get', 'put').
	 * @param {Function} operationFn - The async function performing the DB operation.
	 * @returns {Promise<any>}
	 */
	async #trace(operationName, operationFn) {
		const errorHelpers = this.#stateManager?.managers?.errorHelpers;
		if (!errorHelpers) return operationFn(); // Fallback if error helpers aren't ready

		return errorHelpers.captureAsync(
			async () => {
				const startTime = performance.now();
				const result = await operationFn();
				const latency = performance.now() - startTime;
				const metrics =
					this.#stateManager?.metricsRegistry?.namespace("indexeddb");
				metrics?.updateAverage(`${operationName}_latency`, latency);
				metrics?.increment(`${operationName}_count`);
				return result;
			},
			{ component: `ModernIndexedDB.${operationName}` }
		);
	}

	/**
	 * Creates and manages an IndexedDB transaction.
	 * @private
	 * @param {string|string[]} storeNames - The name of the store(s) for the transaction.
	 * @param {IDBTransactionMode} mode - The transaction mode ('readonly' or 'readwrite').
	 * @param {function(IDBObjectStore|IDBObjectStore[]): Promise<any>} actionFn - The function to execute within the transaction.
	 * @returns {Promise<any>} The result of the action function.
	 */
	async #createTransaction(storeNames, mode, actionFn) {
		if (!this.#isReady) throw new StorageError("Database not initialized.");

		return new Promise((resolve, reject) => {
			const metrics =
				this.#stateManager?.metricsRegistry?.namespace("indexeddb");
			const transaction = this.#db.transaction(storeNames, mode, {
				durability: "strict",
			});

			transaction.oncomplete = () => {
				metrics?.increment(`transaction.complete.${mode}`);
			};

			transaction.onerror = (event) => {
				metrics?.increment(`transaction.error.${mode}`);
				this.#audit("DB_TRANSACTION_ERROR", {
					mode,
					error: event.target.error?.message,
				});
				reject(event.target.error);
			};

			const store = Array.isArray(storeNames)
				? storeNames.map((name) => transaction.objectStore(name))
				: transaction.objectStore(storeNames);

			actionFn(store).then(resolve).catch(reject);
		});
	}

	/**
	 * Gets a value by its key.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey} key - The key of the item to retrieve.
	 * @returns {Promise<any>} The retrieved item, or undefined.
	 */
	async get(storeName, key) {
		if (!this.#isReady) throw new StorageError("Database not initialized.");
		return this.#trace("get", () =>
			this.#createTransaction(storeName, "readonly", (store) => {
				const request = store.get(key);
				return this.#promisifyRequest(request);
			})
		);
	}

	/**
	 * Gets all values from a store.
	 * @param {string} storeName - The name of the object store.
	 * @returns {Promise<any[]>} An array of all items in the store.
	 */
	async getAll(storeName) {
		if (!this.#isReady) throw new StorageError("Database not initialized.");
		return this.#trace("getAll", () =>
			this.#createTransaction(storeName, "readonly", (store) => {
				const request = store.getAll();
				return this.#promisifyRequest(request);
			})
		);
	}

	/**
	 * Adds or updates a value in the store.
	 * @param {string} storeName - The name of the object store.
	 * @param {any} value - The value to store.
	 * @returns {Promise<IDBValidKey>} The key of the stored item.
	 */
	async put(storeName, value) {
		if (!this.#isReady) throw new StorageError("Database not initialized.");
		return this.#trace("put", () =>
			this.#createTransaction(storeName, "readwrite", (store) => {
				const request = store.put(value);
				return this.#promisifyRequest(request);
			})
		);
	}

	/**
	 * Adds or updates multiple values in a single transaction.
	 * @param {string} storeName - The name of the object store.
	 * @param {any[]} values - An array of values to store.
	 * @returns {Promise<void>}
	 */
	async putBulk(storeName, values) {
		if (!this.#isReady) throw new StorageError("Database not initialized.");
		return this.#trace("putBulk", () =>
			this.#createTransaction(storeName, "readwrite", async (store) => {
				values.forEach((value) => store.put(value));
				return Promise.resolve(); // The transaction promise handles completion
			})
		);
	}

	/**
	 * Deletes a value by its key.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey} key - The key of the item to delete.
	 * @returns {Promise<void>}
	 */
	async delete(storeName, key) {
		if (!this.#isReady) throw new StorageError("Database not initialized.");
		return this.#trace("delete", () =>
			this.#createTransaction(storeName, "readwrite", (store) => {
				const request = store.delete(key);
				return this.#promisifyRequest(request);
			})
		);
	}

	/**
	 * Clears all data from a store.
	 * @param {string} storeName - The name of the object store.
	 * @returns {Promise<void>}
	 */
	async clear(storeName) {
		if (!this.#isReady) throw new StorageError("Database not initialized.");
		return this.#trace("clear", () =>
			this.#createTransaction(storeName, "readwrite", (store) => {
				const request = store.clear();
				return this.#promisifyRequest(request);
			})
		);
	}

	/**
	 * Queries a store by an index.
	 * @param {string} storeName - The name of the object store.
	 * @param {string} indexName - The name of the index to query.
	 * @param {IDBValidKey | IDBKeyRange} query - The query value or range.
	 * @returns {Promise<any[]>} An array of matching items.
	 */
	async queryByIndex(storeName, indexName, query) {
		if (!this.#isReady) throw new StorageError("Database not initialized.");
		return this.#trace("queryByIndex", () =>
			this.#createTransaction(storeName, "readonly", (store) => {
				const index = store.index(indexName);
				const request = index.getAll(query);
				return this.#promisifyRequest(request);
			})
		);
	}

	/**
	 * Converts an IDBRequest into a Promise.
	 * @private
	 * @param {IDBRequest} request - The IndexedDB request.
	 * @returns {Promise<any>} A promise that resolves with the request's result or rejects with its error.
	 */
	#promisifyRequest(request) {
		return new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}
	/**
	 * Logs an audit event if the forensic logger is available.
	 * @private
	 * @param {string} eventType - The type of the event (e.g., 'DB_INIT_SUCCESS').
	 * @param {object} data - The data associated with the event.
	 */
	#audit(eventType, data) {
		this.#stateManager?.managers?.forensicLogger?.logAuditEvent(
			eventType,
			data,
			{
				component: "ModernIndexedDB",
			}
		);
	}

	/**
	 * Closes the database connection.
	 */
	close() {
		if (this.#db) {
			this.#db.close();
			this.#db = null;
			this.#isReady = false;
			this.#audit("DB_CLOSED", {});
			console.log(
				`[ModernIndexedDB] Database '${this.#dbName}' connection closed.`
			);
		}
	}

	/**
	 * Gets the ready state of the database.
	 * @returns {boolean}
	 */
	get isReady() {
		return this.#isReady;
	}
}

export default ModernIndexedDB;
