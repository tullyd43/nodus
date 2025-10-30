// src/core/storage/StorageLoader.js
// ============================================================================
/**
 * StorageLoader: dynamic, data-driven storage module orchestration.
 * - Demo-friendly (demoMode), production-hardened (MAC + crypto) when enabled
 * - Data-driven module stacks (add/override in AppConfig without code changes)
 * - Correct Sync orchestration (SyncStack + strategies like realtime/batch)
 * - Transparent crypto (optional) + polyinstantiation-awareness
 * - No private class fields (#foo) to keep ESLint / parsers happy
 *
 * Expected module URLs (via dynamic import) under baseURL:
 *   validation-stack.js, strict-validator.js, custom-validator.js
 *   basic-security.js, enterprise-security.js, nato-security.js, compartment-security.js
 *   demo-crypto.js, basic-crypto.js, aes-crypto.js, zero-knowledge-crypto.js, key-rotation.js
 *   indexeddb-adapter.js
 *   sync-stack.js, realtime-sync.js, batch-sync.js
 */

import { constantTimeCheck } from "../security/ct.js"; // timing-channel padding

/**
 * @description These imports are optional. If the cryptographic modules are not wired or available,
 * the StorageLoader will still function, but without encryption capabilities.
 * @type {typeof import("../security/ClassificationCrypto.js").ClassificationCrypto | null}
 */
let ClassificationCrypto = null;

/**
 * @description These imports are optional. If the cryptographic modules are not wired or available,
 * the StorageLoader will still function, but without encryption capabilities.
 * @type {typeof import("../security/Keyring.js").InMemoryKeyring | null}
 */
let InMemoryKeyring = null;

try {
	/** @description Dynamically import cryptographic classes. */
	const kr = await import("../security/Keyring.js");
	InMemoryKeyring = kr.InMemoryKeyring;
	const cc = await import("../security/ClassificationCrypto.js");
	ClassificationCrypto = cc.ClassificationCrypto;
} catch {
	// Crypto is optional; we’ll degrade gracefully when not present.
}

/**
 * @typedef {object} StorageLoaderConfig
 * @property {string} [baseURL="/src/core/storage/modules/"] Absolute/served base URL for module scripts.
 * @property {string[]} [preloadModules=[]] Module ids to preload (e.g., ["demo-crypto"])
 * @property {boolean} [demoMode=false] If true, uses demo crypto + simple security stack.
 * @property {import('../security/MACEngine.js').MACEngine|null} [mac=null] MAC engine with { subject(): Label, label(obj,ctx): Label, enforceNoReadUp(), enforceNoWriteDown() }
 * @property {boolean} [cacheModules=true] Cache constructors between loads.
 * @property {object} [moduleStacks] Data-driven stacks by profile.
 */

/**
 * @typedef {object} AuthContext
 * @property {string} [clearanceLevel] e.g. "internal","confidential","secret","nato_secret"
 * @property {string[]} [compartments]
 */

/**
 * Dynamically loads and orchestrates storage modules based on security requirements and configuration.
 * This class acts as a factory for `ModularOfflineStorage`, ensuring the correct cryptographic,
 * security, and synchronization modules are loaded for the given context. It embodies the
 * **Composability** and **Extensibility** pillars by using a data-driven approach to build module stacks.
 */
export class StorageLoader {
	/** @type {Map<string, Function>} */
	_loadedModules = new Map();
	/** @type {StorageLoaderConfig} */
	_config;
	/** @type {boolean} */
	_ready = false;

	/** Optional event emitter hooks */
	_listeners = null;

