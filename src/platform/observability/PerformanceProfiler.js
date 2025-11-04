/**
 * @file PerformanceProfiler.js
 * @description A utility for profiling and benchmarking performance-critical operations.
 * This will be used to validate the <5ms overhead SLA for forensic wrapping.
 */

/**
 * @class PerformanceProfiler
 * @description Provides methods to measure and report on code execution performance.
 */
export class PerformanceProfiler {
	constructor(stateManager) {
		this.stateManager = stateManager;
		this._samples = {};
	}

	// Start a named timer, returns a token
	start(name) {
		const t = { name, start: performance.now() };
		return t;
	}

	// Stop token and record sample
	stop(token) {
		const d = performance.now() - token.start;

		// Prefer to report samples via ActionDispatcher to respect observability flows
		try {
			const dispatcher = this.stateManager?.managers?.actionDispatcher;
			if (dispatcher?.dispatch) {
				/* PERFORMANCE_BUDGET: 1ms */
				dispatcher.dispatch("observability.perf.sample", {
					key: token.name,
					value: d,
					ts: Date.now(),
				});
			}
		} catch (e) {
			// Best-effort; log to observability logger if available
			this.stateManager?.managers?.observabilityLogger?.warn?.(
				"[PerfProfiler] sample report failed",
				e
			);
		}

		// Keep a lightweight local history for quick summaries without mutating shared state
		const arr = this._samples[token.name] || [];
		arr.push(d);
		if (arr.length > 1000) arr.shift();
		this._samples[token.name] = arr;

		return d;
	}

	// Get summary for a named measurement
	summary(name) {
		const arr = this._samples.get(name) || [];
		if (!arr.length) return null;
		const sum = arr.reduce((s, v) => s + v, 0);
		return {
			count: arr.length,
			avg: sum / arr.length,
			max: Math.max(...arr),
			min: Math.min(...arr),
		};
	}
}
