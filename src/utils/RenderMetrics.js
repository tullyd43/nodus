/**
 * @class RenderMetrics
 * @description A utility class for collecting and analyzing real-time rendering performance metrics.
 * It tracks Frames Per Second (FPS), various latency types (render, layout, interaction),
 * memory usage, and other web vital statistics like Cumulative Layout Shift (CLS).
 *
 * @property {object} options - Configuration options for the metrics collector.
 * @property {number} fps - The current calculated Frames Per Second.
 * @property {number} frameCount - The total number of frames tracked since the last calculation.
 * @property {Set<Function>} subscribers - A set of callback functions to be invoked with metric updates.
 * @property {PerformanceObserver|null} performanceObserver - The observer for browser performance entries.
 */
export class RenderMetrics {
	/**
	 * Creates an instance of RenderMetrics.
	 * @param {object} [options={}] - Configuration options for the metrics collector.
	 * @param {number} [options.sampleSize=60] - The number of recent frames/latencies to average for calculations.
	 * @param {number} [options.reportInterval=1000] - The interval in milliseconds to emit metric updates.
	 * @param {boolean} [options.trackLatency=true] - Whether to track render, layout, and interaction latencies.
	 * @param {boolean} [options.trackMemory=false] - Whether to track JavaScript heap memory usage (can be expensive).
	 */
	constructor(options = {}) {
		this.options = {
			sampleSize: 60, // Number of frames to average
			reportInterval: 1000, // How often to emit updates (ms)
			trackLatency: true, // Track render latency
			trackMemory: false, // Track memory usage (expensive)
			...options,
		};

		// FPS tracking
		this.fps = 0;
		this.frameCount = 0;
		this.lastFrameTime = performance.now();
		this.frameTimes = [];

		// Latency tracking
		this.renderLatencies = [];
		this.layoutLatencies = [];
		this.interactionLatencies = [];

		// Memory tracking (if enabled)
		this.memoryStats = {
			usedJSHeapSize: 0,
			totalJSHeapSize: 0,
			jsHeapSizeLimit: 0,
		};

		// Subscribers for real-time updates
		this.subscribers = new Set();
		this.metricsHistory = [];

		// Performance observer for paint metrics
		this.setupPerformanceObserver();

		// Start the main tracking loop
		this.startTracking();
	}

	/**
	 * Starts the main tracking loop using `requestAnimationFrame` and sets up a periodic
	 * reporting interval to calculate and emit metrics.
	 */
	startTracking() {
		this.rafId = requestAnimationFrame(this.trackFrame.bind(this));

		// Set up periodic reporting
		this.reportInterval = setInterval(() => {
			this.calculateMetrics();
			this.emitUpdate();
		}, this.options.reportInterval);

		console.log("[RenderMetrics] Started tracking performance metrics");
	}

	/**
	 * Stops the tracking loop, clears the reporting interval, and disconnects the
	 * PerformanceObserver to clean up resources.
	 */
	stopTracking() {
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}

		if (this.reportInterval) {
			clearInterval(this.reportInterval);
			this.reportInterval = null;
		}

		if (this.performanceObserver) {
			this.performanceObserver.disconnect();
		}

