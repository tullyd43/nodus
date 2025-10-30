// core/storage/ModernIndexedDB.js
// Simplified, modern, performance-focused IndexedDB wrapper

/**
 * A WeakMap to hold private instance data, ensuring true privacy for database properties.
 * @private
 * @type {WeakMap<ModernIndexedDB, object>}
 */
const PRIVATE = new WeakMap();

/**
 * @description A simplified, modern, and performance-focused wrapper for the IndexedDB API.
 * It provides a minimal, promise-based interface for common database operations,
 * tailored for the application's specific storage needs.
 */
export class ModernIndexedDB {
	/**
	 * Creates an instance of the ModernIndexedDB wrapper.
	 * @param {string} dbName - The name of the database.
	 * @param {string} storeName - The name of the primary object store this instance will manage.
	 * @param {number} [version=1] - The version of the database schema.
	 */
	constructor(dbName, storeName, version = 1) {
		// Use WeakMap for truly private data
		PRIVATE.set(this, {
			dbName,
			storeName,
			version,
			db: null,
			ready: false,
		});
	}

	/**
	 * Initializes the database connection.
	 * This must be called before any other database operations are performed.
	 * @returns {Promise<this>} A promise that resolves with the initialized instance.
	 */
	async init() {
		const priv = PRIVATE.get(this);
		if (priv.ready) return this;

		priv.db = await new Promise((resolve, reject) => {
			const req = indexedDB.open(priv.dbName, priv.version);
			req.onerror = () => reject(req.error);
			req.onsuccess = () => resolve(req.result);
			req.onupgradeneeded = this.#handleUpgrade.bind(this);
		});

		priv.ready = true;
		return this;
	}

	/**
	 * Handles the `upgradeneeded` event to create or update the database schema.
	 * This method is bound to the class instance and should not be called directly.
	 * @private
	 * @param {IDBVersionChangeEvent} event - The event object from the `onupgradeneeded` handler.
	 */
	#handleUpgrade(event) {
		const priv = PRIVATE.get(this);
		const db = event.target.result;

		if (!db.objectStoreNames.contains(priv.storeName)) {
			const store = db.createObjectStore(priv.storeName, {
				keyPath: "id",
			});

			// Only essential indexes for Nodus
			store.createIndex("classification", "meta.classification");
			store.createIndex("compartments", "meta.compartments", {
				multiEntry: true,
			});
			store.createIndex("syncState", "meta.syncState");
			store.createIndex("entity_type", "entity_type");
		}
	}

	/**
	 * Adds or updates an item in the object store.
	 * @param {object} item - The item to store. It must have a property matching the store's `keyPath`.
	 * @returns {Promise<IDBValidKey>} A promise that resolves with the key of the stored item.
	 */
	async put(item) {
		return this.#operation("put", item);
	}
	/**
	 * Retrieves an item from the object store by its key.
	 * @param {IDBValidKey} id - The key of the item to retrieve.
	 * @returns {Promise<object|undefined>} A promise that resolves with the item, or undefined if not found.
	 */
	async get(id) {
		return this.#operation("get", id);
	}
	/**
	 * Deletes an item from the object store by its key.
	 * @param {IDBValidKey} id - The key of the item to delete.
	 * @returns {Promise<void>} A promise that resolves when the operation is complete.
	 */
	async delete(id) {
		return this.#operation("delete", id);
	}
	/**
	 * Clears all items from the object store.
	 * @returns {Promise<void>} A promise that resolves when the operation is complete.
	 */
	async clear() {
		return this.#operation("clear");
	}
	/**
	 * Counts the total number of items in the object store.
	 * @returns {Promise<number>} A promise that resolves with the total count.
	 */
	async count() {
		return this.#operation("count");
	}

	/**
	 * A private helper method that centralizes transaction logic for single-item operations,
	 * adhering to the DRY (Don't Repeat Yourself) principle.
	 * @private
	 * @param {'put'|'get'|'delete'|'clear'|'count'} method - The name of the operation to perform.
	 * @param {*} [data] - The data or key required for the operation.
	 * @returns {Promise<any>} A promise that resolves with the result of the operation.
	 * @throws {Error} If the database is not initialized or if an unknown method is provided.
	 */
	async #operation(method, data) {
		const priv = PRIVATE.get(this);
		if (!priv.ready) throw new Error("Not initialized");

		return new Promise((resolve, reject) => {
			const tx = priv.db.transaction(
				priv.storeName,
				method === "put" || method === "delete" || method === "clear"
					? "readwrite"
					: "readonly"
			);
			const store = tx.objectStore(priv.storeName);

			let req;
			switch (method) {
				case "put":
					req = store.put(data);
					break;
				case "get":
					req = store.get(data);
					break;
				case "delete":
					req = store.delete(data);
					break;
				case "clear":
					req = store.clear();
					break;
				case "count":
					req = store.count();
					break;
				default:
					reject(new Error(`Unknown operation: ${method}`));
					return;
			}

			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}

	/**
	 * Adds or updates multiple items in the object store in a single transaction for performance.
	 * @param {object[]} items - An array of items to store.
	 * @returns {Promise<IDBValidKey[]>} A promise that resolves with an array of keys for the stored items.
	 */
	async putBulk(items) {
		const priv = PRIVATE.get(this);
		if (!priv.ready) throw new Error("Not initialized");

		return new Promise((resolve, reject) => {
			const tx = priv.db.transaction(priv.storeName, "readwrite");
			const store = tx.objectStore(priv.storeName);

			const results = [];
			let pending = items.length;

			if (pending === 0) {
				resolve([]);
				return;
			}

			items.forEach((item, i) => {
				const req = store.put(item);
				req.onsuccess = () => {
					results[i] = req.result;
					if (--pending === 0) resolve(results);
				};
				req.onerror = () => reject(req.error);
			});
		});
	}

	/**
	 * Retrieves all items that match a specific classification level.
	 * @param {string} classification - The classification level to query for.
	 * @returns {Promise<object[]>} A promise that resolves with an array of matching items.
	 */
	async queryByClassification(classification) {
		const priv = PRIVATE.get(this);
		return new Promise((resolve, reject) => {
			const tx = priv.db.transaction(priv.storeName, "readonly");
			const index = tx
				.objectStore(priv.storeName)
				.index("classification");
			const req = index.getAll(classification);

			req.onsuccess = () => resolve(req.result || []);
		});
	}

	/**
	 * Retrieves all objects of a specific entity type.
	 * @param {string} type - The `entity_type` to query for.
	 * @returns {Promise<object[]>} A promise that resolves with an array of matching objects.
	 */
	async getObjectsByType(type) {
		const priv = PRIVATE.get(this);
		return new Promise((resolve, reject) => {
			const tx = priv.db.transaction(priv.storeName, "readonly");
			const index = tx.objectStore(priv.storeName).index("entity_type");
			const req = index.getAll(type);

			req.onsuccess = () => resolve(req.result || []);
			req.onerror = () => reject(req.error);
		});
	}

	/**
	 * A convenience alias for the `put` method.
	 * @param {object} obj - The object to save.
	 * @returns {Promise<IDBValidKey>} A promise that resolves with the key of the saved object.
	 */
	async saveObject(obj) {
		return this.put(obj);
	}

	/**
	 * Closes the database connection and marks the instance as not ready.
	 */
	close() {
		const priv = PRIVATE.get(this);
		priv.db?.close();
		priv.ready = false;
	}
}

export default ModernIndexedDB;
