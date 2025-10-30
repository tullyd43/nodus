// src/utils/MetricsRegistry.js

/**
 * A simple in-memory counter for application metrics.
 * This can be replaced by a more robust observability layer later.
 */
export class MetricsRegistry {
	constructor() {
		this.counters = {};
	}

	increment(metricName, value = 1) {
		this.counters[metricName] = (this.counters[metricName] ?? 0) + value;
	}

	get(metricName) {
		return this.counters[metricName] ?? 0;
	}
}
