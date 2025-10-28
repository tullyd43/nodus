// core/ComponentDefinition.js
// Defines reusable component metadata & adaptation rules for entity-driven UI composition

import RenderContext, { ContextMatcher } from './RenderContext.js';

export class ComponentDefinition {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name || id;
    this.description = config.description || '';
    this.category = config.category || 'general';
    this.version = config.version || '1.0.0';
    
    // Adaptation rules for different contexts
    this.adaptations = config.adaptations || {};
    this.defaultAdaptation = config.defaultAdaptation || 'standard';
    
    // Render methods for each adaptation
    this.render = config.render || {};
    
    // Supported entity types this component can display
    this.supportedEntityTypes = config.supportedEntityTypes || [];
    
    // Required permissions
    this.requiredPermissions = config.requiredPermissions || [];
    
    // Dependencies (other components, libraries, etc.)
    this.dependencies = config.dependencies || [];
    
    // Configuration schema
    this.configSchema = config.configSchema || {};
    
    // Default configuration
    this.defaultConfig = config.defaultConfig || {};
    
    // Lifecycle hooks
    this.hooks = config.hooks || {};
    
    // Metadata for plugin system
    this.metadata = config.metadata || {};
  }

  /**
   * Validate if this component can render given entity types
   */
  canRender(entityTypes) {
    if (this.supportedEntityTypes.length === 0) return true; // Universal component
    
    const types = Array.isArray(entityTypes) ? entityTypes : [entityTypes];
    return types.some(type => 
      this.supportedEntityTypes.includes(type) || 
      this.supportedEntityTypes.includes('*')
    );
  }

  /**
   * Check if user has required permissions
   */
  hasPermissions(userPermissions = []) {
    return this.requiredPermissions.every(perm => userPermissions.includes(perm));
  }

  /**
   * Get adaptation for specific context
   */
  getAdaptation(context) {
    // Ensure context is a RenderContext instance
    const renderContext = context instanceof RenderContext 
      ? context 
      : new RenderContext(context);

    // Find best matching adaptation using shared ContextMatcher
    const bestMatch = ContextMatcher.findBestMatch(this.adaptations, renderContext);
    
    if (bestMatch) {
      return bestMatch;
    }
    
    // Return default adaptation
    return {
      name: this.defaultAdaptation,
      ...this.adaptations[this.defaultAdaptation]
    };
  }

  /**
   * Validate configuration against schema
   */
  validateConfig(config) {
    // Simple validation - could be enhanced with JSON Schema
    const errors = [];
    
    for (const [key, schema] of Object.entries(this.configSchema)) {
      if (schema.required && !(key in config)) {
        errors.push(`Missing required config: ${key}`);
      }
      
      if (key in config) {
        const value = config[key];
        
        if (schema.type && typeof value !== schema.type) {
          errors.push(`Config ${key} must be of type ${schema.type}`);
        }
        
        if (schema.enum && !schema.enum.includes(value)) {
          errors.push(`Config ${key} must be one of: ${schema.enum.join(', ')}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Merge user config with defaults
   */
  mergeConfig(userConfig = {}) {
    return {
      ...this.defaultConfig,
      ...userConfig
    };
  }

  /**
   * Convert to entity format for storage
   */
  toEntity() {
    return {
      domain: 'ui',
      type: 'component_definition',
      data: {
        id: this.id,
        name: this.name,
        description: this.description,
        category: this.category,
        version: this.version,
        adaptations: this.adaptations,
        defaultAdaptation: this.defaultAdaptation,
        supportedEntityTypes: this.supportedEntityTypes,
        requiredPermissions: this.requiredPermissions,
        dependencies: this.dependencies,
        configSchema: this.configSchema,
        defaultConfig: this.defaultConfig,
        metadata: this.metadata
      }
    };
  }

  /**
   * Create from entity data
   */
  static fromEntity(entity) {
    if (entity.domain !== 'ui' || entity.type !== 'component_definition') {
      throw new Error('Invalid entity for ComponentDefinition');
    }
    
    return new ComponentDefinition(entity.data.id, entity.data);
  }

  /**
   * Clone this definition with modifications
   */
  clone(modifications = {}) {
    const clonedConfig = {
      name: this.name,
      description: this.description,
      category: this.category,
      version: this.version,
      adaptations: { ...this.adaptations },
      defaultAdaptation: this.defaultAdaptation,
      render: { ...this.render },
      supportedEntityTypes: [...this.supportedEntityTypes],
      requiredPermissions: [...this.requiredPermissions],
      dependencies: [...this.dependencies],
      configSchema: { ...this.configSchema },
      defaultConfig: { ...this.defaultConfig },
      hooks: { ...this.hooks },
      metadata: { ...this.metadata },
      ...modifications
    };
    
    return new ComponentDefinition(`${this.id}_clone`, clonedConfig);
  }
}

/**
 * Component Definition Registry
 * Manages all component definitions in the system
 */
export class ComponentDefinitionRegistry {
  constructor() {
    this.definitions = new Map();
    this.categories = new Set();
    this.hooks = {
      beforeRegister: [],
      afterRegister: [],
      beforeUnregister: [],
      afterUnregister: []
    };
  }

  /**
   * Register a component definition
   */
  register(definition) {
    if (!(definition instanceof ComponentDefinition)) {
      definition = new ComponentDefinition(definition.id, definition);
    }

    // Run before hooks
    this.runHooks('beforeRegister', definition);

    // Register the definition
    this.definitions.set(definition.id, definition);
    this.categories.add(definition.category);

    // Run after hooks
    this.runHooks('afterRegister', definition);

    return definition;
  }

  /**
   * Get component definition by ID
   */
  get(id) {
    return this.definitions.get(id);
  }

  /**
   * Get all definitions in a category
   */
  getByCategory(category) {
    return Array.from(this.definitions.values())
      .filter(def => def.category === category);
  }

  /**
   * Get definitions that can render specific entity types
   */
  getForEntityTypes(entityTypes) {
    return Array.from(this.definitions.values())
      .filter(def => def.canRender(entityTypes));
  }

  /**
   * Get definitions available to user with specific permissions
   */
  getForUser(userPermissions = []) {
    return Array.from(this.definitions.values())
      .filter(def => def.hasPermissions(userPermissions));
  }

  /**
   * Search definitions by name or description
   */
  search(query) {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.definitions.values())
      .filter(def => 
        def.name.toLowerCase().includes(lowerQuery) ||
        def.description.toLowerCase().includes(lowerQuery) ||
        def.category.toLowerCase().includes(lowerQuery)
      );
  }

  /**
   * Unregister a component definition
   */
  unregister(id) {
    const definition = this.definitions.get(id);
    if (!definition) return false;

    this.runHooks('beforeUnregister', definition);
    this.definitions.delete(id);
    this.runHooks('afterUnregister', definition);

    return true;
  }

  /**
   * Get all categories
   */
  getCategories() {
    return Array.from(this.categories);
  }

  /**
   * Register hook for lifecycle events
   */
  onHook(event, callback) {
    if (this.hooks[event]) {
      this.hooks[event].push(callback);
    }
  }

  /**
   * Run hooks for specific event
   */
  runHooks(event, data) {
    if (this.hooks[event]) {
      this.hooks[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Hook error for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Export all definitions as entities
   */
  exportAsEntities() {
    return Array.from(this.definitions.values()).map(def => def.toEntity());
  }

  /**
   * Import definitions from entities
   */
  importFromEntities(entities) {
    const imported = [];
    
    for (const entity of entities) {
      try {
        const definition = ComponentDefinition.fromEntity(entity);
        this.register(definition);
        imported.push(definition);
      } catch (error) {
        console.error('Failed to import component definition:', error);
      }
    }
    
    return imported;
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const definitions = Array.from(this.definitions.values());
    
    return {
      totalDefinitions: definitions.length,
      categoryCounts: Object.fromEntries(
        this.getCategories().map(cat => [
          cat, 
          definitions.filter(def => def.category === cat).length
        ])
      ),
      entityTypeSupport: this.getEntityTypeSupport(definitions),
      permissionRequirements: this.getPermissionRequirements(definitions)
    };
  }

  getEntityTypeSupport(definitions) {
    const support = {};
    definitions.forEach(def => {
      def.supportedEntityTypes.forEach(type => {
        support[type] = (support[type] || 0) + 1;
      });
    });
    return support;
  }

  getPermissionRequirements(definitions) {
    const requirements = {};
    definitions.forEach(def => {
      def.requiredPermissions.forEach(perm => {
        requirements[perm] = (requirements[perm] || 0) + 1;
      });
    });
    return requirements;
  }
}

// Global registry instance
export const componentRegistry = new ComponentDefinitionRegistry();

export default ComponentDefinition;