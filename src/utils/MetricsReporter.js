/**
 * MetricsReporter.js
 * Bridges runtime metrics to analytics, state manager, and policies for Nodus V7.1
 * Connects RenderMetrics to HybridStateManager and provides continuous reporting
 */

import RenderMetrics from "./RenderMetrics.js";

export class MetricsReporter {
  /**
   * @param {object} context - The global system context with stateManager, eventFlow, etc.
   * @param {number} intervalMs - How often to report metrics (default: 5000ms)
   */
  constructor(context, intervalMs = 5000) {
    this.context = context;
    this.interval = intervalMs;
    this.metrics = new RenderMetrics({
      sampleSize: 60,
      reportInterval: 1000,
      trackLatency: true,
      trackMemory: true,
    });

    // Cache statistics tracking
    this.cacheStats = {
      hits: 0,
      misses: 0,
      operations: 0,
      lastReset: Date.now(),
    };

    // Performance thresholds
    this.thresholds = {
      fps: { target: 60, warning: 30, critical: 15 },
      latency: { target: 16, warning: 50, critical: 100 },
      cacheHitRate: { target: 95, warning: 80, critical: 60 },
    };

    this.timer = null;
    this.isRunning = false;
    this.reportCount = 0;
  }

  /**
   * Start the metrics reporting system
   */
  start() {
    if (this.isRunning) {
      console.warn("[MetricsReporter] Already running");
      return;
    }

    // Start render metrics tracking
    this.metrics.startTracking();

    // Set up FPS updates to state manager
    this.fpsUnsubscribe = this.metrics.onUpdate((metrics) => {
      this.updateStateManagerMetrics(metrics);
      this.checkPerformanceAlerts(metrics);
    });

    // Start periodic reporting
    this.timer = setInterval(() => {
      this.generateReport();
    }, this.interval);

    this.isRunning = true;
    console.log(`[MetricsReporter] Started reporting every ${this.interval}ms`);
  }

  /**
   * Stop the metrics reporting system
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    // Stop render metrics
    this.metrics.stopTracking();

    // Unsubscribe from FPS updates
    if (this.fpsUnsubscribe) {
      this.fpsUnsubscribe();
    }

    // Clear reporting timer
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.isRunning = false;
    console.log("[MetricsReporter] Stopped reporting");
  }

  /**
   * Update metrics in HybridStateManager
   */
  updateStateManagerMetrics(renderMetrics) {
    try {
      if (this.context?.stateManager?.metrics) {
        // Update rendering metrics
        this.context.stateManager.metrics.rendering = {
          ...this.context.stateManager.metrics.rendering,
          fps: renderMetrics.fps,
          avgRenderLatency: renderMetrics.avgRenderLatency,
          avgLayoutLatency: renderMetrics.avgLayoutLatency,
          avgInteractionLatency: renderMetrics.avgInteractionLatency,
          lastUpdated: Date.now(),
        };

        // Update memory metrics if available
        if (renderMetrics.memory) {
          this.context.stateManager.metrics.memory = {
            ...this.context.stateManager.metrics.memory,
            jsHeapUsed: renderMetrics.memory.usedJSHeapSize,
            jsHeapTotal: renderMetrics.memory.totalJSHeapSize,
            jsHeapLimit: renderMetrics.memory.jsHeapSizeLimit,
          };
        }
      }
    } catch (error) {
      console.warn(
        "[MetricsReporter] Failed to update state manager metrics:",
        error,
      );
    }
  }

