/**
 * Main Application Entry Point
 *
 * This initializes the database, creates the AppViewModel (which coordinates
 * all other ViewModels), and sets up basic UI bindings to test our MVVM architecture.
 */

class App {
	constructor() {
		this.appViewModel = null;
		this.ui = {
			status: document.getElementById("status"),
			captureInput: document.getElementById("capture-input"),
			captureSubmit: document.getElementById("capture-submit"),
			testInsert: document.getElementById("test-insert"),
			testQuery: document.getElementById("test-query"),
			clearDb: document.getElementById("clear-db"),
			testResults: document.getElementById("test-results"),
		};
	}

	async initialize() {
		try {
			this.updateStatus("Initializing...");

			// Create the main AppViewModel (which handles database init and child ViewModels)
			this.appViewModel = new AppViewModel();

			// Initialize the app (database + all ViewModels)
			await this.appViewModel.initialize();

			this.updateStatus("Setting up UI bindings...");

			// Set up UI bindings
			this.setupUIBindings();

			// Set up ViewModel listeners
			this.setupViewModelListeners();

			this.updateStatus(
				"Ready! Database initialized with " +
					this.appViewModel.getEvents().length +
					" events"
			);

			console.log("App initialized successfully");
		} catch (error) {
			console.error("Failed to initialize app:", error);
			this.updateStatus("Error: " + error.message);
		}
	}

