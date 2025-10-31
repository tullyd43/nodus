/**
 * @file DateUtils.js
 * @description A lightweight, high-performance, and fully integrated suite of date and time utilities for Nodus.
 * This module replaces the legacy, isolated DateUtils system with a streamlined and maintainable alternative.
 */

/**
 * @class ImmutableDateTime
 * @description An immutable wrapper around the native JavaScript Date object.
 * It prevents accidental mutations of date values. Any method that "modifies"
 * the date returns a new ImmutableDateTime instance.
 */
export class ImmutableDateTime {
	/** @private */
	#date;

	/**
	 * @param {Date|number|string} dateInput - A Date object, timestamp, or date string.
	 */
	constructor(dateInput) {
		this.#date = new Date(dateInput);
		if (isNaN(this.#date.getTime())) {
			throw new Error("Invalid date provided to ImmutableDateTime.");
		}
		// Freeze the object to prevent adding new properties.
		Object.freeze(this);
	}

	/**
	 * Returns the underlying primitive value (Unix timestamp).
	 * @returns {number}
	 */
	valueOf() {
		return this.#date.getTime();
	}

	/**
	 * Returns the native Date object. Use with caution, as it is mutable.
	 * This is primarily for compatibility with external libraries.
	 * @returns {Date} A new Date instance to prevent mutation of the internal state.
	 */
	toDate() {
		return new Date(this.#date);
	}

	// --- Add other getter methods as needed, e.g., getFullYear, toISOString ---
}

/**
 * @class DateCore
 * @description Provides fundamental, high-reliability date and time operations.
 * All methods are wrapped for performance tracking and error handling.
 */
export class DateCore {
	/**
	 * Returns the current time as a Unix timestamp (milliseconds).
	 * This is the primary method for getting a numeric timestamp.
	 * @returns {number} The number of milliseconds since the Unix epoch.
	 */
	static timestamp() {
		return Date.now();
	}

	/**
	 * Returns the current time as a full ISO 8601 timestamp string in UTC.
	 * e.g., "2024-01-01T12:00:00.000Z"
	 * @returns {string} The ISO timestamp string.
	 */
	static now() {
		return new Date().toISOString();
	}

	/**
	 * Safely converts various input types (Date, number, string) into a valid `Date` object.
	 * Throws a standardized `AppError` if the input is invalid or unparseable.
	 * @param {Date|ImmutableDateTime|number|string} input - The value to convert.
	 * @returns {ImmutableDateTime} The converted `ImmutableDateTime` object.
	 */
	static toDate(input) {
		// The ImmutableDateTime constructor handles Date, number, and string types.
		// We can centralize the validation and conversion logic there.
		try {
			if (input instanceof ImmutableDateTime) {
				return input;
			}
			return new ImmutableDateTime(input);
		} catch (error) {
			// Re-throw as a generic error; the wrapper will format it.
			throw new Error(`Invalid date input: ${input}`);
		}
	}

	/**
	 * Formats a date into an ISO date string (YYYY-MM-DD) in the local timezone.
	 * @param {Date|number|string} date - The date to format.
	 * @returns {string} The formatted date string in the local timezone.
	 */
	static toISODateLocal(date) {
		const d = this.toDate(date).toDate(); // Get the native Date object for formatting
		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	/**
	 * Formats a date into a string suitable for HTML `<input type="datetime-local">`.
	 * Correctly uses the local timezone. Format: YYYY-MM-DDTHH:mm
	 * @param {Date|number|string} date - The date to format.
	 * @returns {string} The formatted datetime-local string.
	 */
	static toDateTimeLocal(date) {
		const d = this.toDate(date).toDate(); // Get the native Date object for formatting
		const pad = (n) => String(n).padStart(2, "0");
		const year = d.getFullYear();
		const month = pad(d.getMonth() + 1);
		const day = pad(d.getDate());
		const hours = pad(d.getHours());
		const minutes = pad(d.getMinutes());
		return `${year}-${month}-${day}T${hours}:${minutes}`;
	}

	/**
	 * Converts a duration in milliseconds into a human-readable string.
	 * @param {number} ms - The duration in milliseconds.
	 * @param {object} [options={}] - Formatting options.
	 * @param {number} [options.maxUnits=2] - The maximum number of time units to display.
	 * @param {boolean} [options.compact=false] - If true, uses short unit names (e.g., "2d 3h").
	 * @returns {string} The human-readable duration string.
	 */
	static humanizeDuration(ms, { maxUnits = 2, compact = false } = {}) {
		if (typeof ms !== "number" || !isFinite(ms)) {
			return compact ? "0s" : "0 seconds";
		}

		const units = [
			{ name: "year", short: "y", ms: 31536000000 },
			{ name: "month", short: "mo", ms: 2592000000 },
			{ name: "week", short: "w", ms: 604800000 },
			{ name: "day", short: "d", ms: 86400000 },
			{ name: "hour", short: "h", ms: 3600000 },
			{ name: "minute", short: "m", ms: 60000 },
			{ name: "second", short: "s", ms: 1000 },
		];

		const parts = [];
		let remaining = Math.abs(ms);

		for (const unit of units) {
			if (parts.length >= maxUnits) break;
			const count = Math.floor(remaining / unit.ms);
			if (count > 0) {
				if (compact) {
					parts.push(`${count}${unit.short}`);
				} else {
					parts.push(
						`${count} ${unit.name}${count !== 1 ? "s" : ""}`
					);
				}
				remaining -= count * unit.ms;
			}
		}

		if (parts.length === 0) {
			return compact ? "0s" : "0 seconds";
		}

		return parts.join(compact ? " " : ", ");
	}
}

/**
 * @description A proxy that wraps all static methods of `DateCore` with integrated
 * performance tracking and error handling. This ensures that every date operation
 * is automatically monitored without needing to wrap each call individually.
 */
export const MonitoredDateUtils = new Proxy(DateCore, {
	// This proxy requires ErrorHelpers, which must be passed in context, not imported.
	// The implementation below assumes ErrorHelpers will be on the context object.

	get(target, prop, receiver) {
		const originalMethod = target[prop];
		if (
			typeof originalMethod !== "function" ||
			!Object.prototype.hasOwnProperty.call(target, prop)
		) {
			return Reflect.get(target, prop, receiver);
		}

		// Return a wrapped version of the static method
		return function (...args) {
			// The first argument to a utility might be the context object
			const context =
				args[0] &&
				typeof args[0] === "object" &&
				args[0].stateManager?.managers?.errorHelpers
					? args.shift()
					: {};

			const errorHelpers = context.stateManager?.managers?.errorHelpers;
			if (!errorHelpers) {
				// If no error helpers, just run the original method.
				return originalMethod.apply(this, args);
			}

			const fn = () => originalMethod.apply(this, args);
			const wrappedFn = errorHelpers.withPerformanceTracking(
				fn,
				`DateUtils.${prop}`
			);

			return ErrorHelpers.captureSync(wrappedFn, context.eventFlow, {
				component: `DateUtils.${prop}`,
				...context,
			});
		};
	},
});

export default MonitoredDateUtils;
