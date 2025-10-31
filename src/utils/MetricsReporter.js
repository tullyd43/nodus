/**
 * @file MetricsReporter.js
 * @description A service that bridges runtime performance metrics (from `RenderMetrics`)
 * with the application's state manager, event flow, and analytics systems. It periodically
 * collects, reports, and checks metrics against performance thresholds, adhering to V8 Parity Mandates.
 * @see {@link d:\Development Files\repositories\nodus\DEVELOPER_MANDATES.md}
 */

import { DateCore } from "./DateUtils.js";

/**
 * @class MetricsReporter
 * @description A class that bridges runtime performance metrics (from `RenderMetrics`)
 * with the application's state manager, event flow, and analytics systems. It periodically
 * collects, reports, and checks metrics against performance thresholds.
 * @privateFields {#stateManager, #interval, #renderMetrics, #metricsRegistry, #cacheManager, #policiesManager, #errorHelpers, #forensicLogger, #thresholds, #timer, #isRunning, #reportCount, #fpsUnsubscribe}
 */
export class MetricsReporter {
	// V8.0 Parity: Use private fields for true encapsulation.
	#stateManager;
	#interval;
	/** @private @type {import('./RenderMetrics.js').RenderMetrics} */
	#renderMetrics;
	#metricsRegistry;
	#cacheManager;
	#policiesManager;
	#errorHelpers;
	#forensicLogger;
	#thresholds;
	#timer = null;
	#isRunning = false;
	#reportCount = 0;
	#fpsUnsubscribe = null;

	/**
	 * Creates an instance of MetricsReporter.
	 * @param {object} context - The application context.
	 * @param {import('../core/HybridStateManager.js').default} context.stateManager - The main state manager, providing access to all other managers.
	 * @param {number} [intervalMs=5000] - The interval in milliseconds for generating reports.
	 */
	constructor({ stateManager }, intervalMs = 5000) {
		this.#stateManager = stateManager;
		this.#interval = intervalMs;

		// V8.0 Parity: Derive all dependencies from the stateManager.
		this.#renderMetrics = this.#stateManager.managers.renderMetrics;
		this.#metricsRegistry = this.#stateManager.metricsRegistry;
		this.#cacheManager = this.#stateManager.managers.cacheManager;
		this.#policiesManager = this.#stateManager.managers.policies;
		this.#errorHelpers = this.#stateManager.managers.errorHelpers;
		this.#forensicLogger = this.#stateManager.managers.forensicLogger;

		// Performance thresholds
		this.#thresholds = {
			fps: { target: 60, warning: 30, critical: 15 },
			latency: { target: 16, warning: 50, critical: 100 },
			cacheHitRate: { target: 95, warning: 80, critical: 60 },
			...(this.#stateManager.config.metricsReporter?.thresholds || {}),
		};
	}

	/**
	 * Starts the metrics reporting system.
	 * This begins tracking render metrics and sets up a periodic reporting interval.
	 */
	async start() {
		await this.#errorHelpers.tryAsync(
			async () => {
				if (this.#isRunning) {
					console.warn("[MetricsReporter] Already running");
					return;
				}

				if (!this.#renderMetrics) {
					throw new Error(
						"RenderMetrics manager not found. Cannot start."
					);
				}

				// Start the underlying RenderMetrics service
				this.#renderMetrics.startTracking();

				// Set up FPS updates to state manager
				this.#fpsUnsubscribe = this.#renderMetrics.onUpdate(
					(metrics) => {
						this.#updateMetricsRegistry(metrics);
						this.#checkPerformanceAlerts(metrics);
					}
				);

				// Start periodic reporting
				this.#timer = setInterval(
					() => this.generateReport(),
					this.#interval
				);

