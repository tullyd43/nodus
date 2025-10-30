import { SystemBootstrap } from "@core/SystemBootstrap.js";
import { initializeCompleteGridSystem } from "@grid/CompleteGridSystem.js";
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

	// 3. Create a simple appViewModel to bridge state and UI
	const appViewModel = {
		hybridStateManager: stateManager,
		context: {
			getPolicy: (domain, key) =>
				stateManager.managers.policy?.getPolicy(domain, key),
			setPolicy: (domain, key, value) =>
				stateManager.managers.policy?.update(domain, key, value),
		},
		// Add other view model properties as needed
	};
	window.appViewModel = appViewModel;

	// 4. Initialize the fully integrated grid system
	await initializeCompleteGridSystem(appViewModel, {
		gridContainer: document.getElementById("app"), // Pass the correct root element
	});

	console.log("✅ Complete Grid System Initialized. Application is ready.");

	// 5. (Optional) Initialize the developer dashboard for real-time metrics
	new DeveloperDashboard(document.body, {
		metricsReporter: stateManager.managers.metricsReporter,
		eventFlow: stateManager.eventFlow,
	});
};

bootstrap();
