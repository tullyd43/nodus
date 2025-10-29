// core/SystemBootstrap.js
// Configuration-driven system initialization

import AdaptiveRenderer from "./AdaptiveRenderer.js";
import EventFlowEngine from "./EventFlowEngine.js";
import ManifestPluginSystem from "./ManifestPluginSystem.js";
import HybridStateManager from "./HybridStateManager.js";

import { metricsRegistry } from "./utils/MetricsRegistry.js";
import { MetricsReporter } from "./utils/MetricsReporter.js";
import { ErrorHelpers } from "./utils/ErrorHelpers.js";

//These lines are moved to the constructor
//context.metricsRegistry = metricsRegistry;
//context.errorHelpers = ErrorHelpers;
//context.metricsReporter = new MetricsReporter(context, 3000);
//context.metricsReporter.start();

export class SystemBootstrap {
  constructor() {
    this.systems = new Map();
    this.initializationOrder = [];
    this.parallelSystems = [];
    this.config = null;
    this.initialized = false;
    this.metrics = {
      startTime: 0,
      endTime: 0,
      totalInitTime: 0,
      systemInitTimes: new Map(),
      errors: [],
    };
  }

  /**
   * Initialize the system from configuration
   */
  async initialize(configOverrides = {}) {
    if (this.initialized) {
      console.warn("System already initialized");
      return;
    }

    this.metrics.startTime = performance.now();

    try {
      console.log("🚀 Starting system bootstrap...");

      // Load bootstrap configuration
      this.config = await this.loadBootstrapConfig(configOverrides);

      // Validate configuration
      this.validateConfig(this.config);

      // Initialize systems in order
      await this.initializeOrderedSystems();

      // Initialize parallel systems
      await this.initializeParallelSystems();

      // Set up system integrations
      await this.setupSystemIntegrations();

      // Run post-initialization tasks
      await this.runPostInitializationTasks();

      this.initialized = true;
      this.metrics.endTime = performance.now();
      this.metrics.totalInitTime =
        this.metrics.endTime - this.metrics.startTime;

      console.log(
        `✅ System bootstrap completed in ${this.metrics.totalInitTime.toFixed(2)}ms`,
      );

      // Emit system ready event
      this.emitSystemReady();
    } catch (error) {
      this.metrics.errors.push({
        phase: "initialization",
        error: error.message,
        timestamp: Date.now(),
      });

      console.error("❌ System bootstrap failed:", error);
      throw error;
    }
  }

  /**
   * Load bootstrap configuration from stored entities or defaults
   */
  async loadBootstrapConfig(overrides = {}) {
    try {
      // Try to load from stored configuration entity
      const storedConfig = await this.loadStoredBootstrapConfig();

      // Merge with defaults and overrides
      const defaultConfig = this.getDefaultBootstrapConfig();
      const config = this.mergeConfigs(defaultConfig, storedConfig, overrides);

      console.log("📋 Bootstrap configuration loaded:", config);
      return config;
    } catch (error) {
      console.warn("Failed to load stored config, using defaults:", error);
      return this.mergeConfigs(this.getDefaultBootstrapConfig(), overrides);
    }
  }

  /**
   * Load stored bootstrap configuration
   */
  async loadStoredBootstrapConfig() {
    // This would typically load from IndexedDB or server
    // For now, return null to use defaults
    return null;
  }

