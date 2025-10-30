/**
 * @file GridToastManager.js
 * @description Implements a lightweight, accessible toast notification system for providing user feedback,
 * particularly for grid layout persistence and policy changes. It integrates with the `EventFlowEngine`
 * to react to system events.
 */

/**
 * @class GridToastManager
 * @classdesc Manages the display of transient, non-intrusive toast notifications.
 * It handles creation, styling, automatic dismissal, and accessibility features for toasts.
 */
export class GridToastManager {
	/**
	 * Creates an instance of GridToastManager.
	 */
	constructor() {
		/**
		 * A map of active toasts, keyed by their unique ID.
		 * @type {Map<string, {element: HTMLElement, type: string}>}
		 * @private
		 */
		this.toasts = new Map();
		/**
		 * The DOM element that serves as the container for all toasts.
		 * @type {HTMLElement|null}
		 * @private
		 */
		this.container = null;
		/**
		 * The maximum number of toasts to display simultaneously.
		 * @type {number}
		 * @private
		 */
		this.maxToasts = 3;
		/**
		 * The default duration for toasts to display in milliseconds.
		 * @type {number}
		 * @private
		 */
		this.defaultDuration = 2500;

		this.setupContainer();
		this.setupEventListeners();
	}

	/**
	 * Sets up the main container element for toasts in the DOM.
	 * @private
	 */
	setupContainer() {
		// Create toast container if it doesn't exist
		this.container = document.getElementById("grid-toast-container");
		if (!this.container) {
			this.container = document.createElement("div");
			this.container.id = "grid-toast-container";
			this.container.className = "grid-toast-container";
			this.container.setAttribute("aria-live", "polite");
			this.container.setAttribute("aria-label", "Grid notifications");

			// Position container
			this.container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        pointer-events: none;
        max-width: 300px;
      `;

			document.body.appendChild(this.container);
		}
	}

	/**
	 * Sets up event listeners to react to system events and display toasts.
	 * @private
	 */
	setupEventListeners() {
		// Listen for layout changes to show save feedback
		if (typeof window.eventFlowEngine !== "undefined") {
			window.eventFlowEngine.on(
				"layoutChanged",
				this.onLayoutChanged.bind(this)
			);
			window.eventFlowEngine.on(
				"gridPerformanceMode",
				this.onPerformanceModeChanged.bind(this)
			);
		}
	}

	/**
	 * Handles `layoutChanged` events, displaying a toast notification if policies allow.
	 * @private
	 * @param {object} changeEvent - The event data for the layout change.
	 */
	onLayoutChanged(changeEvent) {
		// Check policy to see if we should show feedback
		try {
			const context = this.getContext();
			if (!context || !this.shouldShowSaveFeedback(context)) {
				return;
			}

			// Show different messages based on change type
			const messages = {
				drag: "📍 Layout saved",
				resize: "📏 Layout saved",
				keyboard_move: "⌨️ Position saved",
				keyboard_resize: "⌨️ Size saved",
				add: "➕ Block added",
				remove: "➖ Block removed",
			};

			const message =
				messages[changeEvent.changeType] || "💾 Layout saved";
			this.showToast(message, "success", 2000);
		} catch (error) {
			console.warn("Toast notification error:", error);
		}
	}

	/**
	 * Handles `gridPerformanceMode` events, displaying a toast notification for policy overrides.
	 * @private
	 * @param {object} data - The event data for the performance mode change.
	 */
	onPerformanceModeChanged(data) {
		if (data.reason === "policy_override") {
			const message = data.enabled
				? "🚀 Performance mode enabled"
				: "✨ Full features enabled";
			this.showToast(message, "info", 3000);
		}
	}

	/**
	 * Checks the system policy to determine if save feedback toasts should be displayed.
	 * @private
	 * @param {object} context - The application context, expected to have a `getBooleanPolicy` method.
	 * @returns {boolean} `true` if save feedback should be shown, `false` otherwise.
	 */
	shouldShowSaveFeedback(context) {
		// Check policy or use default
		try {
			return (
				context.getBooleanPolicy?.(
					"system",
					"grid_save_feedback",
					true
				) ?? true
			);
		} catch (error) {
			return true; // Default to showing feedback
		}
	}

	/**
	 * Retrieves the application context from the global `window` object.
	 * @private
	 * @returns {object|null} The application context, or `null` if not available.
	 */
	getContext() {
		// Try to get context from global app or window
		return window.appViewModel?.context || null;
	}

	/**
	 * Displays a toast notification with the given message, type, and duration.
	 * @param {string} message - The message to display in the toast.
	 * @param {'info'|'success'|'error'|'warning'} [type='info'] - The type of toast, influencing its styling.
	 * @param {number|null} [duration=null] - The duration in milliseconds before the toast automatically dismisses. If `null`, uses `defaultDuration`.
	 * @returns {string} The unique ID of the displayed toast.
	 */
	showToast(message, type = "info", duration = null) {
		const id = Date.now().toString();
		const toast = this.createToast(id, message, type);

		// Add to container
		this.container.appendChild(toast);
		this.toasts.set(id, { element: toast, type });

		// Limit number of toasts
		this.enforceMaxToasts();

		// Auto-remove after duration
		const actualDuration = duration || this.defaultDuration;
		setTimeout(() => {
			this.removeToast(id);
		}, actualDuration);

		// Animate in
		requestAnimationFrame(() => {
			toast.style.transform = "translateX(0)";
			toast.style.opacity = "1";
		});

		return id;
	}

	/**
	 * Creates the DOM element for a toast notification.
	 * @private
	 * @param {string} id - The unique ID for the toast.
	 * @param {string} message - The message content of the toast.
	 * @param {string} type - The type of the toast ('info', 'success', 'error', 'warning').
	 * @returns {HTMLElement} The created toast DOM element.
	 */
	createToast(id, message, type) {
		const toast = document.createElement("div");
		toast.className = `grid-toast grid-toast-${type}`;
		toast.setAttribute("data-toast-id", id);
		toast.setAttribute("role", "status");
		toast.setAttribute("aria-atomic", "true");

		// Set initial styles for animation
		toast.style.cssText = `
      background: ${this.getBackgroundColor(type)};
      color: ${this.getTextColor(type)};
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border-left: 4px solid ${this.getBorderColor(type)};
      transform: translateX(100%);
      opacity: 0;
      transition: all 0.3s ease;
      pointer-events: auto;
      cursor: pointer;
      user-select: none;
      position: relative;
      overflow: hidden;
    `;

		// Add content
		const content = document.createElement("div");
		content.textContent = message;
		toast.appendChild(content);

		// Add close button
		const closeBtn = document.createElement("button");
		closeBtn.innerHTML = "×";
		closeBtn.className = "toast-close";
		closeBtn.setAttribute("aria-label", "Close notification");
		closeBtn.style.cssText = `
      position: absolute;
      top: 4px;
      right: 8px;
      background: none;
      border: none;
      color: inherit;
      font-size: 18px;
      cursor: pointer;
      opacity: 0.7;
      line-height: 1;
    `;

		closeBtn.addEventListener("click", () => {
			this.removeToast(id);
		});

		toast.appendChild(closeBtn);

		// Click to dismiss
		toast.addEventListener("click", (e) => {
			if (e.target !== closeBtn) {
				this.removeToast(id);
			}
		});

		return toast;
	}

	/**
	 * Gets the background color for a toast based on its type.
	 * @private
	 * @param {string} type - The type of the toast.
	 * @returns {string} The CSS color value.
	 */
	getBackgroundColor(type) {
		const colors = {
			success: "#d4edda",
			error: "#f8d7da",
			warning: "#fff3cd",
			info: "#d1ecf1",
		};
		return colors[type] || colors.info;
	}

	/**
	 * Gets the text color for a toast based on its type.
	 * @private
	 * @param {string} type - The type of the toast.
	 * @returns {string} The CSS color value.
	 */
	getTextColor(type) {
		const colors = {
			success: "#155724",
			error: "#721c24",
			warning: "#856404",
			info: "#0c5460",
		};
		return colors[type] || colors.info;
	}

	/**
	 * Gets the border color for a toast based on its type.
	 * @private
	 * @param {string} type - The type of the toast.
	 * @returns {string} The CSS color value.
	 */
	getBorderColor(type) {
		const colors = {
			success: "#28a745",
			error: "#dc3545",
			warning: "#ffc107",
			info: "#17a2b8",
		};
		return colors[type] || colors.info;
	}

	/**
	 * Removes a toast notification from the DOM and the internal registry.
	 * @private
	 * @param {string} id - The unique ID of the toast to remove.
	 */
	removeToast(id) {
		const toast = this.toasts.get(id);
		if (!toast) return;

		const element = toast.element;

		// Animate out
		element.style.transform = "translateX(100%)";
		element.style.opacity = "0";

		// Remove from DOM after animation
		setTimeout(() => {
			if (element.parentNode) {
				element.parentNode.removeChild(element);
			}
			this.toasts.delete(id);
		}, 300);
	}

	/**
	 * Ensures that the number of displayed toasts does not exceed `maxToasts` by removing the oldest ones.
	 * @private
	 */
	enforceMaxToasts() {
		const toastIds = Array.from(this.toasts.keys());
		if (toastIds.length > this.maxToasts) {
			// Remove oldest toasts
			const toRemove = toastIds.slice(
				0,
				toastIds.length - this.maxToasts
			);
			toRemove.forEach((id) => this.removeToast(id));
		}
	}

	/**
	 * Displays a success-type toast notification.
	 * @public
	 * @param {string} message - The message to display.
	 * @param {number|null} [duration=null] - The duration in milliseconds.
	 * @returns {string} The ID of the toast.
	 */
	success(message, duration) {
		return this.showToast(message, "success", duration);
	}

	/**
	 * Displays an error-type toast notification.
	 * @public
	 * @param {string} message - The message to display.
	 * @param {number|null} [duration=null] - The duration in milliseconds.
	 * @returns {string} The ID of the toast.
	 */
	error(message, duration) {
		return this.showToast(message, "error", duration);
	}

	/**
	 * Displays a warning-type toast notification.
	 * @public
	 * @param {string} message - The message to display.
	 * @param {number|null} [duration=null] - The duration in milliseconds.
	 * @returns {string} The ID of the toast.
	 */
	warning(message, duration) {
		return this.showToast(message, "warning", duration);
	}

	/**
	 * Displays an info-type toast notification.
	 * @public
	 * @param {string} message - The message to display.
	 * @param {number|null} [duration=null] - The duration in milliseconds.
	 * @returns {string} The ID of the toast.
	 */
	info(message, duration) {
		return this.showToast(message, "info", duration);
	}

	/**
	 * Clears all currently displayed toast notifications.
	 * @public
	 */
	clear() {
		Array.from(this.toasts.keys()).forEach((id) => this.removeToast(id));
	}

	/**
	 * Destroys the toast manager, clearing all toasts and removing its container from the DOM.
	 * @public
	 */
	destroy() {
		this.clear();
		if (this.container && this.container.parentNode) {
			this.container.parentNode.removeChild(this.container);
		}
	}
}

/**
 * The singleton instance of the `GridToastManager`.
 * @private
 * @type {GridToastManager|null}
 */
let toastManager = null;

/**
 * Retrieves the singleton instance of the `GridToastManager`, creating it if it doesn't already exist.
 * @returns {GridToastManager} The singleton instance.
 */
export function getToastManager() {
	if (!toastManager) {
		toastManager = new GridToastManager();
	}
	return toastManager;
}

/**
 * A convenience function to show a toast notification without directly accessing the manager instance.
 * @param {string} message - The message to display.
 * @param {'info'|'success'|'error'|'warning'} [type='info'] - The type of toast.
 * @param {number|null} [duration=null] - The duration in milliseconds.
 * @returns {string} The ID of the toast.
 */
export function showGridToast(message, type = "info", duration = null) {
	return getToastManager().showToast(message, type, duration);
}

/**
 * A convenience function to show a success toast specifically for layout save events.
 * @param {'drag'|'resize'|'keyboard_move'|'keyboard_resize'|'change'} [changeType='change'] - The type of layout change.
 * @returns {string} The ID of the toast.
 */
export function showLayoutSaved(changeType = "change") {
	const messages = {
		drag: "📍 Layout saved",
		resize: "📏 Layout saved",
		keyboard_move: "⌨️ Position saved",
		keyboard_resize: "⌨️ Size saved",
		change: "💾 Layout saved",
	};

	const message = messages[changeType] || messages.change;
	return getToastManager().success(message, 2000);
}

export default GridToastManager;
