// core/HybridStateManager_ModernStorage.js
// Updated HybridStateManager with integrated ModernOfflineStorage

import { BoundedStack } from "../utils/BoundedStack.js";
import { LRUCache } from "../utils/LRUCache.js";
import AdaptiveRenderer from "./AdaptiveRenderer.js";
import { componentRegistry } from "./ComponentDefinition.js";
import { NodesOfflineManager } from "../integration/SimpleIntegration.js";

export class HybridStateManager {
  constructor(config = {}) {
    this.config = {
      maxUndoStackSize: config.maxUndoStackSize || 50,
      maxViewportItems: config.maxViewportItems || 200,
      performanceMode: config.performanceMode || false,
      offlineEnabled: config.offlineEnabled || true,
      embeddingEnabled: config.embeddingEnabled || true,
      // NEW: Modern storage config
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
    this.typeDefinitions = new Map();

    // Plugin management
    this.plugins = {
      active: new Set(),
      loaded: new Map(),
      configs: new Map(),
      loadingStrategies: new Map(),
    };

    // Extension-based server capabilities
    this.serverCapabilities = {
      discovered: new Map(),
      endpoints: new Map(),
      routing: new Map(),
      fallbacks: new Map(),
      lastDiscovery: 0,
      discoveryInterval: 5 * 60 * 1000,
    };

    // State change listeners (MVVM integration)
    this.listeners = new Map();
    this.viewModelBindings = new Map();

    // Component managers (lazy-loaded for bundle size)
    this.managers = {
      offline: null, // Will hold NodesOfflineManager
      sync: null,
      plugin: null,
      embedding: null,
      extension: null,
    };

    // Performance metrics
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
    this.autoSaveTimer = null;
    this.pendingSave = false;

    // Initialize renderer
    this.renderer = new AdaptiveRenderer(this);

    // Auto-initialize storage if key provided
    if (this.config.storage.enabled && this.config.storage.encryptionKey) {
      this.initializeOfflineStorage(
        this.config.storage.encryptionKey,
        this.config.storage,
      ).catch((error) =>
        console.warn(
          "[HybridStateManager] Failed to auto-initialize storage:",
          error,
        ),
      );
    }
  }

  // ==========================================
  // MODERN STORAGE INTEGRATION METHODS
  // ==========================================

  /**
   * Initialize modern offline storage
   */
  async initializeOfflineStorage(encryptionKey, options = {}) {
    if (this.managers.offline) {
      console.warn("[HybridStateManager] Offline storage already initialized");
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
        storageOptions,
      );
      await this.managers.offline.init();

      // Setup auto-save if enabled
      if (this.config.storage.autoSave) {
        this.setupAutoSave();
      }

      console.log(
        "[HybridStateManager] Modern offline storage initialized successfully",
      );
      this.emit("storageInitialized", { manager: this.managers.offline });

      return this.managers.offline;
    } catch (error) {
      console.error(
        "[HybridStateManager] Failed to initialize offline storage:",
        error,
      );
      throw error;
    }
  }

  /**
   * Set user security context (call after login)
   */
  async setUserContext(
    userId,
    clearance,
    compartments = [],
    ttl = 4 * 3600000,
  ) {
    if (!this.managers.offline) {
      throw new Error(
        "Offline storage not initialized. Call initializeOfflineStorage() first.",
      );
    }

    await this.managers.offline.setUser(userId, clearance, compartments, ttl);
    console.log(
      `[HybridStateManager] User context set: ${userId} (${clearance})`,
    );

    this.emit("userContextSet", { userId, clearance, compartments });
    return this;
  }

  /**
   * Manual save to offline storage
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
        `[HybridStateManager] Saved ${result.saved} entities (${saveTime.toFixed(2)}ms)`,
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
   * Manual load from offline storage
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
        `[HybridStateManager] Loaded ${result.loaded} entities (${loadTime.toFixed(2)}ms)`,
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
   * Enhanced executeOperation with integrated auto-save
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

      this.emit("operationExecuted", { operation, result, operationTime });
      return result;
    } catch (error) {
      console.error("[HybridStateManager] Operation failed:", operation, error);
      this.emit("operationError", { operation, error });
      throw error;
    }
  }

  /**
   * Core operation execution (unchanged from your existing logic)
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
   * Create entity with validation and auto-save
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
   * Update entity with validation
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
   * Setup auto-save functionality
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
   * Schedule auto-save with debouncing
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
   * Determine if operation should trigger auto-save
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
   * Update memory metrics
   */
  updateMemoryMetrics() {
    this.metrics.memory.entitiesCount = this.clientState.entities.size;
    this.metrics.memory.relationshipsCount =
      this.clientState.relationships.size;
    this.metrics.memory.cacheSize = this.clientState.cache.size;
    this.metrics.memory.undoStackSize = this.clientState.undoStack.size;
  }

  /**
   * Get comprehensive system status including storage
   */
  getSystemStatus() {
    return {
      initialized: true,
      storage: {
        enabled: this.config.storage.enabled,
        ready: this.managers.offline?.isReady || false,
        hasValidContext: this.managers.offline?.hasValidContext || false,
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
   * Enhanced cleanup including storage
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

  emit(event, data = {}) {
    const listeners = this.listeners.get(event) || [];
    listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (error) {
        console.warn(
          `[HybridStateManager] Listener error for ${event}:`,
          error,
        );
      }
    });
  }

  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(listener);
    return () => this.off(event, listener);
  }

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
  validateOperation(operation) {
    if (!operation.type) {
      throw new Error("Operation must have a type");
    }
    if (!operation.id) {
      operation.id = this.generateOperationId();
    }
  }

  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateId() {
    return `ent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default HybridStateManager;