		console.log("[RenderMetrics] Stopped tracking performance metrics");
	}

	/**
	 * The core tracking function called by `requestAnimationFrame`. It calculates the time
	 * since the last frame and stores it for FPS calculation.
	 * @private
	 * @param {DOMHighResTimeStamp} currentTime - The timestamp provided by `requestAnimationFrame`.
	 */
	trackFrame(currentTime) {
		this.frameCount++;

		// Calculate frame time
		const frameTime = currentTime - this.lastFrameTime;
		this.frameTimes.push(frameTime);

		// Keep only recent frames for averaging
		if (this.frameTimes.length > this.options.sampleSize) {
			this.frameTimes.shift();
		}

		this.lastFrameTime = currentTime;

		// Continue tracking
		this.rafId = requestAnimationFrame(this.trackFrame.bind(this));
	}

	/**
	 * Calculates the current metrics (like FPS and memory) based on the collected data.
	 * This method is called periodically by the reporting interval.
	 * @private
	 */
	calculateMetrics() {
		// Calculate FPS from frame times
		if (this.frameTimes.length > 0) {
			const avgFrameTime =
				this.frameTimes.reduce((sum, time) => sum + time, 0) /
				this.frameTimes.length;
			this.fps = Math.round(1000 / avgFrameTime);
		}

		// Track memory if enabled
		if (this.options.trackMemory && performance.memory) {
			this.memoryStats = {
				usedJSHeapSize: performance.memory.usedJSHeapSize,
				totalJSHeapSize: performance.memory.totalJSHeapSize,
				jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
			};
		}

		// Store historical data
		const metrics = this.getCurrentMetrics();
		this.metricsHistory.push({
			...metrics,
			timestamp: Date.now(),
		});

		// Keep only last 100 entries
		if (this.metricsHistory.length > 100) {
			this.metricsHistory.shift();
		}
	}

	/**
	 * Sets up a `PerformanceObserver` to listen for browser-native performance entries
	 * like 'paint', 'layout-shift', and custom 'measure' events.
	 * @private
	 */
	setupPerformanceObserver() {
		if (!("PerformanceObserver" in window)) {
			console.warn("[RenderMetrics] PerformanceObserver not supported");
			return;
		}

		try {
			this.performanceObserver = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					this.handlePerformanceEntry(entry);
				}
			});

			// Observe paint and layout metrics
			this.performanceObserver.observe({
				entryTypes: ["paint", "measure", "navigation", "layout-shift"],
			});
		} catch (error) {
			console.warn(
				"[RenderMetrics] Failed to setup PerformanceObserver:",
				error
			);
		}
	}

	/**
	 * Handles entries received from the `PerformanceObserver`, sorting them by type
	 * and recording the relevant data.
	 * @private
	 * @param {PerformanceEntry} entry - The performance entry to handle.
	 */
	handlePerformanceEntry(entry) {
		switch (entry.entryType) {
			case "paint":
				if (entry.name === "first-contentful-paint") {
					this.firstContentfulPaint = entry.startTime;
				}
				break;

			case "measure":
				if (entry.name.startsWith("grid-")) {
					this.recordCustomLatency("grid", entry.duration);
				}
				break;

			case "layout-shift":
				this.recordLayoutShift(entry.value);
				break;
		}
	}

	/**
	 * Records a render latency measurement.
	 * @param {number} latency - The duration of the render operation in milliseconds.
	 * @param {string} [operation="render"] - A descriptive name for the operation.
	 * @returns {void}
	 */
	recordRenderLatency(latency, operation = "render") {
		if (!this.options.trackLatency) return;

		this.renderLatencies.push({
			latency,
			operation,
			timestamp: Date.now(),
		});

		// Keep only recent latencies
		if (this.renderLatencies.length > this.options.sampleSize) {
			this.renderLatencies.shift();
		}
	}

	/**
	 * Records a layout latency measurement, typically for grid or DOM reflow operations.
	 * @param {number} latency - The duration of the layout operation in milliseconds.
	 * @param {string} [operation="layout"] - A descriptive name for the operation.
	 * @returns {void}
	 */
	recordLayoutLatency(latency, operation = "layout") {
		if (!this.options.trackLatency) return;

		this.layoutLatencies.push({
			latency,
			operation,
			timestamp: Date.now(),
		});

		if (this.layoutLatencies.length > this.options.sampleSize) {
			this.layoutLatencies.shift();
		}
	}

	/**
	 * Records an interaction latency measurement, capturing the time from user input
	 * to the resulting visual update.
	 * @param {number} latency - The duration of the interaction in milliseconds.
	 * @param {string} [interaction="unknown"] - A descriptive name for the interaction (e.g., 'click', 'drag').
	 * @returns {void}
	 */
	recordInteractionLatency(latency, interaction = "unknown") {
		if (!this.options.trackLatency) return;

		this.interactionLatencies.push({
			latency,
			interaction,
			timestamp: Date.now(),
		});

		if (this.interactionLatencies.length > this.options.sampleSize) {
			this.interactionLatencies.shift();
		}
	}

	/**
	 * A convenience method to record a latency measurement and categorize it automatically.
	 * @param {string} category - The category of the latency ('grid', 'render', or 'interaction').
	 * @param {number} latency - The duration of the operation in milliseconds.
	 * @returns {void}
	 */
	recordCustomLatency(category, latency) {
		switch (category) {
			case "grid":
				this.recordLayoutLatency(latency, "grid-operation");
				break;
			case "render":
				this.recordRenderLatency(latency, "component-render");
				break;
			case "interaction":
				this.recordInteractionLatency(latency, "user-interaction");
				break;
		}
	}

	/**
	 * Records a layout shift value, which contributes to the Cumulative Layout Shift (CLS) metric.
	 * @param {number} value - The layout shift score for a single event.
	 * @returns {void}
	 */
	recordLayoutShift(value) {
		// Store cumulative layout shift data
		if (!this.layoutShifts) {
			this.layoutShifts = [];
		}

		this.layoutShifts.push({
			value,
			timestamp: Date.now(),
		});

		// Keep only recent shifts
		if (this.layoutShifts.length > 50) {
			this.layoutShifts.shift();
		}
	}

	/**
	 * Gathers and calculates the current snapshot of all primary performance metrics.
	 * @returns {object} An object containing the current FPS, average latencies, memory usage, and other vitals.
	 */
	getCurrentMetrics() {
		const avgRenderLatency = this.calculateAverageLatency(
			this.renderLatencies
		);
		const avgLayoutLatency = this.calculateAverageLatency(
			this.layoutLatencies
		);
		const avgInteractionLatency = this.calculateAverageLatency(
			this.interactionLatencies
		);

		return {
			fps: this.fps,
			frameCount: this.frameCount,
			avgRenderLatency,
			avgLayoutLatency,
			avgInteractionLatency,
			memory: this.options.trackMemory ? this.memoryStats : null,
			firstContentfulPaint: this.firstContentfulPaint || null,
			cumulativeLayoutShift: this.calculateCLS(),
		};
	}

	/**
	 * Calculates the average latency from an array of latency entries.
	 * @private
	 * @param {Array<{latency: number}>} latencies - An array of latency objects.
	 * @returns {number} The calculated average latency, rounded to two decimal places.
	 */
	calculateAverageLatency(latencies) {
		if (latencies.length === 0) return 0;

		const sum = latencies.reduce(
			(total, entry) => total + entry.latency,
			0
		);
		return Math.round((sum / latencies.length) * 100) / 100; // Round to 2 decimal places
	}

	/**
	 * Calculates the total Cumulative Layout Shift (CLS) from all recorded shift events.
	 * @private
	 * @returns {number} The total CLS score.
	 */
	calculateCLS() {
		if (!this.layoutShifts || this.layoutShifts.length === 0) return 0;

		return this.layoutShifts.reduce((sum, shift) => sum + shift.value, 0);
	}

	/**
	 * Subscribes a callback function to receive real-time metric updates.
	 * @param {function(object): void} callback - The function to call with the latest metrics object.
	 * @returns {function(): void} An unsubscribe function that, when called, removes the subscription.
	 */
	onUpdate(callback) {
		this.subscribers.add(callback);

		// Return unsubscribe function
		return () => {
			this.subscribers.delete(callback);
		};
	}

	/**
	 * Emits the current metrics object to all registered subscribers.
	 * @private
	 */
	emitUpdate() {
		const metrics = this.getCurrentMetrics();

		for (const callback of this.subscribers) {
			try {
				callback(metrics);
			} catch (error) {
				console.warn("[RenderMetrics] Subscriber error:", error);
			}
		}
	}

	/**
	 * Generates a performance summary including current metrics, historical trends, and detected issues.
	 * @returns {object} A summary object containing current metrics, trends, and a list of issues.
	 */
	getPerformanceSummary() {
		const metrics = this.getCurrentMetrics();
		const history = this.metricsHistory.slice(-10); // Last 10 samples

		return {
			current: metrics,
			trend: {
				fps: {
					current: metrics.fps,
					avg:
						history.length > 0
							? Math.round(
									history.reduce((sum, h) => sum + h.fps, 0) /
										history.length
								)
							: metrics.fps,
					min:
						history.length > 0
							? Math.min(...history.map((h) => h.fps))
							: metrics.fps,
					max:
						history.length > 0
							? Math.max(...history.map((h) => h.fps))
							: metrics.fps,
				},
				latency: {
					render: metrics.avgRenderLatency,
					layout: metrics.avgLayoutLatency,
					interaction: metrics.avgInteractionLatency,
				},
			},
			issues: this.detectPerformanceIssues(metrics),
		};
	}

	/**
	 * Analyzes the current metrics against predefined thresholds to detect potential performance issues.
	 * @param {object} metrics - A metrics object from `getCurrentMetrics`.
	 * @returns {Array<{type: string, severity: string, message: string, suggestion: string}>} An array of detected issue objects.
	 */
	detectPerformanceIssues(metrics) {
		const issues = [];

		if (metrics.fps < 30) {
			issues.push({
				type: "low_fps",
				severity: metrics.fps < 15 ? "critical" : "warning",
				message: `Low frame rate: ${metrics.fps} FPS`,
				suggestion: "Consider enabling performance mode",
			});
		}

		if (metrics.avgRenderLatency > 16) {
			issues.push({
				type: "high_render_latency",
				severity:
					metrics.avgRenderLatency > 50 ? "critical" : "warning",
				message: `High render latency: ${metrics.avgRenderLatency}ms`,
				suggestion: "Optimize component rendering",
			});
		}

		if (metrics.avgLayoutLatency > 50) {
			issues.push({
				type: "high_layout_latency",
				severity:
					metrics.avgLayoutLatency > 100 ? "critical" : "warning",
				message: `High layout latency: ${metrics.avgLayoutLatency}ms`,
				suggestion: "Optimize grid operations",
			});
		}

		if (metrics.cumulativeLayoutShift > 0.1) {
			issues.push({
				type: "layout_instability",
				severity:
					metrics.cumulativeLayoutShift > 0.25
						? "critical"
						: "warning",
				message: `High layout shift: ${metrics.cumulativeLayoutShift.toFixed(3)}`,
				suggestion: "Reduce layout changes during interactions",
			});
		}

		return issues;
	}

	/**
	 * Exports all collected metrics data, including current values, history, and configuration,
	 * for debugging or external analysis.
	 * @returns {object} A comprehensive object containing all metrics data.
	 */
	exportData() {
		return {
			current: this.getCurrentMetrics(),
			history: this.metricsHistory,
			config: this.options,
			performance: this.getPerformanceSummary(),
		};
	}

	/**
	 * Resets all collected metrics and historical data to their initial state.
	 */
	reset() {
		this.frameCount = 0;
		this.frameTimes = [];
		this.renderLatencies = [];
		this.layoutLatencies = [];
		this.interactionLatencies = [];
		this.metricsHistory = [];
		this.layoutShifts = [];
		this.firstContentfulPaint = null;

		console.log("[RenderMetrics] Metrics reset");
	}

	/**
	 * A getter for the current FPS value.
	 * @type {number}
	 */
	get currentFPS() {
		return this.fps;
	}
}

export default RenderMetrics;
