/**
 * @file CompleteGridSystem.js
 * @description Integrates all grid-related features into a single, cohesive system.
 * This class orchestrates the `EnhancedGridRenderer`, `GridPolicyHelper`, `GridToastManager`,
 * and the `AILayoutAssistant` to provide a fully-featured, modern grid experience.
 */

/* eslint-env browser */

import AILayoutAssistant from "./AILayoutAssistant.js";
import EnhancedGridRenderer from "./EnhancedGridRenderer.js";
import GridPolicyHelper, {
	extendSystemPoliciesWithGrid,
} from "./GridPolicyIntegration.js";
import { getToastManager } from "./GridToastManager.js";

/**
 * @class CompleteGridSystem
 * @classdesc Manages the complete, enhanced grid system by initializing and coordinating
 * all optional features like policy management, toast notifications, and the AI layout assistant.
 */
export class CompleteGridSystem {
	/**
	 * Creates an instance of CompleteGridSystem.
	 * @param {object} appViewModel - The main application view model, providing access to other systems.
	 * @param {object} [options={}] - Configuration options for the grid system.
	 * @param {string} [options.gridContainer=".grid-container"] - The CSS selector for the grid container element.
	 * @param {boolean} [options.enablePolicies=true] - Whether to enable grid-specific policy management.
	 * @param {boolean} [options.enableToasts=true] - Whether to enable toast notifications for grid events.
	 * @param {boolean} [options.enableAI=false] - Whether to enable the AI layout assistant (a future feature).
	 * @param {boolean} [options.enableAnalytics=true] - Whether to enable analytics tracking for grid interactions.
	 */
	constructor(appViewModel, options = {}) {
		this.appViewModel = appViewModel;
		this.options = {
			gridContainer: ".grid-container",
			enablePolicies: true,
			enableToasts: true,
			enableAI: false, // Future feature
			enableAnalytics: true,
			...options,
		};

		this.gridEnhancer = null;
		this.toastManager = null;
		this.aiAssistant = null;
		this.initialized = false;
		this.unsubscribeFunctions = [];

		this.init();
	}

	/**
	 * Initializes all configured subsystems of the grid system in the correct order.
	 * @private
	 * @returns {Promise<void>}
	 */
	async init() {
		try {
			// 1. Extend SystemPolicies with grid policies
			if (this.options.enablePolicies) {
				extendSystemPoliciesWithGrid();
			}

			// 2. Initialize toast manager
			if (this.options.enableToasts) {
				this.toastManager = getToastManager();
			}

			// 3. Initialize AI assistant if enabled
			if (this.options.enableAI && this.appViewModel.hybridStateManager) {
				this.aiAssistant = new AILayoutAssistant(
					this.appViewModel.hybridStateManager
				);
			}

			// 4. Initialize grid enhancer with all features
			await this.initializeGridEnhancer();

			// 5. Set up policy management UI
			this.setupPolicyControls();

			// 6. Set up analytics tracking
			if (this.options.enableAnalytics) {
				this.setupAnalytics();
			}

			this.initialized = true;
			console.log("Complete Grid System initialized with all features");

			// Show initialization success
			if (this.toastManager) {
				this.toastManager.success(
					"🎯 Enhanced grid system ready",
					3000
				);
			}
		} catch (error) {
			console.error("Failed to initialize complete grid system:", error);

			if (this.toastManager) {
				this.toastManager.error(
					"Failed to initialize grid enhancements",
					5000
				);
			}
		}
	}

	/**
	 * Initializes the `EnhancedGridRenderer` with all configured features and event listeners.
	 * @private
	 * @returns {Promise<void>}
	 */
	async initializeGridEnhancer() {
		const container =
			this.options.gridContainer instanceof HTMLElement
				? this.options.gridContainer
				: document.querySelector(this.options.gridContainer);
		if (!container) {
			throw new Error("Grid container not found");
		}

		this.gridEnhancer = new EnhancedGridRenderer(
			{
				container,
				appViewModel: this.appViewModel,
				options: {
					// Persistence with policy awareness
					onLayoutChange: (changeEvent) => {
						this.onLayoutChanged(changeEvent);
					},

					// Accessibility features
					enableKeyboard: true,
					enableAria: true,

					// Toast notifications
					enableToasts: this.options.enableToasts,

					// AI features (future)
					enableAI: this.options.enableAI,
				},
			},
			this.appViewModel.hybridStateManager
		);

		// Listen for grid events
		if (window.eventFlowEngine) {
			this.unsubscribeFunctions.push(
				window.eventFlowEngine.on(
					"gridEnhanced",
					this.onGridEnhanced.bind(this)
				)
			);
			this.unsubscribeFunctions.push(
				window.eventFlowEngine.on(
					"gridPerformanceMode",
					this.onPerformanceModeChanged.bind(this)
				)
			);

			if (this.options.enableAI) {
				this.unsubscribeFunctions.push(
					window.eventFlowEngine.on(
						"aiLayoutSuggestions",
						this.onAISuggestions.bind(this)
					)
				);
			}
		}
	}

