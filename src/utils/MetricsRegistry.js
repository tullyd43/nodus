// src/utils/MetricsRegistry.js

/**
 * @class MetricsRegistry
 * @description A simple, centralized, in-memory counter for application-wide metrics.
 * It provides a lightweight way to track occurrences of various events (e.g., errors,
 * cache hits, sync operations) without needing a full observability library.
 */
export class MetricsRegistry {
	/**
	 * Creates an instance of MetricsRegistry.
	 */
	constructor() {
		/**
		 * An object storing the metric names as keys and their numeric counts as values.
		 * @private
		 * @type {Object<string, number>}
		 */
		this.counters = {};
	}

	/**
	 * Increments the value of a given metric by a specified amount.
	 * If the metric does not exist, it is initialized to the given value.
	 * @param {string} metricName - The name of the metric to increment (e.g., 'cache_hits').
	 * @param {number} [value=1] - The amount to add to the counter. Defaults to 1.
	 * @returns {void}
	 */
	increment(metricName, value = 1) {
		this.counters[metricName] = (this.counters[metricName] ?? 0) + value;
	}

	/**
	 * Retrieves the current value of a specific metric.
	 * @param {string} metricName - The name of the metric to retrieve.
	 * @returns {number} The current value of the metric, or 0 if it has not been set.
	 */
	get(metricName) {
		return this.counters[metricName] ?? 0;
	}

	/**
	 * Retrieves a copy of all tracked metrics.
	 * @returns {Object<string, number>} An object containing all metric names and their current values.
	 */
	getAll() {
		return { ...this.counters };
	}

	/**
	 * Resets one or all metric counters to zero.
	 * @param {string} [metricName] - The specific metric to reset. If not provided, all metrics will be reset.
	 * @returns {void}
	 */
	reset(metricName) {
		if (metricName) {
			delete this.counters[metricName];
		} else {
			this.counters = {};
		}
	}
}
