import { HybridStateManager } from "@core/HybridStateManager.js";
import GridBootstrap from "@grid/GridBootstrap.js";
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

	// Initialize Hybrid State Manager (no backend)
	window.nodusApp = new HybridStateManager({
		...AppConfig, // Use the centralized configuration
	});
	await window.nodusApp.initialize();

	// Render grid
	const grid = new GridBootstrap(
		document.getElementById("app"),
		window.nodusApp.storage.instance, // Pass the initialized storage instance
		window.nodusApp
	);
	await grid.render();

	console.log(
		"✅ Grid ready (offline mode). Check console for data inspection."
	);
};

bootstrap();
