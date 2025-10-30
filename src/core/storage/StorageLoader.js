// ============================================================================
// StorageLoader.js
// Dynamic module system + transparent cryptographic I/O by classification
// Demo-mode aware, MAC-aware, event-safe
// ============================================================================

import { ClassificationCrypto } from "@core/security/ClassificationCrypto.js";
import { getCryptoDomain } from "@core/security/CryptoDomain.js";
import { InMemoryKeyring } from "@core/security/Keyring.js";
import { constantTimeCheck } from "../security/ct.js";

export class StorageLoader {
	#loadedModules = new Map();
	#config;
	#mac = null;
	#ready = false;

	constructor(options = {}) {
		// Default to secure-by-default: if demoMode is undefined, encryption is ON.
		this.#config = {
			baseURL: options.baseURL ?? "/modules/",
			cacheModules: options.cacheModules !== false,
			preloadModules: options.preloadModules ?? [],
			demoMode: options.demoMode ?? false, // set true only if explicitly in AppConfig
			mac: options.mac ?? null,
			...options,
		};
		this.#mac = this.#config.mac;

		console.log(
			`[StorageLoader] Initialized with demoMode: ${this.#config.demoMode}`
		);

		// Crypto router (keyring can be swapped later to a KMS/HSM-backed one)
		this.crypto = new ClassificationCrypto({
			keyring: new InMemoryKeyring(),
		});
	}

	async init() {
		if (this.#ready) return this;
		await this.#loadCoreValidation();

		// Optional preloads (e.g., "demo-crypto" in demo mode)
		for (const m of this.#config.preloadModules) {
			try {
				await this.#loadModule(m);
			} catch (e) {
				console.warn(`[StorageLoader] Preload failed for ${m}:`, e);
			}
		}

		this.#ready = true;
		console.log("[StorageLoader] Ready with dynamic module loading");
		return this;
	}

	async createStorage(authContext = {}, options = {}) {
		if (!this.#ready) await this.init();

		const requirements = await this.#analyzeRequirements(
			authContext,
			options
		);
		const modules = await this.#loadRequiredModules(requirements);

		const storage = new ModularOfflineStorage(modules, {
			demoMode: this.#config.demoMode,
			mac: this.#mac,
			crypto: this.crypto,
		});

		await storage.init();
		return storage;
	}

	// --------------------------------------------------------------------------
	// Requirements analysis (keeps your existing logic; honors demoMode)
	// --------------------------------------------------------------------------
	async #analyzeRequirements(authContext, options) {
		// Demo mode forces tiny stack
		if (this.#config.demoMode) {
			return {
				core: ["validation-stack"],
				security: ["basic-security"],
				crypto: ["demo-crypto"],
				sync: [],
			};
		}

		const req = {
			core: ["validation-stack"],
			security: [],
			crypto: [],
			sync: [],
		};

		// Security/crypto selection
		if (options.securityEnabled === false) {
			console.log("[StorageLoader] Security modules disabled by config.");
		} else {
			const clearanceLevel = (
				authContext.clearanceLevel || "internal"
			).toLowerCase();

			if (this.#isNATOClassification(clearanceLevel)) {
				req.security.push("nato-security", "compartment-security");
				req.crypto.push("zero-knowledge-crypto", "key-rotation");
			} else if (this.#isHighSecurity(clearanceLevel)) {
				req.security.push("enterprise-security");
				req.crypto.push("aes-crypto", "key-rotation");
			} else {
				req.security.push("basic-security");
				req.crypto.push("basic-crypto");
			}
		}

		// Sync modules, only if explicitly enabled
		if (options.enableSync === true) {
			req.sync.push("conflict-resolution");
			if (options.realtimeSync) req.sync.push("realtime-sync");
		}

		// Strict/custom validation
		if (options.strictValidation) req.core.push("strict-validator");
		if (options.customValidators?.length > 0)
			req.core.push("custom-validator");

		return req;
	}

	// --------------------------------------------------------------------------
	// Dynamic loading stacks
	// --------------------------------------------------------------------------
	async #loadRequiredModules(requirements) {
		const modules = {
			validation: null,
			security: null,
			crypto: null,
			sync: null,
			indexeddb: null,
		};

		modules.validation = await this.#loadValidationStack(requirements.core);
		modules.security = await this.#loadSecurityStack(requirements.security);
		modules.crypto = await this.#loadCryptoStack(requirements.crypto);

		if (requirements.sync.length > 0) {
			modules.sync = await this.#loadSyncStack(requirements.sync);
		}

		modules.indexeddb = await this.#loadModule("indexeddb-adapter");
		return modules;
	}

	async #loadValidationStack(requirements) {
		const ValidationStack = await this.#loadModule("validation-stack");
		const validators = [];

		for (const r of requirements) {
			if (r === "strict-validator")
				validators.push(await this.#loadModule("strict-validator"));
			if (r === "custom-validator")
				validators.push(await this.#loadModule("custom-validator"));
		}
		return new ValidationStack(validators);
	}

	async #loadSecurityStack(requirements) {
		let SecurityClass = null;
		const securityModules = [];

		for (const r of requirements) {
			switch (r) {
				case "nato-security":
					SecurityClass = await this.#loadModule("nato-security");
					break;
				case "compartment-security":
					securityModules.push(
						await this.#loadModule("compartment-security")
					);
					break;
				case "enterprise-security":
					SecurityClass = await this.#loadModule(
						"enterprise-security"
					);
					break;
				case "basic-security":
					SecurityClass = await this.#loadModule("basic-security");
					break;
			}
		}
		return SecurityClass ? new SecurityClass(securityModules) : null;
	}

	async #loadCryptoStack(requirements) {
		let CryptoClass = null;
		const cryptoModules = [];

		for (const r of requirements) {
			switch (r) {
				case "zero-knowledge-crypto":
					CryptoClass = await this.#loadModule(
						"zero-knowledge-crypto"
					);
					break;
				case "key-rotation":
					cryptoModules.push(await this.#loadModule("key-rotation"));
					break;
				case "aes-crypto":
					CryptoClass = await this.#loadModule("aes-crypto");
					break;
				case "basic-crypto":
					CryptoClass = await this.#loadModule("basic-crypto");
					break;
				case "demo-crypto":
					CryptoClass = await this.#loadModule("demo-crypto");
					break;
			}
		}
		return CryptoClass ? new CryptoClass(cryptoModules) : null;
	}

	async #loadSyncStack(requirements) {
		const SyncStack = await this.#loadModule("sync-stack");
		const syncModules = [];
		for (const r of requirements) {
			syncModules.push(await this.#loadModule(r));
		}
		return new SyncStack(syncModules);
	}

	// Single module loader with cache
	async #loadModule(moduleName) {
		if (this.#loadedModules.has(moduleName)) {
			return this.#loadedModules.get(moduleName);
		}

		console.log(`[StorageLoader] Loading module: ${moduleName}`);
		const moduleURL = `${this.#config.baseURL}${moduleName}.js`;
		const mod = await import(/* @vite-ignore */ moduleURL);
		const ModuleClass = mod.default || mod[this.#toPascalCase(moduleName)];

		if (this.#config.cacheModules)
			this.#loadedModules.set(moduleName, ModuleClass);
		return ModuleClass;
	}

	async #loadCoreValidation() {
		if (!this.#loadedModules.has("core-validation")) {
			// Minimal instant validator for bootstrapping
			class CoreValidation {
				validateBasic(entity) {
					const errors = [];
					if (!entity?.id) errors.push("Missing ID");
					if (!entity?.entity_type)
						errors.push("Missing entity_type");
					return { valid: errors.length === 0, errors };
				}
			}
			this.#loadedModules.set("core-validation", CoreValidation);
		}
	}

	// --------------------------------------------------------------------------
	// Helpers
	// --------------------------------------------------------------------------
	#isNATOClassification(level) {
		const nato = [
			"nato_restricted",
			"nato_confidential",
			"nato_secret",
			"cosmic_top_secret",
		];
		return nato.includes(level);
	}
	#isHighSecurity(level) {
		const high = ["confidential", "secret", "top_secret"];
		return high.includes(level);
	}
	#toPascalCase(str) {
		return String(str)
			.split("-")
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join("");
	}

	get isReady() {
		return this.#ready;
	}
	get loadedModules() {
		return Array.from(this.#loadedModules.keys());
	}
}

