/**
 * MetricsRegistry.js
 * Central registry defining available metrics, units, thresholds, and policies for Nodus V7.1
 * Used by DatabaseOptimizer, PerformanceOverlayBlock, MetricsReporter, and analytics dashboards
 */

export class MetricsRegistry {
  constructor() {
    // Define all known metrics and their metadata
    this.registry = new Map([
      // UI Performance Metrics
      [
        "ui_performance_fps",
        {
          name: "UI Frame Rate",
          unit: "fps",
          description: "Average frames per second measured from RenderMetrics",
          domain: "ui",
          category: "performance",
          minAcceptable: 24,
          target: 60,
          maxExpected: 120,
          format: (value) => `${Math.round(value)} FPS`,
          policy: { analytics: true, audit: false, ai: true },
        },
      ],
      [
        "ui_render_latency",
        {
          name: "Render Latency",
          unit: "ms",
          description: "Average time to render components and UI elements",
          domain: "ui",
          category: "latency",
          minAcceptable: 0,
          target: 16,
          maxExpected: 100,
          format: (value) => `${value.toFixed(1)}ms`,
          policy: { analytics: true, audit: true, ai: true },
        },
      ],
      [
        "ui_layout_latency",
        {
          name: "Layout Latency",
          unit: "ms",
          description: "Time to render and commit a new layout or grid block",
          domain: "ui",
          category: "latency",
          minAcceptable: 0,
          target: 16,
          maxExpected: 50,
          format: (value) => `${value.toFixed(1)}ms`,
          policy: { analytics: true, audit: true, ai: true },
        },
      ],
      [
        "ui_interaction_latency",
        {
          name: "Interaction Latency",
          unit: "ms",
          description: "Response time between user input and UI update",
          domain: "ui",
          category: "latency",
          minAcceptable: 0,
          target: 50,
          maxExpected: 200,
          format: (value) => `${value.toFixed(1)}ms`,
          policy: { analytics: true, audit: true, ai: true },
        },
      ],
      [
        "ui_cumulative_layout_shift",
        {
          name: "Cumulative Layout Shift",
          unit: "score",
          description: "Measure of visual stability during page interactions",
          domain: "ui",
          category: "stability",
          minAcceptable: 0,
          target: 0.1,
          maxExpected: 0.5,
          format: (value) => value.toFixed(3),
          policy: { analytics: true, audit: false, ai: true },
        },
      ],

      // System Performance Metrics
      [
        "system_cache_hit_rate",
        {
          name: "Cache Hit Rate",
          unit: "%",
          description: "Ratio of cache hits to total cache lookups",
          domain: "system",
          category: "performance",
          minAcceptable: 70,
          target: 95,
          maxExpected: 100,
          format: (value) => `${Math.round(value)}%`,
          policy: { analytics: true, audit: false, ai: true },
        },
      ],
      [
        "system_memory_usage",
        {
          name: "JavaScript Memory Usage",
          unit: "MB",
          description: "Amount of JavaScript heap memory being used",
          domain: "system",
          category: "resource",
          minAcceptable: 0,
          target: 50,
          maxExpected: 200,
          format: (value) => `${(value / (1024 * 1024)).toFixed(1)}MB`,
          policy: { analytics: true, audit: false, ai: false },
        },
      ],
      [
        "system_database_query_latency",
        {
          name: "Database Query Latency",
          unit: "ms",
          description:
            "Average query execution time from DatabaseOptimizer logs",
          domain: "system",
          category: "latency",
          minAcceptable: 0,
          target: 30,
          maxExpected: 500,
          format: (value) => `${value.toFixed(1)}ms`,
          policy: { analytics: true, audit: true, ai: true },
        },
      ],
      [
        "system_network_latency",
        {
          name: "Network Request Latency",
          unit: "ms",
          description: "Average network request response time",
          domain: "system",
          category: "latency",
          minAcceptable: 0,
          target: 100,
          maxExpected: 2000,
          format: (value) => `${value.toFixed(0)}ms`,
          policy: { analytics: true, audit: false, ai: true },
        },
      ],

      // Grid-Specific Metrics
      [
        "grid_drag_latency",
        {
          name: "Grid Drag Latency",
          unit: "ms",
          description: "Response time for grid drag operations",
          domain: "grid",
          category: "interaction",
          minAcceptable: 0,
          target: 16,
          maxExpected: 50,
          format: (value) => `${value.toFixed(1)}ms`,
          policy: { analytics: true, audit: true, ai: true },
        },
      ],
      [
        "grid_resize_latency",
        {
          name: "Grid Resize Latency",
          unit: "ms",
          description: "Response time for grid resize operations",
          domain: "grid",
          category: "interaction",
          minAcceptable: 0,
          target: 16,
          maxExpected: 50,
          format: (value) => `${value.toFixed(1)}ms`,
          policy: { analytics: true, audit: true, ai: true },
        },
      ],
      [
        "grid_layout_save_latency",
        {
          name: "Grid Layout Save Latency",
          unit: "ms",
          description: "Time to persist grid layout changes",
          domain: "grid",
          category: "persistence",
          minAcceptable: 0,
          target: 50,
          maxExpected: 200,
          format: (value) => `${value.toFixed(1)}ms`,
          policy: { analytics: true, audit: true, ai: false },
        },
      ],

      // Error and Reliability Metrics
      [
        "system_error_count",
        {
          name: "Error Count",
          unit: "count",
          description: "Total number of captured errors in the current session",
          domain: "system",
          category: "reliability",
          minAcceptable: 0,
          target: 0,
          maxExpected: 10,
          format: (value) => `${Math.round(value)} errors`,
          policy: { analytics: true, audit: true, ai: true },
        },
      ],
      [
        "system_error_rate",
        {
          name: "Error Rate",
          unit: "%",
          description: "Percentage of operations that result in errors",
          domain: "system",
          category: "reliability",
          minAcceptable: 0,
          target: 0,
          maxExpected: 5,
          format: (value) => `${value.toFixed(2)}%`,
          policy: { analytics: true, audit: true, ai: true },
        },
      ],

      // User Experience Metrics
      [
        "ux_time_to_interactive",
        {
          name: "Time to Interactive",
          unit: "ms",
          description: "Time until the page is fully interactive",
          domain: "ux",
          category: "loading",
          minAcceptable: 0,
          target: 3000,
          maxExpected: 10000,
          format: (value) => `${(value / 1000).toFixed(1)}s`,
          policy: { analytics: true, audit: false, ai: true },
        },
      ],
      [
        "ux_first_contentful_paint",
        {
          name: "First Contentful Paint",
          unit: "ms",
          description: "Time until first content is painted",
          domain: "ux",
          category: "loading",
          minAcceptable: 0,
          target: 1000,
          maxExpected: 4000,
          format: (value) => `${(value / 1000).toFixed(1)}s`,
          policy: { analytics: true, audit: false, ai: true },
        },
      ],

      // Business Metrics
      [
        "business_user_actions_per_minute",
        {
          name: "User Actions per Minute",
          unit: "actions/min",
          description: "Rate of user interactions with the system",
          domain: "business",
          category: "engagement",
          minAcceptable: 0,
          target: 10,
          maxExpected: 100,
          format: (value) => `${value.toFixed(1)} actions/min`,
          policy: { analytics: true, audit: false, ai: true },
        },
      ],
      [
        "business_session_duration",
        {
          name: "Session Duration",
          unit: "minutes",
          description: "Average user session length",
          domain: "business",
          category: "engagement",
          minAcceptable: 0,
          target: 15,
          maxExpected: 120,
          format: (value) => `${Math.round(value)} min`,
          policy: { analytics: true, audit: false, ai: true },
        },
      ],
    ]);

    // Performance tiers for quick classification
    this.performanceTiers = {
      excellent: { fps: 60, latency: 16, cacheHit: 95 },
      good: { fps: 45, latency: 33, cacheHit: 85 },
      fair: { fps: 30, latency: 50, cacheHit: 75 },
      poor: { fps: 15, latency: 100, cacheHit: 60 },
    };
  }

