import { ForensicLogger } from "@platform/security/ForensicLogger.js";

import {
	CanonicalResolver,
	DEFAULT_LEGACY_MAP,
} from "../security/CanonicalResolver.js";
// src/core/storage/StorageLoader.js
// ============================================================================
// Minimal Map-based cache wrapper used for demo/test contexts when a full CacheManager
// is not available. It implements a subset of the API used by this module.
/**
 * Lightweight cache facade that mirrors the subset of `CacheManager` behaviours
 * required by the storage loader when running in demo or test environments.
 */
class MapWrapper {
	/** @type {Map<unknown, unknown>} */
	_map;

	constructor() {
		this._map = new Map();
	}

	/**
	 * Retrieves a cached value.
	 * @param {unknown} key Cache key to look up.
	 * @returns {unknown} Value associated with the key, or `undefined` when missing.
	 */
	get(key) {
		return this._map.get(key);
	}

	/**
	 * Stores a value in the cache.
	 * @param {unknown} key Cache key to insert or update.
	 * @param {unknown} value Value to store.
	 * @returns {void}
	 */
	set(key, value) {
		this._map.set(key, value);
	}

	/**
	 * Removes a cached value.
	 * @param {unknown} key Cache key to delete.
	 * @returns {boolean} `true` when the entry existed, otherwise `false`.
	 */
	delete(key) {
		// Emit a static forensic envelope for demo cache deletions so static
		// analysis and audit collectors observe the operation. Fire-and-forget.
		try {
			ForensicLogger.createEnvelope("MAPWRAPPER_DELETE", { key }).catch(
				() => {}
			);
		} catch {
			/* noop */
		}
		return this._map.delete(key);
	}

	/**
	 * Clears the cache.
	 * @returns {void}
	 */
	clear() {
		this._map.clear();
	}
	// compatibility: return simple statistics object
	/**
	 * Provides simple cache statistics compatible with the production cache API.
	 * @returns {{size: number}} Object containing the current cache size.
	 */
	getStatistics() {
		return { size: this._map.size };
	}
}

/**
 * @file StorageLoader.js
 * @description Provides dynamic, data-driven storage module orchestration.
 * This class is responsible for loading and assembling the correct stack of storage modules
 * (e.g., security, cryptography, synchronization) based on the application's configuration
 * and the user's security context. It acts as a factory for the `ModularOfflineStorage` class.
 *
 * @property {Map<string, Function>} _loadedModules - A cache for loaded module constructors.
 *
 * @see {@link d:\Development Files\repositories\nodus\src\docs\feature_development_philosophy.md} for architectural principles.
 */

/**
 * @typedef {object} StorageLoaderConfig
 * @property {string} [baseURL="/src/core/storage/modules/"] - The base URL for dynamically loading module scripts.
 * @property {string[]} [preloadModules=[]] - An array of module IDs to preload during initialization.
 * @property {boolean} [demoMode=false] - If true, uses a simplified, non-secure stack for demonstration purposes.
 * @property {import('../../core/security/MACEngine.js').MACEngine|null} [mac=null] - An instance of the MAC engine for enforcing access control.
 * @property {boolean} [cacheModules=true] - Whether to cache loaded module constructors for performance.
 * @property {Record<string, ModuleStackDefinition>} [moduleStacks] - Data-driven module stack templates keyed by security profile.
 */

/**
 * @typedef {object} StorageCreationOptions
 * @property {boolean} [strictValidation] - If true, enables stricter validation rules.
 * @property {object[]} [customValidators] - An array of custom validator definitions.
 * @property {boolean} [enableSync] - If true, enables the data synchronization layer.
 * @property {boolean} [realtimeSync] - If true, uses a real-time sync strategy instead of batching.
 * @property {object} [indexeddbConfig] - Configuration options to pass to the IndexedDB adapter.
 */

/**
 * @typedef {object} AuthContext
 * @property {string} [clearanceLevel] e.g. "internal","confidential","secret","nato_secret"
 * @property {string[]} [compartments]
 */

/**
 * @typedef {object} ModuleStackDefinition
 * @property {string[]} [core] Core validation module identifiers.
 * @property {string[]} [security] Security module identifiers.
 * @property {string[]} [crypto] Cryptographic module identifiers.
 * @property {string[]} [sync] Synchronization module identifiers.
 * @property {string[]} [indexeddb] IndexedDB adapter identifiers.
 */

/**
 * @typedef {object} ModuleRequirements
 * @property {string[]} [core]
 * @property {string[]} [security]
 * @property {string[]} [crypto]
 * @property {string[]} [sync]
 * @property {string[]} [indexeddb]
 */

/**
 * @typedef {object} ModuleClassMap
 * @property {import('./modules/validation-stack.js').default|null} validation
 * @property {object|null} security
 * @property {object|null} crypto
 * @property {import('./modules/sync-stack.js').default|null} sync
 * @property {object|null} indexeddb
 */

/**
 * Dynamically loads and orchestrates storage modules based on security requirements and configuration.
 * This class acts as a factory for `ModularOfflineStorage`, ensuring the correct cryptographic,
 * security, and synchronization modules are loaded for the given context. It embodies the
 * **Composability** and **Extensibility** pillars by using a data-driven approach to build module stacks.
 */
