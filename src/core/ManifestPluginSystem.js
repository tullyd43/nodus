/**
 * @file ManifestPluginSystem.js
 * @description Replaces a class-based PluginRegistry with a declarative, manifest-driven plugin loading system.
 * This system discovers, loads, and manages plugins based on manifest files, handling dependencies and component registration.
 */

/**
 * @class ManifestPluginSystem
 * @classdesc Orchestrates the entire lifecycle of plugins, from discovery and loading based on manifest files
 * to component registration and dependency management.
 */
export class ManifestPluginSystem {
	/**
	 * Creates an instance of ManifestPluginSystem.
	 * @param {object} context - The global application context.
	 * @param {import('./HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @param {object} context.managers - The collection of system managers.
	 */
	constructor({ stateManager, managers }) {
		/** @type {import('./HybridStateManager.js').default} */
		this.stateManager = stateManager;
		/** @type {object} */
		this.managers = managers;
		/** @private @type {Map<string, object>} */
		this.loadedPlugins = new Map();
		/** @private @type {Map<string, object>} */
		this.pluginManifests = new Map();
		/** @private @type {Map<string, object>} */
		this.componentRegistry = new Map();
		/** @private @type {Map<string, object>} */
		this.actionRegistry = new Map();
		/** @private @type {Map<string, object>} */
		this.widgetRegistry = new Map();
		/** @private @type {Map<string, object>} */
		this.fieldRendererRegistry = new Map();
		/** @private @type {Map<string, object>} */
		this.commandHandlerRegistry = new Map();

		// Plugin runtime environments
		/** @private @type {Map<string, object>} */
		this.runtimeEnvironments = new Map();

		// Plugin loading state
		/** @private @type {Map<string, Promise<object>>} */
		this.loadingPromises = new Map();
		/** @private @type {Map<string, string[]>} */
		this.dependencyGraph = new Map();

		// Plugin lifecycle hooks
		/**
		 * @private
		 * @type {{beforeLoad: Function[], afterLoad: Function[], beforeUnload: Function[], afterUnload: Function[], onError: Function[]}}
		 */
		this.hooks = {
			beforeLoad: [],
			afterLoad: [],
			beforeUnload: [],
			afterUnload: [],
			onError: [],
		};

		// Performance metrics
		/**
		 * @private
		 * @type {{pluginsLoaded: number, loadingTimes: number[], averageLoadTime: number, failedLoads: number, registeredComponents: number, registeredActions: number}}
		 */
		this.metrics = {
			pluginsLoaded: 0,
			loadingTimes: [],
			averageLoadTime: 0,
			failedLoads: 0,
			registeredComponents: 0,
			registeredActions: 0,
		};
	}

	/**
	 * Initializes the plugin system by loading manifests and then loading all enabled plugins.
	 * @returns {Promise<void>}
	 */
	async initialize() {
		try {
			// Load plugin manifests from stored entities
			await this.loadPluginManifests();

			// Load enabled plugins
			await this.loadEnabledPlugins();

			console.log(
				`ManifestPluginSystem initialized with ${this.loadedPlugins.size} plugins`
			);
		} catch (error) {
			console.error("Failed to initialize plugin system:", error);
			throw error;
		}
	}

	/**
	 * Loads all plugin manifest entities from the persistent storage.
	 * @private
	 * @returns {Promise<void>}
	 */
	async loadPluginManifests() {
		try {
			// Use the correct storage query method as per the V8.0 Global Contracts
			const manifestEntities =
				await this.stateManager.storage.instance.query(
					"objects",
					"entity_type",
					"plugin_manifest"
				);

			for (const entity of manifestEntities) {
				this.registerManifest(entity.data);
			}
		} catch (error) {
			console.error("Failed to load plugin manifests:", error);
		}
	}

