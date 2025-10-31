/**
 * @file GridPolicyIntegration.js
 * @description Defines grid-specific policies and provides a managed service for accessing them. This module extends the main `SystemPolicies` with configurations that control the behavior of the enhanced grid system.
 * @see {@link d:\Development Files\repositories\nodus\src\docs\feature_development_philosophy.md} for architectural principles.
 */

/**
 * An object containing grid-specific policy definitions.
 * These are merged into the main `SystemPolicies` definitions during system initialization.
 */
export const GRID_POLICY_DEFINITIONS = {
	"system.grid_performance_mode": {
		type: "boolean",
		default: null, // null = auto mode, true = force on, false = force off
		domain: "system",
		description:
			"Force grid performance mode on/off (null = auto based on FPS)",
		category: "performance",
	},
	"system.grid_auto_save_layouts": {
		type: "boolean",
		default: true,
		domain: "system",
		description: "Automatically save grid layout changes",
		category: "persistence",
	},
	"system.grid_save_feedback": {
		type: "boolean",
		default: true,
		domain: "system",
		description: "Show toast notifications when layouts are saved",
		category: "user_experience",
	},
	"system.grid_ai_suggestions": {
		type: "boolean",
		default: false,
		domain: "system",
		description: "Enable AI-powered layout suggestions (future feature)",
		category: "ai_assistance",
	},
};

/**
 * An object containing validation functions for the grid-specific policies.
 * @type {object}
 */
export const GRID_POLICY_VALIDATORS = {
	"system.grid_performance_mode": (value, context) => {
		if (value !== null && typeof value !== "boolean") {
			return {
				valid: false,
				message: "Grid performance mode must be null, true, or false",
			};
		}
		return { valid: true };
	},

	"system.grid_auto_save_layouts": (value, context) => {
		if (typeof value !== "boolean") {
			return { valid: false, message: "Grid auto-save must be boolean" };
		}
		return { valid: true };
	},

	"system.grid_save_feedback": (value, context) => {
		if (typeof value !== "boolean") {
			return {
				valid: false,
				message: "Grid save feedback must be boolean",
			};
		}
		return { valid: true };
	},

	"system.grid_ai_suggestions": (value, context) => {
		if (typeof value !== "boolean") {
			return {
				valid: false,
				message: "Grid AI suggestions must be boolean",
			};
		}
		// Future: Check if AI features are available
		return { valid: true };
	},
};

/**
 * An object defining dependencies for grid-specific policies.
 * @type {object}
 */
export const GRID_POLICY_DEPENDENCIES = {
	"system.grid_performance_mode": ["system.enable_monitoring"],
	"system.grid_auto_save_layouts": ["system.enable_auditing"],
	"system.grid_ai_suggestions": [
		"system.enable_monitoring",
		"meta.enable_performance_tracking",
	],
};

/**
 * @class GridPolicyService
 * @classdesc A managed service for accessing and managing grid-specific policies. It provides a clear, cached, and robust interface for interacting with grid configurations, adhering to V8 Parity Mandates.
 * @privateFields {#policyManager, #cache}
 */
export class GridPolicyService {
	/** @private @type {import('../core/SystemPolicies_Cached.js').SystemPolicies} */
	#policyManager;
	/** @private @type {import('../managers/CacheManager.js').LRUCache} */
	#cache;