  /**
   * Returns metadata for a metric key
   * @param {string} key - Metric identifier
   * @returns {object|null} Metric metadata
   */
  get(key) {
    return this.registry.get(key) || null;
  }

  /**
   * Register a new metric dynamically (e.g., plugin-defined)
   * @param {string} key - Unique metric identifier
   * @param {object} meta - Metric metadata
   */
  register(key, meta) {
    if (!key || !meta) {
      console.warn("[MetricsRegistry] Invalid metric registration:", key, meta);
      return false;
    }

    // Validate required fields
    const required = ["name", "unit", "description", "domain", "category"];
    for (const field of required) {
      if (!meta[field]) {
        console.warn(
          `[MetricsRegistry] Missing required field '${field}' for metric '${key}'`,
        );
        return false;
      }
    }

    // Set defaults for optional fields
    const defaults = {
      minAcceptable: 0,
      target: 1,
      maxExpected: 100,
      format: (value) => String(value),
      policy: { analytics: false, audit: false, ai: false },
    };

    const fullMeta = { ...defaults, ...meta };
    this.registry.set(key, fullMeta);

    console.log(`[MetricsRegistry] Registered new metric: ${key}`);
    return true;
  }

  /**
   * Unregister a metric
   * @param {string} key - Metric to remove
   */
  unregister(key) {
    const existed = this.registry.delete(key);
    if (existed) {
      console.log(`[MetricsRegistry] Unregistered metric: ${key}`);
    }
    return existed;
  }

