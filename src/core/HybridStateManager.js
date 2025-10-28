// core/HybridStateManager.js
// Updated to remove level-based rendering and integrate adaptive, entity-driven architecture

import { BoundedStack } from './utils/BoundedStack.js';
import { LRUCache } from './utils/LRUCache.js';
import AdaptiveRenderer from './AdaptiveRenderer.js';
import { componentRegistry } from './ComponentDefinition.js';

export class HybridStateManager {
  constructor(config = {}) {
    this.config = {
      maxUndoStackSize: config.maxUndoStackSize || 50,
      maxViewportItems: config.maxViewportItems || 200,
      performanceMode: config.performanceMode || false,
      offlineEnabled: config.offlineEnabled || true,
      embeddingEnabled: config.embeddingEnabled || true,
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
      
      // Removed: currentRenderLevel - now handled by AdaptiveRenderer
      selectedEntities: new Set(),
      dragState: null,
      
      // Performance cache
      cache: new LRUCache(1000, { ttl: 30 * 60 * 1000 }) // 30 min TTL
    };

    // Type definitions registry
    this.typeDefinitions = new Map();

    // Plugin management
    this.plugins = {
      active: new Set(),
      loaded: new Map(),
      configs: new Map(),
      loadingStrategies: new Map()
    };

    // Extension-based server capabilities
    this.serverCapabilities = {
      discovered: new Map(),
      endpoints: new Map(),
      routing: new Map(),
      fallbacks: new Map(),
      lastDiscovery: 0,
      discoveryInterval: 5 * 60 * 1000
    };

    // State change listeners (MVVM integration)
    this.listeners = new Map();
    this.viewModelBindings = new Map();

    // Component managers (lazy-loaded for bundle size)
    this.managers = {
      // Removed: levelSwitch - replaced with AdaptiveRenderer
      offline: null,
      sync: null,
      plugin: null,
      embedding: null,
      extension: null
    };

    // Consolidated performance monitoring
    this.metrics = {
      operationLatencies: [],
      bundleSize: 0,
      embeddingCacheHitRate: 0,
      embeddingProcessingTimes: [],
      embeddingBatchEfficiency: 0,
      
      // Routing metrics
      routing: {
        serverSuccessRate: 0,
        clientFallbackRate: 0,
        adaptiveDecisions: 0,
        extensionRoutingCount: 0
      },
      
      // Rendering performance (consolidated)
      rendering: {
        adaptiveRenderTimes: [],
        templateRenderTimes: [],
        averageRenderTime: 0,
        averageAdaptiveRenderTime: 0,
        componentCacheHitRate: 0
      },

      // Memory management
      memory: {
        entitiesCount: 0,
        relationshipsCount: 0,
        cacheSize: 0,
        undoStackSize: 0
      },

      // User interaction
      interaction: {
        commandsExecuted: 0,
        actionsTriggered: 0,
        conditionsEvaluated: 0
      }
    };

    // Vector Embedding State Management
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

    // Circuit breaker for server operations
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: 0,
      threshold: 5,
      timeout: 30000,
      halfOpenAttempts: 0,
      maxHalfOpenAttempts: 3
    };

    // Initialize adaptive renderer
    this.adaptiveRenderer = new AdaptiveRenderer(this);
    
