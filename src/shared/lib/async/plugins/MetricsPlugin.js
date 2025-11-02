/**
 * @file MetricsPlugin.js
 * @description Metrics instrumentation for AsyncOrchestrator.
 */

const SAMPLE_SLOT = Symbol("async.metrics.sample");

/**
 * @typedef {import("../AsyncOrchestrator.js").AsyncRunContext} AsyncRunContext
 */

/**
 * @class MetricsPlugin
 * @classdesc Records counters and timing data for orchestrated async operations.
 */
export class MetricsPlugin {
	/**
	 * @param {{ metrics?: { increment?:(name:string, value?:number)=>void, updateAverage?:(name:string, value:number)=>void }, sampleRate?:number }} [options]
	 */
	constructor(options = {}) {
		this.name = "metrics";
		this.priority = 30;
		this.#metrics = options.metrics || null;
		this.#defaultSampleRate =
			typeof options.sampleRate === "number" ? options.sampleRate : 1;
	}

	/**
	 * Determines whether the plugin should run for the current context.
	 * @param {AsyncRunContext} context
	 * @returns {boolean}
	 */
	supports(context) {
		return !!this.#metrics && this.#resolveSampleRate(context) > 0;
	}

	/**
	 * Records start counters and sampling metadata.
	 * @param {AsyncRunContext} context
	 * @returns {void}
	 */
	beforeRun(context) {
		const sampled = this.#shouldSample(context);
		context.attach(SAMPLE_SLOT, sampled);
		if (!sampled) return;

		this.#metrics?.increment?.("async.started", 1);
		this.#metrics?.increment?.(`async.${context.label}.started`, 1);
	}

	/**
	 * Tracks successful completions.
	 * @param {AsyncRunContext} context
	 * @returns {void}
	 */
	onSuccess(context) {
		if (!this.#isSampled(context)) return;
		this.#metrics?.increment?.("async.success", 1);
		this.#metrics?.increment?.(`async.${context.label}.success`, 1);
	}

	/**
	 * Tracks failures.
	 * @param {AsyncRunContext} context
	 * @returns {void}
	 */
	onError(context) {
		if (!this.#isSampled(context)) return;
		const errorKey =
			context.error && context.error.name
				? context.error.name
				: "unknown_error";
		this.#metrics?.increment?.("async.failure", 1);
		this.#metrics?.increment?.(
			`async.${context.label}.failure.${errorKey}`,
			1
		);
	}

	/**
	 * Records completion counters and timing.
	 * @param {AsyncRunContext} context
	 * @returns {void}
	 */
	afterRun(context) {
		if (!this.#isSampled(context)) return;

		this.#metrics?.increment?.("async.completed", 1);
		this.#metrics?.increment?.(`async.${context.label}.completed`, 1);
		if (typeof context.durationMs === "number") {
			this.#metrics?.updateAverage?.(
				"async.duration_ms",
				context.durationMs
			);
			this.#metrics?.updateAverage?.(
				`async.${context.label}.duration_ms`,
				context.durationMs
			);
		}
	}

	/**
	 * Determines whether to sample the current run.
	 * @param {AsyncRunContext} context
	 * @returns {boolean}
	 */
	#shouldSample(context) {
		const rate = this.#resolveSampleRate(context);
		if (rate >= 1) return true;
		if (rate <= 0) return false;
		return Math.random() <= rate;
	}

	/**
	 * Fetches the sampling rate from context or defaults.
	 * @param {AsyncRunContext} context
	 * @returns {number}
	 */
	#resolveSampleRate(context) {
		const override = context.options?.metricsSampleRate;
		if (typeof override === "number") return this.#clampRate(override);

		const policyRate =
			context.options?.policyOverrides?.observability?.metrics_sample_rate;
		if (typeof policyRate === "number")
			return this.#clampRate(policyRate);

		return this.#clampRate(this.#defaultSampleRate);
	}

	/**
	 * Returns whether the run was sampled.
	 * @param {AsyncRunContext} context
	 * @returns {boolean}
	 */
	#isSampled(context) {
		return !!context.getAttachment(SAMPLE_SLOT);
	}

	/**
	 * Clamps the sampling rate to [0, 1].
	 * @param {number} value
	 * @returns {number}
	 */
	#clampRate(value) {
		if (Number.isNaN(value)) return 0;
		if (value <= 0) return 0;
		if (value >= 1) return 1;
		return value;
	}

	#metrics;
	#defaultSampleRate;
}

export default MetricsPlugin;
