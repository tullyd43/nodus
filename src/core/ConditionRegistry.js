/**
 * @file ConditionRegistry.js
 * @description A centralized registry for managing and evaluating reusable condition evaluators.
 * These conditions are used by the EventFlowEngine and other systems to make decisions based on context.
 */

import ConditionSchema from "./ConditionSchema.json";
import { DateConditions } from "../utils/DateUtils.js";
/**
 * @class ConditionRegistry
 * @privateFields {#stateManager, #conditions, #conditionCache, #metrics, #errorHelpers, #rateLimitStore, #schemaValidator}
 * @classdesc Manages the registration, evaluation, and caching of reusable condition functions.
 * This allows for a declarative and extensible way to define logic within event flows and actions.
 */
export class ConditionRegistry {
	// V8.0 Parity: Mandate 3.1 & 3.5 - All private fields are declared at the top.
	/** @private @type {import('./HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {Map<string, object>} */
	#conditions = new Map();
	/** @private @type {import('../utils/LRUCache.js').LRUCache|null} */
	#conditionCache = null;
	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/**
	 * Stores rate limit counts for the 'is_rate_limited' condition.
	 * @private
	 * @type {Map<string, {count: number, windowStart: number}>}
	 */
	#rateLimitStore = new Map();
	/**
	 * A function that validates a condition definition against the ConditionSchema.json.
	 * @private
	 * @type {Function|null}
	 */
	#schemaValidator = null;

