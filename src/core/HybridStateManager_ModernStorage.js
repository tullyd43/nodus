// core/HybridStateManager_ModernStorage.js
// Updated HybridStateManager with integrated ModernOfflineStorage

import AdaptiveRenderer from "./AdaptiveRenderer.js";
import { NodesOfflineManager } from "../integration/SimpleIntegration.js";
import { BoundedStack } from "../utils/BoundedStack.js";
import { LRUCache } from "../utils/LRUCache.js";

/**
 * @class HybridStateManager
 * @classdesc Manages the application's state by combining a fast, in-memory client state
 * with a robust, secure, and persistent offline storage layer. This version is specifically
 * designed to integrate with the `NodesOfflineManager` for modern storage capabilities.
 */
export class HybridStateManager {
	/**
	 * Creates an instance of HybridStateManager.
	 * @param {object} [config={}] - The configuration object for the state manager.
	 */
	constructor(config = {}) {
		this.config = {
			maxUndoStackSize: config.maxUndoStackSize || 50,
			maxViewportItems: config.maxViewportItems || 200,
			performanceMode: config.performanceMode || false,
			offlineEnabled: config.offlineEnabled || true,
			embeddingEnabled: config.embeddingEnabled || true,
			// NEW: Modern storage config
			/** @type {object} */
			storage: {
				enabled: config.storage?.enabled !== false,
				dbName: config.storage?.dbName || "nodus_hybrid",
				demoMode: config.storage?.demoMode || false,
				autoSave: config.storage?.autoSave !== false,
				autoSaveDelay: config.storage?.autoSaveDelay || 1000,
				encryptionKey: config.storage?.encryptionKey || null,
			},
			...config,
		};

		// Client-side state (fast, immediate operations)
		/**
		 * The in-memory, client-side state for immediate operations and UI responsiveness.
		 * @type {object}
		 */
		this.clientState = {
			entities: new Map(),
			relationships: new Map(),
			undoStack: new BoundedStack(this.config.maxUndoStackSize),
			redoStack: new BoundedStack(this.config.maxUndoStackSize),
			pendingOperations: new BoundedStack(100),
			searchIndex: new Map(),

			// UI state
			viewport: {
				entities: new Map(),
				maxItems: this.config.maxViewportItems,
				currentFilter: null,
			},

			selectedEntities: new Set(),
			dragState: null,

			// Performance cache
			cache: new LRUCache(1000, { ttl: 30 * 60 * 1000 }),
		};

		// Type definitions registry
		/**
		 * A map of registered entity type definitions.
		 * @type {Map<string, object>}
		 */
		this.typeDefinitions = new Map();

		// Plugin management
		/**
		 * Manages the state of loaded plugins.
		 * @type {object}
		 */
		this.plugins = {
			active: new Set(),
			loaded: new Map(),
			configs: new Map(),
			loadingStrategies: new Map(),
		};

		// Extension-based server capabilities
		/**
		 * Tracks discovered server capabilities provided by extensions.
		 * @type {object}
		 */
		this.serverCapabilities = {
			discovered: new Map(),
			endpoints: new Map(),
			routing: new Map(),
			fallbacks: new Map(),
			lastDiscovery: 0,
			discoveryInterval: 5 * 60 * 1000,
		};

		// State change listeners (MVVM integration)
		/**
		 * A map of event listeners for state changes.
		 * @type {Map<string, Function[]>}
		 */
		this.listeners = new Map();
		/**
		 * A map of bindings to view models.
		 * @type {Map<any, any>}
		 */
		this.viewModelBindings = new Map();

		// Component managers (lazy-loaded for bundle size)
		/**
		 * A collection of specialized managers for different subsystems.
		 * @type {object}
		 */
		this.managers = {
			offline: null, // Will hold NodesOfflineManager
			sync: null,
			plugin: null,
			embedding: null,
			extension: null,
		};

		// Performance metrics
		/**
		 * A collection of performance and usage metrics.
		 * @type {object}
		 */
		this.metrics = {
			operationLatencies: [],
			bundleSize: 0,
			embeddingCacheHitRate: 0,
			embeddingProcessingTimes: [],
			embeddingBatchEfficiency: 0,

			// Storage metrics
			storage: {
				saveCount: 0,
				loadCount: 0,
				averageSaveTime: 0,
				averageLoadTime: 0,
				lastSaveTime: 0,
				totalStorageSize: 0,
				encryptionOverhead: 0,
			},

			// Routing metrics
			routing: {
				serverSuccessRate: 0,
				clientFallbackRate: 0,
				adaptiveDecisions: 0,
				extensionRoutingCount: 0,
			},

			// Rendering performance
			rendering: {
				adaptiveRenderTimes: [],
				templateRenderTimes: [],
				averageRenderTime: 0,
				averageAdaptiveRenderTime: 0,
				componentCacheHitRate: 0,
			},

			// Memory management
			memory: {
				entitiesCount: 0,
				relationshipsCount: 0,
				cacheSize: 0,
				undoStackSize: 0,
			},

			// User interaction
			interaction: {
				commandsExecuted: 0,
				actionsTriggered: 0,
				conditionsEvaluated: 0,
			},
		};

		// Auto-save timer for performance
		/**
		 * The timer ID for the debounced auto-save functionality.
		 * @type {number|null}
		 */
		this.autoSaveTimer = null;
		/**
		 * A flag indicating if there are pending changes to be saved.
		 * @type {boolean}
		 */
		this.pendingSave = false;

		// Initialize renderer
		/**
		 * The adaptive renderer instance for UI components.
		 * @type {AdaptiveRenderer}
		 */
		this.renderer = new AdaptiveRenderer(this);

		// Auto-initialize storage if key provided
		if (this.config.storage.enabled && this.config.storage.encryptionKey) {
			this.initializeOfflineStorage(
				this.config.storage.encryptionKey,
				this.config.storage
			).catch((error) =>
				console.warn(
					"[HybridStateManager] Failed to auto-initialize storage:",
					error
				)
			);
		}
	}

