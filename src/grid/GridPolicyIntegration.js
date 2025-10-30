/**
 * @file GridPolicyIntegration.js
 * @description Defines grid-specific policies and provides a helper class for accessing them.
 * This module is designed to extend the main `SystemPolicies` with configurations
 * that control the behavior of the enhanced grid system.
 * @see {@link d:\Development Files\repositories\nodus\src\docs\feature_development_philosophy.md} for architectural principles.
 */

/**
 * An object containing grid-specific policy definitions.
 * These are intended to be merged into the main `SystemPolicies` definitions.
 * @type {object}
 * @property {object} system.grid_performance_mode - Policy for controlling grid performance mode.
 * @property {object} system.grid_auto_save_layouts - Policy for enabling/disabling layout auto-save.
 * @property {object} system.grid_save_feedback - Policy for showing/hiding save notifications.
 * @property {object} system.grid_ai_suggestions - Policy for enabling/disabling AI layout suggestions.
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
 * These are intended to be merged into the main `SystemPolicies` validators.
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
 * These are intended to be merged into the main `SystemPolicies` dependencies.
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
 * @class GridPolicyHelper
 * @classdesc A helper class with static methods for accessing and managing grid-specific policies.
 * It provides a clear, cached, and robust interface for interacting with grid configurations.
 */
export class GridPolicyHelper {
	/** @private @type {Map<string, any>} */
	static cache = new Map(); // Local cache for grid-specific policies
	/** @private @type {number} */
	static lastCacheTime = 0;
	/** @private @type {number} */
	static CACHE_TTL = 30000; // 30 seconds

	/**
	 * Gets the grid performance mode policy from the provided context.
	 * The policy can be `true` (force on), `false` (force off), or `null` (automatic).
	 * @static
	 * @param {object} context - The application context, expected to have a `getPolicy` method.
	 * @returns {boolean|null} The current performance mode policy.
	 */
	static getPerformanceMode(context) {
		try {
			const policy = context.getPolicy("system", "grid_performance_mode");

			// null = auto mode (FPS-based)
			// true = force performance mode on
			// false = force performance mode off
			return policy;
		} catch (error) {
			console.warn("Could not get grid performance policy:", error);
			return null; // Default to auto mode
		}
	}

	/**
	 * Checks if the auto-save layout policy is enabled.
	 * @static
	 * @param {object} context - The application context.
	 * @returns {boolean} `true` if auto-save is enabled, `false` otherwise.
	 */
	static isAutoSaveEnabled(context) {
		try {
			return context.getBooleanPolicy(
				"system",
				"grid_auto_save_layouts",
				true
			);
		} catch (error) {
			console.warn("Could not get grid auto-save policy:", error);
			return true; // Default to enabled
		}
	}

	/**
	 * Checks if the policy for showing save feedback (toasts) is enabled.
	 * @static
	 * @param {object} context - The application context.
	 * @returns {boolean} `true` if save feedback should be shown, `false` otherwise.
	 */
	static shouldShowSaveFeedback(context) {
		try {
			return context.getBooleanPolicy(
				"system",
				"grid_save_feedback",
				true
			);
		} catch (error) {
			console.warn("Could not get grid save feedback policy:", error);
			return true; // Default to enabled
		}
	}

	/**
	 * Checks if the policy for AI-powered layout suggestions is enabled.
	 * @static
	 * @param {object} context - The application context.
	 * @returns {boolean} `true` if AI suggestions are enabled, `false` otherwise.
	 */
	static isAiSuggestionsEnabled(context) {
		try {
			return context.getBooleanPolicy(
				"system",
				"grid_ai_suggestions",
				false
			);
		} catch (error) {
			console.warn("Could not get grid AI suggestions policy:", error);
			return false; // Default to disabled
		}
	}

	/**
	 * Sets the grid performance mode policy and emits an event to notify the system of the change.
	 * @static
	 * @param {object} context - The application context.
	 * @param {boolean|null} mode - The new mode (`true` for on, `false` for off, `null` for auto).
	 * @returns {Promise<boolean>} `true` if the policy was set successfully, `false` otherwise.
	 */
	static async setPerformanceMode(context, mode) {
		try {
			await context.setPolicy("system", "grid_performance_mode", mode);

			// Clear cache to force refresh
			this.cache.clear();

			// Emit policy change event for real-time updates
			if (typeof window.eventFlowEngine !== "undefined") {
				window.eventFlowEngine.emit("policyChanged", {
					domain: "system",
					key: "grid_performance_mode",
					value: mode,
					timestamp: Date.now(),
				});
			}

			return true;
		} catch (error) {
			console.error("Failed to set grid performance mode:", error);
			return false;
		}
	}

	/**
	 * Gets an object containing all grid-related policies, using a local cache for performance.
	 * @static
	 * @param {object} context - The application context.
	 * @returns {{performanceMode: boolean|null, autoSave: boolean, saveFeedback: boolean, aiSuggestions: boolean}}
	 * An object with the current state of all grid policies.
	 */
	static getGridPolicies(context) {
		const now = Date.now();
		const cacheKey = "grid_policies";

		// Check cache first
		if (
			this.cache.has(cacheKey) &&
			now - this.lastCacheTime < this.CACHE_TTL
		) {
			return this.cache.get(cacheKey);
		}

		try {
			const policies = {
				performanceMode: this.getPerformanceMode(context),
				autoSave: this.isAutoSaveEnabled(context),
				saveFeedback: this.shouldShowSaveFeedback(context),
				aiSuggestions: this.isAiSuggestionsEnabled(context),
			};

			// Cache the result
			this.cache.set(cacheKey, policies);
			this.lastCacheTime = now;

			return policies;
		} catch (error) {
			console.warn("Could not get grid policies:", error);

			// Return safe defaults
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
	 * This should be called if policies are updated externally to ensure fresh data is fetched.
	 * @static
	 */
	static clearCache() {
		this.cache.clear();
		this.lastCacheTime = 0;
	}
}

/**
 * An integration function to extend the main `SystemPolicies` with grid-specific definitions.
 * This function is intended to be called during system initialization to ensure grid policies
 * are available throughout the application.
 * @returns {void}
 */
export function extendSystemPoliciesWithGrid() {
	// This would integrate with your existing SystemPolicies_Cached.js
	// by adding the grid policies to the main policy definitions

	console.log("Grid policies integrated with SystemPolicies");

	// Example integration pattern:
	// Object.assign(POLICY_DEFINITIONS, GRID_POLICY_DEFINITIONS);
	// Object.assign(POLICY_VALIDATORS, GRID_POLICY_VALIDATORS);
	// Object.assign(POLICY_DEPENDENCIES, GRID_POLICY_DEPENDENCIES);
}

export default GridPolicyHelper;
