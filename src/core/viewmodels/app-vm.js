/**
 * App ViewModel (Coordinator)
 *
 * This is the top-level ViewModel that coordinates between all other ViewModels.
 * It manages global app state and cross-cutting concerns.
 *
 * This replaces the monolithic MainViewModel with a cleaner, more organized approach.
 */

import appDb from "../database/db.js";
import EventViewModel from "./event-vm.js";
import ItemViewModel from "./item-vm.js";
import TagViewModel from "./tag-vm.js";

class AppViewModel {
	constructor() {
		// Child ViewModels
		this.eventViewModel = new EventViewModel();
		this.tagViewModel = new TagViewModel();
		this.itemViewModel = new ItemViewModel();

		// Global app state
		this.state = {
			// App-wide state
			isInitialized: false,
			isLoading: false,
			currentView: "list", // 'list', 'timeline', 'kanban', 'cards'

			// Navigation
			currentRoute: "events",
			breadcrumbs: [],

			// Global UI state
			sidebarOpen: true,
			theme: "light",

			// Global search
			globalSearchQuery: "",
			globalSearchResults: [],

			// Notifications/Messages
			notifications: [],

			// Error handling
			errors: [],
		};

		// Event listeners
		this.listeners = {
			stateChange: [],
			viewChange: [],
			routeChange: [],
			error: [],
			notification: [],
		};

		this.setupChildViewModelListeners();
	}

	// === STATE MANAGEMENT ===

	setState(newState) {
		const previousState = { ...this.state };
		this.state = { ...this.state, ...newState };

		// Notify listeners
		this.notifyListeners("stateChange", {
			previousState,
			currentState: this.state,
			changes: newState,
		});

		// Specific notifications
		if (newState.currentView !== undefined) {
			this.notifyListeners("viewChange", this.state.currentView);
		}

		if (newState.currentRoute !== undefined) {
			this.notifyListeners("routeChange", this.state.currentRoute);
		}
	}

	getState() {
		return { ...this.state };
	}

	// === EVENT LISTENERS ===

	on(event, callback) {
		if (!this.listeners[event]) {
			this.listeners[event] = [];
		}
		this.listeners[event].push(callback);
	}

	off(event, callback) {
		if (this.listeners[event]) {
			this.listeners[event] = this.listeners[event].filter(
				(cb) => cb !== callback
			);
		}
	}

	notifyListeners(event, data) {
		if (this.listeners[event]) {
			this.listeners[event].forEach((callback) => {
				try {
					callback(data);
				} catch (error) {
					console.error(
						`Error in AppViewModel ${event} listener:`,
						error
					);
				}
			});
		}
	}

	// === CHILD VIEWMODEL COORDINATION ===

	setupChildViewModelListeners() {
		// Listen to EventViewModel changes
		this.eventViewModel.on("stateChange", (data) => {
			// Forward certain event changes to app level
			if (data.changes.isLoading !== undefined) {
				this.setState({ isLoading: data.changes.isLoading });
			}
		});

		this.eventViewModel.on("eventCreated", (event) => {
			this.showNotification(
				`Event "${event.title}" created successfully`,
				"success"
			);
		});

		this.eventViewModel.on("eventDeleted", (eventId) => {
			this.showNotification("Event deleted successfully", "success");
		});

		// Listen to TagViewModel changes
		this.tagViewModel.on("tagCreated", (tagName) => {
			this.showNotification(`Tag #${tagName} created`, "success");
		});

		this.tagViewModel.on("tagDeleted", (tagId) => {
			this.showNotification("Tag deleted successfully", "success");
		});

		// Listen to ItemViewModel changes
		this.itemViewModel.on("itemCreated", (item) => {
			this.showNotification(
				`Item "${item.name}" created successfully`,
				"success"
			);
		});

		this.itemViewModel.on("itemDeleted", (itemId) => {
			this.showNotification("Item deleted successfully", "success");
		});

		this.itemViewModel.on("stockAlert", (alert) => {
			this.showNotification(alert.message, "warning", 5000);
		});
	}

	// === VIEW MANAGEMENT ===

	setCurrentView(viewName) {
		if (["list", "timeline", "kanban", "cards"].includes(viewName)) {
			this.setState({ currentView: viewName });
		} else {
			this.handleError(new Error(`Invalid view: ${viewName}`));
		}
	}

	setCurrentRoute(routeName) {
		const validRoutes = [
			"events",
			"items",
			"tags",
			"collections",
			"settings",
		];
		if (validRoutes.includes(routeName)) {
			this.setState({ currentRoute: routeName });
		} else {
			this.handleError(new Error(`Invalid route: ${routeName}`));
		}
	}

	toggleSidebar() {
		this.setState({ sidebarOpen: !this.state.sidebarOpen });
	}

	setTheme(theme) {
		if (["light", "dark"].includes(theme)) {
			this.setState({ theme });
			// In a real app, you'd also update the DOM/CSS
		}
	}

	// === GLOBAL SEARCH ===