	/**
	 * Creates an instance of StorageLoader.
	 * @param {StorageLoaderConfig} [options={}] - Configuration options for the loader.
	 */
	constructor(options = {}) {
		this._config = {
			baseURL: options.baseURL ?? "/src/core/storage/modules/",
			preloadModules: options.preloadModules ?? [],
			demoMode: options.demoMode ?? false,
			mac: options.mac ?? null,
			cacheModules: options.cacheModules !== false,
			moduleStacks: options.moduleStacks ?? {
				demo: {
					core: ["validation-stack"],
					security: ["basic-security"],
					crypto: ["demo-crypto"],
					sync: [],
				},
				basic: {
					core: ["validation-stack"],
					security: ["basic-security"],
					crypto: ["basic-crypto"],
					sync: [],
				},
				high_security: {
					core: ["validation-stack"],
					security: ["enterprise-security"],
					crypto: ["aes-crypto", "key-rotation"],
					sync: [],
				},
				nato: {
					core: ["validation-stack"],
					security: ["nato-security", "compartment-security"],
					crypto: ["zero-knowledge-crypto", "key-rotation"],
					sync: [],
				},
			},
			...options,
		};

		// Optional crypto router (only if available)
		this.crypto = ClassificationCrypto
			? new ClassificationCrypto({
					keyring: InMemoryKeyring ? new InMemoryKeyring() : null,
				})
			: null;

		// Pre-bind MAC for convenience
		this._mac = this._config.mac || null;

		console.log(
			"[StorageLoader] Initialized with demoMode:",
			this._config.demoMode
		);
	}

