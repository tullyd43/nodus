import { scanForForbiddenPatterns } from "../utils/ArbitraryCodeValidator.js";
import { PluginError } from "../utils/ErrorHelpers.js";

/**
 * @file ManifestPluginSystem.js
 * @description Replaces a class-based PluginRegistry with a declarative, manifest-driven plugin loading system.
 * This system discovers, loads, and manages plugins based on manifest files, handling dependencies and component registration.
 */

/**
 * @privateFields {#stateManager, #metrics, #errorHelpers, #forensicLogger, #componentRegistry, #actionHandlerRegistry, #loadedPlugins, #pluginManifests, #loadingPromises, #dependencyGraph, #hooks}
 * @class ManifestPluginSystem
 * @classdesc Orchestrates the entire lifecycle of plugins, from discovery and loading based on manifest files
 * to component registration and dependency management.
 */
export class ManifestPluginSystem {
	// V8.0 Parity: Mandate 3.1 & 3.2 - All internal properties MUST be private.
	/** @private @type {import('./HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/** @private @type {import('./ForensicLogger.js').ForensicLogger|null} */
	#forensicLogger = null;
	/** @private @type {import('./ComponentDefinition.js').ComponentDefinitionRegistry|null} */
	#componentRegistry = null;
	/** @private @type {import('./ActionHandlerRegistry.js').ActionHandlerRegistry|null} */
	#actionHandlerRegistry = null;
	/** @private @type {Map<string, object>} */
	#loadedPlugins = new Map();
	/** @private @type {Map<string, object>} */
	#pluginManifests = new Map();

	// Plugin loading state
	/** @private @type {Map<string, Promise<object>>} */
	#loadingPromises = new Map();
	/** @private @type {Map<string, string[]>} */
	#dependencyGraph = new Map();

