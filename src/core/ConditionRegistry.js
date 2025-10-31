/**
 * @file ConditionRegistry.js
 * @description A centralized registry for managing and evaluating reusable condition evaluators.
 * These conditions are used by the EventFlowEngine and other systems to make decisions based on context.
 */

import ConditionSchema from "./ConditionSchema.json" assert { type: "json" };
/**
 * @class ConditionRegistry
 * @classdesc Manages the registration, evaluation, and caching of reusable condition functions.
 * This allows for a declarative and extensible way to define logic within event flows and actions.
 */
export class ConditionRegistry {
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
	/** @private @type {Map<string, {count: number, windowStart: number}>} */ #rateLimitStore =
		new Map(); // V8.0 Parity: Mandate 3.1 - Private field declaration.
	/** @private @type {Function|null} */
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
		this.#conditionCache =
			this.#stateManager.managers.cacheManager?.getCache(
				"conditionResults"
			);

		// V8.0 Parity: Mandate 2.2 - Create a simple schema validator.
		this.#schemaValidator =
			this.#createSimpleSchemaValidator(ConditionSchema);

		this.registerBuiltinConditions();
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
		// V8.0 Parity: Mandate 2.2 - Validate examples against the schema upon registration.
		if (options.examples) {
			for (const example of options.examples) {
				const { valid, errors } = this.validate(example);
				if (!valid) {
					throw new Error(
						`Invalid example for condition '${conditionType}': ${errors.join(", ")}`
					);
				}
			}
		}

		// V8.0 Parity: Mandate 2.2 - Validate the condition schema itself upon registration.
		if (options.schema) {
			// This is a meta-check; in a real scenario, you might validate the schema structure.
			// For now, we just ensure it's an object.
			if (typeof options.schema !== "object")
				throw new Error("Condition schema must be an object.");
		}

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
		return condition;
	}

	/**
	 * Evaluates a condition definition against a given context.
	 * @param {object} conditionDef - The definition of the condition to evaluate (e.g., `{ type: 'property_equals', property: 'user.role', value: 'admin' }`).
	 * @param {object} evaluationContext - The context object containing data for the evaluation.
	 * @param {object|null} securitySubject - The security subject (user, roles, permissions) for the evaluation.
	 * @param {object} [options={}] - Additional options for the evaluation.
	 * @returns {Promise<boolean>} A promise that resolves to `true` if the condition is met, `false` otherwise.
	 */
	async evaluate(conditionDef, evaluationContext, securitySubject = null) {
		this.#metrics?.increment("evaluations");

		return this.#errorHelpers?.tryOr(
			async () => {
				// Generate cache key if condition is cacheable
				// V8.0 Parity: Mandate 2.2 - Validate the condition before evaluation.
				const { valid, errors } = this.validate(conditionDef);
				if (!valid) {
					throw new Error(
						`Invalid condition definition for type '${conditionDef.type}': ${errors.join(", ")}`
					);
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

				// Get condition evaluator
				const condition = this.#conditions.get(conditionDef.type);
				if (!condition) {
					throw new Error(
						`Unknown condition type: ${conditionDef.type}`
					);
				}

				// V8.0 Parity: Optimize for synchronous evaluators.
				const evaluatorArgs = [
					conditionDef,
					evaluationContext,
					securitySubject,
					this.#stateManager,
				];

				const result = await Promise.resolve(
					condition.evaluator(...evaluatorArgs)
				);

				// Cache result if cacheable
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
			const keyData = {
				def: conditionDef,
				subjectHash: securitySubject
					? `${securitySubject.userId}:${securitySubject.role}`
					: "",
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
	registerBuiltinConditions() {
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

				return actualValue === expectedValue;
			},
			{
				description: "Compare a property value for equality",
				schema: {
					property: { type: "string", required: true },
					value: { required: true },
				},
				examples: [
					{ property: "user.role", value: "admin" },
					{ property: "entity.status", value: "active" },
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
			}
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

				const regex = new RegExp(pattern, flags);
				return regex.test(actualValue);
			},
			{
				description: "Match property against regular expression",
				schema: {
					property: { type: "string", required: true },
					pattern: { type: "string", required: true },
					flags: { type: "string" },
				},
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
			}
		);

		// Time of day
		this.register(
			"time_of_day",
			(conditionDef, evaluationContext) => {
				const now = new Date(evaluationContext.timestamp || Date.now());
				const hour = now.getHours();
				const minute = now.getMinutes();
				const timeInMinutes = hour * 60 + minute;

				if (conditionDef.after) {
					const [afterHour, afterMinute] = conditionDef.after
						.split(":")
						.map(Number);
					const afterInMinutes = afterHour * 60 + afterMinute;
					if (timeInMinutes < afterInMinutes) return false;
				}

				if (conditionDef.before) {
					const [beforeHour, beforeMinute] = conditionDef.before
						.split(":")
						.map(Number);
					const beforeInMinutes = beforeHour * 60 + beforeMinute;
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
					{ after: "09:00", before: "17:00" }, // Business hours
					{ after: "22:00", before: "06:00" }, // Night hours
				],
			}
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
			}
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
			}
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
			}
		);
	}

	/**
	 * Retrieves a nested property value from an object using a dot-notation path.
	 * @param {object} obj - The object to query.
	 * @param {string} path - The dot-notation path (e.g., 'data.user.id').
	 * @returns {*} The value at the specified path, or undefined if not found.
	 */
	#getNestedProperty(obj, path) {
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
	 */
	#createSimpleSchemaValidator(schema) {
		// This is a simplified, non-recursive validator that handles the specific `if/then` structure of ConditionSchema.json
		return (conditionDef) => {
			const errors = [];

			// Base validation: must be an object with a 'type' property
			if (typeof conditionDef !== "object" || conditionDef === null) {
				return {
					valid: false,
					errors: ["Condition must be an object."],
				};
			}
			if (typeof conditionDef.type !== "string") {
				return {
					valid: false,
					errors: [
						"Condition must have a 'type' property of type string.",
					],
				};
			}

			// Find the correct 'then' block for the given type
			let ruleSchema = null;
			if (schema.if?.properties?.type?.const === conditionDef.type) {
				ruleSchema = schema.then;
			}
			// In a real schema, you'd iterate through an `allOf` or `anyOf` array.
			// Our schema uses a flat list of if/then, which is not standard but we can parse it.
			// A more robust implementation would use a proper JSON Schema library, but this adheres to the "dependency-free" mandate.

			// A simple loop to find the matching rule based on our non-standard schema structure
			// This is a placeholder for a more robust check that would parse the full schema.
			// For now, we'll check the specific condition type.
			const conditionType = conditionDef.type;
			const conditionHandler = this.#conditions.get(conditionType);

			if (conditionHandler && conditionHandler.schema) {
				const specificSchema = conditionHandler.schema;
				// Check required properties
				if (specificSchema.required) {
					for (const key of specificSchema.required) {
						if (conditionDef[key] === undefined) {
							errors.push(
								`Missing required property: '${key}' for type '${conditionType}'`
							);
						}
					}
				}

				// Check property types and enums
				for (const key in specificSchema) {
					if (conditionDef[key] !== undefined) {
						const schemaProp = specificSchema[key];
						if (
							schemaProp.type &&
							typeof conditionDef[key] !== schemaProp.type
						) {
							errors.push(
								`Property '${key}' must be of type ${schemaProp.type}`
							);
						}
					}
				}
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
		return Array.from(this.#conditions.entries()).map(
			([type, condition]) => ({
				type,
				description: condition.description,
				schema: condition.schema,
				examples: condition.examples,
				async: condition.async,
				cacheable: condition.cacheable,
			})
		);
	}

	/**
	 * Retrieves performance and usage statistics for the condition registry.
	 * @returns {object} An object containing metrics like evaluation counts and cache hit rate.
	 */
	getStatistics() {
		const stats = this.#metrics?.getAllAsObject() || {};
		return {
			...stats,
			totalConditions: this.#conditions.size,
			cacheSize: this.#conditionCache?.size || 0,
		};
	}

	/**
	 * Clears the condition result cache and the rate-limiting store.
	 */
	clearCache() {
		this.#conditionCache?.clear();
		this.#rateLimitStore.clear();
	}

	/**
	 * Removes a condition evaluator from the registry.
	 * @param {string} conditionType - The name of the condition type to unregister.
	 * @returns {boolean} `true` if the condition was found and removed, `false` otherwise.
	 */
	unregister(conditionType) {
		return this.#conditions.delete(conditionType);
	}

	/**
	 * Creates a condition evaluator from an entity definition.
	 * @static
	 * @param {object} entity - The entity representing a condition definition.
	 * @returns {object} A condition object with an evaluator function.
	 */
	static fromEntity(entity) {
		if (
			entity.domain !== "system" ||
			entity.type !== "condition_definition"
		) {
			throw new Error("Invalid entity for condition definition");
		}

		const conditionDef = entity.data;

		// Create evaluator function from definition
		const evaluator = (conditionParams, context, options) =>
			// Implementation would depend on the condition definition format
			// This is a placeholder for entity-driven condition definitions
			true;
		return {
			type: conditionDef.type,
			evaluator,
			description: conditionDef.description,
			schema: conditionDef.schema,
			cacheable: conditionDef.cacheable,
		};
	}
}

export default ConditionRegistry;