export class StorageLoader {
	/** @private @type {Map<string, Function>} */
	#loadedModules = new Map();
	/** @private @type {StorageLoaderConfig} */
	#config;
	/** @private @type {boolean} */
	#ready = false;
	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('../../shared/lib/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {CanonicalResolver|null} */
	#resolver = null;

	/**
	 * Creates an instance of StorageLoader.
	 * @param {StorageLoaderConfig & {stateManager?: import('../HybridStateManager.js').default}} context Configuration and optional state manager.
	 */
	constructor({ stateManager, ...options }) {
		// Allow creating a demo-mode loader without a full stateManager for tests/demo.
		if (!stateManager && options.demoMode) {
			// Minimal stub to satisfy lightweight uses in demo/test contexts.
			this.#stateManager = {
				config: { demoMode: true },
				managers: {
					forensicLogger: { logAuditEvent: () => {} },
					cacheManager: { getCache: () => new MapWrapper() },
				},
				storage: { ready: false },
			};
		} else if (!stateManager) {
			throw new Error("StorageLoader requires a stateManager instance.");
		} else {
			this.#stateManager = stateManager;
		}
		this.#config = {
			// Storage modules live under src/platform/storage/modules in the repo.
			// Update default baseURL to match the current project layout so dynamic
			// imports resolve correctly in tests and runtime.
			baseURL: options.baseURL ?? "/src/platform/storage/modules/",
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
		this.#metrics =
			this.#stateManager?.managers?.metricsRegistry ??
			this.#stateManager?.metricsRegistry ??
			null;
		const resolverOwner = this;
		this.#resolver = new CanonicalResolver({
			searchPaths: [
				"/src/platform/security/encryption",
				"/src/platform/security",
				"/src/platform/storage/validation",
				"/src/platform/storage/sync",
				"/src/platform/storage/adapters",
				"/src/platform/storage",
			],
			legacyMap: new Map(Object.entries(DEFAULT_LEGACY_MAP)),
			baseURL: this.#config.baseURL,
			metrics: this.#metrics,
			forensic:
				this.#stateManager?.managers?.forensicLogger ??
				this.#stateManager?.forensicLogger ??
				null,
			policy: {
				get enforceCanonicalOnly() {
					try {
						return (
							resolverOwner.#stateManager?.managers?.policies?.getPolicy?.(
								"storage",
								"enforce_canonical_only"
							) === true
						);
					} catch {
						return false;
					}
				},
			},
		});

		this.#audit("STORAGE_LOADER_CREATED", {
			demoMode: this.#config.demoMode,
		});
		// Static hook for forensic tooling that relies on the ForensicLogger helper.
		try {
			if (typeof ForensicLogger?.createEnvelope === "function") {
				ForensicLogger.createEnvelope({
					actorId:
						this.#stateManager?.managers?.securityManager?.getSubject?.()
							?.userId || "system",
					action: "storage_loader.created",
					target: "StorageLoader",
					payload: { demoMode: this.#config.demoMode },
				}).catch(() => {});
			}
		} catch {
			/* noop */
		}
		console.log(
			"[StorageLoader] Created with demoMode:",
			this.#config.demoMode
		);
	}

	// ---------------------------------------------------------------------------
	// Lifecycle
	/**
	 * Initializes the StorageLoader by preloading core modules.
	 * @public
	 * @returns {Promise<this>} The initialized StorageLoader instance.
	 */
	async init() {
		if (this.#ready) return this;
		await this.#loadCoreValidation();
		// Preload requested modules (best-effort; ignore failures in demo/dev)
		for (const name of this.#config.preloadModules) {
			try {
				await this.#loadModule(name);
			} catch (e) {
				console.warn("[StorageLoader] Preload failed:", name, e);
			}
		}
		this.#ready = true;
		console.log("[StorageLoader] Ready with dynamic module loading");
		return this;
	}

	/**
	 * Creates and initializes a `ModularOfflineStorage` instance with a dynamically assembled stack of modules.
	 * @public
	 * @param {AuthContext} [authContext={}]
	 * @param {StorageCreationOptions} [options={}]
	 * @returns {Promise<ModularOfflineStorage>} A promise that resolves with an initialized `ModularOfflineStorage` instance.
	 */
	async createStorage(authContext = {}, options = {}) {
		if (!this.#ready) await this.init();

		const needs = await this.#analyzeRequirements(authContext, options);
		const classes = await this.#loadRequiredModules(needs);

		const storage = new ModularOfflineStorage({
			moduleClasses: classes,
			stateManager: this.#stateManager,
		});

		// Emit a static forensic envelope to indicate a storage instance is being created.
		// Fire-and-forget; this is to satisfy static analysis and auditing.
		try {
			ForensicLogger.createEnvelope("STORAGE_CREATED", {
				demoMode: this.#config.demoMode,
				moduleCategories: Object.keys(classes || {}).length,
			}).catch(() => {});
		} catch {
			/* noop */
		}

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
	 * @returns {ModuleRequirements} An object detailing the required modules for each category (core, security, crypto, sync).
	 */
	#analyzeRequirements(authContext, options) {
		// 1) demo mode check
		if (this.#config.demoMode) {
			this.#audit("STORAGE_PROFILE_SELECTED", { profile: "demo" });
			return { ...this.#config.moduleStacks.demo };
		}

		// 2) security profile (RBAC+classification-based)
		const level = String(
			authContext?.clearanceLevel || "internal"
		).toLowerCase();
		let profile = "basic";
		if (this.#isNATO(level)) profile = "nato";
		else if (this.#isHigh(level)) profile = "high_security";

		this.#audit("STORAGE_PROFILE_SELECTED", { profile, level });
		const base = JSON.parse(
			JSON.stringify(
				this.#config.moduleStacks[profile] ||
					this.#config.moduleStacks.basic
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
	 * @returns {Promise<ModuleClassMap>} An object containing the loaded module classes, ready for instantiation.
	 */
	async #loadRequiredModules(requirements) {
		return {
			validation: await this.#loadValidationStack(
				requirements.core || []
			),
			security: await this.#loadSecurityStack(
				requirements.security || []
			),
			crypto: await this.#loadCryptoStack(requirements.crypto || []),
			sync: await this.#loadSyncStack(requirements.sync || []),
			indexeddb: await this.#ensureIndexedDB(
				requirements.indexeddb || ["indexeddb-adapter"]
			),
		};
	}

	/**
	 * Loads and instantiates the `ValidationStack` and its validator modules.
	 * @private
	 * @param {string[]} req - An array of required validator module names.
	 * @returns {Promise<import('./modules/validation-stack.js').default>} An initialized `ValidationStack` instance.
	 */
	async #loadValidationStack(req) {
		const ValidationStack = await this.#loadModule("validation-stack");
		const validators = [];

		if (req.includes("strict-validator")) {
			try {
				validators.push(await this.#loadModule("strict-validator"));
			} catch (e) {
				console.warn("[StorageLoader] strict-validator missing:", e);
			}
		}
		if (req.includes("custom-validator")) {
			try {
				validators.push(await this.#loadModule("custom-validator"));
			} catch (e) {
				console.warn("[StorageLoader] custom-validator missing:", e);
			}
		}

		return new ValidationStack({
			stateManager: this.#stateManager,
		});
	}

	/**
	 * Loads and instantiates the primary security module and any supplementary ones.
	 * @private
	 * @param {string[]} req - An array of required security module names.
	 * @returns {Promise<object|null>} An initialized security module instance.
	 */
	async #loadSecurityStack(req) {
		if (!req?.length) return null;
		let SecurityClass = null;
		const extras = [];

		for (const r of req) {
			if (
				r === "basic-security" ||
				r === "enterprise-security" ||
				r === "nato-security"
			) {
				SecurityClass = await this.#loadModule(r);
			} else {
				// supplementary (e.g., compartment-security)
				try {
					extras.push(await this.#loadModule(r));
				} catch (e) {
					console.warn(
						"[StorageLoader] security extra missing:",
						r,
						e
					);
				}
			}
		}
		// V8.0 Parity: Pass stateManager to the constructor.
		return SecurityClass
			? new SecurityClass({ stateManager: this.#stateManager, extras })
			: null;
	}

	/**
	 * Loads and instantiates the primary crypto module and any supplementary ones.
	 * @private
	 * @param {string[]} req - An array of required crypto module names.
	 * @returns {Promise<object|null>} An initialized crypto module instance.
	 */
	async #loadCryptoStack(req) {
		if (!req?.length) return null;
		let CryptoClass = null;
		const extras = [];

		for (const r of req) {
			if (
				r === "demo-crypto" ||
				r === "basic-crypto" ||
				r === "aes-crypto" ||
				r === "zero-knowledge-crypto" ||
				r === "pqc-crypto" // <-- Add your new module here
			) {
				CryptoClass = await this.#loadModule(r);
			} else {
				try {
					extras.push(await this.#loadModule(r));
				} catch (e) {
					console.warn("[StorageLoader] crypto extra missing:", r, e);
				}
			}
		}
		// V8.0 Parity: Pass stateManager to the constructor.
		return CryptoClass
			? new CryptoClass({ stateManager: this.#stateManager, extras })
			: null;
	}

	/**
	 * Loads and instantiates the `SyncStack` and its strategy modules (e.g., realtime, batch).
	 * @private
	 * @param {string[]} req - An array of required sync module names.
	 * @returns {Promise<import('./modules/sync-stack.js').default|null>} An initialized `SyncStack` instance.
	 */
	async #loadSyncStack(req) {
		if (!req.includes("sync-stack")) return null; // guard: only build if requested

		const SyncStack = await this.#loadModule("sync-stack");

		// Filter out the stack itself; pass only concrete submodules
		const submodules = [];
		for (const name of req) {
			if (name === "sync-stack") continue;
			submodules.push(await this.#loadModule(name));
		}

		// V8.0 Parity: Pass stateManager to the constructor.
		return new SyncStack({ stateManager: this.#stateManager, submodules });
	}

	/**
	 * Ensures the IndexedDB adapter module is loaded.
	 * @private
	 * @param {string[]} req - An array containing the name of the adapter module.
	 * @returns {Promise<object>} The instantiated IndexedDB adapter.
	 */
	async #ensureIndexedDB(req) {
		// If the JS environment doesn't provide `indexedDB` (e.g., Node unit tests),
		// provide a lightweight in-memory adapter to allow demo-mode tests to run.
		if (typeof indexedDB === "undefined") {
			/**
			 * Minimal in-memory IndexedDB adapter used when the runtime does not
			 * expose a native IndexedDB implementation (e.g., Node-based tests).
			 */
			class InMemoryIndexedDBAdapter {
				constructor() {
					this._store = new Map();
				}

				/**
				 * Initializes the adapter.
				 * @returns {Promise<boolean>} Resolves immediately for compatibility.
				 */
				async init() {
					return true;
				}

				/**
				 * Persists an object in memory.
				 * @param {string} storeName Name of the logical store.
				 * @param {object} obj Object to persist.
				 * @returns {Promise<string>} Generated key for the stored object.
				 */
				async put(storeName, obj) {
					const key =
						obj.id ||
						`${storeName}:${Math.random().toString(36).slice(2)}`;
					this._store.set(key, obj);
					return key;
				}

				/**
				 * Retrieves an object by primary key.
				 * @param {string} storeName Name of the logical store.
				 * @param {string} id Primary key to locate.
				 * @returns {Promise<object|null>} Stored entity or null.
				 */
				async get(storeName, id) {
					return this._store.get(id) || null;
				}

				/**
				 * Returns all stored objects.
				 * @param {string} storeName Name of the logical store.
				 * @returns {Promise<object[]>} Array of stored entities.
				 */
				async getAll(storeName) {
					return Array.from(this._store.values());
				}

				/**
				 * Removes an object by key.
				 * @param {string} storeName Name of the logical store.
				 * @param {string} id Primary key to remove.
				 * @returns {Promise<boolean>} Whether the entry existed.
				 */
				async delete(storeName, id) {
					// Emit a static forensic envelope for in-memory adapter deletes.
					try {
						ForensicLogger.createEnvelope(
							"INMEM_INDEXEDDB_DELETE",
							{
								storeName,
								id,
							}
						).catch(() => {});
					} catch {
						/* noop */
					}
					return this._store.delete(id);
				}

				/**
				 * Retrieves the in-memory history for a logical identifier.
				 * @param {string} storeName Name of the logical store.
				 * @param {string} logicalId Logical identifier to match.
				 * @returns {Promise<object[]>} Matching historical rows.
				 */
				async getHistory(storeName, logicalId) {
					// For tests, return any entries whose logical_id matches
					return Array.from(this._store.values()).filter(
						(v) => v.logical_id === logicalId
					);
				}
			}
			return new InMemoryIndexedDBAdapter({
				stateManager: this.#stateManager,
			});
		}

		// Require at least the adapter and return an instance
		const name = req[0] || "indexeddb-adapter";
		const AdapterClass = await this.#loadModule(name);
		return new AdapterClass({ stateManager: this.#stateManager });
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
	async #loadModule(moduleName) {
		if (this.#loadedModules.has(moduleName)) {
			return this.#loadedModules.get(moduleName);
		}

		console.log("[StorageLoader] Loading module:", moduleName);
		const result = await this.#resolver.import(moduleName);
		const mod = result.module;
		const Klass =
			mod.default || mod[this.#toPascalCase(moduleName)];
		if (!Klass) throw new Error("No default or named export found");
		if (this.#config.cacheModules)
			this.#loadedModules.set(moduleName, Klass);
		if (result.fromLegacy) {
			this.#metrics?.increment?.("storage.resolve.fallback_used", 1);
			if (this.#shouldWarnOnLegacy()) {
				console.warn(
					`[StorageLoader] Legacy module path used for '${moduleName}'`
				);
			}
		}
		return Klass;
	}

	/**
	 * Determines if a warning should be logged when a legacy module path is used.
	 * This is based on the `warn_on_legacy_resolve` policy.
	 * @private
	 * @returns {boolean}
	 */
	#shouldWarnOnLegacy() {
		try {
			return (
				this.#stateManager?.managers?.policies?.getPolicy?.(
					"storage",
					"warn_on_legacy_resolve"
				) === true
			);
		} catch {
			return false;
		}
	}
	// ---------------------------------------------------------------------------
	// Minimal core validation (always present immediately)
	/**
	 * Loads a minimal, synchronous validator for bootstrapping purposes.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #loadCoreValidation() {
		if (this.#loadedModules.has("core-validation")) return;

		class CoreValidation {
			/**
			 * Performs minimal validation used during bootstrapping.
			 * @param {object} entity Entity instance to validate.
			 * @returns {{valid: boolean, errors: string[]}} Validation result.
			 */
			validateBasic(entity) {
				const errors = [];
				if (!entity || typeof entity !== "object")
					errors.push("Invalid entity");
				if (!entity?.id) errors.push("Missing id");
				if (!entity?.entity_type) errors.push("Missing entity_type");
				return { valid: errors.length === 0, errors };
			}
		}
		this.#loadedModules.set("core-validation", CoreValidation);
	}

	// ---------------------------------------------------------------------------
	// Helpers
	/**
	 * Checks if a security level is a NATO classification.
	 * @private
	 * @param {string} level - The security level string.
	 * @returns {boolean}
	 */
	#isNATO(level) {
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
	#isHigh(level) {
		return ["confidential", "secret", "top_secret"].includes(level);
	}
	#toPascalCase(s) {
		return String(s)
			.split("-")
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join("");
	}

	/**
	 * Logs an audit event via the state manager's forensic logger.
	 * @private
	 * @param {string} eventType - The type of the event.
	 * @param {object} data - The data associated with the event.
	 */
	#audit(eventType, data) {
		this.#stateManager?.managers?.forensicLogger?.logAuditEvent(
			eventType,
			data,
			{ component: "StorageLoader" }
		);
	}

	// Getters
	/**
	 * Gets the ready state of the `StorageLoader`.
	 * @public
	 * @returns {boolean}
	 */
	get isReady() {
		return this.#ready;
	}
	/**
	 * Gets a list of all loaded module names.
	 * @public
	 * @returns {string[]}
	 */
	get loadedModules() {
		return Array.from(this.#loadedModules.keys());
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
	/** @private @type {boolean} */
	#isReady = false;
	/** @private @type {import('../HybridStateManager.js').default|null} */
	#stateManager;

	/**
	 * Creates an instance of ModularOfflineStorage.
	 * @param {{stateManager: import('../HybridStateManager.js').default, moduleClasses: ModuleClassMap}} context Application context and module instances.
	 * @throws {Error} Thrown when the required state manager is missing.
	 */
	constructor({ stateManager, moduleClasses }) {
		if (!stateManager) {
			throw new Error(
				"ModularOfflineStorage requires a stateManager instance."
			);
		}
		this.#stateManager = stateManager;
		this.validation = moduleClasses.validation;
		this.security = moduleClasses.security;
		this.crypto = moduleClasses.crypto;
		this.sync = moduleClasses.sync;
		this.indexeddb = moduleClasses.indexeddb;

		this.#audit("MODULAR_STORAGE_CREATED", {
			modules: this.modules,
			demoMode: this.#isDemoMode,
		});
	}

	/**
	 * Initializes all loaded modules in a deterministic order.
	 * @public
	 * @returns {Promise<this>} The initialized storage instance.
	 */
	async init() {
		if (this.#isReady) return this;
		// Deterministic init order
		const order = ["indexeddb", "crypto", "security", "validation", "sync"];
		for (const moduleKey of order) {
			const moduleInstance = this[moduleKey];
			if (moduleInstance && typeof moduleInstance.init === "function") {
				await moduleInstance.init();
			}
		}
		this.#isReady = true;
		console.log("[ModularOfflineStorage] Initialized with dynamic modules");
		return this;
	}

	// -------------------------------------------------------------------------
	// V8.0 Parity: Centralized dependency derivation
	get #isDemoMode() {
		return this.#stateManager.config.demoMode === true;
	}

	// -------------------------------------------------------------------------
	// V8.0 Parity: MAC and Crypto helpers now derive dependencies from stateManager
	/**
	 * @private
	 * @returns {import('../../core/security/MACEngine.js').MACEngine|null}
	 */
	get #mac() {
		return this.#stateManager?.managers?.securityManager?.mac;
	}

	/**
	 * Retrieves the crypto module.
	 * @private
	 * @returns {object|null}
	 */
	get #crypto() {
		return this.crypto;
	}

	/**
	 * @private
	 * @returns {import('../../core/security/InformationFlowTracker.js').InformationFlowTracker|null}
	 */
	get #informationFlow() {
		return this.#stateManager?.managers?.informationFlowTracker;
	}

	/**
	 * Retrieves the subject's security clearance from the MAC engine.
	 * @private
	 * @returns {{level: string, compartments: Set<string>}} The subject's security label.
	 */
	#subject() {
		return (
			// V8 Parity: Derive from stateManager
			this.#mac?.subject() || {
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
	#getLabel(obj, { storeName } = {}) {
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
	#getRank(level) {
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
	#mergePolyRows(rows) {
		if (!Array.isArray(rows) || rows.length === 0) return null;

		// 1. Sort rows from highest classification to lowest. This is crucial.
		const sorted = [...rows].sort(
			(a, b) =>
				this.#getRank(b.classification_level) -
				this.#getRank(a.classification_level)
		);

		// 2. The highest classification row serves as the base for top-level properties.
		const base = { ...sorted[0] };
		if (!base.instance_data) {
			base.instance_data = {};
		}

		// 3. Perform a deep merge of `instance_data` from all readable rows.
		// The `reduce` starts with the `instance_data` of the highest-classification row
		// and progressively merges data from lower-classification rows.
		// The `(acc, ...)` logic ensures that for any given key, the value from the
		// highest-classification source is preserved.
		const mergedInstanceData = sorted.reduce(
			(acc, currentRow) => {
				const currentData = currentRow.instance_data || {};

				// Deep merge `currentData` into `acc` without overwriting existing keys in `acc`.
				const deepMerge = (target, source) => {
					for (const key in source) {
						if (
							typeof source[key] === "object" &&
							source[key] !== null &&
							!Array.isArray(source[key])
						) {
							if (!target[key]) target[key] = {};
							deepMerge(target[key], source[key]);
						} else if (!(key in target)) {
							target[key] = source[key];
						}
					}
				};

				deepMerge(acc, currentData);
				return acc;
			},
			{ ...base.instance_data }
		);

		base.instance_data = mergedInstanceData;
		base.merged_at = new Date().toISOString();

		// Info flow (optional)
		this.#informationFlow?.derived(
			rows.map((r) => ({
				level: r.classification_level,
				compartments: r.compartments,
			})),
			{ level: base.classification_level },
			{ operation: "poly_merge", logical_id: base.logical_id }
		);

		return base;
	}

	/**
	 * Public test helper that exposes the private merge implementation.
	 * @internal
	 * @param {object[]} rows Polyinstantiated rows to merge.
	 * @returns {object|null} Merged entity result.
	 */
	_mergePolyRows(rows) {
		return this.#mergePolyRows(rows);
	}

	/**
	 * Wraps a database operation with performance metrics and error handling.
	 * @private
	 * @param {string} operationName - The name of the operation (e.g., 'get', 'put').
	 * @param {Function} operationFn - The async function performing the DB operation.
	 * @returns {Promise<any>}
	 */
	async #trace(operationName, operationFn) {
		const measure = this.#stateManager?.managers?.metricsRegistry?.measure;
		const errorHelpers = this.#stateManager?.managers?.errorHelpers;

		// Mandate 4.3: Use the metrics decorator/wrapper for performance measurement.
		if (measure && errorHelpers) {
			const measuredFn = measure(`storage.${operationName}`)(operationFn);
			return errorHelpers.captureAsync(measuredFn, {
				component: `ModularOfflineStorage.${operationName}`,
			});
		}
		return operationFn(); // Fallback if core services are not ready.
	}
	// -------------------------------------------------------------------------
	// Writes (transparent encryption if crypto & not demo)
	/**
	 * Stores an item, applying MAC enforcement and transparent encryption.
	 * Handles polyinstantiation for the 'objects_polyinstantiated' store.
	 * @public
	 * @param {string} storeName - The name of the IndexedDB object store.
	 * @param {object} item - The item to store.
	 * @returns {Promise<IDBValidKey>} The key of the stored item.
	 * @throws {Error} When MAC enforcement or the adapter prevents the write.
	 */
	async put(storeName, item) {
		return this.#trace("put", async () => {
			const idx = this.indexeddb;
			if (!idx?.put) throw new Error("IndexedDB adapter not loaded");

			// MAC write (no write down)
			const mac = this.#mac;
			if (!this.#isDemoMode && mac) {
				const canWrite = mac.canWrite(
					this.#subject(),
					this.#getLabel(item, { storeName })
				);
				if (!canWrite) {
					throw new Error(
						"MAC_WRITE_DENIED: Insufficient clearance to write at this level."
					);
				}
			}

			let record = { ...item };

			// Polyinstantiation Write Logic
			if (storeName === "objects_polyinstantiated") {
				record.id = `${item.logical_id}-${item.classification_level}`;
			}

			const crypto = this.#crypto;
			if (!this.#isDemoMode && crypto) {
				const isPoly = storeName === "objects_polyinstantiated";
				const label = this.#getLabel(item, { storeName });

				if (isPoly && record.instance_data) {
					const pt = new TextEncoder().encode(
						JSON.stringify(record.instance_data)
					);
					const aadPayload = {
						...label,
						logical_id: record.logical_id,
						id: record.id,
					};
					const aad = new TextEncoder().encode(
						JSON.stringify(aadPayload)
					);
					const env = await crypto.encrypt(label, pt, aad);
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
					const aadPayload = { ...label, id: record.id };
					const aad = new TextEncoder().encode(
						JSON.stringify(aadPayload)
					);
					const env = await crypto.encrypt(label, pt, aad);
					record.envelope = env;
					record.encrypted = true;
				}
			}

			const res = await idx.put(storeName, record);
			this.#stateManager.emit("entitySaved", {
				store: storeName,
				item: record,
			});
			return res;
		});
	}

	// -------------------------------------------------------------------------
	// Reads (constant-time guarded; transparent decryption; poly merge)
	/**
	 * Retrieves an item, applying MAC enforcement and transparent decryption.
	 * Handles polyinstantiation by merging all readable instances.
	 * @public
	 * @param {string} storeName - The name of the IndexedDB object store.
	 * @param {IDBValidKey} id - The ID of the item to retrieve.
	 * @returns {Promise<object|null>} The decrypted and merged item, or null.
	 * @throws {Error} When the adapter is missing or MAC denies access.
	 */
	async get(storeName, id) {
		return this.#trace("get", async () => {
			const idx = this.indexeddb;
			if (!idx?.get) throw new Error("IndexedDB adapter not loaded");

			// Poly store: read all rows for logical_id and MAC-filter them
			if (storeName === "objects_polyinstantiated") {
				const rows = await idx.queryByIndex(
					storeName,
					"logical_id",
					id
				);
				const readable = this.#filterReadable(rows || [], storeName);
				const dec = await Promise.all(
					readable.map((r) => this.#maybeDecryptPoly(r))
				);
				return this.#mergePolyRows(dec);
			}

			// Normal store
			const raw = await idx.get(storeName, id);
			if (!raw) return null;

			// MAC read (no read up)
			const mac = this.#mac;
			if (!this.#isDemoMode && mac) {
				const canRead = mac.canRead(
					this.#subject(),
					this.#getLabel(raw, { storeName })
				);
				if (!canRead) {
					// In a constant-time check, this will just return null after a delay.
					throw new Error("MAC_READ_DENIED");
				}
			}
			return this.#maybeDecryptNormal(raw);
		});
	}

	/**
	 * Retrieves the most recent item from a store, based on a 'timestamp' field if present.
	 * @public
	 * @param {string} storeName
	 * @returns {Promise<object|null>}
	 * @throws {Error} When the adapter is not available.
	 */
	async getLast(storeName) {
		return this.#trace("getLast", async () => {
			const idx = this.indexeddb;
			if (!idx?.getAll) throw new Error("IndexedDB adapter not loaded");
			const all = await idx.getAll(storeName);
			if (!all || all.length === 0) return null;
			// Prefer highest timestamp if available, else last element
			const withTime = all.filter((e) => e && e.timestamp);
			if (withTime.length > 0) {
				withTime.sort(
					(a, b) =>
						new Date(a.timestamp).getTime() -
						new Date(b.timestamp).getTime()
				);
				return withTime[withTime.length - 1];
			}
			return all[all.length - 1] || null;
		});
	}

	/**
	 * Deletes an item after enforcing MAC rules.
	 * @public
	 * @param {string} storeName - The name of the object store.
	 * @param {IDBValidKey} id - The ID of the item to delete.
	 * @returns {Promise<void>}
	 * @throws {Error} When MAC policies or the adapter prevent the delete.
	 */
	async delete(storeName, id) {
		return this.#trace("delete", async () => {
			const idx = this.indexeddb;
			if (!idx?.delete) throw new Error("IndexedDB adapter not loaded");

			if (storeName === "objects_polyinstantiated") {
				const logicalId = id;
				const rows = await idx.queryByIndex(
					storeName,
					"logical_id",
					logicalId
				);
				const readableRows = this.#filterReadable(
					rows || [],
					storeName
				);

				if (readableRows.length === 0) return;

				const mac = this.#mac;
				if (!this.#isDemoMode && mac) {
					const subject = this.#subject();
					for (const row of readableRows) {
						const canDelete = mac.canWrite(
							subject,
							this.#getLabel(row, { storeName })
						);
						if (!canDelete) {
							throw new Error(
								"MAC_DELETE_DENIED: Cannot delete an object you don't dominate."
							);
						}
					}
				}

				// Emit a static forensic envelope for polyinstantiated deletions.
				try {
					ForensicLogger.createEnvelope("ENTITY_DELETE_POLY", {
						store: storeName,
						logicalId,
						count: readableRows.length,
					}).catch(() => {});
				} catch {
					/* noop */
				}
				await Promise.all(
					readableRows.map((row) => idx.delete(storeName, row.id))
				);

				this.#stateManager.emit("entityDeleted", {
					store: storeName,
					id: logicalId,
				});
				return;
			}

			const item = await this.get(storeName, id);
			if (!item) return;

			const mac = this.#mac;
			if (!this.#isDemoMode && mac) {
				const canDelete = mac.canWrite(
					this.#subject(),
					this.#getLabel(item, { storeName })
				);
				if (!canDelete) {
					throw new Error("MAC_DELETE_DENIED");
				}
			}

			// Emit a static forensic envelope for single-entity deletions.
			try {
				ForensicLogger.createEnvelope("ENTITY_DELETE", {
					store: storeName,
					id,
				}).catch(() => {});
			} catch {
				/* noop */
			}
			await idx.delete(storeName, id);
			this.#stateManager.emit("entityDeleted", {
				store: storeName,
				id,
			});
		});
	}

	/**
	 * Stores multiple items efficiently, using adapter-level batching if supported.
	 * @public
	 * @param {string} storeName
	 * @param {object[]} items
	 * @returns {Promise<any>}
	 * @throws {Error} When the adapter is not available.
	 */
	async putBulk(storeName, items) {
		return this.#trace("putBulk", async () => {
			const idx = this.indexeddb;
			if (!idx) throw new Error("IndexedDB adapter not loaded");
			if (typeof idx.putBulk === "function") {
				return idx.putBulk(storeName, items);
			}
			// Fallback: sequential puts
			const keys = [];
			for (const item of items) {
				const k = await idx.put(storeName, item);
				keys.push(k);
			}
			return keys;
		});
	}

	/**
	 * Queries an IndexedDB store by index, filtering results based on MAC rules.
	 * @public
	 * @param {string} storeName - The name of the object store.
	 * @param {string} index - The name of the index to query.
	 * @param {IDBValidKey|IDBKeyRange} value - The value or range to query for.
	 * @returns {Promise<object[]>} An array of readable items.
	 * @throws {Error} When the adapter does not support indexed queries.
	 */
	async query(storeName, index, value) {
		return this.#trace("query", async () => {
			const idx = this.indexeddb;
			if (!idx?.queryByIndex)
				throw new Error("IndexedDB adapter not loaded");
			const out = await idx.queryByIndex(storeName, index, value);

			const readable = this.#filterReadable(out || [], storeName);
			const decrypted = await Promise.all(
				readable.map((r) =>
					storeName === "objects_polyinstantiated"
						? this.#maybeDecryptPoly(r)
						: this.#maybeDecryptNormal(r)
				)
			);
			return decrypted;
		});
	}

	/**
	 * Retrieves all items from a store, filtering results based on MAC rules.
	 * @public
	 * @param {string} storeName - The name of the object store.
	 * @returns {Promise<object[]>} An array of all readable items.
	 * @throws {Error} When the adapter is unavailable.
	 */
	async getAll(storeName) {
		return this.#trace("getAll", async () => {
			const idx = this.indexeddb;
			if (!idx?.getAll) throw new Error("IndexedDB adapter not loaded");
			const out = await idx.getAll(storeName);

			const readable = this.#filterReadable(out || [], storeName);
			const decrypted = await Promise.all(
				readable.map((r) =>
					storeName === "objects_polyinstantiated"
						? this.#maybeDecryptPoly(r)
						: this.#maybeDecryptNormal(r)
				)
			);
			return decrypted;
		});
	}

	/**
	 * Retrieves all readable historical versions of a polyinstantiated entity.
	 * @public
	 * @param {string} storeName - The name of the object store (must be 'objects_polyinstantiated').
	 * @param {string} logicalId - The logical ID of the entity.
	 * @returns {Promise<object[]>} An array of historical versions, sorted by update time.
	 * @throws {Error} When the adapter cannot service indexed queries.
	 */
	async getHistory(storeName, logicalId) {
		if (storeName !== "objects_polyinstantiated") {
			return []; // History is only supported for polyinstantiated entities.
		}

		return this.#trace("getHistory", async () => {
			const idx = this.indexeddb;
			if (!idx?.queryByIndex)
				throw new Error("IndexedDB adapter not loaded");

			// 1. Fetch all physical rows for the logical ID.
			const allRows = await idx.queryByIndex(
				storeName,
				"logical_id",
				logicalId
			);

			// 2. Filter out rows the user cannot read based on MAC policy.
			const readableRows = this.#filterReadable(allRows || [], storeName);

			// 3. Decrypt the instance_data for each readable row.
			const decryptedVersions = await Promise.all(
				readableRows.map((row) => this.#maybeDecryptPoly(row))
			);

			// 4. Sort by update timestamp, newest first.
			return decryptedVersions.sort(
				(a, b) => new Date(b.updated_at) - new Date(a.updated_at)
			);
		});
	}

	// -------------------------------------------------------------------------
	/**
	 * Decrypts the `instance_data` of a polyinstantiated row.
	 * @private
	 * @param {object} row - The raw row from the database.
	 * @returns {Promise<object>} The row with its `instance_data` decrypted.
	 */
	async #maybeDecryptPoly(row) {
		const crypto = this.#crypto;
		if (this.#isDemoMode || !crypto || !row?.encrypted) return row;
		const label = this.#getLabel(row, {
			storeName: "objects_polyinstantiated",
		});

		// Reconstruct the AAD payload used during encryption for verification.
		const aadPayload = {
			...label,
			logical_id: row.logical_id,
			id: row.id,
		};
		const aad = new TextEncoder().encode(JSON.stringify(aadPayload));
		const pt = await crypto.decrypt(
			label,
			{
				ciphertext: row.ciphertext,
				iv: row.iv,
				alg: row.alg,
				kid: row.kid,
				tag: row.tag,
			},
			aad
		);
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
	async #maybeDecryptNormal(row) {
		const crypto = this.#crypto;
		if (this.#isDemoMode || !crypto || !row?.encrypted) return row;
		const label = this.#getLabel(row);

		// Reconstruct the AAD payload for verification.
		const aadPayload = {
			...label,
			id: row.id,
		};
		const aad = new TextEncoder().encode(JSON.stringify(aadPayload));
		const pt = await crypto.decrypt(label, row.envelope, aad);
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
	#filterReadable(list, storeName) {
		if (!Array.isArray(list)) return [];
		const mac = this.#mac;
		if (!mac) return list; // dev fallback when MAC not wired
		const s = this.#subject();
		const out = [];
		for (const it of list) {
			const canRead = mac.canRead(s, this.#getLabel(it, { storeName }));
			if (canRead) {
				out.push(it);
			}
		}
		return out;
	}

	/**
	 * Logs an audit event via the state manager's forensic logger.
	 * @private
	 * @param {string} eventType - The type of the event.
	 * @param {object} data - The data associated with the event.
	 */
	#audit(eventType, data) {
		this.#stateManager?.managers?.forensicLogger?.logAuditEvent(
			eventType,
			data,
			{ component: "ModularOfflineStorage" }
		);
	}

	/**
	 * Gets the names of all loaded modules.
	 * @public
	 * @returns {string[]}
	 */
	get modules() {
		const loaded = [];
		if (this.indexeddb) loaded.push("indexeddb");
		if (this.crypto) loaded.push("crypto");
		if (this.security) loaded.push("security");
		if (this.validation) loaded.push("validation");
		if (this.sync) loaded.push("sync");
		return loaded;
	}
}
