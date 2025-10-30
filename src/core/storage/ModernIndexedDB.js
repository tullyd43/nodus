// core/storage/ModernIndexedDB.js
// Simplified, modern, performance-focused IndexedDB wrapper

const PRIVATE = new WeakMap();

export class ModernIndexedDB {
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

  // Minimal API - only what's actually needed
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

  // Modern private method syntax
  #handleUpgrade(event) {
    const priv = PRIVATE.get(this);
    const db = event.target.result;

    if (!db.objectStoreNames.contains(priv.storeName)) {
      const store = db.createObjectStore(priv.storeName, { keyPath: "id" });

      // Only essential indexes for Nodus
      store.createIndex("classification", "meta.classification");
      store.createIndex("compartments", "meta.compartments", {
        multiEntry: true,
      });
      store.createIndex("syncState", "meta.syncState");
      store.createIndex("entity_type", "entity_type");
    }
  }

  // Simplified, consistent API
  async put(item) {
    return this.#operation("put", item);
  }
  async get(id) {
    return this.#operation("get", id);
  }
  async delete(id) {
    return this.#operation("delete", id);
  }
  async clear() {
    return this.#operation("clear");
  }
  async count() {
    return this.#operation("count");
  }

  // Single operation method - DRY principle
  async #operation(method, data) {
    const priv = PRIVATE.get(this);
    if (!priv.ready) throw new Error("Not initialized");

    return new Promise((resolve, reject) => {
      const tx = priv.db.transaction(
        priv.storeName,
        method === "put" || method === "delete" || method === "clear"
          ? "readwrite"
          : "readonly",
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

  // Bulk operations for performance
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

  // Query by classification for security filtering
  async queryByClassification(classification) {
    const priv = PRIVATE.get(this);
    return new Promise((resolve, reject) => {
      const tx = priv.db.transaction(priv.storeName, "readonly");
      const index = tx.objectStore(priv.storeName).index("classification");
      const req = index.getAll(classification);

      req.onsuccess = () => resolve(req.result || []);
    });
  }

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

  async saveObject(obj) {
    return this.put(obj);
  }

  close() {
    const priv = PRIVATE.get(this);
    priv.db?.close();
    priv.ready = false;
  }
}

export default ModernIndexedDB;
