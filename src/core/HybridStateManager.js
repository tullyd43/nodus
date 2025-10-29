// core/HybridStateManager_Enhanced.js
// Enhanced HybridStateManager with dynamic storage loading and database schema integration

import { BoundedStack } from './utils/BoundedStack.js';
import { LRUCache } from './utils/LRUCache.js';
import AdaptiveRenderer from './AdaptiveRenderer.js';
import { componentRegistry } from './ComponentDefinition.js';
import { StorageLoader } from './storage/StorageLoader.js';

export class HybridStateManager {
  constructor(config = {}) {
    this.config = {
      maxUndoStackSize: config.maxUndoStackSize || 50,
      maxViewportItems: config.maxViewportItems || 200,
      performanceMode: config.performanceMode || false,
      offlineEnabled: config.offlineEnabled || true,
      embeddingEnabled: config.embeddingEnabled || true,
      
      // NEW: Dynamic storage configuration
      storageConfig: {
        demoMode: config.demoMode || false,
        auditLevel: config.auditLevel || 'standard',
        strictValidation: config.strictValidation || false,
        enableSync: config.enableSync !== false,
        realtimeSync: config.realtimeSync || false,
        ...config.storageConfig
      },
      
      ...config
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
        currentFilter: null
      },
      
      selectedEntities: new Set(),
      dragState: null,
      
      // Performance cache
      cache: new LRUCache(1000, { ttl: 30 * 60 * 1000 })
    };

    // NEW: Dynamic storage system
    this.storage = {
      loader: null,
      instance: null,
      ready: false,
      config: null
    };

    // NEW: Schema metadata from database
    this.schema = {
      entities: new Map(),      // Entity type definitions from database
      fields: new Map(),        // Field definitions from type_definitions table
      relationships: new Map(), // Relationship type definitions
      classifications: new Set(), // Security classifications
      loaded: false
    };

    // Type definitions registry (now populated from database)
    this.typeDefinitions = new Map();

    // Plugin management (unchanged)
    this.plugins = {
      active: new Set(),
      loaded: new Map(),
      configs: new Map(),
      loadingStrategies: new Map()
    };

    // Extension-based server capabilities (unchanged)
    this.serverCapabilities = {
      discovered: new Map(),
      endpoints: new Map(),
      routing: new Map(),
      fallbacks: new Map(),
      lastDiscovery: 0,
      discoveryInterval: 5 * 60 * 1000
    };

    // State change listeners (unchanged)
    this.listeners = new Map();
    this.viewModelBindings = new Map();

    // Component managers (enhanced with storage)
    this.managers = {
      offline: null,
      sync: null,
      plugin: null,
      embedding: null,
      extension: null,
      validation: null  // NEW: Validation manager
    };

    // Enhanced metrics (unchanged structure)
    this.metrics = {
      operationLatencies: [],
      bundleSize: 0,
      embeddingCacheHitRate: 0,
      embeddingProcessingTimes: [],
      embeddingBatchEfficiency: 0,
      
      routing: {
        serverSuccessRate: 0,
        clientFallbackRate: 0,
        adaptiveDecisions: 0,
        extensionRoutingCount: 0
      },
      
      rendering: {
        adaptiveRenderTimes: [],
        templateRenderTimes: [],
        averageRenderTime: 0,
        averageAdaptiveRenderTime: 0,
        componentCacheHitRate: 0
      },

      memory: {
        entitiesCount: 0,
        relationshipsCount: 0,
        cacheSize: 0,
        undoStackSize: 0
      },

      interaction: {
        commandsExecuted: 0,
        actionsTriggered: 0,
        conditionsEvaluated: 0
      },
      
      // NEW: Storage metrics
      storage: {
        loadTime: 0,
        saveTime: 0,
        syncTime: 0,
        validationTime: 0,
        securityChecks: 0
      }
    };

