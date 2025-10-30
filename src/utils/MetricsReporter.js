/**
 * MetricsReporter.js
 * v7.2 - Now fully integrated with MetricsRegistry and rich LRUCache metrics.
 * Bridges runtime metrics to analytics, state manager, and policies for Nodus V7.1
 * Connects RenderMetrics to HybridStateManager and provides continuous reporting
 */

import { DateCore } from "./DateUtils.js";
import RenderMetrics from "./RenderMetrics.js";

/**
 * @class MetricsReporter
 * @description A class that bridges runtime performance metrics (from `RenderMetrics`)
 * with the application's state manager, event flow, and analytics systems. It periodically
 * collects, reports, and checks metrics against performance thresholds.
 *
 */
export class MetricsReporter {
	/**
	 * @param {object} context - The global system context containing `stateManager`, `eventFlow`, etc.
	 * @param {object} context.managers - The collection of system managers (metricsRegistry, cacheManager, etc.).
	 * @param {number} [intervalMs=5000] - The interval in milliseconds for generating reports.
	 */
	constructor(context, intervalMs = 5000) {
		this.context = context;
		this.interval = intervalMs;

		// Core metric sources
		this.renderMetrics = new RenderMetrics({
			sampleSize: 60,
			reportInterval: 1000,
			trackLatency: true,
			trackMemory: true,
		});
		this.metricsRegistry = context.managers?.metricsRegistry || null;
		this.cacheManager = context.managers?.cacheManager || null;

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
		this.renderMetrics.startTracking();

		// Set up FPS updates to state manager
		this.fpsUnsubscribe = this.renderMetrics.onUpdate((metrics) => {
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
		this.renderMetrics.stopTracking();

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
					lastUpdated: DateCore.timestamp(),
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
			this.context?.eventFlow?.emit("performance_alert", {
				...alert,
				context: this.context, // Pass full context for richer handling
			});
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
			const renderMetrics = this.renderMetrics.getCurrentMetrics();
			const timestamp = DateCore.now();

			const report = {
				timestamp,
				reportId: `metrics_${DateCore.timestamp()}_${this.reportCount}`,
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
				core: this.metricsRegistry ? this.metricsRegistry.getAll() : {},
				caches: this.cacheManager
					? this.cacheManager.getAllMetrics()
					: {},
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
				alerts: this.detectIssues(renderMetrics),
			};

			// Record metric in HybridStateManager
			if (this.context?.stateManager?.recordMetric) {
				this.context.stateManager.recordMetric(
					"ui_performance",
					report.performance
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
	 * @returns {object[]} An array of detected issue objects.
	 */
	detectIssues(renderMetrics) {
		const issues = [];

		// Use RenderMetrics built-in issue detection
		const renderIssues =
			this.renderMetrics.detectPerformanceIssues(renderMetrics);
		issues.push(...renderIssues);

		// Add cache-specific issues by analyzing metrics from CacheManager
		const cacheMetrics = this.cacheManager?.getAllMetrics() || {};
		let totalHitRate = 0;
		const cacheCount = Object.keys(cacheMetrics).length;

		if (cacheCount > 0) {
			totalHitRate =
				Object.values(cacheMetrics).reduce(
					(sum, metrics) => sum + metrics.hitRate,
					0
				) / cacheCount;
		}

		// Add cache-specific issues
		if (
			cacheCount > 0 &&
			totalHitRate < this.thresholds.cacheHitRate.critical
		) {
			issues.push({
				type: "low_cache_hit_rate",
				severity: "critical",
				message: `Very low cache hit rate: ${totalHitRate.toFixed(2)}%`,
				suggestion: "Review caching strategy and cache size limits",
			});
		} else if (
			cacheCount > 0 &&
			totalHitRate < this.thresholds.cacheHitRate.warning
		) {
			issues.push({
				type: "suboptimal_cache_hit_rate",
				severity: "warning",
				message: `Suboptimal cache hit rate: ${totalHitRate.toFixed(2)}%`,
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
					performance: {
						fps: report.performance.fps,
						latency: report.performance.latency,
					},
					core_metrics_count: Object.keys(report.core).length,
					alerts: report.alerts.length,
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
	 * A proxy method to record a custom latency measurement in the underlying `RenderMetrics` instance.
	 * @param {string} category - The category of the latency (e.g., 'grid', 'render', 'interaction').
	 * @param {number} latency - The duration of the operation in milliseconds.
	 * @param {string} [operation="unknown"] - A more specific name for the operation.
	 */
	recordLatency(category, latency, operation = "unknown") {
		this.renderMetrics.recordCustomLatency(category, latency);
	}

	/**
	 * Gets a snapshot of the current performance summary.
	 * @returns {object} An object containing key performance indicators.
	 */
	getCurrentSummary() {
		const renderMetrics = this.renderMetrics.getCurrentMetrics();

		return {
			fps: renderMetrics.fps,
			latency: {
				render: renderMetrics.avgRenderLatency,
				layout: renderMetrics.avgLayoutLatency,
				interaction: renderMetrics.avgInteractionLatency,
			},
			core: this.metricsRegistry ? this.metricsRegistry.getAll() : {},
			memory: renderMetrics.memory,
			issues: this.detectIssues(renderMetrics),
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
			renderMetrics: this.renderMetrics.exportData(),
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
			console.warn(
				`[MetricsReporter] Failed to log metric '${metric}' to state manager:`,
				error
			);
		}
	}
}

export default MetricsReporter;