	setupUIBindings() {
		// Quick capture functionality
		this.ui.captureSubmit.addEventListener("click", () => {
			this.handleQuickCapture();
		});

		this.ui.captureInput.addEventListener("keypress", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.handleQuickCapture();
			}
		});

		// Test buttons
		this.ui.testInsert.addEventListener("click", () => {
			this.handleTestInsert();
		});

		this.ui.testQuery.addEventListener("click", () => {
			this.handleTestQuery();
		});

		this.ui.clearDb.addEventListener("click", () => {
			this.handleClearDatabase();
		});

		// Update capture text in EventViewModel as user types
		this.ui.captureInput.addEventListener("input", (e) => {
			if (this.appViewModel) {
				this.appViewModel
					.getEventViewModel()
					.setCaptureText(e.target.value);
			}
		});
	}

	setupViewModelListeners() {
		// Listen for app-wide state changes
		this.appViewModel.on("stateChange", (data) => {
			this.handleAppStateChange(data);
		});

		// Listen for notifications
		this.appViewModel.on("notification", (notification) => {
			this.showMessage(notification.message, notification.type);
		});

		// Listen for errors
		this.appViewModel.on("error", (error) => {
			console.error("App Error:", error);
		});

		// Listen for EventViewModel changes
		const eventVM = this.appViewModel.getEventViewModel();

		eventVM.on("stateChange", (data) => {
			this.handleEventStateChange(data);
		});

		eventVM.on("eventsChange", (events) => {
			this.updateStatus(`Ready! ${events.length} events in database`);
		});

		// Listen for TagViewModel changes
		const tagVM = this.appViewModel.getTagViewModel();

		tagVM.on("tagsChange", (tags) => {
			console.log(`Tags updated: ${tags.length} total tags`);
		});
	}

	handleAppStateChange(data) {
		const { changes } = data;

		// Update loading state
		if (changes.isLoading !== undefined) {
			if (changes.isLoading) {
				this.updateStatus("Loading...");
			}
		}
	}

	handleEventStateChange(data) {
		const { changes } = data;

		// Update capture input state
		if (changes.isCaptureProcessing !== undefined) {
			this.ui.captureSubmit.disabled = changes.isCaptureProcessing;
			this.ui.captureSubmit.textContent = changes.isCaptureProcessing
				? "Processing..."
				: "Capture";
		}

		// Clear capture input when text is cleared
		if (changes.captureText === "") {
			this.ui.captureInput.value = "";
		}
	}

	async handleQuickCapture() {
		try {
			const text = this.ui.captureInput.value.trim();
			if (!text) return;

			await this.appViewModel.quickCapture(text);

			// Success is handled by the notification system now
		} catch (error) {
			console.error("Quick capture failed:", error);
			// Error is handled by the AppViewModel error system
		}
	}

	async handleTestInsert() {
		try {
			await this.appViewModel.createTestData();
		} catch (error) {
			console.error("Test insert failed:", error);
		}
	}

	async handleTestQuery() {
		try {
			const events = this.appViewModel.getEvents();
			const tags = this.appViewModel.getTags();
			const items = this.appViewModel.getItems();

			let html = "<h3>Query Results:</h3>";

			if (events.length === 0 && items.length === 0) {
				html += "<p>No data found. Try creating some first!</p>";
			} else {
				// Show Events
				if (events.length > 0) {
					html += "<h4>Events:</h4><ul>";
					for (const event of events) {
						const tagsList = event.tags
							? event.tags.map((t) => `#${t.tag_name}`).join(" ")
							: "";
						const eventType = event.event_type
							? event.event_type.name
							: "Unknown";
						const dueDate = event.due_date
							? new Date(event.due_date).toLocaleDateString()
							: "No due date";

						html += `
                            <li>
                                <strong>${
									event.title
								}</strong> (${eventType})<br>
                                Status: ${event.status}<br>
                                Due: ${dueDate}<br>
                                Tags: ${tagsList || "None"}<br>
                                <small>Created: ${new Date(
									event.created_at
								).toLocaleString()}</small>
                            </li>
                        `;
					}
					html += "</ul>";
				}

				// Show Items
				if (items.length > 0) {
					html += "<h4>Items:</h4><ul>";
					for (const item of items) {
						const tagsList = item.tags
							? item.tags.map((t) => `#${t.tag_name}`).join(" ")
							: "";
						const itemType = item.item_type
							? item.item_type.name
							: "Unknown";

						html += `
                            <li>
                                <strong>${item.name}</strong> (${itemType})<br>
                                Stock: ${item.stock_quantity || 0}<br>
                                Description: ${item.description || "None"}<br>
                                Tags: ${tagsList || "None"}<br>
                                <small>Created: ${new Date(
									item.created_at
								).toLocaleString()}</small>
                            </li>
                        `;
					}
					html += "</ul>";
				}
			}

			// Show tag statistics
			if (tags.length > 0) {
				html += "<h4>Tags:</h4><ul>";
				tags.forEach((tag) => {
					html += `<li>#${tag.tag_name}</li>`;
				});
				html += "</ul>";
			}

			// Show MVVM structure info
			html += "<h4>MVVM Structure:</h4>";
			html += "<ul>";
			html += `<li><strong>AppViewModel:</strong> Coordinating ${
				this.appViewModel.getState().currentRoute
			} route</li>`;
			html += `<li><strong>EventViewModel:</strong> Managing ${events.length} events</li>`;
			html += `<li><strong>TagViewModel:</strong> Managing ${tags.length} tags</li>`;
			html += `<li><strong>ItemViewModel:</strong> Managing ${items.length} items</li>`;
			html += "</ul>";

			this.ui.testResults.innerHTML = html;
		} catch (error) {
			console.error("Test query failed:", error);
		}
	}

	async handleClearDatabase() {
		try {
			const cleared = await this.appViewModel.clearAllData();
			if (cleared) {
				this.ui.testResults.innerHTML = "";
			}
		} catch (error) {
			console.error("Clear database failed:", error);
		}
	}

	updateStatus(message) {
		this.ui.status.textContent = message;
		console.log("Status:", message);
	}

	showMessage(message, type = "info") {
		// Simple message display - in a real app you'd want a proper notification system
		const messageDiv = document.createElement("div");
		messageDiv.textContent = message;
		messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 4px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            background: ${
				type === "success"
					? "#4CAF50"
					: type === "error"
					? "#f44336"
					: "#2196F3"
			};
        `;

		document.body.appendChild(messageDiv);

		setTimeout(() => {
			if (document.body.contains(messageDiv)) {
				document.body.removeChild(messageDiv);
			}
		}, 3000);

		console.log(`${type.toUpperCase()}: ${message}`);
	}

	// === DEBUGGING HELPERS ===

	getDebugInfo() {
		return this.appViewModel ? this.appViewModel.getDebugInfo() : null;
	}

	getAppViewModel() {
		return this.appViewModel;
	}
}

// Initialize the app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
	const app = new App();
	app.initialize();

	// Make app globally available for debugging
	window.app = app;

	// Also expose ViewModels for debugging
	window.getAppVM = () => app.getAppViewModel();
	window.getEventVM = () => app.getAppViewModel()?.getEventViewModel();
	window.getTagVM = () => app.getAppViewModel()?.getTagViewModel();
	window.getItemVM = () => app.getAppViewModel()?.getItemViewModel();
});
