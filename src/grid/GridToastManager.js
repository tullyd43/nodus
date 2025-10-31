/**
 * @file GridToastManager.js
 * @description A managed service that implements a lightweight, accessible toast notification system. It provides user feedback for grid layout persistence, policy changes, and other system events, adhering to all V8 Parity Mandates.
 */

import { DateCore } from "../utils/DateUtils.js";

/**
 * @class GridToastManager
 * @classdesc Manages the display of transient, non-intrusive toast notifications. It handles creation, styling, automatic dismissal, and accessibility features for toasts. This is a managed service, instantiated by the ServiceRegistry.
 * @privateFields {#stateManager, #eventFlowEngine, #policyManager, #errorHelpers, #metrics, #toasts, #container, #maxToasts, #defaultDuration, #unsubscribeFunctions}
 */
export class GridToastManager {
	/** @private @type {import('../core/EventFlowEngine.js').EventFlowEngine|null} */
	#eventFlowEngine;
	/** @private @type {import('../core/SystemPolicies.js').SystemPolicies|null} */
	#policyManager;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers;
	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics;

	/** @private @type {Map<string, {element: HTMLElement, type: string}>} */
	#toasts = new Map();
	/** @private @type {HTMLElement|null} */
	#container = null;
	/** @private @type {number} */
	#maxToasts = 3;
	/** @private @type {number} */
	#defaultDuration = 2500;
	/** @private @type {Function[]} */
	#unsubscribeFunctions = [];

