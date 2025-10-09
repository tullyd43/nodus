/**
 * MainView - UI Layer for the Productivity App
 *
 * This class handles all UI interactions and binds to ViewModels following MVVM pattern.
 * It ONLY contains view logic - all business logic is in ViewModels.
 */

class MainView {
	constructor(appViewModel) {
		this.appViewModel = appViewModel;
		this.eventViewModel = appViewModel.getEventViewModel();
		this.tagViewModel = appViewModel.getTagViewModel();
		this.itemViewModel = appViewModel.getItemViewModel();

		this.elements = {};
	}

	initialize() {
		console.log("MainView initializing...");

		// Get DOM elements
		this.elements = {
			status: document.getElementById("status"),
			captureInput: document.getElementById("capture-input"),
			captureSubmit: document.getElementById("capture-submit"),
			testInsert: document.getElementById("test-insert"),
			testQuery: document.getElementById("test-query"),
			clearDb: document.getElementById("clear-db"),
			testResults: document.getElementById("test-results"),
		};

		// Bind event listeners
		this.bindEventListeners();

		// Initialize UI state
		this.updateStatus("Ready");

		console.log("MainView initialized successfully");
	}

	bindEventListeners() {
		// Quick capture functionality
		this.elements.captureSubmit.addEventListener("click", () =>
			this.handleQuickCapture()
		);

		this.elements.captureInput.addEventListener("keypress", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.handleQuickCapture();
			}
		});

		// Test functionality
		this.elements.testInsert.addEventListener("click", () =>
			this.handleTestInsert()
		);

		this.elements.testQuery.addEventListener("click", () =>
			this.handleTestQuery()
		);

		this.elements.clearDb.addEventListener("click", () =>
			this.handleClearDatabase()
		);
	}

	// === EVENT HANDLERS ===

	async handleQuickCapture() {
		const input = this.elements.captureInput.value.trim();
		if (!input) return;

		try {
			this.updateStatus("Processing capture...");

			// Use AppViewModel to handle the capture
			const result = await this.appViewModel.quickCapture(input);

			this.showNotification(
				`${result.type === "event" ? "Event" : "Item"} created: ${
					result.title || result.name
				}`,
				"success"
			);

			// Clear input
			this.elements.captureInput.value = "";

			this.updateStatus("Ready");
		} catch (error) {
			console.error("Quick capture failed:", error);
			this.showNotification(
				"Failed to capture: " + error.message,
				"error"
			);
			this.updateStatus("Ready");
		}
	}

	async handleTestInsert() {
		try {
			this.updateStatus("Creating test data...");

			// Use the test helper method on the ViewModel, which is designed for this.
			// This ensures correct data is passed and follows the MVVM pattern.
			const testEvent = await this.eventViewModel.createTestEvent();

			// Use the test helper method on the ItemViewModel as well.
			const testItem = await this.itemViewModel.createTestItem();

			this.showNotification(
				`Created test event: ${testEvent.title} and test item: ${testItem.name}`,
				"success"
			);

			this.updateStatus("Ready");
		} catch (error) {
			console.error("Test insert failed:", error);
			this.showNotification(
				"Failed to create test data: " + error.message,
				"error"
			);
			this.updateStatus("Ready");
		}
	}

	async handleTestQuery() {
		try {
			this.updateStatus("Querying data...");

			// Get all data by calling the query methods on the underlying models.
			// This is the correct way to fetch data according to the new architecture.
			const events = await this.eventViewModel.eventModel.query();
			const tags = await this.tagViewModel.tagModel.getAllTags();
			const items = await this.itemViewModel.itemModel.query();

			// Display results
			const resultsHTML = this.buildQueryResultsHTML(events, tags, items);
			this.elements.testResults.innerHTML = resultsHTML;

			this.updateStatus("Ready");
		} catch (error) {
			console.error("Test query failed:", error);
			this.showNotification(
				"Failed to query data: " + error.message,
				"error"
			);
			this.updateStatus("Ready");
		}
	}

	async handleClearDatabase() {
		if (
			!confirm(
				"Are you sure you want to clear all data? This cannot be undone."
			)
		) {
			return;
		}

		try {
			this.updateStatus("Clearing database...");

			// Use AppViewModel to clear everything
			await this.appViewModel.clearAllData();

			this.elements.testResults.innerHTML = "";
			this.elements.captureInput.value = "";

			this.showNotification("Database cleared successfully", "success");
			this.updateStatus("Ready");
		} catch (error) {
			console.error("Clear database failed:", error);
			this.showNotification(
				"Failed to clear database: " + error.message,
				"error"
			);
			this.updateStatus("Ready");
		}
	}

	// === UI HELPERS ===

	updateStatus(message) {
		this.elements.status.textContent = message;
		console.log("Status:", message);
	}

	showNotification(message, type = "info", duration = 3000) {
		// Ensure notification styles are loaded
		this.ensureNotificationStyles();

		// Create notification element
		const messageDiv = document.createElement("div");
		messageDiv.textContent = message;
		messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            max-width: 400px;
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
            background: ${this.getNotificationColor(type)};
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;

		document.body.appendChild(messageDiv);

		// Auto-remove notification
		setTimeout(() => {
			if (document.body.contains(messageDiv)) {
				messageDiv.style.animation = "slideOut 0.3s ease-in";
				setTimeout(() => {
					if (document.body.contains(messageDiv)) {
						document.body.removeChild(messageDiv);
					}
				}, 300);
			}
		}, duration);

		console.log(`${type.toUpperCase()}: ${message}`);
	}

	getNotificationColor(type) {
		const colors = {
			success: "#4CAF50",
			error: "#f44336",
			warning: "#ff9800",
			info: "#2196F3",
		};
		return colors[type] || colors.info;
	}

	ensureNotificationStyles() {
		if (!document.getElementById("notification-styles")) {
			const style = document.createElement("style");
			style.id = "notification-styles";
			style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
			document.head.appendChild(style);
		}
	}

	// === HTML BUILDERS ===

	buildQueryResultsHTML(events, tags, items) {
		let html = "<h3>Query Results:</h3>";

		if (events.length === 0 && items.length === 0) {
			html += "<p>No data found. Try creating some first!</p>";
		} else {
			// Show Events
			if (events.length > 0) {
				html += this.buildEventsHTML(events);
			}

			// Show Items
			if (items.length > 0) {
				html += this.buildItemsHTML(items);
			}
		}

		// Show tag statistics
		if (tags.length > 0) {
			html += this.buildTagsHTML(tags);
		}

		// Show MVVM structure info
		html += this.buildMVVMInfoHTML(
			events.length,
			tags.length,
			items.length
		);

		return html;
	}

	buildEventsHTML(events) {
		let html = "<h4>Events:</h4><ul>";
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
                    <strong>${this.escapeHtml(
						event.title
					)}</strong> (${this.escapeHtml(eventType)})<br>
                    Status: ${this.escapeHtml(event.status)}<br>
                    Due: ${dueDate}<br>
                    Tags: ${this.escapeHtml(tagsList) || "None"}<br>
                    <small>Created: ${new Date(
						event.created_at
					).toLocaleString()}</small>
                </li>
            `;
		}
		html += "</ul>";
		return html;
	}

	buildItemsHTML(items) {
		let html = "<h4>Items:</h4><ul>";
		for (const item of items) {
			const tagsList = item.tags
				? item.tags.map((t) => `#${t.tag_name}`).join(" ")
				: "";
			const itemType = item.item_type ? item.item_type.name : "Unknown";

			html += `
                <li>
                    <strong>${this.escapeHtml(
						item.name
					)}</strong> (${this.escapeHtml(itemType)})<br>
                    Stock: ${item.stock_quantity || 0}<br>
                    Description: ${
						this.escapeHtml(item.description) || "None"
					}<br>
                    Tags: ${this.escapeHtml(tagsList) || "None"}<br>
                    <small>Created: ${new Date(
						item.created_at
					).toLocaleString()}</small>
                </li>
            `;
		}
		html += "</ul>";
		return html;
	}

	buildTagsHTML(tags) {
		let html = "<h4>Tags:</h4><ul>";
		tags.forEach((tag) => {
			html += `<li>#${this.escapeHtml(tag.tag_name)}</li>`;
		});
		html += "</ul>";
		return html;
	}

	buildMVVMInfoHTML(eventCount, tagCount, itemCount) {
		let html = "<h4>MVVM Structure:</h4>";
		html += "<ul>";
		html += `<li><strong>AppViewModel:</strong> Coordinating ${
			this.appViewModel.getState().currentRoute
		} route</li>`;
		html += `<li><strong>EventViewModel:</strong> Managing ${eventCount} events</li>`;
		html += `<li><strong>TagViewModel:</strong> Managing ${tagCount} tags</li>`;
		html += `<li><strong>ItemViewModel:</strong> Managing ${itemCount} items</li>`;
		html += `<li><strong>MainView:</strong> Handling all UI interactions</li>`;
		html += "</ul>";
		return html;
	}

	// === UTILITIES ===

	escapeHtml(text) {
		if (!text) return "";
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}

	// === CLEANUP ===

	destroy() {
		// Remove event listeners to prevent memory leaks
		// This would be called when the view is destroyed
		console.log("MainView destroyed");
	}
}

export default MainView;
