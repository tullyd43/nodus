/**
 * @file CompleteGridSystem.js
 * @description Integrates all grid-related features into a single, cohesive system.
 * This class is a managed service, instantiated by the ServiceRegistry, and orchestrates all other grid-related services.
 */

import GridPolicyHelper, {
	extendSystemPoliciesWithGrid,
} from "./GridPolicyIntegration.js";

/**
 * @class CompleteGridSystem
 * @classdesc Manages the complete, enhanced grid system by initializing and coordinating
 * all managed grid services like policy management, toast notifications, and the AI layout assistant.
 * @privateFields {#stateManager, #options, #gridEnhancer, #toastManager, #aiAssistant, #initialized, #unsubscribeFunctions}
 * @privateFields {#stateManager, #appViewModel, #options, #gridEnhancer, #toastManager, #aiAssistant, #initialized, #unsubscribeFunctions}
 * @privateFields {#stateManager, #appViewModel, #options, #gridEnhancer, #toastManager, #aiAssistant, #gridPolicyService, #initialized, #unsubscribeFunctions}
 */
export class CompleteGridSystem {
	/** @private @type {import('../core/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('./EnhancedGridRenderer.js').EnhancedGridRenderer|null} */
	#gridEnhancer = null;
	/** @private @type {import('../utils/SystemToastManager.js').SystemToastManager|null} */
	#toastManager = null;
	/** @private @type {import('./AILayoutAssistant.js').AILayoutAssistant|null} */
	#aiAssistant = null;
	/** @private @type {object} */
	#options;
	/** @private @type {object} */
	#appViewModel; // V8.0 Parity: Add appViewModel as a private field.
	/** @private @type {boolean} */
	#initialized = false;
	/** @private @type {Function[]} */
	#unsubscribeFunctions = []; // V8.0 Parity: Declare private field.
	/** @private @type {GridPolicyService|null} */
	#gridPolicyService = null;