	/** @private */
	#onError(error) {
		if (error.showToUser) {
			const typeMap = {
				high: "error",
				medium: "warning",
				low: "info",
			};
			this.showToast(
				error.userFriendlyMessage,
				typeMap[error.severity] || "error"
			);
		}
	}

	/** @private */
	#onPerformanceModeChanged(data) {
		if (data.reason === "policy_override") {
			const message = data.enabled
				? "🚀 Performance mode enabled"
				: "✨ Full features enabled";
			this.info(message, 3000);
		}
	}

	/** @private */
	#onPerformanceAlert(alert) {
		this.warning(alert.message, 4000);
	}

	/**
	 * Creates an instance of GridToastManager.
	 * @param {object} context - The context object from the ServiceRegistry.
	 * @param {import('../core/HybridStateManager.js').default} context.stateManager - The application's state manager.
	 */
	constructor({ stateManager }) {
		// V8.0 Parity: Mandate 1.1 & 1.2 - Derive all dependencies from the stateManager.
		this.#eventFlowEngine = stateManager.eventFlowEngine;
		this.#policyManager = stateManager.managers.policies;
		this.#errorHelpers = stateManager.managers.errorHelpers;
		this.#metrics =
			stateManager.metricsRegistry?.namespace("grid.toastManager");

		this.#setupContainer();
		this.#setupEventListeners();
	}

	/**
	 * Sets up the main container element for toasts in the DOM.
	 * @private
	 */
	#setupContainer() {
		// Create toast container if it doesn't exist
		this.#container = document.getElementById("grid-toast-container");
		if (!this.#container) {
			this.#container = document.createElement("div");
			this.#container.id = "grid-toast-container";
			this.#container.className = "grid-toast-container";
			this.#container.setAttribute("aria-live", "polite");
			this.#container.setAttribute("aria-label", "Grid notifications");

			// Position container
			this.#container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        pointer-events: none;
        max-width: 300px;
      `;

			document.body.appendChild(this.#container);
		}
	}

	/**
	 * Sets up event listeners to react to system events and display toasts.
	 * @private
	 */
	#setupEventListeners() {
		// Listen for layout changes to show save feedback
		if (this.#eventFlowEngine) {
			this.#unsubscribeFunctions.push(
				this.#eventFlowEngine.on(
					"layoutChanged",
					this.#onLayoutChanged.bind(this)
				)
			);
			this.#unsubscribeFunctions.push(
				this.#eventFlowEngine.on(
					"gridPerformanceMode",
					this.#onPerformanceModeChanged.bind(this)
				)
			);
			this.#unsubscribeFunctions.push(
				this.#eventFlowEngine.on("error", this.#onError.bind(this))
			);
			this.#unsubscribeFunctions.push(
				this.#eventFlowEngine.on(
					"performance_alert",
					this.#onPerformanceAlert.bind(this)
				)
			);
		}
	}

	/**
	 * Handles `layoutChanged` events, displaying a toast notification if policies allow.
	 * @private
	 * @param {object} changeEvent - The event data for the layout change.
	 */
	#onLayoutChanged(changeEvent) {
		// Check policy to see if we should show feedback
		try {
			if (!this.#shouldShowSaveFeedback()) {
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
			this.success(message, 2000);
		} catch (error) {
			this.#metrics?.increment("toast.create_failed");
			this.#errorHelpers?.handleError(error, {
				component: "GridToastManager",
				operation: "onLayoutChanged",
				userFriendlyMessage:
					"Could not display layout save notification.",
			});
		}
	}

	/**
	 * Checks the system policy to determine if save feedback toasts should be displayed.
	 * @private
	 * @returns {boolean} `true` if save feedback should be shown, `false` otherwise.
	 */
	#shouldShowSaveFeedback() {
		// Check policy or use default
		try {
			return this.#policyManager
				? this.#policyManager.getPolicy("system", "grid_save_feedback")
				: true;
		} catch (error) {
			this.#errorHelpers?.handleError(error, {
				component: "GridToastManager",
				operation: "shouldShowSaveFeedback",
				severity: "low",
			});
			return true; // Default to showing feedback
		}
	}

	/**
	 * Displays a toast notification with the given message, type, and duration.
	 * @private
	 * @param {string} message - The message to display in the toast.
	 * @param {'info'|'success'|'error'|'warning'} [type='info'] - The type of toast, influencing its styling.
	 * @param {number|null} [duration=null] - The duration in milliseconds before the toast automatically dismisses. If `null`, uses `defaultDuration`.
	 * @returns {string} The unique ID of the displayed toast.
	 */
	#showToast(message, type = "info", duration = null) {
		const id = DateCore.timestamp().toString();
		const toast = this.#createToast(id, message, type);

		// Add to container
		this.#container.appendChild(toast);
		this.#toasts.set(id, { element: toast, type });

		// Limit number of toasts
		this.#enforceMaxToasts();

		// Auto-remove after duration
		const actualDuration = duration || this.#defaultDuration;
		setTimeout(() => {
			this.#removeToast(id);
		}, actualDuration);

		// Animate in
		requestAnimationFrame(() => {
			toast.style.transform = "translateX(0)";
			toast.style.opacity = "1";
		});

		this.#metrics?.increment("toast.shown", { type });

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
	#createToast(id, message, type) {
		const toast = document.createElement("div");
		toast.className = `grid-toast grid-toast-${type}`;
		toast.setAttribute("data-toast-id", id);
		toast.setAttribute("role", "status");
		toast.setAttribute("aria-atomic", "true");

		// Set initial styles for animation
		toast.style.cssText = `
      background: ${this.#getBackgroundColor(type)};
      color: ${this.#getTextColor(type)};
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border-left: 4px solid ${this.#getBorderColor(type)};
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
		closeBtn.textContent = "×";
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
			this.#removeToast(id);
		});

		toast.appendChild(closeBtn);

		// Click to dismiss
		toast.addEventListener("click", (e) => {
			if (e.target !== closeBtn) {
				this.#removeToast(id);
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
	#getBackgroundColor(type) {
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
	#getTextColor(type) {
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
	#getBorderColor(type) {
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
	#removeToast(id) {
		const toast = this.#toasts.get(id);
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

			this.#metrics?.increment("toast.removed");
			this.#toasts.delete(id);
		}, 300);
	}

	/**
	 * Ensures that the number of displayed toasts does not exceed `maxToasts` by removing the oldest ones.
	 * @private
	 */
	#enforceMaxToasts() {
		const toastIds = Array.from(this.#toasts.keys());
		if (toastIds.length > this.#maxToasts) {
			// Remove oldest toasts
			const toRemove = toastIds.slice(
				0,
				toastIds.length - this.#maxToasts
			);
			toRemove.forEach((id) => this.#removeToast(id));
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
		return this.#showToast(message, "success", duration);
	}

	/**
	 * Displays an error-type toast notification.
	 * @public
	 * @param {string} message - The message to display.
	 * @param {number|null} [duration=null] - The duration in milliseconds.
	 * @returns {string} The ID of the toast.
	 */
	error(message, duration) {
		return this.#showToast(message, "error", duration);
	}

	/**
	 * Displays a warning-type toast notification.
	 * @public
	 * @param {string} message - The message to display.
	 * @param {number|null} [duration=null] - The duration in milliseconds.
	 * @returns {string} The ID of the toast.
	 */
	warning(message, duration) {
		return this.#showToast(message, "warning", duration);
	}

	/**
	 * Displays an info-type toast notification.
	 * @public
	 * @param {string} message - The message to display.
	 * @param {number|null} [duration=null] - The duration in milliseconds.
	 * @returns {string} The ID of the toast.
	 */
	info(message, duration) {
		return this.#showToast(message, "info", duration);
	}

	/**
	 * Clears all currently displayed toast notifications.
	 * @public
	 */
	clear() {
		Array.from(this.#toasts.keys()).forEach((id) => this.#removeToast(id));
	}

	/**
	 * Destroys the toast manager, clearing all toasts and removing its container from the DOM.
	 * @public
	 */
	destroy() {
		this.clear();
		this.#unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
		this.#unsubscribeFunctions = [];
		if (this.#container?.parentNode) {
			this.#container.parentNode.removeChild(this.#container);
		}
	}
}

export default GridToastManager;