	// ==========================================
	// MODERN STORAGE INTEGRATION METHODS
	// ==========================================

	/**
	 * Initializes the modern offline storage system using the provided encryption key.
	 * @param {string} encryptionKey - The key used to encrypt and decrypt the offline database.
	 * @param {object} [options={}] - Additional storage configuration options.
	 * @returns {Promise<NodesOfflineManager>} A promise that resolves with the initialized storage manager instance.
	 * @throws {Error} If an encryption key is not provided or if initialization fails.
	 */
	async initializeOfflineStorage(encryptionKey, options = {}) {
		if (this.managers.offline) {
			console.warn(
				"[HybridStateManager] Offline storage already initialized"
			);
			return this.managers.offline;
		}

		if (!encryptionKey) {
			throw new Error("Encryption key required for offline storage");
		}

		const storageOptions = {
			dbName: options.dbName || this.config.storage.dbName,
			demoMode: options.demoMode || this.config.storage.demoMode,
		};

		try {
			// Create and initialize the modern storage manager
			this.managers.offline = new NodesOfflineManager(
				this,
				encryptionKey,
				storageOptions
			);
			await this.managers.offline.init();

			// Setup auto-save if enabled
			if (this.config.storage.autoSave) {
				this.setupAutoSave();
			}

			console.log(
				"[HybridStateManager] Modern offline storage initialized successfully"
			);
			this.emit("storageInitialized", { manager: this.managers.offline });

			return this.managers.offline;
		} catch (error) {
			console.error(
				"[HybridStateManager] Failed to initialize offline storage:",
				error
			);
			throw error;
		}
	}

	/**
	 * Sets the security context for the current user, which is essential for access control.
	 * This should be called after a user successfully authenticates.
	 * @param {string} userId - The unique identifier of the user.
	 * @param {string} clearance - The user's security clearance level (e.g., 'secret').
	 * @param {string[]} [compartments=[]] - An array of security compartments the user has access to.
	 * @param {number} [ttl=14400000] - The time-to-live for this context in milliseconds (default: 4 hours).
	 * @returns {Promise<this>} A promise that resolves with the state manager instance for chaining.
	 */
	async setUserContext(
		userId,
		clearance,
		compartments = [],
		ttl = 4 * 3600000
	) {
		if (!this.managers.offline) {
			throw new Error(
				"Offline storage not initialized. Call initializeOfflineStorage() first."
			);
		}

		await this.managers.offline.setUser(
			userId,
			clearance,
			compartments,
			ttl
		);
		console.log(
			`[HybridStateManager] User context set: ${userId} (${clearance})`
		);

		this.emit("userContextSet", { userId, clearance, compartments });
		return this;
	}

