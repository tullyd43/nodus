// modules/sync-stack.js
// Sync stack for orchestrating different sync strategies

/**
 * Sync Stack Module
 * Loaded for: configurations requiring sync capabilities
 * Bundle size: ~4KB (sync orchestration and conflict resolution)
 */
export default class SyncStack {
  #syncModules = [];
  #conflictResolver;
  #syncQueue = [];
  #syncStatus = new Map();
  #config;
  #metrics = {
    syncOperations: 0,
    conflictsResolved: 0,
    syncErrors: 0,
    averageSyncTime: 0,
    lastSyncTime: null
  };

  constructor(syncModules = [], options = {}) {
    this.#syncModules = syncModules;
    this.#config = {
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      batchSize: options.batchSize || 50,
      syncInterval: options.syncInterval || 30000, // 30 seconds
      offlineQueueLimit: options.offlineQueueLimit || 1000,
      enableConflictResolution: options.enableConflictResolution !== false,
      ...options
    };

    console.log(`[SyncStack] Loaded with ${syncModules.length} sync modules`);
  }

  async init() {
    // Initialize all sync modules
    for (const module of this.#syncModules) {
      if (module.init) {
        await module.init();
      }
    }

    // Initialize conflict resolver if enabled
    if (this.#config.enableConflictResolution) {
      this.#conflictResolver = new ConflictResolver(this.#config);
    }

    console.log('[SyncStack] Sync stack initialized');
    return this;
  }

  /**
   * Perform synchronization
   */
  async performSync(options = {}) {
    const startTime = performance.now();
    const syncId = this.#generateSyncId();
    
    this.#syncStatus.set(syncId, {
      status: 'in_progress',
      startTime,
      operation: options.operation || 'full_sync'
    });

    try {
      let result;
      
      switch (options.operation) {
        case 'push':
          result = await this.#performPush(options);
          break;
        case 'pull':
          result = await this.#performPull(options);
          break;
        case 'bidirectional':
        default:
          result = await this.#performBidirectionalSync(options);
          break;
      }

      const syncTime = performance.now() - startTime;
      this.#updateSyncMetrics(true, syncTime);
      
      this.#syncStatus.set(syncId, {
        status: 'completed',
        startTime,
        endTime: performance.now(),
        result
      });

      return result;

    } catch (error) {
      this.#updateSyncMetrics(false, performance.now() - startTime);
      
      this.#syncStatus.set(syncId, {
        status: 'failed',
        startTime,
        endTime: performance.now(),
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Queue item for offline sync
   */
  async queueForSync(item, operation = 'update') {
    if (this.#syncQueue.length >= this.#config.offlineQueueLimit) {
      // Remove oldest items to make room
      this.#syncQueue.shift();
    }

    const queueItem = {
      id: this.#generateSyncId(),
      item,
      operation,
      timestamp: Date.now(),
      retryCount: 0
    };

    this.#syncQueue.push(queueItem);
    console.log(`[SyncStack] Queued ${operation} for offline sync: ${item.id}`);
    
    return queueItem.id;
  }

  /**
   * Process offline queue
   */
  async processOfflineQueue() {
    if (this.#syncQueue.length === 0) {
      return { processed: 0, failed: 0 };
    }

    console.log(`[SyncStack] Processing ${this.#syncQueue.length} queued items`);
    
    let processed = 0;
    let failed = 0;
    const failedItems = [];

    // Process in batches
    const batches = this.#createBatches(this.#syncQueue, this.#config.batchSize);
    
    for (const batch of batches) {
      try {
        await this.#processBatch(batch);
        processed += batch.length;
      } catch (error) {
        console.warn(`[SyncStack] Batch processing failed:`, error);
        failed += batch.length;
        failedItems.push(...batch);
      }
    }

    // Keep failed items for retry
    this.#syncQueue = failedItems;

    return { processed, failed };
  }

  /**
   * Get sync status
   */
  getSyncStatus(syncId = null) {
    if (syncId) {
      return this.#syncStatus.get(syncId);
    }
    
    return {
      queueSize: this.#syncQueue.length,
      activeSyncs: Array.from(this.#syncStatus.values()).filter(s => s.status === 'in_progress').length,
      metrics: this.#metrics
    };
  }

  /**
   * Clear sync queue
   */
  clearQueue() {
    const queueSize = this.#syncQueue.length;
    this.#syncQueue = [];
    console.log(`[SyncStack] Cleared ${queueSize} items from sync queue`);
  }

  // Private sync methods
  async #performPush(options) {
    const results = [];
    
    for (const module of this.#syncModules) {
      if (module.supportsPush) {
        try {
          const result = await module.push(options);
          results.push({
            module: module.name || module.constructor.name,
            result
          });
        } catch (error) {
          console.error(`[SyncStack] Push failed for module ${module.name}:`, error);
          results.push({
            module: module.name || module.constructor.name,
            error: error.message
          });
        }
      }
    }

    return {
      operation: 'push',
      results,
      timestamp: Date.now()
    };
  }

  async #performPull(options) {
    const results = [];
    
    for (const module of this.#syncModules) {
      if (module.supportsPull) {
        try {
          const result = await module.pull(options);
          results.push({
            module: module.name || module.constructor.name,
            result
          });
        } catch (error) {
          console.error(`[SyncStack] Pull failed for module ${module.name}:`, error);
          results.push({
            module: module.name || module.constructor.name,
            error: error.message
          });
        }
      }
    }

    return {
      operation: 'pull',
      results,
      timestamp: Date.now()
    };
  }

  async #performBidirectionalSync(options) {
    // 1. Pull changes from server
    const pullResult = await this.#performPull(options);
    
    // 2. Resolve conflicts if any
    let conflicts = [];
    if (this.#conflictResolver) {
      conflicts = await this.#conflictResolver.resolveConflicts(pullResult);
      this.#metrics.conflictsResolved += conflicts.length;
    }

    // 3. Push local changes
    const pushResult = await this.#performPush(options);

    return {
      operation: 'bidirectional',
      pullResult,
      pushResult,
      conflicts,
      timestamp: Date.now()
    };
  }

  async #processBatch(batch) {
    const promises = batch.map(async item => {
      try {
        // Find appropriate sync module for this item
        const module = this.#findSyncModule(item);
        if (!module) {
          throw new Error(`No sync module found for item type: ${item.item.entity_type}`);
        }

        // Perform sync operation
        const result = await module.syncItem(item.item, item.operation);
        
        return {
          id: item.id,
          success: true,
          result
        };
      } catch (error) {
        item.retryCount++;
        
        if (item.retryCount < this.#config.maxRetries) {
          // Add back to queue for retry
          setTimeout(() => {
            this.#syncQueue.push(item);
          }, this.#config.retryDelay * item.retryCount);
        }

        return {
          id: item.id,
          success: false,
          error: error.message,
          retryCount: item.retryCount
        };
      }
    });

    return await Promise.allSettled(promises);
  }

  #findSyncModule(item) {
    return this.#syncModules.find(module => 
      module.supportsItem && module.supportsItem(item.item)
    ) || this.#syncModules[0]; // Fallback to first module
  }

  #createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  #generateSyncId() {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  #updateSyncMetrics(success, syncTime) {
    this.#metrics.syncOperations++;
    this.#metrics.lastSyncTime = Date.now();
    
    if (!success) {
      this.#metrics.syncErrors++;
    }

    // Update average sync time
    const totalTime = (this.#metrics.averageSyncTime * (this.#metrics.syncOperations - 1)) + syncTime;
    this.#metrics.averageSyncTime = totalTime / this.#metrics.syncOperations;
  }
}

