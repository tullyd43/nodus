/**
 * @file SystemBootstrap.js
 * @description Handles the initialization sequence of the application, ensuring all core systems are loaded in the correct order.
 */

import { HybridStateManager } from "@core/HybridStateManager.js";

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

		// 5. Load critical managers
		await this.stateManager.loadManager("securityManager");
		await this.stateManager.loadManager("forensicLogger");

		// Conditionally load the EmbeddingManager if enabled in the config
		if (this.config.embeddingEnabled) {
			await this.stateManager.loadManager("embedding");
		}

		// 6. Load the database schema
		await this.stateManager.loadDatabaseSchema();

		// 7. Finalize initialization
		this.stateManager.initialized = true;

		console.log("[SystemBootstrap] Application initialized successfully.");
		this.stateManager.emit("systemInitialized", {
			timestamp: new Date().toISOString(),
		});

		return this.stateManager;
	}
}