  /**
   * Get default bootstrap configuration
   */
  getDefaultBootstrapConfig() {
    return {
      initialization: {
        order: [
          "state_manager",
          "adaptive_renderer",
          "event_flow_engine",
          "plugin_system",
          "ui_system",
        ],
        parallel: ["performance_monitoring", "offline_sync"],
      },

      core_systems: {
        state_manager: {
          type: "HybridStateManager",
          config: {
            maxViewportItems: 200,
            performanceMode: true,
            offlineEnabled: true,
            embeddingEnabled: true,
          },
        },

        adaptive_renderer: {
          type: "AdaptiveRenderer",
          config: {
            cacheSize: 1000,
            enableMetrics: true,
          },
        },

        event_flow_engine: {
          type: "EventFlowEngine",
          config: {
            maxExecutionDepth: 10,
            enableMetrics: true,
          },
        },

        plugin_system: {
          type: "ManifestPluginSystem",
          config: {
            autoloadEnabled: true,
            sandboxMode: true,
          },
        },

        ui_system: {
          type: "UISystem",
          config: {
            defaultLayout: "dashboard",
            responsiveBreakpoints: {
              mobile: 768,
              tablet: 1024,
              desktop: 1200,
            },
          },
        },
      },

      ui_configuration: {
        default_layout: "dashboard",
        overlays: ["performance_monitor"],
        themes: ["light", "dark"],
        responsive_mode: true,
      },

      plugin_configuration: {
        enabled_plugins: [],
        plugin_search_paths: ["/plugins", "/user-plugins"],
        marketplace_url: "https://marketplace.nodus.app",
      },

      feature_flags: {
        adaptive_rendering: true,
        plugin_system: true,
        performance_monitoring: true,
        offline_mode: true,
      },
    };
  }

