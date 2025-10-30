/**
 * @file SystemBootstrap.js
 * @description Handles the initialization sequence of the application, ensuring all core systems are loaded in the correct order.
 */

import { HybridStateManager } from "./HybridStateManager.js";
import { DateCore } from "../utils/DateUtils.js";

/**
 * @class SystemBootstrap
 * @description Orchestrates the application's startup process.
 */
export class SystemBootstrap {
	/**
	 * @param {object} config - The main application configuration.
	 */
	constructor(config) {
		this.config = config;
		this.stateManager = null;
	}

	/**
	 * The main entry point to start the application.
	 * @param {object} authContext - The user's authentication context.
	 * @returns {Promise<HybridStateManager>} The fully initialized state manager.
	 */
	async initialize(authContext) {
		console.log("[SystemBootstrap] Starting application initialization...");

		// 1. Create the state manager instance
		this.stateManager = new HybridStateManager(this.config);

		// 2. Initialize the core storage system and set the user context
		await this.stateManager.initializeStorageSystem(authContext);

		// 3. Initialize all other core subsystems (event engine, security, etc.)
		this.stateManager.bootstrapSubsystems();

		// 4. Load critical managers in dependency order
		console.log(
			"[SystemBootstrap] Loading core infrastructure managers..."
		);
		await this.stateManager.loadManager("securityManager");
		await this.stateManager.loadManager("forensicLogger");
		await this.stateManager.loadManager("idManager");
		await this.stateManager.loadManager("cacheManager");

		console.log(
			"[SystemBootstrap] Loading data and application services..."
		);
		// Conditionally load the EmbeddingManager if enabled in the config
		if (this.config.embeddingEnabled) {
			await this.stateManager.loadManager("embedding");
		}

		// Load the plugin system, which is critical for extensibility
		await this.stateManager.loadManager("plugin");

		// Load the query service, which depends on plugins and embeddings
		await this.stateManager.loadManager("queryService");

		// Load and start the metrics reporter now that all dependencies are available
		const metricsReporter = await this.stateManager.loadManager(
			"metricsReporter"
		);
		metricsReporter?.start();

		// 5. Load the database schema
		await this.stateManager.loadDatabaseSchema();

		// 6. Initialize systems that depend on the loaded schema and managers
		// This is a critical step to make plugins active.
		await this.stateManager.managers.plugin?.initialize();

		// 7. Finalize initialization and emit system ready event
		this.stateManager.initialized = true;

		console.log("[SystemBootstrap] Application initialized successfully.");
		this.stateManager.emit("systemInitialized", {
			timestamp: DateCore.now(),
		});

		return this.stateManager;
	}
}
