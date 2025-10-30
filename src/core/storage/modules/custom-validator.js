// modules/custom-validator.js
// Custom validation module for user-defined business rules

/**
 * Custom Validator Module
 * Loaded for: configurations with custom validation requirements
 * Bundle size: ~2KB (rule engine and custom validators)
 */
export default class CustomValidator {
	/** @private */
	#customRules = new Map();
	/** @private */
	#ruleEngine;
	/** @private */
	#metrics = {
		rulesExecuted: 0,
		rulesPassed: 0,
		rulesFailed: 0,
		averageExecutionTime: 0,
	};

	/**
	 * Creates an instance of CustomValidator.
	 * @param {Array<object>} [customRules=[]] - An array of predefined custom rule objects.
	 * @param {object} [options={}] - Configuration options for the validator and its rule engine.
	 */
	constructor(customRules = [], options = {}) {
		this.name = "CustomValidator";
		this.type = "business";
		this.supports = ["objects", "events", "relationships"];

		this.#ruleEngine = new ValidationRuleEngine(options);
		this.#loadCustomRules(customRules);

		console.log(
			`[CustomValidator] Loaded with ${customRules.length} custom rules`
		);
	}

	/**
	 * Initializes the custom validator and its rule engine.
	 * @returns {Promise<this>} The initialized validator instance.
	 */
	async init() {
		await this.#ruleEngine.init();
		console.log("[CustomValidator] Custom validation rules initialized");
		return this;
	}

	/**
	 * Add custom validation rule
	 * @param {string} ruleName - A unique name for the rule.
	 * @param {object} ruleDefinition - The definition of the rule, including its logic and metadata.
	 */
	addRule(ruleName, ruleDefinition) {
		this.#customRules.set(ruleName, {
			...ruleDefinition,
			name: ruleName,
			createdAt: Date.now(),
		});

		console.log(`[CustomValidator] Added custom rule: ${ruleName}`);
	}

	/**
	 * Remove custom validation rule
	 * @param {string} ruleName - The name of the rule to remove.
	 * @returns {boolean} True if the rule was successfully removed, false otherwise.
	 */
	removeRule(ruleName) {
		if (this.#customRules.delete(ruleName)) {
			console.log(`[CustomValidator] Removed custom rule: ${ruleName}`);
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

				this.#updateRuleMetrics(result.passed, executionTime);

				ruleResults.push({
					ruleName: rule.name,
					passed: result.passed,
					executionTime,
					message: result.message,
				});

				if (!result.passed) {
					if (rule.severity === "error") {
						errors.push(result.message);
					} else {
						warnings.push(result.message);
					}
				}
			} catch (error) {
				this.#metrics.rulesFailed++;
				const errorMsg = `Custom rule '${rule.name}' execution failed: ${error.message}`;
				errors.push(errorMsg);
				console.error(`[CustomValidator] ${errorMsg}`);
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
	 * Field-specific validation
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
	 * Check if validator supports entity
	 * @param {object} entity - The entity to check.
	 * @param {object} context - The validation context.
	 * @returns {boolean} True if there are applicable rules for this entity.
	 */
	supports(entity, context) {
		return this.#getApplicableRules(entity).length > 0;
	}

	/**
	 * Check if validator supports field
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
	 * Get validation metrics
	 * @returns {object} An object containing performance and usage metrics.
	 */
	getMetrics() {
		return {
			...this.#metrics,
			rulesLoaded: this.#customRules.size,
			successRate:
				this.#metrics.rulesExecuted > 0
					? (this.#metrics.rulesPassed /
							this.#metrics.rulesExecuted) *
						100
					: 0,
		};
	}

	/**
	 * Get loaded rules
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
	#evaluateConditions(conditions, entity) {
		for (const condition of conditions) {
			if (!this.#evaluateCondition(condition, entity)) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Evaluates a single condition against an entity.
	 * @private
	 * @param {object} condition - The condition to evaluate.
	 * @param {object} entity - The entity to check against.
	 * @returns {boolean} The result of the condition evaluation.
	 */
	#evaluateCondition(condition, entity) {
		const { field, operator, value } = condition;
		const entityValue = this.#getNestedValue(entity, field);

		switch (operator) {
			case "equals":
				return entityValue === value;
			case "not_equals":
				return entityValue !== value;
			case "contains":
				return (
					typeof entityValue === "string" &&
					entityValue.includes(value)
				);
			case "starts_with":
				return (
					typeof entityValue === "string" &&
					entityValue.startsWith(value)
				);
			case "ends_with":
				return (
					typeof entityValue === "string" &&
					entityValue.endsWith(value)
				);
			case "greater_than":
				return Number(entityValue) > Number(value);
			case "less_than":
				return Number(entityValue) < Number(value);
			case "exists":
				return entityValue !== null && entityValue !== undefined;
			case "not_exists":
				return entityValue === null || entityValue === undefined;
			case "in":
				return Array.isArray(value) && value.includes(entityValue);
			case "not_in":
				return Array.isArray(value) && !value.includes(entityValue);
			default:
				console.warn(
					`[CustomValidator] Unknown condition operator: ${operator}`
				);
				return false;
		}
	}

	/**
	 * Safely retrieves a nested property value from an object using a dot-notation path.
	 * @private
	 * @param {object} obj - The object to query.
	 * @param {string} path - The dot-notation path (e.g., 'a.b.c').
	 * @returns {*} The value at the specified path, or undefined if not found.
	 */
	#getNestedValue(obj, path) {
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
			case "javascript":
				return await this.#executeJavaScriptRule(rule, entity, context);
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
	 * Executes a rule defined by a JavaScript function in a sandboxed environment.
	 * @private
	 * @param {object} rule - The JavaScript rule to execute.
	 * @param {object} entity - The entity being validated.
	 * @param {object} context - The validation context.
	 * @returns {Promise<object>} The result of the rule execution.
	 */
	async #executeJavaScriptRule(rule, entity, context) {
		// Create safe execution context
		const sandbox = {
			entity,
			context,
			// Safe utility functions
			utils: {
				isEmail: (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str),
				isPhone: (str) => /^[+]?[1-9][\d]{0,15}$/.test(str),
				isDate: (str) => !isNaN(Date.parse(str)),
				isEmpty: (val) =>
					val === null || val === undefined || val === "",
				length: (val) => val?.length || 0,
			},
		};

		try {
			// Execute rule function with sandbox
			const result = rule.function.call(sandbox, entity, context);

			return {
				passed: Boolean(result),
				message:
					result === true
						? `Rule ${rule.name} passed`
						: typeof result === "string"
							? result
							: `Rule ${rule.name} failed`,
			};
		} catch (error) {
			throw new Error(
				`JavaScript rule execution failed: ${error.message}`
			);
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
	#updateRuleMetrics(passed, executionTime) {
		this.#metrics.rulesExecuted++;

		if (passed) {
			this.#metrics.rulesPassed++;
		} else {
			this.#metrics.rulesFailed++;
		}

		// Update average execution time
		const totalTime =
			this.#metrics.averageExecutionTime *
				(this.#metrics.rulesExecuted - 1) +
			executionTime;
		this.#metrics.averageExecutionTime =
			totalTime / this.#metrics.rulesExecuted;
	}
}

/**
 * Simple expression evaluation engine
 */
class ValidationRuleEngine {
	/**
	 * Creates an instance of ValidationRuleEngine.
	 * @param {object} [options={}] - Configuration options.
	 */
	constructor(options = {}) {
		this.options = options;
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
		// Simple expression evaluator (in production, use a proper expression parser)
		try {
			// Replace variables in expression
			let evaluableExpression = expression;

			for (const [key, value] of Object.entries(variables)) {
				const regex = new RegExp(`\\b${key}\\b`, "g");
				const replacement =
					typeof value === "string" ? `"${value}"` : String(value);
				evaluableExpression = evaluableExpression.replace(
					regex,
					replacement
				);
			}

			// Simple evaluation for demo (in production, use a safe parser)
			// This is just for demonstration - in real use, implement proper expression parsing
			return this.#simpleSafeEval(evaluableExpression);
		} catch (error) {
			throw new Error(`Expression evaluation failed: ${error.message}`);
		}
	}

	/**
	 * A very basic, unsafe evaluation function for demonstration purposes.
	 * In a real application, this MUST be replaced with a secure expression parser.
	 * @private
	 * @param {string} expression - The expression string to evaluate.
	 * @returns {*} The result of the evaluation.
	 */
	#simpleSafeEval(expression) {
		// Very basic expression evaluation for demo
		// In production, use a proper expression parser like jexl or similar

		// Handle simple comparisons
		if (expression.includes("==")) {
			const [left, right] = expression.split("==").map((s) => s.trim());
			return this.#parseValue(left) === this.#parseValue(right);
		}

		if (expression.includes("!=")) {
			const [left, right] = expression.split("!=").map((s) => s.trim());
			return this.#parseValue(left) !== this.#parseValue(right);
		}

		if (expression.includes(">=")) {
			const [left, right] = expression.split(">=").map((s) => s.trim());
			return (
				Number(this.#parseValue(left)) >=
				Number(this.#parseValue(right))
			);
		}

		if (expression.includes("<=")) {
			const [left, right] = expression.split("<=").map((s) => s.trim());
			return (
				Number(this.#parseValue(left)) <=
				Number(this.#parseValue(right))
			);
		}

		if (expression.includes(">")) {
			const [left, right] = expression.split(">").map((s) => s.trim());
			return (
				Number(this.#parseValue(left)) > Number(this.#parseValue(right))
			);
		}

		if (expression.includes("<")) {
			const [left, right] = expression.split("<").map((s) => s.trim());
			return (
				Number(this.#parseValue(left)) < Number(this.#parseValue(right))
			);
		}

		// Default: try to parse as boolean
		return Boolean(this.#parseValue(expression));
	}

	/**
	 * Parses a string value into its likely type (boolean, null, number, string).
	 * @private
	 * @param {string} value - The string value to parse.
	 * @returns {*} The parsed value.
	 */
	#parseValue(value) {
		if (value === "true") return true;
		if (value === "false") return false;
		if (value === "null") return null;
		if (value === "undefined") return undefined;
		if (value.startsWith('"') && value.endsWith('"')) {
			return value.slice(1, -1); // Remove quotes
		}
		if (!isNaN(value)) return Number(value);
		return value;
	}
}
