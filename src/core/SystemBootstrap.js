/**
 * @file SystemBootstrap.js
 * @description Handles the initialization sequence of the application, ensuring all core systems are loaded in the correct order.
 */

import { HybridStateManager } from "./HybridStateManager.js";
import { DateCore } from "../utils/DateUtils.js";

/**
 * @class SystemBootstrap
 * @privateFields {#config, #stateManager}
 * @description Orchestrates the application's startup process.
 */
export class SystemBootstrap {
	/** @private @type {object} */
	#config;
	/** @private @type {import('./HybridStateManager.js').HybridStateManager|null} */
	#stateManager = null;

	/**
	 * @param {object} config - The main application configuration.
	 */
	constructor(config) {
		this.#config = config;
	}

	/**
	 * The main entry point to start the application.
	 * @param {object} authContext - The user's authentication context.
	 * @returns {Promise<HybridStateManager>} The fully initialized state manager.
	 */
	async initialize(authContext) {
		console.log("[SystemBootstrap] Starting application initialization...");

		// 1. Create the state manager instance.
		this.#stateManager = new HybridStateManager(this.#config);

		// 2. Initialize the core storage system and set the user context.
		await this.#stateManager.initializeStorageSystem(
			authContext,
			this.#stateManager
		);

		// 3. Initialize core subsystems (event engine, security, etc.).
		await this.#stateManager.bootstrapSubsystems();

		// 4. Load critical, foundational managers.
		await this.#bootstrapCore();

		// 5. Load the database schema.
		await this.#stateManager.loadDatabaseSchema();

		// 6. Load application-level services that depend on the schema and core managers.
		await this.#loadApplicationServices();

		// 7. Finalize initialization and emit the system ready event.
		return this.#finalizeInitialization();
	}

	/**
	 * Loads and initializes the core, foundational managers in the correct dependency order.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #bootstrapCore() {
		console.log(
			"[SystemBootstrap] Loading core infrastructure managers..."
		);
		try {
			// V8.0 Parity: Mandate 1.3 - Use the ServiceRegistry to initialize all services.
			// The registry itself handles instantiation order and dependencies.
			await this.#stateManager.serviceRegistry.initializeAll();
		} catch (error) {
			console.error(
				`[SystemBootstrap] CRITICAL: A core service failed to initialize. Halting.`,
				error
			);
			throw new Error(`Core service initialization failed.`);
		}
	}

	/**
	 * Loads application-level services and lazy-loads non-critical managers.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #loadApplicationServices() {
		console.log("[SystemBootstrap] Loading application services...");

		// The ServiceRegistry has already loaded all services, including the plugin system.
		// We just need to ensure event flows are loaded after plugins have been registered.

		await this.#loadEventFlows();

		// --- Lazy-load non-critical managers in the background ---
		this.#lazyLoadManagers();
	}

	/**
	 * Finalizes the initialization process and emits the 'systemInitialized' event.
	 * @private
	 * @returns {HybridStateManager} The fully initialized state manager.
	 */
	#finalizeInitialization() {
		this.#stateManager.initialized = true;

		console.log("[SystemBootstrap] Application initialized successfully.");
		this.#stateManager.emit("systemInitialized", {
			timestamp: DateCore.now(),
		});

		return this.#stateManager;
	}

	/**
	 * Initializes the metrics and performance monitoring pipeline.
	 * This is done asynchronously to avoid blocking the main application startup.
	 * It ensures that `RenderMetrics` is loaded and started before `MetricsReporter`.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #initializeMetricsPipeline() {
		console.log("[SystemBootstrap] Initializing metrics pipeline...");

		try {
			// The metrics reporter is the primary service to load.
			const metricsReporter =
				await this.#stateManager.serviceRegistry.get("metricsReporter");
			await metricsReporter?.start();
			console.log("[SystemBootstrap] Metrics pipeline started.");
		} catch (err) {
			console.error(
				"[SystemBootstrap] Failed to initialize metrics pipeline:",
				err
			);
		}
	}

	/**
	 * Kicks off the loading of non-critical managers in the background.
	 * @private
	 */
	#lazyLoadManagers() {
		// Conditionally load the EmbeddingManager if enabled, without awaiting.
		if (this.#config.embeddingEnabled) {
			// The service registry has already loaded it if it was in the list.
		}

		// Load and start the full metrics pipeline in the background.
		this.#initializeMetricsPipeline();
	}

	/**
	 * Loads event flow definitions from storage and registers them with the engine.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #loadEventFlows() {
		const eventFlowEngine = this.#stateManager.managers.eventFlowEngine; // Already initialized by ServiceRegistry
		if (!eventFlowEngine || !this.#stateManager.storage.ready) return;

		try {
			const flows = await this.#stateManager.storage.instance.query(
				"objects",
				"entity_type",
				"event_flow"
			);
			for (const entity of flows || []) {
				eventFlowEngine.registerFlow(
					entity.data || entity.content || entity
				);
			}
			console.log(
				`[SystemBootstrap] Loaded ${flows?.length || 0} event flows from storage.`
			);
		} catch (err) {
			console.error("[SystemBootstrap] Failed to load event flows:", err);
		}
	}
}