  /**
   * Validate a metric value against its thresholds
   * @param {string} key - Metric identifier
   * @param {number} value - Value to validate
   * @returns {object} Validation result
   */
  validate(key, value) {
    const meta = this.get(key);
    if (!meta) {
      return { valid: false, reason: "Metric not found" };
    }

    if (typeof value !== "number" || !isFinite(value)) {
      return { valid: false, reason: "Invalid value type" };
    }

    const result = {
      valid: value >= meta.minAcceptable,
      value,
      meta,
      status: this.getPerformanceStatus(key, value),
      formatted: meta.format(value),
    };

    if (!result.valid) {
      result.reason = `Value ${value} below minimum acceptable ${meta.minAcceptable}`;
    }

    return result;
  }

  /**
   * Get performance status for a metric value
   * @param {string} key - Metric identifier
   * @param {number} value - Metric value
   * @returns {string} Performance status
   */
  getPerformanceStatus(key, value) {
    const meta = this.get(key);
    if (!meta) return "unknown";

    // For latency metrics, lower is better
    if (meta.category === "latency") {
      if (value <= meta.target) return "excellent";
      if (value <= meta.target * 2) return "good";
      if (value <= meta.target * 3) return "fair";
      return "poor";
    }

    // For rate/percentage metrics, higher is better
    if (meta.unit === "%" || meta.unit === "fps") {
      if (value >= meta.target) return "excellent";
      if (value >= meta.target * 0.8) return "good";
      if (value >= meta.target * 0.6) return "fair";
      return "poor";
    }

    // For count metrics, lower is usually better
    if (meta.category === "reliability") {
      if (value <= meta.target) return "excellent";
      if (value <= meta.target * 2) return "good";
      if (value <= meta.target * 5) return "fair";
      return "poor";
    }

    // Default comparison
    if (value >= meta.target) return "excellent";
    if (value >= meta.minAcceptable) return "good";
    return "poor";
  }

  /**
   * Retrieve all metric definitions grouped by domain
   * @param {string} domain - Domain to filter by
   * @returns {Array} Array of metrics in the domain
   */
  getByDomain(domain) {
    const results = [];
    for (const [key, meta] of this.registry.entries()) {
      if (meta.domain === domain) {
        results.push({ key, ...meta });
      }
    }
    return results;
  }

  /**
   * Retrieve all metric definitions grouped by category
   * @param {string} category - Category to filter by
   * @returns {Array} Array of metrics in the category
   */
  getByCategory(category) {
    const results = [];
    for (const [key, meta] of this.registry.entries()) {
      if (meta.category === category) {
        results.push({ key, ...meta });
      }
    }
    return results;
  }

  /**
   * Get metrics that have specific policy flags enabled
   * @param {string} policyType - Policy type (analytics, audit, ai)
   * @returns {Array} Array of metrics with the policy enabled
   */
  getByPolicy(policyType) {
    const results = [];
    for (const [key, meta] of this.registry.entries()) {
      if (meta.policy[policyType]) {
        results.push({ key, ...meta });
      }
    }
    return results;
  }

  /**
   * Export a snapshot of all metrics for the PerformanceOverlayBlock or analytics dashboard
   * @returns {object} All metric definitions
   */
  exportAll() {
    const result = {};
    for (const [key, meta] of this.registry.entries()) {
      result[key] = { ...meta };
    }
    return result;
  }

  /**
   * Get available domains
   * @returns {Array} Array of unique domains
   */
  getDomains() {
    const domains = new Set();
    for (const meta of this.registry.values()) {
      domains.add(meta.domain);
    }
    return Array.from(domains).sort();
  }

  /**
   * Get available categories
   * @returns {Array} Array of unique categories
   */
  getCategories() {
    const categories = new Set();
    for (const meta of this.registry.values()) {
      categories.add(meta.category);
    }
    return Array.from(categories).sort();
  }