	/**
	 * Handles layout change events by persisting them and feeding them to other subsystems.
	 * @private
	 * @param {object} changeEvent - The event data for the layout change.
	 */
	onLayoutChanged(changeEvent) {
		// Save to HybridStateManager
		if (this.appViewModel.hybridStateManager) {
			this.appViewModel.hybridStateManager.recordOperation({
				type: "grid_layout_change",
				data: changeEvent,
			});
		}

		// Track analytics
		if (this.options.enableAnalytics) {
			this.trackLayoutChange(changeEvent);
		}

		// Feed to AI assistant for pattern learning
		if (this.aiAssistant) {
			// AI assistant listens to layoutChanged events automatically
		}
	}

	/**
	 * Handles the event indicating that the grid enhancements are active.
	 * @private
	 * @param {object} data - The event data.
	 */
	onGridEnhanced(data) {
		console.log("Grid enhancement active");

		// Show current policy status
		this.showPolicyStatus();
	}

	/**
	 * Handles changes to the grid's performance mode.
	 * @private
	 * @param {object} data - The performance mode change event data.
	 */
	onPerformanceModeChanged(data) {
		console.log("Performance mode changed:", data);

		// Could update UI indicators, analytics, etc.
		if (this.options.enableAnalytics) {
			this.trackPerformanceMode(data);
		}
	}

	/**
	 * Handles the receipt of new AI-generated layout suggestions.
	 * @private
	 * @param {object} data - The event data containing the suggestions.
	 */
	onAISuggestions(data) {
		console.log("AI suggestions received:", data.suggestions);

		// Show suggestions in UI (future implementation)
		if (this.toastManager) {
			this.toastManager.info(
				`💡 ${data.suggestions.length} layout suggestions available`,
				5000
			);
		}
	}

