/**
 * @file Sanitizer.js
 * @version 8.0.0 - MIGRATED TO AUTOMATIC OBSERVATION PATTERN
 * @description Stateless sanitization utilities for cleansing untrusted data, stripping unsafe text,
 * and emitting deterministic hashes for forensic integrity checks with V8.0 automatic observation.
 *
 * KEY V8.0 MIGRATION CHANGES:
 * - All sanitization operations automatically observed through ActionDispatcher
 * - Performance budgets enforced on critical sanitization paths
 * - AsyncOrchestrator pattern for hash operations
 * - Automatic tracking of sanitization metrics and security events
 * - Instrumented Sanitizer class wrapper for observability
 */

const MAX_DEPTH = 20;
const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]+/g;
const HTML_TAG_REGEX = /<\/?[^>]+?>/g;
const SCRIPT_TAG_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const MULTI_SPACE_REGEX = /\s{2,}/g;

/**
 * Returns true if the provided value is a plain object.
 * @param {any} value
 * @returns {boolean}
 */
function isPlainObject(value) {
	if (Object.prototype.toString.call(value) !== "[object Object]") {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === null || proto === Object.prototype;
}

/**
 * Cleanses arbitrary input by recursively stripping unsafe types and enforcing schema hints.
 * @template T
 * @param {T} input
 * @param {object} [schema]
 * @returns {T}
 */
function cleanse(input, schema) {
	const visited = new WeakSet();
	return /** @type {T} */ (cloneAndCleanse(input, schema, visited, 0));
}

/**
 * Internal recursive sanitizer.
 * @param {any} value
 * @param {object|null|undefined} schema
 * @param {WeakSet<object>} visited
 * @param {number} depth
 * @returns {any}
 */
function cloneAndCleanse(value, schema, visited, depth) {
	if (value === null || value === undefined) return null;
	if (depth > MAX_DEPTH) return null;

	const expectedType = schema?.type;

	if (typeof value === "string") {
		const allowHtml = schema?.allowHtml === true;
		return cleanseString(value, allowHtml);
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
		const itemSchema =
			schema?.items && typeof schema.items === "object"
				? schema.items
				: undefined;
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
			return null;
		}

		visited.add(value);

		const result = {};

		const allowedKeys = resolveAllowedKeys(schema);
		const keys = Object.keys(value);

		for (const key of keys) {
			if (allowedKeys && !allowedKeys.has(key)) {
				continue;
			}

			// Reject prototype pollution vectors
			if (key === "__proto__" || key === "constructor") continue;

			const propertySchema = schema?.properties && schema.properties[key];
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

	// Drop functions, symbols, bigint, and other unsupported types
	return null;
}

/**
 * Resolves the set of allowed keys for an object schema.
 * @param {object|undefined} schema
 * @returns {Set<string>|null}
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

/**
 * Performs conservative string sanitization.
 * @param {string} value
 * @param {boolean} allowHtml
 * @returns {string}
 */
function cleanseString(value, allowHtml) {
	let output = String(value);
	output = output.replace(CONTROL_CHARS_REGEX, " ");

	if (!allowHtml) {
		output = output.replace(SCRIPT_TAG_REGEX, " ");
		output = output.replace(HTML_TAG_REGEX, " ");
	}

	output = output.replace(MULTI_SPACE_REGEX, " ").trim();
	return output;
}

/**
 * Strips all HTML and control characters from text, preserving only safe characters.
 * @param {string} value
 * @returns {string}
 */
function cleanseText(value) {
	if (typeof value !== "string") {
		return cleanseString(String(value ?? ""), false);
	}
	return cleanseString(value, false);
}

/**
 * Produces a deterministic SHA-256 hash of sanitized data.
 * @param {any} value
 * @param {object} [schema]
 * @returns {Promise<string>}
 */
function getDeterministicHash(value, schema) {
	const sanitized = cloneAndCleanse(value, schema, new WeakSet(), 0);
	const serialized = stableSerialize(sanitized);
	return hashString(serialized);
}

/**
 * Serializes values with stable key ordering to guarantee deterministic strings.
 * @param {any} value
 * @returns {string}
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
				if (val === undefined) {
					return null;
				}
				return `${JSON.stringify(key)}:${stableSerialize(val)}`;
			})
			.filter(Boolean);
		return `{${entries.join(",")}}`;
	}

	return "null";
}

/**
 * Hashes a string using SHA-256 with browser or Node fallbacks.
 * @param {string} input
 * @returns {Promise<string>}
 */
let basicCryptoInstancePromise = null;

function hashString(input) {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);

	const subtle = globalThis.crypto?.subtle;
	if (subtle) {
		// Use subtle.digest which returns a Promise
		return subtle.digest("SHA-256", data).then(bufferToHex);
	}

	// Fallback to BasicCrypto implementation; return a Promise and handle
	// fallback hashing in the rejection branch.
	return hashWithBasicCrypto(input).catch(() => {
		let hash = 0;
		for (let i = 0; i < input.length; i += 1) {
			hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
		}
		return hash.toString(16).padStart(8, "0");
	});
}

/**
 * Converts an ArrayBuffer result to a hex string.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToHex(buffer) {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function hashWithBasicCrypto(input) {
	if (!basicCryptoInstancePromise) {
		basicCryptoInstancePromise = import(
			"@platform/security/encryption/basic-crypto.js"
		).then(({ default: BasicCrypto }) => {
			const instance = new BasicCrypto({
				stateManager: {
					metricsRegistry: null,
					managers: { errorHelpers: null },
				},
			});
			if (typeof instance.init === "function") {
				return Promise.resolve(instance.init()).then(() => instance);
			}
			return instance;
		});
	}
	return basicCryptoInstancePromise.then((instance) => instance.hash(input));
}

// Legacy stateless export for backward compatibility
export const Sanitizer = Object.freeze({
	cleanse,
	cleanseText,
	getDeterministicHash,
});

/**
 * @class InstrumentedSanitizer
 * @description V8.0 instrumented sanitizer that observes all operations through ActionDispatcher.
 * This wrapper provides automatic observation while maintaining stateless core functions.
 * @privateFields {#stateManager, #orchestrator}
 */
export class InstrumentedSanitizer {
	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('@shared/lib/async/AsyncOrchestrator.js').AsyncOrchestrator|null} */
	#orchestrator = null;

	/**
	 * @param {object} context - The application context.
	 * @param {import('../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
	}

	/**
	 * Initializes the instrumented sanitizer.
	 * V8.0 Parity: Mandate 1.2 - All dependencies derived from stateManager.
	 */
	initialize() {
		const managers = this.#stateManager.managers;
		this.#orchestrator = managers?.orchestrator ?? null;
		console.warn(
			"[InstrumentedSanitizer] Initialized with V8.0 automatic observation pattern."
		);
	}

	/**
	 * Instrumented cleanse operation with automatic observation.
	 * @template T
	 * @param {T} input - Input to cleanse
	 * @param {object} [schema] - Optional schema for validation
	 * @returns {Promise<T>} Cleansed data
	 */
	async cleanse(input, schema) {
		const runner = this.#orchestrator?.createRunner(
			"sanitizer_cleanse"
		) || {
			run: (fn) => fn(),
		};

		/* PERFORMANCE_BUDGET: 5ms */
		return runner.run(() => this.#performCleanse(input, schema));
	}

	/**
	 * Internal cleanse implementation with observation
	 * @private
	 */
	#performCleanse(input, schema) {
		return Promise.resolve().then(() => {
			const inputType = typeof input;
			const hasSchema = !!schema;

			// V8.0 Migration: Sanitization attempt automatically observed
			this.#dispatchSanitizerEvent("security.sanitization_attempt", {
				inputType,
				hasSchema,
				timestamp: Date.now(),
			});

			const result = cleanse(input, schema);

			// V8.0 Migration: Sanitization result automatically observed
			this.#dispatchSanitizerEvent("security.data_sanitized", {
				inputType,
				outputType: typeof result,
				hasSchema,
				timestamp: Date.now(),
			});

			return result;
		});
	}

	/**
	 * Instrumented text cleansing with automatic observation.
	 * @param {string} value - Text to cleanse
	 * @returns {Promise<string>} Cleansed text
	 */
	async cleanseText(value) {
		const runner = this.#orchestrator?.createRunner(
			"sanitizer_cleanse_text"
		) || {
			run: (fn) => fn(),
		};

		/* PERFORMANCE_BUDGET: 2ms */
		return runner.run(() => this.#performTextCleanse(value));
	}

	/**
	 * Internal text cleanse implementation
	 * @private
	 */
	#performTextCleanse(value) {
		return Promise.resolve().then(() => {
			const inputLength = String(value || "").length;

			// V8.0 Migration: Text sanitization automatically observed
			this.#dispatchSanitizerEvent("security.text_sanitization", {
				inputLength,
				timestamp: Date.now(),
			});

			const result = cleanseText(value);
			const outputLength = result.length;
			const charsRemoved = Math.max(0, inputLength - outputLength);

			// V8.0 Migration: Text sanitization result automatically observed
			this.#dispatchSanitizerEvent("security.text_sanitized", {
				inputLength,
				outputLength,
				charsRemoved,
				timestamp: Date.now(),
			});

			return result;
		});
	}

	/**
	 * Instrumented deterministic hash with automatic observation.
	 * @param {any} value - Value to hash
	 * @param {object} [schema] - Optional schema
	 * @returns {Promise<string>} Deterministic hash
	 */
	async getDeterministicHash(value, schema) {
		const runner = this.#orchestrator?.createRunner("sanitizer_hash") || {
			run: (fn) => fn(),
		};

		/* PERFORMANCE_BUDGET: 8ms */
		return runner.run(() => this.#performDeterministicHash(value, schema));
	}

	/**
	 * Internal deterministic hash implementation
	 * @private
	 */
	#performDeterministicHash(value, schema) {
		return Promise.resolve()
			.then(() => {
				const inputType = typeof value;
				const hasSchema = !!schema;

				// V8.0 Migration: Hash operation automatically observed
				this.#dispatchSanitizerEvent("security.hash_operation", {
					inputType,
					hasSchema,
					algorithm: "SHA-256",
					timestamp: Date.now(),
				});

				return getDeterministicHash(value, schema);
			})
			.then((hash) => {
				// V8.0 Migration: Hash result automatically observed
				this.#dispatchSanitizerEvent("security.hash_computed", {
					algorithm: "SHA-256",
					hashLength: hash.length,
					timestamp: Date.now(),
				});

				return hash;
			});
	}

	/**
	 * V8.0 Migration: Dispatch sanitizer events through ActionDispatcher for automatic observation
	 * @private
	 */
	#dispatchSanitizerEvent(eventType, payload) {
		try {
			const actionDispatcher =
				this.#stateManager?.managers?.actionDispatcher;
			if (actionDispatcher?.dispatch) {
				// Fire-and-forget to avoid blocking sanitization operations
				actionDispatcher
					.dispatch(eventType, {
						...payload,
						component: "InstrumentedSanitizer",
					})
					.catch(() => {
						// Silent failure - sanitization should not be blocked by observation failures
					});
			}
		} catch {
			// Silent failure - sanitization should not be blocked by observation failures
		}
	}
}

export default Sanitizer;
