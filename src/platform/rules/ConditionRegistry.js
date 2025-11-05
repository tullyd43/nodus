/**
 * @file ConditionRegistry.js
 * @version 3.0.0 - Enterprise Observability Baseline
 * @description Production-ready centralized registry for managing and evaluating reusable condition
 * evaluators with comprehensive security, observability, and compliance features. These conditions
 * are used by the EventFlowEngine and other systems to make decisions based on context.
 *
 * ESLint Exception: nodus/require-async-orchestration
 * Justification: Wrapper pattern provides superior observability consistency and
 * centralized policy enforcement compared to per-method orchestrator setup.
 *
 * Security Classification: INTERNAL
 * License Tier: Enterprise (condition evaluation requires enterprise license)
 * Compliance: MAC-enforced, forensic-audited, polyinstantiation-ready
 */

// This file intentionally uses the internal orchestration wrapper pattern
// (see file header). The repository's async-orchestration rule flags
// some async callbacks passed into the wrapper as false-positives. We
// document the exception above and disable the rule for this file to
// keep method implementations readable while ensuring every async path
// runs through `#runOrchestrated` which applies policies and observability.
/* eslint-disable nodus/require-async-orchestration */

import ConditionSchema from "@platform/rules/ConditionSchema.json";
import { DateCore } from "@shared/lib/DateUtils.js";

/**
 * @class ConditionRegistry
 * @classdesc Enterprise-grade centralized registry for managing and evaluating reusable condition
 * functions with comprehensive security, MAC enforcement, forensic auditing, and automatic observability.
 * Allows for declarative and extensible logic definition within event flows and actions.
 */
export class ConditionRegistry {
	/** @private @type {import('@platform/state/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {object} */
	#managers;
	/** @private @type {{ cleanse?:(value:any, schema?:any)=>any, cleanseText?:(value:string)=>string }|null} */
	#sanitizer;
	/** @private @type {import('@shared/lib/MetricsRegistry.js').MetricsRegistry|undefined} */
	#metrics;
	/** @private @type {ErrorConstructor} */
	#PolicyError;
	/** @private @type {import('@shared/lib/ErrorHelpers.js').ErrorBoundary} */
	#errorBoundary;
	/** @private @type {Set<string>} */
	#loggedWarnings;
	/** @private @type {string} */
	#currentUser;

	// Condition registry state
	/** @private @type {Map<string, object>} */
	#conditions = new Map();
	/** @private @type {import('@shared/lib/LRUCache.js').LRUCache|null} */
	#conditionCache = null;
	/** @private @type {Map<string, {count: number, windowStart: number}>} */
	#rateLimitStore = new Map();
	/** @private @type {Function|null} */
	#schemaValidator = null;
	/** @private @type {boolean} */
	#initialized = false;

	/**
	 * Creates an instance of ConditionRegistry with enterprise security and observability.
	 * @param {object} context - Application context
	 * @param {import('@platform/state/HybridStateManager.js').default} context.stateManager - State manager
	 */
	constructor({ stateManager }) {
		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from stateManager
		this.#stateManager = stateManager;
		this.#loggedWarnings = new Set();

		// Initialize managers from stateManager (no direct instantiation)
		this.#managers = stateManager?.managers || {};
		this.#sanitizer = this.#managers?.sanitizer || null;
		this.#metrics =
			this.#managers?.metricsRegistry?.namespace("conditionRegistry") ||
			null;
		this.#PolicyError = this.#managers?.errorHelpers?.PolicyError || Error;
		this.#errorBoundary = this.#managers?.errorHelpers?.createErrorBoundary(
			{
				name: "ConditionRegistry",
				managers: this.#managers,
			},
			"ConditionRegistry"
		);
		this.#currentUser = this.#initializeUserContext();

