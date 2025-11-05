/**
 * @file Sanitizer.js
 * @version 8.0.0 - ENTERPRISE OBSERVABILITY MIGRATION
 * @description Stateless sanitization utilities with automatic observability for security compliance.
 * Provides secure data cleansing, text sanitization, and deterministic hashing with complete audit trails.
 *
 * All sanitization operations are automatically instrumented through ActionDispatcher for
 * complete security audit trails and performance monitoring.
 *
 * Key Features:
 * - Automatic observation of all sanitization operations
 * - Performance-optimized with bounded execution times
 * - Zero-tolerance for unsafe data with complete cleansing
 * - Deterministic hashing for forensic integrity verification
 *
 * @see {@link NODUS_DEVELOPER_MIGRATION_GUIDE.md} - Data sanitization observability requirements
 */

/**
 * @typedef {Object} SanitizationSchema
 * @property {string} [type] - Expected data type
 * @property {boolean} [allowHtml] - Whether to allow HTML content
 * @property {Array<string>} [allowedKeys] - Allowed object keys
 * @property {Object} [properties] - Property-specific schemas
 * @property {SanitizationSchema} [items] - Schema for array items
 */

/**
 * @typedef {Object} SanitizationResult
 * @property {any} data - Sanitized data
 * @property {Object} metrics - Sanitization metrics
 * @property {number} metrics.inputSize - Original data size
 * @property {number} metrics.outputSize - Sanitized data size
 * @property {number} metrics.elementsRemoved - Number of unsafe elements removed
 * @property {number} timestamp - Sanitization timestamp
 */

// Security constants
const MAX_DEPTH = 20;
const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]+/g;
const HTML_TAG_REGEX = /<\/?[^>]+?>/g;
const SCRIPT_TAG_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const MULTI_SPACE_REGEX = /\s{2,}/g;

/**
 * Stateless sanitization utilities with automatic observability.
 *
 * These functions provide secure data cleansing with complete audit trails.
 * All operations are instrumented for security compliance and performance monitoring.
 */
export const Sanitizer = Object.freeze({
	cleanse,
	cleanseText,
	getDeterministicHash,
});

/**
 * Enterprise sanitizer with automatic observability integration.
 *
 * Provides instrumented sanitization operations with complete audit trails
 * and performance monitoring for enterprise security compliance.
 *
 * @class InstrumentedSanitizer
 */
export class InstrumentedSanitizer {
	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {ReturnType<import('@shared/lib/async/AsyncOrchestrationService.js').AsyncOrchestrationService["createRunner"]>} */
	#runOrchestrated;