	/**
	 * Registers a manifest with the system, normalizes its structure, and updates the dependency graph.
	 * @param {object} manifestData - The raw manifest data from storage.
	 * @returns {object} The normalized manifest object.
	 */
	registerManifest(manifestData) {
		const manifest = {
			id: manifestData.id || manifestData.name,
			name: manifestData.name,
			version: manifestData.version || "1.0.0",
			description: manifestData.description || "",
			author: manifestData.author || "",

			// Plugin capabilities
			components: manifestData.components || {},
			dependencies: manifestData.dependencies || {},
			runtime: manifestData.runtime || {},

			// Plugin metadata
			enabled: manifestData.enabled !== false,
			autoload: manifestData.autoload !== false,
			priority: manifestData.priority || "normal",

			// Security and permissions
			permissions: manifestData.permissions || [],
			sandbox: manifestData.sandbox !== false,

			// Original manifest data
			rawManifest: manifestData,
		};

		this.pluginManifests.set(manifest.id, manifest);

		// Build dependency graph
		this.updateDependencyGraph(manifest);

		return manifest;
	}

	/**
	 * Loads a plugin by its ID, handling dependencies and caching.
	 * This is the main entry point for loading a single plugin.
	 * @param {string} pluginId - The unique ID of the plugin to load.
	 * @param {object} [options={}] - Additional options for loading.
	 * @returns {Promise<object>} A promise that resolves with the loaded plugin instance.
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
			this.runHooks("onError", { pluginId, error });
			console.error(`Failed to load plugin ${pluginId}:`, error);
			throw error;
		} finally {
			this.loadingPromises.delete(pluginId);
		}
	}

	/**
	 * The core implementation for loading a plugin. It handles dependency loading,
	 * runtime creation, and component registration.
	 * @private
	 * @param {object} manifest - The plugin's manifest.
	 * @param {object} options - Loading options.
	 * @returns {Promise<object>} The loaded plugin instance.
	 */
	async doLoadPlugin(manifest, options) {
		const pluginId = manifest.id;

		// Run before load hooks
		this.runHooks("beforeLoad", { manifest, options });

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
			status: "loaded",
		};

		this.loadedPlugins.set(pluginId, plugin);
		this.metrics.pluginsLoaded++;

		// Run after load hooks
		this.runHooks("afterLoad", { plugin });

		// Emit plugin loaded event
		this.stateManager.emit?.("pluginLoaded", { pluginId, plugin });

