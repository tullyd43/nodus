/**
 * MetricsReporter.js
 * Bridges runtime metrics to analytics, state manager, and policies for Nodus V7.1
 * Connects RenderMetrics to HybridStateManager and provides continuous reporting
 */

import RenderMetrics from "./RenderMetrics.js";

/**
 * @class MetricsReporter
 * @description A class that bridges runtime performance metrics (from `RenderMetrics`)
 * with the application's state manager, event flow, and analytics systems. It periodically
 * collects, reports, and checks metrics against performance thresholds.
 *
 * @property {object} context - The global system context.
 * @property {number} interval - The reporting interval in milliseconds.
 * @property {RenderMetrics} metrics - The instance of the `RenderMetrics` tracker.
 * @property {object} cacheStats - Statistics for cache performance.
 * @property {object} thresholds - Configurable performance thresholds for alerting.
 * @property {boolean} isRunning - A flag indicating if the reporter is active.
 */
export class MetricsReporter {
	/**
	 * @param {object} context - The global system context containing `stateManager`, `eventFlow`, etc.
	 * @param {number} [intervalMs=5000] - The interval in milliseconds for generating reports.
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
	 * Starts the metrics reporting system.
	 * This begins tracking render metrics and sets up a periodic reporting interval.
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
		console.log(
			`[MetricsReporter] Started reporting every ${this.interval}ms`
		);
	}

	/**
	 * Stops the metrics reporting system.
	 * This halts render metric tracking and clears the reporting interval.
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
	 * Pushes the latest rendering and memory metrics into the `HybridStateManager`.
	 * This method is called frequently by the `RenderMetrics` `onUpdate` callback.
	 * @private
	 * @param {object} renderMetrics - The latest metrics object from `RenderMetrics`.
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
				error
			);
		}
	}

	/**
	 * Checks the latest render metrics against predefined thresholds and emits
	 * a `performance_alert` event if any thresholds are breached.
	 * @private
	 * @param {object} renderMetrics - The latest metrics object from `RenderMetrics`.
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
			renderMetrics.avgInteractionLatency
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
	 * Generates a comprehensive performance report by gathering data from `RenderMetrics`,
	 * cache statistics, and the browser environment. It then emits this report for analytics.
	 * @returns {object|null} The generated report object, or null if an error occurs.
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
					report.performance
				);
				this.context.stateManager.recordMetric(
					"cache_performance",
					report.cache
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
	 * Calculates the cache hit rate as a percentage based on recorded hits and misses.
	 * @private
	 * @returns {number} The cache hit rate percentage.
	 */
	calculateCacheHitRate() {
		const { hits, misses } = this.cacheStats;
		const total = hits + misses;
		return total > 0 ? Math.round((hits / total) * 100) : 0;
	}

	/**
	 * Retrieves network connection information from the browser's `navigator.connection` API.
	 * @private
	 * @returns {object|null} An object with connection details, or null if not supported.
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
	 * Retrieves battery status information from the browser's `navigator.getBattery` API.
	 * @private
	 * @returns {Promise<object|null>|null} A promise resolving to battery status, or null if not supported.
	 */
	getBatteryInfo() {
		// Note: Battery API is deprecated in most browsers
		if ("getBattery" in navigator) {
			navigator
				.getBattery()
				.then((battery) => ({
					charging: battery.charging,
					level: battery.level,
					chargingTime: battery.chargingTime,
					dischargingTime: battery.dischargingTime,
				}))
				.catch(() => null);
		}
		return null;
	}

	/**
	 * Aggregates performance issues detected by `RenderMetrics` and adds cache-specific warnings.
	 * @private
	 * @param {object} renderMetrics - The latest metrics from `RenderMetrics`.
	 * @param {number} cacheHitRate - The current cache hit rate.
	 * @returns {object[]} An array of detected issue objects.
	 */
	detectIssues(renderMetrics, cacheHitRate) {
		const issues = [];

		// Use RenderMetrics built-in issue detection
		const renderIssues =
			this.metrics.detectPerformanceIssues(renderMetrics);
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
				suggestion:
					"Consider increasing cache size or improving cache keys",
			});
		}

		return issues;
	}

	/**
	 * Emits a `metrics_update` event to the `EventFlowEngine` with the full report.
	 * @private
	 * @param {object} report - The performance report to emit.
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
			console.warn(
				"[MetricsReporter] Failed to emit analytics event:",
				error
			);
		}
	}

	/**
	 * Retrieves relevant system policies that control metric reporting and logging.
	 * @private
	 * @returns {{analytics: boolean, monitoring: boolean, debug: boolean}} An object with policy states.
	 */
	getRelevantPolicies() {
		try {
			if (this.context?.policies) {
				return {
					analytics:
						this.context.policies.system?.enable_analytics || false,
					monitoring:
						this.context.policies.system?.enable_monitoring ||
						false,
					debug:
						this.context.policies.system?.enable_debug_mode ||
						false,
				};
			}
		} catch (error) {
			console.warn("[MetricsReporter] Failed to get policies:", error);
		}
		return { analytics: false, monitoring: false, debug: false };
	}

	/**
	 * Logs a summary of the report to the console if the `debug` or `monitoring`
	 * policies are enabled.
	 * @private
	 * @param {object} report - The performance report to log.
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
				console.warn(
					"[MetricsReporter] Performance Issues:",
					report.alerts
				);
			}
		} catch (error) {
			console.warn("[MetricsReporter] Failed to log report:", error);
		}
	}

	/**
	 * Records a cache access event, incrementing hit or miss counters.
	 * This should be called by cache implementations (`LRUCache`, etc.) on get operations.
	 * @param {boolean} hit - `true` if the access was a cache hit, `false` for a miss.
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
	 * Resets all collected cache statistics to zero.
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
	 * A proxy method to record a custom latency measurement in the underlying `RenderMetrics` instance.
	 * @param {string} category - The category of the latency (e.g., 'grid', 'render', 'interaction').
	 * @param {number} latency - The duration of the operation in milliseconds.
	 * @param {string} [operation="unknown"] - A more specific name for the operation.
	 */
	recordLatency(category, latency, operation = "unknown") {
		this.metrics.recordCustomLatency(category, latency);
	}

	/**
	 * Gets a snapshot of the current performance summary.
	 * @returns {object} An object containing key performance indicators.
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
	 * Exports all raw and summarized metrics data for debugging or external analysis.
	 * @returns {object} A comprehensive object of all metrics data.
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
	 * Updates the performance thresholds used for alerting.
	 * @param {object} newThresholds - An object with new threshold values to merge.
	 */
	updateThresholds(newThresholds) {
		this.thresholds = {
			...this.thresholds,
			...newThresholds,
		};
		console.log(
			"[MetricsReporter] Updated performance thresholds:",
			this.thresholds
		);
	}

	/**
	 * Logs a generic metric and attempts to store it in the state manager.
	 * @param {string} metric - The name of the metric.
	 * @param {*} value - The value of the metric.
	 */
	log(metric, value) {
		console.log(`[Metrics] ${metric}: ${value}`);
		try {
			if (
				this.context.stateManager &&
				this.context.stateManager.metrics
			) {
				this.context.stateManager.metrics[metric] = value;
			}
		} catch (error) {
			// TODO: implement metrics flush logic
		}
	}
}

export default MetricsReporter;
