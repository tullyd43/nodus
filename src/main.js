/**
 * @file Nodus V7.1 - Main Entry Point
 * @module main
 * @description Vite entry point that initializes the complete Nodus system, including the core, state management, UI, and enhanced grid systems.
 * @see {@link d:\Development Files\repositories\nodus\src\docs\feature_development_philosophy.md} for architectural principles.
 */

// Core system imports
import { SystemBootstrap } from "./core/SystemBootstrap.js";
import { HybridStateManager } from "./core/HybridStateManager.js";
import { BuildingBlockRenderer } from "./core/BuildingBlockRenderer.js";
import { EventFlowEngine } from "./core/EventFlowEngine.js";

// Grid system imports
import { initializeCompleteGridSystem } from "./grid/CompleteGridSystem.js";
import { extendSystemPoliciesWithGrid } from "./grid/GridPolicyIntegration.js";

// Utils
import { LRUCache } from "./utils/LRUCache.js";
import { BoundedStack } from "./utils/BoundedStack.js";

// CSS imports for Vite
import "./styles/main.css";
import "./grid/grid-system.css"; // Grid-specific styles

/**
 * @class NodusApp
 * @classdesc The main application class for Nodus. It orchestrates the initialization and management of all major system components.
 */
class NodusApp {
  /**
   * @class
   * @description Initializes the application configuration and state.
   */
  constructor() {
    /**
     * @property {boolean} initialized - Flag indicating if the application has been successfully initialized.
     * @public
     */
    this.initialized = false;
    /**
     * @property {object} components - A container for all major system components.
     * @public
     */
    this.components = {};
    /**
     * @property {object} config - Application configuration settings derived from environment variables.
     * @public
     */
    this.config = {
      environment: import.meta.env.MODE || "development",
      apiUrl: import.meta.env.VITE_API_URL || "http://localhost:3000",
      enableGridEnhancements:
        import.meta.env.VITE_ENABLE_GRID === "true" || true,
      enableAI: import.meta.env.VITE_ENABLE_AI === "true" || false,
      enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS === "true" || true,
    };
  }

  /**
   * @function initialize
   * @description Initializes all systems of the Nodus application in the correct order.
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      console.log("🚀 Initializing Nodus V7.1...");

      // 1. Bootstrap core systems
      await this.initializeCore();

      // 2. Initialize state management
      await this.initializeState();

      // 3. Initialize UI systems
      await this.initializeUI();

      // 4. Initialize enhanced grid system
      if (this.config.enableGridEnhancements) {
        await this.initializeGridSystem();
      }

      // 5. Start the application
      await this.start();

      this.initialized = true;
      console.log("✅ Nodus V7.1 initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize Nodus:", error);
      this.handleInitializationError(error);
    }
  }

  /**
   * @function initializeCore
   * @description Initializes core components like SystemBootstrap and EventFlowEngine.
   * @async
   * @private
   * @returns {Promise<void>}
   */
  async initializeCore() {
    // Initialize system bootstrap
    this.components.bootstrap = new SystemBootstrap({
      environment: this.config.environment,
      enablePolicies: true,
      enableSecurity: true,
    });

    await this.components.bootstrap.initialize();

    // Initialize event flow engine
    this.components.eventFlow = new EventFlowEngine();
    await this.components.eventFlow.initialize();

    console.log("✅ Core systems initialized");
  }

  /**
   * @function initializeState
   * @description Initializes state management components like HybridStateManager, LRUCache, and BoundedStack.
   * @async
   * @private
   * @returns {Promise<void>}
   */
  async initializeState() {
    // Initialize hybrid state manager
    this.components.stateManager = new HybridStateManager({
      enableOffline: true,
      enableSync: true,
      enableEmbedding: this.config.enableAI,
    });

    await this.components.stateManager.initialize();

    // Initialize caching
    this.components.cache = new LRUCache(1000, { ttl: 3600000 }); // 1 hour TTL
    this.components.undoStack = new BoundedStack(50); // 50 operations

    console.log("✅ State management initialized");
  }

  /**
   * @function initializeUI
   * @description Initializes UI components like the BuildingBlockRenderer.
   * @async
   * @private
   * @returns {Promise<void>}
   */
  async initializeUI() {
    // Initialize building block renderer
    this.components.renderer = new BuildingBlockRenderer(
      this.components.stateManager,
      this.components.eventFlow,
    );

    await this.components.renderer.initialize();

    console.log("✅ UI systems initialized");
  }

  /**
   * @function initializeGridSystem
   * @description Initializes the enhanced grid system and integrates it with system policies and the state manager.
   * @async
   * @private
   * @returns {Promise<void>}
   */
  async initializeGridSystem() {
    try {
      // Extend system policies with grid policies
      await extendSystemPoliciesWithGrid();

      // Create app view model for grid integration
      const appViewModel = {
        context: this.components.bootstrap.getContext(),
        gridLayoutViewModel: this.createGridLayoutViewModel(),
        hybridStateManager: this.components.stateManager,
        getCurrentUser: () => this.components.bootstrap.getCurrentUser(),
      };

      // Initialize complete grid system
      this.components.gridSystem = await initializeCompleteGridSystem(
        appViewModel,
        {
          enablePolicies: true,
          enableToasts: true,
          enableAI: this.config.enableAI,
          enableAnalytics: this.config.enableAnalytics,
        },
      );

      console.log("✅ Enhanced grid system initialized");
    } catch (error) {
      console.warn(
        "⚠️ Grid system initialization failed, continuing without enhancements:",
        error,
      );
      // Application continues without grid enhancements
    }
  }

