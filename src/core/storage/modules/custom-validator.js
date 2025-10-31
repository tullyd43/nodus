// modules/custom-validator.js
// Custom validation module for user-defined business rules
import { AppError } from "../../../utils/ErrorHelpers.js";

/**
 * Custom Validator Module
 * Loaded for: configurations with custom validation requirements
 * Bundle size: ~2KB (rule engine and custom validators)
 */
export default class CustomValidator {
	/** @private @type {Map<string, object>} */
	#customRules = new Map();
	/** @private */
	#ruleEngine = null;
	/** @private @type {import('../../HybridStateManager.js').default|null} */
	#stateManager = null;
	/** @private @type {import('../../ForensicLogger.js').default|null} */
	#forensicLogger = null;

	/** @public @type {string} */
	name = "CustomValidator";
	/** @public @type {string} */
	type = "business";
	/** @public @type {string[]} */
	supports = ["objects", "events", "relationships"];

	/**
	 * Creates an instance of CustomValidator.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @param {Array<object>} [context.customRules=[]] - An array of predefined custom rule objects.
	 * @param {object} [context.options={}] - Configuration options for the validator and its rule engine.
	 */
	constructor({ stateManager, customRules = [], options = {} }) {
		this.#stateManager = stateManager;
		// V8.0 Parity: Derive forensicLogger from stateManager.
		this.#forensicLogger = this.#stateManager?.managers?.forensicLogger;

		this.#ruleEngine = new ValidationRuleEngine({
			stateManager,
			...options,
		});
		this.#loadCustomRules(customRules);
	}

	/**
	 * Initializes the custom validator and its rule engine.
	 * @returns {Promise<this>} The initialized validator instance.
	 */
	async init() {
		await this.#ruleEngine.init();
		return this;
	}

	/**
	 * Adds a new custom validation rule to the validator's rule set.
	 * This allows for dynamic extension of validation logic at runtime.
	 * @param {string} ruleName - A unique name for the rule.
	 * @param {object} ruleDefinition - The definition of the rule, including its logic and metadata.
	 */
	addRule(ruleName, ruleDefinition) {
		this.#customRules.set(ruleName, {
			...ruleDefinition,
			name: ruleName,
			createdAt: Date.now(),
		});

		this.#audit("rule_added", {
			ruleName,
			entityType: ruleDefinition.entityType,
		});
	}

	/**
	 * Removes a custom validation rule from the validator's rule set.
	 * @param {string} ruleName - The name of the rule to remove.
	 * @returns {boolean} True if the rule was successfully removed, false otherwise.
	 */
	removeRule(ruleName) {
		if (this.#customRules.delete(ruleName)) {
			this.#audit("rule_removed", { ruleName });
			return true;
		}
		return false;
	}

	/**
	 * Main validation entry point
	 * @param {object} entity - The entity to validate against custom rules.
	 * @param {object} [context={}] - The validation context.
	 * @returns {Promise<object>} A validation result object.
	 */
	async validate(entity, context = {}) {
		const metrics = this.#getMetricsNamespace();
		const errors = [];
		const warnings = [];
		const ruleResults = [];

		// Find applicable rules for this entity
		const applicableRules = this.#getApplicableRules(entity);

		for (const rule of applicableRules) {
			const startTime = performance.now();

			try {
				const result = await this.#executeRule(rule, entity, context);
				const executionTime = performance.now() - startTime;

				this.#updateRuleMetrics(metrics, result.passed, executionTime);

				ruleResults.push({
					ruleName: rule.name,
					passed: result.passed,
					executionTime,
					message: result.message,
				});

				// V8.0 Parity: Treat non-passing results as errors or warnings based on severity.
				if (!result.passed) {
					if (rule.severity === "error") {
						errors.push(result.message);
					} else {
						warnings.push(result.message);
					}
				}
			} catch (error) {
				metrics?.increment("rulesFailed");
				const errorMsg = `Custom rule '${rule.name}' execution failed: ${error.message}`;
				errors.push(errorMsg);
				this.#stateManager?.managers?.errorHelpers?.handleError(
					new AppError(errorMsg, { cause: error })
				);
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			ruleResults,
			validator: this.name,
		};
	}

	/**
	 * Validates a single field's value against all applicable field-specific custom rules.
	 * @param {string} entityType - The type of the entity.
	 * @param {string} fieldName - The name of the field to validate.
	 * @param {*} value - The value of the field.
	 * @param {object} [context={}] - The validation context.
	 * @returns {Promise<object>} A validation result object for the field.
	 */
	async validateField(entityType, fieldName, value, context = {}) {
		const errors = [];
		const warnings = [];

		// Find field-specific rules
		const fieldRules = Array.from(this.#customRules.values()).filter(
			(rule) =>
				rule.scope === "field" &&
				rule.entityType === entityType &&
				rule.fieldName === fieldName
		);

		for (const rule of fieldRules) {
			try {
				const result = await this.#executeFieldRule(
					rule,
					value,
					context
				);

				if (!result.passed) {
					if (rule.severity === "error") {
						errors.push(result.message);
					} else {
						warnings.push(result.message);
					}
				}
			} catch (error) {
				errors.push(
					`Field rule '${rule.name}' failed: ${error.message}`
				);
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Checks if this validator has any applicable rules for a given entity.
	 * This is used by the `ValidationStack` to determine if this validator should run.
	 * @param {object} entity - The entity to check.
	 * @param {object} context - The validation context.
	 * @returns {boolean} `true` if there are applicable rules for this entity.
	 */
	isApplicableFor(entity, context) {
		return this.#getApplicableRules(entity).length > 0;
	}

	/**
	 * Checks if this validator has any applicable rules for a specific field.
	 * @param {string} entityType - The type of the entity.
	 * @param {string} fieldName - The name of the field.
	 * @returns {boolean} True if there are applicable rules for this field.
	 */
	supportsField(entityType, fieldName) {
		return Array.from(this.#customRules.values()).some(
			(rule) =>
				rule.scope === "field" &&
				rule.entityType === entityType &&
				rule.fieldName === fieldName
		);
	}

	/**
	 * Retrieves performance and usage metrics for the custom validator.
	 * @returns {object} An object containing performance and usage metrics.
	 */
	getMetrics() {
		const metrics = this.#getMetricsNamespace();
		const rulesExecuted = metrics?.get("rulesExecuted")?.value || 0;
		const rulesPassed = metrics?.get("rulesPassed")?.value || 0;
		return {
			...(metrics?.getAll() || {}),
			rulesLoaded: this.#customRules.size,
			successRate:
				rulesExecuted > 0 ? (rulesPassed / rulesExecuted) * 100 : 100,
		};
	}

	/**
	 * Retrieves a list of all currently loaded custom rules.
	 * @returns {Array<object>} A list of the currently loaded custom rules.
	 */
	getRules() {
		return Array.from(this.#customRules.entries()).map(([name, rule]) => ({
			name,
			description: rule.description,
			entityType: rule.entityType,
			scope: rule.scope,
			severity: rule.severity,
			enabled: rule.enabled !== false,
		}));
	}

	// Private methods
	/**
	 * Loads an initial set of custom rules.
	 * @private
	 * @param {Array<object>} customRules - The rules to load.
	 */
	#loadCustomRules(customRules) {
		for (const rule of customRules) {
			this.addRule(rule.name, rule);
		}
	}

	/**
	 * Filters the loaded rules to find ones applicable to a given entity.
	 * @private
	 * @param {object} entity - The entity being validated.
	 * @returns {Array<object>} A list of applicable rules.
	 */
	#getApplicableRules(entity) {
		return Array.from(this.#customRules.values()).filter((rule) => {
			// Check if rule is enabled
			if (rule.enabled === false) return false;

			// Check entity type match
			if (rule.entityType && rule.entityType !== entity.entity_type)
				return false;

			// Check scope (entity-level rules)
			if (rule.scope !== "entity") return false;

			// Check conditions
			if (rule.conditions) {
				return this.#evaluateConditions(rule.conditions, entity);
			}

			return true;
		});
	}

	/**
	 * Evaluates a set of conditions against an entity.
	 * @private
	 * @param {Array<object>} conditions - The conditions to evaluate.
	 * @param {object} entity - The entity to check against.
	 * @returns {boolean} True if all conditions pass.
	 */
	async #evaluateConditions(conditions, entity) {
		const conditionRegistry =
			this.#stateManager?.managers?.conditionRegistry;
		if (!conditionRegistry) {
			this.#audit("condition_eval_failed", {
				reason: "ConditionRegistry not available.",
			});
			return false; // Fail closed if the registry is missing.
		}

		// The context for evaluation is the entity itself.
		// The ConditionRegistry expects a context object.
		const evaluationContext = { entity };

		// V8.0 Parity: Mandate 2.2 - Delegate evaluation to the central, secure ConditionRegistry.
		// This avoids hardcoded logic and supports complex, nested conditions (`and`, `or`, `not`).
		const conditionSet = {
			type: "and", // All conditions in the array must pass.
			conditions,
		};

		return await conditionRegistry.evaluate(
			conditionSet,
			evaluationContext
		);
	}

	/**
	 * Safely retrieves a nested property value from an object using a dot-notation path.
	 * @private
	 * @param {object} obj - The object to query.
	 * @param {string} path - The dot-notation path (e.g., 'a.b.c').
	 * @returns {*} The value at the specified path, or undefined if not found.
	 */
	#getNestedValue(obj, path) {
		// V8.0 Parity: This is now a utility function. In a future refactor, this could be moved
		// to a shared utility module if used by other classes. For now, it remains here.
		if (!path || typeof path !== "string") return undefined;
		return path.split(".").reduce((current, key) => current?.[key], obj);
	}

	/**
	 * Executes a validation rule based on its type.
	 * @private
	 * @param {object} rule - The rule to execute.
	 * @param {object} entity - The entity being validated.
	 * @param {object} context - The validation context.
	 * @returns {Promise<object>} The result of the rule execution.
	 */
	async #executeRule(rule, entity, context) {
		switch (rule.type) {
			case "expression":
				return await this.#executeExpressionRule(rule, entity, context);
			case "regex":
				return await this.#executeRegexRule(rule, entity, context);
			case "lookup":
				return await this.#executeLookupRule(rule, entity, context);
			default:
				throw new Error(`Unknown rule type: ${rule.type}`);
		}
	}

	/**
	 * Executes a rule defined by a simple expression.
	 * @private
	 * @param {object} rule - The expression rule to execute.
	 * @param {object} entity - The entity being validated.
	 * @param {object} context - The validation context.
	 * @returns {Promise<object>} The result of the rule execution.
	 */
	async #executeExpressionRule(rule, entity, context) {
		// Simple expression evaluation
		const expression = rule.expression;
		const variables = { ...entity, ...context };

		try {
			const result = this.#ruleEngine.evaluateExpression(
				expression,
				variables
			);

			return {
				passed: Boolean(result),
				message: result
					? `Expression rule ${rule.name} passed`
					: `Expression rule ${rule.name} failed: ${expression}`,
			};
		} catch (error) {
			throw new Error(`Expression evaluation failed: ${error.message}`);
		}
	}

	/**
	 * Executes a rule defined by a regular expression pattern.
	 * @private
	 * @param {object} rule - The regex rule to execute.
	 * @param {object} entity - The entity being validated.
	 * @param {object} context - The validation context.
	 * @returns {Promise<object>} The result of the rule execution.
	 */
	async #executeRegexRule(rule, entity, context) {
		const fieldValue = this.#getNestedValue(entity, rule.field);
		const regex = new RegExp(rule.pattern, rule.flags || "i");

		const passed = regex.test(String(fieldValue || ""));

		return {
			passed,
			message: passed
				? `Field ${rule.field} matches pattern`
				: `Field ${rule.field} does not match required pattern`,
		};
	}

	/**
	 * Executes a rule that looks up a value in a predefined list.
	 * @private
	 * @param {object} rule - The lookup rule to execute.
	 * @param {object} entity - The entity being validated.
	 * @param {object} context - The validation context.
	 * @returns {Promise<object>} The result of the rule execution.
	 */
	async #executeLookupRule(rule, entity, context) {
		const lookupValue = this.#getNestedValue(entity, rule.field);

		// Simulate lookup (in real implementation, this would query a database/API)
		const validValues = rule.lookupTable || [];
		const passed = validValues.includes(lookupValue);

		return {
			passed,
			message: passed
				? `Field ${rule.field} has valid value`
				: `Field ${rule.field} contains invalid value: ${lookupValue}`,
		};
	}

	/**
	 * Executes a rule specifically for a single field's value.
	 * @private
	 * @param {object} rule - The rule to execute.
	 * @param {*} value - The field value to validate.
	 * @param {object} context - The validation context.
	 * @returns {Promise<object>} The result of the rule execution.
	 */
	async #executeFieldRule(rule, value, context) {
		// Create field-specific entity for rule execution
		const fieldEntity = { [rule.fieldName]: value };
		return await this.#executeRule(rule, fieldEntity, context);
	}

	/**
	 * Updates the performance metrics for rule executions.
	 * @private
	 * @param {boolean} passed - Whether the rule passed or failed.
	 * @param {number} executionTime - The time taken to execute the rule in milliseconds.
	 */
	#updateRuleMetrics(metrics, passed, executionTime) {
		if (!metrics) return;

		metrics.increment("rulesExecuted");

		if (passed) {
			metrics.increment("rulesPassed");
		} else {
			metrics.increment("rulesFailed");
		}

		// Update average execution time
		metrics.updateAverage("averageExecutionTime", executionTime);
	}

	/**
	 * Logs an audit event if the forensic logger is available.
	 * @private
	 * @param {string} eventType - The type of the event (e.g., 'rule_added').
	 * @param {object} data - The data associated with the event.
	 */
	#audit(eventType, data) {
		if (this.#forensicLogger) {
			this.#forensicLogger.logAuditEvent(
				`CUSTOM_VALIDATOR_${eventType.toUpperCase()}`,
				data
			);
		}
	}

	#getMetricsNamespace() {
		return this.#stateManager?.metricsRegistry?.namespace(
			"customValidator"
		);
	}
}

