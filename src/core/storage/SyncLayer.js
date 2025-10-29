// core/sync/SyncLayer.js
// Bidirectional sync with conflict resolution - separate from validation

/**
 * Sync Layer - Handles Data Synchronization
 * 
 * PURPOSE:
 * - Bidirectional sync between client and server
 * - Conflict detection and resolution
 * - Network resilience and retry logic
 * - Batch processing for efficiency
 * 
 * SEPARATE FROM VALIDATION:
 * - Validation ensures data correctness
 * - Sync ensures data consistency across systems
 * - Validation happens before sync
 * - Sync handles merging and conflicts
 */
export class SyncLayer {
  #storage;
  #config;
  #syncQueue = [];
  #conflictQueue = [];
  #metrics;
  #ready = false;
  #syncInProgress = false;
  #retryTimeouts = new Map();
  stateManager = null;

  bindStateManager(manager) {
    this.stateManager = manager;
  }

  constructor(storage, options = {}) {
    this.#storage = storage;
    this.#config = {
      apiEndpoint: options.apiEndpoint || '/api/sync',
      conflictResolution: options.conflictResolution || 'user_guided',
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      batchSize: options.batchSize || 100,
      syncInterval: options.syncInterval || 30000, // 30 seconds
      enableAutoSync: options.enableAutoSync !== false,
      ...options
    };