    // Vector Embedding State Management (unchanged)
    this.embeddingState = {
      contentCache: new LRUCache(1000, {
        ttl: 24 * 60 * 60 * 1000,
        onEvict: (key, value) => this.onEmbeddingCacheEvict(key, value)
      }),
      
      processingQueues: {
        immediate: [],
        batched: [],
        deferred: []
      },
      
      batchConfig: {
        maxSizes: {
          entity_embeddings: 50,
          field_embeddings: 100,
          relationship_embeddings: 25
        },
        timeouts: {
          immediate: 100,
          batched: 5000,
          deferred: 30000
        }
      },
      
      modelConfig: {
        version: 'text-embedding-3-small',
        dimensions: 1536,
        maxTokens: 8192
      },
      
      isProcessing: false,
      lastBatchTime: 0,
      activeRequests: new Set(),
      
      routingDecisions: {
        clientCount: 0,
        serverCount: 0,
        reasonCounts: {
          'all_cached': 0,
          'immediate_priority': 0,
          'large_volume': 0,
          'offline': 0,
          'rate_limited': 0,
          'user_facing_cached': 0,
          'default_server': 0,
          'extension_routed': 0
        },
        avgCacheHitRate: 0,
        avgContentVolume: 0
      }
    };

    // Circuit breaker for server operations (unchanged)
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: 0,
      threshold: 5,
      timeout: 30000,
      halfOpenAttempts: 0,
      maxHalfOpenAttempts: 3
    };

    // Initialize adaptive renderer (unchanged)
    this.adaptiveRenderer = new AdaptiveRenderer(this);
    
    this.initialized = false;
  }

  /**
   * NEW: Initialize with dynamic storage system
   */
  async initialize(authContext = {}) {
    if (this.initialized) return;

    try {
      // 1. Initialize storage loader first
      await this.initializeStorageSystem(authContext);
      
      // 2. Load schema from database
      await this.loadDatabaseSchema();
      
      // 3. Load type definitions from database schema
      await this.loadTypeDefinitionsFromSchema();

      // 4. Initialize persistent queue
      await this.clientState.pendingOperations.initialize?.();

      // 5. Load essential managers (lazy-loaded to keep bundle small)
      await this.loadManager('offline');
      await this.loadManager('embedding');
      await this.loadManager('extension');
      await this.loadManager('validation');

      // 6. Discover server capabilities from extensions
      await this.discoverServerCapabilities();

      // 7. Load active plugins based on configuration
      await this.loadActivePlugins();

      // 8. Load component definitions into adaptive renderer
      await this.loadComponentDefinitions();

      // 9. Set up MVVM bindings
      this.setupViewModelBindings();

      // 10. Start performance monitoring if enabled
      if (this.config.performanceMode) {
        this.startPerformanceMonitoring();
      }

      this.initialized = true;
      this.emit('initialized', { 
        timestamp: Date.now(), 
        storageModules: this.storage.instance?.modules || [],
        schemaLoaded: this.schema.loaded
      });

    } catch (error) {
      console.error('HybridStateManager initialization failed:', error);
      this.emit('initializationFailed', { error });
      throw error;
    }
  }

  /**
   * NEW: Initialize dynamic storage system
   */
  async initializeStorageSystem(authContext) {
    const startTime = performance.now();
    
    try {
      // Create storage loader
      this.storage.loader = new StorageLoader({
        baseURL: '/modules/',
        preloadModules: this.config.storageConfig.demoMode ? ['demo-crypto'] : [],
        cacheModules: true
      });

      await this.storage.loader.init();

      // Create storage instance with user context
      this.storage.instance = await this.storage.loader.createStorage(
        authContext,
        this.config.storageConfig
      );

      // Link HybridStateManager ↔ ModularOfflineStorage
      this.storage.instance.bindStateManager?.(this);

      this.storage.ready = true;
      this.storage.config = this.config.storageConfig;
      
      this.metrics.storage.loadTime = performance.now() - startTime;
      
      console.log(`[HybridStateManager] Dynamic storage initialized with modules: ${this.storage.instance.modules.join(', ')}`);
      
    } catch (error) {
      console.error('[HybridStateManager] Storage initialization failed:', error);
      throw error;
    }
  }

  /**
   * NEW: Load schema from database (single source of truth)
   */
  async loadDatabaseSchema() {
    try {
      // In a real implementation, this would query the database
      // For now, we'll simulate with the schema structure from nodus.sql
      
      // Load entity types from objects table structure
      this.schema.entities.set('objects', {
        tableName: 'objects',
        primaryKey: 'id',
        fields: {
          id: { type: 'uuid', required: true },
          organization_id: { type: 'uuid', required: true },
          entity_type: { type: 'text', required: true },
          display_name: { type: 'text' },
          description: { type: 'text' },
          content: { type: 'jsonb' },
          status: { type: 'text', default: 'active' },
          priority: { type: 'integer', default: 0 },
          tags: { type: 'text[]', default: '{}' },
          classification: { type: 'security_classification', default: 'restricted' },
          compartment_markings: { type: 'text[]', default: '{}' },
          created_at: { type: 'timestamptz', default: 'now()' },
          updated_at: { type: 'timestamptz', default: 'now()' },
          created_by: { type: 'uuid', required: true },
          updated_by: { type: 'uuid', required: true },
          version: { type: 'integer', default: 1 },
          sync_state: { type: 'sync_state', default: 'local_dirty' },
          last_synced: { type: 'timestamptz' }
        }
      });

      // Load events table structure
      this.schema.entities.set('events', {
        tableName: 'events',
        primaryKey: 'id',
        fields: {
          id: { type: 'uuid', required: true },
          organization_id: { type: 'uuid', required: true },
          event_type: { type: 'text', required: true },
          source_entity_id: { type: 'uuid' },
          target_entity_id: { type: 'uuid' },
          event_data: { type: 'jsonb' },
          classification: { type: 'security_classification', default: 'restricted' },
          compartment_markings: { type: 'text[]', default: '{}' },
          created_at: { type: 'timestamptz', default: 'now()' },
          created_by: { type: 'uuid', required: true }
        }
      });

      // Load relationships table structure
      this.schema.entities.set('links', {
        tableName: 'links',
        primaryKey: 'id',
        fields: {
          id: { type: 'uuid', required: true },
          org_id: { type: 'uuid', required: true },
          source_id: { type: 'uuid', required: true },
          target_id: { type: 'uuid', required: true },
          relationship_type: { type: 'text', required: true },
          metadata: { type: 'jsonb' },
          classification: { type: 'security_classification', default: 'restricted' },
          compartment_markings: { type: 'text[]', default: '{}' },
          created_at: { type: 'timestamptz', default: 'now()' },
          created_by: { type: 'uuid', required: true }
        }
      });

      // Load security classifications
      this.schema.classifications = new Set([
        'public', 'internal', 'restricted', 'confidential', 'secret', 'top_secret',
        'nato_restricted', 'nato_confidential', 'nato_secret', 'cosmic_top_secret'
      ]);

      this.schema.loaded = true;
      console.log('[HybridStateManager] Database schema loaded');
      
    } catch (error) {
      console.error('[HybridStateManager] Failed to load database schema:', error);
      throw error;
    }
  }

  /**
   * NEW: Load type definitions from database schema
   */
  async loadTypeDefinitionsFromSchema() {
    try {
      // Create type definitions based on database schema
      for (const [entityType, schemaInfo] of this.schema.entities.entries()) {
        const typeDef = {
          id: entityType,
          name: entityType.charAt(0).toUpperCase() + entityType.slice(1),
          table: schemaInfo.tableName,
          fields: this.convertSchemaToFields(schemaInfo.fields),
          actions: this.getDefaultActionsForType(entityType),
          security: {
            classificationField: 'classification',
            compartmentField: 'compartment_markings',
            ownerField: 'created_by'
          }
        };

        this.typeDefinitions.set(entityType, typeDef);
      }

      console.log(`[HybridStateManager] Loaded ${this.typeDefinitions.size} type definitions from schema`);
      
    } catch (error) {
      console.error('[HybridStateManager] Failed to load type definitions:', error);
      throw error;
    }
  }

  /**
   * NEW: Convert database schema fields to UI field definitions
   */
  convertSchemaToFields(schemaFields) {
    const uiFields = [];

    for (const [fieldName, fieldInfo] of Object.entries(schemaFields)) {
      // Skip internal system fields from UI
      if (['id', 'organization_id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'version'].includes(fieldName)) {
        continue;
      }

      const uiField = {
        name: fieldName,
        label: this.formatFieldLabel(fieldName),
        type: this.mapDatabaseTypeToUI(fieldInfo.type),
        required: fieldInfo.required || false,
        default: fieldInfo.default,
        validation: this.getFieldValidation(fieldName, fieldInfo)
      };

      // Special handling for security fields
      if (fieldName === 'classification') {
        uiField.type = 'select';
        uiField.options = Array.from(this.schema.classifications);
        uiField.security = true;
      }

      if (fieldName === 'compartment_markings') {
        uiField.type = 'tags';
        uiField.security = true;
      }

      uiFields.push(uiField);
    }

    return uiFields;
  }

  /**
   * NEW: Map database types to UI field types
   */
  mapDatabaseTypeToUI(dbType) {
    const typeMap = {
      'text': 'text',
      'varchar': 'text',
      'uuid': 'hidden',
      'integer': 'number',
      'boolean': 'checkbox',
      'jsonb': 'json',
      'text[]': 'tags',
      'timestamptz': 'datetime',
      'security_classification': 'select',
      'sync_state': 'hidden'
    };

    return typeMap[dbType] || 'text';
  }

  /**
   * NEW: Format field names for UI labels
   */
  formatFieldLabel(fieldName) {
    return fieldName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * NEW: Get field validation rules
   */
  getFieldValidation(fieldName, fieldInfo) {
    const validation = [];

    if (fieldInfo.required) {
      validation.push({ type: 'required', message: `${this.formatFieldLabel(fieldName)} is required` });
    }

    if (fieldInfo.type === 'text' && fieldName.includes('email')) {
      validation.push({ type: 'email', message: 'Must be a valid email address' });
    }

    if (fieldName === 'classification') {
      validation.push({ 
        type: 'security_classification', 
        message: 'Must be a valid security classification' 
      });
    }

    return validation;
  }

  /**
   * NEW: Get default actions for entity types
   */
  getDefaultActionsForType(entityType) {
    const baseActions = [
      { id: 'view', name: 'View', icon: 'eye', category: 'essential' },
      { id: 'edit', name: 'Edit', icon: 'edit', category: 'essential' },
      { id: 'delete', name: 'Delete', icon: 'trash', category: 'common', confirmation: true }
    ];

    const typeSpecificActions = {
      'objects': [
        { id: 'duplicate', name: 'Duplicate', icon: 'copy', category: 'common' },
        { id: 'export', name: 'Export', icon: 'download', category: 'advanced' }
      ],
      'events': [
        { id: 'replay', name: 'Replay Event', icon: 'refresh', category: 'advanced' }
      ],
      'links': [
        { id: 'visualize', name: 'Visualize', icon: 'network', category: 'common' }
      ]
    };

    return [...baseActions, ...(typeSpecificActions[entityType] || [])];
  }

  /**
   * ENHANCED: Save entity using dynamic storage
   */
  async saveEntity(entity) {
    const startTime = performance.now();
    
    try {
      if (!this.storage.ready) {
        throw new Error('Storage system not initialized');
      }

      // Validate entity using loaded validation modules
      const validation = await this.managers.validation?.validate(entity);
      if (validation && !validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Add to client state
      this.clientState.entities.set(entity.id, entity);
      
      // Save through dynamic storage system
      const result = await this.storage.instance.save();
      
      this.metrics.storage.saveTime = performance.now() - startTime;
      this.emit('entitySaved', { entity, result });
      
      return result;

    } catch (error) {
      console.error('[HybridStateManager] Failed to save entity:', error);
      this.emit('entitySaveFailed', { entity, error });
      throw error;
    }
  }

  /**
   * ENHANCED: Load entities using dynamic storage
   */
  async loadEntities(options = {}) {
    const startTime = performance.now();
    
    try {
      if (!this.storage.ready) {
        throw new Error('Storage system not initialized');
      }

      const result = await this.storage.instance.load(options);
      
      this.metrics.storage.loadTime = performance.now() - startTime;
      this.emit('entitiesLoaded', { result });
      
      return result;

    } catch (error) {
      console.error('[HybridStateManager] Failed to load entities:', error);
      this.emit('entitiesLoadFailed', { error });
      throw error;
    }
  }

  /**
   * NEW: Sync entities using dynamic storage
   */
  async syncEntities(options = {}) {
    const startTime = performance.now();
    
    try {
      if (!this.storage.ready || !this.storage.instance.sync) {
        console.warn('[HybridStateManager] Sync not available');
        return { synced: 0, skipped: 0 };
      }

      const result = await this.storage.instance.sync(options);
      
      this.metrics.storage.syncTime = performance.now() - startTime;
      this.emit('entitiesSynced', { result });
      
      return result;

    } catch (error) {
      console.error('[HybridStateManager] Failed to sync entities:', error);
      this.emit('entitiesSyncFailed', { error });
      throw error;
    }
  }

  /**
   * NEW: Set user security context
   */
  async setUserSecurityContext(userId, clearanceLevel, compartments = [], authProof = null, ttl = 4 * 3600000) {
    try {
      if (!this.storage.ready) {
        throw new Error('Storage system not initialized');
      }

      await this.storage.instance.setUser(userId, clearanceLevel, compartments, authProof, ttl);
      
      this.emit('securityContextSet', { userId, clearanceLevel, compartments });
      
    } catch (error) {
      console.error('[HybridStateManager] Failed to set security context:', error);
      throw error;
    }
  }

  /**
   * NEW: Get entity schema for type
   */
  getEntitySchema(entityType) {
    return this.schema.entities.get(entityType);
  }

  /**
   * NEW: Get type definition (UI-ready)
   */
  getTypeDefinition(entityType) {
    return this.typeDefinitions.get(entityType);
  }

  /**
   * NEW: Get all available entity types
   */
  getAvailableEntityTypes() {
    return Array.from(this.typeDefinitions.keys());
  }

  /**
   * NEW: Get security classifications
   */
  getSecurityClassifications() {
    return Array.from(this.schema.classifications);
  }

  /**
   * ENHANCED: Get storage metrics
   */
  getStorageMetrics() {
    return {
      ...this.metrics.storage,
      storageReady: this.storage.ready,
      loadedModules: this.storage.instance?.modules || [],
      schemaLoaded: this.schema.loaded,
      typeDefinitions: this.typeDefinitions.size
    };
  }

  // ... Rest of the existing methods remain unchanged ...
  // (executeAction, mapActionToCommand, executeCommand, etc.)

  /**
   * ENHANCED: Load manager with validation support
   */
  async loadManager(managerName) {
    if (this.managers[managerName]) return this.managers[managerName];

    try {
      let manager;
      switch (managerName) {
        case 'offline': {
          const { OfflineManager } = await import('./OfflineManager.js');
          manager = new OfflineManager(this);
          break;
        }
        case 'embedding': {
          const { EmbeddingManager } = await import('./../state/EmbeddingManager.js');
          manager = new EmbeddingManager(this);
          break;
        }
        case 'extension': {
          const { ExtensionManager } = await import('./ExtensionManager.js');
          manager = new ExtensionManager(this);
          break;
        }
        case 'validation':
          // NEW: Load validation manager that works with dynamic storage
          manager = {
            validate: async (entity) => {
              if (this.storage.instance?.validation) {
                return await this.storage.instance.validation.validate(entity);
              }
              return { valid: true, errors: [], warnings: [] };
            }
          };
          break;
        default:
          throw new Error(`Unknown manager: ${managerName}`);
      }

      this.managers[managerName] = manager;
      await manager.initialize?.();
      return manager;

    } catch (error) {
      console.error(`Failed to load manager ${managerName}:`, error);
      throw error;
    }
  }

  // All other existing methods remain the same...
  // (executeAction, getEntity, getEntitiesByType, recordOperation, etc.)
}

export default HybridStateManager;
