// core/validation/ValidationLayer.js
// Universal schema validation with composable rules

/**
 * @file ValidationLayer.js
 * @description Provides a universal schema validation layer with composable rules.
 * This layer is responsible for ensuring data integrity, type checking, business rule enforcement,
 * and security validation before data is persisted or transmitted. It is distinct from the sync layer,
 * which handles data consistency across systems.
 */

/**
 * @class ValidationLayer
 * @classdesc Orchestrates a stack of validation modules to perform comprehensive data validation.
 * It supports base schema checks, type-specific rules, security constraints, and custom business logic.
 */
export class ValidationLayer {
	/**
	 * @private
	 * @type {Map<string, Function>}
	 */
	#validators = new Map();
	/**
	 * @private
	 * @type {Map<string, Function>}
	 */
	#customRules = new Map();
	/**
	 * @private
	 * @type {object}
	 */
	#config;
	/**
	 * @private
	 * @type {boolean}
	 */
	#ready = false;
	/** @private @type {import('../HybridStateManager.js').default|null} */
	#stateManager = null;

	/**
	 * Creates an instance of ValidationLayer.
	 * @param {object} context - The application context and configuration.
	 * @param {import('../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @param {object} [context.options={}] - Configuration options for the validation layer.
	 * @param {boolean} [context.options.strictMode=true] - If true, validation failures in custom rules will be treated as errors.
	 * @param {string} [context.options.performanceMode='balanced'] - Performance tuning for validation ('balanced' or 'thorough').
	 * @param {object} [context.options.customValidators={}] - A map of custom field validators to register on initialization.
	 * @param {number} [context.options.maxErrors=10] - The maximum number of validation errors to return.
	 * @param {number} [context.options.asyncTimeout=5000] - Timeout in milliseconds for asynchronous validation rules.
	 */
	constructor({ stateManager, ...options }) {
		this.#stateManager = stateManager;
		this.#config = {
			strictMode: options.strictMode !== false,
			performanceMode: options.performanceMode || "balanced",
			customValidators: options.customValidators || {},
			maxErrors: options.maxErrors || 10,
			asyncTimeout: options.asyncTimeout || 5000,
			...options,
		};

