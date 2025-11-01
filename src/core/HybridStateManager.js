/**
 * @file HybridStateManager.js
 * @description The central orchestrator for application state, providing access to all core services and managing the top-level state structure.
 * with a secure, dynamic, and persistent storage backend. It manages data, security,
 * and various subsystems like validation, auditing, and event processing.
 * @see {@link d:\Development Files\repositories\nodus\src\docs\feature_development_philosophy.md} for architectural principles.
 */

import { BoundedStack } from "@utils/BoundedStack.js";

import { ServiceRegistry } from "./ServiceRegistry.js";

/**
 * @class HybridStateManager
 * @classdesc The single source of truth for the application. It owns all state and provides access to all core services (managers)
 * via the `ServiceRegistry`. It combines a fast, in-memory client state with a robust, secure, and persistent offline storage layer.
 */
export class HybridStateManager {
	// V8.0 Parity: Mandate 3.1 & 3.5 - All internal properties MUST be private.
	/** @privateFields {#config, #clientState, #storage, #schema, #managers, #listeners, #unsubscribeFunctions, #serviceRegistry, #metricsRegistry, #signer, #initialized} */

	/** @private @type {object} */
	#config;
	/** @private @type {object} */
	#clientState;
	/** @private @type {object} */
	#storage;
	/** @private @type {object} */
	#schema;
	/** @private @type {object} */
	#managers;
	/** @private @type {Map<string, Function[]>} */
	#listeners;
	/**
	 * An array of functions to call to unsubscribe from events.
	 * @private @type {Function[]}
	 */
	#unsubscribeFunctions;
	/** @private @type {ServiceRegistry} */
	#serviceRegistry;
	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metricsRegistry = null;
	/** @private @type {import('./security/NonRepudiation.js').NonRepudiation|null} */
	#signer = null;
	/** @private @type {boolean} */
	#initialized = false;

	// --- History/undo-redo helpers for grid + generic operations ---
	/** @private @type {boolean} */
	#isApplyingHistory = false;
	/** @private @type {object|null} */
	#lastLayoutSnapshot = null;
	/** @private @type {number} */
	#txDepth = 0;
	/** @private @type {object|null} */
	#txBeforeSnapshot = null;
	/** @private @type {string[]} */
	#recentOps = [];

	// --- Public Getters for Controlled Access ---

	get config() {
		return this.#config;
	}
	get clientState() {
		return this.#clientState;
	}

