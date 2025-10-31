// src/utils/MetricsRegistry.js

/**
 * @class MetricsRegistry
 * @description A centralized, in-memory registry for application-wide metrics.
 * It supports counters, timers for performance measurement, and histograms for value distribution.
 * This provides a lightweight but powerful way to track events, performance, and data patterns.
 */
export class MetricsRegistry {
	/** @private @type {Object<string, object>} */
	#metrics = {};
	/** @private @type {string} */
	#prefix = "";

	/**
	 * Creates an instance of MetricsRegistry.
	 * @param {object} [options={}] - Configuration options.
	 * @param {string} [options.prefix=""] - A global prefix for all metric names.
	 */
	constructor(options = {}) {
		this.#prefix = options.prefix || "";
	}

	/**
	 * Increments the value of a given metric by a specified amount.
	 * If the metric does not exist, it is initialized to the given value.
	 * @param {string} metricName - The name of the metric to increment (e.g., 'cache_hits').
	 * @param {number} [value=1] - The amount to add to the counter.
	 * @param {object} [metadata={}] - Optional metadata like units.
	 * @returns {void}
	 */
	increment(metricName, value = 1, metadata = {}) {
		const key = this.#prefix + metricName;
		if (!this.#metrics[key]) {
			this.#metrics[key] = { type: "counter", value: 0, ...metadata };
		}
		this.#metrics[key].value += value;
	}

	/**
	 * Records a timing measurement for an operation.
	 * @param {string} metricName - The name of the timer metric (e.g., 'db_query_duration').
	 * @param {number} duration - The duration of the operation in milliseconds.
	 * @returns {void}
	 */
	timer(metricName, duration) {
		const key = this.#prefix + metricName;
		if (!this.#metrics[key]) {
			this.#metrics[key] = {
				type: "timer",
				unit: "ms",
				count: 0,
				total: 0,
				min: Infinity,
				max: -Infinity,
				avg: 0,
			};
		}

		const metric = this.#metrics[key];
		metric.count++;
		metric.total += duration;
		metric.min = Math.min(metric.min, duration);
		metric.max = Math.max(metric.max, duration);
		metric.avg = metric.total / metric.count;
	}

	/**
	 * Adds a value to a histogram, tracking its distribution.
	 * @param {string} metricName - The name of the histogram metric (e.g., 'request_payload_size').
	 * @param {number} value - The value to record.
	 * @param {object} [metadata={}] - Optional metadata like units.
	 * @returns {void}
	 */
	histogram(metricName, value, metadata = {}) {
		const key = this.#prefix + metricName;
		if (!this.#metrics[key]) {
			this.#metrics[key] = {
				type: "histogram",
				count: 0,
				total: 0,
				min: Infinity,
				max: -Infinity,
				avg: 0,
				...metadata,
			};
		}

		const metric = this.#metrics[key];
		metric.count++;
		metric.total += value;
		metric.min = Math.min(metric.min, value);
		metric.max = Math.max(metric.max, value);
		metric.avg = metric.total / metric.count;
	}

	/**
	 * Sets the value of a gauge metric. Gauges are useful for values that can go up or down.
	 * @param {string} metricName - The name of the gauge metric (e.g., 'cache_size').
	 * @param {number} value - The value to set.
	 * @param {object} [metadata={}] - Optional metadata like units.
	 * @returns {void}
	 */
	set(metricName, value, metadata = {}) {
		const key = this.#prefix + metricName;
		if (!this.#metrics[key]) {
			this.#metrics[key] = { type: "gauge", ...metadata };
		}
		this.#metrics[key].value = value;
	}

	/**
	 * A higher-order function that returns a decorator to measure the execution time of a method.
	 * This aligns with Mandate 4.3 for standardized performance metric reporting.
	 * @param {string} metricName - The name for the timer metric.
	 * @param {object} [tags={}] - Optional tags to associate with the metric.
	 * @returns {function(Function): Function} A function that takes a method and returns a wrapped version of it.
	 * @example
	 * // In a class constructor:
	 * this.criticalOperation = this.metrics.measure('critical_op')(this.criticalOperation.bind(this));
	 */
	measure(metricName, tags = {}) {
		return (originalMethod) =>
			(...args) => {
				const startTime = performance.now();
				try {
					const result = originalMethod(...args);
					// Handle async methods
					if (result && typeof result.then === "function") {
						return result.finally(() => {
							const duration = performance.now() - startTime;
							this.timer(metricName, duration, tags);
						});
					}
					// Handle sync methods
					const duration = performance.now() - startTime;
					this.timer(metricName, duration, tags);
					return result;
				} catch (error) {
					const duration = performance.now() - startTime;
					this.timer(metricName, duration, { ...tags, error: true });
					throw error;
				}
			};
	}

	/**
	 * Retrieves the current value of a specific metric.
	 * @param {string} metricName - The name of the metric to retrieve.
	 * @returns {object|undefined} The current metric object, or undefined if not found.
	 */
	get(metricName) {
		return this.#metrics[this.#prefix + metricName];
	}

	/**
	 * Retrieves a copy of all tracked metrics.
	 * @returns {Object<string, object>} An object containing all metric names and their data.
	 */
	getAll() {
		// Create a deep copy to prevent external modification
		return JSON.parse(JSON.stringify(this.#metrics));
	}

	/**
	 * Retrieves all tracked metrics as a simple key-value object.
	 * @returns {Object<string, object>} An object containing all metric names and their data.
	 */
	getAllAsObject() {
		const obj = {};
		for (const key in this.#metrics) {
			if (Object.prototype.hasOwnProperty.call(this.#metrics, key)) {
				// Return a copy to prevent mutation
				obj[key] = { ...this.#metrics[key] };
			}
		}
		return obj;
	}

	/**
	 * Resets one or all metric counters to zero.
	 * @param {string} [metricName] - The specific metric to reset. If not provided, all metrics will be reset.
	 * @returns {void}
	 */
	reset(metricName) {
		const key = this.#prefix + metricName;
		if (metricName && this.#metrics[key]) {
			delete this.#metrics[key];
		} else {
			this.#metrics = {};
		}
	}

	/**
	 * Creates a new MetricsRegistry instance with a specified namespace,
	 * allowing for hierarchical metric organization.
	 * @param {string} namespace - The namespace to prepend to all metrics from the new instance.
	 * @returns {MetricsRegistry} A new, namespaced MetricsRegistry instance that shares the same data store.
	 * @example
	 * const coreRegistry = registry.namespace('core');
	 * coreRegistry.increment('init_count'); // Creates metric 'core.init_count'
	 */
	namespace(namespace) {
		// Create a new object that inherits from this instance's prototype.
		const newRegistry = Object.create(Object.getPrototypeOf(this));
		// Copy properties from the current instance to the new one.
		Object.assign(newRegistry, this);
		// Set the new, more specific prefix.
		newRegistry.#prefix = `${this.#prefix}${namespace}.`;
		newRegistry.#metrics = this.#metrics;
		return newRegistry;
	}
}