	/**
	 * Manually triggers a save of the current client-side state to the persistent offline storage.
	 * @returns {Promise<object>} A promise that resolves with a summary of the save operation.
	 * @throws {Error} If the offline storage is not ready.
	 */
	async saveToStorage() {
		if (!this.managers.offline?.isReady) {
			throw new Error("Offline storage not ready");
		}

		const startTime = performance.now();

		try {
			const result = await this.managers.offline.save();
			const saveTime = performance.now() - startTime;

			// Update metrics
			this.metrics.storage.saveCount++;
			this.metrics.storage.lastSaveTime = Date.now();
			this.metrics.storage.averageSaveTime =
				(this.metrics.storage.averageSaveTime *
					(this.metrics.storage.saveCount - 1) +
					saveTime) /
				this.metrics.storage.saveCount;

			console.log(
				`[HybridStateManager] Saved ${result.saved} entities (${saveTime.toFixed(2)}ms)`
			);
			this.emit("storageSaved", { ...result, saveTime });

			return result;
		} catch (error) {
			console.error("[HybridStateManager] Save failed:", error);
			this.emit("storageError", { operation: "save", error });
			throw error;
		}
	}

	/**
	 * Manually triggers a load of all data from the persistent offline storage into the client-side state.
	 * @returns {Promise<object>} A promise that resolves with a summary of the load operation.
	 * @throws {Error} If the offline storage is not ready.
	 */
	async loadFromStorage() {
		if (!this.managers.offline?.isReady) {
			throw new Error("Offline storage not ready");
		}

		const startTime = performance.now();

		try {
			const result = await this.managers.offline.load();
			const loadTime = performance.now() - startTime;

			// Update metrics
			this.metrics.storage.loadCount++;
			this.metrics.storage.averageLoadTime =
				(this.metrics.storage.averageLoadTime *
					(this.metrics.storage.loadCount - 1) +
					loadTime) /
				this.metrics.storage.loadCount;

			// Update memory metrics
			this.updateMemoryMetrics();

			console.log(
				`[HybridStateManager] Loaded ${result.loaded} entities (${loadTime.toFixed(2)}ms)`
			);
			this.emit("storageLoaded", { ...result, loadTime });

			return result;
		} catch (error) {
			console.error("[HybridStateManager] Load failed:", error);
			this.emit("storageError", { operation: "load", error });
			throw error;
		}
	}

	/**
	 * Executes a state-changing operation, records performance metrics, and triggers an auto-save if necessary.
	 * This is the main entry point for all commands that modify the application state.
	 * @param {object} operation - The operation object to execute.
	 * @returns {Promise<any>} A promise that resolves with the result of the core operation logic.
	 */
	async executeOperation(operation) {
		// Validate operation
		this.validateOperation(operation);

		const startTime = performance.now();

		try {
			// Execute core operation logic
			const result = await this.executeOperationCore(operation);

			// Record performance
			const operationTime = performance.now() - startTime;
			this.metrics.operationLatencies.push(operationTime);
			if (this.metrics.operationLatencies.length > 1000) {
				this.metrics.operationLatencies.shift();
			}

			// Update memory metrics
			this.updateMemoryMetrics();

			// Trigger auto-save for significant operations
			if (this.shouldAutoSave(operation)) {
				this.scheduleAutoSave();
			}

			// Update interaction metrics
			this.metrics.interaction.commandsExecuted++;

			this.emit("operationExecuted", {
				operation,
				result,
				operationTime,
			});
			return result;
		} catch (error) {
			console.error(
				"[HybridStateManager] Operation failed:",
				operation,
				error
			);
			this.emit("operationError", { operation, error });
			throw error;
		}
	}