				this.#isRunning = true;
				console.log(
					`[MetricsReporter] Started reporting every ${this.#interval}ms`
				);
			},
			{
				component: "MetricsReporter",
				operation: "start",
			}
		);
	}

	/**
	 * Stops the metrics reporting system.
	 * This halts render metric tracking and clears the reporting interval.
	 */
	stop() {
		this.#errorHelpers.try(
			() => {
				if (!this.#isRunning) {
					return;
				}

				// Stop the underlying RenderMetrics service
				this.#renderMetrics?.stopTracking();

				// Unsubscribe from FPS updates
				if (this.#fpsUnsubscribe) {
					this.#fpsUnsubscribe();
					this.#fpsUnsubscribe = null;
				}

				// Clear reporting timer
				if (this.#timer) {
					clearInterval(this.#timer);
					this.#timer = null;
				}

				this.#isRunning = false;
				console.log("[MetricsReporter] Stopped reporting");
			},
			{ component: "MetricsReporter", operation: "stop" }
		);
	}

	/**
	 * Pushes the latest rendering and memory metrics into the centralized `MetricsRegistry`.
	 * This method is called frequently by the `RenderMetrics` `onUpdate` callback.
	 * @private
	 * @param {object} renderMetrics - The latest metrics object from `RenderMetrics`. See `RenderMetrics.getCurrentMetrics()`.
	 */
	#updateMetricsRegistry(renderMetrics) {
		this.#errorHelpers.try(
			() => {
				// V8.0 Parity: Mandate 4.3 - All metrics MUST be reported to the MetricsRegistry.
				// Use gauges for values that change over time.
				this.#metricsRegistry.set("performance.fps", renderMetrics.fps);
				this.#metricsRegistry.set(
					"performance.latency.render_avg",
					renderMetrics.avgRenderLatency
				);
				this.#metricsRegistry.set(
					"performance.latency.layout_avg",
					renderMetrics.avgLayoutLatency
				);

				if (renderMetrics.memory) {
					this.#metricsRegistry.set(
						"performance.memory.js_heap_used",
						renderMetrics.memory.usedJSHeapSize
					);
				}
			},
			{ component: "MetricsReporter", operation: "updateMetricsRegistry" }
		);
	}

	/**
	 * Checks the latest render metrics against predefined thresholds and emits
	 * a `performance_alert` event if any thresholds are breached.
	 * @private
	 * @param {object} renderMetrics - The latest metrics object from `RenderMetrics`. See `RenderMetrics.getCurrentMetrics()`.
	 */
	#checkPerformanceAlerts(renderMetrics) {
		const alerts = this.#errorHelpers.try(
			() => {
				const detectedAlerts = [];

				// Check FPS
				if (renderMetrics.fps <= this.#thresholds.fps.critical) {
					detectedAlerts.push({
						type: "fps_critical",
						metric: "fps",
						value: renderMetrics.fps,
						threshold: this.#thresholds.fps.critical,
						severity: "critical",
						message: `Critical FPS: ${renderMetrics.fps} (target: ${this.#thresholds.fps.target})`,
					});
				} else if (renderMetrics.fps <= this.#thresholds.fps.warning) {
					detectedAlerts.push({
						type: "fps_warning",
						metric: "fps",
						value: renderMetrics.fps,
						threshold: this.#thresholds.fps.warning,
						severity: "warning",
						message: `Low FPS: ${renderMetrics.fps} (target: ${this.#thresholds.fps.target})`,
					});
				}

				// Check latency
				const maxLatency = Math.max(
					renderMetrics.avgRenderLatency,
					renderMetrics.avgLayoutLatency,
					renderMetrics.avgInteractionLatency
				);

				if (maxLatency >= this.#thresholds.latency.critical) {
					detectedAlerts.push({
						type: "latency_critical",
						metric: "latency",
						value: maxLatency,
						threshold: this.#thresholds.latency.critical,
						severity: "critical",
						message: `Critical latency: ${maxLatency}ms (target: ${this.#thresholds.latency.target}ms)`,
					});
				} else if (maxLatency >= this.#thresholds.latency.warning) {
					detectedAlerts.push({
						type: "latency_warning",
						metric: "latency",
						value: maxLatency,
						threshold: this.#thresholds.latency.warning,
						severity: "warning",
						message: `High latency: ${maxLatency}ms (target: ${this.#thresholds.latency.target}ms)`,
					});
				}

				return detectedAlerts;
			},
			[],
			{
				component: "MetricsReporter",
				operation: "checkPerformanceAlerts",
			}
		);

		// Emit alerts
		alerts.forEach((alert) => {
			this.#stateManager?.emit("performance_alert", {
				...alert, // Pass full context for richer handling
			});

			// Mandate 2.4: Log critical alerts to the forensic log for auditing.
			if (alert.severity === "critical" && this.#forensicLogger) {
				this.#forensicLogger.logAuditEvent(
					"PERFORMANCE_ALERT_CRITICAL",
					alert
				);
			}
		});
	}

	/**
	 * Generates a comprehensive performance report by gathering data from `RenderMetrics`,
	 * cache statistics, and the browser environment. It then emits this report for analytics.
	 * @returns {object|null} The generated report object, or null if an error occurs.
	 */
	generateReport() {
		if (!this.#renderMetrics) return null;
		return this.#errorHelpers.try(
			() => {
				this.#reportCount++; // Safely increment inside the try block
				const renderMetrics = this.#renderMetrics.getCurrentMetrics();
				const timestamp = DateCore.now();

				const report = {
					timestamp,
					reportId: `metrics_${DateCore.timestamp()}_${this.#reportCount}`,
					performance: {
						fps: renderMetrics.fps,
						frameCount: renderMetrics.frameCount,
						latency: {
							render: renderMetrics.avgRenderLatency,
							layout: renderMetrics.avgLayoutLatency,
							interaction: renderMetrics.avgInteractionLatency,
						},
						memory: renderMetrics.memory,
						cumulativeLayoutShift:
							renderMetrics.cumulativeLayoutShift,
						firstContentfulPaint:
							renderMetrics.firstContentfulPaint,
					},
					core: this.#metricsRegistry
						? this.#metricsRegistry.getAll()
						: {},
					caches: this.#cacheManager
						? this.#cacheManager.getAllMetrics()
						: {},
					system: {
						userAgent: navigator.userAgent,
						viewport: {
							width: window.innerWidth,
							height: window.innerHeight,
						},
						connection: this.#getConnectionInfo(),
					},
					thresholds: this.#thresholds,
					alerts: this.#detectIssues(renderMetrics),
				};

				// Emit analytics event
				this.#emitAnalyticsEvent(report);

				// Log report if policy allows
				this.#logReport(report);

				return report;
			},
			null,
			{ component: "MetricsReporter", operation: "generateReport" }
		);
	}

	/**
	 * Retrieves network connection information from the browser's `navigator.connection` API.
	 * @private
	 * @returns {object|null} An object with connection details, or null if not supported.
	 */
	#getConnectionInfo() {
		return this.#errorHelpers.try(
			() => {
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
			},
			null,
			{ component: "MetricsReporter", operation: "getConnectionInfo" }
		);
	}

	/**
	 * Aggregates performance issues detected by `RenderMetrics` and adds cache-specific warnings.
	 * @private
	 * @param {object} renderMetrics - The latest metrics from `RenderMetrics`. See `RenderMetrics.getCurrentMetrics()`.
	 * @returns {Array<object>} An array of detected issue objects.
	 */
	#detectIssues(renderMetrics) {
		return this.#errorHelpers.try(
			() => {
				const issues = [];
				if (!this.#renderMetrics) return issues;

				// Use RenderMetrics built-in issue detection
				const renderIssues =
					this.#renderMetrics.detectPerformanceIssues(renderMetrics);
				issues.push(...renderIssues);

				// Add cache-specific issues by analyzing metrics from CacheManager
				const cacheMetrics = this.#cacheManager?.getAllMetrics() || {};
				const cacheCount = Object.keys(cacheMetrics).length;

				if (cacheCount > 0) {
					const totalHitRate =
						Object.values(cacheMetrics).reduce(
							(sum, metrics) => sum + (metrics.hitRate || 0),
							0
						) / cacheCount;

					// Add cache-specific issues
					if (totalHitRate < this.#thresholds.cacheHitRate.critical) {
						issues.push({
							type: "low_cache_hit_rate",
							severity: "critical",
							message: `Very low cache hit rate: ${totalHitRate.toFixed(
								2
							)}%`,
							suggestion:
								"Review caching strategy and cache size limits",
						});
					} else if (
						totalHitRate < this.#thresholds.cacheHitRate.warning
					) {
						issues.push({
							type: "suboptimal_cache_hit_rate",
							severity: "warning",
							message: `Suboptimal cache hit rate: ${totalHitRate.toFixed(
								2
							)}%`,
							suggestion:
								"Consider increasing cache size or improving cache keys",
						});
					}
				}

				return issues;
			},
			[],
			{ component: "MetricsReporter", operation: "detectIssues" }
		);
	}

	/**
	 * Emits a `metrics_update` event to the `EventFlowEngine` with the full report.
	 * @private
	 * @param {object} report - The performance report to emit.
	 */
	#emitAnalyticsEvent(report) {
		this.#errorHelpers.try(
			() => {
				if (this.#stateManager?.emit) {
					this.#stateManager.emit("metrics_update", {
						type: "performance_metrics",
						data: report,
						policies: this.#getRelevantPolicies(),
					});
				}
			},
			{ component: "MetricsReporter", operation: "emitAnalyticsEvent" }
		);
	}

	/**
	 * Retrieves relevant system policies that control metric reporting and logging.
	 * @private
	 * @returns {{analytics: boolean, monitoring: boolean, debug: boolean}} An object with policy states.
	 */
	#getRelevantPolicies() {
		return this.#errorHelpers.try(
			() => {
				if (this.#policiesManager) {
					return {
						analytics:
							this.#policiesManager.getPolicy(
								"system",
								"enable_analytics"
							) ?? false,
						monitoring:
							this.#policiesManager.getPolicy(
								"system",
								"enable_monitoring"
							) ?? false,
						debug:
							this.#policiesManager.getPolicy(
								"system",
								"enable_debug_mode"
							) ?? false,
					};
				}
				return { analytics: false, monitoring: false, debug: false };
			},
			{ analytics: false, monitoring: false, debug: false },
			{ component: "MetricsReporter", operation: "getRelevantPolicies" }
		);
	}

	/**
	 * Logs a summary of the report to the console if the `debug` or `monitoring`
	 * policies are enabled.
	 * @private
	 * @param {object} report - The performance report to log.
	 */
	#logReport(report) {
		this.#errorHelpers.try(
			() => {
				const policies = this.#getRelevantPolicies(); // Already wrapped in error handling

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
			},
			{ component: "MetricsReporter", operation: "logReport" }
		);
	}

	/**
	 * A proxy method to record a custom latency measurement in the underlying `RenderMetrics` instance.
	 * @param {string} category - The category of the latency (e.g., 'grid', 'render', 'interaction').
	 * @param {number} latency - The duration of the operation in milliseconds.
	 * @param {string} [operation="unknown"] - A more specific name for the operation.
	 */
	recordLatency(category, latency, operation = "unknown") {
		this.#errorHelpers.try(
			() => {
				if (!this.#renderMetrics) return;
				this.#renderMetrics.recordCustomLatency(category, latency);
			},
			{ component: "MetricsReporter", operation: "recordLatency" }
		);
	}

	/**
	 * Gets a snapshot of the current performance summary.
	 * @returns {object} An object containing key performance indicators.
	 */
	getCurrentSummary() {
		return this.#errorHelpers.try(
			() => {
				if (!this.#renderMetrics) return { isRunning: this.#isRunning };
				const renderMetrics = this.#renderMetrics.getCurrentMetrics();

				return {
					fps: renderMetrics.fps,
					latency: {
						render: renderMetrics.avgRenderLatency,
						layout: renderMetrics.avgLayoutLatency,
						interaction: renderMetrics.avgInteractionLatency,
					},
					core: this.#metricsRegistry
						? this.#metricsRegistry.getAll()
						: {},
					memory: renderMetrics.memory,
					issues: this.#detectIssues(renderMetrics),
					isRunning: this.#isRunning,
					reportCount: this.#reportCount,
				};
			},
			{ isRunning: this.#isRunning },
			{ component: "MetricsReporter", operation: "getCurrentSummary" }
		);
	}

	/**
	 * Exports all raw and summarized metrics data for debugging or external analysis.
	 * @returns {object} A comprehensive object of all metrics data.
	 */
	exportData() {
		return this.#errorHelpers.try(
			() => {
				if (!this.#renderMetrics)
					return { config: { isRunning: this.#isRunning } };
				return {
					renderMetrics: this.#renderMetrics.exportData(),
					thresholds: { ...this.#thresholds },
					config: {
						interval: this.#interval,
						isRunning: this.#isRunning,
						reportCount: this.#reportCount,
					},
					summary: this.getCurrentSummary(),
				};
			},
			{ config: { isRunning: this.#isRunning } },
			{ component: "MetricsReporter", operation: "exportData" }
		);
	}

	/**
	 * Updates the performance thresholds used for alerting.
	 * @param {object} newThresholds - An object with new threshold values to merge.
	 */
	updateThresholds(newThresholds) {
		this.#errorHelpers.try(
			() => {
				this.#thresholds = {
					...this.#thresholds,
					...newThresholds,
				};
				console.log(
					"[MetricsReporter] Updated performance thresholds:",
					this.#thresholds
				);
			},
			{ component: "MetricsReporter", operation: "updateThresholds" }
		);
	}
}

export default MetricsReporter;