    this.#metrics = {
      syncCount: 0,
      conflictCount: 0,
      errorCount: 0,
      averageLatency: 0,
      lastSync: null,
      queueSize: 0,
      recentConflicts: []
    };
  }

  /**
   * Initialize sync layer
   */
  async init() {
    if (this.#ready) return this;

    // Setup auto-sync if enabled
    if (this.#config.enableAutoSync) {
      this.#setupAutoSync();
    }

    // Setup network change listeners
    this.#setupNetworkListeners();

    this.#ready = true;
    console.log('[SyncLayer] Ready with bidirectional sync');
    return this;
  }

  /**
   * Perform sync operation
   */
  async performSync(options = {}) {
    if (!this.#ready) throw new Error('SyncLayer not initialized');
    if (this.#syncInProgress) {
      console.log('[SyncLayer] Sync already in progress, queuing request');
      return this.#queueSyncRequest(options);
    }

    this.#syncInProgress = true;
    const startTime = performance.now();

    try {
      const {
        direction = 'bidirectional',
        conflictResolution = this.#config.conflictResolution,
        batchSize = this.#config.batchSize,
        force = false
      } = options;

      let result = { up: null, down: null, conflicts: [] };

      // Upload changes to server
      if (direction === 'up' || direction === 'bidirectional') {
        result.up = await this.#syncUp(batchSize, force);
      }

      // Download changes from server
      if (direction === 'down' || direction === 'bidirectional') {
        result.down = await this.#syncDown(batchSize, force);
      }

      // Handle conflicts
      if (result.up?.conflicts?.length > 0 || result.down?.conflicts?.length > 0) {
        const allConflicts = [
          ...(result.up?.conflicts || []),
          ...(result.down?.conflicts || [])
        ];
        result.conflicts = await this.#resolveConflicts(allConflicts, conflictResolution);
      }

      const latency = performance.now() - startTime;
      this.#recordSync(true, latency, result);

      this.stateManager?.emit?.('syncCompleted', result);

      console.log(`[SyncLayer] Sync completed in ${latency.toFixed(2)}ms`);
      return result;

    } catch (error) {
      const latency = performance.now() - startTime;
      this.#recordSync(false, latency, null, error);
      
      this.stateManager?.emit?.('syncError', error);

      console.error('[SyncLayer] Sync failed:', error);
      throw error;
    } finally {
      this.#syncInProgress = false;
      this.#processQueuedSyncs();
    }
  }

  /**
   * Add entity to sync queue
   */
  queueEntityForSync(entity, operation = 'upsert') {
    const queueItem = {
      id: entity.id,
      entity,
      operation, // 'upsert', 'delete'
      timestamp: Date.now(),
      retries: 0
    };

    this.#syncQueue.push(queueItem);
    this.#metrics.queueSize = this.#syncQueue.length;

    // Trigger sync if auto-sync is enabled
    if (this.#config.enableAutoSync) {
      this.#debouncedSync();
    }
  }

  /**
   * Get sync conflicts requiring resolution
   */
  getPendingConflicts() {
    return this.#conflictQueue.map(conflict => ({
      id: conflict.id,
      entityType: conflict.entityType,
      conflictType: conflict.type,
      local: conflict.localEntity,
      remote: conflict.remoteEntity,
      timestamp: conflict.timestamp
    }));
  }

  /**
   * Resolve conflict with user choice
   */
  async resolveConflict(conflictId, resolution, customEntity = null) {
    const conflictIndex = this.#conflictQueue.findIndex(c => c.id === conflictId);
    if (conflictIndex === -1) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    const conflict = this.#conflictQueue[conflictIndex];
    let resolvedEntity;

    switch (resolution) {
      case 'use_local':
        resolvedEntity = conflict.localEntity;
        break;
      case 'use_remote':
        resolvedEntity = conflict.remoteEntity;
        break;
      case 'merge_auto':
        resolvedEntity = this.#autoMergeEntities(conflict.localEntity, conflict.remoteEntity);
        break;
      case 'use_custom':
        if (!customEntity) {
          throw new Error('Custom entity required for custom resolution');
        }
        resolvedEntity = customEntity;
        break;
      default:
        throw new Error(`Unknown conflict resolution: ${resolution}`);
    }

    // Apply resolution
    await this.#storage.saveEntity(resolvedEntity);
    
    // Remove from conflict queue
    this.#conflictQueue.splice(conflictIndex, 1);
    
    console.log(`[SyncLayer] Resolved conflict ${conflictId} using ${resolution}`);
    return resolvedEntity;
  }

  /**
   * Get sync statistics
   */
  getStats() {
    return {
      ...this.#metrics,
      queueSize: this.#syncQueue.length,
      conflictQueueSize: this.#conflictQueue.length,
      isReady: this.#ready,
      syncInProgress: this.#syncInProgress
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.#autoSyncInterval) {
      clearInterval(this.#autoSyncInterval);
    }
    
    // Clear retry timeouts
    for (const timeout of this.#retryTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.#retryTimeouts.clear();

    this.#ready = false;
  }

  // ===== PRIVATE SYNC METHODS =====

  /**
   * Sync local changes to server
   */
  async #syncUp(batchSize, force) {
    if (this.#syncQueue.length === 0 && !force) {
      return { synced: 0, conflicts: [], errors: [] };
    }

    const batch = this.#syncQueue.splice(0, batchSize);
    const conflicts = [];
    const errors = [];
    let synced = 0;

    for (const item of batch) {
      try {
        const response = await this.#sendToServer(item);
        
        if (response.conflict) {
          conflicts.push({
            id: crypto.randomUUID(),
            entityId: item.entity.id,
            entityType: item.entity.entity_type,
            type: response.conflictType,
            localEntity: item.entity,
            remoteEntity: response.remoteEntity,
            timestamp: Date.now()
          });
        } else {
          synced++;
        }

      } catch (error) {
        console.warn(`Failed to sync entity ${item.entity.id}:`, error);
        errors.push({
          entityId: item.entity.id,
          error: error.message,
          retries: item.retries
        });

        // Retry logic
        if (item.retries < this.#config.maxRetries) {
          item.retries++;
          this.#scheduleRetry(item);
        }
      }
    }

    this.#metrics.queueSize = this.#syncQueue.length;
    return { synced, conflicts, errors };
  }

  /**
   * Sync remote changes from server
   */
  async #syncDown(batchSize, force) {
    try {
      const lastSync = this.#metrics.lastSync || new Date(0).toISOString();
      const response = await this.#fetchFromServer({
        since: lastSync,
        limit: batchSize,
        organizationId: this.#storage.currentOrganization
      });

      const conflicts = [];
      const errors = [];
      let synced = 0;

      for (const remoteEntity of response.entities) {
        try {
          // Check for local version
          const localEntity = this.#storage.database.get(remoteEntity.id);
          
          if (localEntity && this.#hasConflict(localEntity, remoteEntity)) {
            conflicts.push({
              id: crypto.randomUUID(),
              entityId: remoteEntity.id,
              entityType: remoteEntity.entity_type,
              type: 'update_conflict',
              localEntity,
              remoteEntity,
              timestamp: Date.now()
            });
          } else {
            // No conflict, apply remote changes
            await this.#storage.saveEntity(remoteEntity);
            synced++;
          }

        } catch (error) {
          console.warn(`Failed to apply remote entity ${remoteEntity.id}:`, error);
          errors.push({
            entityId: remoteEntity.id,
            error: error.message
          });
        }
      }

      return { synced, conflicts, errors };

    } catch (error) {
      console.error('[SyncLayer] Failed to fetch from server:', error);
      throw error;
    }
  }

  /**
   * Resolve conflicts based on strategy
   */
  async #resolveConflicts(conflicts, strategy) {
    const resolved = [];
    const unresolved = [];

    for (const conflict of conflicts) {
      try {
        let resolution;

        switch (strategy) {
          case 'last_write_wins':
            resolution = this.#resolveLastWriteWins(conflict);
            break;
          case 'first_write_wins':
            resolution = this.#resolveFirstWriteWins(conflict);
            break;
          case 'auto_merge':
            resolution = this.#autoMergeEntities(conflict.localEntity, conflict.remoteEntity);
            break;
          case 'user_guided':
            // Add to conflict queue for user resolution
            this.#conflictQueue.push(conflict);
            unresolved.push(conflict);
            continue;
          default:
            throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
        }

        if (resolution) {
          await this.#storage.saveEntity(resolution);
          resolved.push({
            conflictId: conflict.id,
            resolution: strategy,
            entity: resolution
          });
        }

      } catch (error) {
        console.warn(`Failed to resolve conflict ${conflict.id}:`, error);
        unresolved.push(conflict);
      }
    }

    this.#metrics.conflictCount += conflicts.length;
    this.#metrics.recentConflicts.push(...conflicts.slice(0, 10));
    
    // Keep only recent conflicts
    if (this.#metrics.recentConflicts.length > 50) {
      this.#metrics.recentConflicts = this.#metrics.recentConflicts.slice(-50);
    }

    return { resolved, unresolved };
  }

  /**
   * Check if entities have conflicts
   */
  #hasConflict(localEntity, remoteEntity) {
    // Simple timestamp-based conflict detection
    const localTime = new Date(localEntity.updated_at).getTime();
    const remoteTime = new Date(remoteEntity.updated_at).getTime();
    
    // If both have been updated since last sync, it's a conflict
    const lastSyncTime = this.#metrics.lastSync ? new Date(this.#metrics.lastSync).getTime() : 0;
    
    return localTime > lastSyncTime && remoteTime > lastSyncTime && localTime !== remoteTime;
  }

  /**
   * Auto-merge entities (simple field-level merge)
   */
  #autoMergeEntities(localEntity, remoteEntity) {
    const merged = { ...localEntity };
    
    // Merge fields, preferring newer values
    for (const [key, value] of Object.entries(remoteEntity)) {
      if (key === 'id') continue; // Never change ID
      
      if (key === 'updated_at' || key === 'created_at') {
        // Keep the later timestamp
        const localTime = new Date(localEntity[key] || 0).getTime();
        const remoteTime = new Date(value || 0).getTime();
        merged[key] = remoteTime > localTime ? value : localEntity[key];
      } else if (localEntity[key] === undefined || localEntity[key] === null) {
        // Use remote value if local is empty
        merged[key] = value;
      } else if (value !== undefined && value !== null) {
        // Both have values, use remote (could be more sophisticated)
        merged[key] = value;
      }
    }
    
    // Update modification timestamp
    merged.updated_at = new Date().toISOString();
    
    return merged;
  }

  /**
   * Last write wins resolution
   */
  #resolveLastWriteWins(conflict) {
    const localTime = new Date(conflict.localEntity.updated_at).getTime();
    const remoteTime = new Date(conflict.remoteEntity.updated_at).getTime();
    
    return remoteTime > localTime ? conflict.remoteEntity : conflict.localEntity;
  }

  /**
   * First write wins resolution
   */
  #resolveFirstWriteWins(conflict) {
    const localTime = new Date(conflict.localEntity.updated_at).getTime();
    const remoteTime = new Date(conflict.remoteEntity.updated_at).getTime();
    
    return localTime < remoteTime ? conflict.localEntity : conflict.remoteEntity;
  }

  /**
   * Send entity to server
   */
  async #sendToServer(item) {
    const response = await fetch(`${this.#config.apiEndpoint}/entities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.#getAuthToken()}`
      },
      body: JSON.stringify({
        entity: item.entity,
        operation: item.operation,
        timestamp: item.timestamp
      })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Fetch entities from server
   */
  async #fetchFromServer(params) {
    const url = new URL(`${this.#config.apiEndpoint}/entities`, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.#getAuthToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get authentication token
   */
  #getAuthToken() {
    // This would come from your auth system
    return localStorage.getItem('auth_token') || 'demo-token';
  }

  /**
   * Setup automatic sync
   */
  #setupAutoSync() {
    this.#autoSyncInterval = setInterval(() => {
      if (!this.#syncInProgress && this.#syncQueue.length > 0) {
        this.performSync().catch(error => {
          console.warn('[SyncLayer] Auto-sync failed:', error);
        });
      }
    }, this.#config.syncInterval);
  }

  /**
   * Setup network change listeners
   */
  #setupNetworkListeners() {
    if (typeof window !== 'undefined' && 'navigator' in window) {
      window.addEventListener('online', () => {
        console.log('[SyncLayer] Network online, triggering sync');
        this.performSync().catch(console.warn);
      });

      window.addEventListener('offline', () => {
        console.log('[SyncLayer] Network offline, sync paused');
      });
    }
  }

  /**
   * Debounced sync trigger
   */
  #debouncedSync() {
    clearTimeout(this.#syncDebounceTimeout);
    this.#syncDebounceTimeout = setTimeout(() => {
      if (!this.#syncInProgress) {
        this.performSync().catch(console.warn);
      }
    }, 1000);
  }

  /**
   * Schedule retry for failed sync
   */
  #scheduleRetry(item) {
    const delay = this.#config.retryDelay * Math.pow(2, item.retries - 1); // Exponential backoff
    
    const timeout = setTimeout(() => {
      this.#syncQueue.push(item);
      this.#metrics.queueSize = this.#syncQueue.length;
      this.#retryTimeouts.delete(item.entity.id);
    }, delay);

    this.#retryTimeouts.set(item.entity.id, timeout);
  }

  /**
   * Queue sync request when sync is in progress
   */
  async #queueSyncRequest(options) {
    return new Promise((resolve, reject) => {
      const checkAndExecute = () => {
        if (!this.#syncInProgress) {
          this.performSync(options).then(resolve).catch(reject);
        } else {
          setTimeout(checkAndExecute, 100);
        }
      };
      checkAndExecute();
    });
  }

  /**
   * Process any queued sync requests
   */
  #processQueuedSyncs() {
    // If there are items in the queue and we're not syncing, trigger another sync
    if (this.#syncQueue.length > 0 && !this.#syncInProgress) {
      setTimeout(() => {
        this.performSync().catch(console.warn);
      }, 100);
    }
  }

  /**
   * Record sync metrics
   */
  #recordSync(success, latency, result, error = null) {
    this.#metrics.syncCount++;
    this.#metrics.lastSync = new Date().toISOString();
    
    if (!success) {
      this.#metrics.errorCount++;
    }

    // Update average latency
    this.#metrics.averageLatency = 
      (this.#metrics.averageLatency * (this.#metrics.syncCount - 1) + latency) / 
      this.#metrics.syncCount;
  }
}

export default SyncLayer;