	/**
	 * Records a user-visible operation for undo/redo history and analytics.
	 * For grid layout changes, stores before/after snapshots to enable rollback.
	 * @param {{type: string, data?: any}} op
	 */
		recordOperation(op) {
			try {
				if (!op || typeof op.type !== "string") return;
				// Do not record operations triggered by an active undo/redo apply
				if (this.#isApplyingHistory) return;
				// Collapse grid ops during an open transaction
				if (this.#txDepth > 0 && op.type === "grid_layout_change") return;

				// Track recent operation types for UI/inspector
				try {
					this.#recentOps.push(op.type);
					if (this.#recentOps.length > 20) this.#recentOps.shift();
				} catch { /* noop */ }

			if (op.type === "grid_layout_change") {
				const renderer = this.managers?.enhancedGridRenderer;
				const current = typeof renderer?.getCurrentLayout === "function" ? renderer.getCurrentLayout() : null;
				const after = current ? JSON.parse(JSON.stringify(current)) : null;
				const before = this.#lastLayoutSnapshot ? JSON.parse(JSON.stringify(this.#lastLayoutSnapshot)) : null;

				this.#clientState.undoStack.push({
					type: op.type,
					before,
					after,
					meta: { source: op.data || null },
				});
				// New operation invalidates redo history
				this.#clientState.redoStack.clear();
				// Update last snapshot for next diff
				this.#lastLayoutSnapshot = after;

				// Emit for observers (optional)
				this.emit("operationRecorded", { type: op.type });
				return;
			}

			// Generic operation: push minimal payload
			this.#clientState.undoStack.push({ type: op.type, data: op.data || null });
			this.#clientState.redoStack.clear();
			this.emit("operationRecorded", { type: op.type });
		} catch (err) {
			console.warn("[HybridStateManager] recordOperation failed:", err);
		}
	}

	/**
	 * Runs a function within a history transaction, collapsing multiple grid changes
	 * into a single undo/redo entry. If the function throws, reverts to the snapshot
	 * taken at the beginning and does not record an entry.
	 * @param {Function} fn
	 * @returns {any}
	 */
	transaction(fn) {
		if (typeof fn !== "function") return;
		const renderer = this.managers?.enhancedGridRenderer;
		this.#txDepth++;
		// Capture "before" on outermost entry
		if (this.#txDepth === 1 && renderer?.getCurrentLayout) {
			try {
				const cur = renderer.getCurrentLayout();
				this.#txBeforeSnapshot = cur ? JSON.parse(JSON.stringify(cur)) : null;
			} catch { this.#txBeforeSnapshot = null; }
		}

		let result;
		let error;
		try {
			result = fn();
		} catch (e) {
			error = e;
		}

		// If this was the outermost transaction, commit or rollback
		if (--this.#txDepth === 0) {
			try {
				if (error) {
					// Roll back
					if (this.#txBeforeSnapshot) this.#applyLayoutSnapshot(this.#txBeforeSnapshot);
				} else if (renderer?.getCurrentLayout) {
					// Commit single combined operation
					const after = renderer.getCurrentLayout();
					const op = {
						type: "grid_layout_change",
						data: { batched: true },
					};
					// Temporarily set last snapshot and push directly to avoid redundant calls from children
					const afterSnap = after ? JSON.parse(JSON.stringify(after)) : null;
					const beforeSnap = this.#txBeforeSnapshot ? JSON.parse(JSON.stringify(this.#txBeforeSnapshot)) : null;
					this.#clientState.undoStack.push({ type: op.type, before: beforeSnap, after: afterSnap, meta: op.data });
					this.#clientState.redoStack.clear();
					this.#lastLayoutSnapshot = afterSnap;
					this.emit("operationRecorded", { type: op.type });
				}
			} finally {
				this.#txBeforeSnapshot = null;
			}
		}

		if (error) throw error;
		return result;
	}

	/**
	 * Returns summary information about the undo/redo history for UI inspectors.
	 * @returns {{undoSize:number, redoSize:number, lastType:string|null}}
	 */
	getHistoryInfo() {
		let lastType = null;
		try {
			const last = this.#clientState.undoStack.peek();
			lastType = last?.type || null;
		} catch { /* noop */ }
		const recent = (() => {
			try {
				return this.#recentOps.slice(-5);
			} catch { return []; }
		})();
		return {
			undoSize: this.#clientState.undoStack.size,
			redoSize: this.#clientState.redoStack.size,
			lastType,
			recent,
		};
	}

	/**
	 * Undoes the most recent operation, when possible. Focused on grid layout changes.
	 */
	undo() {
		try {
			const op = this.#clientState.undoStack.pop();
			if (!op) return;

			if (op.type === "grid_layout_change" && op.before) {
				this.#isApplyingHistory = true;
				this.#applyLayoutSnapshot(op.before);
				this.#isApplyingHistory = false;

				// Prepare redo entry with swapped snapshots
				this.#clientState.redoStack.push({
					type: op.type,
					before: op.before,
					after: op.after,
				});
				// Update last snapshot
				this.#lastLayoutSnapshot = op.before ? JSON.parse(JSON.stringify(op.before)) : null;

				this.emit("layoutRestored", { direction: "undo" });
				return;
			}

			// Fallback: non-grid operation — currently no-op
		} catch (err) {
			console.warn("[HybridStateManager] undo failed:", err);
		} finally {
			this.#isApplyingHistory = false;
		}
	}

	/**
	 * Redoes the most recently undone operation, when possible. Focused on grid layout changes.
	 */
	redo() {
		try {
			const op = this.#clientState.redoStack.pop();
			if (!op) return;

			if (op.type === "grid_layout_change" && op.after) {
				this.#isApplyingHistory = true;
				this.#applyLayoutSnapshot(op.after);
				this.#isApplyingHistory = false;

				// Push inverse back to undo
				this.#clientState.undoStack.push({
					type: op.type,
					before: op.before,
					after: op.after,
				});
				this.#lastLayoutSnapshot = op.after ? JSON.parse(JSON.stringify(op.after)) : null;

				this.emit("layoutRestored", { direction: "redo" });
				return;
			}

			// Fallback: non-grid operation — currently no-op
		} catch (err) {
			console.warn("[HybridStateManager] redo failed:", err);
		} finally {
			this.#isApplyingHistory = false;
		}
	}

	/**
	 * Applies a layout snapshot by updating all block positions via the renderer.
	 * @private
	 * @param {{blocks: Array<{blockId: string, position?: {x:number,y:number,w:number,h:number}, x?:number,y?:number,w?:number,h?:number}>}} snapshot
	 */
	#applyLayoutSnapshot(snapshot) {
		try {
			const renderer = this.managers?.enhancedGridRenderer;
			if (!renderer || typeof renderer.updateBlockPosition !== "function") return;
			const blocks = Array.isArray(snapshot?.blocks) ? snapshot.blocks : [];
			for (const b of blocks) {
				const x = b.position?.x ?? b.x;
				const y = b.position?.y ?? b.y;
				const w = b.position?.w ?? b.w;
				const h = b.position?.h ?? b.h;
				if ([x,y,w,h].every((n) => Number.isFinite(n))) {
					renderer.updateBlockPosition(b.blockId, x, y, w, h);
				}
			}
			// Also emit a layoutChanged event for observers if needed
			this.emit("layoutChanged", { type: "history_apply" });
		} catch (err) {
			console.warn("[HybridStateManager] applyLayoutSnapshot failed:", err);
		}
	}
	get storage() {
		return this.#storage;
	}
	get schema() {
		return this.#schema;
	}
	get managers() {
		return this.#managers;
	}
	get serviceRegistry() {
		return this.#serviceRegistry;
	}
	get metricsRegistry() {
		return this.#metricsRegistry;
	}
	get signer() {
		return this.#signer;
	}
	get initialized() {
		return this.#initialized;
	}
	/**
	 * Public setter for initialization status, controlled by SystemBootstrap.
	 * @param {boolean} value
	 */
	set initialized(value) {
		this.#initialized = !!value;
	}

	/**
	 * @param {object} [config={}] - The configuration object for the state manager.
	 */
	constructor(config = {}) {
		this.#config = {
			maxUndoStackSize: config.maxUndoStackSize || 50,
			performanceMode: config.performanceMode ?? false,
			offlineEnabled: config.offlineEnabled || true,
			embeddingEnabled: config.embeddingEnabled || true,

			// NEW: Dynamic storage configuration
			storageConfig: {
				demoMode: config.demoMode ?? true,
				auditLevel: config.auditLevel || "standard",
				strictValidation: config.strictValidation || false,
				enableSync: config.enableSync !== false,
				offlineMode: config.offlineMode ?? config.demoMode ?? false,
				realtimeSync: config.realtimeSync || false,
				...config.storageConfig,
			},

			...config,
		};

		// Client-side state (fast, immediate operations)
		/**
		 * The in-memory, client-side state for immediate operations and UI responsiveness.
		 * @type {object}
		 */
		this.#clientState = {
			entities: new Map(),
			relationships: new Map(),
			undoStack: new BoundedStack(this.#config.maxUndoStackSize),
			redoStack: new BoundedStack(this.#config.maxUndoStackSize),
			pendingOperations: new BoundedStack(100),
			errors: [],
			searchIndex: new Map(),

			// UI state
			viewport: {
				entities: new Map(), // This would be managed by a dedicated UI/viewport manager
				currentFilter: null,
			},

			selectedEntities: new Set(),
			dragState: null,

			// Performance cache
			cache: null, // Will be initialized by CacheManager
		};

		// Dynamic storage system
		/**
		 * Manages the connection to the persistent storage layer.
		 * @type {{loader: StorageLoader|null, instance: object|null, ready: boolean, config: object|null}}
		 */
		this.#storage = {
			loader: null,
			instance: null,
			ready: false,
			config: null,
		};

		// Schema metadata from database
		/**
		 * Holds the database schema information once loaded.
		 * @type {{entities: Map<string, object>, fields: Map<string, object>, relationships: Map<string, object>, classifications: Set<string>, loaded: boolean}}
		 */
		this.#schema = {
			entities: new Map(), // Entity type definitions from database
			fields: new Map(), // Field definitions from type_definitions table
			relationships: new Map(), // Relationship type definitions
			classifications: new Set(), // Security classifications
			loaded: false,
		};

		this.#listeners = new Map();

		/**
		 * A collection of specialized managers for different subsystems.
		 * @type {{
		 *   errorHelpers: import('../utils/ErrorHelpers.js').ErrorHelpers,
		 *   metricsRegistry: import('../utils/MetricsRegistry.js').MetricsRegistry,
		 *   idManager: import('../managers/IdManager.js').IdManager,
		 *   cacheManager: import('../managers/CacheManager.js').CacheManager,
		 *   securityManager: import('./security/SecurityManager.js').SecurityManager,
		 *   forensicLogger: import('./ForensicLogger.js').ForensicLogger,
		 *   policies: import('./SystemPolicies_Cached.js').SystemPolicies,
		 *   conditionRegistry: import('./ConditionRegistry.js').ConditionRegistry,
		 *   actionHandler: import('./ActionHandlerRegistry.js').ActionHandlerRegistry,
		 *   componentRegistry: import('./ComponentDefinition.js').ComponentDefinitionRegistry,
		 *   eventFlowEngine: import('./EventFlowEngine.js').EventFlowEngine,
		 *   validationLayer: import('./storage/ValidationLayer.js').ValidationLayer,
		 *   plugin: import('./ManifestPluginSystem.js').ManifestPluginSystem,
		 *   embeddingManager: import('../state/EmbeddingManager.js').EmbeddingManager,
		 *   queryService: import('../state/QueryService.js').QueryService,
		 *   adaptiveRenderer: import('./AdaptiveRenderer.js').AdaptiveRenderer,
		 *   buildingBlockRenderer: import('./BuildingBlockRenderer.js').BuildingBlockRenderer,
		 *   databaseOptimizer: import('./DatabaseOptimizer.js').DatabaseOptimizer,
		 *   cds: import('./security/cds.js').CrossDomainSolution,
		 *   optimizationAccessControl: import('./OptimizationAccessControl.js').OptimizationAccessControl,
		 *   metricsReporter: import('../utils/MetricsReporter.js').MetricsReporter,
		 *   extensionManager: import('./ExtensionManager.js').ExtensionManager
		 * }}
		 */
		this.#managers = {
			// This object will be populated by the ServiceRegistry.
			policies: null,
			plugin: null,
			embeddingManager: null,
			extension: null,
			validationLayer: null, // NEW: Validation manager
			securityManager: null, // NEW: Security Manager
			forensicLogger: null, // NEW: Forensic Logger manager
			idManager: null, // NEW: ID Manager
			cacheManager: null, // NEW: Cache Manager
			databaseOptimizer: null,
			adaptiveRenderer: null,
			buildingBlockRenderer: null,
			queryService: null,
			eventFlowEngine: null,
			componentRegistry: null, // NEW: Component Definition Registry
			conditionRegistry: null,
			actionHandler: null,
			errorHelpers: null,
			cds: null,
		};

		// V8.0 Parity: Mandate 1.3 - Instantiate the ServiceRegistry
		this.#serviceRegistry = new ServiceRegistry(this);

		// Initialize private fields
		this.#unsubscribeFunctions = [];
		this.#signer = null;
		this.#metricsRegistry = null;
		this.#initialized = false;
	}

	/**
	 * Initializes core subsystems like the event engine and security components.
	 * This is called by SystemBootstrap after storage is ready.
	 * @internal
	 */
	async bootstrapSubsystems() {
		// Ensure foundational services exist in sensible order to avoid fallback paths
		await this.#serviceRegistry.get("cacheManager");
		this.#metricsRegistry = await this.#serviceRegistry.get("metricsRegistry");
		await this.#serviceRegistry.get("eventFlowEngine");
		const nonRepudiationService = await this.#serviceRegistry.get("nonRepudiation");
		this.#signer = nonRepudiationService;

		console.log("[HybridStateManager] Core subsystems bootstrapped.");

		// Initialize the client-side cache via the manager
		if (this.#managers.cacheManager) {
			this.#clientState.cache =
				this.#managers.cacheManager.getCache("clientState");
		}

		// V8.0 Parity: Mandate 4.3 - Apply performance measurement decorator to critical methods.
		if (this.#metricsRegistry) {
			this.saveEntity = this.metricsRegistry
				.namespace("state")
				.measure("saveEntity")(this.saveEntity.bind(this));
		}
	}

	/**
	 * Records an audit event, persisting it locally in offline/demo mode.
	 * @param {string} type - The type of the audit event.
	 * @param {object} payload - The data associated with the event.
	 * @param {object} [context={}] - Additional context for the event.
	 * @returns {Promise<void>}
	 */
	async recordAuditEvent(type, payload, context = {}) {
		try {
			// V8.0 Parity: Delegate audit event creation and logging to the ForensicLogger.
			const forensicLogger = this.#managers.forensicLogger;
			if (!forensicLogger) {
				console.warn(
					"[HybridStateManager] ForensicLogger not available for audit event."
				);
				return;
			}
			// The logger will handle getting the user context and signing.
			await forensicLogger.logAuditEvent(type, payload, context);
		} catch (error) {
			console.error(
				"[HybridStateManager] Failed to log audit event:",
				error
			);
		}
	}

	/**
	 * Initializes the dynamic storage system by creating and configuring the `StorageLoader`.
	 * @internal This method is called by SystemBootstrap.
	 * @param {object} authContext - The user's authentication context.
	 * @param {HybridStateManager} stateManager - The instance of the state manager itself.
	 * @returns {Promise<object>} The initialized storage object.
	 */
	async initializeStorageSystem(authContext, stateManager) {
		if (this.#storage.ready) {
			return this.#storage;
		}

		// Ensure SecurityManager is loaded and set the context
		const securityManager =
			await this.#serviceRegistry.get("securityManager");
		if (authContext?.userId && authContext?.clearanceLevel) {
			securityManager.setUserContext(
				authContext.userId,
				authContext.clearanceLevel,
				authContext.compartments
			);
		}

		// V8.0 Parity: The StorageLoader is now a service managed by the registry.
		const storageLoader = await this.#serviceRegistry.get("storageLoader");
		this.#storage.loader = storageLoader;

		// The loader is already initialized by the service registry.

		// Create storage instance with user context + demo flag
		this.#storage.instance = await this.#storage.loader.createStorage(
			authContext,
			{
				demoMode: Boolean(this.#config.demoMode),
				enableSync: this.#config?.sync?.enableSync === true,
				realtimeSync: this.#config?.sync?.realtime === true,
				// Pass the MAC engine from the already-initialized SecurityManager
				mac: securityManager.mac,
				stateManager, // Pass stateManager to createStorage
			}
		);

		this.storage.ready = true;
	}

	/**
	 * Determines the correct object store for a given entity.
	 * This is central to routing standard vs. polyinstantiated entities.
	 * @param {object|null} entity - The entity to inspect.
	 * @returns {'objects'|'objects_polyinstantiated'} The name of the object store.
	 * @private
	 */
	storeFor(entity) {
		if (!entity) return "objects";
		// Polyinstantiated entities are identified by these specific fields.
		if (entity.logical_id && entity.classification_level) {
			return "objects_polyinstantiated";
		}
		return "objects"; // Default fallback for standard entities.
	}

	/**
	 * Saves an entity to the appropriate persistent store, handling polyinstantiation and security.
	 * @param {object} entity - The entity object to save.
	 * @returns {Promise<IDBValidKey>} A promise that resolves with the key of the saved item.
	 * @throws {Error} If the storage system is not ready or if the save operation fails.
	 */
	async saveEntity(entity) {
		return this.#managers.errorHelpers.tryOr(
			async () => {
				if (!this.#storage.ready) {
					throw new Error("Storage system not initialized");
				}

				// 1. Determine the correct store
				const store = this.storeFor(entity);

				// 2. Ensure logical_id is present for polyinstantiated types, using the IdManager
				if (
					store === "objects_polyinstantiated" &&
					!entity.logical_id
				) {
					entity.logical_id = this.#managers.idManager.generate();
				}

				// 3. Add/update in client state
				this.#clientState.entities.set(entity.id, entity);

				// 4. Save through the secure storage instance, which handles MAC, crypto, etc.
				const result = await this.#storage.instance.put(store, entity);

				// 5. Emit event
				this.emit("entitySaved", {
					// V8.0 Parity: Use standardized event names
					store,
					id: entity.id || entity.logical_id,
					entity,
				});

				return result;
			},
			(error) => {
				this.emit("entitySaveFailed", {
					entity,
					error,
					severity: "high",
				});
				// The error is already logged by tryOr, so we just re-throw.
				throw error;
			},
			{
				component: "HybridStateManager",
				operation: "saveEntity",
			}
		);
	}

	/**
	 * Loads a single logical entity, correctly merging polyinstantiated versions if they exist and are readable.
	 * @param {string} logicalId - The logical ID of the entity to load.
	 * @returns {Promise<object|null>} A promise that resolves with the merged entity, or null if not found.
	 * @throws {Error} If the storage system is not ready or if the load operation fails.
	 */
	async loadEntity(logicalId) {
		try {
			if (!this.#storage.ready) {
				throw new Error("Storage system not initialized");
			}

			// Attempt to load polyinstantiated versions first.
			// The `get` method on the storage instance will handle merging readable rows.
			const poly = await this.#storage.instance.get(
				"objects_polyinstantiated",
				logicalId
			);
			if (poly) return poly;

			// Fallback to the standard objects store if no polyinstantiated version is found.
			return await this.#storage.instance.get("objects", logicalId);
		} catch (error) {
			console.error(
				`[HybridStateManager] Failed to load entity ${logicalId}:`,
				error
			);
			this.emit("entityLoadFailed", { id: logicalId, error });
			throw error;
		}
	}

	/**
	 * Loads multiple entities from storage.
	 * @param {object} [options={}] - Options to filter the entities to load. (Currently a placeholder).
	 * @returns {Promise<object[]>} A promise that resolves with an array of loaded entities.
	 * @throws {Error} If the storage system is not ready or if the load operation fails.
	 */
	async loadEntities(options = {}) {
		const startTime = performance.now();

		try {
			if (!this.#storage.ready) {
				throw new Error("Storage system not initialized");
			}

			// This is a placeholder; a real implementation would need more specific options.
			// For now, we assume it loads all from the 'objects' store.
			const result = await this.#storage.instance.getAll("objects");

			result.forEach((entity) =>
				this.#clientState.entities.set(entity.id, entity)
			);

			this.#metricsRegistry?.updateAverage(
				"storage.loadTime",
				performance.now() - startTime
			);
			this.emit("entitiesLoaded", { result });

			return result;
		} catch (error) {
			console.error(
				"[HybridStateManager] Failed to load entities:",
				error
			);
			this.emit("entitiesLoadFailed", { error });
			throw error;
		}
	}

	/**
	 * Deletes an entity and all its polyinstantiated versions that the user has permission to affect.
	 * @param {string} logicalId The logical ID of the entity to delete.
	 * @returns {Promise<void>}
	 * @throws {Error} If the storage system is not ready or if the delete operation fails.
	 */
	async deleteEntity(logicalId) {
		try {
			if (!this.#storage.ready) {
				throw new Error("Storage system not initialized");
			}

			// 1. Remove from client state first for immediate UI feedback.
			this.#clientState.entities.delete(logicalId);

			// 2. Attempt to delete from the polyinstantiated store.
			// The storage's delete method will handle finding all readable instances.
			await this.#storage.instance.delete(
				"objects_polyinstantiated",
				logicalId
			);

			// 3. Attempt to delete from the standard store as a fallback.
			// If the entity was only in the standard store, this will catch it.
			await this.#storage.instance.delete("objects", logicalId);

			// 4. Emit event
			this.emit("entityDeleted", {
				id: logicalId,
			});
		} catch (error) {
			console.error(
				`[HybridStateManager] Failed to delete entity ${logicalId}:`,
				error
			);
			this.emit("entityDeleteFailed", { id: logicalId, error });
			throw error;
		}
	}

	/**
	 * Retrieves the version history of a polyinstantiated entity.
	 * This allows for auditing and viewing how an entity has changed over time
	 * across different classification levels that the user can access.
	 * @param {string} logicalId The logical ID of the entity.
	 * @returns {Promise<object[]>} A promise that resolves to an array of historical entity versions.
	 * @throws {Error} If the storage system is not ready or if the history retrieval fails.
	 */
	async getEntityHistory(logicalId) {
		try {
			if (!this.#storage.ready) {
				throw new Error("Storage system not initialized");
			}

			// Delegate to the storage instance, which knows how to handle this.
			const history = await this.#storage.instance.getHistory(
				"objects_polyinstantiated",
				logicalId
			);

			this.emit("entityHistoryLoaded", { id: logicalId, history });
			return history;
		} catch (error) {
			console.error(
				`[HybridStateManager] Failed to get history for entity ${logicalId}:`,
				error
			);
			this.emit("entityHistoryFailed", { id: logicalId, error });
			throw error;
		}
	}

	/**
	 * Initiates a synchronization operation with a remote server.
	 * @param {object} [options={}] - Options for the sync operation.
	 * @returns {Promise<object>} A promise that resolves with the result of the sync operation.
	 * @throws {Error} If the sync operation fails.
	 */
	async syncEntities(options = {}) {
		const startTime = performance.now();

		try {
			if (!this.#storage.ready || !this.#storage.instance.sync) {
				console.warn("[HybridStateManager] Sync not available");
				return { synced: 0, skipped: 0 };
			}

			const result = await this.#storage.instance.sync(options);

			this.#metricsRegistry?.updateAverage(
				"storage.syncTime",
				performance.now() - startTime
			);
			this.emit("entitiesSynced", { result });

			return result;
		} catch (error) {
			console.error(
				"[HybridStateManager] Failed to sync entities:",
				error
			);
			this.emit("entitiesSyncFailed", { error });
			throw error;
		}
	}

	/**
	 * Sets the security context for the current user.
	 * @param {string} userId - The user's unique identifier.
	 * @param {string} clearanceLevel - The user's security clearance level.
	 * @param {string[]} [compartments=[]] - An array of security compartments the user has access to.
	 * @param {number} [ttl=14400000] - The time-to-live for this context in milliseconds.
	 * @returns {Promise<void>}
	 * @throws {Error} If the SecurityManager is not initialized.
	 */
	async setUserSecurityContext(
		userId,
		clearanceLevel,
		compartments = [],
		ttl = 4 * 3600000
	) {
		try {
			const securityManager = this.#managers.securityManager;
			if (!securityManager) {
				throw new Error("SecurityManager not initialized.");
			}
			// Delegate to the SecurityManager
			securityManager.setUserContext(
				userId,
				clearanceLevel,
				compartments,
				ttl
			);

			this.emit("securityContextSet", {
				userId,
				clearanceLevel,
				compartments,
			});
		} catch (error) {
			console.error(
				"[HybridStateManager] Failed to set security context:",
				error
			);
			throw error;
		}
	}

	/**
	 * Registers a listener function for a specific event type.
	 * @param {string} eventName - The name of the event to listen for.
	 * @param {Function} listener - The callback function to execute.
	 * @returns {Function} An unsubscribe function to remove the listener.
	 */
	on(eventName, listener) {
		if (!this.#listeners.has(eventName)) {
			this.#listeners.set(eventName, []);
		}
		this.#listeners.get(eventName).push(listener);

		const unsubscribe = () => {
			const listeners = this.#listeners.get(eventName);
			if (listeners) {
				const index = listeners.indexOf(listener);
				if (index > -1) {
					listeners.splice(index, 1);
				}
			}
		};
		return unsubscribe;
	}

	/**
	 * Unsubscribes all event listeners created via the `on` method.
	 * @private
	 */
	#unsubscribeAll() {
		this.#unsubscribeFunctions.forEach((unsubscribe) => {
			if (typeof unsubscribe === "function") {
				unsubscribe();
			}
		});
		this.#unsubscribeFunctions.length = 0; // Clear the array
	}

	/**
	 * Emits an event to all registered listeners for that event type.
	 * @param {string} eventName - The name of the event to emit.
	 * @param {object} [payload] - The data to pass to the listeners.
	 * @returns {void}
	 */
	emit(eventName, payload) {
		const listeners = this.#listeners.get(eventName) || [];
		if (listeners) {
			listeners.forEach((listener) => {
				try {
					listener(payload);
				} catch (error) {
					console.error(
						`Error in listener for event ${eventName}:`,
						error
					);
				}
			});
		}

		// Also emit to wildcard listeners
		const wildcardListeners = this.#listeners.get("*") || [];
		wildcardListeners.forEach((listener) => {
			try {
				listener(payload, eventName); // Pass eventName to wildcard listeners
			} catch (error) {
				console.error(
					`Error in wildcard listener for event ${eventName}:`,
					error
				);
			}
		});
	}

	/**
	 * Gracefully shuts down the state manager and all its sub-modules.
	 * This method cleans up event listeners, stops timers, and closes database connections.
	 * @returns {Promise<void>}
	 */
	async cleanup() {
		console.log("[HybridStateManager] Starting cleanup...");

		// 1. Unsubscribe all internal event listeners
		this.#unsubscribeAll();

		// 2. Clean up all managers that have a cleanup method
		for (const managerName in this.#managers) {
			const manager = this.#managers[managerName];
			if (manager && typeof manager.cleanup === "function") {
				try {
					await manager.cleanup();
				} catch (error) {
					console.error(
						`[HybridStateManager] Error cleaning up manager '${managerName}':`,
						error
					);
				}
			}
		}

		// 3. Clear listeners and reset state
		this.#listeners.clear();
		this.#initialized = false;
		console.log("[HybridStateManager] Cleanup complete.");
	}
}

export default HybridStateManager;
