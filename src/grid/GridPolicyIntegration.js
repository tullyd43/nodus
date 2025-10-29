/**
 * SystemPolicies Integration for Grid Enhancement
 * Extends the existing SystemPolicies_Cached.js with grid-specific policies
 * Follows the existing caching and validation patterns
 */

// Grid-specific policy definitions to add to existing POLICY_DEFINITIONS
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

// Grid-specific policy validators to add to existing POLICY_VALIDATORS
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
      return { valid: false, message: "Grid save feedback must be boolean" };
    }
    return { valid: true };
  },

  "system.grid_ai_suggestions": (value, context) => {
    if (typeof value !== "boolean") {
      return { valid: false, message: "Grid AI suggestions must be boolean" };
    }
    // Future: Check if AI features are available
    return { valid: true };
  },
};

// Grid-specific policy dependencies
export const GRID_POLICY_DEPENDENCIES = {
  "system.grid_performance_mode": ["system.enable_monitoring"],
  "system.grid_auto_save_layouts": ["system.enable_auditing"],
  "system.grid_ai_suggestions": [
    "system.enable_monitoring",
    "meta.enable_performance_tracking",
  ],
};

/**
 * Enhanced Grid Policy Helper
 * Integrates with existing SystemPolicies_Cached pattern
 */
export class GridPolicyHelper {
  static cache = new Map(); // Local cache for grid-specific policies
  static lastCacheTime = 0;
  static CACHE_TTL = 30000; // 30 seconds

  /**
   * Get grid performance mode policy with smart defaults
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
   * Check if auto-save is enabled
   */
  static isAutoSaveEnabled(context) {
    try {
      return context.getBooleanPolicy("system", "grid_auto_save_layouts", true);
    } catch (error) {
      console.warn("Could not get grid auto-save policy:", error);
      return true; // Default to enabled
    }
  }

  /**
   * Check if save feedback should be shown
   */
  static shouldShowSaveFeedback(context) {
    try {
      return context.getBooleanPolicy("system", "grid_save_feedback", true);
    } catch (error) {
      console.warn("Could not get grid save feedback policy:", error);
      return true; // Default to enabled
    }
  }

  /**
   * Check if AI suggestions are enabled (future feature)
   */
  static isAiSuggestionsEnabled(context) {
    try {
      return context.getBooleanPolicy("system", "grid_ai_suggestions", false);
    } catch (error) {
      console.warn("Could not get grid AI suggestions policy:", error);
      return false; // Default to disabled
    }
  }

  /**
   * Set grid performance mode policy
   */
  static async setPerformanceMode(context, mode) {
    try {
      await context.setPolicy("system", "grid_performance_mode", mode);

      // Clear cache to force refresh
      this.cache.clear();

      // Emit policy change event for real-time updates
      if (typeof EventBus !== "undefined") {
        EventBus.emit("policyChanged", {
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
   * Get all grid-related policies at once (cached)
   */
  static getGridPolicies(context) {
    const now = Date.now();
    const cacheKey = "grid_policies";

    // Check cache first
    if (this.cache.has(cacheKey) && now - this.lastCacheTime < this.CACHE_TTL) {
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
   * Clear the policy cache (call when policies change)
   */
  static clearCache() {
    this.cache.clear();
    this.lastCacheTime = 0;
  }
}

/**
 * Integration function to extend existing SystemPolicies
 * Call this during system initialization
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
