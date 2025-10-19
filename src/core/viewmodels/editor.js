/**
 * @file src/core/viewmodels/EditorViewModel.js
 * @description Manages editor state, persistence, and auto-save
 * @pattern ViewModel with reactive state
 * @dependencies EventModel, BaseViewModel
 * @author Gemini Code Assist Agent
 * @date 2024-10-19
 */

import EventModel from "../models/event.js";

const AUTOSAVE_DELAY = 3000; // 3 seconds

class EditorViewModel {
	constructor() {
		this.subscribers = new Set();
		this.currentEventId = null;
		this.autoSaveTimer = null;

		this.state = {
			content: "",
			html: "",
			isDirty: false,
			isSaving: false,
			error: null,
			lastSavedAt: null,
			markdown: "",
		};
	}

	// State management
	setState(updates) {
		const changed = {};
		let hasChanges = false;

		for (const [key, value] of Object.entries(updates)) {
			if (this.state[key] !== value) {
				changed[key] = value;
				hasChanges = true;
			}
		}

		if (!hasChanges) return;

		Object.assign(this.state, changed);
		this.notify({ type: "STATE_UPDATE", changes: changed });
	}

	getState() {
		return { ...this.state };
	}

	// Subscriber pattern
	subscribe(callback) {
		this.subscribers.add(callback);
		return () => this.subscribers.delete(callback);
	}

	notify(change) {
		this.subscribers.forEach((callback) => {
			try {
				callback(change);
			} catch (error) {
				console.error("Subscriber error:", error);
			}
		});
	}

	// Load event content
	async loadEvent(eventId) {
		try {
			this.setState({ isSaving: true, error: null });
			const event = await EventModel.getById(eventId);

			if (!event) {
				throw new Error("Event not found");
			}

			this.currentEventId = eventId;
			this.setState({
				content: event.description || "",
				html: event.content_html || "",
				markdown: event.description || "",
				isDirty: false,
				isSaving: false,
				lastSavedAt: event.updated_at
					? new Date(event.updated_at)
					: null,
			});

			this.notify({ type: "EVENT_LOADED", eventId });
		} catch (error) {
			this.setState({
				error: `Failed to load event: ${error.message}`,
				isSaving: false,
			});
			throw error;
		}
	}

	// Update content and trigger auto-save
	updateContent(content, html = "") {
		this.setState({
			content,
			html,
			isDirty: true,
			error: null,
		});

		// Cancel pending auto-save
		if (this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
		}

		// Schedule new auto-save
		this.autoSaveTimer = setTimeout(() => {
			this.autoSave().catch((err) => {
				console.error("Auto-save failed:", err);
			});
		}, AUTOSAVE_DELAY);
	}

	// Auto-save implementation
	async autoSave() {
		if (!this.currentEventId || !this.state.isDirty) return;

		try {
			this.setState({ isSaving: true });

			await EventModel.update(this.currentEventId, {
				description: this.state.content,
				content_html: this.state.html,
				updated_at: new Date().toISOString(),
			});

			this.setState({
				isDirty: false,
				isSaving: false,
				lastSavedAt: new Date(),
				error: null,
			});

			this.notify({ type: "AUTO_SAVED" });
		} catch (error) {
			this.setState({
				error: `Auto-save failed: ${error.message}`,
				isSaving: false,
			});
			throw error;
		}
	}

	// Force immediate save
	async forceSave() {
		if (!this.currentEventId) return;

		// Cancel pending auto-save
		if (this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
			this.autoSaveTimer = null;
		}

		try {
			this.setState({ isSaving: true, error: null });

			await EventModel.update(this.currentEventId, {
				description: this.state.content,
				content_html: this.state.html,
				updated_at: new Date().toISOString(),
			});

			this.setState({
				isDirty: false,
				isSaving: false,
				lastSavedAt: new Date(),
			});

			this.notify({ type: "FORCE_SAVED" });
		} catch (error) {
			this.setState({
				error: `Save failed: ${error.message}`,
				isSaving: false,
			});
			throw error;
		}
	}

	// Clear content
	clearContent() {
		if (this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
		}

		this.setState({
			content: "",
			html: "",
			markdown: "",
			isDirty: false,
			error: null,
		});

		this.currentEventId = null;
		this.notify({ type: "CONTENT_CLEARED" });
	}

	// Cleanup on destroy
	destroy() {
		if (this.autoSaveTimer) {
			clearTimeout(this.autoSaveTimer);
		}
		this.subscribers.clear();
	}
}

export default EditorViewModel;