// ============================================================================
// ModularOfflineStorage
// Holds instantiated modules (indexeddb, security, validation, crypto, sync)
// Adds MAC enforcement + transparent encryption/decryption in put/get.
// ============================================================================
class ModularOfflineStorage {
	#modules;
	#ready = false;
	#mac = null;
	#crypto = null;
	#demoMode = false;

	stateManager = null;

	constructor(moduleClasses, config) {
		this.#mac = config.mac || null;
		this.#crypto = config.crypto || null;
		this.#demoMode = Boolean(config.demoMode);

		// Instantiate modules (support classes or instances)
		this.#modules = {};
		for (const type in moduleClasses) {
			const Cls = moduleClasses[type];
			if (!Cls) continue;

			if (type === "indexeddb") {
				// ✅ Pass the actual dbName/version/stores only
				this.#modules[type] = new Cls(config.indexeddb || {});
			} else {
				this.#modules[type] =
					typeof Cls === "function" ? new Cls(config) : Cls;
			}
		}
	}

	async init() {
		if (this.#ready) return this;

		const order = ["indexeddb", "crypto", "security", "validation", "sync"];
		for (const t of order) {
			const m = this.#modules[t];
			if (m && typeof m.init === "function") {
				await m.init();
			}
		}
		this.#ready = true;
		console.log("[ModularOfflineStorage] Initialized with dynamic modules");
		return this;
	}

	bindStateManager(manager) {
		this.stateManager = manager;
		for (const m of Object.values(this.#modules)) {
			if (typeof m?.bindStateManager === "function")
				m.bindStateManager(manager);
		}
	}

	// --------------------------------------------------------------------------
	// MAC helpers
	// --------------------------------------------------------------------------
	#subject() {
		return (
			this.#mac?.subject?.() || {
				level: "unclassified",
				compartments: new Set(),
			}
		);
	}
	#label(obj, { storeName } = {}) {
		if (!obj) return { level: "unclassified", compartments: new Set() };
		// Poly store rows carry classification in `classification_level`
		const isPoly =
			storeName === "objects_polyinstantiated" ||
			Object.prototype.hasOwnProperty.call(obj, "classification_level");
		const level = isPoly
			? (obj.classification_level ?? obj.classification ?? "unclassified")
			: (obj.classification ?? "unclassified");
		const compartments = new Set(obj.compartments || []);
		return { level, compartments };
	}

	#compareClassifications(classificationA, classificationB) {
		const classifications = [
			"unclassified",
			"public",
			"internal",
			"restricted",
			"confidential",
			"secret",
			"top_secret",
			"nato_restricted",
			"nato_confidential",
			"nato_secret",
			"cosmic_top_secret",
		];
		const indexA = classifications.indexOf(classificationA.toLowerCase());
		const indexB = classifications.indexOf(classificationB.toLowerCase());
		return indexA - indexB;
	}

	// --------------------------------------------------------------------------
	// Polyinstantiation helpers
	// --------------------------------------------------------------------------
	#mergePolyinstantiatedEntities(entities = []) {
		if (!entities || entities.length === 0) return null;

		// Sort entities by classification level (lowest → highest)
		const sortedEntities = [...entities].sort((a, b) =>
			this.#compareClassifications(
				a.classification_level,
				b.classification_level
			)
		);

		let mergedEntity = {};
		let highestClassification = "unclassified";
		const lineage = [];

		for (const entity of sortedEntities) {
			const instanceData = entity.instance_data || {};

			// Merge instance_data first (lower classifications first)
			mergedEntity = { ...mergedEntity, ...instanceData };

			// Then overlay top-level fields, preferring higher classifications
			for (const key of Object.keys(entity)) {
				if (key !== "instance_data" && entity[key] !== undefined) {
					mergedEntity[key] = entity[key];
				}
			}

			// Track highest classification encountered
			if (
				this.#compareClassifications(
					entity.classification_level,
					highestClassification
				) > 0
			) {
				highestClassification = entity.classification_level;
			}

			lineage.push({
				classification_level: entity.classification_level,
				timestamp: entity.updated_at ?? new Date().toISOString(),
			});
		}

		// Attach metadata for audit
		mergedEntity._meta = {
			lineage,
			highest_classification: highestClassification,
			merged_at: new Date().toISOString(),
		};

		// Emit information flow event for audit
		this.stateManager?.informationFlow?.derived(
			entities.map((e) => ({
				level: e.classification_level,
				compartments: e.compartments,
			})),
			{ level: highestClassification },
			{ operation: "poly_merge", logical_id: mergedEntity.logical_id }
		);

		return mergedEntity;
	}

	// --------------------------------------------------------------------------
	// Transparent encrypted writes
	// --------------------------------------------------------------------------
	async put(storeName, item) {
		if (!this.#modules.indexeddb?.put) {
			throw new Error("IndexedDB adapter not loaded");
		}

		// Enforce Bell–LaPadula "no write down"
		if (this.#mac) {
			this.#mac.enforceNoWriteDown(
				this.#subject(),
				this.#label(item, {
					storeName,
				}),
				{
					storeName,
				}
			);
		}

		let record = { ...item };

		// Handle polyinstantiation for the 'objects_polyinstantiated' store
		if (storeName === "objects_polyinstantiated" && item.logical_id) {
			const existingEntities = await this.#modules.indexeddb.queryByIndex(
				storeName,
				"logical_id",
				item.logical_id
			);

			const hasHigherClassification = existingEntities.some(
				(existing) =>
					this.#compareClassifications(
						existing.classification_level,
						item.classification_level
					) > 0
			);

			// The "no write down" rule is implicitly handled here.
			// If a user with a low clearance tries to write, they won't see the higher-classified
			// data, so `hasHigherClassification` will be false, and they will overwrite the
			// lower-classified data they *can* see. This is the correct behavior for polyinstantiation.
			if (hasHigherClassification) {
				console.log(
					`[Storage] Polyinstantiating: Creating new row for ${item.logical_id} at level ${item.classification_level} due to existing higher-level data.`
				);
			} else {
				console.log(
					`[Storage] Upserting polyinstantiated row for ${item.logical_id} at level ${item.classification_level}.`
				);
			}

			// The ID for the DB record is a composite of logical_id and classification_level
			const recordId = `${item.logical_id}-${item.classification_level}`;
			const instanceData = { ...item };
			delete instanceData.id; // Avoid storing the composite ID inside the instance data

			record = {
				id: recordId,
				logical_id: item.logical_id,
				classification_level: item.classification_level,
				instance_data: instanceData,
				created_at: item.created_at || new Date().toISOString(),
				updated_at: new Date().toISOString(),
			};
		}

		// Encrypt when not in demo mode
		if (!this.#demoMode && this.#crypto) {
			const label = this.#label(record, { storeName });
			let envelope;

			if (storeName === "objects_polyinstantiated") {
				const plaintext = new TextEncoder().encode(
					JSON.stringify(record.instance_data ?? {})
				);
				envelope = await this.#crypto.encrypt(label, plaintext);
				delete record.instance_data;
			} else {
				const plaintext = new TextEncoder().encode(
					JSON.stringify(record)
				);
				envelope = await this.#crypto.encrypt(label, plaintext);
			}

			record = {
				...record,
				encrypted: true,
				envelope,
			};

			console.log(
				`[Storage] Encryption applied for domain: ${getCryptoDomain(label)}`
			);
		}

		const res = await this.#modules.indexeddb.put(storeName, record);
		this.stateManager?.emit?.("entitySaved", {
			store: storeName,
			item: record,
		});
		return res;
	}

	// --------------------------------------------------------------------------
	// Transparent decrypted reads
	// --------------------------------------------------------------------------
	async get(storeName, id) {
		return constantTimeCheck(async () => {
			if (!this.#modules.indexeddb?.queryByIndex) {
				throw new Error(
					"IndexedDB adapter not loaded or queryByIndex not available"
				);
			}

			// For polyinstantiated stores, fetch all instances for the logical_id
			let rawEntities = [];
			if (storeName === "objects_polyinstantiated") {
				rawEntities = await this.#modules.indexeddb.queryByIndex(
					storeName,
					"logical_id",
					id
				);
			} else {
				const raw = await this.#modules.indexeddb.get(storeName, id);
				if (raw) rawEntities.push(raw);
			}

			if (rawEntities.length === 0) return null;

			const readableEntities = [];
			const subject = this.#subject();

			for (const raw of rawEntities) {
				// #filterReadable logic is inlined here for get()
				// Enforce No Read Up on the stored label
				if (this.#mac) {
					try {
						this.#mac.enforceNoReadUp(subject, this.#label(raw), {
							storeName,
						});
						readableEntities.push(raw); // Add if readable
					} catch {
						// Skip this entity if not readable
					}
				} else {
					readableEntities.push(raw); // No MAC, so all are readable
				}
			}

			if (readableEntities.length === 0) return null;

			// Decrypt and merge readable entities
			const decryptedEntities = await Promise.all(
				readableEntities.map(async (raw) => {
					if (!this.#demoMode && this.#crypto && raw.encrypted) {
						const label = this.#label(raw, { storeName });
						try {
							const plaintext = await this.#crypto.decrypt(
								label,
								raw.envelope
							);
							const obj = JSON.parse(
								new TextDecoder().decode(plaintext)
							);

							console.log(
								`[Storage] Decryption OK for domain: ${getCryptoDomain(
									label
								)}`
							);

							if (storeName === "objects_polyinstantiated") {
								return { ...raw, instance_data: obj };
							}
							return { ...raw, ...obj };
						} catch (e) {
							console.warn(
								`[Storage] Decryption failed for entity ${raw.id} with label ${label.level}:`,
								e
							);
							return null; // Decryption failed, treat as unreadable
						}
					}
					return raw;
				})
			);

			const validDecryptedEntities = decryptedEntities.filter(Boolean);
			if (validDecryptedEntities.length === 0) return null;

			// Merge polyinstantiated rows into a single logical entity, otherwise return the single entity.
			if (storeName === "objects_polyinstantiated") {
				return this.#mergePolyinstantiatedEntities(
					validDecryptedEntities
				);
			}
			return validDecryptedEntities[0];
		}, 100);
	}

	async delete(store, id) {
		// Prevent info leak: only delete if subject can read current row
		const item = await this.get(store, id);
		if (!item) return;

		if (!this.#modules.indexeddb?.delete) {
			throw new Error("IndexedDB adapter not loaded");
		}

		// Treat delete as write on the container → enforce no write down
		if (this.#mac) {
			this.#mac.enforceNoWriteDown(this.#subject(), this.#label(item));
		}

		const res = await this.#modules.indexeddb.delete(store, id);
		this.stateManager?.emit?.("entityDeleted", { store, id });
		return res;
	}

	async query(store, index, value) {
		const out = await this.#modules.indexeddb?.queryByIndex?.(
			store,
			index,
			value
		);
		return this.#filterReadable(out || [], store);
	}

	async getAll(store) {
		const raw = await this.#modules.indexeddb?.getAll?.(store);
		return this.#filterReadable(raw || [], store);
	}

	#filterReadable(list, storeName) {
		if (!Array.isArray(list)) return [];
		if (!this.#mac) return list; // dev fallback
		const subj = this.#subject();
		const filtered = [];
		for (const it of list) {
			try {
				this.#mac.enforceNoReadUp(
					subj,
					this.#label(it, {
						storeName,
					}),
					{
						storeName,
					}
				);
				filtered.push(it);
			} catch {
				/* skip */
			}
		}
		return filtered;
	}

	get modules() {
		return Object.keys(this.#modules);
	}
}

export default StorageLoader;