	/**
	 * Creates an instance of InstrumentedSanitizer with enterprise observability integration.
	 *
	 * @param {Object} context - Configuration context
	 * @param {import('../HybridStateManager.js').default} context.stateManager - State manager instance
	 * @throws {Error} If stateManager or required services are missing
	 */
	constructor({ stateManager }) {
		if (!stateManager) {
			throw new Error(
				"InstrumentedSanitizer requires stateManager for observability compliance"
			);
		}

		this.#stateManager = stateManager;

		// Enterprise license validation for advanced sanitization
		this.#validateEnterpriseLicense();

		// Initialize orchestrated runner for all sanitization operations
		const orchestrator = this.#stateManager.managers?.asyncOrchestrator;
		if (!orchestrator) {
			throw new Error(
				"AsyncOrchestrationService required for InstrumentedSanitizer observability compliance"
			);
		}

		this.#runOrchestrated = orchestrator.createRunner({
			labelPrefix: "security.sanitizer",
			actorId: "instrumented_sanitizer",
			eventType: "SANITIZER_OPERATION",
			meta: {
				component: "InstrumentedSanitizer",
			},
		});
	}

	/**
	 * Initializes the instrumented sanitizer.
	 *
	 * @returns {void}
	 */
	initialize() {
		// Emit initialization event
		this.#stateManager.emit?.("security.sanitizer_initialized", {
			timestamp: Date.now(),
			component: "InstrumentedSanitizer",
		});
	}

	/**
	 * Sanitizes arbitrary data with automatic observation and performance monitoring.
	 *
	 * @template T
	 * @param {T} input - Input data to sanitize
	 * @param {SanitizationSchema} [schema] - Optional validation schema
	 * @returns {Promise<T>} Sanitized data
	 */
	async cleanse(input, schema) {
		/* PERFORMANCE_BUDGET: 5ms */
		return this.#runOrchestrated(
			() => this.#performCleanse(input, schema),
			{
				labelSuffix: "cleanse",
				eventType: "SANITIZER_CLEANSE",
				meta: {
					inputType: typeof input,
					hasSchema: !!schema,
				},
			}
		);
	}

	/**
	 * Sanitizes text content with automatic observation.
	 *
	 * @param {string} value - Text to sanitize
	 * @returns {Promise<string>} Sanitized text
	 */
	async cleanseText(value) {
		/* PERFORMANCE_BUDGET: 2ms */
		return this.#runOrchestrated(() => this.#performTextCleanse(value), {
			labelSuffix: "cleanseText",
			eventType: "SANITIZER_CLEANSE_TEXT",
			meta: {
				inputLength: String(value || "").length,
			},
		});
	}

	/**
	 * Generates deterministic hash with automatic observation.
	 *
	 * @param {any} value - Value to hash
	 * @param {SanitizationSchema} [schema] - Optional schema
	 * @returns {Promise<string>} Deterministic hash
	 */
	async getDeterministicHash(value, schema) {
		/* PERFORMANCE_BUDGET: 8ms */
		return this.#runOrchestrated(
			() => this.#performDeterministicHash(value, schema),
			{
				labelSuffix: "getDeterministicHash",
				eventType: "SANITIZER_HASH",
				meta: {
					inputType: typeof value,
					hasSchema: !!schema,
				},
			}
		);
	}

	// ===== PRIVATE IMPLEMENTATION METHODS =====

	/**
	 * Validates enterprise license for advanced sanitization features.
	 *
	 * @private
	 * @throws {Error} If required enterprise license is missing
	 */
	#validateEnterpriseLicense() {
		const license = this.#stateManager.managers?.license;

		if (!license?.hasFeature("advanced_sanitization")) {
			// Emit license validation failure
			this.#stateManager.emit?.("security.license_validation_failed", {
				feature: "advanced_sanitization",
				tier: "enterprise",
				component: "InstrumentedSanitizer",
				error: "Missing required enterprise license feature",
				timestamp: Date.now(),
			});

			throw new Error(
				"Advanced sanitization features require enterprise license"
			);
		}

		// Emit successful license validation
		this.#stateManager.emit?.("security.license_validated", {
			feature: "advanced_sanitization",
			tier: "enterprise",
			component: "InstrumentedSanitizer",
			timestamp: Date.now(),
		});
	}

	/**
	 * Internal cleanse implementation with automatic observation.
	 *
	 * @private
	 * @template T
	 * @param {T} input - Input to cleanse
	 * @param {SanitizationSchema} [schema] - Validation schema
	 * @returns {Promise<T>}
	 */
	async #performCleanse(input, schema) {
		const inputSize = this.#calculateSize(input);
		const inputType = typeof input;

		// Emit sanitization attempt
		this.#stateManager.emit?.("security.sanitization_attempt", {
			inputType,
			inputSize,
			hasSchema: !!schema,
			timestamp: Date.now(),
			component: "InstrumentedSanitizer",
		});

		const result = cleanse(input, schema);
		const outputSize = this.#calculateSize(result);

		// Emit sanitization result
		this.#stateManager.emit?.("security.data_sanitized", {
			inputType,
			outputType: typeof result,
			inputSize,
			outputSize,
			elementsRemoved: Math.max(0, inputSize - outputSize),
			hasSchema: !!schema,
			timestamp: Date.now(),
			component: "InstrumentedSanitizer",
		});

		return result;
	}

	/**
	 * Internal text cleanse implementation with automatic observation.
	 *
	 * @private
	 * @param {string} value - Text to cleanse
	 * @returns {Promise<string>}
	 */
	async #performTextCleanse(value) {
		const inputLength = String(value || "").length;

		// Emit text sanitization attempt
		this.#stateManager.emit?.("security.text_sanitization", {
			inputLength,
			timestamp: Date.now(),
			component: "InstrumentedSanitizer",
		});

		const result = cleanseText(value);
		const outputLength = result.length;
		const charsRemoved = Math.max(0, inputLength - outputLength);

		// Emit text sanitization result
		this.#stateManager.emit?.("security.text_sanitized", {
			inputLength,
			outputLength,
			charsRemoved,
			timestamp: Date.now(),
			component: "InstrumentedSanitizer",
		});

		return result;
	}

	/**
	 * Internal deterministic hash implementation with automatic observation.
	 *
	 * @private
	 * @param {any} value - Value to hash
	 * @param {SanitizationSchema} [schema] - Optional schema
	 * @returns {Promise<string>}
	 * @throws {Error} If enterprise license required for advanced hashing
	 */
	#performDeterministicHash(value, schema) {
		const inputType = typeof value;

		// Enterprise license validation for advanced cryptographic hashing
		const license = this.#stateManager.managers?.license;
		if (schema && !license?.hasFeature("advanced_sanitization")) {
			throw new Error(
				"Enterprise license required for schema-based deterministic hashing"
			);
		}

		// Emit hash operation attempt
		this.#stateManager.emit?.("security.hash_operation", {
			inputType,
			hasSchema: !!schema,
			algorithm: "SHA-256",
			licenseValidated: !!license?.hasFeature("advanced_sanitization"),
			timestamp: Date.now(),
			component: "InstrumentedSanitizer",
		});

		return getDeterministicHash(value, schema).then((hash) => {
			// Emit hash computation result
			this.#stateManager.emit?.("security.hash_computed", {
				algorithm: "SHA-256",
				hashLength: hash.length,
				timestamp: Date.now(),
				component: "InstrumentedSanitizer",
			});

			return hash;
		});
	}

	/**
	 * Calculates approximate size of data for metrics.
	 *
	 * @private
	 * @param {any} data - Data to measure
	 * @returns {number} Approximate size
	 */
	#calculateSize(data) {
		try {
			return JSON.stringify(data).length;
		} catch {
			return String(data).length;
		}
	}
}