    this.initialized = false;
  }

  /**
   * Initialize the state manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize persistent queue
      await this.clientState.pendingOperations.initialize?.();

      // Load essential managers (lazy-loaded to keep bundle small)
      await this.loadManager('offline');
      await this.loadManager('embedding');
      await this.loadManager('extension');

      // Discover server capabilities from extensions
      await this.discoverServerCapabilities();

      // Load type definitions with bound actions/fields
      await this.loadTypeDefinitions();

      // Load active plugins based on configuration
      await this.loadActivePlugins();

      // Load component definitions into adaptive renderer
      await this.loadComponentDefinitions();

      // Set up MVVM bindings
      this.setupViewModelBindings();

      // Start performance monitoring if enabled
      if (this.config.performanceMode) {
        this.startPerformanceMonitoring();
      }

      this.initialized = true;
      this.emit('initialized', { timestamp: Date.now() });

    } catch (error) {
      console.error('HybridStateManager initialization failed:', error);
      this.emit('initializationFailed', { error });
      throw error;
    }
  }

  /**
   * REMOVED: switchRenderLevel() - replaced with adaptive rendering
   * Components now automatically adapt based on context
   */

  /**
   * NEW: Execute action through CQRS pattern
   * Maps Action → Command for proper command/query separation
   */
  async executeAction(action, context = {}) {
    const startTime = performance.now();
    
    try {
      // Validate action
      if (!action.id || !action.type) {
        throw new Error('Invalid action: missing id or type');
      }

      // Convert action to command
      const command = this.mapActionToCommand(action, context);
      
      // Execute command
      const result = await this.executeCommand(command);
      
      // Track metrics
      this.metrics.interaction.actionsTriggered++;
      this.metrics.operationLatencies.push(performance.now() - startTime);
      
      this.emit('actionExecuted', { action, command, result, context });
      return result;

    } catch (error) {
      this.emit('actionFailed', { action, context, error });
      throw error;
    }
  }

  /**
   * Map action to command for CQRS pattern
   */
  mapActionToCommand(action, context) {
    const command = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: action.type,
      payload: action.payload || {},
      metadata: {
        sourceAction: action.id,
        executionContext: context,
        timestamp: Date.now(),
        userId: context.userId || 'anonymous'
      }
    };

    return command;
  }

  /**
   * Execute command (CQRS command handler)
   */
  async executeCommand(command) {
    const commandHandlers = {
      'create_entity': this.handleCreateEntity.bind(this),
      'update_entity': this.handleUpdateEntity.bind(this),
      'delete_entity': this.handleDeleteEntity.bind(this),
      'create_relationship': this.handleCreateRelationship.bind(this),
      'update_configuration': this.handleUpdateConfiguration.bind(this),
      'load_component': this.handleLoadComponent.bind(this)
    };

    const handler = commandHandlers[command.type];
    if (!handler) {
      throw new Error(`No handler for command type: ${command.type}`);
    }

    // Record operation for undo/redo
    this.recordOperation({
      type: 'command',
      command,
      timestamp: Date.now()
    });

    // Execute handler
    const result = await handler(command);
    
    // Emit command executed event to EventFlowEngine if available
    if (this.eventFlowEngine) {
      this.eventFlowEngine.emit('commandExecuted', { 
        command, 
        result, 
        timestamp: Date.now(),
        executionTime: Date.now() - command.metadata.timestamp
      });
    } else {
      // Fallback to regular emit for now
      this.emit('commandExecuted', { command, result });
    }
    
    this.metrics.interaction.commandsExecuted++;
    return result;
  }

  /**
   * Command Handlers
   */
  async handleCreateEntity(command) {
    const { type, data } = command.payload;
    const entity = {
      id: `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.clientState.entities.set(entity.id, entity);
    this.updateMetrics();
    
    return entity;
  }

  async handleUpdateEntity(command) {
    const { entityId, updates } = command.payload;
    const entity = this.clientState.entities.get(entityId);
    
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const updatedEntity = {
      ...entity,
      data: { ...entity.data, ...updates },
      updatedAt: new Date().toISOString()
    };

    this.clientState.entities.set(entityId, updatedEntity);
    this.updateMetrics();
    
    return updatedEntity;
  }

  async handleDeleteEntity(command) {
    const { entityId } = command.payload;
    const deleted = this.clientState.entities.delete(entityId);
    
    if (!deleted) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    this.updateMetrics();
    return { deleted: true, entityId };
  }

  async handleCreateRelationship(command) {
    const { fromId, toId, type, data } = command.payload;
    const relationship = {
      id: `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fromId,
      toId,
      type,
      data: data || {},
      createdAt: new Date().toISOString()
    };

    this.clientState.relationships.set(relationship.id, relationship);
    this.updateMetrics();
    
    return relationship;
  }

  async handleLoadComponent(command) {
    const { componentId, config } = command.payload;
    
    // Register component with adaptive renderer
    if (config.definition) {
      this.adaptiveRenderer.registerComponent(componentId, config.definition);
      componentRegistry.register(config.definition);
    }

    return { componentId, loaded: true };
  }

  /**
   * Load component definitions for adaptive renderer
   * Pulls from IndexedDB/API asynchronously and keeps live sync
   */
  async loadComponentDefinitions() {
    try {
      // Load from stored entities (IndexedDB or API)
      const componentEntities = await this.loadStoredComponentEntities();
      
      for (const entity of componentEntities) {
        try {
          const definition = componentRegistry.importFromEntities([entity]);
          this.adaptiveRenderer.registerComponent(entity.data.id, definition[0]);
        } catch (error) {
          console.error('Failed to load component definition:', entity.data.id, error);
        }
      }

      // Load default system components if none exist
      if (componentEntities.length === 0) {
        await this.loadDefaultComponents();
      }

      // Set up live sync for new component definitions
      this.setupComponentDefinitionSync();

    } catch (error) {
      console.error('Failed to load component definitions:', error);
      // Fallback to defaults if loading fails
      await this.loadDefaultComponents();
    }
  }

  /**
   * Load component entities from persistent storage
   */
  async loadStoredComponentEntities() {
    // Try IndexedDB first, then API fallback
    try {
      const entities = await this.loadFromIndexedDB('component_definition');
      if (entities && entities.length > 0) {
        return entities;
      }
    } catch (error) {
      console.warn('IndexedDB component loading failed, trying API:', error);
    }

    // Fallback to API if available
    try {
      return await this.loadFromAPI('component_definition');
    } catch (error) {
      console.warn('API component loading failed:', error);
      return [];
    }
  }

  /**
   * Load entities from IndexedDB
   */
  async loadFromIndexedDB(entityType) {
    // This would integrate with your existing IndexedDB implementation
    // For now, return stored entities from clientState
    return this.getEntitiesByType(entityType);
  }

  /**
   * Load entities from API
   */
  async loadFromAPI(entityType) {
    // This would make API call to server
    // Implementation depends on your API structure
    if (this.serverCapabilities.endpoints.has('getEntities')) {
      const endpoint = this.serverCapabilities.endpoints.get('getEntities');
      const response = await fetch(`${endpoint}?type=${entityType}`);
      const data = await response.json();
      return data.entities || [];
    }
    return [];
  }

  /**
   * Set up live sync for component definition changes
   */
  setupComponentDefinitionSync() {
    // Register hook to auto-sync new components when they're registered
    componentRegistry.onHook('afterRegister', (definition) => {
      this.adaptiveRenderer.registerComponent(definition.id, definition);
      console.log(`Auto-registered component: ${definition.id}`);
    });

    // Listen for entity changes and update components
    this.on('entityCreated', (event) => {
      if (event.entity?.type === 'component_definition') {
        this.syncComponentDefinition(event.entity);
      }
    });

    this.on('entityUpdated', (event) => {
      if (event.entity?.type === 'component_definition') {
        this.syncComponentDefinition(event.entity);
      }
    });
  }

  /**
   * Sync individual component definition
   */
  async syncComponentDefinition(entity) {
    try {
      const definition = componentRegistry.importFromEntities([entity]);
      this.adaptiveRenderer.registerComponent(entity.data.id, definition[0]);
      console.log(`Synced component definition: ${entity.data.id}`);
    } catch (error) {
      console.error('Failed to sync component definition:', entity.data.id, error);
    }
  }

  /**
   * Load default system components
   */
  async loadDefaultComponents() {
    const defaultComponents = {
      'entity_card': {
        name: 'Entity Card',
        category: 'display',
        adaptations: {
          minimal: {
            trigger: { containerWidth: { max: 200 } },
            render: { fields: ['title'], actions: ['view'] }
          },
          standard: {
            trigger: { containerWidth: { min: 200, max: 400 } },
            render: { fields: ['title', 'status'], actions: ['edit', 'delete'] }
          },
          detailed: {
            trigger: { containerWidth: { min: 400 } },
            render: { fields: 'all', actions: 'all', relationships: true }
          }
        },
        render: {
          minimal: (context) => this.renderMinimalCard(context),
          standard: (context) => this.renderStandardCard(context),
          detailed: (context) => this.renderDetailedCard(context)
        }
      },
      
      'performance_monitor': {
        name: 'Performance Monitor',
        category: 'system',
        adaptations: {
          compact: {
            trigger: { containerArea: { max: 40000 } },
            render: { metrics: ['memory', 'operations'] }
          },
          full: {
            trigger: { containerArea: { min: 40000 } },
            render: { metrics: 'all', charts: true }
          }
        },
        render: {
          compact: (context) => this.renderCompactMonitor(context),
          full: (context) => this.renderFullMonitor(context)
        }
      }
    };

    for (const [id, config] of Object.entries(defaultComponents)) {
      this.adaptiveRenderer.registerComponent(id, config);
      componentRegistry.register({ id, ...config });
    }
  }

  /**
   * Render methods for default components
   */
  renderMinimalCard(context) {
    const div = document.createElement('div');
    div.className = 'entity-card minimal';
    div.innerHTML = `<h4>${context.data?.title || 'Untitled'}</h4>`;
    return div;
  }

  renderStandardCard(context) {
    const div = document.createElement('div');
    div.className = 'entity-card standard';
    div.innerHTML = `
      <h4>${context.data?.title || 'Untitled'}</h4>
      <p>Status: ${context.data?.status || 'Unknown'}</p>
      <div class="actions">
        <button onclick="this.editEntity('${context.data?.id}')">Edit</button>
        <button onclick="this.deleteEntity('${context.data?.id}')">Delete</button>
      </div>
    `;
    return div;
  }

  renderDetailedCard(context) {
    const div = document.createElement('div');
    div.className = 'entity-card detailed';
    
    const fields = Object.entries(context.data || {})
      .map(([key, value]) => `<div class="field"><strong>${key}:</strong> ${value}</div>`)
      .join('');
    
    div.innerHTML = `
      <h4>${context.data?.title || 'Untitled'}</h4>
      <div class="fields">${fields}</div>
      <div class="relationships">
        <!-- Relationships would be rendered here -->
      </div>
      <div class="actions">
        <button onclick="this.editEntity('${context.data?.id}')">Edit</button>
        <button onclick="this.deleteEntity('${context.data?.id}')">Delete</button>
        <button onclick="this.viewRelationships('${context.data?.id}')">Relationships</button>
      </div>
    `;
    return div;
  }

  renderCompactMonitor(context) {
    const div = document.createElement('div');
    div.className = 'performance-monitor compact';
    div.innerHTML = `
      <div class="metric">Entities: ${this.metrics.memory.entitiesCount}</div>
      <div class="metric">Operations: ${this.metrics.operationLatencies.length}</div>
    `;
    return div;
  }

  renderFullMonitor(context) {
    const div = document.createElement('div');
    div.className = 'performance-monitor full';
    
    const avgLatency = this.metrics.operationLatencies.length > 0
      ? (this.metrics.operationLatencies.reduce((sum, lat) => sum + lat, 0) / this.metrics.operationLatencies.length).toFixed(2)
      : 0;
    
    div.innerHTML = `
      <h4>Performance Monitor</h4>
      <div class="metrics-grid">
        <div class="metric">
          <strong>Entities:</strong> ${this.metrics.memory.entitiesCount}
        </div>
        <div class="metric">
          <strong>Relationships:</strong> ${this.metrics.memory.relationshipsCount}
        </div>
        <div class="metric">
          <strong>Avg Latency:</strong> ${avgLatency}ms
        </div>
        <div class="metric">
          <strong>Cache Hit Rate:</strong> ${(this.metrics.rendering.componentCacheHitRate * 100).toFixed(1)}%
        </div>
      </div>
    `;
    return div;
  }

  /**
   * Update consolidated metrics
   */
  updateMetrics() {
    this.metrics.memory.entitiesCount = this.clientState.entities.size;
    this.metrics.memory.relationshipsCount = this.clientState.relationships.size;
    this.metrics.memory.cacheSize = this.clientState.cache.size;
    this.metrics.memory.undoStackSize = this.clientState.undoStack.size();

    // Update rendering metrics from adaptive renderer
    const renderMetrics = this.adaptiveRenderer.getMetrics();
    this.metrics.rendering.componentCacheHitRate = renderMetrics.cacheHitRate;
    this.metrics.rendering.averageAdaptiveRenderTime = renderMetrics.averageRenderTime;
  }

  /**
   * Get entity by ID
   */
  getEntity(id) {
    return this.clientState.entities.get(id);
  }

  /**
   * Get entities by type
   */
  getEntitiesByType(type) {
    const entitiesOfType = [];
    for (const entity of this.clientState.entities.values()) {
      if (entity.type === type) {
        entitiesOfType.push(entity);
      }
    }
    return entitiesOfType;
  }

  /**
   * Record operation in undo stack
   */
  recordOperation(operation) {
    this.clientState.undoStack.push({
      operation,
      timestamp: Date.now(),
      beforeState: this.captureRelevantState(operation)
    });

    this.clientState.redoStack.clear();
  }

  /**
   * Capture relevant state for undo/redo
   */
  captureRelevantState(operation) {
    // Capture minimal state needed for this operation
    return {
      entities: new Map(this.clientState.entities),
      relationships: new Map(this.clientState.relationships)
    };
  }

  /**
   * Event emission for MVVM binding
   */
  emit(event, data) {
    const listeners = this.listeners.get(event) || [];
    listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`Listener error for event ${event}:`, error);
      }
    });
  }

  /**
   * Event subscription
   */
  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(listener);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    this.updateMetrics();
    return {
      ...this.metrics,
      adaptiveRenderer: this.adaptiveRenderer.getMetrics()
    };
  }

  /**
   * Lazy load managers
   */
  async loadManager(managerName) {
    if (this.managers[managerName]) return this.managers[managerName];

    try {
      let manager;
      switch (managerName) {
        case 'offline':
          const { OfflineManager } = await import('./OfflineManager.js');
          manager = new OfflineManager(this);
          break;
        case 'embedding':
          const { EmbeddingManager } = await import('./EmbeddingManager.js');
          manager = new EmbeddingManager(this);
          break;
        case 'extension':
          const { ExtensionManager } = await import('./ExtensionManager.js');
          manager = new ExtensionManager(this);
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

  // Placeholder methods for missing functionality
  async discoverServerCapabilities() {
    // Implementation placeholder
  }

  async loadTypeDefinitions() {
    // Implementation placeholder
  }

  async loadActivePlugins() {
    // Implementation placeholder
  }

  setupViewModelBindings() {
    // Implementation placeholder
  }

  startPerformanceMonitoring() {
    setInterval(() => {
      this.updateMetrics();
    }, 1000);
  }

  onEmbeddingCacheEvict(key, value) {
    // Implementation placeholder
  }
}

export default HybridStateManager;