	async globalSearch(query) {
		try {
			this.setState({ globalSearchQuery: query });

			if (!query.trim()) {
				this.setState({ globalSearchResults: [] });
				return [];
			}

			// Search across all ViewModels
			const [eventResults, tagResults, itemResults] = await Promise.all([
				this.eventViewModel.search(query),
				this.tagViewModel.searchTags(query),
				this.itemViewModel.search(query),
			]);

			const results = {
				events: eventResults,
				tags: tagResults,
				items: itemResults,
				total:
					eventResults.length +
					tagResults.length +
					itemResults.length,
			};

			this.setState({ globalSearchResults: results });
			return results;
		} catch (error) {
			this.handleError(error);
			return { events: [], tags: [], total: 0 };
		}
	}

	clearGlobalSearch() {
		this.setState({
			globalSearchQuery: "",
			globalSearchResults: [],
		});
	}

	// === NOTIFICATIONS & ERRORS ===

	showNotification(message, type = "info", duration = 3000) {
		const notification = {
			id: Date.now(),
			message,
			type,
			timestamp: new Date(),
			duration,
		};

		const notifications = [...this.state.notifications, notification];
		this.setState({ notifications });

		this.notifyListeners("notification", notification);

		// Auto-remove after duration
		if (duration > 0) {
			setTimeout(() => {
				this.removeNotification(notification.id);
			}, duration);
		}

		return notification.id;
	}

	removeNotification(notificationId) {
		const notifications = this.state.notifications.filter(
			(n) => n.id !== notificationId
		);
		this.setState({ notifications });
	}

	clearAllNotifications() {
		this.setState({ notifications: [] });
	}

	handleError(error) {
		console.error("App Error:", error);

		const errorObj = {
			id: Date.now(),
			message: error.message,
			stack: error.stack,
			timestamp: new Date(),
		};

		const errors = [...this.state.errors, errorObj];
		this.setState({ errors });

		this.notifyListeners("error", errorObj);
		this.showNotification(`Error: ${error.message}`, "error");

		return errorObj.id;
	}

	clearErrors() {
		this.setState({ errors: [] });
	}

	// === QUICK ACTIONS (Delegated to Child ViewModels) ===

	async quickCapture(text) {
		try {
			return await this.eventViewModel.quickCapture(text);
		} catch (error) {
			this.handleError(error);
			throw error;
		}
	}

	async createEvent(eventData) {
		try {
			return await this.eventViewModel.createEvent(eventData);
		} catch (error) {
			this.handleError(error);
			throw error;
		}
	}

	async deleteEvent(eventId) {
		try {
			return await this.eventViewModel.deleteEvent(eventId);
		} catch (error) {
			this.handleError(error);
			throw error;
		}
	}

	// === DATA MANAGEMENT ===

	async refreshAllData() {
		try {
			this.setState({ isLoading: true });

			await Promise.all([
				this.eventViewModel.loadEvents(),
				this.tagViewModel.loadTags(),
				this.itemViewModel.loadItems(),
			]);

			this.setState({ isLoading: false });
			this.showNotification("Data refreshed successfully", "success");
		} catch (error) {
			this.setState({ isLoading: false });
			this.handleError(error);
		}
	}

	async clearAllData() {
		try {
			if (
				!confirm(
					"Are you sure you want to clear all data? This cannot be undone."
				)
			) {
				return false;
			}

			this.setState({ isLoading: true });

			await appDb.clearAllData();
			await this.initialize();

			this.showNotification("All data cleared successfully", "success");
			return true;
		} catch (error) {
			this.setState({ isLoading: false });
			this.handleError(error);
			return false;
		}
	}

	// === INITIALIZATION ===

	async initialize() {
		try {
			this.setState({ isLoading: true });

			// Initialize database
			const dbInitialized = await appDb.initialize();
			if (!dbInitialized) {
				throw new Error("Failed to initialize database");
			}

			// Initialize child ViewModels
			await Promise.all([
				this.eventViewModel.initialize(),
				this.tagViewModel.initialize(),
				this.itemViewModel.initialize(),
			]);

			this.setState({
				isLoading: false,
				isInitialized: true,
			});

			console.log("AppViewModel initialized successfully");
		} catch (error) {
			this.setState({ isLoading: false });
			this.handleError(error);
			throw error;
		}
	}

	// === GETTERS FOR CHILD VIEWMODELS ===

	getEventViewModel() {
		return this.eventViewModel;
	}

	getTagViewModel() {
		return this.tagViewModel;
	}

	getItemViewModel() {
		return this.itemViewModel;
	}

	// Convenience getters for common operations
	getEvents() {
		return this.eventViewModel.getState().events;
	}

	getTags() {
		return this.tagViewModel.getState().tags;
	}

	getItems() {
		return this.itemViewModel.getState().items;
	}

	getSelectedEvent() {
		return this.eventViewModel.getState().selectedEvent;
	}

	getSelectedTag() {
		return this.tagViewModel.getState().selectedTag;
	}

	// === TEST HELPERS ===

	async createTestData() {
		try {
			await this.eventViewModel.createTestEvent();
			await this.itemViewModel.createTestItem();
			this.showNotification("Test data created", "success");
		} catch (error) {
			this.handleError(error);
		}
	}

	// === DEBUGGING ===

	getDebugInfo() {
		return {
			appState: this.state,
			eventViewModelState: this.eventViewModel.getState(),
			tagViewModelState: this.tagViewModel.getState(),
			itemViewModelState: this.itemViewModel.getState(),
			errors: this.state.errors,
			notifications: this.state.notifications,
		};
	}
}

export default AppViewModel;