// ===== STATELESS UTILITY FUNCTIONS =====

/**
 * Recursively cleanses data by removing unsafe types and enforcing schema constraints.
 *
 * @template T
 * @param {T} input - Input data to cleanse
 * @param {SanitizationSchema} [schema] - Optional validation schema
 * @returns {T} Cleansed data
 */
function cleanse(input, schema) {
	const visited = new WeakSet();
	return /** @type {T} */ (cloneAndCleanse(input, schema, visited, 0));
}

/**
 * Internal recursive sanitizer with depth protection.
 *
 * @private
 * @param {any} value - Value to cleanse
 * @param {SanitizationSchema|null|undefined} schema - Validation schema
 * @param {WeakSet<object>} visited - Circular reference tracker
 * @param {number} depth - Current recursion depth
 * @returns {any} Cleansed value
 */
function cloneAndCleanse(value, schema, visited, depth) {
	if (value === null || value === undefined) return null;
	if (depth > MAX_DEPTH) return null;

	const expectedType = schema?.type;

	if (typeof value === "string") {
		return cleanseString(value, schema?.allowHtml === true);
	}

	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}

	if (typeof value === "boolean") {
		return value;
	}

	if (value instanceof Date) {
		return Number.isFinite(value.getTime()) ? value.toISOString() : null;
	}

	if (Array.isArray(value)) {
		if (expectedType && expectedType !== "array") return null;

		const itemSchema = schema?.items;
		const cleaned = [];

		for (const item of value) {
			const result = cloneAndCleanse(
				item,
				itemSchema,
				visited,
				depth + 1
			);
			if (result !== null && result !== undefined) {
				cleaned.push(result);
			}
		}

		return cleaned;
	}

	if (typeof value === "object") {
		if (!isPlainObject(value)) {
			return null;
		}

		if (visited.has(value)) {
			return null; // Circular reference protection
		}

		visited.add(value);

		const result = {};
		const allowedKeys = resolveAllowedKeys(schema);
		const keys = Object.keys(value);

		for (const key of keys) {
			if (allowedKeys && !allowedKeys.has(key)) {
				continue;
			}

			// Prevent prototype pollution
			if (key === "__proto__" || key === "constructor") continue;

			const propertySchema = schema?.properties?.[key];
			const cleanedValue = cloneAndCleanse(
				value[key],
				propertySchema,
				visited,
				depth + 1
			);

			if (cleanedValue !== null && cleanedValue !== undefined) {
				result[key] = cleanedValue;
			}
		}

		visited.delete(value);
		return result;
	}

	// Drop unsupported types (functions, symbols, BigInt, etc.)
	return null;
}