/**
 * A simple expression evaluation engine for custom validation rules.
 * @private
 */
class ValidationRuleEngine {
	/** @private @type {import('../../HybridStateManager.js').default} */
	#stateManager;

	/**
	 * Creates an instance of ValidationRuleEngine.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
	}

	/**
	 * Initializes the rule engine.
	 * @returns {Promise<this>} The initialized engine.
	 */
	async init() {
		// Initialize expression engine
		return this;
	}

	/**
	 * Evaluates a simple expression with a given set of variables.
	 * @param {string} expression - The expression to evaluate (e.g., "status == 'active'").
	 * @param {object} variables - An object of variables to substitute into the expression.
	 * @returns {*} The result of the expression evaluation.
	 */
	evaluateExpression(expression, variables) {
		// V8.0 Parity: The use of `new Function()` is a significant security risk and has been removed.
		// All complex logic should be handled by the declarative `ConditionRegistry` using the `evaluate_logical` condition.
		// This change enforces a secure-by-design pattern, preventing arbitrary code execution from data.
		const conditionRegistry =
			this.#stateManager?.managers?.conditionRegistry;
		if (!conditionRegistry) {
			throw new Error(
				"ConditionRegistry is not available for expression evaluation."
			);
		}

		const condition = {
			type: "evaluate_logical",
			...expression, // Assume the expression is now a declarative condition object
		};

		// The evaluation context is the `variables` object.
		return conditionRegistry.evaluate(condition, variables);
	}
}
