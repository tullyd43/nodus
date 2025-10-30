/**
 * @file SystemBootstrap.js
 * @description Provides a configuration-driven bootstrap process for initializing all core systems of the application.
 * This class orchestrates the loading, initialization, and integration of various managers and engines,
 * ensuring a predictable and robust startup sequence.
 * @see {@link d:\Development Files\repositories\nodus\src\docs\feature_development_philosophy.md} for architectural principles.
 */

import AdaptiveRenderer from "./AdaptiveRenderer.js";
import EventFlowEngine from "./EventFlowEngine.js";
import HybridStateManager from "./HybridStateManager.js";
import ManifestPluginSystem from "./ManifestPluginSystem.js";

//These lines are moved to the constructor
//context.metricsRegistry = metricsRegistry;
//context.errorHelpers = ErrorHelpers;
//context.metricsReporter = new MetricsReporter(context, 3000);
//context.metricsReporter.start();

/**
 * @class SystemBootstrap
 * @classdesc Manages the configuration-driven initialization of the entire application.
 * It loads systems in a specified order, handles dependencies, and sets up inter-system communication.
 */
export class SystemBootstrap {
	/**
	 * Creates an instance of SystemBootstrap.
	 */
	constructor() {
		/**
		 * A map of all initialized system instances, keyed by their name.
		 * @type {Map<string, object>}
		 */
		this.systems = new Map();
		/**
		 * The order in which to initialize core systems.
		 * @type {string[]}
		 */
		this.initializationOrder = [];
		/**
		 * A list of systems that can be initialized in parallel.
		 * @type {string[]}
		 */
		this.parallelSystems = [];
		/**
		 * The bootstrap configuration object.
		 * @type {object|null}
		 */
		this.config = null;
		/** @type {boolean} */
		this.initialized = false;
		/** @type {object} */
		this.metrics = {
			startTime: 0,
			endTime: 0,
			totalInitTime: 0,
			systemInitTimes: new Map(),
			errors: [],
		};
	}

	/**
	 * Initializes all core systems based on the provided or loaded configuration.
	 * This is the main entry point for starting the application.
	 * @param {object} [configOverrides={}] - An object containing configuration values to override the defaults.
	 * @returns {Promise<void>}
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
				`✅ System bootstrap completed in ${this.metrics.totalInitTime.toFixed(2)}ms`
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
	 * Loads the bootstrap configuration by merging defaults, stored configuration (if any), and runtime overrides.
	 * @param {object} [overrides={}] - Runtime configuration overrides.
	 * @returns {Promise<object>} The final, merged configuration object.
	 * @private
	 */
	async loadBootstrapConfig(overrides = {}) {
		try {
			// Try to load from stored configuration entity
			const storedConfig = await this.loadStoredBootstrapConfig();

			// Merge with defaults and overrides
			const defaultConfig = this.getDefaultBootstrapConfig();
			const config = this.mergeConfigs(
				defaultConfig,
				storedConfig,
				overrides
			);

			console.log("📋 Bootstrap configuration loaded:", config);
			return config;
		} catch (error) {
			console.warn(
				"Failed to load stored config, using defaults:",
				error
			);
			return this.mergeConfigs(
				this.getDefaultBootstrapConfig(),
				overrides
			);
		}
	}

	/**
	 * A placeholder for loading bootstrap configuration from a persistent source like IndexedDB.
	 * @private
	 * @returns {Promise<null>} Currently returns null to use default configuration.
	 */
	async loadStoredBootstrapConfig() {
		// This would typically load from IndexedDB or server
		// For now, return null to use defaults
		return null;
	}

	/**
	 * Provides the default bootstrap configuration for the application.
	 * @private
	 * @returns {object} The default configuration object.
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
	 * Validates the loaded bootstrap configuration to ensure all required sections and definitions are present.
	 * @param {object} config - The configuration object to validate.
	 * @throws {Error} If the configuration is invalid.
	 * @private
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
						`System '${systemName}' in initialization order but not defined in core_systems`
					);
				}
			}
		}

		if (errors.length > 0) {
			throw new Error(
				`Configuration validation failed: ${errors.join(", ")}`
			);
		}
	}

	/**
	 * Initializes the core systems sequentially based on the order defined in the configuration.
	 * @private
	 * @returns {Promise<void>}
	 */
	async initializeOrderedSystems() {
		const order = this.config.initialization.order;

		for (const systemName of order) {
			await this.initializeSystem(systemName);
		}
	}