  /**
   * Check for performance alerts and emit warnings
   */
  checkPerformanceAlerts(renderMetrics) {
    const alerts = [];

    // Check FPS
    if (renderMetrics.fps <= this.thresholds.fps.critical) {
      alerts.push({
        type: "fps_critical",
        metric: "fps",
        value: renderMetrics.fps,
        threshold: this.thresholds.fps.critical,
        severity: "critical",
        message: `Critical FPS: ${renderMetrics.fps} (target: ${this.thresholds.fps.target})`,
      });
    } else if (renderMetrics.fps <= this.thresholds.fps.warning) {
      alerts.push({
        type: "fps_warning",
        metric: "fps",
        value: renderMetrics.fps,
        threshold: this.thresholds.fps.warning,
        severity: "warning",
        message: `Low FPS: ${renderMetrics.fps} (target: ${this.thresholds.fps.target})`,
      });
    }

    // Check latency
    const maxLatency = Math.max(
      renderMetrics.avgRenderLatency,
      renderMetrics.avgLayoutLatency,
      renderMetrics.avgInteractionLatency,
    );

    if (maxLatency >= this.thresholds.latency.critical) {
      alerts.push({
        type: "latency_critical",
        metric: "latency",
        value: maxLatency,
        threshold: this.thresholds.latency.critical,
        severity: "critical",
        message: `Critical latency: ${maxLatency}ms (target: ${this.thresholds.latency.target}ms)`,
      });
    } else if (maxLatency >= this.thresholds.latency.warning) {
      alerts.push({
        type: "latency_warning",
        metric: "latency",
        value: maxLatency,
        threshold: this.thresholds.latency.warning,
        severity: "warning",
        message: `High latency: ${maxLatency}ms (target: ${this.thresholds.latency.target}ms)`,
      });
    }

    // Emit alerts
    alerts.forEach((alert) => {
      this.context?.eventFlow?.emit("performance_alert", alert);
    });
  }

  /**
   * Generate comprehensive metrics report
   */
  generateReport() {
    try {
      this.reportCount++;
      const renderMetrics = this.metrics.getCurrentMetrics();
      const cacheHitRate = this.calculateCacheHitRate();
      const timestamp = new Date().toISOString();

      const report = {
        timestamp,
        reportId: `metrics_${Date.now()}_${this.reportCount}`,
        performance: {
          fps: renderMetrics.fps,
          frameCount: renderMetrics.frameCount,
          latency: {
            render: renderMetrics.avgRenderLatency,
            layout: renderMetrics.avgLayoutLatency,
            interaction: renderMetrics.avgInteractionLatency,
          },
          memory: renderMetrics.memory,
          cumulativeLayoutShift: renderMetrics.cumulativeLayoutShift,
          firstContentfulPaint: renderMetrics.firstContentfulPaint,
        },
        cache: {
          hitRate: cacheHitRate,
          hits: this.cacheStats.hits,
          misses: this.cacheStats.misses,
          operations: this.cacheStats.operations,
        },
        system: {
          userAgent: navigator.userAgent,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          connection: this.getConnectionInfo(),
          battery: this.getBatteryInfo(),
        },
        thresholds: this.thresholds,
        alerts: this.detectIssues(renderMetrics, cacheHitRate),
      };

      // Record metric in HybridStateManager
      if (this.context?.stateManager?.recordMetric) {
        this.context.stateManager.recordMetric(
          "ui_performance",
          report.performance,
        );
        this.context.stateManager.recordMetric(
          "cache_performance",
          report.cache,
        );
      }

      // Emit analytics event
      this.emitAnalyticsEvent(report);

      // Log report if policy allows
      this.logReport(report);

      return report;
    } catch (error) {
      console.error("[MetricsReporter] Error generating report:", error);
      return null;
    }
  }

  /**
   * Calculate cache hit rate
   */
  calculateCacheHitRate() {
    const { hits, misses } = this.cacheStats;
    const total = hits + misses;
    return total > 0 ? Math.round((hits / total) * 100) : 0;
  }

  /**
   * Get connection information
   */
  getConnectionInfo() {
    if ("connection" in navigator) {
      const conn = navigator.connection;
      return {
        effectiveType: conn.effectiveType,
        downlink: conn.downlink,
        rtt: conn.rtt,
        saveData: conn.saveData,
      };
    }
    return null;
  }

  /**
   * Get battery information
   */
  getBatteryInfo() {
    // Note: Battery API is deprecated in most browsers
    if ("getBattery" in navigator) {
      navigator
        .getBattery()
        .then((battery) => {
          return {
            charging: battery.charging,
            level: battery.level,
            chargingTime: battery.chargingTime,
            dischargingTime: battery.dischargingTime,
          };
        })
        .catch(() => null);
    }
    return null;
  }

  /**
   * Detect performance issues
   */
  detectIssues(renderMetrics, cacheHitRate) {
    const issues = [];

    // Use RenderMetrics built-in issue detection
    const renderIssues = this.metrics.detectPerformanceIssues(renderMetrics);
    issues.push(...renderIssues);

    // Add cache-specific issues
    if (cacheHitRate < this.thresholds.cacheHitRate.critical) {
      issues.push({
        type: "low_cache_hit_rate",
        severity: "critical",
        message: `Very low cache hit rate: ${cacheHitRate}%`,
        suggestion: "Review caching strategy and cache size limits",
      });
    } else if (cacheHitRate < this.thresholds.cacheHitRate.warning) {
      issues.push({
        type: "suboptimal_cache_hit_rate",
        severity: "warning",
        message: `Suboptimal cache hit rate: ${cacheHitRate}%`,
        suggestion: "Consider increasing cache size or improving cache keys",
      });
    }

    return issues;
  }

