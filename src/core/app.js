/**
 * @file src/core/app.js
 * @description Application Entry Point.
 *              ONLY handles application initialization and coordination.
 *              All UI logic has been moved to MainView following proper MVVM separation.
 * @requires ./viewmodels/app-vm.js
 * @requires ../ui/views/main-view.js
 * @requires ./viewmodels/collection-vm.js
 * @author Gemini
 * @version 1.0.0
 */

import AppViewModel from "./viewmodels/app-vm.js";
import MainView from "../ui/views/main-view.js";
import CollectionViewModel from "./viewmodels/collection-vm.js"; // Import the new VM
import { BaseComponent } from "../ui/components/base/BaseComponent.js";
import EditorComponent from "../ui/components/EditorComponent.js";

/**
 * @class App
 * @classdesc Main application class. Handles initialization of the application,
 * including ViewModels and the main view.
 */
class App {
	/**
     * @description Creates an instance of the App.
	 */
	constructor() {
		/**
         * The main application ViewModel.
         * @type {AppViewModel|null}
         */
		this.appViewModel = null;
        /**
         * The main application view.
         * @type {MainView|null}
         */
		this.mainView = null;
	}

	/**
     * @description Initializes the application.
     *              Creates and initializes the main AppViewModel and MainView.
     * @async
     * @throws {Error} If initialization fails.
	 */
	async initialize() {
		try {
			console.log("Initializing app...");

			// Create the main AppViewModel (which coordinates all child ViewModels)
			// We can instantiate all ViewModels here and pass them to the AppViewModel
			const eventViewModel = new AppViewModel().getEventViewModel(); // Keep existing logic for now
			const tagViewModel = new AppViewModel().getTagViewModel();
			const itemViewModel = new AppViewModel().getItemViewModel();
			this.appViewModel = new AppViewModel(
				eventViewModel,
				tagViewModel,
				itemViewModel,
				new CollectionViewModel()
			);

			// Initialize the app (database + all ViewModels)
			await this.appViewModel.initialize();

			console.log("Creating main view...");

			// Create the main view and bind it to the AppViewModel
			this.mainView = new MainView(this.appViewModel);

			// Initialize the view (UI bindings and listeners)
			this.mainView.initialize();

			console.log("App initialized successfully");
		} catch (error) {
			console.error("Failed to initialize app:", error);
			this.showError("Error: " + error.message);
		}
	}

	/**
     * @description Displays an error message to the user.
     * @param {string} message - The error message to display.
	 */
	showError(message) {
		// Fallback error display if MainView isn't available
		const errorDiv = document.createElement("div");
		errorDiv.textContent = message;
		errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 4px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            background: #f44336;
        `;
		document.body.appendChild(errorDiv);
	}

	// === GETTERS FOR DEBUGGING ===

	/**
     * @description Gets the main AppViewModel.
     * @returns {AppViewModel|null} The main AppViewModel.
	 */
	getAppViewModel() {
		return this.appViewModel;
	}

	/**
     * @description Gets the main MainView.
     * @returns {MainView|null} The main MainView.
	 */
	getMainView() {
		return this.mainView;
	}

	// === CLEANUP ===

	/**
     * @description Destroys the application.
     *              Cleans up the MainView and AppViewModel.
	 */
	destroy() {
		if (this.mainView) {
			this.mainView.destroy();
		}

		if (this.appViewModel) {
			// AppViewModel cleanup if needed
		}

		console.log("App destroyed");
	}
}

// Initialize the app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
	const app = new App();
	app.initialize();

	/**
     * @global
     * @description The global application instance for debugging.
     * @type {App}
     */
	window.app = app;

	/**
     * @global
     * @description Gets the main AppViewModel for debugging.
     * @returns {AppViewModel|null} The main AppViewModel.
     */
	window.getAppVM = () => app.getAppViewModel();
    /**
     * @global
     * @description Gets the EventViewModel for debugging.
     * @returns {EventViewModel|null} The EventViewModel.
     */
	window.getEventVM = () => app.getAppViewModel()?.getEventViewModel();
    /**
     * @global
     * @description Gets the TagViewModel for debugging.
     * @returns {TagViewModel|null} The TagViewModel.
     */
	window.getTagVM = () => app.getAppViewModel()?.getTagViewModel();
    /**
     * @global
     * @description Gets the ItemViewModel for debugging.
     * @returns {ItemViewModel|null} The ItemViewModel.
     */
	window.getItemVM = () => app.getAppViewModel()?.getItemViewModel();

	/**
     * @global
     * @description Gets the main MainView for debugging.
     * @returns {MainView|null} The main MainView.
     */
	window.getMainView = () => app.getMainView();
});