  /**
   * @function createGridLayoutViewModel
   * @description Creates a view model for the grid layout that integrates with the state manager.
   * @private
   * @returns {object} The grid layout view model.
   */
  createGridLayoutViewModel() {
    // Basic grid layout view model for compatibility
    return {
      getCurrentLayout: () => ({
        id: "default",
        name: "Default Layout",
        blocks: [],
      }),
      updatePositions: async (positions) => {
        // Save positions to state manager
        await this.components.stateManager.recordOperation({
          type: "grid_position_update",
          data: positions,
        });
      },
    };
  }

  /**
   * @function start
   * @description Mounts the application to the DOM and sets up initial UI and event listeners.
   * @async
   * @private
   * @returns {Promise<void>}
   */
  async start() {
    // Mount the application to the DOM
    const app = document.getElementById("app");
    if (!app) {
      throw new Error("Application mount point #app not found");
    }

    // Create main application UI
    const mainUI = this.createMainUI();
    app.appendChild(mainUI);

    // Start event listeners
    this.setupEventListeners();

    // Show initialization complete message
    if (this.components.gridSystem?.getToastManager) {
      this.components.gridSystem
        .getToastManager()
        .success("🎯 Nodus V7.1 ready with enhanced grid system", 4000);
    }
  }

  /**
   * @function createMainUI
   * @description Creates the main application UI structure.
   * @private
   * @returns {HTMLElement} The main application container element.
   */
  createMainUI() {
    const container = document.createElement("div");
    container.className = "nodus-app";

    // Create header
    const header = document.createElement("header");
    header.className = "nodus-header";
    header.innerHTML = `
      <h1>Nodus V7.1</h1>
      <div class="header-controls">
        <button id="grid-toggle" class="btn-secondary">Toggle Grid Enhancement</button>
        <button id="performance-toggle" class="btn-secondary">Performance Mode</button>
      </div>
    `;

    // Create main content area with grid
    const main = document.createElement("main");
    main.className = "nodus-main";
    main.innerHTML = `
      <div class="grid-container">
        <!-- Grid blocks will be rendered here -->
        <div class="grid-block demo-block" data-block-id="demo-1">
          <h3>Welcome to Nodus V7.1</h3>
          <p>Enhanced grid system with drag, resize, and accessibility features.</p>
        </div>
        <div class="grid-block demo-block" data-block-id="demo-2">
          <h3>Performance Monitor</h3>
          <p>Real-time performance monitoring with policy controls.</p>
        </div>
      </div>
    `;

    container.appendChild(header);
    container.appendChild(main);

    return container;
  }

  /**
   * @function setupEventListeners
   * @description Sets up global event listeners for the application.
   * @private
   * @returns {void}
   */
  setupEventListeners() {
    // Grid toggle
    document.getElementById("grid-toggle")?.addEventListener("click", () => {
      if (this.components.gridSystem) {
        const enhancer = this.components.gridSystem.getGridEnhancer();
        if (enhancer.isEnhanced) {
          enhancer.disable();
        } else {
          enhancer.enhance();
        }
      }
    });

    // Performance mode toggle
    document
      .getElementById("performance-toggle")
      ?.addEventListener("click", async () => {
        try {
          const context = this.components.bootstrap.getContext();
          const currentMode = context.getPolicy(
            "system",
            "grid_performance_mode",
          );
          const newMode = currentMode === true ? null : true; // Toggle between forced and auto

          await context.setPolicy("system", "grid_performance_mode", newMode);

          if (this.components.gridSystem?.getToastManager) {
            const message =
              newMode === true
                ? "Performance mode forced on"
                : "Performance mode set to auto";
            this.components.gridSystem.getToastManager().info(message, 3000);
          }
        } catch (error) {
          console.error("Failed to toggle performance mode:", error);
        }
      });

    // Global error handling
    window.addEventListener("error", (event) => {
      console.error("Global error:", event.error);
      if (this.components.gridSystem?.getToastManager) {
        this.components.gridSystem
          .getToastManager()
          .error("An error occurred. Check console for details.", 5000);
      }
    });
  }

  /**
   * @function handleInitializationError
   * @description Displays an error message in the UI if initialization fails.
   * @private
   * @param {Error} error - The error that occurred during initialization.
   * @returns {void}
   */
  handleInitializationError(error) {
    // Create minimal error UI
    const app = document.getElementById("app");
    if (app) {
      app.innerHTML = `
        <div class="error-container">
          <h1>❌ Initialization Failed</h1>
          <p>Nodus failed to initialize properly.</p>
          <details>
            <summary>Error Details</summary>
            <pre>${error.message}\n${error.stack}</pre>
          </details>
          <button onclick="window.location.reload()">Reload Application</button>
        </div>
      `;
    }
  }

  /**
   * @function getComponent
   * @description Retrieves a system component by name.
   * @public
   * @param {string} name - The name of the component to retrieve.
   * @returns {object|undefined} The component instance, or undefined if not found.
   */
  getComponent(name) {
    return this.components[name];
  }

  /**
   * @function isInitialized
   * @description Checks if the application has been successfully initialized.
   * @public
   * @returns {boolean} `true` if initialized, `false` otherwise.
   */
  isInitialized() {
    return this.initialized;
  }
}

// Initialize application when DOM is ready
let app;

/**
 * @function initializeNodus
 * @description Creates and initializes a new NodusApp instance.
 * @async
 * @returns {Promise<void>}
 */
async function initializeNodus() {
  try {
    app = new NodusApp();
    await app.initialize();

    // Expose app globally for debugging
    if (import.meta.env.MODE === "development") {
      window.nodus = app;
    }
  } catch (error) {
    console.error("Failed to initialize Nodus application:", error);
  }
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeNodus);
} else {
  initializeNodus();
}

// Export for Vite HMR
export { NodusApp, initializeNodus };