  /**
   * Emit analytics event
   */
  emitAnalyticsEvent(report) {
    try {
      if (this.context?.eventFlow?.emit) {
        this.context.eventFlow.emit("metrics_update", {
          type: "performance_metrics",
          data: report,
          policies: this.getRelevantPolicies(),
        });
      }
    } catch (error) {
      console.warn("[MetricsReporter] Failed to emit analytics event:", error);
    }
  }

  /**
   * Get relevant policies for reporting
   */
  getRelevantPolicies() {
    try {
      if (this.context?.policies) {
        return {
          analytics: this.context.policies.system?.enable_analytics || false,
          monitoring: this.context.policies.system?.enable_monitoring || false,
          debug: this.context.policies.system?.enable_debug_mode || false,
        };
      }
    } catch (error) {
      console.warn("[MetricsReporter] Failed to get policies:", error);
    }
    return { analytics: false, monitoring: false, debug: false };
  }

  /**
   * Log report conditionally based on policies
   */
  logReport(report) {
    try {
      const policies = this.getRelevantPolicies();

      if (policies.debug || policies.monitoring) {
        console.log("[MetricsReporter] Performance Report:", {
          fps: report.performance.fps,
          latency: report.performance.latency,
          cacheHitRate: report.cache.hitRate,
          issues: report.alerts.length,
          timestamp: report.timestamp,
        });
      }

      // Log issues regardless of policy for debugging
      if (report.alerts.length > 0) {
        console.warn("[MetricsReporter] Performance Issues:", report.alerts);
      }
    } catch (error) {
      console.warn("[MetricsReporter] Failed to log report:", error);
    }
  }

  /**
   * Record cache access (called by cache implementations)
   * @param {boolean} hit - Whether this was a cache hit or miss
   */
  recordCacheAccess(hit) {
    this.cacheStats.operations++;
    if (hit) {
      this.cacheStats.hits++;
    } else {
      this.cacheStats.misses++;
    }
  }

  /**
   * Reset cache statistics
   */
  resetCacheStats() {
    this.cacheStats = {
      hits: 0,
      misses: 0,
      operations: 0,
      lastReset: Date.now(),
    };
  }

  /**
   * Record custom latency measurement
   */
  recordLatency(category, latency, operation = "unknown") {
    this.metrics.recordCustomLatency(category, latency);
  }

  /**
   * Get current performance summary
   */
  getCurrentSummary() {
    const renderMetrics = this.metrics.getCurrentMetrics();
    const cacheHitRate = this.calculateCacheHitRate();

    return {
      fps: renderMetrics.fps,
      latency: {
        render: renderMetrics.avgRenderLatency,
        layout: renderMetrics.avgLayoutLatency,
        interaction: renderMetrics.avgInteractionLatency,
      },
      cache: {
        hitRate: cacheHitRate,
        operations: this.cacheStats.operations,
      },
      memory: renderMetrics.memory,
      issues: this.detectIssues(renderMetrics, cacheHitRate),
      isRunning: this.isRunning,
      reportCount: this.reportCount,
    };
  }

  /**
   * Export all collected metrics data
   */
  exportData() {
    return {
      renderMetrics: this.metrics.exportData(),
      cacheStats: { ...this.cacheStats },
      thresholds: { ...this.thresholds },
      config: {
        interval: this.interval,
        isRunning: this.isRunning,
        reportCount: this.reportCount,
      },
      summary: this.getCurrentSummary(),
    };
  }

  /**
   * Update performance thresholds
   */
  updateThresholds(newThresholds) {
    this.thresholds = {
      ...this.thresholds,
      ...newThresholds,
    };
    console.log(
      "[MetricsReporter] Updated performance thresholds:",
      this.thresholds,
    );
  }

  log(metric, value) {
    console.log(`[Metrics] ${metric}: ${value}`);
    try { this.context.stateManager?.metrics?.[metric] = value; } catch {}
  }
}

export default MetricsReporter;