/**
 * Conflict Resolution Helper
 */
class ConflictResolver {
  constructor(config) {
    this.config = config;
  }

  async resolveConflicts(syncResult) {
    const conflicts = this.#detectConflicts(syncResult);
    const resolved = [];

    for (const conflict of conflicts) {
      try {
        const resolution = await this.#resolveConflict(conflict);
        resolved.push(resolution);
      } catch (error) {
        console.error('[SyncStack] Conflict resolution failed:', error);
        resolved.push({
          ...conflict,
          resolved: false,
          error: error.message
        });
      }
    }

    return resolved;
  }

  #detectConflicts(syncResult) {
    // Simple conflict detection - look for items with different timestamps
    const conflicts = [];
    
    for (const moduleResult of syncResult.results) {
      if (moduleResult.result?.conflicts) {
        conflicts.push(...moduleResult.result.conflicts);
      }
    }

    return conflicts;
  }

  async #resolveConflict(conflict) {
    // Simple resolution strategy: last writer wins
    const localTime = new Date(conflict.local.updated_at).getTime();
    const remoteTime = new Date(conflict.remote.updated_at).getTime();

    const winner = localTime > remoteTime ? conflict.local : conflict.remote;
    
    return {
      ...conflict,
      resolved: true,
      resolution: 'last_writer_wins',
      winner: winner === conflict.local ? 'local' : 'remote',
      resolvedItem: winner
    };
  }
}