	/**
	 * Creates an instance of CompleteGridSystem.
	 * @param {object} context - The context object provided by the ServiceRegistry.
	 * @param {import('../core/HybridStateManager.js').default} context.stateManager - The application's state manager.
	 * @param {object} [options={}] - Configuration options for the grid system.
	 * @param {string} [options.gridContainer=".grid-container"] - The CSS selector for the grid container element.
	 * @param {object} [context.appViewModel] - The main application view model, if available.
	 * @param {boolean} [options.enablePolicies=true] - Whether to enable grid-specific policy management.
	 * @param {boolean} [options.enableToasts=true] - Whether to enable toast notifications for grid events.
	 * @param {boolean} [options.enableAI=true] - Whether to enable the AI layout assistant.
	 * @param {boolean} [options.enableAnalytics=true] - Whether to enable analytics tracking for grid interactions.
	 */
	constructor({ stateManager, appViewModel }, options = {}) {
		// V8.0 Parity: Accept appViewModel in constructor.
		this.#stateManager = stateManager;
		this.#appViewModel = appViewModel || {}; // V8.0 Parity: Assign appViewModel.

		// V8.0 Parity: Acquire all dependencies from the state manager.
		this.#toastManager = this.#stateManager.managers.toastManager;
		this.#aiAssistant = this.#stateManager.managers.aiLayoutAssistant;
		this.#gridEnhancer = this.#stateManager.managers.enhancedGridRenderer;
		this.#gridPolicyService = this.#stateManager.managers.gridPolicyService;

		this.#options = {
			gridContainer: ".grid-container",
			enablePolicies: true,
			enableToasts: true,
			enableAI: true,
			enableAnalytics: true,
			...options,
		};
	}

	/**
	 * Initializes all configured subsystems of the grid system in the correct order.
	 * @public
	 * @returns {Promise<void>}
	 */
	async initialize() {
		if (this.#initialized) {
			console.warn("CompleteGridSystem is already initialized.");
			return;
		}

		try {
			// 1. Extend SystemPolicies with grid policies
			if (this.#options.enablePolicies && this.#gridPolicyService) {
				this.#gridPolicyService.registerGridPolicies();
			}

			// 2. Initialize grid enhancer with all features
			await this.#initializeGridEnhancer();

			// 3. Set up policy management UI
			this.#setupPolicyControls();

			// 4. Set up analytics tracking
			if (this.#options.enableAnalytics) {
				this.#setupAnalytics();
			}

			this.#initialized = true;
			console.log("Complete Grid System initialized with all features");

			// Show initialization success
			if (this.#toastManager) {
				this.#toastManager.success(
					"🎯 Enhanced grid system ready",
					3000
				);
			}
		} catch (error) {
			console.error("Failed to initialize complete grid system:", error);

			if (this.#toastManager) {
				this.#toastManager.error(
					"Failed to initialize grid enhancements",
					5000
				);
			}
		}
	}

	/**
	 * Initializes the `EnhancedGridRenderer` with all configured features and event listeners.
	 * @private
	 */
	async #initializeGridEnhancer() {
		if (!this.#gridEnhancer) {
			throw new Error(
				"EnhancedGridRenderer not available from state manager."
			);
		}

		// V8.0 Parity: Initialize the EnhancedGridRenderer with its specific configuration.
		await this.#gridEnhancer.initialize({
			container: document.querySelector(this.#options.gridContainer),
			appViewModel: this.#appViewModel,
		});

		// Listen for layout changes to persist them
		this.#unsubscribeFunctions.push(
			this.#stateManager.eventFlowEngine.on(
				"layoutChanged",
				this.#onLayoutChanged.bind(this)
			)
		);

		// Listen for grid events
		if (this.#stateManager.eventFlowEngine) {
			this.#unsubscribeFunctions.push(
				this.#stateManager.eventFlowEngine.on(
					"gridEnhanced",
					this.#onGridEnhanced.bind(this)
				)
			);
			this.#unsubscribeFunctions.push(
				this.#stateManager.eventFlowEngine.on(
					"gridPerformanceMode",
					this.#onPerformanceModeChanged.bind(this)
				)
			);

			if (this.#options.enableAI) {
				this.#unsubscribeFunctions.push(
					this.#stateManager.eventFlowEngine.on(
						"aiLayoutSuggestions",
						this.#onAISuggestions.bind(this)
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
	#onLayoutChanged(changeEvent) {
		// Save to HybridStateManager
		this.#stateManager.recordOperation({
			type: "grid_layout_change",
			data: changeEvent,
		});

		// Track analytics
		if (this.#options.enableAnalytics) {
			this.#trackLayoutChange(changeEvent);
		}
	}

	/**
	 * Handles the event indicating that the grid enhancements are active.
	 * @private
	 * @param {object} data - The event data.
	 */
	#onGridEnhanced(data) {
		console.log("Grid enhancement active");

		// Show current policy status
		this.#showPolicyStatus();
	}

	/**
	 * Handles changes to the grid's performance mode.
	 * @private
	 * @param {object} data - The performance mode change event data.
	 */
	#onPerformanceModeChanged(data) {
		console.log("Performance mode changed:", data);

		// Could update UI indicators, analytics, etc.
		if (this.#options.enableAnalytics) {
			this.#trackPerformanceMode(data);
		}
	}

	/**
	 * Handles the receipt of new AI-generated layout suggestions.
	 * @private
	 * @param {object} data - The event data containing the suggestions.
	 */
	#onAISuggestions(data) {
		console.log("AI suggestions received:", data.suggestions);

		// Show suggestions in UI (future implementation)
		if (this.#toastManager) {
			this.#toastManager.info(
				`💡 ${data.suggestions.length} layout suggestions available`,
				5000
			);
		}
	}

	/**
	 * Creates and injects the UI panel for managing grid-related policies.
	 * @private
	 */
	#setupPolicyControls() {
		// Add policy control panel to page
		const controlPanel = this.#createPolicyControlPanel();

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
	#createPolicyControlPanel() {
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
		this.#setupPolicyEventListeners(panel);

		// Load current policy states
		this.#loadCurrentPolicyStates(panel);

		return panel;
	}

	/**
	 * Attaches event listeners to the controls within the policy panel.
	 * @private
	 * @param {HTMLElement} panel - The policy control panel element.
	 */
	#setupPolicyEventListeners(panel) {
		const perfModeToggle = panel.querySelector("#perf-mode-toggle");
		const autoSaveToggle = panel.querySelector("#auto-save-toggle");
		const saveFeedbackToggle = panel.querySelector("#save-feedback-toggle");
		const aiSuggestionsToggle = panel.querySelector(
			"#ai-suggestions-toggle"
		);
		const resetButton = panel.querySelector("#reset-policies");

		perfModeToggle.addEventListener("change", async (e) => {
			const mode = e.target.checked ? true : null; // true = force on, null = auto
			await this.#setPolicyWithFeedback(
				"system.grid_performance_mode",
				mode
			);
		});

		autoSaveToggle.addEventListener("change", async (e) => {
			await this.#setPolicyWithFeedback(
				"system.grid_auto_save_layouts",
				e.target.checked
			);
		});

		saveFeedbackToggle.addEventListener("change", async (e) => {
			await this.#setPolicyWithFeedback(
				"system.grid_save_feedback",
				e.target.checked
			);
		});

		aiSuggestionsToggle.addEventListener("change", async (e) => {
			await this.#setPolicyWithFeedback(
				"system.grid_ai_suggestions",
				e.target.checked
			);

			if (e.target.checked && !this.#aiAssistant) {
				this.#aiAssistant =
					this.#stateManager.managers.aiLayoutAssistant;
			}
		});

		resetButton.addEventListener("click", () => {
			this.#resetPolicyDefaults();
		});
	}

	/**
	 * Sets a policy value and provides user feedback via a toast notification.
	 * @private
	 * @param {string} policyKey - The full key of the policy to set (e.g., 'system.grid_performance_mode').
	 * @param {*} value - The new value for the policy.
	 */
	async #setPolicyWithFeedback(policyKey, value) {
		try {
			// Use GridPolicyHelper or direct context access
			const [domain, key] = policyKey.split(".");
			await this.#stateManager.managers.policies.setPolicy(
				domain,
				key,
				value
			);

			if (this.#toastManager) {
				this.#toastManager.success(
					`Policy updated: ${policyKey}`,
					2000
				);
			}
		} catch (error) {
			console.error("Failed to set policy:", error);

			if (this.#toastManager) {
				this.#toastManager.error(
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
	#loadCurrentPolicyStates(panel) {
		try {
			const policies = GridPolicyHelper.getGridPolicies(
				this.#stateManager.managers.policies
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
	#showPolicyStatus() {
		try {
			const policies = GridPolicyHelper.getGridPolicies(
				this.#stateManager.managers.policies
			);

			console.log("Current Grid Policies:", policies);

			if (this.#toastManager) {
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
					this.#toastManager.info(statusMessages.join(" • "), 4000);
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
	#setupAnalytics() {
		// Track grid usage patterns
		if (this.#stateManager.eventFlowEngine) {
			this.#unsubscribeFunctions.push(
				this.#stateManager.eventFlowEngine.on(
					"layoutChanged",
					(data) => {
						this.#trackLayoutChange(data);
					}
				)
			);

			this.#unsubscribeFunctions.push(
				this.#stateManager.eventFlowEngine.on(
					"gridPerformanceMode",
					(data) => {
						this.#trackPerformanceMode(data);
					}
				)
			);

			this.#unsubscribeFunctions.push(
				this.#stateManager.eventFlowEngine.on(
					"policyChanged",
					(data) => {
						if (
							data.domain === "system" &&
							data.key.startsWith("grid_")
						) {
							this.#trackPolicyChange(data);
						}
					}
				)
			);
		}
	}

	/**
	 * Tracks a layout change event for analytics.
	 * @private
	 * @param {object} changeEvent - The layout change event data.
	 */
	#trackLayoutChange(changeEvent) {
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
		if (this.#stateManager.eventFlowEngine) {
			this.#stateManager.eventFlowEngine.emit(
				"analyticsEvent",
				analyticsEvent
			);
		}
	}

	/**
	 * Tracks a performance mode change event for analytics.
	 * @private
	 * @param {object} data - The performance mode change event data.
	 */
	#trackPerformanceMode(data) {
		if (this.#stateManager.eventFlowEngine) {
			this.#stateManager.eventFlowEngine.emit("analyticsEvent", {
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
	#trackPolicyChange(data) {
		if (this.#stateManager.eventFlowEngine) {
			this.#stateManager.eventFlowEngine.emit("analyticsEvent", {
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
	#resetPolicyDefaults() {
		// Reset all grid policies to defaults
		const defaults = {
			grid_performance_mode: null,
			grid_auto_save_layouts: true,
			grid_save_feedback: true,
			grid_ai_suggestions: false,
		};

		Object.entries(defaults).forEach(async ([key, value]) => {
			await this.#setPolicyWithFeedback(`system.${key}`, value);
		});

		if (this.#toastManager) {
			this.#toastManager.success("Grid policies reset to defaults", 3000);
		}
	}

	// Public API

	isInitialized() {
		return this.#initialized;
	}

	/**
	 * Cleans up all resources and event listeners used by the grid system.
	 * @public
	 */
	destroy() {
		if (this.#gridEnhancer) {
			this.#gridEnhancer.disable();
		}

		if (this.#toastManager) {
			this.#toastManager.destroy();
		}

		// Remove event listeners
		this.#unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
		this.#unsubscribeFunctions = [];
	}
}

export default CompleteGridSystem;