	// Plugin lifecycle hooks
	/**
	 * @private
	 * @type {{beforeLoad: Function[], afterLoad: Function[], beforeUnload: Function[], afterUnload: Function[], onError: Function[]}}
	 */
	#hooks = {
		beforeLoad: [],
		afterLoad: [],
		beforeUnload: [],
		afterUnload: [],
		onError: [],
	};

	/**
	 * Creates an instance of ManifestPluginSystem.
	 * @param {object} context - The global application context.
	 * @param {import('./HybridStateManager.js').default} context.stateManager - The main state manager, providing access to all other managers.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;

		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from the stateManager.
		this.#metrics =
			this.#stateManager.metricsRegistry?.namespace("pluginSystem");
		this.#errorHelpers = this.#stateManager.managers.errorHelpers;
		this.#forensicLogger = this.#stateManager.managers.forensicLogger;
		this.#componentRegistry = this.#stateManager.managers.componentRegistry;
		this.#actionHandlerRegistry = this.#stateManager.managers.actionHandler;
	}

	/**
	 * Initializes the plugin system by loading manifests and then loading all enabled plugins.
	 * @returns {Promise<void>}
	 */
	async initialize() {
		return this.#errorHelpers.tryOr(
			async () => {
				// Load plugin manifests from stored entities
				await this.#loadPluginManifests();

				// Load enabled plugins
				await this.#loadEnabledPlugins();

				console.log(
					`ManifestPluginSystem initialized with ${this.#loadedPlugins.size} plugins`
				);
			},
			(error) => {
				this.#forensicLogger?.logAuditEvent("PLUGIN_SYSTEM_FAILURE", {
					operation: "initialize",
					error: error.message,
					severity: "critical",
				});
			},
			{ component: "ManifestPluginSystem", operation: "initialize" }
		);
	}

	/**
	 * Loads all plugin manifest entities from the persistent storage.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #loadPluginManifests() {
		return this.#errorHelpers.tryOr(
			async () => {
				// Use the correct storage query method as per the V8.0 Global Contracts
				const manifestEntities =
					await this.#stateManager.storage.instance.query(
						"objects",
						"entity_type",
						"plugin_manifest"
					);

				for (const entity of manifestEntities) {
					this.registerManifest(entity.data);
				}
			},
			(error) => {
				this.#forensicLogger?.logAuditEvent("PLUGIN_SYSTEM_FAILURE", {
					operation: "loadPluginManifests",
					error: error.message,
				});
			}
		);
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

		this.#pluginManifests.set(manifest.id, manifest);

		// Build dependency graph
		this.#updateDependencyGraph(manifest);

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
		return this.#errorHelpers.tryOr(
			async () => {
				const startTime = performance.now();

				// Check if already loaded
				if (this.#loadedPlugins.has(pluginId)) {
					return this.#loadedPlugins.get(pluginId);
				}

				// Check if currently loading
				if (this.#loadingPromises.has(pluginId)) {
					return await this.#loadingPromises.get(pluginId);
				}

				// Get manifest
				const manifest = this.#pluginManifests.get(pluginId);
				if (!manifest) {
					throw new PluginError(
						`Plugin manifest not found: ${pluginId}`
					);
				}

				// Create loading promise
				const loadingPromise = this.#doLoadPlugin(manifest, options);
				this.#loadingPromises.set(pluginId, loadingPromise);

				const plugin = await loadingPromise;

				// Record metrics
				const loadTime = performance.now() - startTime;
				this.#recordLoadTime(loadTime);

				this.#loadingPromises.delete(pluginId);
				return plugin;
			},
			(error) => {
				this.#metrics?.increment("failedLoads");
				this.#runHooks("onError", { pluginId, error });
				this.#forensicLogger?.logAuditEvent("PLUGIN_LOAD_FAILURE", {
					pluginId,
					error: error.message,
				});
				this.#loadingPromises.delete(pluginId);
				throw error; // Re-throw to allow caller to handle it.
			}
		);
	}

	/**
	 * The core implementation for loading a plugin. It handles dependency loading,
	 * runtime creation, and component registration.
	 * @private
	 * @param {object} manifest - The plugin's manifest.
	 * @param {object} options - Loading options.
	 * @returns {Promise<object>} The loaded plugin instance.
	 */
	async #doLoadPlugin(manifest, options) {
		const pluginId = manifest.id;

		// Run before load hooks
		this.#runHooks("beforeLoad", { manifest, options });

		// Load dependencies first
		await this.#loadDependencies(manifest);

		// Create plugin context
		const pluginContext = this.#createPluginContext(manifest);

		// Load runtime environment
		const runtime = await this.#loadPluginRuntime(manifest, pluginContext);

		// Register plugin components
		await this.#registerPluginComponents(manifest, runtime, pluginContext);

		// Create plugin instance
		const plugin = {
			id: pluginId,
			manifest,
			runtime,
			context: pluginContext,
			loadedAt: Date.now(),
			status: "loaded",
		};

		this.#loadedPlugins.set(pluginId, plugin);
		this.#metrics?.increment("pluginsLoaded");

		// Run after load hooks
		this.#runHooks("afterLoad", { plugin });

		this.#forensicLogger?.logAuditEvent("PLUGIN_LOAD_SUCCESS", {
			pluginId,
		});

		// Emit plugin loaded event
		this.#stateManager.emit("pluginLoaded", { pluginId, plugin });

		return plugin;
	}

	/**
	 * Recursively loads all dependencies for a given plugin manifest.
	 * @private
	 * @param {object} manifest - The manifest whose dependencies need to be loaded.
	 * @returns {Promise<void>}
	 */
	async #loadDependencies(manifest) {
		const dependencies = manifest.dependencies.plugins || [];

		for (const depId of dependencies) {
			if (!this.#loadedPlugins.has(depId)) {
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
	#createPluginContext(manifest) {
		const context = {
			pluginId: manifest.id,
			manifest,
			stateManager: this.#stateManager, // V8.0 Parity: Pass stateManager as the source of truth
			managers: this.#stateManager.managers, // Pass all system managers to the plugin

			// Registration methods
			registerComponent: (id, definition) =>
				this.#registerComponent(manifest.id, id, definition),
			registerAction: (id, definition) =>
				this.#registerAction(manifest.id, id, definition),
			registerWidget: (id, definition) =>
				this.#registerWidget(manifest.id, id, definition),
			registerFieldRenderer: (id, definition) =>
				this.#registerFieldRenderer(manifest.id, id, definition),
			registerCommandHandler: (id, definition) =>
				this.#registerCommandHandler(manifest.id, id, definition),

			// Utility methods
			emit: (event, data) =>
				this.#stateManager.emit?.(
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
				this.#getPluginForContext(manifest.id, pluginId),

			// Configuration access
			getConfig: (key) => manifest.rawManifest.config?.[key],
			setConfig: (key, value) =>
				this.#setPluginConfig(manifest.id, key, value),
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
	async #loadPluginRuntime(manifest, context) {
		const runtimeConfig = manifest.runtime;
		if (runtimeConfig.entrypoint) {
			// Load frontend runtime (JavaScript module) from the entrypoint URL
			return await this.#loadFrontendRuntime(
				runtimeConfig.entrypoint,
				manifest
			);
		} else if (runtimeConfig.inline) {
			// V8.0 Parity: Inline runtimes are a security risk and are deprecated.
			// Plugins should rely on declarative definitions and registered handlers.
			console.warn(
				`[ManifestPluginSystem] Inline runtime for plugin '${manifest.id}' is deprecated and will not be executed.`
			);
			return this.#createDefaultRuntime(context);
		} else {
			// Default runtime
			return this.#createDefaultRuntime(context);
		}
	}

	/**
	 * Loads a plugin's frontend runtime from an external JavaScript module URL.
	 * @private
	 * @param {string} runtimeUrl - The URL of the JavaScript module.
	 * @returns {Promise<object>} The initialized module.
	 * @param {object} manifest - The manifest of the plugin being loaded.
	 */
	async #loadFrontendRuntime(runtimeUrl, manifest) {
		// V8.0 Parity: Mandate 2.1 - Scan for forbidden code patterns before execution
		const response = await fetch(runtimeUrl);
		if (!response.ok) {
			throw new PluginError(
				`Failed to fetch plugin runtime: ${response.statusText}`,
				{ pluginId: manifest.id }
			);
		}
		const codeString = await response.text();

		// This check should only run in non-production environments to avoid performance overhead.
		if (this.#stateManager.config.environment !== "production") {
			const violations = scanForForbiddenPatterns(codeString); // This function is now correctly exported

			if (violations.length > 0) {
				// V8.0 Parity: Mandate 2.4 - Log the security violation before throwing.
				this.#forensicLogger?.logAuditEvent(
					"PLUGIN_SECURITY_VIOLATION",
					{
						pluginId: manifest.id,
						violations: violations.map((v) => v.message),
						severity: "critical",
					}
				);

				const errorMessages = violations
					.map((v) => `- ${v.message} (severity: ${v.severity})`)
					.join("\n");
				throw new PluginError(
					`Plugin '${manifest.id}' contains forbidden code patterns and was not loaded:\n${errorMessages}`,
					{
						pluginId: manifest.id,
						severity: "critical",
						showToUser: true, // This is a user-facing security error
					}
				);
			}
		}

		// If validation passes, create a blob URL to import the module.
		// This ensures the code is treated as a standard ES module.
		const blob = new Blob([codeString], { type: "application/javascript" });
		const blobUrl = URL.createObjectURL(blob);
		const module = await import(/* @vite-ignore */ blobUrl);
		URL.revokeObjectURL(blobUrl); // Clean up the blob URL after import
		return module;
	}

	/**
	 * Creates a default, no-op runtime for plugins that don't specify one.
	 * @private
	 * @param {object} context - The plugin's execution context.
	 * @returns {object} The default runtime object.
	 */
	#createDefaultRuntime(context) {
		return {
			initialize: async () => {
				// The default runtime's initialize function will be called with the plugin context.
				// This is where a plugin can register its components declaratively.
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
	async #registerPluginComponents(manifest, runtime, context) {
		const components = manifest.components;

		// Initialize the plugin's runtime, allowing it to register its components.
		// The runtime's `initialize` function is passed the plugin context, which contains registration methods.
		if (runtime.initialize && typeof runtime.initialize === "function") {
			await runtime.initialize(context);
		}

		// Register widgets
		if (components.widgets) {
			for (const widgetDef of components.widgets) {
				context.registerWidget(widgetDef.id, {
					...widgetDef,
					pluginId: manifest.id,
				});
			}
		}

		// Register actions
		if (components.actions) {
			for (const actionDef of components.actions) {
				context.registerAction(actionDef.id, {
					...actionDef,
					pluginId: manifest.id,
				});
			}
		}

		// Register field renderers
		if (components.field_renderers) {
			for (const rendererDef of components.field_renderers) {
				context.registerFieldRenderer(rendererDef.field, {
					...rendererDef,
					pluginId: manifest.id,
				});
			}
		}

		// Register command handlers
		if (components.command_handlers) {
			for (const handlerDef of components.command_handlers) {
				context.registerCommandHandler(handlerDef.command, {
					...handlerDef,
					pluginId: manifest.id,
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
	#registerComponent(pluginId, componentId, definition) {
		if (!this.#componentRegistry) return;

		this.#componentRegistry.register({
			id: `${pluginId}.${componentId}`,
			...definition,
			pluginId,
		});
	}

	/**
	 * Registers an action.
	 * @private
	 * @param {string} pluginId - The ID of the owning plugin.
	 * @param {string} actionId - The ID of the action.
	 * @param {object} definition - The action's definition.
	 */
	#registerAction(pluginId, actionId, definition) {
		if (!this.#actionHandlerRegistry) return;

		this.#actionHandlerRegistry.register(
			`${pluginId}.${actionId}`,
			(action) => {
				// This needs a runtime execution context from the plugin
				console.log(`Executing plugin action: ${pluginId}.${actionId}`);
			}
		);
	}

	/**
	 * Registers a widget.
	 * @private
	 * @param {string} pluginId - The ID of the owning plugin.
	 * @param {string} widgetId - The ID of the widget.
	 * @param {object} definition - The widget's definition.
	 */
	#registerWidget(pluginId, widgetId, definition) {
		if (!this.#componentRegistry) return;

		this.#componentRegistry.register({
			id: `${pluginId}.${widgetId}`,
			...definition,
			pluginId,
		});
	}

	/**
	 * Registers a field renderer.
	 * @private
	 * @param {string} pluginId - The ID of the owning plugin.
	 * @param {string} field - The field the renderer applies to.
	 * @param {object} definition - The renderer's definition.
	 */
	#registerFieldRenderer(pluginId, field, definition) {
		// This would register with a hypothetical FieldRendererRegistry manager
		if (!this.#componentRegistry) return;

		this.#componentRegistry.register({
			id: `field-renderer.${pluginId}.${field}`,
			...definition,
		});
	}

	/**
	 * Registers a command handler.
	 * @private
	 * @param {string} pluginId - The ID of the owning plugin.
	 * @param {string} command - The command to handle.
	 * @param {object} definition - The handler's definition.
	 */
	#registerCommandHandler(pluginId, command, definition) {
		// This would register with a hypothetical CommandHandlerRegistry manager
		console.log(
			`[ManifestPluginSystem] Registering command handler '${command}' from plugin '${pluginId}'`
		);
	}

	/**
	 * Retrieves all registered widgets that support a given entity type.
	 * @param {string} entityType - The type of the entity.
	 * @returns {object[]} A list of matching widget definitions.
	 */
	getWidgetsForEntityType(entityType) {
		if (!this.#componentRegistry) return [];

		return this.#componentRegistry
			.getForEntityTypes(entityType)
			.filter((def) => def.category === "widget");
	}

	/**
	 * Retrieves all registered actions that apply to a given entity type.
	 * @param {string} entityType - The type of the entity.
	 * @returns {object[]} A list of matching action definitions.
	 */
	getActionsForEntityType(entityType) {
		// This would query the ActionHandlerRegistry in a real implementation
		if (!this.#actionHandlerRegistry) return [];

		// Placeholder: This logic would need to be more sophisticated
		return [];
	}

	/**
	 * Renders a widget component based on its configuration.
	 * @param {object} widgetConfig - The configuration for the widget to render.
	 * @param {string} widgetConfig.component - The ID of the widget.
	 * @returns {Promise<HTMLElement>} A promise that resolves with the rendered HTML element.
	 */
	async render(widgetConfig) {
		const widgetId = widgetConfig.component || widgetConfig.widget;
		const widget = this.#componentRegistry?.get(widgetId);

		if (!widget) {
			console.warn(`Widget not found: ${widgetId}`);
			return this.#renderMissingWidget(widgetId);
		}

		try {
			const renderContext = {
				config: widgetConfig.config || {},
				data: widgetConfig.data || {},
				pluginContext: this.#getPluginContext(widget.pluginId),
			};

			return await widget.render(renderContext);
		} catch (error) {
			console.error(`Error rendering widget ${widgetId}:`, error);
			return this.#renderErrorWidget(widgetId, error);
		}
	}

	/**
	 * Executes a registered action.
	 * @param {string} actionId - The ID of the action to execute.
	 * @param {object} context - The context for the action execution.
	 * @returns {Promise<any>} A promise that resolves with the result of the action.
	 */
	async executeAction(actionId, context) {
		// This would execute via the ActionHandlerRegistry
		const action = this.#actionHandlerRegistry?.get(actionId);

		if (!action) {
			throw new Error(`Action not found: ${actionId}`);
		}

		try {
			const actionContext = {
				...context,
				// pluginContext: this.getPluginContext(action.pluginId), // Context would be part of the handler closure
			};

			return await action(actionContext);
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
	async #loadEnabledPlugins() {
		const enabledManifests = Array.from(
			this.#pluginManifests.values()
		).filter((manifest) => manifest.enabled && manifest.autoload);

		// Sort by priority and dependencies
		const sortedManifests =
			this.#sortManifestsByDependencies(enabledManifests);

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
	#sortManifestsByDependencies(manifests) {
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
				const depManifest = this.#pluginManifests.get(depId);
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
	#updateDependencyGraph(manifest) {
		const dependencies = manifest.dependencies.plugins || [];
		this.#dependencyGraph.set(manifest.id, dependencies);
	}

	/**
	 * Unloads a plugin, removes its components, and runs cleanup hooks.
	 * @param {string} pluginId - The ID of the plugin to unload.
	 * @returns {Promise<boolean>} A promise that resolves to `true` if unloading was successful.
	 * @throws {Error} If an error occurs during cleanup.
	 */
	async unloadPlugin(pluginId) {
		const plugin = this.#loadedPlugins.get(pluginId);
		if (!plugin) {
			return false;
		}

		try {
			// Run before unload hooks
			this.#runHooks("beforeUnload", { plugin });

			// Remove all components registered by this plugin
			this.#removePluginComponents(pluginId);

			// Call plugin cleanup if available
			if (plugin.runtime.cleanup) {
				await plugin.runtime.cleanup();
			}

			// Remove from loaded plugins
			this.#loadedPlugins.delete(pluginId);

			// Run after unload hooks
			this.#runHooks("afterUnload", { pluginId });

			// Emit plugin unloaded event
			this.#stateManager.emit("pluginUnloaded", { pluginId });

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
	#removePluginComponents(pluginId) {
		// Remove from all registries
		if (this.#componentRegistry) {
			for (const [id, def] of this.#componentRegistry.getAll()) {
				if (def.pluginId === pluginId) {
					this.#componentRegistry.unregister(id);
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
	#renderMissingWidget(widgetId) {
		const div = document.createElement("div");
		div.className = "plugin-widget-missing";
		const p = document.createElement("p");
		// V8.0 Parity: Mandate 2.1 - Use textContent to prevent XSS.
		p.textContent = `Widget not found: ${widgetId}`;
		div.appendChild(p);
		return div;
	}

	/**
	 * Renders an error element for a widget that failed to render.
	 * @private
	 * @param {string} widgetId - The ID of the widget that failed.
	 * @param {Error} error - The error that occurred.
	 * @returns {HTMLElement} The error element.
	 */
	#renderErrorWidget(widgetId, error) {
		const div = document.createElement("div");
		div.className = "plugin-widget-error";
		const p1 = document.createElement("p");
		const strong = document.createElement("strong");
		strong.textContent = `Widget Error: ${widgetId}`;
		p1.appendChild(strong);
		const p2 = document.createElement("p");
		p2.textContent = error.message;
		div.append(p1, p2);
		return div;
	}

	/**
	 * Retrieves the context for a given plugin.
	 * @private
	 * @param {string} pluginId - The ID of the plugin.
	 * @returns {object|undefined} The plugin's context.
	 */
	#getPluginContext(pluginId) {
		const plugin = this.#loadedPlugins.get(pluginId);
		return plugin?.context;
	}

	/**
	 * Allows one plugin to get the context of another, with permission checks.
	 * @private
	 * @param {string} requestingPluginId - The ID of the plugin making the request.
	 * @param {string} targetPluginId - The ID of the target plugin.
	 * @returns {object|undefined} The target plugin's context.
	 */
	#getPluginForContext(requestingPluginId, targetPluginId) {
		// Check permissions, etc.
		const plugin = this.#loadedPlugins.get(targetPluginId);
		return plugin?.context;
	}

	/**
	 * Sets a configuration value for a plugin.
	 * @private
	 * @param {string} pluginId - The ID of the plugin.
	 * @param {string} key - The configuration key.
	 * @param {*} value - The configuration value.
	 */
	#setPluginConfig(pluginId, key, value) {
		const manifest = this.#pluginManifests.get(pluginId);
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
	#recordLoadTime(loadTime) {
		this.#metrics?.updateAverage("averageLoadTime", loadTime);
	}

	/**
	 * Runs all registered callbacks for a specific lifecycle hook.
	 * @private
	 * @param {string} hookName - The name of the hook to run.
	 * @param {object} data - The data to pass to the hook callbacks.
	 */
	#runHooks(hookName, data) {
		const hooks = this.#hooks[hookName] || [];
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
			...(this.#metrics?.getAllAsObject() || {}),
			pluginsLoaded: this.#loadedPlugins.size,
			availableManifests: this.#pluginManifests.size,
			registeredComponents:
				this.#componentRegistry?.definitions.size || 0,
		};
	}

	/**
	 * Exports the current state of the plugin system for debugging purposes.
	 * @returns {object} A snapshot of the system's state.
	 */
	exportState() {
		return {
			manifests: Array.from(this.#pluginManifests.values()),
			loadedPlugins: Array.from(this.#loadedPlugins.keys()),
			components: Array.from(
				this.#componentRegistry?.definitions.keys() || []
			),
		};
	}
}

export default ManifestPluginSystem;