	/**
	 * Creates and injects the UI panel for managing grid-related policies.
	 * @private
	 */
	setupPolicyControls() {
		// Add policy control panel to page
		const controlPanel = this.createPolicyControlPanel();

		// Find a good place to insert it (or create a floating panel)
		const sidebar = document.querySelector(".sidebar");
		if (sidebar) {
			sidebar.appendChild(controlPanel);
		} else {
			// Create floating panel
			controlPanel.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        padding: 16px;
        z-index: 1000;
        max-width: 250px;
      `;
			document.body.appendChild(controlPanel);
		}
	}

	/**
	 * Creates the HTML structure for the policy control panel.
	 * @private
	 * @returns {HTMLElement} The control panel element.
	 */
	createPolicyControlPanel() {
		const panel = document.createElement("div");
		panel.className = "grid-policy-panel";
		panel.innerHTML = `
      <h4>Grid Settings</h4>
      
      <div class="policy-control">
        <label>
          <input type="checkbox" id="perf-mode-toggle"> 
          Performance Mode
        </label>
        <small>Override automatic FPS-based switching</small>
      </div>
      
      <div class="policy-control">
        <label>
          <input type="checkbox" id="auto-save-toggle" checked> 
          Auto-save Layouts
        </label>
      </div>
      
      <div class="policy-control">
        <label>
          <input type="checkbox" id="save-feedback-toggle" checked> 
          Save Notifications
        </label>
      </div>
      
      <div class="policy-control">
        <label>
          <input type="checkbox" id="ai-suggestions-toggle"> 
          AI Suggestions <span class="badge">Future</span>
        </label>
      </div>
      
      <button id="reset-policies" class="btn-secondary">Reset to Defaults</button>
    `;

		// Add event listeners
		this.setupPolicyEventListeners(panel);

		// Load current policy states
		this.loadCurrentPolicyStates(panel);

		return panel;
	}

	/**
	 * Attaches event listeners to the controls within the policy panel.
	 * @private
	 * @param {HTMLElement} panel - The policy control panel element.
	 */
	setupPolicyEventListeners(panel) {
		const perfModeToggle = panel.querySelector("#perf-mode-toggle");
		const autoSaveToggle = panel.querySelector("#auto-save-toggle");
		const saveFeedbackToggle = panel.querySelector("#save-feedback-toggle");
		const aiSuggestionsToggle = panel.querySelector(
			"#ai-suggestions-toggle"
		);
		const resetButton = panel.querySelector("#reset-policies");

		perfModeToggle.addEventListener("change", async (e) => {
			const mode = e.target.checked ? true : null; // true = force on, null = auto
			await this.setPolicyWithFeedback(
				"system.grid_performance_mode",
				mode
			);
		});

		autoSaveToggle.addEventListener("change", async (e) => {
			await this.setPolicyWithFeedback(
				"system.grid_auto_save_layouts",
				e.target.checked
			);
		});

		saveFeedbackToggle.addEventListener("change", async (e) => {
			await this.setPolicyWithFeedback(
				"system.grid_save_feedback",
				e.target.checked
			);
		});

		aiSuggestionsToggle.addEventListener("change", async (e) => {
			await this.setPolicyWithFeedback(
				"system.grid_ai_suggestions",
				e.target.checked
			);

			if (e.target.checked && !this.aiAssistant) {
				// Initialize AI assistant when enabled
				this.aiAssistant = new AILayoutAssistant(
					this.appViewModel.hybridStateManager
				);
			}
		});

		resetButton.addEventListener("click", () => {
			this.resetPolicyDefaults();
		});
	}

	/**
	 * Sets a policy value and provides user feedback via a toast notification.
	 * @private
	 * @param {string} policyKey - The full key of the policy to set (e.g., 'system.grid_performance_mode').
	 * @param {*} value - The new value for the policy.
	 */
	async setPolicyWithFeedback(policyKey, value) {
		try {
			// Use GridPolicyHelper or direct context access
			await this.appViewModel.context.setPolicy(
				"system",
				policyKey.split(".")[1],
				value
			);

			if (this.toastManager) {
				this.toastManager.success(`Policy updated: ${policyKey}`, 2000);
			}
		} catch (error) {
			console.error("Failed to set policy:", error);

			if (this.toastManager) {
				this.toastManager.error(
					`Failed to update policy: ${policyKey}`,
					3000
				);
			}
		}
	}

	/**
	 * Loads the current state of all grid-related policies and updates the control panel UI.
	 * @private
	 * @param {HTMLElement} panel - The policy control panel element.
	 */
	loadCurrentPolicyStates(panel) {
		try {
			const policies = GridPolicyHelper.getGridPolicies(
				this.appViewModel?.context
			);

			panel.querySelector("#perf-mode-toggle").checked =
				policies.performanceMode === true;
			panel.querySelector("#auto-save-toggle").checked =
				policies.autoSave;
			panel.querySelector("#save-feedback-toggle").checked =
				policies.saveFeedback;
			panel.querySelector("#ai-suggestions-toggle").checked =
				policies.aiSuggestions;
		} catch (error) {
			console.warn("Could not load current policy states:", error);
		}
	}

	/**
	 * Displays a toast notification summarizing the status of currently active grid policies.
	 * @private
	 */
	showPolicyStatus() {
		try {
			const policies = GridPolicyHelper.getGridPolicies(
				this.appViewModel?.context
			);

			console.log("Current Grid Policies:", policies);

			if (this.toastManager) {
				const statusMessages = [];
				if (policies.performanceMode === true)
					statusMessages.push("🚀 Performance mode forced");
				if (policies.performanceMode === false)
					statusMessages.push("✨ Full features forced");
				if (!policies.autoSave)
					statusMessages.push("⚠️ Auto-save disabled");
				if (policies.aiSuggestions)
					statusMessages.push("🤖 AI suggestions enabled");

				if (statusMessages.length > 0) {
					this.toastManager.info(statusMessages.join(" • "), 4000);
				}
			}
		} catch (error) {
			console.warn("Could not show policy status:", error);
		}
	}

	/**
	 * Sets up event listeners to track grid interactions for analytics purposes.
	 * @private
	 */
	setupAnalytics() {
		// Track grid usage patterns
		if (window.eventFlowEngine) {
			this.unsubscribeFunctions.push(
				window.eventFlowEngine.on("layoutChanged", (data) => {
					this.trackLayoutChange(data);
				})
			);

			this.unsubscribeFunctions.push(
				window.eventFlowEngine.on("gridPerformanceMode", (data) => {
					this.trackPerformanceMode(data);
				})
			);

			this.unsubscribeFunctions.push(
				window.eventFlowEngine.on("policyChanged", (data) => {
					if (
						data.domain === "system" &&
						data.key.startsWith("grid_")
					) {
						this.trackPolicyChange(data);
					}
				})
			);
		}
	}

	/**
	 * Tracks a layout change event for analytics.
	 * @private
	 * @param {object} changeEvent - The layout change event data.
	 */
	trackLayoutChange(changeEvent) {
		// Analytics tracking for layout changes
		const analyticsEvent = {
			category: "grid_interaction",
			action: changeEvent.changeType,
			label: changeEvent.blockId,
			value: 1,
			customDimensions: {
				userId: changeEvent.userId,
				autoSaved: changeEvent.autoSaved,
				position: `${changeEvent.position.x},${changeEvent.position.y}`,
				size: `${changeEvent.position.w}x${changeEvent.position.h}`,
			},
		};

		// Emit for analytics system
		if (window.eventFlowEngine) {
			window.eventFlowEngine.emit("analyticsEvent", analyticsEvent);
		}
	}

	/**
	 * Tracks a performance mode change event for analytics.
	 * @private
	 * @param {object} data - The performance mode change event data.
	 */
	trackPerformanceMode(data) {
		if (window.eventFlowEngine) {
			window.eventFlowEngine.emit("analyticsEvent", {
				category: "grid_performance",
				action: data.enabled
					? "performance_mode_on"
					: "performance_mode_off",
				label: data.reason,
				value: data.fps || 0,
			});
		}
	}

	/**
	 * Tracks a policy change event for analytics.
	 * @private
	 * @param {object} data - The policy change event data.
	 */
	trackPolicyChange(data) {
		if (window.eventFlowEngine) {
			window.eventFlowEngine.emit("analyticsEvent", {
				category: "grid_policy",
				action: "policy_changed",
				label: data.key,
				value: data.value ? 1 : 0,
			});
		}
	}

	/**
	 * Resets all grid-related policies to their default values.
	 * @private
	 */
	resetPolicyDefaults() {
		// Reset all grid policies to defaults
		const defaults = {
			grid_performance_mode: null,
			grid_auto_save_layouts: true,
			grid_save_feedback: true,
			grid_ai_suggestions: false,
		};

		Object.entries(defaults).forEach(async ([key, value]) => {
			await this.setPolicyWithFeedback(`system.${key}`, value);
		});

		if (this.toastManager) {
			this.toastManager.success("Grid policies reset to defaults", 3000);
		}
	}

	// Public API

	/**
	 * Gets the initialized `EnhancedGridRenderer` instance.
	 * @public
	 * @returns {EnhancedGridRenderer|null}
	 */
	getGridEnhancer() {
		return this.gridEnhancer;
	}

	/**
	 * Gets the initialized `GridToastManager` instance.
	 * @public
	 * @returns {import('./GridToastManager.js').GridToastManager|null}
	 */
	getToastManager() {
		return this.toastManager;
	}

	/**
	 * Gets the initialized `AILayoutAssistant` instance.
	 * @public
	 * @returns {AILayoutAssistant|null}
	 */
	getAIAssistant() {
		return this.aiAssistant;
	}

	/**
	 * Checks if the complete grid system has been successfully initialized.
	 * @public
	 * @returns {boolean}
	 */
	isInitialized() {
		return this.initialized;
	}

	/**
	 * Cleans up all resources and event listeners used by the grid system.
	 * @public
	 */
	destroy() {
		if (this.gridEnhancer) {
			this.gridEnhancer.disable();
		}

		if (this.toastManager) {
			this.toastManager.destroy();
		}

		// Remove event listeners
		this.unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
		this.unsubscribeFunctions = [];
	}
}

// Convenience function for easy setup
/**
 * A convenience function to easily create and initialize an instance of the `CompleteGridSystem`.
 * @param {object} appViewModel - The main application view model.
 * @param {object} [options={}] - Configuration options for the grid system.
 * @returns {Promise<CompleteGridSystem>} A promise that resolves with the initialized grid system instance.
 */
export async function initializeCompleteGridSystem(appViewModel, options = {}) {
	const system = new CompleteGridSystem(appViewModel, options);
	return system;
}

export default CompleteGridSystem;