	/**
	 * Contains the core logic for executing different types of operations.
	 * @private
	 * @param {object} operation - The operation object.
	 * @returns {Promise<any>} The result of the specific operation.
	 */
	async executeOperationCore(operation) {
		// Add your existing operation execution logic here
		// This should contain all the switch cases for different operation types

		switch (operation.type) {
			case "entity_create":
				return this.createEntity(operation.data);
			case "entity_update":
				return this.updateEntity(operation.entityId, operation.updates);
			case "entity_delete":
				return this.deleteEntity(operation.entityId);
			// Add more operation types as needed
			default:
				throw new Error(`Unknown operation type: ${operation.type}`);
		}
	}

	// ==========================================
	// ENHANCED ENTITY OPERATIONS
	// ==========================================

	/**
	 * Creates a new entity. If modern storage is available, it uses the storage manager's
	 * validated factory method; otherwise, it falls back to a basic creation method.
	 * @param {object} entityData - The initial data for the new entity.
	 * @returns {object} The newly created entity object.
	 */
	createEntity(entityData) {
		if (!this.managers.offline) {
			// Fallback to basic entity creation
			const entity = {
				id: this.generateId(),
				...entityData,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			};
			this.clientState.entities.set(entity.id, entity);
			return entity;
		}

		// Use validated entity factory
		const entity = this.managers.offline.addEntity(entityData);
		return entity;
	}

	/**
	 * Updates an existing entity. If modern storage is available, it uses the storage manager's
	 * validated update method; otherwise, it falls back to a basic update.
	 * @param {string} entityId - The ID of the entity to update.
	 * @param {object} updates - An object containing the fields to update.
	 * @returns {object} The updated entity object.
	 * @throws {Error} If the entity is not found.
	 */
	updateEntity(entityId, updates) {
		if (!this.managers.offline) {
			// Fallback to basic update
			const entity = this.clientState.entities.get(entityId);
			if (!entity) throw new Error(`Entity ${entityId} not found`);

			const updated = {
				...entity,
				...updates,
				updated_at: new Date().toISOString(),
			};
			this.clientState.entities.set(entityId, updated);
			return updated;
		}

		// Use validated update
		return this.managers.offline.updateEntity(entityId, updates);
	}

	// ==========================================
	// AUTO-SAVE FUNCTIONALITY
	// ==========================================

	/**
	 * Sets up event listeners to automatically save pending changes when the page is hidden or closed.
	 * @private
	 */
	setupAutoSave() {
		if (typeof window === "undefined") return; // No auto-save in server environments

		// Save on page unload
		window.addEventListener("beforeunload", () => {
			if (this.managers.offline?.isReady && this.pendingSave) {
				// Synchronous save for beforeunload (best effort)
				this.saveToStorage().catch(console.warn);
			}
		});

		// Save on visibility change (when tab becomes hidden)
		document.addEventListener("visibilitychange", () => {
			if (document.hidden && this.pendingSave) {
				this.scheduleAutoSave(0); // Immediate save when hiding
			}
		});
	}

	/**
	 * Schedules a debounced auto-save operation. This prevents excessive saves during rapid changes.
	 * @private
	 * @param {number} [delay=this.config.storage.autoSaveDelay] - The debounce delay in milliseconds.
	 */
	scheduleAutoSave(delay = this.config.storage.autoSaveDelay) {
		if (!this.config.storage.autoSave || !this.managers.offline?.isReady) {
			return;
		}

		this.pendingSave = true;

		// Clear existing timer
		if (this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
		}

		// Schedule new save
		this.autoSaveTimer = setTimeout(async () => {
			try {
				await this.saveToStorage();
				this.pendingSave = false;
			} catch (error) {
				console.warn("[HybridStateManager] Auto-save failed:", error);
				// Keep pendingSave=true to retry later
			}
		}, delay);
	}