  /**
   * Calculate overall performance score based on key metrics
   * @param {object} metrics - Current metric values
   * @returns {object} Performance score and breakdown
   */
  calculatePerformanceScore(metrics) {
    const keyMetrics = [
      "ui_performance_fps",
      "ui_render_latency",
      "system_cache_hit_rate",
      "system_error_count",
    ];

    let totalWeight = 0;
    let weightedScore = 0;
    const breakdown = {};

    for (const metricKey of keyMetrics) {
      const value = metrics[metricKey];
      if (value !== undefined && value !== null) {
        const status = this.getPerformanceStatus(metricKey, value);
        const weight = this.getMetricWeight(metricKey);
        const score = this.statusToScore(status);

        weightedScore += score * weight;
        totalWeight += weight;

        breakdown[metricKey] = {
          value,
          status,
          score,
          weight,
          formatted: this.get(metricKey)?.format(value) || String(value),
        };
      }
    }

    const overallScore =
      totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
    const overallStatus = this.scoreToStatus(overallScore);

    return {
      score: overallScore,
      status: overallStatus,
      breakdown,
      keyMetrics,
      timestamp: Date.now(),
    };
  }

  /**
   * Get weight for a metric in overall score calculation
   */
  getMetricWeight(metricKey) {
    const weights = {
      ui_performance_fps: 3,
      ui_render_latency: 3,
      system_cache_hit_rate: 2,
      system_error_count: 2,
      grid_drag_latency: 1,
      grid_resize_latency: 1,
    };
    return weights[metricKey] || 1;
  }

  /**
   * Convert status to numeric score
   */
  statusToScore(status) {
    const scores = {
      excellent: 100,
      good: 75,
      fair: 50,
      poor: 25,
      unknown: 0,
    };
    return scores[status] || 0;
  }

  /**
   * Convert numeric score to status
   */
  scoreToStatus(score) {
    if (score >= 90) return "excellent";
    if (score >= 70) return "good";
    if (score >= 50) return "fair";
    return "poor";
  }

  /**
   * Get metric suggestions based on current performance
   * @param {object} metrics - Current metric values
   * @returns {Array} Array of suggestions
   */
  getSuggestions(metrics) {
    const suggestions = [];

    for (const [key, value] of Object.entries(metrics)) {
      const meta = this.get(key);
      if (!meta) continue;

      const status = this.getPerformanceStatus(key, value);

      if (status === "poor") {
        suggestions.push({
          metric: key,
          issue: `Poor ${meta.name}: ${meta.format(value)}`,
          suggestion: this.getImprovementSuggestion(key, meta),
          priority: "high",
        });
      } else if (status === "fair") {
        suggestions.push({
          metric: key,
          issue: `Suboptimal ${meta.name}: ${meta.format(value)}`,
          suggestion: this.getImprovementSuggestion(key, meta),
          priority: "medium",
        });
      }
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Get improvement suggestion for a specific metric
   */
  getImprovementSuggestion(key, meta) {
    const suggestions = {
      ui_performance_fps: "Enable performance mode or reduce visual effects",
      ui_render_latency:
        "Optimize component rendering or reduce DOM complexity",
      ui_layout_latency: "Minimize layout operations during interactions",
      system_cache_hit_rate:
        "Increase cache size or improve cache key strategy",
      system_error_count: "Review error logs and fix recurring issues",
      grid_drag_latency:
        "Optimize grid drag handlers or enable performance mode",
      grid_resize_latency: "Simplify resize calculations or debounce updates",
    };

    return (
      suggestions[key] || `Optimize ${meta.name.toLowerCase()} performance`
    );
  }

  /**
   * Get registry statistics
   * @returns {object} Registry statistics
   */
  getStats() {
    const domains = this.getDomains();
    const categories = this.getCategories();

    return {
      totalMetrics: this.registry.size,
      domains: domains.length,
      categories: categories.length,
      domainBreakdown: domains.map((domain) => ({
        domain,
        count: this.getByDomain(domain).length,
      })),
      categoryBreakdown: categories.map((category) => ({
        category,
        count: this.getByCategory(category).length,
      })),
      policyBreakdown: {
        analytics: this.getByPolicy("analytics").length,
        audit: this.getByPolicy("audit").length,
        ai: this.getByPolicy("ai").length,
      },
    };
  }
}

// Singleton instance for global use
export const metricsRegistry = new MetricsRegistry();

export default MetricsRegistry;