		return plugin;
	}

	/**
	 * Recursively loads all dependencies for a given plugin manifest.
	 * @private
	 * @param {object} manifest - The manifest whose dependencies need to be loaded.
	 * @returns {Promise<void>}
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
	 * Creates a sandboxed context object for a plugin, providing safe access to system APIs.
	 * @private
	 * @param {object} manifest - The manifest of the plugin.
	 * @returns {object} The plugin context object.
	 */
	createPluginContext(manifest) {
		const context = {
			pluginId: manifest.id,
			manifest,
			stateManager: this.stateManager,
			managers: this.managers, // Pass all system managers to the plugin

			// Registration methods
			registerComponent: (id, definition) =>
				this.registerComponent(manifest.id, id, definition),
			registerAction: (id, definition) =>
				this.registerAction(manifest.id, id, definition),
			registerWidget: (id, definition) =>
				this.registerWidget(manifest.id, id, definition),
			registerFieldRenderer: (id, definition) =>
				this.registerFieldRenderer(manifest.id, id, definition),
			registerCommandHandler: (id, definition) =>
				this.registerCommandHandler(manifest.id, id, definition),

			// Utility methods
			emit: (event, data) =>
				this.stateManager.emit?.(
					`plugin:${manifest.id}:${event}`,
					data
				),
			log: (level, message, data) => {
				const allowedLevels = {
					log: console.log,
					warn: console.warn,
					error: console.error,
					info: console.info,
					debug: console.debug,
				};
				// Default to console.log if an invalid level is provided
				const logFn = allowedLevels[level] || console.log;
				logFn(`[Plugin:${manifest.id}] ${message}`, data || "");
			},

			// Access to other plugins (with permission check)
			getPlugin: (pluginId) =>
				this.getPluginForContext(manifest.id, pluginId),

			// Configuration access
			getConfig: (key) => manifest.rawManifest.config?.[key],
			setConfig: (key, value) =>
				this.setPluginConfig(manifest.id, key, value),
		};

		return context;
	}

	/**
	 * Loads or creates the runtime environment for a plugin based on its manifest.
	 * @private
	 * @param {object} manifest - The plugin's manifest.
	 * @param {object} context - The plugin's execution context.
	 * @returns {Promise<object>} The plugin's runtime environment.
	 */
	async loadPluginRuntime(manifest, context) {
		const runtimeConfig = manifest.runtime;

		if (runtimeConfig.frontend) {
			// Load frontend runtime (JavaScript module)
			return await this.loadFrontendRuntime(
				runtimeConfig.frontend,
				context
			);
		} else if (runtimeConfig.inline) {
			// Inline runtime definition
			return this.createInlineRuntime(runtimeConfig.inline, context);
		} else {
			// Default runtime
			return this.createDefaultRuntime(context);
		}
	}

	/**
	 * Loads a plugin's frontend runtime from an external JavaScript module URL.
	 * @private
	 * @param {string} runtimeUrl - The URL of the JavaScript module.
	 * @param {object} context - The plugin's execution context.
	 * @returns {Promise<object>} The initialized module.
	 */
	async loadFrontendRuntime(runtimeUrl, context) {
		try {
			// Dynamic import of the plugin module
			const module = await import(runtimeUrl);

			// Initialize plugin with context
			if (
				module.default &&
				typeof module.default.initialize === "function"
			) {
				await module.default.initialize(context);
				return module.default;
			} else if (typeof module.initialize === "function") {
				await module.initialize(context);
				return module;
			} else {
				throw new Error(
					"Plugin runtime must export initialize function"
				);
			}
		} catch (error) {
			console.error(
				`Failed to load plugin runtime from ${runtimeUrl}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * Creates a runtime environment from an inline definition within the manifest.
	 * @private
	 * @param {object} inlineDefinition - The inline runtime definition.
	 * @param {object} context - The plugin's execution context.
	 * @returns {object} The created inline runtime.
	 */
	createInlineRuntime(inlineDefinition, context) {
		const runtime = {
			initialize: async () => {
				// Register components defined in manifest
				if (inlineDefinition.components) {
					for (const [id, componentDef] of Object.entries(
						inlineDefinition.components
					)) {
						context.registerComponent(id, componentDef);
					}
				}

				// Register actions
				if (inlineDefinition.actions) {
					for (const [id, actionDef] of Object.entries(
						inlineDefinition.actions
					)) {
						context.registerAction(id, actionDef);
					}
				}

				// Register widgets
				if (inlineDefinition.widgets) {
					for (const [id, widgetDef] of Object.entries(
						inlineDefinition.widgets
					)) {
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
			},
		};

		return runtime;
	}

	/**
	 * Creates a default, no-op runtime for plugins that don't specify one.
	 * @private
	 * @param {object} context - The plugin's execution context.
	 * @returns {object} The default runtime object.
	 */
	createDefaultRuntime(context) {
		return {
			initialize: async () => {
				context.log("info", "Plugin initialized with default runtime");
			},

			render: (componentId, renderContext) => {
				const div = document.createElement("div");
				div.textContent = `Plugin component: ${componentId}`;
				return div;
			},

			executeAction: (actionId, actionContext) => {
				context.log(
					"info",
					`Executing action: ${actionId}`,
					actionContext
				);
			},
		};
	}

	/**
	 * Registers all components (widgets, actions, etc.) defined in a plugin's manifest.
	 * @private
	 * @param {object} manifest - The plugin's manifest.
	 * @param {object} runtime - The plugin's runtime environment.
	 * @param {object} context - The plugin's execution context.
	 * @returns {Promise<void>}
	 */
	async registerPluginComponents(manifest, runtime, context) {
		const components = manifest.components;

		// Register widgets
		if (components.widgets) {
			for (const widgetDef of components.widgets) {
				context.registerWidget(widgetDef.id, {
					...widgetDef,
					pluginId: manifest.id,
					render: (renderContext) =>
						runtime.render(widgetDef.id, renderContext),
				});
			}
		}

		// Register actions
		if (components.actions) {
			for (const actionDef of components.actions) {
				context.registerAction(actionDef.id, {
					...actionDef,
					pluginId: manifest.id,
					execute: (actionContext) =>
						runtime.executeAction(actionDef.id, actionContext),
				});
			}
		}

		// Register field renderers
		if (components.field_renderers) {
			for (const rendererDef of components.field_renderers) {
				context.registerFieldRenderer(rendererDef.field, {
					...rendererDef,
					pluginId: manifest.id,
					render: (renderContext) =>
						runtime.renderField(rendererDef.field, renderContext),
				});
			}
		}

		// Register command handlers
		if (components.command_handlers) {
			for (const handlerDef of components.command_handlers) {
				context.registerCommandHandler(handlerDef.command, {
					...handlerDef,
					pluginId: manifest.id,
					handle: (command) =>
						runtime.handleCommand(handlerDef.command, command),
				});
			}
		}
	}

	/**
	 * Registers a generic component.
	 * @private
	 * @param {string} pluginId - The ID of the owning plugin.
	 * @param {string} componentId - The ID of the component.
	 * @param {object} definition - The component's definition.
	 */
	registerComponent(pluginId, componentId, definition) {
		const fullId = `${pluginId}.${componentId}`;
		this.componentRegistry.set(fullId, {
			...definition,
			pluginId,
			componentId,
		});
		this.metrics.registeredComponents++;
	}

	/**
	 * Registers an action.
	 * @private
	 * @param {string} pluginId - The ID of the owning plugin.
	 * @param {string} actionId - The ID of the action.
	 * @param {object} definition - The action's definition.
	 */
	registerAction(pluginId, actionId, definition) {
		const fullId = `${pluginId}.${actionId}`;
		this.actionRegistry.set(fullId, { ...definition, pluginId, actionId });
		this.metrics.registeredActions++;
	}

	/**
	 * Registers a widget.
	 * @private
	 * @param {string} pluginId - The ID of the owning plugin.
	 * @param {string} widgetId - The ID of the widget.
	 * @param {object} definition - The widget's definition.
	 */
	registerWidget(pluginId, widgetId, definition) {
		const fullId = `${pluginId}.${widgetId}`;
		this.widgetRegistry.set(fullId, { ...definition, pluginId, widgetId });
	}

	/**
	 * Registers a field renderer.
	 * @private
	 * @param {string} pluginId - The ID of the owning plugin.
	 * @param {string} field - The field the renderer applies to.
	 * @param {object} definition - The renderer's definition.
	 */
	registerFieldRenderer(pluginId, field, definition) {
		const key = `${pluginId}.${field}`;
		this.fieldRendererRegistry.set(key, { ...definition, pluginId, field });
	}

	/**
	 * Registers a command handler.
	 * @private
	 * @param {string} pluginId - The ID of the owning plugin.
	 * @param {string} command - The command to handle.
	 * @param {object} definition - The handler's definition.
	 */
	registerCommandHandler(pluginId, command, definition) {
		const key = `${pluginId}.${command}`;
		this.commandHandlerRegistry.set(key, {
			...definition,
			pluginId,
			command,
		});
	}

	/**
	 * Retrieves all registered widgets that support a given entity type.
	 * @param {string} entityType - The type of the entity.
	 * @returns {object[]} A list of matching widget definitions.
	 */
	getWidgetsForEntityType(entityType) {
		const widgets = [];

		for (const [id, widget] of this.widgetRegistry) {
			if (
				widget.entity_types &&
				widget.entity_types.includes(entityType)
			) {
				widgets.push({ id, ...widget });
			}
		}

		return widgets;
	}

	/**
	 * Retrieves all registered actions that apply to a given entity type.
	 * @param {string} entityType - The type of the entity.
	 * @returns {object[]} A list of matching action definitions.
	 */
	getActionsForEntityType(entityType) {
		const actions = [];

		for (const [id, action] of this.actionRegistry) {
			if (
				action.entity_types &&
				action.entity_types.includes(entityType)
			) {
				actions.push({ id, ...action });
			}
		}

		return actions;
	}

	/**
	 * Renders a widget component based on its configuration.
	 * @param {object} widgetConfig - The configuration for the widget to render.
	 * @param {string} widgetConfig.component - The ID of the widget.
	 * @returns {Promise<HTMLElement>} A promise that resolves with the rendered HTML element.
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
				pluginContext: this.getPluginContext(widget.pluginId),
			};

			return await widget.render(renderContext);
		} catch (error) {
			console.error(`Error rendering widget ${widgetId}:`, error);
			return this.renderErrorWidget(widgetId, error);
		}
	}

	/**
	 * Executes a registered action.
	 * @param {string} actionId - The ID of the action to execute.
	 * @param {object} context - The context for the action execution.
	 * @returns {Promise<any>} A promise that resolves with the result of the action.
	 */
	async executeAction(actionId, context) {
		const action = this.actionRegistry.get(actionId);

		if (!action) {
			throw new Error(`Action not found: ${actionId}`);
		}

		try {
			const actionContext = {
				...context,
				pluginContext: this.getPluginContext(action.pluginId),
			};

			return await action.execute(actionContext);
		} catch (error) {
			console.error(`Error executing action ${actionId}:`, error);
			throw error;
		}
	}

	/**
	 * Loads all plugins that are marked as enabled and autoload.
	 * @private
	 * @returns {Promise<void>}
	 */
	async loadEnabledPlugins() {
		const enabledManifests = Array.from(
			this.pluginManifests.values()
		).filter((manifest) => manifest.enabled && manifest.autoload);

		// Sort by priority and dependencies
		const sortedManifests =
			this.sortManifestsByDependencies(enabledManifests);

		for (const manifest of sortedManifests) {
			try {
				await this.loadPlugin(manifest.id);
			} catch (error) {
				console.error(
					`Failed to load enabled plugin ${manifest.id}:`,
					error
				);
			}
		}
	}

	/**
	 * Performs a topological sort on a list of manifests to respect their dependencies.
	 * @private
	 * @param {object[]} manifests - The array of manifests to sort.
	 * @returns {object[]} The sorted array of manifests.
	 * @throws {Error} If a circular dependency is detected.
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
	 * Updates the internal dependency graph with a plugin's dependencies.
	 * @private
	 * @param {object} manifest - The plugin's manifest.
	 */
	updateDependencyGraph(manifest) {
		const dependencies = manifest.dependencies.plugins || [];
		this.dependencyGraph.set(manifest.id, dependencies);
	}

	/**
	 * Unloads a plugin, removes its components, and runs cleanup hooks.
	 * @param {string} pluginId - The ID of the plugin to unload.
	 * @returns {Promise<boolean>} A promise that resolves to `true` if unloading was successful.
	 * @throws {Error} If an error occurs during cleanup.
	 */
	async unloadPlugin(pluginId) {
		const plugin = this.loadedPlugins.get(pluginId);
		if (!plugin) {
			return false;
		}

		try {
			// Run before unload hooks
			this.runHooks("beforeUnload", { plugin });

			// Remove all components registered by this plugin
			this.removePluginComponents(pluginId);

			// Call plugin cleanup if available
			if (plugin.runtime.cleanup) {
				await plugin.runtime.cleanup();
			}

			// Remove from loaded plugins
			this.loadedPlugins.delete(pluginId);

			// Run after unload hooks
			this.runHooks("afterUnload", { pluginId });

			// Emit plugin unloaded event
			this.stateManager.emit?.("pluginUnloaded", { pluginId });

			return true;
		} catch (error) {
			console.error(`Error unloading plugin ${pluginId}:`, error);
			throw error;
		}
	}

	/**
	 * Removes all components registered by a specific plugin from all registries.
	 * @private
	 * @param {string} pluginId - The ID of the plugin whose components should be removed.
	 */
	removePluginComponents(pluginId) {
		// Remove from all registries
		for (const registry of [
			this.componentRegistry,
			this.actionRegistry,
			this.widgetRegistry,
			this.fieldRendererRegistry,
			this.commandHandlerRegistry,
		]) {
			for (const [key, value] of registry) {
				if (value.pluginId === pluginId) {
					registry.delete(key);
				}
			}
		}
	}

	/**
	 * Renders a fallback element for a missing widget.
	 * @private
	 * @param {string} widgetId - The ID of the missing widget.
	 * @returns {HTMLElement} The fallback element.
	 */
	renderMissingWidget(widgetId) {
		const div = document.createElement("div");
		div.className = "plugin-widget-missing";
		div.innerHTML = `<p>Widget not found: ${widgetId}</p>`;
		return div;
	}

	/**
	 * Renders an error element for a widget that failed to render.
	 * @private
	 * @param {string} widgetId - The ID of the widget that failed.
	 * @param {Error} error - The error that occurred.
	 * @returns {HTMLElement} The error element.
	 */
	renderErrorWidget(widgetId, error) {
		const div = document.createElement("div");
		div.className = "plugin-widget-error";
		div.innerHTML = `
      <p><strong>Widget Error: ${widgetId}</strong></p>
      <p>${error.message}</p>
    `;
		return div;
	}

	/**
	 * Retrieves the context for a given plugin.
	 * @private
	 * @param {string} pluginId - The ID of the plugin.
	 * @returns {object|undefined} The plugin's context.
	 */
	getPluginContext(pluginId) {
		const plugin = this.loadedPlugins.get(pluginId);
		return plugin?.context;
	}

	/**
	 * Allows one plugin to get the context of another, with permission checks.
	 * @private
	 * @param {string} requestingPluginId - The ID of the plugin making the request.
	 * @param {string} targetPluginId - The ID of the target plugin.
	 * @returns {object|undefined} The target plugin's context.
	 */
	getPluginForContext(requestingPluginId, targetPluginId) {
		// Check permissions, etc.
		const plugin = this.loadedPlugins.get(targetPluginId);
		return plugin?.context;
	}

	/**
	 * Sets a configuration value for a plugin.
	 * @private
	 * @param {string} pluginId - The ID of the plugin.
	 * @param {string} key - The configuration key.
	 * @param {*} value - The configuration value.
	 */
	setPluginConfig(pluginId, key, value) {
		const manifest = this.pluginManifests.get(pluginId);
		if (manifest) {
			if (!manifest.rawManifest.config) {
				manifest.rawManifest.config = {};
			}
			manifest.rawManifest.config[key] = value;
		}
	}

	/**
	 * Records the loading time for a plugin and updates the average.
	 * @private
	 * @param {number} loadTime - The loading time in milliseconds.
	 */
	recordLoadTime(loadTime) {
		this.metrics.loadingTimes.push(loadTime);
		if (this.metrics.loadingTimes.length > 100) {
			this.metrics.loadingTimes.shift();
		}
		this.metrics.averageLoadTime =
			this.metrics.loadingTimes.reduce((sum, time) => sum + time, 0) /
			this.metrics.loadingTimes.length;
	}

	/**
	 * Runs all registered callbacks for a specific lifecycle hook.
	 * @private
	 * @param {string} hookName - The name of the hook to run.
	 * @param {object} data - The data to pass to the hook callbacks.
	 */
	runHooks(hookName, data) {
		const hooks = this.hooks[hookName] || [];
		hooks.forEach((hook) => {
			try {
				hook(data);
			} catch (error) {
				console.error(`Hook error for ${hookName}:`, error);
			}
		});
	}

	/**
	 * Retrieves performance and state statistics for the plugin system.
	 * @returns {object} An object containing various metrics.
	 */
	getStatistics() {
		return {
			...this.metrics,
			loadedPlugins: this.loadedPlugins.size,
			availableManifests: this.pluginManifests.size,
			registeredWidgets: this.widgetRegistry.size,
			registeredFieldRenderers: this.fieldRendererRegistry.size,
			registeredCommandHandlers: this.commandHandlerRegistry.size,
		};
	}

	/**
	 * Exports the current state of the plugin system for debugging purposes.
	 * @returns {object} A snapshot of the system's state.
	 */
	exportState() {
		return {
			manifests: Array.from(this.pluginManifests.values()),
			loadedPlugins: Array.from(this.loadedPlugins.keys()),
			components: Array.from(this.componentRegistry.keys()),
			actions: Array.from(this.actionRegistry.keys()),
			widgets: Array.from(this.widgetRegistry.keys()),
		};
	}
}

export default ManifestPluginSystem;