	/**
	 * Determines if a given operation is significant enough to trigger an auto-save.
	 * @private
	 * @param {object} operation - The operation object.
	 * @returns {boolean} True if the operation should trigger an auto-save.
	 */
	shouldAutoSave(operation) {
		const autoSaveOperations = [
			"entity_create",
			"entity_update",
			"entity_delete",
			"relationship_create",
			"relationship_update",
			"relationship_delete",
			"bulk_update",
			"bulk_delete",
		];
		return autoSaveOperations.includes(operation.type);
	}

	// ==========================================
	// UTILITY METHODS
	// ==========================================

	/**
	 * Updates the internal memory usage metrics based on the current client state.
	 * @private
	 */
	updateMemoryMetrics() {
		this.metrics.memory.entitiesCount = this.clientState.entities.size;
		this.metrics.memory.relationshipsCount =
			this.clientState.relationships.size;
		this.metrics.memory.cacheSize = this.clientState.cache.size;
		this.metrics.memory.undoStackSize = this.clientState.undoStack.size;
	}

	/**
	 * Retrieves a comprehensive status object for the entire system, including storage and memory metrics.
	 * @returns {object} A system status object.
	 */
	getSystemStatus() {
		return {
			initialized: true,
			storage: {
				enabled: this.config.storage.enabled,
				ready: this.managers.offline?.isReady || false,
				hasValidContext:
					this.managers.offline?.hasValidContext || false,
				pendingSave: this.pendingSave,
			},
			entities: this.clientState.entities.size,
			relationships: this.clientState.relationships.size,
			metrics: { ...this.metrics },
			memory: {
				...this.metrics.memory,
				cacheHitRate: this.clientState.cache.hitRate || 0,
			},
		};
	}

	/**
	 * Gracefully shuts down the state manager, clearing timers and closing the storage connection.
	 * @returns {void}
	 */
	cleanup() {
		// Clear auto-save timer
		if (this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
			this.autoSaveTimer = null;
		}

		// Close storage if available
		if (this.managers.offline) {
			this.managers.offline.close();
			this.managers.offline = null;
		}

		// Clear state
		this.clientState.entities.clear();
		this.clientState.relationships.clear();
		this.clientState.cache.clear();

		// Reset flags
		this.pendingSave = false;

		this.emit("systemCleanup");
	}

	// ==========================================
	// EVENT SYSTEM (if not already implemented)
	// ==========================================

	/**
	 * Emits an event to all registered listeners for that event type.
	 * @param {string} event - The name of the event to emit.
	 * @param {object} [data={}] - The payload data to pass to the listeners.
	 * @returns {void}
	 */
	emit(event, data = {}) {
		const listeners = this.listeners.get(event) || [];
		listeners.forEach((listener) => {
			try {
				listener(data);
			} catch (error) {
				console.warn(
					`[HybridStateManager] Listener error for ${event}:`,
					error
				);
			}
		});
	}

	/**
	 * Registers a listener function for a specific event type.
	 * @param {string} event - The name of the event to listen for.
	 * @param {Function} listener - The callback function to execute.
	 * @returns {Function} An unsubscribe function to remove the listener.
	 */
	on(event, listener) {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, []);
		}
		this.listeners.get(event).push(listener);
		return () => this.off(event, listener);
	}

	/**
	 * Removes a previously registered event listener.
	 * @param {string} event - The name of the event.
	 * @param {Function} listener - The listener function to remove.
	 * @returns {void}
	 */
	off(event, listener) {
		const listeners = this.listeners.get(event);
		if (listeners) {
			const index = listeners.indexOf(listener);
			if (index > -1) {
				listeners.splice(index, 1);
			}
		}
	}

	// Your existing methods remain unchanged...
	/**
	 * Validates an operation object.
	 * @param {object} operation - The operation to validate.
	 * @throws {Error} If the operation is invalid.
	 */
	validateOperation(operation) {
		if (!operation.type) {
			throw new Error("Operation must have a type");
		}
		if (!operation.id) {
			operation.id = this.generateOperationId();
		}
	}

	/**
	 * Generates a unique ID for an operation.
	 * @returns {string} A unique operation ID.
	 */
	generateOperationId() {
		return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Generates a unique ID for an entity.
	 * @returns {string} A unique entity ID.
	 */
	generateId() {
		return `ent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}

export default HybridStateManager;