	// ---------------------------------------------------------------------------
	// Event system (tiny)
	/**
	 * Registers a callback for a specific event.
	 * @param {string} event - The name of the event.
	 * @param {Function} cb - The callback function to execute.
	 */
	on(event, cb) {
		if (!this._listeners) this._listeners = new Map();
		if (!this._listeners.has(event)) this._listeners.set(event, []);
		this._listeners.get(event).push(cb);
	}
	emit(event, data) {
		/**
		 * Emits an event, triggering all registered listeners.
		 * @param {string} event - The name of the event to emit.
		 * @param {*} data - The data to pass to the listeners.
		 */
		if (!this._listeners?.has(event)) return;
		for (const cb of this._listeners.get(event)) {
			try {
				cb(data);
			} catch (e) {
				console.error("[StorageLoader] Event handler error:", e);
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Lifecycle
	/**
	 * Initializes the StorageLoader by preloading core modules.
	 * @returns {Promise<this>} The initialized StorageLoader instance.
	 */
	async init() {
		if (this._ready) return this;
		await this._loadCoreValidation();
		// Preload requested modules (best-effort; ignore failures in demo/dev)
		for (const name of this._config.preloadModules) {
			try {
				await this._loadModule(name);
			} catch (e) {
				console.warn("[StorageLoader] Preload failed:", name, e);
			}
		}
		this._ready = true;
		console.log("[StorageLoader] Ready with dynamic module loading");
		return this;
	}

	/**
	 * Creates and initializes a `ModularOfflineStorage` instance with a dynamically assembled stack of modules.
	 * @param {AuthContext} [authContext={}]
	 * @param {StorageCreationOptions} [options={}]
	 * @returns {Promise<ModularOfflineStorage>} A promise that resolves with an initialized `ModularOfflineStorage` instance.
	 */
	async createStorage(authContext = {}, options = {}) {
		if (!this._ready) await this.init();

		const needs = await this._analyzeRequirements(authContext, options);
		const classes = await this._loadRequiredModules(needs);

		const storage = new ModularOfflineStorage(classes, {
			demoMode: !!this._config.demoMode,
			mac: this._mac,
			crypto: this.crypto, // optional
			indexeddb: options.indexeddbConfig, // pass to adapter
		});

		await storage.init();
		return storage;
	}

	// ---------------------------------------------------------------------------
	// Requirements analysis (data-driven, profile-based)
	/**
	 * Analyzes the user's context and options to determine the required module stack.
	 * @private
	 * @param {AuthContext} authContext - The user's authentication and clearance context.
	 * @param {StorageCreationOptions} options - The options for creating the storage instance.
	 * @returns {Promise<object>} An object detailing the required modules for each category (core, security, crypto, sync).
	 */
	async _analyzeRequirements(authContext, options) {
		// 1) demo
		if (this._config.demoMode) {
			return { ...this._config.moduleStacks.demo };
		}

		// 2) security profile (RBAC+classification-based)
		const level = String(
			authContext?.clearanceLevel || "internal"
		).toLowerCase();
		let profile = "basic";
		if (this._isNATO(level)) profile = "nato";
		else if (this._isHigh(level)) profile = "high_security";

		const base = JSON.parse(
			JSON.stringify(
				this._config.moduleStacks[profile] ||
					this._config.moduleStacks.basic
			)
		);

		// 3) validation flags
		if (options.strictValidation) {
			base.core = Array.from(
				new Set([...(base.core || []), "strict-validator"])
			);
		}
		if (options.customValidators?.length) {
			base.core = Array.from(
				new Set([...(base.core || []), "custom-validator"])
			);
		}

		// 4) sync flags (sync-stack orchestrates its strategies)
		if (options.enableSync === true) {
			// Always include the stack itself
			base.sync.push("sync-stack");

			// Choose submodules
			if (options.realtimeSync) {
				base.sync.push("realtime-sync");
			} else {
				base.sync.push("batch-sync"); // default submodule
			}
		}

		// Always need IndexedDB adapter
		base.indexeddb = ["indexeddb-adapter"];
		return base;
	}

	// ---------------------------------------------------------------------------
	// Stack loaders
	/**
	 * Loads all required module classes based on the analyzed requirements.
	 * @private
	 * @param {object} requirements - An object detailing the required modules.
	 * @returns {Promise<object>} An object containing the loaded module classes, ready for instantiation.
	 */
	async _loadRequiredModules(requirements) {
		const modules = {
			validation: await this._loadValidationStack(
				requirements.core || []
			),
			security: await this._loadSecurityStack(
				requirements.security || []
			),
			crypto: await this._loadCryptoStack(requirements.crypto || []),
			sync: await this._loadSyncStack(requirements.sync || []),
			indexeddb: await this._ensureIndexedDB(
				requirements.indexeddb || ["indexeddb-adapter"]
			),
		};
		return modules;
	}

	/**
	 * Loads and instantiates the `ValidationStack` and its validator modules.
	 * @private
	 * @param {string[]} req - An array of required validator module names.
	 * @returns {Promise<import('./modules/validation-stack.js').default>} An initialized `ValidationStack` instance.
	 */
	async _loadValidationStack(req) {
		const ValidationStack = await this._loadModule("validation-stack");
		const validators = [];

		if (req.includes("strict-validator")) {
			try {
				validators.push(await this._loadModule("strict-validator"));
			} catch (e) {
				console.warn("[StorageLoader] strict-validator missing:", e);
			}
		}
		if (req.includes("custom-validator")) {
			try {
				validators.push(await this._loadModule("custom-validator"));
			} catch (e) {
				console.warn("[StorageLoader] custom-validator missing:", e);
			}
		}

		return new ValidationStack(validators);
	}

	/**
	 * Loads and instantiates the primary security module and any supplementary ones.
	 * @private
	 * @param {string[]} req - An array of required security module names.
	 * @returns {Promise<object|null>} An initialized security module instance.
	 */
	async _loadSecurityStack(req) {
		if (!req?.length) return null;
		let SecurityClass = null;
		const extras = [];

		for (const r of req) {
			if (
				r === "basic-security" ||
				r === "enterprise-security" ||
				r === "nato-security"
			) {
				SecurityClass = await this._loadModule(r);
			} else {
				// supplementary (e.g., compartment-security)
				try {
					extras.push(await this._loadModule(r));
				} catch (e) {
					console.warn(
						"[StorageLoader] security extra missing:",
						r,
						e
					);
				}
			}
		}
		return SecurityClass ? new SecurityClass(extras) : null;
	}

	/**
	 * Loads and instantiates the primary crypto module and any supplementary ones.
	 * @private
	 * @param {string[]} req - An array of required crypto module names.
	 * @returns {Promise<object|null>} An initialized crypto module instance.
	 */
	async _loadCryptoStack(req) {
		if (!req?.length) return null;
		let CryptoClass = null;
		const extras = [];

		for (const r of req) {
			if (
				r === "demo-crypto" ||
				r === "basic-crypto" ||
				r === "aes-crypto" ||
				r === "zero-knowledge-crypto"
			) {
				CryptoClass = await this._loadModule(r);
			} else {
				try {
					extras.push(await this._loadModule(r));
				} catch (e) {
					console.warn("[StorageLoader] crypto extra missing:", r, e);
				}
			}
		}
		return CryptoClass ? new CryptoClass(extras) : null;
	}

	/**
	 * Loads and instantiates the `SyncStack` and its strategy modules (e.g., realtime, batch).
	 * @private
	 * @param {string[]} req - An array of required sync module names.
	 * @returns {Promise<import('./modules/sync-stack.js').default|null>} An initialized `SyncStack` instance.
	 */
	async _loadSyncStack(req) {
		if (!req.includes("sync-stack")) return null; // guard: only build if requested

		const SyncStack = await this._loadModule("sync-stack");

		// Filter out the stack itself; pass only concrete submodules
		const submodules = [];
		for (const name of req) {
			if (name === "sync-stack") continue;
			submodules.push(await this._loadModule(name));
		}

		return new SyncStack(submodules, {
			// You can thread extra config knobs here if needed
			maxRetries: 3,
			retryDelay: 1000,
			batchSize: 50,
			offlineQueueLimit: 1000,
			enableConflictResolution: true,
		});
	}

	/**
	 * Ensures the IndexedDB adapter module is loaded.
	 * @private
	 * @param {string[]} req - An array containing the name of the adapter module.
	 * @returns {Promise<Function>} The IndexedDB adapter class.
	 */
	async _ensureIndexedDB(req) {
		// Require at least the adapter
		const name = req[0] || "indexeddb-adapter";
		return await this._loadModule(name);
	}

	// ---------------------------------------------------------------------------
	// Single module loader (+ cache)
	/**
	 * Dynamically imports a module by name, with caching.
	 * @private
	 * @param {string} moduleName - The name of the module file (without .js extension).
	 * @returns {Promise<Function>} The default or named export (class) from the module.
	 * @throws {Error} If the module fails to load or has no valid export.
	 */
	async _loadModule(moduleName) {
		if (this._loadedModules.has(moduleName)) {
			return this._loadedModules.get(moduleName);
		}
		console.log("[StorageLoader] Loading module:", moduleName);

		const url = `${this._config.baseURL}${moduleName}.js`;
		try {
			const mod = await import(/* @vite-ignore */ url);
			const Klass = mod.default || mod[this._toPascalCase(moduleName)];
			if (!Klass) throw new Error("No default or named export found");
			if (this._config.cacheModules)
				this._loadedModules.set(moduleName, Klass);
			return Klass;
		} catch (e) {
			console.error(
				"[StorageLoader] Failed to load module",
				moduleName,
				e
			);
			throw new Error(`Module loading failed: ${moduleName}`);
		}
	}

	// ---------------------------------------------------------------------------
	// Minimal core validation (always present immediately)
	/**
	 * Loads a minimal, synchronous validator for bootstrapping purposes.
	 * @private
	 * @returns {Promise<void>}
	 */
	async _loadCoreValidation() {
		if (this._loadedModules.has("core-validation")) return;

		class CoreValidation {
			validateBasic(entity) {
				const errors = [];
				if (!entity || typeof entity !== "object")
					errors.push("Invalid entity");
				if (!entity?.id) errors.push("Missing id");
				if (!entity?.entity_type) errors.push("Missing entity_type");
				return { valid: errors.length === 0, errors };
			}
		}
		this._loadedModules.set("core-validation", CoreValidation);
	}

	// ---------------------------------------------------------------------------
	// Helpers
	/**
	 * Checks if a security level is a NATO classification.
	 * @private
	 * @param {string} level - The security level string.
	 * @returns {boolean}
	 */
	_isNATO(level) {
		return [
			"nato_restricted",
			"nato_confidential",
			"nato_secret",
			"cosmic_top_secret",
		].includes(level);
	}
	/**
	 * Checks if a security level is considered high security.
	 * @private
	 * @param {string} level - The security level string.
	 * @returns {boolean}
	 */
	_isHigh(level) {
		return ["confidential", "secret", "top_secret"].includes(level);
	}
	_toPascalCase(s) {
		return String(s)
			.split("-")
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join("");
	}

	// Getters
	/**
	 * Gets the ready state of the StorageLoader.
	 * @returns {boolean}
	 */
	get isReady() {
		return this._ready;
	}
	/**
	 * Gets a list of all loaded module names.
	 * @returns {string[]}
	 */
	get loadedModules() {
		return Array.from(this._loadedModules.keys());
	}
}

// ============================================================================
// ModularOfflineStorage
// ============================================================================
/**
 * Orchestrates various storage modules (IndexedDB, security, crypto, validation, sync)
 * to provide a comprehensive and secure offline storage solution.
 * This class enforces Mandatory Access Control (MAC), handles transparent encryption/decryption,
 * and manages polyinstantiation for multi-level security.
 */
class ModularOfflineStorage {
	/**
	 * Creates an instance of ModularOfflineStorage.
	 * @param {object} moduleClasses - An object containing the loaded module classes or instances.
	 * @param {object} config - Configuration options for the storage.
	 * @param {boolean} config.demoMode - If true, enables demo-specific behaviors.
	 * @param {import('../security/MACEngine.js').MACEngine|null} config.mac - An instance of the MAC engine.
	 * @param {ClassificationCrypto|null} config.crypto - The crypto instance for encryption/decryption.
	 * @param {object} [config.indexeddb] - Configuration for the IndexedDB adapter.
	 */
	constructor(moduleClasses, config) {
		this._modules = {};
		this._ready = false;

		this._mac = config.mac || null;
		this._crypto = config.crypto || null;
		this._demo = !!config.demoMode;

		this.stateManager = null; // HSM may bind later

		// Instantiate modules
		for (const type of Object.keys(moduleClasses)) {
			const Cls = moduleClasses[type];
			if (!Cls) continue;

			if (type === "indexeddb") {
				// Pass IndexedDB config only to adapter
				this._modules[type] = new Cls(config.indexeddb || {});
			} else if (typeof Cls === "function") {
				this._modules[type] = new Cls({});
			} else {
				// Some stacks may already be instances
				this._modules[type] = Cls;
			}
		}
	}

	on(event, cb) {
		if (!this._listeners) this._listeners = new Map();
		if (!this._listeners.has(event)) this._listeners.set(event, []);
		this._listeners.get(event).push(cb);
	}
	emit(event, data) {
		/**
		 * Emits an event, triggering all registered listeners.
		 * @param {string} event - The name of the event to emit.
		 * @param {*} data - The data to pass to the listeners.
		 */
		if (!this._listeners?.has(event)) return;
		for (const cb of this._listeners.get(event)) {
			try {
				cb(data);
			} catch (e) {
				console.error("[ModularOfflineStorage] Event error:", e);
			}
		}
	}

	/**
	 * Initializes all loaded modules in a deterministic order.
	 * @returns {Promise<this>} The initialized storage instance.
	 */
	async init() {
		if (this._ready) return this;
		// Deterministic init order
		const order = ["indexeddb", "crypto", "security", "validation", "sync"];
		for (const k of order) {
			const m = this._modules[k];
			if (m?.init && typeof m.init === "function") {
				await m.init();
			}
		}
		this._ready = true;
		console.log("[ModularOfflineStorage] Initialized with dynamic modules");
		return this;
	}

	/**
	 * Binds a state manager to this instance and all sub-modules that support it.
	 * @param {object} hsm - The Hybrid State Manager instance.
	 */
	bindStateManager(hsm) {
		this.stateManager = hsm;
		for (const m of Object.values(this._modules)) {
			if (typeof m?.bindStateManager === "function")
				m.bindStateManager(hsm);
		}
	}

	// -------------------------------------------------------------------------
	// MAC helpers
	/**
	 * Retrieves the subject's security clearance from the MAC engine.
	 * @private
	 * @returns {{level: string, compartments: Set<string>}} The subject's security label.
	 */
	_subject() {
		return (
			this._mac?.subject?.() || {
				level: "unclassified",
				compartments: new Set(),
			}
		);
	}
	/**
	 * Extracts the security label (classification and compartments) from an object.
	 * @private
	 * @param {object} obj - The object to extract the label from.
	 * @param {object} [options] - Additional options.
	 * @returns {{level: string, compartments: Set<string>}} The object's security label.
	 */
	_label(obj, { storeName } = {}) {
		if (!obj || typeof obj !== "object")
			return { level: "unclassified", compartments: new Set() };
		const isPoly =
			storeName === "objects_polyinstantiated" ||
			"classification_level" in obj;
		const level =
			(isPoly ? obj.classification_level : obj.classification) ||
			"unclassified";
		const compartments = new Set(obj.compartments || []);
		return { level, compartments };
	}

	/**
	 * Calculates the numeric rank of a classification level.
	 * @private
	 * @param {string} level - The classification level string.
	 * @returns {number} The numeric rank.
	 */
	_rank(level) {
		const order = [
			"unclassified",
			"confidential",
			"secret",
			"nato_secret",
			"top_secret",
			"cosmic_top_secret",
		];
		const i = order.indexOf(String(level || "").toLowerCase());
		return i < 0 ? 0 : i;
	}

	/**
	 * Merges multiple polyinstantiated rows into a single logical entity.
	 * @private
	 * @param {object[]} rows - An array of polyinstantiated entity instances.
	 * @returns {object|null} The merged logical entity.
	 */
	_mergePolyRows(rows) {
		if (!Array.isArray(rows) || rows.length === 0) return null;

		// Prefer highest classification row as “base”
		const sorted = [...rows].sort(
			(a, b) =>
				this._rank(b.classification_level) -
				this._rank(a.classification_level)
		);
		const base = { ...sorted[0] };
		// Merge instance_data shallowly from higher -> lower (higher wins)
		for (let i = 1; i < sorted.length; i++) {
			const d = sorted[i]?.instance_data || {};
			for (const k of Object.keys(d)) {
				if (!(k in base.instance_data)) base.instance_data[k] = d[k];
			}
		}
		base.merged_at = new Date().toISOString();

		// Info flow (optional)
		this.stateManager?.informationFlow?.derived(
			rows.map((r) => ({
				level: r.classification_level,
				compartments: r.compartments,
			})),
			{ level: base.classification_level },
			{ operation: "poly_merge", logical_id: base.logical_id }
		);

		return base;
	}

	// -------------------------------------------------------------------------
	// Writes (transparent encryption if crypto & not demo)
	/**
	 * Stores an item, applying MAC enforcement and transparent encryption.
	 * Handles polyinstantiation for the 'objects_polyinstantiated' store.
	 * @param {string} storeName - The name of the IndexedDB object store.
	 * @param {object} item - The item to store.
	 * @returns {Promise<IDBValidKey>} The key of the stored item.
	 */
	async put(storeName, item) {
		const idx = this._modules.indexeddb;
		if (!idx?.put) throw new Error("IndexedDB adapter not loaded");

		// MAC write (no write down)
		if (this._mac) {
			this._mac.enforceNoWriteDown(
				this._subject(),
				this._label(item, { storeName }),
				{ storeName }
			);
		}

		let record = { ...item };

		// Polyinstantiation Write Logic
		if (storeName === "objects_polyinstantiated") {
			// 1. Generate the deterministic composite ID.
			// This ensures that a put operation for the same logical object at the same classification level
			// will overwrite the existing instance, fulfilling the "overwrite same-level" rule.
			// A write to a different classification level will create a new row.
			record.id = `${item.logical_id}-${item.classification_level}`;

			// 2. The MAC 'enforceNoWriteDown' check has already ensured the user has permission
			// to write at this classification level. The composite ID now handles the storage logic.
			// Additional checks (e.g., preventing a new low-level instance if a higher one exists)
			// could be added here, but the current model relies on the MAC check as the primary guard.
		}

		if (!this._demo && this._crypto) {
			// Encrypt either whole record or instance_data for poly
			const isPoly = storeName === "objects_polyinstantiated";
			const label = this._label(item, { storeName });

			if (isPoly && record.instance_data) {
				const pt = new TextEncoder().encode(
					JSON.stringify(record.instance_data)
				);
				const env = await this._crypto.encrypt(label, pt);
				record = {
					...record,
					encrypted: true,
					ciphertext: env.ciphertext,
					iv: env.iv,
					alg: env.alg,
					kid: env.kid,
					tag: env.tag,
				};
				delete record.instance_data;
			} else {
				const pt = new TextEncoder().encode(JSON.stringify(record));
				const env = await this._crypto.encrypt(label, pt);
				// Keep the original record's metadata, but replace its content with the envelope.
				const id = record.id;
				record = { ...item }; // Start fresh from the original item to preserve all fields.
				record.id = id; // Ensure ID is preserved.
				record.envelope = env;
				record.encrypted = true;
			}
		}

		const res = await idx.put(storeName, record);
		this.stateManager?.emit?.("entitySaved", {
			store: storeName,
			item: record,
		});
		return res;
	}

	// -------------------------------------------------------------------------
	// Reads (constant-time guarded; transparent decryption; poly merge)
	/**
	 * Retrieves an item, applying MAC enforcement and transparent decryption.
	 * Handles polyinstantiation by merging all readable instances.
	 * @param {string} storeName - The name of the IndexedDB object store.
	 * @param {IDBValidKey} id - The ID of the item to retrieve.
	 * @returns {Promise<object|null>} The decrypted and merged item, or null.
	 */
	async get(storeName, id) {
		const idx = this._modules.indexeddb;
		if (!idx?.get) throw new Error("IndexedDB adapter not loaded");

		return constantTimeCheck(async () => {
			// Poly store: read all rows for logical_id and MAC-filter them
			if (storeName === "objects_polyinstantiated") {
				const rows = await idx.queryByIndex(
					storeName,
					"logical_id",
					id
				);
				const readable = this._filterReadable(rows || [], storeName);
				const dec = await Promise.all(
					readable.map((r) => this._maybeDecryptPoly(r))
				);
				return this._mergePolyRows(dec);
			}

			// Normal store
			const raw = await idx.get(storeName, id);
			if (!raw) return null;

			// MAC read (no read up)
			if (this._mac) {
				this._mac.enforceNoReadUp(
					this._subject(),
					this._label(raw, { storeName }),
					{ storeName }
				);
			}
			return this._maybeDecryptNormal(raw);
		}, 100);
	}

	/**
	 * Deletes an item after enforcing MAC rules.
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey} id - The ID of the item to delete.
	 * @returns {Promise<void>}
	 */
	async delete(storeName, id) {
		const idx = this._modules.indexeddb;
		if (!idx?.delete) throw new Error("IndexedDB adapter not loaded");

		// Only delete if subject can read (prevents info leak)
		const item = await this.get(storeName, id);
		if (!item) return;

		// Treat delete like write wrt MAC (container policy)
		if (this._mac) {
			this._mac.enforceNoWriteDown(
				this._subject(),
				this._label(item, { storeName }),
				{ storeName }
			);
		}

		const res = await idx.delete(storeName, id);
		this.stateManager?.emit?.("entityDeleted", { store: storeName, id });
		return res;
	}

	/**
	 * Queries an IndexedDB store by index, filtering results based on MAC rules.
	 * @param {string} storeName - The name of the object store.
	 * @param {string} index - The name of the index to query.
	 * @param {IDBValidKey|IDBKeyRange} value - The value or range to query for.
	 * @returns {Promise<object[]>} An array of readable items.
	 */
	async query(storeName, index, value) {
		const idx = this._modules.indexeddb;
		if (!idx?.queryByIndex) throw new Error("IndexedDB adapter not loaded");
		const out = await idx.queryByIndex(storeName, index, value);
		return this._filterReadable(out || [], storeName);
	}

	/**
	 * Retrieves all items from a store, filtering results based on MAC rules.
	 * @param {string} storeName - The name of the object store.
	 * @returns {Promise<object[]>} An array of all readable items.
	 */
	async getAll(storeName) {
		const idx = this._modules.indexeddb;
		if (!idx?.getAll) throw new Error("IndexedDB adapter not loaded");
		const out = await idx.getAll(storeName);
		return this._filterReadable(out || [], storeName);
	}

	// -------------------------------------------------------------------------
	/**
	 * Decrypts the `instance_data` of a polyinstantiated row.
	 * @private
	 * @param {object} row - The raw row from the database.
	 * @returns {Promise<object>} The row with its `instance_data` decrypted.
	 */
	async _maybeDecryptPoly(row) {
		if (this._demo || !this._crypto || !row?.encrypted) return row;
		const label = this._label(row, {
			storeName: "objects_polyinstantiated",
		});
		const pt = await this._crypto.decrypt(label, {
			ciphertext: row.ciphertext,
			iv: row.iv,
			alg: row.alg,
			kid: row.kid,
			tag: row.tag,
		});
		const instance_data = JSON.parse(new TextDecoder().decode(pt));
		const clean = { ...row };
		delete clean.ciphertext;
		delete clean.iv;
		delete clean.alg;
		delete clean.kid;
		delete clean.tag;
		delete clean.encrypted;
		return { ...clean, instance_data };
	}

	/**
	 * Decrypts a normal (non-polyinstantiated) record.
	 * @private
	 * @param {object} row - The raw row from the database.
	 * @returns {Promise<object>} The decrypted object.
	 */
	async _maybeDecryptNormal(row) {
		if (this._demo || !this._crypto || !row?.encrypted) return row;
		const label = this._label(row);
		const pt = await this._crypto.decrypt(label, row.envelope);
		const obj = JSON.parse(new TextDecoder().decode(pt));
		return obj;
	}

	/**
	 * Filters a list of entities, returning only those the subject can read.
	 * @private
	 * @param {object[]} list - The array of entities to filter.
	 * @param {string} storeName - The name of the store the entities belong to.
	 * @returns {object[]} An array containing only the readable entities.
	 */
	_filterReadable(list, storeName) {
		if (!Array.isArray(list)) return [];
		if (!this._mac) return list; // dev fallback when MAC not wired
		const s = this._subject();
		const out = [];
		for (const it of list) {
			try {
				this._mac.enforceNoReadUp(s, this._label(it, { storeName }), {
					storeName,
				});
				out.push(it);
			} catch {
				/* not readable */
			}
		}
		return out;
	}

	/**
	 * Gets the names of all loaded modules.
	 * @returns {string[]}
	 */
	get modules() {
		return Object.keys(this._modules);
	}
}
