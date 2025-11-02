/**
 * @file Sanitizer.js
 * @description Stateless sanitization utilities for cleansing untrusted data, stripping unsafe text,
 * and emitting deterministic hashes for forensic integrity checks.
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
	return /** @type {T} */ (
		cloneAndCleanse(input, schema, visited, 0)
	);
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
		return Number.isFinite(value.getTime())
			? value.toISOString()
			: null;
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

			const propertySchema =
				schema?.properties && schema.properties[key];
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
async function getDeterministicHash(value, schema) {
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
async function hashString(input) {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);

	const subtle = globalThis.crypto?.subtle;
	if (subtle) {
		const buffer = await subtle.digest("SHA-256", data);
		return bufferToHex(buffer);
	}

	try {
		const { createHash } = await import("node:crypto");
		return createHash("sha256").update(input).digest("hex");
	} catch {
		// Extremely unlikely: fall back to poor man's hash (not cryptographic).
		let hash = 0;
		for (let i = 0; i < input.length; i += 1) {
			hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
		}
		return hash.toString(16).padStart(8, "0");
	}
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

export const Sanitizer = Object.freeze({
	cleanse,
	cleanseText,
	getDeterministicHash,
});

export default Sanitizer;

