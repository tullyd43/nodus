// core/ManifestPluginSystem.js
// Replaces class-based PluginRegistry with declarative, manifest-driven plugin loading

export class ManifestPluginSystem {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.loadedPlugins = new Map();
    this.pluginManifests = new Map();
    this.componentRegistry = new Map();
    this.actionRegistry = new Map();
    this.widgetRegistry = new Map();
    this.fieldRendererRegistry = new Map();
    this.commandHandlerRegistry = new Map();
    
    // Plugin runtime environments
    this.runtimeEnvironments = new Map();
    
    // Plugin loading state
    this.loadingPromises = new Map();
    this.dependencyGraph = new Map();
    
    // Plugin lifecycle hooks
    this.hooks = {
      beforeLoad: [],
      afterLoad: [],
      beforeUnload: [],
      afterUnload: [],
      onError: []
    };

    // Performance metrics
    this.metrics = {
      pluginsLoaded: 0,
      loadingTimes: [],
      averageLoadTime: 0,
      failedLoads: 0,
      registeredComponents: 0,
      registeredActions: 0
    };
  }

  /**
   * Initialize the plugin system
   */
  async initialize() {
    try {
      // Load plugin manifests from stored entities
      await this.loadPluginManifests();
      
      // Load enabled plugins
      await this.loadEnabledPlugins();
      
      console.log(`ManifestPluginSystem initialized with ${this.loadedPlugins.size} plugins`);
      
    } catch (error) {
      console.error('Failed to initialize plugin system:', error);
      throw error;
    }
  }

  /**
   * Load plugin manifests from stored entities
   */
  async loadPluginManifests() {
    try {
      const manifestEntities = await this.stateManager.getEntitiesByType('plugin_manifest');
      
      for (const entity of manifestEntities) {
        this.registerManifest(entity.data);
      }
      
    } catch (error) {
      console.error('Failed to load plugin manifests:', error);
    }
  }

  /**
   * Register a plugin manifest
   */
  registerManifest(manifestData) {
    const manifest = {
      id: manifestData.id || manifestData.name,
      name: manifestData.name,
      version: manifestData.version || '1.0.0',
      description: manifestData.description || '',
      author: manifestData.author || '',
      
      // Plugin capabilities
      components: manifestData.components || {},
      dependencies: manifestData.dependencies || {},
      runtime: manifestData.runtime || {},
      
      // Plugin metadata
      enabled: manifestData.enabled !== false,
      autoload: manifestData.autoload !== false,
      priority: manifestData.priority || 'normal',
      
      // Security and permissions
      permissions: manifestData.permissions || [],
      sandbox: manifestData.sandbox !== false,
      
      // Original manifest data
      rawManifest: manifestData
    };

    this.pluginManifests.set(manifest.id, manifest);
    
    // Build dependency graph
    this.updateDependencyGraph(manifest);
    
    return manifest;
  }

  /**
   * Load a plugin by ID
   */
  async loadPlugin(pluginId, options = {}) {
    const startTime = performance.now();
    
    try {
      // Check if already loaded
      if (this.loadedPlugins.has(pluginId)) {
        return this.loadedPlugins.get(pluginId);
      }

      // Check if currently loading
      if (this.loadingPromises.has(pluginId)) {
        return await this.loadingPromises.get(pluginId);
      }

      // Get manifest
      const manifest = this.pluginManifests.get(pluginId);
      if (!manifest) {
        throw new Error(`Plugin manifest not found: ${pluginId}`);
      }

      // Create loading promise
      const loadingPromise = this.doLoadPlugin(manifest, options);
      this.loadingPromises.set(pluginId, loadingPromise);

      const plugin = await loadingPromise;
      
      // Record metrics
      const loadTime = performance.now() - startTime;
      this.recordLoadTime(loadTime);
      
      return plugin;

    } catch (error) {
      this.metrics.failedLoads++;
      this.runHooks('onError', { pluginId, error });
      console.error(`Failed to load plugin ${pluginId}:`, error);
      throw error;
    } finally {
      this.loadingPromises.delete(pluginId);
    }
  }

  /**
   * Actually load the plugin
   */
  async doLoadPlugin(manifest, options) {
    const pluginId = manifest.id;
    
    // Run before load hooks
    this.runHooks('beforeLoad', { manifest, options });

    // Load dependencies first
    await this.loadDependencies(manifest);

    // Create plugin context
    const pluginContext = this.createPluginContext(manifest);

    // Load runtime environment
    const runtime = await this.loadPluginRuntime(manifest, pluginContext);

    // Register plugin components
    await this.registerPluginComponents(manifest, runtime, pluginContext);

    // Create plugin instance
    const plugin = {
      id: pluginId,
      manifest,
      runtime,
      context: pluginContext,
      loadedAt: Date.now(),
      status: 'loaded'
    };

    this.loadedPlugins.set(pluginId, plugin);
    this.metrics.pluginsLoaded++;

    // Run after load hooks
    this.runHooks('afterLoad', { plugin });

    // Emit plugin loaded event
    this.stateManager.emit?.('pluginLoaded', { pluginId, plugin });

    return plugin;
  }

  /**
   * Load plugin dependencies
   */
  async loadDependencies(manifest) {
    const dependencies = manifest.dependencies.plugins || [];
    
    for (const depId of dependencies) {
      if (!this.loadedPlugins.has(depId)) {
        await this.loadPlugin(depId);
      }
    }
  }

  /**
   * Create plugin execution context
   */
  createPluginContext(manifest) {
    const context = {
      pluginId: manifest.id,
      manifest,
      stateManager: this.stateManager,
      
      // Registration methods
      registerComponent: (id, definition) => this.registerComponent(manifest.id, id, definition),
      registerAction: (id, definition) => this.registerAction(manifest.id, id, definition),
      registerWidget: (id, definition) => this.registerWidget(manifest.id, id, definition),
      registerFieldRenderer: (id, definition) => this.registerFieldRenderer(manifest.id, id, definition),
      registerCommandHandler: (id, definition) => this.registerCommandHandler(manifest.id, id, definition),
      
      // Utility methods
      emit: (event, data) => this.stateManager.emit?.(`plugin:${manifest.id}:${event}`, data),
      log: (level, message, data) => console[level](`[Plugin:${manifest.id}] ${message}`, data),
      
      // Access to other plugins (with permission check)
      getPlugin: (pluginId) => this.getPluginForContext(manifest.id, pluginId),
      
      // Configuration access
      getConfig: (key) => manifest.rawManifest.config?.[key],
      setConfig: (key, value) => this.setPluginConfig(manifest.id, key, value)
    };

    return context;
  }

  /**
   * Load plugin runtime environment
   */
  async loadPluginRuntime(manifest, context) {
    const runtimeConfig = manifest.runtime;
    
    if (runtimeConfig.frontend) {
      // Load frontend runtime (JavaScript module)
      return await this.loadFrontendRuntime(runtimeConfig.frontend, context);
    } else if (runtimeConfig.inline) {
      // Inline runtime definition
      return this.createInlineRuntime(runtimeConfig.inline, context);
    } else {
      // Default runtime
      return this.createDefaultRuntime(context);
    }
  }

  /**
   * Load frontend runtime from URL
   */
  async loadFrontendRuntime(runtimeUrl, context) {
    try {
      // Dynamic import of the plugin module
      const module = await import(runtimeUrl);
      
      // Initialize plugin with context
      if (module.default && typeof module.default.initialize === 'function') {
        await module.default.initialize(context);
        return module.default;
      } else if (typeof module.initialize === 'function') {
        await module.initialize(context);
        return module;
      } else {
        throw new Error('Plugin runtime must export initialize function');
      }
      
    } catch (error) {
      console.error(`Failed to load plugin runtime from ${runtimeUrl}:`, error);
      throw error;
    }
  }

  /**
   * Create inline runtime from definition
   */
  createInlineRuntime(inlineDefinition, context) {
    const runtime = {
      initialize: async () => {
        // Register components defined in manifest
        if (inlineDefinition.components) {
          for (const [id, componentDef] of Object.entries(inlineDefinition.components)) {
            context.registerComponent(id, componentDef);
          }
        }
        
        // Register actions
        if (inlineDefinition.actions) {
          for (const [id, actionDef] of Object.entries(inlineDefinition.actions)) {
            context.registerAction(id, actionDef);
          }
        }
        
        // Register widgets
        if (inlineDefinition.widgets) {
          for (const [id, widgetDef] of Object.entries(inlineDefinition.widgets)) {
            context.registerWidget(id, widgetDef);
          }
        }
      },
      
      render: (componentId, renderContext) => {
        const component = inlineDefinition.components?.[componentId];
        if (component && component.render) {
          return component.render(renderContext);
        }
        return null;
      },
      
      executeAction: (actionId, actionContext) => {
        const action = inlineDefinition.actions?.[actionId];
        if (action && action.execute) {
          return action.execute(actionContext);
        }
      }
    };

    return runtime;
  }

  /**
   * Create default runtime
   */
  createDefaultRuntime(context) {
    return {
      initialize: async () => {
        context.log('info', 'Plugin initialized with default runtime');
      },
      
      render: (componentId, renderContext) => {
        const div = document.createElement('div');
        div.textContent = `Plugin component: ${componentId}`;
        return div;
      },
      
      executeAction: (actionId, actionContext) => {
        context.log('info', `Executing action: ${actionId}`, actionContext);
      }
    };
  }

  /**
   * Register plugin components
   */
  async registerPluginComponents(manifest, runtime, context) {
    const components = manifest.components;
    
    // Register widgets
    if (components.widgets) {
      for (const widgetDef of components.widgets) {
        context.registerWidget(widgetDef.id, {
          ...widgetDef,
          pluginId: manifest.id,
          render: (renderContext) => runtime.render(widgetDef.id, renderContext)
        });
      }
    }

    // Register actions
    if (components.actions) {
      for (const actionDef of components.actions) {
        context.registerAction(actionDef.id, {
          ...actionDef,
          pluginId: manifest.id,
          execute: (actionContext) => runtime.executeAction(actionDef.id, actionContext)
        });
      }
    }

    // Register field renderers
    if (components.field_renderers) {
      for (const rendererDef of components.field_renderers) {
        context.registerFieldRenderer(rendererDef.field, {
          ...rendererDef,
          pluginId: manifest.id,
          render: (renderContext) => runtime.renderField(rendererDef.field, renderContext)
        });
      }
    }

    // Register command handlers
    if (components.command_handlers) {
      for (const handlerDef of components.command_handlers) {
        context.registerCommandHandler(handlerDef.command, {
          ...handlerDef,
          pluginId: manifest.id,
          handle: (command) => runtime.handleCommand(handlerDef.command, command)
        });
      }
    }
  }

  /**
   * Component registration methods
   */
  registerComponent(pluginId, componentId, definition) {
    const fullId = `${pluginId}.${componentId}`;
    this.componentRegistry.set(fullId, { ...definition, pluginId, componentId });
    this.metrics.registeredComponents++;
  }

  registerAction(pluginId, actionId, definition) {
    const fullId = `${pluginId}.${actionId}`;
    this.actionRegistry.set(fullId, { ...definition, pluginId, actionId });
    this.metrics.registeredActions++;
  }

  registerWidget(pluginId, widgetId, definition) {
    const fullId = `${pluginId}.${widgetId}`;
    this.widgetRegistry.set(fullId, { ...definition, pluginId, widgetId });
  }

  registerFieldRenderer(pluginId, field, definition) {
    const key = `${pluginId}.${field}`;
    this.fieldRendererRegistry.set(key, { ...definition, pluginId, field });
  }

  registerCommandHandler(pluginId, command, definition) {
    const key = `${pluginId}.${command}`;
    this.commandHandlerRegistry.set(key, { ...definition, pluginId, command });
  }

  /**
   * Get components by type
   */
  getWidgetsForEntityType(entityType) {
    const widgets = [];
    
    for (const [id, widget] of this.widgetRegistry) {
      if (widget.entity_types && widget.entity_types.includes(entityType)) {
        widgets.push({ id, ...widget });
      }
    }
    
    return widgets;
  }

  getActionsForEntityType(entityType) {
    const actions = [];
    
    for (const [id, action] of this.actionRegistry) {
      if (action.entity_types && action.entity_types.includes(entityType)) {
        actions.push({ id, ...action });
      }
    }
    
    return actions;
  }

  /**
   * Render a widget
   */
  async render(widgetConfig) {
    const widgetId = widgetConfig.component || widgetConfig.widget;
    const widget = this.widgetRegistry.get(widgetId);
    
    if (!widget) {
      console.warn(`Widget not found: ${widgetId}`);
      return this.renderMissingWidget(widgetId);
    }

    try {
      const renderContext = {
        config: widgetConfig.config || {},
        data: widgetConfig.data || {},
        pluginContext: this.getPluginContext(widget.pluginId)
      };
      
      return await widget.render(renderContext);
      
    } catch (error) {
      console.error(`Error rendering widget ${widgetId}:`, error);
      return this.renderErrorWidget(widgetId, error);
    }
  }

  /**
   * Execute an action
   */
  async executeAction(actionId, context) {
    const action = this.actionRegistry.get(actionId);
    
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }

    try {
      const actionContext = {
        ...context,
        pluginContext: this.getPluginContext(action.pluginId)
      };
      
      return await action.execute(actionContext);
      
    } catch (error) {
      console.error(`Error executing action ${actionId}:`, error);
      throw error;
    }
  }

  /**
   * Load enabled plugins
   */
  async loadEnabledPlugins() {
    const enabledManifests = Array.from(this.pluginManifests.values())
      .filter(manifest => manifest.enabled && manifest.autoload);
    
    // Sort by priority and dependencies
    const sortedManifests = this.sortManifestsByDependencies(enabledManifests);
    
    for (const manifest of sortedManifests) {
      try {
        await this.loadPlugin(manifest.id);
      } catch (error) {
        console.error(`Failed to load enabled plugin ${manifest.id}:`, error);
      }
    }
  }

  /**
   * Sort manifests by dependencies
   */
  sortManifestsByDependencies(manifests) {
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (manifest) => {
      if (visiting.has(manifest.id)) {
        throw new Error(`Circular dependency detected: ${manifest.id}`);
      }
      
      if (visited.has(manifest.id)) {
        return;
      }

      visiting.add(manifest.id);

      // Visit dependencies first
      const dependencies = manifest.dependencies.plugins || [];
      for (const depId of dependencies) {
        const depManifest = this.pluginManifests.get(depId);
        if (depManifest && manifests.includes(depManifest)) {
          visit(depManifest);
        }
      }

      visiting.delete(manifest.id);
      visited.add(manifest.id);
      sorted.push(manifest);
    };

    for (const manifest of manifests) {
      visit(manifest);
    }

    return sorted;
  }

  /**
   * Update dependency graph
   */
  updateDependencyGraph(manifest) {
    const dependencies = manifest.dependencies.plugins || [];
    this.dependencyGraph.set(manifest.id, dependencies);
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginId) {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) {
      return false;
    }

    try {
      // Run before unload hooks
      this.runHooks('beforeUnload', { plugin });

      // Remove all components registered by this plugin
      this.removePluginComponents(pluginId);

      // Call plugin cleanup if available
      if (plugin.runtime.cleanup) {
        await plugin.runtime.cleanup();
      }

      // Remove from loaded plugins
      this.loadedPlugins.delete(pluginId);

      // Run after unload hooks
      this.runHooks('afterUnload', { pluginId });

      // Emit plugin unloaded event
      this.stateManager.emit?.('pluginUnloaded', { pluginId });

      return true;

    } catch (error) {
      console.error(`Error unloading plugin ${pluginId}:`, error);
      throw error;
    }
  }

  /**
   * Remove all components registered by a plugin
   */
  removePluginComponents(pluginId) {
    // Remove from all registries
    for (const registry of [
      this.componentRegistry,
      this.actionRegistry,
      this.widgetRegistry,
      this.fieldRendererRegistry,
      this.commandHandlerRegistry
    ]) {
      for (const [key, value] of registry) {
        if (value.pluginId === pluginId) {
          registry.delete(key);
        }
      }
    }
  }

  /**
   * Helper methods
   */
  renderMissingWidget(widgetId) {
    const div = document.createElement('div');
    div.className = 'plugin-widget-missing';
    div.innerHTML = `<p>Widget not found: ${widgetId}</p>`;
    return div;
  }

  renderErrorWidget(widgetId, error) {
    const div = document.createElement('div');
    div.className = 'plugin-widget-error';
    div.innerHTML = `
      <p><strong>Widget Error: ${widgetId}</strong></p>
      <p>${error.message}</p>
    `;
    return div;
  }

  getPluginContext(pluginId) {
    const plugin = this.loadedPlugins.get(pluginId);
    return plugin?.context;
  }

  getPluginForContext(requestingPluginId, targetPluginId) {
    // Check permissions, etc.
    const plugin = this.loadedPlugins.get(targetPluginId);
    return plugin?.context;
  }

  setPluginConfig(pluginId, key, value) {
    const manifest = this.pluginManifests.get(pluginId);
    if (manifest) {
      if (!manifest.rawManifest.config) {
        manifest.rawManifest.config = {};
      }
      manifest.rawManifest.config[key] = value;
    }
  }

  recordLoadTime(loadTime) {
    this.metrics.loadingTimes.push(loadTime);
    if (this.metrics.loadingTimes.length > 100) {
      this.metrics.loadingTimes.shift();
    }
    this.metrics.averageLoadTime = 
      this.metrics.loadingTimes.reduce((sum, time) => sum + time, 0) / 
      this.metrics.loadingTimes.length;
  }

  runHooks(hookName, data) {
    const hooks = this.hooks[hookName] || [];
    hooks.forEach(hook => {
      try {
        hook(data);
      } catch (error) {
        console.error(`Hook error for ${hookName}:`, error);
      }
    });
  }

  /**
   * Get system statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      loadedPlugins: this.loadedPlugins.size,
      availableManifests: this.pluginManifests.size,
      registeredWidgets: this.widgetRegistry.size,
      registeredFieldRenderers: this.fieldRendererRegistry.size,
      registeredCommandHandlers: this.commandHandlerRegistry.size
    };
  }

  /**
   * Export plugin states for debugging
   */
  exportState() {
    return {
      manifests: Array.from(this.pluginManifests.values()),
      loadedPlugins: Array.from(this.loadedPlugins.keys()),
      components: Array.from(this.componentRegistry.keys()),
      actions: Array.from(this.actionRegistry.keys()),
      widgets: Array.from(this.widgetRegistry.keys())
    };
  }
}

export default ManifestPluginSystem;