		this.#initializeBaseValidators();
		this.#loadCustomValidators(this.#config.customValidators);
	}

	/**
	 * Gets the namespaced metrics registry instance.
	 * @private
	 * @returns {import('../../utils/MetricsRegistry.js').MetricsRegistry|null}
	 */
	get #metrics() {
		return this.#stateManager?.metricsRegistry?.namespace("validation");
	}

	/**
	 * Initializes the validation layer and any asynchronous validators.
	 * @public
	 * @returns {Promise<this>} The initialized ValidationLayer instance.
	 */
	async init() {
		if (this.#ready) return this;

		// Initialize async validators if any
		await this.#initializeAsyncValidators();

		this.#ready = true;
		console.log("[ValidationLayer] Ready with schema validation");
		return this;
	}

	/**
	 * Validates a full entity against the base schema, type-specific rules, security constraints, and custom business rules.
	 * @public
	 * @param {object} entity - The entity object to validate.
	 * @returns {Promise<{valid: boolean, errors: string[], warnings: string[], metadata: object}>} A promise that resolves with a comprehensive validation result.
	 */
	async validateEntity(entity) {
		if (!this.#ready) throw new Error("ValidationLayer not initialized");

		const startTime = performance.now();
		const errors = [];

		try {
			// 1. Base schema validation
			const baseResult = this.#validateBaseSchema(entity);
			if (!baseResult.valid) {
				errors.push(...baseResult.errors);
			}

			// 2. Type-specific validation
			const typeResult = this.#validateEntityType(entity);
			if (!typeResult.valid) {
				errors.push(...typeResult.errors);
			}

			// 3. Security validation
			const securityResult = this.#validateSecurity(entity);
			if (!securityResult.valid) {
				errors.push(...securityResult.errors);
			}

			// 4. Custom business rules
			const customResult = await this.#validateCustomRules(entity);
			if (!customResult.valid) {
				errors.push(...customResult.errors);
			}

			// 5. Cross-field validation
			const crossFieldResult = this.#validateCrossFields(entity);
			if (!crossFieldResult.valid) {
				errors.push(...crossFieldResult.errors);
			}

			const latency = performance.now() - startTime;
			const isValid = errors.length === 0;

			this.#recordValidation(isValid, latency, errors);

			if (!isValid) {
				this.stateManager?.emit?.("validationError", {
					entityId: entity.id,
					entityType: entity.entity_type,
					errors: errors.slice(0, this.#config.maxErrors),
				});
			}

			return {
				valid: isValid,
				errors: errors.slice(0, this.#config.maxErrors),
				warnings: [],
				metadata: {
					latency,
					rulesExecuted: this.#getExecutedRules(),
					entityType: entity.entity_type,
				},
			};
		} catch (error) {
			const latency = performance.now() - startTime;
			this.#recordValidation(false, latency, [error.message]);

			return {
				valid: false,
				errors: [`Validation system error: ${error.message}`],
				warnings: [],
				metadata: { latency, systemError: true },
			};
		}
	}

	/**
	 * Validates a single field's value against its definition, including type, format, and range checks.
	 * @public
	 * @param {string} fieldName - The name of the field to validate.
	 * @param {*} value - The value of the field.
	 * @param {object} fieldDefinition - The definition object for the field, containing type, format, and other constraints.
	 * @returns {{valid: boolean, errors: string[]}} The validation result for the field.
	 */
	validateField(fieldName, value, fieldDefinition) {
		const errors = [];

		// Required check
		if (
			fieldDefinition.required &&
			(value === null || value === undefined || value === "")
		) {
			errors.push(`Field '${fieldName}' is required`);
			return { valid: false, errors };
		}

		// Skip further validation if value is empty and not required
		if (value === null || value === undefined || value === "") {
			return { valid: true, errors: [] };
		}

		// Type validation
		const typeResult = this.#validateFieldType(
			fieldName,
			value,
			fieldDefinition.type
		);
		if (!typeResult.valid) {
			errors.push(...typeResult.errors);
		}

		// Format validation
		if (fieldDefinition.format) {
			const formatResult = this.#validateFieldFormat(
				fieldName,
				value,
				fieldDefinition.format
			);
			if (!formatResult.valid) {
				errors.push(...formatResult.errors);
			}
		}

		// Range/length validation
		if (
			fieldDefinition.min !== undefined ||
			fieldDefinition.max !== undefined
		) {
			const rangeResult = this.#validateFieldRange(
				fieldName,
				value,
				fieldDefinition
			);
			if (!rangeResult.valid) {
				errors.push(...rangeResult.errors);
			}
		}

		// Custom validator
		if (
			fieldDefinition.validator &&
			this.#validators.has(fieldDefinition.validator)
		) {
			const validator = this.#validators.get(fieldDefinition.validator);
			const customResult = validator(value, fieldDefinition);
			if (!customResult.valid) {
				errors.push(...customResult.errors);
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Registers a new custom validation rule function.
	 * @public
	 * @param {string} name - A unique name for the rule.
	 * @param {Function} rule - The validation function, which should accept an entity and return `{valid: boolean, errors: string[]}`.
	 */
	addValidationRule(name, rule) {
		if (typeof rule !== "function") {
			throw new Error("Validation rule must be a function");
		}

		this.#customRules.set(name, rule);
		console.log(`[ValidationLayer] Added custom rule: ${name}`);
	}

	/**
	 * Registers a new custom field validator function.
	 * @public
	 * @param {string} name - A unique name for the validator.
	 * @param {Function} validator - The validator function, which accepts a value and field definition.
	 */
	addFieldValidator(name, validator) {
		if (typeof validator !== "function") {
			throw new Error("Field validator must be a function");
		}

		this.#validators.set(name, validator);
		console.log(`[ValidationLayer] Added field validator: ${name}`);
	}

	/**
	 * Retrieves performance and usage statistics for the validation layer.
	 * @public
	 * @returns {object} An object containing various metrics.
	 * @readonly
	 */
	get stats() {
		const baseMetrics = this.#metrics?.getAllAsObject() || {};
		return {
			...baseMetrics,
			averageLatency: baseMetrics.averageLatency?.avg || 0,
			customRules: this.#customRules.size,
			fieldValidators: this.#validators.size,
			isReady: this.#ready,
		};
	}

	/**
	 * Cleans up resources by clearing all registered validators and rules.
	 * @public
	 */
	cleanup() {
		this.#validators.clear();
		this.#customRules.clear();
		this.#ready = false;
	}

	// ===== PRIVATE VALIDATION METHODS =====

	/**
	 * Validates an entity against the universal base schema, checking for required fields like `id` and `entity_type`.
	 * @private
	 * @param {object} entity - The entity to validate.
	 * @returns {{valid: boolean, errors: string[]}} The validation result.
	 */
	#validateBaseSchema(entity) {
		const errors = [];

		// Required fields
		const requiredFields = ["id", "entity_type"];
		for (const field of requiredFields) {
			if (!entity[field]) {
				errors.push(`Missing required field: ${field}`);
			}
		}

		// ID format
		if (entity.id && !this.#isValidUUID(entity.id)) {
			errors.push("ID must be a valid UUID");
		}

		// Timestamps
		if (entity.created_at && !this.#isValidTimestamp(entity.created_at)) {
			errors.push("created_at must be a valid ISO timestamp");
		}

		if (entity.updated_at && !this.#isValidTimestamp(entity.updated_at)) {
			errors.push("updated_at must be a valid ISO timestamp");
		}

		// Entity type validation using schema from stateManager
		if (this.#stateManager?.schema?.loaded) {
			const validTypes = this.#stateManager.getAvailableEntityTypes();
			if (
				entity.entity_type &&
				!validTypes.includes(entity.entity_type)
			) {
				errors.push(`Invalid entity_type: ${entity.entity_type}`);
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Routes an entity to its type-specific validation method (e.g., `_validateTaskEntity`).
	 * @private
	 * @param {object} entity - The entity to validate.
	 * @returns {{valid: boolean, errors: string[]}} The validation result.
	 */
	#validateEntityType(entity) {
		switch (entity.entity_type) {
			case "task":
				return this.#validateTaskEntity(entity);
			case "document":
				return this.#validateDocumentEntity(entity);
			case "event":
				return this.#validateEventEntity(entity);
			case "user":
				return this.#validateUserEntity(entity);
			default:
				// Generic validation for unknown types
				return { valid: true, errors: [] };
		}
	}

	/**
	 * Validates security-related fields, such as classification and compartment markings.
	 * @private
	 * @param {object} entity - The entity to validate.
	 * @returns {{valid: boolean, errors: string[]}} The validation result.
	 */
	#validateSecurity(entity) {
		const errors = [];

		// Classification validation using schema from stateManager
		if (this.#stateManager?.schema?.loaded) {
			const validClassifications =
				this.#stateManager.getSecurityClassifications();
			if (
				entity.classification &&
				!validClassifications.includes(entity.classification)
			) {
				errors.push(`Invalid classification: ${entity.classification}`);
			}
			if (
				entity.nato_classification &&
				!validClassifications.includes(entity.nato_classification)
			) {
				errors.push(
					`Invalid classification: ${entity.nato_classification}`
				);
			}
		}

		// Compartment markings
		if (entity.compartment_markings) {
			if (!Array.isArray(entity.compartment_markings)) {
				errors.push("compartment_markings must be an array");
			} else {
				for (const marking of entity.compartment_markings) {
					if (typeof marking !== "string" || marking.length === 0) {
						errors.push(
							"All compartment markings must be non-empty strings"
						);
						break;
					}
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Validates fields specific to a 'task' entity.
	 * @private
	 * @param {object} entity - The task entity.
	 * @returns {{valid: boolean, errors: string[]}} The validation result.
	 */
	#validateTaskEntity(entity) {
		const errors = [];

		// Title is required
		if (!entity.title || typeof entity.title !== "string") {
			errors.push("Task title is required and must be a string");
		} else if (entity.title.length > 200) {
			errors.push("Task title must be 200 characters or less");
		}

		// Status validation
		const validStatuses = [
			"pending",
			"in-progress",
			"completed",
			"cancelled",
		];
		if (entity.status && !validStatuses.includes(entity.status)) {
			errors.push(`Invalid task status: ${entity.status}`);
		}

		// Priority validation
		const validPriorities = ["low", "medium", "high", "critical"];
		if (entity.priority && !validPriorities.includes(entity.priority)) {
			errors.push(`Invalid task priority: ${entity.priority}`);
		}

		// Due date validation
		if (entity.due_date && !this.#isValidTimestamp(entity.due_date)) {
			errors.push("Task due_date must be a valid ISO timestamp");
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Validates fields specific to a 'document' entity.
	 * @private
	 * @param {object} entity - The document entity.
	 * @returns {{valid: boolean, errors: string[]}} The validation result.
	 */
	#validateDocumentEntity(entity) {
		const errors = [];

		// Title is required
		if (!entity.title || typeof entity.title !== "string") {
			errors.push("Document title is required and must be a string");
		} else if (entity.title.length > 200) {
			errors.push("Document title must be 200 characters or less");
		}

		// Content validation
		if (entity.content && typeof entity.content !== "string") {
			errors.push("Document content must be a string");
		} else if (entity.content && entity.content.length > 50000) {
			errors.push("Document content must be 50,000 characters or less");
		}

		// Content type validation
		const validContentTypes = ["text", "markdown", "html", "json"];
		if (
			entity.content_type &&
			!validContentTypes.includes(entity.content_type)
		) {
			errors.push(
				`Invalid document content_type: ${entity.content_type}`
			);
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Validates fields specific to an 'event' entity.
	 * @private
	 * @param {object} entity - The event entity.
	 * @returns {{valid: boolean, errors: string[]}} The validation result.
	 */
	#validateEventEntity(entity) {
		const errors = [];

		// Event type validation
		if (!entity.event_type || typeof entity.event_type !== "string") {
			errors.push("Event event_type is required and must be a string");
		}

		// Severity validation
		const validSeverities = [
			"debug",
			"info",
			"warning",
			"error",
			"critical",
		];
		if (entity.severity && !validSeverities.includes(entity.severity)) {
			errors.push(`Invalid event severity: ${entity.severity}`);
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Validates fields specific to a 'user' entity.
	 * @private
	 * @param {object} entity - The user entity.
	 * @returns {{valid: boolean, errors: string[]}} The validation result.
	 */
	#validateUserEntity(entity) {
		const errors = [];

		// Email validation
		if (entity.email && !this.#isValidEmail(entity.email)) {
			errors.push("Invalid email format");
		}

		// Display name validation
		if (entity.display_name && typeof entity.display_name !== "string") {
			errors.push("Display name must be a string");
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Executes all registered custom business rules against an entity.
	 * @private
	 * @param {object} entity - The entity to validate.
	 * @returns {Promise<{valid: boolean, errors: string[]}>} The aggregated result of all custom rules.
	 */
	async #validateCustomRules(entity) {
		const errors = [];

		for (const [ruleName, rule] of this.#customRules) {
			try {
				const result = await Promise.race([
					rule(entity),
					new Promise((_, reject) =>
						setTimeout(
							() => reject(new Error("Validation timeout")),
							this.#config.asyncTimeout
						)
					),
				]);

				if (!result.valid) {
					errors.push(...result.errors);
				}

				this.#metrics?.increment(`ruleExecutions.${ruleName}`);
			} catch (error) {
				console.warn(`Custom rule '${ruleName}' failed:`, error);
				if (this.#config.strictMode) {
					errors.push(
						`Custom rule '${ruleName}' failed: ${error.message}`
					);
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Validates relationships and dependencies between different fields within an entity.
	 * @private
	 * @param {object} entity - The entity to validate.
	 * @returns {{valid: boolean, errors: string[]}} The validation result.
	 */
	#validateCrossFields(entity) {
		const errors = [];

		// Task-specific cross-field validation
		if (entity.entity_type === "task") {
			// Due date must be in the future for pending tasks
			if (entity.status === "pending" && entity.due_date) {
				const dueDate = new Date(entity.due_date);
				if (dueDate < new Date()) {
					errors.push(
						"Due date cannot be in the past for pending tasks"
					);
				}
			}

			// Completed tasks should have a completion date
			if (entity.status === "completed" && !entity.completed_at) {
				errors.push("Completed tasks should have a completion date");
			}
		}

		// Document-specific cross-field validation
		if (entity.entity_type === "document") {
			// Content type should match content format
			if (entity.content_type === "json" && entity.content) {
				try {
					JSON.parse(entity.content);
				} catch {
					errors.push(
						"Document content is not valid JSON despite content_type being json"
					);
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	// ===== PRIVATE HELPER METHODS =====

	/**
	 * Validates a field's value against an expected JavaScript type.
	 * @private
	 * @param {string} fieldName - The name of the field.
	 * @param {*} value - The value to check.
	 * @param {string} expectedType - The expected type (e.g., 'string', 'number', 'array').
	 */
	#validateFieldType(fieldName, value, expectedType) {
		const errors = [];
		const actualType = typeof value;

		if (expectedType === "array" && !Array.isArray(value)) {
			errors.push(`Field '${fieldName}' must be an array`);
		} else if (expectedType !== "array" && actualType !== expectedType) {
			errors.push(
				`Field '${fieldName}' must be of type ${expectedType}, got ${actualType}`
			);
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Validates a field's value against a predefined format (e.g., 'email', 'uuid').
	 * @private
	 * @param {string} fieldName - The name of the field.
	 * @param {string} value - The value to check.
	 * @param {string} format - The expected format.
	 */
	#validateFieldFormat(fieldName, value, format) {
		const errors = [];

		switch (format) {
			case "email":
				if (!this.#isValidEmail(value)) {
					errors.push(
						`Field '${fieldName}' must be a valid email address`
					);
				}
				break;
			case "uuid":
				if (!this.#isValidUUID(value)) {
					errors.push(`Field '${fieldName}' must be a valid UUID`);
				}
				break;
			case "url":
				if (!this.#isValidURL(value)) {
					errors.push(`Field '${fieldName}' must be a valid URL`);
				}
				break;
			case "iso-date":
				if (!this.#isValidTimestamp(value)) {
					errors.push(
						`Field '${fieldName}' must be a valid ISO timestamp`
					);
				}
				break;
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Validates if a field's value (or length) is within a specified min/max range.
	 * @private
	 * @param {string} fieldName - The name of the field.
	 * @param {*} value - The value to check.
	 * @param {object} fieldDefinition - The field definition containing `min` and/or `max` properties.
	 */
	#validateFieldRange(fieldName, value, fieldDefinition) {
		const errors = [];

		if (typeof value === "string") {
			if (
				fieldDefinition.min !== undefined &&
				value.length < fieldDefinition.min
			) {
				errors.push(
					`Field '${fieldName}' must be at least ${fieldDefinition.min} characters`
				);
			}
			if (
				fieldDefinition.max !== undefined &&
				value.length > fieldDefinition.max
			) {
				errors.push(
					`Field '${fieldName}' must be at most ${fieldDefinition.max} characters`
				);
			}
		} else if (typeof value === "number") {
			if (
				fieldDefinition.min !== undefined &&
				value < fieldDefinition.min
			) {
				errors.push(
					`Field '${fieldName}' must be at least ${fieldDefinition.min}`
				);
			}
			if (
				fieldDefinition.max !== undefined &&
				value > fieldDefinition.max
			) {
				errors.push(
					`Field '${fieldName}' must be at most ${fieldDefinition.max}`
				);
			}
		} else if (Array.isArray(value)) {
			if (
				fieldDefinition.min !== undefined &&
				value.length < fieldDefinition.min
			) {
				errors.push(
					`Field '${fieldName}' must have at least ${fieldDefinition.min} items`
				);
			}
			if (
				fieldDefinition.max !== undefined &&
				value.length > fieldDefinition.max
			) {
				errors.push(
					`Field '${fieldName}' must have at most ${fieldDefinition.max} items`
				);
			}
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Checks if a string is a valid UUID.
	 * @private
	 * @param {string} value - The string to check.
	 */
	#isValidUUID(value) {
		const uuidRegex =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		return uuidRegex.test(value);
	}

	/**
	 * Checks if a string is a valid email address.
	 * @private
	 * @param {string} value - The string to check.
	 */
	#isValidEmail(value) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(value);
	}

	/**
	 * Checks if a string is a valid URL.
	 * @private
	 * @param {string} value - The string to check.
	 */
	#isValidURL(value) {
		try {
			new URL(value);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Checks if a string is a valid ISO 8601 timestamp.
	 * @private
	 * @param {string} value - The string to check.
	 */
	#isValidTimestamp(value) {
		const date = new Date(value);
		return !isNaN(date.getTime()) && date.toISOString() === value;
	}

	/**
	 * Initializes a set of base validators for common formats like email, UUID, and URL.
	 * @private
	 * @returns {void}
	 */
	#initializeBaseValidators() {
		// Add basic field validators
		this.#validators.set("email", (value) => ({
			valid: this.#isValidEmail(value),
			errors: this.#isValidEmail(value) ? [] : ["Invalid email format"],
		}));

		this.#validators.set("uuid", (value) => ({
			valid: this.#isValidUUID(value),
			errors: this.#isValidUUID(value) ? [] : ["Invalid UUID format"],
		}));

		this.#validators.set("url", (value) => ({
			valid: this.#isValidURL(value),
			errors: this.#isValidURL(value) ? [] : ["Invalid URL format"],
		}));
	}

	/**
	 * Loads custom field validators provided in the constructor options.
	 * @private
	 * @param {object} customValidators - A map of validator names to functions.
	 * @returns {void}
	 */
	#loadCustomValidators(customValidators) {
		for (const [name, validator] of Object.entries(customValidators)) {
			this.addFieldValidator(name, validator);
		}
	}

	/**
	 * A stub for initializing asynchronous validators in the future.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #initializeAsyncValidators() {
		// Initialize any async validators here
		// For now, all validators are synchronous
	}

	/**
	 * Records metrics after a validation operation.
	 * @private
	 * @param {boolean} success - Whether the validation passed.
	 * @param {number} latency - The duration of the validation in milliseconds.
	 * @param {string[]} errors - Any validation errors that occurred.
	 * @returns {void}
	 */
	#recordValidation(success, latency, errors) {
		this.#metrics?.increment("validationCount");
		if (!success) {
			this.#metrics?.increment("validationErrors");
			const recent = this.#metrics?.get("recentErrors") || [];
			const newError = {
				errors,
				timestamp: Date.now(),
			};
			const updatedRecent = [newError, ...recent].slice(0, 100);
			this.#metrics?.set("recentErrors", updatedRecent);
		}

		// Update average latency
		this.#metrics?.updateAverage("averageLatency", latency);
	}

	/**
	 * Gets the names of all custom rules that were executed.
	 * @private
	 * @returns {string[]} An array of executed rule names.
	 */
	#getExecutedRules() {
		return Object.keys(this.#metrics?.getNamespace("ruleExecutions") || {});
	}
}

export default ValidationLayer;