	/**
	 * Creates an instance of GridPolicyService.
	 * @param {object} context - The context object from the ServiceRegistry.
	 * @param {import('../core/HybridStateManager.js').default} context.stateManager - The application's state manager.
	 */
	constructor({ stateManager }) {
		this.#policyManager = stateManager.managers.policies;

		// Mandate 4.1: Use a bounded cache from the central CacheManager.
		this.#cache = stateManager.managers.cacheManager.getCache(
			"gridPolicies",
			{
				max: 10, // Cache up to 10 policy sets/keys
				ttl: 30000, // 30-second TTL
			}
		);
	}

	/**
	 * Registers the grid-specific policies, validators, and dependencies with the main SystemPolicies manager.
	 * This is the V8 Parity-compliant replacement for the old `extendSystemPoliciesWithGrid` function.
	 * @returns {void}
	 */
	registerGridPolicies() {
		if (!this.#policyManager) {
			console.warn(
				"[GridPolicyService] Cannot register policies, SystemPolicies manager not found."
			);
			return;
		}

		this.#policyManager.registerPolicyDefinitions(GRID_POLICY_DEFINITIONS);
		this.#policyManager.registerPolicyValidators(GRID_POLICY_VALIDATORS);
	}

	/**
	 * Gets the grid performance mode policy.
	 * The policy can be `true` (force on), `false` (force off), or `null` (automatic).
	 * @returns {boolean|null} The current performance mode policy.
	 */
	getPerformanceMode() {
		try {
			return this.#policyManager.getPolicy(
				"system",
				"grid_performance_mode"
			);
		} catch (error) {
			console.warn("Could not get grid performance policy:", error);
			return null; // Default to auto mode
		}
	}

	/**
	 * Checks if the auto-save layout policy is enabled.
	 * @returns {boolean} `true` if auto-save is enabled, `false` otherwise.
	 */
	isAutoSaveEnabled() {
		try {
			const policy = this.#policyManager.getPolicy(
				"system",
				"grid_auto_save_layouts"
			);
			return policy ?? true;
		} catch (error) {
			console.warn("Could not get grid auto-save policy:", error);
			return true; // Default to enabled
		}
	}

	/**
	 * Checks if the policy for showing save feedback (toasts) is enabled.
	 * @returns {boolean} `true` if save feedback should be shown, `false` otherwise.
	 */
	shouldShowSaveFeedback() {
		try {
			const policy = this.#policyManager.getPolicy(
				"system",
				"grid_save_feedback"
			);
			return policy ?? true;
		} catch (error) {
			console.warn("Could not get grid save feedback policy:", error);
			return true; // Default to enabled
		}
	}

	/**
	 * Checks if the policy for AI-powered layout suggestions is enabled.
	 * @returns {boolean} `true` if AI suggestions are enabled, `false` otherwise.
	 */
	isAiSuggestionsEnabled() {
		try {
			const policy = this.#policyManager.getPolicy(
				"system",
				"grid_ai_suggestions"
			);
			return policy ?? false;
		} catch (error) {
			console.warn("Could not get grid AI suggestions policy:", error);
			return false; // Default to disabled
		}
	}

	/**
	 * Sets the grid performance mode policy and emits an event to notify the system of the change.
	 * @param {boolean|null} mode - The new mode (`true` for on, `false` for off, `null` for auto).
	 * @returns {Promise<boolean>} `true` if the policy was set successfully, `false` otherwise.
	 */
	async setPerformanceMode(mode) {
		try {
			await this.#policyManager.setPolicy(
				"system",
				"grid_performance_mode",
				mode
			);

			// Clear cache to force refresh
			this.clearCache();

			// Event is emitted by SystemPolicies automatically, no need to re-emit.
			return true;
		} catch (error) {
			console.error("Failed to set grid performance mode:", error);
			return false;
		}
	}

	/**
	 * Gets an object containing all grid-related policies, using a bounded LRU cache for performance.
	 * @returns {{performanceMode: boolean|null, autoSave: boolean, saveFeedback: boolean, aiSuggestions: boolean}}
	 * An object with the current state of all grid policies.
	 */
	getGridPolicies() {
		const cacheKey = "grid_policies";
		const cachedPolicies = this.#cache.get(cacheKey);

		// Check cache first
		if (cachedPolicies) {
			return cachedPolicies;
		}

		try {
			const policies = {
				performanceMode: this.getPerformanceMode(),
				autoSave: this.isAutoSaveEnabled(),
				saveFeedback: this.shouldShowSaveFeedback(),
				aiSuggestions: this.isAiSuggestionsEnabled(),
			};

			// Cache the result
			this.#cache.set(cacheKey, policies);

			return policies;
		} catch (error) {
			console.warn("Could not get grid policies:", error);

			return {
				performanceMode: null,
				autoSave: true,
				saveFeedback: true,
				aiSuggestions: false,
			};
		}
	}

	/**
	 * Clears the local cache for grid-specific policies.
	 */
	clearCache() {
		this.#cache.clear();
	}
}

/**
 * Renaming the default export for clarity and to avoid confusion with the old static helper.
 * The class itself is the primary export.
 */
export default GridPolicyService;
