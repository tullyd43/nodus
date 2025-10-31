import { SystemBootstrap } from "@core/SystemBootstrap.js";
import { DeveloperDashboard } from "/dev/DeveloperDashboard.js";

import { AppConfig } from "../environment.config.js";

/**
 * @file d:\Development Files\repositories\nodus\src\main.js
 * @description This is the entry point for the Nodus application.
 * It initializes the HybridStateManager, sets up the main UI grid,
 * and starts the application's core functionalities.
 */

/**
 * @function bootstrap
 * @description Asynchronously initializes the Nodus application.
 * It sets up the global `HybridStateManager` instance and renders the main `GridBootstrap` component.
 * @returns {Promise<void>} A promise that resolves when the application has been successfully bootstrapped.
 */
const bootstrap = async () => {
	if (window.nodusApp) {
		console.warn(
			"[Nodus] Application already initialized. Skipping bootstrap."
		);
		return;
	}

	console.log("🚀 Nodus Grid Data Layer Test Starting...");

	// 1. Use the new SystemBootstrap to initialize the application
	const bootstrapApp = new SystemBootstrap({
		...AppConfig, // Use the centralized configuration
	});

	// 2. Initialize with a default user context for demo mode
	const stateManager = await bootstrapApp.initialize({
		userId: "demo-user",
		clearanceLevel: "internal",
	});

	window.nodusApp = stateManager;

	// 3. V8.0 Parity: Create a simple appViewModel that holds the stateManager as the source of truth.
	// The UI layer can now access all managers and state directly from the stateManager instance.
	const appViewModel = {
		hybridStateManager: stateManager,
		// The context object is no longer needed, as the UI can access managers
		// directly via `appViewModel.hybridStateManager.managers`.
	};
	window.appViewModel = appViewModel;

	// 4. V8.0 Parity: Initialize the fully integrated grid system via the state manager.
	// The service is already instantiated by the ServiceRegistry. We just need to initialize it.
	const gridSystem = stateManager.managers.completeGridSystem;
	// The appViewModel and gridContainer are now passed during the service's own initialization.
	await gridSystem.initialize();

	console.log("✅ Complete Grid System Initialized. Application is ready.");

	// 5. V8.0 Parity: Initialize the developer dashboard for real-time metrics.
	// Pass the stateManager directly, which provides access to all necessary managers and the event bus.
	new DeveloperDashboard(document.body, {
		stateManager,
	});
};

bootstrap();
