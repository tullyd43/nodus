// src/core/storage/ModernIndexedDB.js

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
	/** @private @type {Migration[]} */
	#migrations;

	/**
	 * Creates an instance of ModernIndexedDB.
	 * @param {string} dbName - The name of the database.
	 * @param {string} storeName - The name of the primary object store.
	 * @param {number} version - The current version of the database schema.
	 * @param {Migration[]} [migrations=[]] - An array of migration scripts.
	 */
	constructor(dbName, storeName, version, migrations = []) {
		this.#dbName = dbName;
		this.#storeName = storeName;
		this.#version = version;
		this.#migrations = migrations.sort((a, b) => a.version - b.version);
	}

	/**
	 * Initializes the database connection and runs necessary migrations.
	 * @returns {Promise<void>}
	 */
	async init() {
		if (this.#isReady) return;

		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.#dbName, this.#version);

			request.onerror = (event) => {
				console.error(
					`[ModernIndexedDB] Database error: ${event.target.error}`
				);
				reject(event.target.error);
			};

			request.onsuccess = (event) => {
				this.#db = event.target.result;
				this.#isReady = true;
				console.log(
					`[ModernIndexedDB] Database '${this.#dbName}' opened successfully.`
				);
				resolve();
			};

			request.onupgradeneeded = (event) => {
				console.log(
					`[ModernIndexedDB] Upgrading database from version ${event.oldVersion} to ${event.newVersion}.`
				);
				const db = event.target.result;
				const transaction = event.target.transaction;

				// Ensure the primary object store exists before running migrations.
				// This is crucial for new database creation (oldVersion === 0).
				if (!db.objectStoreNames.contains(this.#storeName)) {
					db.createObjectStore(this.#storeName, {
						keyPath: "id",
					});
					console.log(
						`[ModernIndexedDB] Created object store '${this.#storeName}'.`
					);
				}

				// Run all migrations between the old and new version.
				this.#migrations.forEach(({ version, migrate }) => {
					if (
						version > event.oldVersion &&
						version <= event.newVersion
					) {
						try {
							console.log(
								`[ModernIndexedDB] Applying migration for version ${version}.`
							);
							migrate(db, transaction, event.oldVersion);
						} catch (error) {
							console.error(
								`[ModernIndexedDB] Migration for version ${version} failed:`,
								error
							);
							transaction.abort();
							reject(error);
						}
					}
				});
			};
		});
	}

	/**
	 * Gets a value by its key.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey} key - The key of the item to retrieve.
	 * @returns {Promise<any>} The retrieved item, or undefined.
	 */
	async get(storeName, key) {
		if (!this.#isReady) throw new Error("Database not initialized.");
		return new Promise((resolve, reject) => {
			const transaction = this.#db.transaction(storeName, "readonly");
			const store = transaction.objectStore(storeName);
			const request = store.get(key);
			request.onsuccess = () => resolve(request.result);
			request.onerror = (event) => reject(event.target.error);
		});
	}

	/**
	 * Gets all values from a store.
	 * @param {string} storeName - The name of the object store.
	 * @returns {Promise<any[]>} An array of all items in the store.
	 */
	async getAll(storeName) {
		if (!this.#isReady) throw new Error("Database not initialized.");
		return new Promise((resolve, reject) => {
			const transaction = this.#db.transaction(storeName, "readonly");
			const store = transaction.objectStore(storeName);
			const request = store.getAll();
			request.onsuccess = () => resolve(request.result);
			request.onerror = (event) => reject(event.target.error);
		});
	}

	/**
	 * Adds or updates a value in the store.
	 * @param {string} storeName - The name of the object store.
	 * @param {any} value - The value to store.
	 * @returns {Promise<IDBValidKey>} The key of the stored item.
	 */
	async put(storeName, value) {
		if (!this.#isReady) throw new Error("Database not initialized.");
		return new Promise((resolve, reject) => {
			const transaction = this.#db.transaction(storeName, "readwrite", {
				durability: "strict",
			});
			const store = transaction.objectStore(storeName);
			const request = store.put(value);
			request.onsuccess = () => resolve(request.result);
			request.onerror = (event) => reject(event.target.error);
		});
	}

	/**
	 * Adds or updates multiple values in a single transaction.
	 * @param {string} storeName - The name of the object store.
	 * @param {any[]} values - An array of values to store.
	 * @returns {Promise<void>}
	 */
	async putBulk(storeName, values) {
		if (!this.#isReady) throw new Error("Database not initialized.");
		return new Promise((resolve, reject) => {
			const transaction = this.#db.transaction(storeName, "readwrite", {
				durability: "strict",
			});
			const store = transaction.objectStore(storeName);
			transaction.oncomplete = () => resolve();
			transaction.onerror = (event) => reject(event.target.error);

			values.forEach((value) => {
				store.put(value);
			});
		});
	}

	/**
	 * Deletes a value by its key.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey} key - The key of the item to delete.
	 * @returns {Promise<void>}
	 */
	async delete(storeName, key) {
		if (!this.#isReady) throw new Error("Database not initialized.");
		return new Promise((resolve, reject) => {
			const transaction = this.#db.transaction(storeName, "readwrite", {
				durability: "strict",
			});
			const store = transaction.objectStore(storeName);
			const request = store.delete(key);
			request.onsuccess = () => resolve();
			request.onerror = (event) => reject(event.target.error);
		});
	}

	/**
	 * Clears all data from a store.
	 * @param {string} storeName - The name of the object store.
	 * @returns {Promise<void>}
	 */
	async clear(storeName) {
		if (!this.#isReady) throw new Error("Database not initialized.");
		return new Promise((resolve, reject) => {
			const transaction = this.#db.transaction(storeName, "readwrite", {
				durability: "strict",
			});
			const store = transaction.objectStore(storeName);
			const request = store.clear();
			request.onsuccess = () => resolve();
			request.onerror = (event) => reject(event.target.error);
		});
	}

	/**
	 * Queries a store by an index.
	 * @param {string} storeName - The name of the object store.
	 * @param {string} indexName - The name of the index to query.
	 * @param {IDBValidKey | IDBKeyRange} query - The query value or range.
	 * @returns {Promise<any[]>} An array of matching items.
	 */
	async queryByIndex(storeName, indexName, query) {
		if (!this.#isReady) throw new Error("Database not initialized.");
		return new Promise((resolve, reject) => {
			const transaction = this.#db.transaction(storeName, "readonly");
			const store = transaction.objectStore(storeName);
			const index = store.index(indexName);
			const request = index.getAll(query);
			request.onsuccess = () => resolve(request.result);
			request.onerror = (event) => reject(event.target.error);
		});
	}

	/**
	 * Closes the database connection.
	 */
	close() {
		if (this.#db) {
			this.#db.close();
			this.#db = null;
			this.#isReady = false;
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