  /**
   * Validate bootstrap configuration
   */
  validateConfig(config) {
    const errors = [];

    // Check required sections
    if (!config.initialization) {
      errors.push("Missing initialization section");
    }

    if (!config.core_systems) {
      errors.push("Missing core_systems section");
    }

    // Check initialization order
    if (config.initialization?.order) {
      for (const systemName of config.initialization.order) {
        if (!config.core_systems[systemName]) {
          errors.push(
            `System '${systemName}' in initialization order but not defined in core_systems`,
          );
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(", ")}`);
    }
  }

  /**
   * Initialize systems in specified order
   */
  async initializeOrderedSystems() {
    const order = this.config.initialization.order;

    for (const systemName of order) {
      await this.initializeSystem(systemName);
    }
  }

  /**
   * Initialize parallel systems
   */
  async initializeParallelSystems() {
    const parallelSystems = this.config.initialization.parallel || [];

    const initPromises = parallelSystems.map((systemName) =>
      this.initializeSystem(systemName),
    );

    await Promise.all(initPromises);
  }

  /**
   * Initialize a single system
   */
  async initializeSystem(systemName) {
    const systemStartTime = performance.now();

    try {
      console.log(`🔧 Initializing ${systemName}...`);

      const systemConfig = this.config.core_systems[systemName];
      if (!systemConfig) {
        throw new Error(`System configuration not found: ${systemName}`);
      }

      // Create system instance
      const system = await this.createSystemInstance(systemConfig);

      // Initialize the system
      if (system.initialize && typeof system.initialize === "function") {
        await system.initialize();
      }

      // Store system reference
      this.systems.set(systemName, system);

      const initTime = performance.now() - systemStartTime;
      this.metrics.systemInitTimes.set(systemName, initTime);

      console.log(`✅ ${systemName} initialized in ${initTime.toFixed(2)}ms`);
    } catch (error) {
      const initTime = performance.now() - systemStartTime;
      this.metrics.systemInitTimes.set(systemName, initTime);
      this.metrics.errors.push({
        system: systemName,
        error: error.message,
        timestamp: Date.now(),
      });

      console.error(`❌ Failed to initialize ${systemName}:`, error);
      throw error;
    }
  }

  /**
   * Create system instance from configuration
   */
  async createSystemInstance(systemConfig) {
    const systemType = systemConfig.type;
    const config = systemConfig.config || {};

    try {
      switch (systemType) {
        case "HybridStateManager":
          return new HybridStateManager(config);

        case "AdaptiveRenderer":
          const stateManager = this.systems.get("state_manager");
          return new AdaptiveRenderer(stateManager);

        case "EventFlowEngine":
          const stateManagerForEvents = this.systems.get("state_manager");
          return new EventFlowEngine(stateManagerForEvents);

        case "ManifestPluginSystem":
          const stateManagerForPlugins = this.systems.get("state_manager");
          return new ManifestPluginSystem(stateManagerForPlugins);

        case "UISystem":
          return await this.createUISystem(config);

        default:
          // Try to load system dynamically
          return await this.loadDynamicSystem(systemType, config);
      }
    } catch (error) {
      console.error(`Failed to create system instance ${systemType}:`, error);
      throw error;
    }
  }

  /**
   * Create UI system
   */
  async createUISystem(config) {
    // UI System would integrate various UI components
    return {
      config,

      async initialize() {
        console.log("UI System initialized with config:", config);

        // Set up responsive behavior
        if (config.responsiveBreakpoints) {
          this.setupResponsiveBreakpoints(config.responsiveBreakpoints);
        }

        // Apply default theme
        if (config.defaultTheme) {
          this.applyTheme(config.defaultTheme);
        }
      },

      setupResponsiveBreakpoints(breakpoints) {
        // Implementation for responsive breakpoints
        console.log("Setting up responsive breakpoints:", breakpoints);
      },

      applyTheme(theme) {
        // Implementation for theme application
        console.log("Applying theme:", theme);
      },
    };
  }

  /**
   * Load system dynamically
   */
  async loadDynamicSystem(systemType, config) {
    try {
      // Try to import the system class
      const module = await import(`./systems/${systemType}.js`);
      const SystemClass = module.default || module[systemType];

      if (!SystemClass) {
        throw new Error(`System class not found: ${systemType}`);
      }

      return new SystemClass(config);
    } catch (error) {
      console.error(`Failed to load dynamic system ${systemType}:`, error);
      throw error;
    }
  }

  /**
   * Set up integrations between systems
   */
  async setupSystemIntegrations() {
    console.log("🔗 Setting up system integrations...");

    // Get system references
    const stateManager = this.systems.get("state_manager");

    // bind global error listeners once
    if (stateManager) {
      try {
        const { attachErrorListeners } = await import('./ErrorHelpers_EventFlow.js');
        attachErrorListeners(stateManager);
      } catch (e) {
        console.error("Failed to attach error listeners", e);
      }
    }

    const adaptiveRenderer = this.systems.get("adaptive_renderer");
    const eventFlowEngine = this.systems.get("event_flow_engine");
    const pluginSystem = this.systems.get("plugin_system");

    // Integrate AdaptiveRenderer with StateManager
    if (stateManager && adaptiveRenderer) {
      stateManager.adaptiveRenderer = adaptiveRenderer;
    }

    // Integrate EventFlowEngine with StateManager
    if (stateManager && eventFlowEngine) {
      stateManager.eventFlowEngine = eventFlowEngine;

      // Replace old EventBus references
      if (typeof window !== "undefined") {
        window.eventFlowEngine = eventFlowEngine;
      }
    }

    // Integrate PluginSystem with other systems
    if (pluginSystem) {
      if (adaptiveRenderer) {
        pluginSystem.adaptiveRenderer = adaptiveRenderer;
      }
      if (eventFlowEngine) {
        pluginSystem.eventFlowEngine = eventFlowEngine;
      }

      // Global plugin system reference (for compatibility)
      if (typeof window !== "undefined") {
        window.pluginSystem = pluginSystem;
      }
    }

    // Set up component registry hooks for live sync
    if (stateManager && adaptiveRenderer) {
      this.setupComponentRegistryHooks(stateManager, adaptiveRenderer);
    }

    // Set up cross-system event flows
    this.setupCrossSystemEventFlows();
  }

  /**
   * Set up component registry hooks for live synchronization
   */
  setupComponentRegistryHooks(stateManager, adaptiveRenderer) {
    // Import componentRegistry from ComponentDefinition
    import("./ComponentDefinition.js")
      .then(({ componentRegistry }) => {
        // Register hook to auto-sync new components when they're registered
        componentRegistry.onHook("afterRegister", (definition) => {
          adaptiveRenderer.registerComponent(definition.id, definition);
          console.log(`Auto-registered component: ${definition.id}`);

          // Emit event through state manager
          if (stateManager.eventFlowEngine) {
            stateManager.eventFlowEngine.emit("componentRegistered", {
              componentId: definition.id,
              definition,
              timestamp: Date.now(),
            });
          }
        });

        // Register hook for component updates
        componentRegistry.onHook("beforeUnregister", (definition) => {
          console.log(`Component unregistered: ${definition.id}`);

          if (stateManager.eventFlowEngine) {
            stateManager.eventFlowEngine.emit("componentUnregistered", {
              componentId: definition.id,
              timestamp: Date.now(),
            });
          }
        });
      })
      .catch((error) => {
        console.error("Failed to set up component registry hooks:", error);
      });
  }

  /**
   * Set up event flows between systems
   */
  setupCrossSystemEventFlows() {
    const eventFlowEngine = this.systems.get("event_flow_engine");

    if (eventFlowEngine) {
      // System health monitoring flow
      eventFlowEngine.registerFlow({
        id: "system_health_monitoring",
        name: "System Health Monitoring",
        trigger: { events: ["system_error", "performance_warning"] },
        conditions: {
          critical: { "data.severity": "critical" },
          warning: { "data.severity": "warning" },
        },
        actions: {
          critical: [
            { type: "log_error", level: "error" },
            {
              type: "show_notification",
              template: "system_error",
              duration: 0,
            },
            { type: "track_metric", metric: "system.critical_errors" },
          ],
          warning: [
            { type: "log_error", level: "warn" },
            { type: "track_metric", metric: "system.warnings" },
          ],
        },
      });

      // Plugin lifecycle flow
      eventFlowEngine.registerFlow({
        id: "plugin_lifecycle",
        name: "Plugin Lifecycle Management",
        trigger: { events: ["pluginLoaded", "pluginUnloaded", "pluginError"] },
        conditions: {
          loaded: { "event.type": "pluginLoaded" },
          unloaded: { "event.type": "pluginUnloaded" },
          error: { "event.type": "pluginError" },
        },
        actions: {
          loaded: [
            { type: "track_metric", metric: "plugins.loaded" },
            {
              type: "show_notification",
              message: "Plugin loaded successfully",
            },
          ],
          unloaded: [{ type: "track_metric", metric: "plugins.unloaded" }],
          error: [
            { type: "log_error", level: "error" },
            { type: "track_metric", metric: "plugins.errors" },
          ],
        },
      });
    }
  }

  /**
   * Run post-initialization tasks
   */
  async runPostInitializationTasks() {
    console.log("🎯 Running post-initialization tasks...");

    // Load enabled plugins
    const pluginSystem = this.systems.get("plugin_system");
    if (pluginSystem && this.config.plugin_configuration?.enabled_plugins) {
      for (const pluginId of this.config.plugin_configuration.enabled_plugins) {
        try {
          await pluginSystem.loadPlugin(pluginId);
        } catch (error) {
          console.error(`Failed to load enabled plugin ${pluginId}:`, error);
        }
      }
    }

    // Initialize performance monitoring
    if (this.config.feature_flags?.performance_monitoring) {
      this.startPerformanceMonitoring();
    }

    // Set up error handling
    this.setupGlobalErrorHandling();
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    const stateManager = this.systems.get("state_manager");
    if (stateManager && stateManager.startPerformanceMonitoring) {
      stateManager.startPerformanceMonitoring();
    }

    // Monitor system health
    setInterval(() => {
      this.checkSystemHealth();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Check system health
   */
  checkSystemHealth() {
    const healthMetrics = {
      systems: {},
      overall: "healthy",
    };

    // Check each system
    for (const [systemName, system] of this.systems) {
      try {
        const systemHealth = system.getHealthStatus?.() || "unknown";
        healthMetrics.systems[systemName] = systemHealth;

        if (systemHealth === "unhealthy") {
          healthMetrics.overall = "degraded";
        }
      } catch (error) {
        healthMetrics.systems[systemName] = "error";
        healthMetrics.overall = "degraded";
      }
    }

    // Emit health status
    const eventFlowEngine = this.systems.get("event_flow_engine");
    if (eventFlowEngine) {
      eventFlowEngine.emit("system_health_check", healthMetrics);
    }
  }

  /**
   * Set up global error handling
   */
  setupGlobalErrorHandling() {
    const eventFlowEngine = this.systems.get("event_flow_engine");

    if (typeof window !== "undefined" && eventFlowEngine) {
      // Global error handler
      window.addEventListener("error", (event) => {
        eventFlowEngine.emit("system_error", {
          type: "javascript_error",
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          severity: "critical",
        });
      });

      // Unhandled promise rejection handler
      window.addEventListener("unhandledrejection", (event) => {
        eventFlowEngine.emit("system_error", {
          type: "unhandled_promise_rejection",
          message: event.reason?.message || "Unhandled promise rejection",
          reason: event.reason,
          severity: "critical",
        });
      });
    }
  }

  /**
   * Emit system ready event
   */
  emitSystemReady() {
    const eventFlowEngine = this.systems.get("event_flow_engine");
    if (eventFlowEngine) {
      eventFlowEngine.emit("system_ready", {
        timestamp: Date.now(),
        initTime: this.metrics.totalInitTime,
        systems: Array.from(this.systems.keys()),
        config: this.config,
      });
    }

    // Custom event for legacy compatibility
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("systemReady", {
          detail: {
            bootstrap: this,
            systems: this.systems,
            metrics: this.metrics,
          },
        }),
      );
    }
  }

  /**
   * Merge configuration objects
   */
  mergeConfigs(...configs) {
    return configs.reduce((merged, config) => {
      if (!config) return merged;

      for (const [key, value] of Object.entries(config)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          merged[key] = this.mergeConfigs(merged[key] || {}, value);
        } else {
          merged[key] = value;
        }
      }

      return merged;
    }, {});
  }

  /**
   * Get system by name
   */
  getSystem(systemName) {
    return this.systems.get(systemName);
  }

  /**
   * Get all systems
   */
  getAllSystems() {
    return new Map(this.systems);
  }

  /**
   * Get bootstrap metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      systemCount: this.systems.size,
      averageSystemInitTime:
        Array.from(this.metrics.systemInitTimes.values()).reduce(
          (sum, time) => sum + time,
          0,
        ) / this.metrics.systemInitTimes.size,
    };
  }

  /**
   * Shutdown system gracefully
   */
  async shutdown() {
    console.log("🛑 Shutting down system...");

    // Shutdown systems in reverse order
    const shutdownOrder = [...this.config.initialization.order].reverse();

    for (const systemName of shutdownOrder) {
      try {
        const system = this.systems.get(systemName);
        if (system && system.shutdown) {
          await system.shutdown();
        }
      } catch (error) {
        console.error(`Error shutting down ${systemName}:`, error);
      }
    }

    this.initialized = false;
    console.log("✅ System shutdown complete");
  }
}

// Global bootstrap instance
let globalBootstrap = null;

/**
 * Initialize the system - main entry point
 */
export async function initializeSystem(config = {}) {
  if (globalBootstrap) {
    console.warn("System already initialized");
    return globalBootstrap;
  }

  globalBootstrap = new SystemBootstrap();
  await globalBootstrap.initialize(config);

  // Make bootstrap available globally for debugging
  if (typeof window !== "undefined") {
    window.systemBootstrap = globalBootstrap;
  }

  return globalBootstrap;
}

/**
 * Get the global bootstrap instance
 */
export function getSystemBootstrap() {
  return globalBootstrap;
}

export default SystemBootstrap;
