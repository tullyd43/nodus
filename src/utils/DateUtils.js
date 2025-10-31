/**
 * @file DateUtils.js
 * @description A lightweight, dependency-free, and high-performance suite of date and time utilities.
 * This module provides a set of static methods for common date operations, ensuring consistency
 * and replacing the need for external libraries in accordance with Mandate 1.4.
 *
 * @see {@link ../../DEVELOPER_MANDATES.md} - Mandate 1.4: Zero New Runtime Dependencies
 */

/**
 * @class DateUtilsError
 * @description Custom error class for exceptions thrown by the DateUtils module.
 * This allows callers to specifically catch errors from this utility.
 * @extends Error
 */
export class DateUtilsError extends Error {
	constructor(message) {
		super(message);
		this.name = "DateUtilsError";
	}
}

/**
 * @class ImmutableDateTime
 * @description An immutable wrapper around the native JavaScript `Date` object.
 * It prevents accidental mutations of date values. Any method that would typically
 * modify the date returns a new `ImmutableDateTime` instance instead.
 * All standard `Date.prototype` getters are proxied for convenience.
 */
export class ImmutableDateTime {
	/** @private */
	#date;

	/**
	 * @param {Date|number|string} dateInput - A Date object, timestamp, or date string.
	 * @throws {DateUtilsError} if the dateInput is invalid.
	 */
	constructor(dateInput) {
		this.#date = new Date(dateInput);
		if (isNaN(this.#date.getTime())) {
			throw new DateUtilsError(
				`Invalid date provided to ImmutableDateTime: ${dateInput}`
			);
		}
		// Freeze the object to prevent adding new properties.
		Object.freeze(this);
	}

	/**
	 * Returns the primitive value (Unix timestamp in milliseconds).
	 * @returns {number}
	 */
	valueOf() {
		return this.#date.getTime();
	}

	/**
	 * Returns a new, mutable native `Date` object from the instance.
	 * @returns {Date} A new `Date` instance to prevent mutation of the internal state.
	 */
	toDate() {
		return new Date(this.#date);
	}

	// --- Proxy all standard Date.prototype getters for convenience ---
	getFullYear() {
		return this.#date.getFullYear();
	}
	getMonth() {
		return this.#date.getMonth();
	}
	getDate() {
		return this.#date.getDate();
	}
	getDay() {
		return this.#date.getDay();
	}
	getHours() {
		return this.#date.getHours();
	}
	getMinutes() {
		return this.#date.getMinutes();
	}
	getSeconds() {
		return this.#date.getSeconds();
	}
	getMilliseconds() {
		return this.#date.getMilliseconds();
	}
	getTime() {
		return this.#date.getTime();
	}
	getTimezoneOffset() {
		return this.#date.getTimezoneOffset();
	}
	getUTCFullYear() {
		return this.#date.getUTCFullYear();
	}
	getUTCMonth() {
		return this.#date.getUTCMonth();
	}
	getUTCDate() {
		return this.#date.getUTCDate();
	}
	getUTCDay() {
		return this.#date.getUTCDay();
	}
	getUTCHours() {
		return this.#date.getUTCHours();
	}
	getUTCMinutes() {
		return this.#date.getUTCMinutes();
	}
	getUTCSeconds() {
		return this.#date.getUTCSeconds();
	}
	getUTCMilliseconds() {
		return this.#date.getUTCMilliseconds();
	}
	toISOString() {
		return this.#date.toISOString();
	}
	toJSON() {
		return this.#date.toJSON();
	}
	toLocaleDateString(locales, options) {
		return this.#date.toLocaleDateString(locales, options);
	}
	toLocaleString(locales, options) {
		return this.#date.toLocaleString(locales, options);
	}
	toLocaleTimeString(locales, options) {
		return this.#date.toLocaleTimeString(locales, options);
	}
	toString() {
		return this.#date.toString();
	}
	toDateString() {
		return this.#date.toDateString();
	}
	toTimeString() {
		return this.#date.toTimeString();
	}
	toUTCString() {
		return this.#date.toUTCString();
	}
}

/**
 * @class DateUtils
 * @description A static class providing a suite of dependency-free date and time utilities.
 */
export class DateUtils {
	/**
	 * Returns the current time as a high-resolution Unix timestamp in milliseconds.
	 * This is the primary method for getting a numeric timestamp.
	 * @returns {number} The number of milliseconds since the Unix epoch.
	 */
	static timestamp() {
		return Date.now();
	}

	/**
	 * Returns the current time as a full ISO 8601 timestamp string in UTC.
	 * @example "2024-01-01T12:00:00.000Z"
	 * @returns {string} The ISO timestamp string.
	 */
	static now() {
		return new Date().toISOString();
	}

	/**
	 * Safely converts various input types into a valid `ImmutableDateTime` object.
	 * Throws a `DateUtilsError` if the input is invalid or unparseable.
	 * @param {Date|ImmutableDateTime|number|string} input - The value to convert.
	 * @returns {ImmutableDateTime} The converted `ImmutableDateTime` object.
	 * @throws {DateUtilsError} if the input cannot be parsed into a valid date.
	 */
	static toDate(input) {
		if (input instanceof ImmutableDateTime) {
			return input;
		}
		// The constructor handles validation and throws DateUtilsError on failure.
		return new ImmutableDateTime(input);
	}

	/**
	 * Formats a date into an ISO date string (YYYY-MM-DD) in the *local* timezone.
	 * @param {Date|number|string} date - The date to format.
	 * @returns {string} The formatted date string in the local timezone.
	 */
	static toISODateLocal(date) {
		const d = this.toDate(date);
		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	/**
	 * Formats a date into a `datetime-local` input string (YYYY-MM-DDTHH:mm) in the *local* timezone.
	 * @param {Date|number|string} date - The date to format.
	 * @returns {string} The formatted datetime-local string.
	 */
	static toDateTimeLocal(date) {
		const d = this.toDate(date);
		const pad = (n) => String(n).padStart(2, "0");
		const year = d.getFullYear();
		const month = pad(d.getMonth() + 1);
		const day = pad(d.getDate());
		const hours = pad(d.getHours());
		const minutes = pad(d.getMinutes());
		return `${year}-${month}-${day}T${hours}:${minutes}`;
	}

	/**
	 * Parses a time string (HH:mm) into the number of minutes from midnight.
	 * @param {string} timeString - The time string to parse (e.g., "14:30").
	 * @returns {number} The number of minutes from midnight.
	 * @throws {DateUtilsError} if the time string is invalid.
	 */
	static parseTimeString(timeString) {
		if (typeof timeString !== "string" || !/^\d{2}:\d{2}$/.test(timeString)) {
			throw new DateUtilsError(
				`Invalid time string format: ${timeString}. Expected HH:mm.`
			);
		}
		const [hours, minutes] = timeString.split(":").map(Number);
		if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
			throw new DateUtilsError(`Invalid time value: ${timeString}.`);
		}
		return hours * 60 + minutes;
	}

	/**
	 * Converts a duration in milliseconds into a human-readable string (e.g., "2 days, 3 hours").
	 * @param {number} ms - The duration in milliseconds.
	 * @param {object} [options={}] - Formatting options.
	 * @param {number} [options.maxUnits=2] - The maximum number of time units to display.
	 * @param {boolean} [options.compact=false] - If true, uses short unit names (e.g., "2d 3h").
	 * @returns {string} The human-readable duration string.
	 */
	static humanizeDuration(ms, { maxUnits = 2, compact = false } = {}) {
		if (typeof ms !== "number" || !Number.isFinite(ms)) {
			return compact ? "0s" : "0 seconds";
		}

		const units = [
			{ name: "year", short: "y", ms: 31_536_000_000 },
			{ name: "month", short: "mo", ms: 2_592_000_000 },
			{ name: "week", short: "w", ms: 604_800_000 },
			{ name: "day", short: "d", ms: 86_400_000 },
			{ name: "hour", short: "h", ms: 3_600_000 },
			{ name: "minute", short: "m", ms: 60_000 },
			{ name: "second", short: "s", ms: 1_000 },
		];

		const parts = [];
		let remaining = Math.abs(ms);

		for (const unit of units) {
			if (parts.length >= maxUnits || remaining < unit.ms) continue;

			const count = Math.floor(remaining / unit.ms);
			if (count > 0) {
				const name = compact
					? unit.short
					: ` ${unit.name}${count !== 1 ? "s" : ""}`;
				parts.push(`${count}${name}`);
				remaining -= count * unit.ms;
			}
		}

		if (parts.length === 0) {
			if (ms < 1000 && ms > 0) {
				return compact ? "<1s" : "less than 1 second";
			}
			return compact ? "0s" : "0 seconds";
		}

		return parts.join(compact ? " " : ", ");
	}
}

// For backward compatibility and ease of use, we export the main class as the default.
// The previous `DateCore` and `MonitoredDateUtils` are now replaced by this single, clean class.
export { DateUtils as DateCore };
export default DateUtils;