	/**
	 * Initializes systems that can be loaded in parallel to speed up the bootstrap process.
	 * @private
	 * @returns {Promise<void>}
	 */
	async initializeParallelSystems() {
		const parallelSystems = this.config.initialization.parallel || [];

		const initPromises = parallelSystems.map((systemName) =>
			this.initializeSystem(systemName)
		);

		await Promise.all(initPromises);
	}

	/**
	 * Initializes a single system by name, creating its instance and running its `initialize` method.
	 * @private
	 * @param {string} systemName - The name of the system to initialize.
	 * @returns {Promise<void>}
	 * @throws {Error} If the system configuration is not found or initialization fails.
	 */
	async initializeSystem(systemName) {
		const systemStartTime = performance.now();

		try {
			console.log(`🔧 Initializing ${systemName}...`);

			const systemConfig = this.config.core_systems[systemName];
			if (!systemConfig) {
				throw new Error(
					`System configuration not found: ${systemName}`
				);
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

			console.log(
				`✅ ${systemName} initialized in ${initTime.toFixed(2)}ms`
			);
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
	 * Creates an instance of a system based on its configuration type.
	 * @private
	 * @param {object} systemConfig - The configuration for the system.
	 * @returns {Promise<object>} A promise that resolves with the created system instance.
	 * @throws {Error} If the system type is unknown or creation fails.
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
					const stateManagerForEvents =
						this.systems.get("state_manager");
					return new EventFlowEngine(stateManagerForEvents);

				case "ManifestPluginSystem":
					const stateManagerForPlugins =
						this.systems.get("state_manager");
					return new ManifestPluginSystem(stateManagerForPlugins);

				case "UISystem":
					return await this.createUISystem(config);

				default:
					// Try to load system dynamically
					return await this.loadDynamicSystem(systemType, config);
			}
		} catch (error) {
			console.error(
				`Failed to create system instance ${systemType}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * A placeholder for creating the main UI system instance.
	 * @private
	 * @param {object} config - The configuration for the UI system.
	 * @returns {Promise<object>} The created UI system instance.
	 */
	async createUISystem(config) {
		// UI System would integrate various UI components
		return {
			config,

			async initialize() {
				console.log("UI System initialized with config:", config);

				// Set up responsive behavior
				if (config.responsiveBreakpoints) {
					this.setupResponsiveBreakpoints(
						config.responsiveBreakpoints
					);
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
	 * Dynamically loads a system module from a relative path.
	 * @private
	 * @param {string} systemType - The type (and filename) of the system to load.
	 * @param {object} config - The configuration for the system.
	 * @returns {Promise<object>} The created system instance.
	 * @throws {Error} If the module or class cannot be found.
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
			console.error(
				`Failed to load dynamic system ${systemType}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * Sets up integrations and dependencies between the core initialized systems.
	 * @private
	 * @returns {Promise<void>}
	 */
	async setupSystemIntegrations() {
		console.log("🔗 Setting up system integrations...");

		// Get system references
		const stateManager = this.systems.get("state_manager");

		// bind global error listeners once
		if (stateManager) {
			try {
				const { attachErrorListeners } = await import(
					"./ErrorHelpers_EventFlow.js"
				);
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
	 * Sets up hooks to automatically register components with the `AdaptiveRenderer`
	 * as they are added to the global `componentRegistry`.
	 * @private
	 * @param {HybridStateManager} stateManager - The state manager instance.
	 * @param {AdaptiveRenderer} adaptiveRenderer - The adaptive renderer instance.
	 */
	setupComponentRegistryHooks(stateManager, adaptiveRenderer) {
		// Import componentRegistry from ComponentDefinition
		import("./ComponentDefinition.js")
			.then(({ componentRegistry }) => {
				// Register hook to auto-sync new components when they're registered
				componentRegistry.onHook("afterRegister", (definition) => {
					adaptiveRenderer.registerComponent(
						definition.id,
						definition
					);
					console.log(`Auto-registered component: ${definition.id}`);

					// Emit event through state manager
					if (stateManager.eventFlowEngine) {
						stateManager.eventFlowEngine.emit(
							"componentRegistered",
							{
								componentId: definition.id,
								definition,
								timestamp: Date.now(),
							}
						);
					}
				});

				// Register hook for component updates
				componentRegistry.onHook("beforeUnregister", (definition) => {
					console.log(`Component unregistered: ${definition.id}`);

					if (stateManager.eventFlowEngine) {
						stateManager.eventFlowEngine.emit(
							"componentUnregistered",
							{
								componentId: definition.id,
								timestamp: Date.now(),
							}
						);
					}
				});
			})
			.catch((error) => {
				console.error(
					"Failed to set up component registry hooks:",
					error
				);
			});
	}

	/**
	 * Registers default event flows that handle cross-system communication, such as for health monitoring and plugin lifecycle events.
	 * @private
	 * @returns {void}
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
						{
							type: "track_metric",
							metric: "system.critical_errors",
						},
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
				trigger: {
					events: ["pluginLoaded", "pluginUnloaded", "pluginError"],
				},
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
					unloaded: [
						{ type: "track_metric", metric: "plugins.unloaded" },
					],
					error: [
						{ type: "log_error", level: "error" },
						{ type: "track_metric", metric: "plugins.errors" },
					],
				},
			});
		}
	}

	/**
	 * Runs tasks that should occur after all core systems are initialized, such as loading enabled plugins.
	 * @private
	 * @returns {Promise<void>}
	 */
	async runPostInitializationTasks() {
		console.log("🎯 Running post-initialization tasks...");

		// Load enabled plugins
		const pluginSystem = this.systems.get("plugin_system");
		if (pluginSystem && this.config.plugin_configuration?.enabled_plugins) {
			for (const pluginId of this.config.plugin_configuration
				.enabled_plugins) {
				try {
					await pluginSystem.loadPlugin(pluginId);
				} catch (error) {
					console.error(
						`Failed to load enabled plugin ${pluginId}:`,
						error
					);
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
	 * Starts performance monitoring tasks.
	 * @private
	 * @returns {void}
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
	 * Periodically checks the health status of all initialized systems.
	 * @private
	 * @returns {void}
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
	 * Sets up global error handlers to capture uncaught exceptions and promise rejections, routing them through the `EventFlowEngine`.
	 * @private
	 * @returns {void}
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
					message:
						event.reason?.message || "Unhandled promise rejection",
					reason: event.reason,
					severity: "critical",
				});
			});
		}
	}

	/**
	 * Emits a `system_ready` event through the `EventFlowEngine` and a global `CustomEvent` to signal that the bootstrap is complete.
	 * @private
	 * @returns {void}
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
				})
			);
		}
	}

	/**
	 * Deeply merges multiple configuration objects.
	 * @private
	 * @param {...object} configs - The configuration objects to merge.
	 * @returns {object} The merged configuration object.
	 */
	mergeConfigs(...configs) {
		return configs.reduce((merged, config) => {
			if (!config) return merged;

			for (const [key, value] of Object.entries(config)) {
				if (
					value &&
					typeof value === "object" &&
					!Array.isArray(value)
				) {
					merged[key] = this.mergeConfigs(merged[key] || {}, value);
				} else {
					merged[key] = value;
				}
			}

			return merged;
		}, {});
	}

	/**
	 * Retrieves an initialized system instance by its name.
	 * @param {string} systemName - The name of the system to retrieve.
	 * @returns {object|undefined} The system instance, or undefined if not found.
	 */
	getSystem(systemName) {
		return this.systems.get(systemName);
	}

	/**
	 * Retrieves a map of all initialized system instances.
	 * @returns {Map<string, object>} A map of all systems.
	 */
	getAllSystems() {
		return new Map(this.systems);
	}

	/**
	 * Retrieves performance and state metrics for the bootstrap process.
	 * @returns {object} An object containing various metrics, including total initialization time
	 * and individual system initialization times.
	 */
	getMetrics() {
		return {
			...this.metrics,
			systemCount: this.systems.size,
			averageSystemInitTime:
				Array.from(this.metrics.systemInitTimes.values()).reduce(
					(sum, time) => sum + time,
					0
				) / this.metrics.systemInitTimes.size,
		};
	}

	/**
	 * Shuts down all initialized systems gracefully in the reverse order of their initialization.
	 * @private
	 * @returns {Promise<void>}
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
 * The main entry point for initializing the application. It creates a singleton instance
 * of `SystemBootstrap` and runs its initialization process.
 * @param {object} [config={}] - Configuration overrides for the bootstrap process.
 * @returns {Promise<SystemBootstrap>} A promise that resolves with the initialized bootstrap instance.
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
 * Retrieves the global singleton instance of the `SystemBootstrap`.
 * @returns {SystemBootstrap|null} The global bootstrap instance, or null if not yet initialized.
 */
export function getSystemBootstrap() {
	return globalBootstrap;
}

export default SystemBootstrap;