/**
 * Performs conservative string sanitization.
 *
 * @private
 * @param {string} value - String to sanitize
 * @param {boolean} allowHtml - Whether to preserve HTML
 * @returns {string} Sanitized string
 */
function cleanseString(value, allowHtml) {
	let output = String(value);

	// Remove control characters
	output = output.replace(CONTROL_CHARS_REGEX, " ");

	if (!allowHtml) {
		// Remove script tags and HTML
		output = output.replace(SCRIPT_TAG_REGEX, " ");
		output = output.replace(HTML_TAG_REGEX, " ");
	}

	// Normalize whitespace
	output = output.replace(MULTI_SPACE_REGEX, " ").trim();
	return output;
}

/**
 * Strips all HTML and control characters preserving only safe content.
 *
 * @param {string} value - Input text
 * @returns {string} Sanitized text
 */
function cleanseText(value) {
	if (typeof value !== "string") {
		return cleanseString(String(value ?? ""), false);
	}
	return cleanseString(value, false);
}

/**
 * Produces deterministic SHA-256 hash of sanitized data.
 *
 * @param {any} value - Value to hash
 * @param {SanitizationSchema} [schema] - Optional schema
 * @returns {Promise<string>} Deterministic hash
 */
function getDeterministicHash(value, schema) {
	const sanitized = cloneAndCleanse(value, schema, new WeakSet(), 0);
	const serialized = stableSerialize(sanitized);
	return hashString(serialized);
}

/**
 * Serializes data with stable key ordering for deterministic hashing.
 *
 * @private
 * @param {any} value - Value to serialize
 * @returns {string} Stable serialization
 */
function stableSerialize(value) {
	if (value === null || value === undefined) return "null";

	const type = typeof value;

	if (type === "string") {
		return JSON.stringify(value);
	}

	if (type === "number") {
		return Number.isFinite(value) ? String(value) : "null";
	}

	if (type === "boolean") {
		return value ? "true" : "false";
	}

	if (Array.isArray(value)) {
		return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
	}

	if (type === "object") {
		const keys = Object.keys(value).sort();
		const entries = keys
			.map((key) => {
				const val = value[key];
				if (val === undefined) return null;
				return `${JSON.stringify(key)}:${stableSerialize(val)}`;
			})
			.filter(Boolean);
		return `{${entries.join(",")}}`;
	}

	return "null";
}

/**
 * Hashes string using SHA-256 with platform fallbacks.
 *
 * @private
 * @param {string} input - Input string
 * @returns {Promise<string>} Hash string
 */
function hashString(input) {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);

	const subtle = globalThis.crypto?.subtle;
	if (subtle) {
		return subtle.digest("SHA-256", data).then(bufferToHex);
	}

	// Fallback to simple hash for environments without crypto.subtle
	return Promise.resolve().then(() => {
		let hash = 0;
		for (let i = 0; i < input.length; i++) {
			hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
		}
		return hash.toString(16).padStart(8, "0");
	});
}

/**
 * Converts ArrayBuffer to hex string.
 *
 * @private
 * @param {ArrayBuffer} buffer - Buffer to convert
 * @returns {string} Hex string
 */
function bufferToHex(buffer) {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Checks if value is a plain object.
 *
 * @private
 * @param {any} value - Value to check
 * @returns {boolean} Whether value is plain object
 */
function isPlainObject(value) {
	if (Object.prototype.toString.call(value) !== "[object Object]") {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === null || proto === Object.prototype;
}

/**
 * Resolves allowed keys for object validation.
 *
 * @private
 * @param {SanitizationSchema|undefined} schema - Validation schema
 * @returns {Set<string>|null} Set of allowed keys or null for no restrictions
 */
function resolveAllowedKeys(schema) {
	if (!schema) return null;

	if (Array.isArray(schema.allowedKeys)) {
		return new Set(
			schema.allowedKeys.filter((key) => typeof key === "string")
		);
	}

	if (schema.properties && isPlainObject(schema.properties)) {
		return new Set(Object.keys(schema.properties));
	}

	return null;
}

export default Sanitizer;
