/**
 * Application Entry Point
 *
 * ONLY handles application initialization and coordination.
 * All UI logic has been moved to MainView following proper MVVM separation.
 */

import AppViewModel from "./viewmodels/app-vm.js";
import MainView from "../ui/views/main-view.js";
import CollectionViewModel from "./viewmodels/collection-vm.js"; // Import the new VM
import { BaseComponent } from "../ui/components/base/BaseComponent.js"; 
import EditorComponent from "../ui/components/EditorComponent.js";

class App {
	constructor() {
		this.appViewModel = null;
		this.mainView = null;
	}

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

	getAppViewModel() {
		return this.appViewModel;
	}

	getMainView() {
		return this.mainView;
	}

	// === CLEANUP ===

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

	// Make app globally available for debugging
	window.app = app;

	// Expose ViewModels for debugging (delegated to app)
	window.getAppVM = () => app.getAppViewModel();
	window.getEventVM = () => app.getAppViewModel()?.getEventViewModel();
	window.getTagVM = () => app.getAppViewModel()?.getTagViewModel();
	window.getItemVM = () => app.getAppViewModel()?.getItemViewModel();

	// Expose View for debugging
	window.getMainView = () => app.getMainView();
});