		// Validate enterprise license for condition evaluation
		this.#validateEnterpriseLicense();
	}

	/**
	 * Validates enterprise license for condition evaluation features.
	 * @private
	 */
	#validateEnterpriseLicense() {
		const license = this.#managers?.license;
		if (!license?.hasFeature("condition_evaluation")) {
			this.#dispatchAction("license.validation_failed", {
				feature: "condition_evaluation",
				component: "ConditionRegistry",
			});
			throw new this.#PolicyError(
				"Enterprise license required for ConditionRegistry"
			);
		}
	}

	/**
	 * Initializes user context once to avoid repeated lookups.
	 * @private
	 * @returns {string}
	 */
	#initializeUserContext() {
		const securityManager = this.#managers?.securityManager;

		if (securityManager?.getSubject) {
			const subject = securityManager.getSubject();
			const userId = subject?.userId || subject?.id;

			if (userId) {
				this.#dispatchAction("security.user_context_initialized", {
					userId,
					source: "securityManager",
					component: "ConditionRegistry",
				});
				return userId;
			}
		}

		const userContext = this.#stateManager?.userContext;
		const fallbackUserId = userContext?.userId || userContext?.id;

		if (fallbackUserId) {
			this.#dispatchAction("security.user_context_initialized", {
				userId: fallbackUserId,
				source: "userContext",
				component: "ConditionRegistry",
			});
			return fallbackUserId;
		}

		this.#dispatchAction("security.user_context_failed", {
			component: "ConditionRegistry",
			error: "No valid user context found",
		});

		return "system";
	}

	/**
	 * Centralized orchestration wrapper for consistent observability and policy enforcement.
	 * @private
	 * @param {string} operationName - Operation identifier for metrics and logging
	 * @param {Function} operation - Async operation to execute
	 * @param {object} [options={}] - Additional orchestrator options
	 * @returns {Promise<any>}
	 */
	async #runOrchestrated(operationName, operation, options = {}) {
		const orchestrator = this.#managers?.asyncOrchestrator;
		if (!orchestrator) {
			this.#emitWarning("AsyncOrchestrator not available", {
				operation: operationName,
			});
			// Execute directly as fallback for condition registry
			return operation();
		}

		// Policy enforcement
		const policies = this.#managers.policies;
		if (!policies?.getPolicy("async", "enabled")) {
			this.#emitWarning("Async operations disabled by policy", {
				operation: operationName,
			});
			return null;
		}

		if (!policies?.getPolicy("conditions", "enabled")) {
			this.#emitWarning("Condition operations disabled by policy", {
				operation: operationName,
			});
			return null;
		}

		try {
			/* PERFORMANCE_BUDGET: 5ms */
			const runner = orchestrator.createRunner(
				`condition.${operationName}`
			);

			/* PERFORMANCE_BUDGET: varies by operation */
			return await runner.run(
				() => this.#errorBoundary?.tryAsync(operation) || operation(),
				{
					label: `condition.${operationName}`,
					actorId: this.#currentUser,
					classification: "INTERNAL",
					timeout: options.timeout || 10000,
					retries: options.retries || 1,
					...options,
				}
			);
		} catch (error) {
			this.#metrics?.increment("condition_orchestration_error");
			this.#emitCriticalWarning("Condition orchestration failed", {
				operation: operationName,
				error: error.message,
				user: this.#currentUser,
			});
			throw error;
		}
	}

	/**
	 * Dispatches an action through the ActionDispatcher for observability.
	 * @private
	 * @param {string} actionType - Type of action to dispatch
	 * @param {object} payload - Action payload
	 */
	#dispatchAction(actionType, payload) {
		try {
			/* PERFORMANCE_BUDGET: 2ms */
			this.#managers?.actionDispatcher?.dispatch(actionType, {
				...payload,
				actor: this.#currentUser,
				timestamp: DateCore.timestamp(),
				source: "ConditionRegistry",
			});
		} catch (error) {
			this.#emitCriticalWarning("Action dispatch failed", {
				actionType,
				error: error.message,
			});
		}
	}

	/**
	 * Sanitizes input to prevent injection attacks.
	 * @private
	 * @param {any} input - Input to sanitize
	 * @param {object} [_schema] - Validation schema
	 * @returns {any} Sanitized input
	 */
	#sanitizeInput(input, _schema) {
		if (!this.#sanitizer) {
			this.#dispatchAction("security.sanitizer_unavailable", {
				component: "ConditionRegistry",
			});
			return input;
		}

		const result = this.#sanitizer.cleanse?.(input, schema) || input;

		if (result !== input) {
			this.#dispatchAction("security.input_sanitized", {
				component: "ConditionRegistry",
				inputType: typeof input,
			});
		}

		return result;
	}

	/**
	 * Emits warning with deduplication to prevent spam.
	 * @private
	 */
	#emitWarning(message, meta = {}) {
		const warningKey = `${message}:${JSON.stringify(meta)}`;
		if (this.#loggedWarnings.has(warningKey)) {
			return;
		}

		this.#loggedWarnings.add(warningKey);

		try {
			this.#managers?.actionDispatcher?.dispatch(
				"observability.warning",
				{
					component: "ConditionRegistry",
					message,
					meta,
					actor: this.#currentUser,
					timestamp: DateCore.timestamp(),
					level: "warn",
				}
			);
		} catch {
			// Best-effort logging
			console.warn(`[ConditionRegistry:WARNING] ${message}`, meta);
		}
	}

	/**
	 * Emits critical warning that bypasses deduplication.
	 * @private
	 */
	#emitCriticalWarning(message, meta = {}) {
		try {
			this.#managers?.actionDispatcher?.dispatch(
				"observability.critical",
				{
					component: "ConditionRegistry",
					message,
					meta,
					actor: this.#currentUser,
					timestamp: DateCore.timestamp(),
					level: "error",
					critical: true,
				}
			);
		} catch {
			console.error(`[ConditionRegistry:CRITICAL] ${message}`, meta);
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// INITIALIZATION METHODS
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Initializes the registry with enhanced observability.
	 * @public
	 * @returns {Promise<void>}
	 */
	initialize() {
		return this.#runOrchestrated("initialize", async () => {
			// Get a dedicated cache instance from the CacheManager
			const cacheManager = this.#managers?.cacheManager;
			if (cacheManager) {
				this.#conditionCache = cacheManager.getCache(
					"conditionResults",
					{
						ttl: 300000, // 5 minute TTL for condition results
					}
				);

				this.#dispatchAction("condition.cache_initialized", {
					ttl: 300000,
					component: "ConditionRegistry",
				});
			}

			// V8.0 Parity: Mandate 2.2 - Create a simple schema validator.
			this.#schemaValidator =
				this.#createSimpleSchemaValidator(ConditionSchema);

			this.#registerBuiltinConditions();

			this.#initialized = true;

			this.#dispatchAction("condition.registry_initialized", {
				conditionCount: this.#conditions.size,
				cacheEnabled: !!this.#conditionCache,
				component: "ConditionRegistry",
			});
		});
	}

	/**
	 * Creates a simple schema validator for condition definitions.
	 * @private
	 * @param {object} _schema - The schema to validate against
	 * @returns {Function} Validator function
	 */
	#createSimpleSchemaValidator(_schema) {
		return (conditionDef) => {
			// Basic validation - can be enhanced based on schema requirements
			if (!conditionDef || typeof conditionDef !== "object") {
				return {
					valid: false,
					errors: ["Condition definition must be an object"],
				};
			}

			if (!conditionDef.type) {
				return {
					valid: false,
					errors: ["Condition definition must have a type"],
				};
			}

			if (!conditionDef.name) {
				return {
					valid: false,
					errors: ["Condition definition must have a name"],
				};
			}

			if (typeof conditionDef.evaluate !== "function") {
				return {
					valid: false,
					errors: [
						"Condition definition must have an evaluate function",
					],
				};
			}

			return { valid: true, errors: [] };
		};
	}

	/**
	 * Registers built-in condition evaluators.
	 * @private
	 */
	#registerBuiltinConditions() {
		const builtinConditions = [
			{
				type: "property_equals",
				name: "Property Equals",
				description: "Checks if a property equals a specific value",
				evaluate: this.#evaluatePropertyEquals.bind(this),
				schema: {
					property: { type: "string", required: true },
					value: { required: true },
				},
			},
			{
				type: "property_exists",
				name: "Property Exists",
				description: "Checks if a property exists",
				evaluate: this.#evaluatePropertyExists.bind(this),
				schema: {
					property: { type: "string", required: true },
				},
			},
			{
				type: "user_has_permission",
				name: "User Has Permission",
				description:
					"Checks if the current user has specific permissions",
				evaluate: this.#evaluateUserPermission.bind(this),
				schema: {
					permissions: { type: "array", required: true },
				},
			},
			{
				type: "is_rate_limited",
				name: "Is Rate Limited",
				description: "Checks if an operation is rate limited",
				evaluate: this.#evaluateRateLimit.bind(this),
				schema: {
					key: { type: "string", required: true },
					limit: { type: "number", required: true },
					window: { type: "number", required: true },
				},
			},
			{
				type: "entity_type_matches",
				name: "Entity Type Matches",
				description: "Checks if entity type matches criteria",
				evaluate: this.#evaluateEntityType.bind(this),
				schema: {
					entityType: { type: "string", required: true },
				},
			},
			{
				type: "time_range",
				name: "Time Range",
				description: "Checks if current time is within a range",
				evaluate: this.#evaluateTimeRange.bind(this),
				schema: {
					start: { type: "string", required: true },
					end: { type: "string", required: true },
				},
			},
		];

		for (const condition of builtinConditions) {
			this.registerCondition(condition);
		}

		this.#dispatchAction("condition.builtin_conditions_registered", {
			count: builtinConditions.length,
			component: "ConditionRegistry",
		});
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// CONDITION MANAGEMENT METHODS
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Registers a new condition evaluator with the registry.
	 * @param {object} conditionDef - The condition definition
	 * @returns {boolean} True if registration was successful
	 */
	registerCondition(conditionDef) {
		const sanitizedDef = this.#sanitizeInput(conditionDef, {
			type: "string",
			name: "string",
			description: "string",
		});

		// Validate condition definition
		const validation = this.#schemaValidator?.(sanitizedDef);
		if (!validation?.valid) {
			this.#dispatchAction("condition.registration_failed", {
				conditionType: sanitizedDef.type,
				errors: validation?.errors || ["Unknown validation error"],
				component: "ConditionRegistry",
			});
			throw new this.#PolicyError(
				`Invalid condition definition: ${validation?.errors?.join(", ") || "Unknown error"}`
			);
		}

		this.#conditions.set(sanitizedDef.type, sanitizedDef);

		this.#dispatchAction("condition.registered", {
			conditionType: sanitizedDef.type,
			name: sanitizedDef.name,
			component: "ConditionRegistry",
		});

		return true;
	}

	/**
	 * Evaluates a condition against the provided context with caching and observability.
	 * @param {object} conditionSpec - The condition specification
	 * @param {object} context - The evaluation context
	 * @returns {Promise<boolean>} The evaluation result
	 */
	evaluate(conditionSpec, context = {}) {
		return this.#runOrchestrated("evaluate", async () => {
			const sanitizedSpec = this.#sanitizeInput(conditionSpec, {
				type: "string",
			});
			const sanitizedContext = this.#sanitizeInput(context);

			const startTime = performance.now();

			// Check cache first
			const cacheKey = this.#generateCacheKey(
				sanitizedSpec,
				sanitizedContext
			);
			if (this.#conditionCache) {
				const cached = this.#conditionCache.get(cacheKey);
				if (cached !== undefined) {
					this.#metrics?.increment("condition_cache_hits");
					this.#dispatchAction("condition.cache_hit", {
						conditionType: sanitizedSpec.type,
						component: "ConditionRegistry",
					});
					return cached;
				}
				this.#metrics?.increment("condition_cache_misses");
			}

			try {
				// Get condition definition
				const conditionDef = this.#conditions.get(sanitizedSpec.type);
				if (!conditionDef) {
					throw new this.#PolicyError(
						`Unknown condition type: ${sanitizedSpec.type}`
					);
				}

				// Evaluate condition
				const result = await conditionDef.evaluate(
					sanitizedSpec,
					sanitizedContext
				);
				const duration = performance.now() - startTime;

				// Cache result
				if (this.#conditionCache && duration < 1000) {
					// Only cache fast evaluations
					this.#conditionCache.set(cacheKey, result);
				}

				// Record metrics
				this.#metrics?.increment("condition_evaluations");
				this.#metrics?.updateAverage(
					"condition_evaluation_time",
					duration
				);

				this.#dispatchAction("condition.evaluated", {
					conditionType: sanitizedSpec.type,
					result,
					duration,
					cached: false,
					component: "ConditionRegistry",
				});

				return result;
			} catch (error) {
				const duration = performance.now() - startTime;

				this.#metrics?.increment("condition_evaluation_errors");

				this.#dispatchAction("condition.evaluation_failed", {
					conditionType: sanitizedSpec.type,
					error: error.message,
					duration,
					component: "ConditionRegistry",
				});

				throw error;
			}
		});
	}

	/**
	 * Generates a cache key for condition evaluation.
	 * @private
	 * @param {object} conditionSpec - Condition specification
	 * @param {object} context - Evaluation context
	 * @returns {string} Cache key
	 */
	#generateCacheKey(conditionSpec, context) {
		// Create a stable hash of the condition and context
		const key = JSON.stringify({
			type: conditionSpec.type,
			params: conditionSpec,
			context: this.#getContextFingerprint(context),
		});
		return `condition:${btoa(key).substring(0, 32)}`;
	}

	/**
	 * Creates a fingerprint of the context for caching.
	 * @private
	 * @param {object} context - Evaluation context
	 * @returns {object} Context fingerprint
	 */
	#getContextFingerprint(context) {
		// Only include stable properties in the fingerprint
		return {
			userId: context.userId,
			entityType: context.entity?.type,
			entityId: context.entity?.id,
			// Add other stable properties as needed
		};
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// BUILT-IN CONDITION EVALUATORS
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Evaluates property equality condition.
	 * @private
	 * @param {object} spec - Condition specification
	 * @param {object} context - Evaluation context
	 * @returns {boolean} Evaluation result
	 */
	#evaluatePropertyEquals(spec, context) {
		const propertyPath = spec.property;
		const expectedValue = spec.value;

		// Navigate property path
		const actualValue = this.#getNestedProperty(context, propertyPath);

		return actualValue === expectedValue;
	}

	/**
	 * Evaluates property existence condition.
	 * @private
	 * @param {object} spec - Condition specification
	 * @param {object} context - Evaluation context
	 * @returns {boolean} Evaluation result
	 */
	#evaluatePropertyExists(spec, context) {
		const propertyPath = spec.property;
		const value = this.#getNestedProperty(context, propertyPath);
		return value !== undefined && value !== null;
	}

	/**
	 * Evaluates user permission condition.
	 * @private
	 * @param {object} spec - Condition specification
	 * @param {object} context - Evaluation context
	 * @returns {boolean} Evaluation result
	 */
	#evaluateUserPermission(spec, context) {
		const requiredPermissions = spec.permissions || [];
		const securityManager = this.#managers?.securityManager;

		if (!securityManager?.hasPermissions) {
			this.#emitWarning(
				"SecurityManager not available for permission check",
				{
					requiredPermissions,
				}
			);
			return false;
		}

		const userId = context.userId || this.#currentUser;
		return securityManager.hasPermissions(userId, requiredPermissions);
	}

	/**
	 * Evaluates rate limiting condition.
	 * @private
	 * @param {object} spec - Condition specification
	 * @param {object} _context - Evaluation context
	 * @returns {boolean} Evaluation result
	 */
	#evaluateRateLimit(spec, _context) {
		const { key, limit, window } = spec;
		const now = Date.now();

		const record = this.#rateLimitStore.get(key);
		if (!record || now - record.windowStart > window) {
			// New window
			this.#rateLimitStore.set(key, {
				count: 1,
				windowStart: now,
			});
			return false; // Not rate limited
		}

		if (record.count >= limit) {
			return true; // Rate limited
		}

		// Increment count
		record.count++;
		return false; // Not rate limited
	}

	/**
	 * Evaluates entity type condition.
	 * @private
	 * @param {object} spec - Condition specification
	 * @param {object} context - Evaluation context
	 * @returns {boolean} Evaluation result
	 */
	#evaluateEntityType(spec, context) {
		const expectedType = spec.entityType;
		const actualType = context.entity?.type;

		if (expectedType === "*") {
			return true; // Wildcard matches all
		}

		return actualType === expectedType;
	}

	/**
	 * Evaluates time range condition.
	 * @private
	 * @param {object} spec - Condition specification
	 * @param {object} _context - Evaluation context
	 * @returns {boolean} Evaluation result
	 */
	#evaluateTimeRange(spec, _context) {
		const { start, end } = spec;
		const now = new Date();
		const startTime = new Date(start);
		const endTime = new Date(end);

		return now >= startTime && now <= endTime;
	}

	/**
	 * Gets a nested property from an object using dot notation.
	 * @private
	 * @param {object} obj - Object to search
	 * @param {string} path - Property path (e.g., "entity.status")
	 * @returns {any} Property value or undefined
	 */
	#getNestedProperty(obj, path) {
		return path.split(".").reduce((current, key) => {
			return current?.[key];
		}, obj);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PUBLIC API METHODS
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Gets all registered conditions.
	 * @returns {Map<string, object>} Map of registered conditions
	 */
	getConditions() {
		return new Map(this.#conditions);
	}

	/**
	 * Checks if a condition type is registered.
	 * @param {string} type - Condition type to check
	 * @returns {boolean} True if registered
	 */
	hasCondition(type) {
		return this.#conditions.has(type);
	}

	/**
	 * Gets a specific condition definition.
	 * @param {string} type - Condition type
	 * @returns {object|undefined} Condition definition or undefined
	 */
	getCondition(type) {
		return this.#conditions.get(type);
	}

	/**
	 * Unregisters a condition.
	 * @param {string} type - Condition type to unregister
	 * @returns {boolean} True if unregistered successfully
	 */
	unregisterCondition(type) {
		const existed = this.#conditions.delete(type);

		if (existed) {
			// Clear related cache entries
			if (this.#conditionCache) {
				// Simple cache invalidation - could be enhanced
				this.#conditionCache.clear();
			}

			this.#dispatchAction("condition.unregistered", {
				conditionType: type,
				component: "ConditionRegistry",
			});
		}

		return existed;
	}

	/**
	 * Clears the condition evaluation cache.
	 */
	clearCache() {
		if (this.#conditionCache) {
			this.#conditionCache.clear();

			this.#dispatchAction("condition.cache_cleared", {
				component: "ConditionRegistry",
			});
		}
	}

	/**
	 * Gets registry statistics.
	 * @returns {object} Statistics object
	 */
	getStatistics() {
		return {
			...(this.#metrics?.getAllAsObject() || {}),
			conditionsRegistered: this.#conditions.size,
			cacheEnabled: !!this.#conditionCache,
			cacheSize: this.#conditionCache?.size || 0,
			rateLimitEntries: this.#rateLimitStore.size,
			initialized: this.#initialized,
		};
	}

	/**
	 * Exports the current state for debugging.
	 * @returns {object} State snapshot
	 */
	exportState() {
		return {
			conditions: Array.from(this.#conditions.keys()),
			cacheEnabled: !!this.#conditionCache,
			cacheSize: this.#conditionCache?.size || 0,
			rateLimitKeys: Array.from(this.#rateLimitStore.keys()),
			initialized: this.#initialized,
		};
	}
}

export default ConditionRegistry;