	/**
	 * Creates an instance of ConditionRegistry.
	 * @param {object} context - The application context.
	 * @param {import('./HybridStateManager.js').default} context.stateManager - The main state manager, providing access to all other managers.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
	}

	/**
	 * Initializes the registry by registering built-in conditions and setting up the cache.
	 * @returns {Promise<void>}
	 */
	initialize() {
		// V8.0 Parity: Derive managers from stateManager.
		this.#errorHelpers = this.#stateManager.managers.errorHelpers;
		this.#metrics =
			this.#stateManager.metricsRegistry?.namespace("conditionRegistry");

		// Get a dedicated cache instance from the CacheManager
		const cacheManager = this.#stateManager.managers.cacheManager;
		if (cacheManager) {
			this.#conditionCache = cacheManager.getCache("conditionResults", {
				ttl: 300000, // 5 minute TTL for condition results
			});
		}

		// V8.0 Parity: Mandate 2.2 - Create a simple schema validator.
		this.#schemaValidator = this.#createSimpleSchemaValidator(ConditionSchema);

		this.#registerBuiltinConditions();
		console.log(
			`[ConditionRegistry] Initialized with ${this.#conditions.size} built-in conditions.`
		);
	}

	/**
	 * Registers a new condition evaluator function.
	 * @param {string} conditionType - The unique name for the condition type.
	 * @param {Function} evaluator - The function that evaluates the condition. It receives `(conditionDef, context, stateManager)`.
	 * @param {object} [options={}] - Configuration for the condition.
	 * @param {string} [options.description] - A human-readable description of the condition.
	 * @param {boolean} [options.cacheable=true] - Whether the condition's result can be cached.
	 * @param {boolean} [options.async=false] - Whether the evaluator is an async function.
	 * @param {object} [options.schema] - A schema defining the parameters for the condition.
	 * @param {object[]} [options.examples] - Example usage of the condition definition.
	 * @returns {object} The registered condition object.
	 */
	register(conditionType, evaluator, options = {}) {
		if (this.#conditions.has(conditionType)) {
			console.warn(
				`[ConditionRegistry] Overwriting existing condition handler for type: '${conditionType}'.`
			);
		}

		// V8.0 Parity: Mandate 2.2 - Validate the condition definition and its examples upon registration.
		this.#validateRegistration(conditionType, options);

		const condition = {
			type: conditionType,
			evaluator,
			description: options.description || "",
			cacheable: options.cacheable !== false,
			async: options.async || false,
			schema: options.schema || {},
			examples: options.examples || [],
		};

		this.#conditions.set(conditionType, condition);
		this.#metrics?.increment("registered");

		return condition;
	}

	/**
	 * Validates a condition's definition and examples during registration.
	 * @private
	 * @param {string} conditionType - The type of the condition being registered.
	 * @param {object} options - The registration options.
	 */
	#validateRegistration(conditionType, options) {
		if (options.schema && typeof options.schema !== "object") {
			throw new Error(
				`Schema for condition '${conditionType}' must be an object.`
			);
		}

		if (!options.examples || options.examples.length === 0) {
			console.warn(
				`[ConditionRegistry] No examples provided for condition '${conditionType}'.`
			);
			return;
		}

		for (const example of options.examples) {
			const { valid, errors } = this.validate(example);
			if (!valid) {
				throw new Error(
					`Invalid example for condition '${conditionType}': ${errors.join(
						", "
					)}. Example: ${JSON.stringify(example)}`
				);
			}
		}
	}

	/**
	 * Evaluates a condition definition against a given context.
	 * @param {object} conditionDef - The definition of the condition to evaluate (e.g., `{ type: 'property_equals', property: 'user.role', value: 'admin' }`).
	 * @param {object} evaluationContext - The context object containing data for the evaluation.
	 * @param {object|null} securitySubject - The security subject (user, roles, permissions) for the evaluation.
	 * @returns {Promise<boolean>} A promise that resolves to `true` if the condition is met, `false` otherwise.
	 */
	async evaluate(conditionDef, evaluationContext, securitySubject = null) {
		this.#metrics?.increment("evaluations");

		return this.#errorHelpers?.tryOr(
			async () => {
				// Generate cache key if condition is cacheable
				const { valid, errors } = this.validate(conditionDef);
				if (!valid) { // V8.0 Parity: Mandate 2.2 - Stricter validation enforcement.
					// Throw a specific, detailed error if validation fails.
					throw new Error(`Invalid condition definition: ${errors.join("; ")}`);
				}

				const cacheKey = this.#generateCacheKey(
					conditionDef,
					evaluationContext,
					securitySubject
				);

				// Check cache first
				if (cacheKey && this.#conditionCache?.has(cacheKey)) {
					this.#metrics?.increment("cacheHits");
					return this.#conditionCache.get(cacheKey);
				}

				// Get the registered condition evaluator.
				const condition = this.#conditions.get(conditionDef.type);
				if (!condition) {
					throw new Error(`Unknown condition type: ${conditionDef.type}`);
				}

				// Prepare arguments for the evaluator function.
				const evaluatorArgs = [
					conditionDef,
					evaluationContext,
					securitySubject,
					this.#stateManager,
				];

				// Await the result, which transparently handles both sync and async evaluators.
				const result = await Promise.resolve(
					condition.evaluator(...evaluatorArgs)
				);

				// Store the result in the cache if the condition is cacheable.
				if (cacheKey) {
					this.#conditionCache?.set(cacheKey, result);
					this.#metrics?.increment("cacheMisses");
				}
				return result;
			},
			() => false, // Default to false on any evaluation error.
			{
				component: "ConditionRegistry",
				operation: "evaluate",
				conditionType: conditionDef.type,
			}
		);
	}

	/**
	 * Generates a deterministic cache key for a given condition and context.
	 * @private
	 * @param {object} conditionDef - The condition definition.
	 * @param {object} evaluationContext - The evaluation context.
	 * @param {object|null} securitySubject - The security subject.
	 * @returns {string|null} A unique string key for caching, or null if not cacheable.
	 */
	#generateCacheKey(conditionDef, evaluationContext, securitySubject) {
		const condition = this.#conditions.get(conditionDef.type);
		if (!condition || !condition.cacheable) return null;

		try {
			// V8.0 Parity: Create a more robust key using relevant context parts.
			// The subject hash ensures user-specific results are cached separately.
			// Note: This assumes evaluationContext is not overly large or circular.
			const keyData = {
				def: conditionDef,
				subjectHash: securitySubject
					? `${securitySubject.userId}:${securitySubject.role}:${securitySubject.level}`
					: "anonymous",
			};

			return `cond:${JSON.stringify(keyData)}`;
		} catch (error) {
			console.warn(
				`[ConditionRegistry] Failed to generate cache key for condition type ${conditionDef.type}:`,
				error
			);
			return null; // Don't cache if key generation fails
		}
	}

	/**
	 * Registers a set of common, built-in condition types.
	 * @private
	 */
	#registerBuiltinConditions() {
		// Simple property comparison
		this.register(
			"property_equals",
			(conditionDef, evaluationContext) => {
				const property = conditionDef.property;
				const expectedValue = conditionDef.value;
				const actualValue = this.#getNestedProperty(
					evaluationContext,
					property
				);

				return actualValue === expectedValue; // Strict equality check.
			},
			{
				description: "Compare a property value for equality",
				schema: {
					property: { type: "string", required: true },
					value: { required: true },
				},
				examples: [
					{ type: "property_equals", property: "data.user.role", value: "admin" },
					{
						type: "property_equals",
						property: "data.entity.status",
						value: "active",
					},
				],
			}
		);

		// Numeric comparison
		this.register(
			"numeric_comparison",
			(conditionDef, evaluationContext) => {
				const property = conditionDef.property;
				const operator = conditionDef.operator;
				const value = conditionDef.value;
				const actualValue = this.#getNestedProperty(
					evaluationContext,
					property
				);

				if (
					typeof actualValue !== "number" ||
					typeof value !== "number"
				) {
					return false;
				}

				switch (operator) {
					case ">":
						return actualValue > value;
					case "<":
						return actualValue < value;
					case ">=":
						return actualValue >= value;
					case "<=":
						return actualValue <= value;
					case "==":
						return actualValue === value;
					case "!=":
						return actualValue !== value;
					default:
						return false;
				}
			},
			{
				description: "Compare numeric values",
				schema: {
					property: { type: "string", required: true },
					operator: {
						type: "string",
						enum: [">", "<", ">=", "<=", "==", "!="],
						required: true,
					},
					value: { type: "number", required: true },
				},
			},
		);

		// Array membership
		this.register(
			"in_array",
			(conditionDef, evaluationContext) => {
				const property = conditionDef.property;
				const array = conditionDef.array;
				const actualValue = this.#getNestedProperty(
					evaluationContext,
					property
				);

				return Array.isArray(array) && array.includes(actualValue);
			},
			{
				description: "Check if property value is in array",
				schema: {
					property: { type: "string", required: true },
					array: { type: "array", required: true },
				},
				examples: [{ type: "in_array", property: "data.entity.type", array: ["task", "note"] }],
			}
		);

		// Regular expression match
		this.register(
			"regex_match",
			(conditionDef, evaluationContext) => {
				const property = conditionDef.property;
				const pattern = conditionDef.pattern;
				const flags = conditionDef.flags || "";
				const actualValue = this.#getNestedProperty(
					evaluationContext,
					property
				);

				if (typeof actualValue !== "string") return false;

				// Security: Prevent ReDoS by checking for overly complex patterns.
				// This is a simple heuristic; a more robust solution might involve a dedicated library.
				if (pattern.length > 100 || /[*+]\?/.test(pattern)) {
					console.warn(
						`[ConditionRegistry] Potentially complex regex pattern blocked: ${pattern}`
					);
					return false;
				}

				try {
					const regex = new RegExp(pattern, flags);
					return regex.test(actualValue);
				} catch (e) {
					console.error(`[ConditionRegistry] Invalid regex pattern: ${pattern}`, e);
					return false;
				}
			},
			{
				description: "Match property against regular expression",
				schema: {
					property: { type: "string", required: true },
					pattern: { type: "string", required: true },
					flags: { type: "string" },
				},
				examples: [{ type: "regex_match", property: "data.entity.name", pattern: "^TASK-" }],
			}
		);

		// Time-based conditions
		this.register(
			"time_range",
			(conditionDef, evaluationContext) => {
				const now = Date.now();
				const contextTime = evaluationContext.timestamp || now;

				if (conditionDef.after && contextTime < conditionDef.after)
					return false;
				if (conditionDef.before && contextTime > conditionDef.before)
					return false;

				return true;
			},
			{
				description: "Check if context timestamp is within time range",
				schema: {
					after: { type: "number" },
					before: { type: "number" },
				},
			},
		);

		// Time of day
		this.register(
			"time_of_day",
			(conditionDef, evaluationContext) => {
				const now = new Date(evaluationContext.timestamp || Date.now());
				const timeInMinutes = now.getHours() * 60 + now.getMinutes();

				if (conditionDef.after) {
					const afterInMinutes = DateConditions.parseTimeString(conditionDef.after);
					if (timeInMinutes < afterInMinutes) return false;
				}

				if (conditionDef.before) {
					const beforeInMinutes = DateConditions.parseTimeString(conditionDef.before);
					if (timeInMinutes > beforeInMinutes) return false;
				}

				return true;
			},
			{
				description: "Check if current time is within specified hours",
				schema: {
					after: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
					before: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
				},
				examples: [
					{ type: "time_of_day", after: "09:00", before: "17:00" }, // Business hours
					{ type: "time_of_day", after: "22:00" }, // After 10 PM
				],
			},
		);

		// V8.0 Parity: Mandate 4.2 - Pre-parsed time condition for hot paths.
		this.register(
			"time_of_day_preparsed",
			(conditionDef, evaluationContext) => {
				const now = new Date(evaluationContext.timestamp || Date.now());
				const timeInMinutes = now.getHours() * 60 + now.getMinutes();

				// The `afterMinutes` and `beforeMinutes` properties are expected to be pre-calculated.
				if (
					conditionDef.afterMinutes !== undefined &&
					timeInMinutes < conditionDef.afterMinutes
				) {
					return false;
				}
				if (
					conditionDef.beforeMinutes !== undefined &&
					timeInMinutes > conditionDef.beforeMinutes
				) {
					return false;
				}

				return true;
			},
			{
				description:
					"Check if current time is within a pre-parsed time range (for performance).",
				schema: {
					afterMinutes: { type: "number" },
					beforeMinutes: { type: "number" },
				},
			},
		);

		// User permission check
		this.register(
			"user_has_permission",
			(conditionDef, evaluationContext, securitySubject) => {
				// V8.0 Parity: Use the explicit securitySubject parameter.
				const userPermissions = securitySubject?.permissions || [];
				const requiredPermissions = conditionDef.permissions || [];
				const requireAll = conditionDef.requireAll !== false;

				if (requireAll) {
					return requiredPermissions.every((perm) =>
						userPermissions.includes(perm)
					);
				} else {
					return requiredPermissions.some((perm) =>
						userPermissions.includes(perm)
					);
				}
			},
			{
				description: "Check if user has required permissions",
				schema: {
					permissions: { type: "array", required: true },
					requireAll: { type: "boolean" },
				},
				examples: [
					{
						type: "user_has_permission",
						permissions: ["entity:edit", "entity:delete"],
						requireAll: true,
					},
				],
			},
		);

		// User role check
		this.register(
			"user_has_role",
			(conditionDef, evaluationContext, securitySubject) => {
				// V8.0 Parity: Use the explicit securitySubject parameter.
				const userRole = securitySubject?.role;
				const allowedRoles = conditionDef.roles || [];

				return allowedRoles.includes(userRole);
			},
			{
				description: "Check if user has allowed role",
				schema: {
					roles: { type: "array", required: true },
				},
				examples: [{ type: "user_has_role", roles: ["admin", "editor"] }]
			}
		);

		// Entity type check
		this.register(
			"entity_type",
			(conditionDef, evaluationContext) => {
				const entityType =
					evaluationContext.entityType ||
					evaluationContext.entity?.type;
				const allowedTypes = conditionDef.types || [];

				return allowedTypes.includes(entityType);
			},
			{
				description: "Check if entity is of allowed type",
				schema: {
					types: { type: "array", required: true },
				},
				examples: [{ type: "entity_type", types: ["user", "group"] }]
			}
		);

		// Rate limiting
		this.register(
			"is_rate_limited",
			(conditionDef, evaluationContext) => {
				const key =
					conditionDef.key || evaluationContext.userId || "global";
				const limit = conditionDef.limit || 10;
				const window = conditionDef.window || 60000; // 1 minute

				const now = Date.now();
				const record = this.#rateLimitStore.get(key) || {
					count: 0,
					windowStart: now,
				};

				// Reset window if expired
				if (now - record.windowStart > window) {
					record.count = 0;
					record.windowStart = now;
				}

				record.count++;
				this.#rateLimitStore.set(key, record);

				return record.count <= limit;
			},
			{
				description: "Check if action is within rate limit",
				cacheable: false, // Rate limiting should not be cached
				schema: {
					key: { type: "string" },
					limit: { type: "number", required: true },
					window: { type: "number" },
				},
				examples: [
					{
						type: "is_rate_limited",
						limit: 5,
						window: 60000,
					},
				],
			},
		);

		// Complex condition (AND/OR logic)
		this.register(
			"evaluate_logical",
			async (conditionDef, evaluationContext, securitySubject) => {
				const operator = conditionDef.operator || "AND";
				const conditions = conditionDef.conditions || [];

				if (operator === "AND") {
					for (const condition of conditions) {
						// V8.0 Parity: Recurse with all context.
						const result = await this.evaluate(
							condition,
							evaluationContext,
							securitySubject
						);
						if (!result) return false;
					}
					return true;
				} else if (operator === "OR") {
					for (const condition of conditions) {
						const result = await this.evaluate(
							condition,
							evaluationContext,
							securitySubject
						);
						if (result) return true;
					}
					return false;
				} else if (operator === "NOT") {
					const condition = conditions[0];
					if (!condition) return true;
					const result = await this.evaluate(
						// Recurse
						condition,
						evaluationContext,
						securitySubject
					);
					return !result;
				}

				return false;
			},
			{
				description:
					"Combine multiple conditions with logical operators",
				async: true,
				schema: {
					operator: {
						type: "string",
						enum: ["AND", "OR", "NOT"],
						required: true,
					},
					conditions: { type: "array", required: true },
				},
				examples: [
					{
						type: "evaluate_logical",
						operator: "AND",
						conditions: [
							{
								type: "property_equals",
								property: "data.entity.status",
								value: "active",
							},
							{
								type: "user_has_role",
								roles: ["editor"],
							},
						],
					},
				],
			}
		);
	}

	/**
	 * Retrieves a nested property value from an object using a dot-notation path.
	 * @param {object} obj - The object to query.
	 * @param {string} path - The dot-notation path (e.g., 'data.user.id').
	 * @returns {*} The value at the specified path, or undefined if not found.
	 */
	#getNestedProperty(obj, path) { // Already private, but good to confirm.
		return path
			.split(".")
			.reduce(
				(current, key) =>
					current && current[key] !== undefined
						? current[key]
						: undefined,
				obj
			);
	}

	/**
	 * Creates a simple, dependency-free JSON schema validator.
	 * @private
	 * @param {object} schema - The JSON schema to validate against.
	 * @returns {Function} A function that takes data and returns `{valid: boolean, errors: string[]}`.
	 * @see {@link d:\Development Files\repositories\nodus\src\core\ConditionSchema.json}
	 */
	#createSimpleSchemaValidator(schema) { // Already private, but good to confirm.
		// This is a simplified, non-recursive validator that handles the `allOf` > `if/then` structure of ConditionSchema.json
		return (conditionDef) => {
			const errors = [];

			if (typeof conditionDef !== "object" || conditionDef === null) {
				return {
					valid: false,
					errors: ["Condition must be an object."],
				};
			}

			// Validate base required properties from the schema root
			for (const key of schema.required || []) {
				if (conditionDef[key] === undefined) {
					errors.push(`Missing required property: '${key}'.`);
				}
			}

			// Find the matching conditional schema within 'allOf'
			const conditionalSchema = schema.allOf?.find(
				(s) => s.if?.properties?.type?.const === conditionDef.type
			);

			if (conditionalSchema) {
				const { then: thenSchema } = conditionalSchema;
				if (thenSchema) {
					// Validate required properties for the specific type
					for (const key of thenSchema.required || []) {
						if (conditionDef[key] === undefined) {
							errors.push(
								`Missing required property for type '${conditionDef.type}': '${key}'.`
							);
						}
					}

					// Validate property types and enums
					for (const key in thenSchema.properties || {}) {
						if (conditionDef[key] !== undefined) {
							const propSchema = thenSchema.properties[key];
							const value = conditionDef[key];

							// Type check
							if (
								propSchema.type &&
								typeof value !== propSchema.type &&
								!(
									propSchema.type === "array" &&
									Array.isArray(value)
								)
							) {
								errors.push(
									`Property '${key}' must be of type '${propSchema.type}', but received '${typeof value}'.`
								);
							}

							// Enum check
							if (
								propSchema.enum &&
								!propSchema.enum.includes(value)
							) {
								errors.push(
									`Property '${key}' must be one of [${propSchema.enum.join(", ")}], but received '${value}'.`
								);
							}

							// Pattern check
							if (
								propSchema.pattern &&
								!new RegExp(propSchema.pattern).test(value)
							) {
								errors.push(
									`Property '${key}' must match pattern: /${propSchema.pattern}/.`
								);
							}
						}
					}
				}
			} else if (conditionDef.type) {
				// If a type is provided but no matching schema is found in allOf
				errors.push(
					`Unknown or un-schematized condition type: '${conditionDef.type}'.`
				);
			}

			return {
				valid: errors.length === 0,
				errors,
			};
		};
	}

	/**
	 * Validates a condition definition object against its registered schema.
	 * @param {object} conditionDef - The condition definition to validate.
	 * @returns {{valid: boolean, errors: string[]}} An object indicating if the definition is valid and a list of any errors.
	 */
	validate(conditionDef) {
		if (!conditionDef || !conditionDef.type) {
			return {
				valid: false,
				errors: [
					"Condition must be an object and have a 'type' property.",
				],
			};
		}

		// V8.0 Parity: Mandate 2.2 - Use the central schema validator.
		if (this.#schemaValidator) {
			return this.#schemaValidator(conditionDef);
		}

		return { valid: true, errors: [] }; // No schema validator, no validation.
	}

	/**
	 * Retrieves a list of all registered condition types and their metadata.
	 * @returns {object[]} An array of objects, each describing a registered condition.
	 */
	getAvailableConditions() {
		return Array.from(this.#conditions.values()).map((condition) => ({
			type: condition.type,
			description: condition.description,
			schema: condition.schema,
			examples: condition.examples,
			async: condition.async,
			cacheable: condition.cacheable,
		}));
	}

	/**
	 * Retrieves performance and usage statistics for the condition registry.
	 * @returns {object} An object containing metrics like evaluation counts and cache hit rate.
	 */
	getStatistics() {
		return {
			...(this.#metrics?.getAllAsObject() || {}),
			totalConditions: this.#conditions.size,
			cacheSize: this.#conditionCache?.size ?? 0,
		};
	}

	/**
	 * Clears the condition result cache and the rate-limiting store.
	 */
	clearCache() {
		this.#conditionCache?.clear();
		this.#rateLimitStore.clear();
		this.#metrics?.increment("cacheClears");
	}

	/**
	 * Removes a condition evaluator from the registry.
	 * @param {string} conditionType - The name of the condition type to unregister.
	 * @returns {boolean} `true` if the condition was found and removed, `false` otherwise.
	 */
	unregister(conditionType) {
		return this.#conditions.delete(conditionType);
	}
}

export default ConditionRegistry;
