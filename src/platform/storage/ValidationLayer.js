/**
 * @file ValidationLayer.js
 * @version 2.0.0 - Enterprise Observability Baseline
 * @description Production-ready validation layer with comprehensive observability,
 * security enforcement, and compliance features. Uses centralized orchestration wrapper for
 * consistent observability and minimal logging noise.
 *
 * ESLint Exception: nodus/require-async-orchestration
 * Justification: Wrapper pattern provides superior observability consistency and
 * centralized policy enforcement compared to per-method orchestrator setup.
 *
 * Security Classification: INTERNAL
 * License Tier: Core (validation is fundamental system operation)
 * Compliance: MAC-enforced, forensic-audited, performance-monitored
 *
 * @see {@link NODUS_DEVELOPER_MIGRATION_GUIDE.md} - Orchestrator patterns and observability requirements
 */

/* eslint-disable nodus/require-async-orchestration */

/**
 * @class ValidationLayer
 * @classdesc Enterprise-grade universal schema validation layer with comprehensive observability,
 * automatic instrumentation, and compliance features. Orchestrates validation modules to perform
 * comprehensive data validation with complete audit trails.
 *
 * Key Features:
 * - Automatic instrumentation via AsyncOrchestrator for all validation operations
 * - Complete audit trails for validation decisions and failures
 * - Performance budget compliance with validation timing requirements
 * - Zero-tolerance error handling with proper escalation
 * - Centralized orchestration wrapper for consistent observability
 * - Composable validation rules with security constraints
 *
 * @privateFields {#validators, #customRules, #config, #ready, #stateManager, #metrics, #errorHelpers, #forensicLogger, #runner, #asyncService}
 */
export class ValidationLayer {
	/** @private @type {Map<string, Function>} */
	#validators = new Map();
	/** @private @type {Map<string, Function>} */
	#customRules = new Map();
	/** @private @type {object} */
	#config;
	/** @private @type {boolean} */
	#ready = false;
	/** @private @type {import('../HybridStateManager.js').default|null} */
	#stateManager = null;
	/** @private @type {import('../../shared/lib/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../../shared/lib/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;
	/** @private @type {import('../ForensicLogger.js').default|null} */
	#forensicLogger = null;
	/** @private @type {ReturnType<import("@shared/lib/async/AsyncOrchestrationService.js").AsyncOrchestrationService["createRunner"]>} */
	#runner;
	/** @private @type {import("@shared/lib/async/AsyncOrchestrationService.js").AsyncOrchestrationService|null} */
	#asyncService = null;
	/** @private @type {import("@platform/observability/ForensicRegistry.js").ForensicRegistry|null} */
	#forensicRegistry = null;

	/**
	 * Creates an instance of ValidationLayer with enterprise validation and observability.
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

		this.#asyncService =
			this.#stateManager?.managers?.asyncOrchestrator ?? null;
		if (!this.#asyncService) {
			throw new Error(
				"ValidationLayer requires AsyncOrchestrationService manager."
			);
		}

		this.#runner = this.#asyncService.createRunner({
			labelPrefix: "validation.layer",
			actorId: "validation.layer",
			eventType: "VALIDATION_LAYER_OPERATION",
			meta: { component: "ValidationLayer" },
		});
	}

	/**
	 * Centralized orchestration wrapper for this validation component.
	 * Ensures all async operations run through the AsyncOrchestrator runner.
	 * @private
	 * @param {string} operationName - Operation identifier for metrics and logging
	 * @param {Function} operation - Async operation to execute
	 * @param {object} [options={}] - Additional orchestrator options
	 * @returns {Promise<any>}
	 */
	async #runOrchestrated(operationName, operation, options = {}) {
		const policies = this.#stateManager?.managers?.policies;
		if (!policies?.getPolicy("async", "enabled")) {
			console.warn(
				"[ValidationLayer] Async operations disabled by policy",
				{
					operation: operationName,
				}
			);
			return null;
		}

		// Validation-specific policy check
		if (!policies?.getPolicy("validation", "enabled")) {
			console.warn(
				"[ValidationLayer] Validation operations disabled by policy",
				{
					operation: operationName,
				}
			);
			return null;
		}

		try {
			/* PERFORMANCE_BUDGET: 10ms */
			return await this.#runner(operation, {
				labelSuffix: operationName,
				eventType: `VALIDATION_LAYER_${operationName.toUpperCase()}`,
				classification: "INTERNAL",
				meta: {
					component: "ValidationLayer",
					operation: operationName,
					...options.meta,
				},
				timeout: options.timeout || this.#config.asyncTimeout,
				retries: options.retries || 1,
				...options,
			});
		} catch (error) {
			this.#metrics?.increment("orchestration_error");
			console.error(
				`[ValidationLayer] Orchestration failed for ${operationName}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * Initializes the validation layer, deriving dependencies and setting up validators.
	 * @public
	 * @returns {Promise<this>} The initialized ValidationLayer instance.
	 */
	init() {
		return this.#runOrchestrated("init", () => this.#executeInit());
	}

	/**
	 * Validates a full entity against the base schema, type-specific rules, security constraints, and custom business rules.
	 * @public
	 * @param {object} entity - The entity object to validate.
	 * @returns {Promise<{valid: boolean, errors: string[], warnings: string[], metadata: object}>} A promise that resolves with a comprehensive validation result.
	 */
	validateEntity(entity) {
		return this.#runOrchestrated(
			"validateEntity",
			() => this.#executeValidateEntity(entity),
			{
				meta: {
					entityId: entity?.id,
					entityType: entity?.entity_type,
				},
			}
		);
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
		// Synchronous field validation doesn't require orchestration
		const errors = [];

		// Required check
		if (
			fieldDefinition.required &&
			(value === null || value === undefined || value === "")
		) {
			errors.push(`Field '${fieldName}' is required`);
			return { valid: false, errors };
		}

		// Skip further validation if value is null/undefined and not required
		if (value === null || value === undefined) {
			return { valid: true, errors: [] };
		}

		// Type validation
		const typeResult = this.#validateFieldType(
			fieldName,
			value,
			fieldDefinition
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

		// Range validation
		const rangeResult = this.#validateFieldRange(
			fieldName,
			value,
			fieldDefinition
		);
		if (!rangeResult.valid) {
			errors.push(...rangeResult.errors);
		}

		// Custom validator
		if (fieldDefinition.validator) {
			const customValidator = this.#validators.get(
				fieldDefinition.validator
			);
			if (customValidator) {
				const customResult = customValidator(value);
				if (!customResult.valid) {
					errors.push(...customResult.errors);
				}
			}
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Adds a custom field validator.
	 * @public
	 * @param {string} name - The name of the validator.
	 * @param {Function} validator - The validation function.
	 * @returns {void}
	 */
	addFieldValidator(name, validator) {
		if (typeof validator !== "function") {
			throw new Error(`Validator '${name}' must be a function`);
		}
		this.#validators.set(name, validator);
		this.#audit("CUSTOM_VALIDATOR_ADDED", { validatorName: name });
	}

	/**
	 * Adds a custom business rule.
	 * @public
	 * @param {string} name - The name of the rule.
	 * @param {Function} rule - The rule function.
	 * @returns {void}
	 */
	addCustomRule(name, rule) {
		if (typeof rule !== "function") {
			throw new Error(`Custom rule '${name}' must be a function`);
		}
		this.#customRules.set(name, rule);
		this.#audit("CUSTOM_RULE_ADDED", { ruleName: name });
	}

	/**
	 * Gets validation statistics.
	 * @public
	 * @returns {object} Statistics about validation operations.
	 */
	getStatistics() {
		return {
			validationCount: this.#metrics?.get("validationCount") || 0,
			errorCount: this.#metrics?.get("validationErrors") || 0,
			averageLatency: this.#metrics?.get("averageLatency") || 0,
			customRules: this.#customRules.size,
			fieldValidators: this.#validators.size,
		};
	}

	/**
	 * Executes the initialization logic with proper dependency resolution.
	 * @private
	 * @returns {Promise<this>}
	 */
	async #executeInit() {
		if (this.#ready) {
			return this;
		}

		// Derive dependencies from the stateManager
		const managers = this.#stateManager.managers;
		this.#metrics =
			this.#stateManager.metricsRegistry?.namespace("validation");
		this.#errorHelpers = managers?.errorHelpers ?? null;
		this.#forensicLogger = managers?.forensicLogger ?? null;
		this.#forensicRegistry = managers?.forensicRegistry ?? null;

		// Apply metrics decorator to performance-critical methods
		const measure = managers.metricsRegistry?.measure.bind(
			managers.metricsRegistry
		);
		if (measure) {
			this.validateEntity = measure("validation.validateEntity")(
				this.validateEntity.bind(this)
			);
		}

		this.#initializeBaseValidators();
		this.#loadCustomValidators(this.#config.customValidators);
		await this.#initializeAsyncValidators();

		this.#audit("VALIDATION_LAYER_INITIALIZED", {
			strictMode: this.#config.strictMode,
			customRules: this.#customRules.size,
			fieldValidators: this.#validators.size,
		});

		this.#ready = true;
		console.warn("[ValidationLayer] Ready with schema validation");
		return this;
	}

	/**
	 * Executes the core entity validation logic with comprehensive checks.
	 * @private
	 * @param {object} entity - The entity to validate
	 * @returns {Promise<object>} Validation result
	 */
	async #executeValidateEntity(entity) {
		if (!this.#ready) {
			throw new Error("ValidationLayer not initialized");
		}

		const errors = [];

		return this.#errorHelpers?.tryAsync(
			async () => {
				const startTime = performance.now();
				const warnings = [];

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
					this.#audit("VALIDATION_FAILED", {
						entityId: entity.id,
						entityType: entity.entity_type,
						errors: errors.slice(0, this.#config.maxErrors),
					});

					// Use ActionDispatcher for validation failure events
					const actionDispatcher =
						this.#stateManager?.managers?.actionDispatcher;
					if (actionDispatcher) {
						await actionDispatcher.dispatch("VALIDATION_FAILED", {
							entityId: entity.id,
							entityType: entity.entity_type,
							errors: errors.slice(0, this.#config.maxErrors),
							timestamp: new Date().toISOString(),
						});
					} else {
						this.#stateManager?.emit?.("validationError", {
							entityId: entity.id,
							entityType: entity.entity_type,
							errors: errors.slice(0, this.#config.maxErrors),
						});
					}
				}

				return {
					valid: isValid,
					errors,
					warnings,
					metadata: {
						latency,
						rulesExecuted: this.#getExecutedRules(),
						entityType: entity.entity_type,
					},
				};
			},
			{
				component: "ValidationLayer",
				operation: "validateEntity",
				context: {
					entityId: entity?.id,
					entityType: entity?.entity_type,
				},
				rethrow: false,
				fallback: {
					valid: false,
					errors: ["A critical validation error occurred."],
					warnings: [],
					metadata: { systemError: true },
				},
			}
		);
	}

	/**
	 * Validates the base schema requirements of an entity.
	 * @private
	 * @param {object} entity - The entity to validate
	 * @returns {{valid: boolean, errors: string[]}}
	 */
	#validateBaseSchema(entity) {
		const errors = [];

		// Required fields check
		if (!entity.id) {
			errors.push("Entity must have an 'id' field");
		}

		if (!entity.entity_type) {
			errors.push("Entity must have an 'entity_type' field");
		}

		// Basic data integrity
		if (typeof entity !== "object" || entity === null) {
			errors.push("Entity must be a valid object");
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Validates entity-type-specific rules.
	 * @private
	 * @param {object} entity - The entity to validate
	 * @returns {{valid: boolean, errors: string[]}}
	 */
	#validateEntityType(entity) {
		const errors = [];
		const entityType = entity.entity_type;

		// Type-specific validation logic
		switch (entityType) {
			case "user":
				if (!entity.username) {
					errors.push("User entity must have a username");
				}
				if (!entity.email) {
					errors.push("User entity must have an email");
				}
				break;
			case "document":
				if (!entity.title) {
					errors.push("Document entity must have a title");
				}
				if (!entity.content && !entity.content_url) {
					errors.push(
						"Document entity must have content or content_url"
					);
				}
				break;
			case "project":
				if (!entity.name) {
					errors.push("Project entity must have a name");
				}
				break;
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Validates security constraints on the entity.
	 * @private
	 * @param {object} entity - The entity to validate
	 * @returns {{valid: boolean, errors: string[]}}
	 */
	#validateSecurity(entity) {
		const errors = [];

		// Security classification validation
		if (entity.classification) {
			const validClassifications = [
				"public",
				"internal",
				"restricted",
				"confidential",
				"secret",
				"top_secret",
				"nato_restricted",
				"nato_confidential",
				"nato_secret",
				"cosmic_top_secret",
			];
			if (!validClassifications.includes(entity.classification)) {
				errors.push("Invalid security classification");
			}
		}

		// Compartment validation
		if (entity.compartments && Array.isArray(entity.compartments)) {
			for (const compartment of entity.compartments) {
				if (
					typeof compartment !== "string" ||
					compartment.length === 0
				) {
					errors.push("All compartments must be non-empty strings");
					break;
				}
			}
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Validates custom business rules.
	 * @private
	 * @param {object} entity - The entity to validate
	 * @returns {Promise<{valid: boolean, errors: string[]}>}
	 */
	async #validateCustomRules(entity) {
		const errors = [];

		for (const [ruleName, ruleFunction] of this.#customRules) {
			try {
				const result = await Promise.resolve(ruleFunction(entity));
				if (result && !result.valid) {
					errors.push(
						...(result.errors || [
							`Custom rule '${ruleName}' failed`,
						])
					);
				}
			} catch (error) {
				if (this.#config.strictMode) {
					errors.push(
						`Custom rule '${ruleName}' threw an error: ${error.message}`
					);
				} else {
					console.warn(
						`[ValidationLayer] Custom rule '${ruleName}' failed:`,
						error
					);
				}
			}
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Validates cross-field relationships and dependencies.
	 * @private
	 * @param {object} entity - The entity to validate
	 * @returns {{valid: boolean, errors: string[]}}
	 */
	#validateCrossFields(entity) {
		const errors = [];

		// Example cross-field validations
		if (entity.start_date && entity.end_date) {
			const start = new Date(entity.start_date);
			const end = new Date(entity.end_date);
			if (start >= end) {
				errors.push("Start date must be before end date");
			}
		}

		if (entity.minimum_value && entity.maximum_value) {
			if (entity.minimum_value >= entity.maximum_value) {
				errors.push("Minimum value must be less than maximum value");
			}
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Validates the type of a field value.
	 * @private
	 * @param {string} fieldName - Field name
	 * @param {*} value - Field value
	 * @param {object} fieldDefinition - Field definition
	 * @returns {{valid: boolean, errors: string[]}}
	 */
	#validateFieldType(fieldName, value, fieldDefinition) {
		const errors = [];
		const expectedType = fieldDefinition.type;

		switch (expectedType) {
			case "string":
				if (typeof value !== "string") {
					errors.push(`Field '${fieldName}' must be a string`);
				}
				break;
			case "number":
				if (typeof value !== "number" || isNaN(value)) {
					errors.push(`Field '${fieldName}' must be a valid number`);
				}
				break;
			case "boolean":
				if (typeof value !== "boolean") {
					errors.push(`Field '${fieldName}' must be a boolean`);
				}
				break;
			case "array":
				if (!Array.isArray(value)) {
					errors.push(`Field '${fieldName}' must be an array`);
				}
				break;
			case "object":
				if (
					typeof value !== "object" ||
					value === null ||
					Array.isArray(value)
				) {
					errors.push(`Field '${fieldName}' must be an object`);
				}
				break;
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Validates the format of a field value.
	 * @private
	 * @param {string} fieldName - Field name
	 * @param {*} value - Field value
	 * @param {string} format - Expected format
	 * @returns {{valid: boolean, errors: string[]}}
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
	 * @param {string} fieldName - The name of the field
	 * @param {*} value - The value to check
	 * @param {object} fieldDefinition - The field definition containing `min` and/or `max` properties
	 * @returns {{valid: boolean, errors: string[]}}
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
	 * @param {string} value - The string to check
	 * @returns {boolean}
	 */
	#isValidUUID(value) {
		const uuidRegex =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		return uuidRegex.test(value);
	}

	/**
	 * Checks if a string is a valid email address.
	 * @private
	 * @param {string} value - The string to check
	 * @returns {boolean}
	 */
	#isValidEmail(value) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(value);
	}

	/**
	 * Checks if a string is a valid URL.
	 * @private
	 * @param {string} value - The string to check
	 * @returns {boolean}
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
	 * @param {string} value - The string to check
	 * @returns {boolean}
	 */
	#isValidTimestamp(value) {
		const date = new Date(value);
		return !isNaN(date.getTime()) && date.toISOString() === value;
	}

	/**
	 * Logs an audit event if the forensic logger is available.
	 * @private
	 * @param {string} eventType - The type of the event
	 * @param {object} data - The data associated with the event
	 */
	#audit(eventType, data) {
		const securityManager = this.#stateManager?.managers?.securityManager;
		this.#forensicLogger?.logAuditEvent(eventType, data, {
			component: "ValidationLayer",
			userContext: securityManager?.getSubject(),
		});
	}

	/**
	 * Initializes a set of base validators for common formats.
	 * @private
	 * @returns {void}
	 */
	#initializeBaseValidators() {
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
	 * @param {object} customValidators - A map of validator names to functions
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
	 * @param {boolean} success - Whether the validation passed
	 * @param {number} latency - The duration of the validation in milliseconds
	 * @param {string[]} errors - Any validation errors that occurred
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

		this.#metrics?.updateAverage("averageLatency", latency);
	}

	/**
	 * Gets the names of all custom rules that were executed.
	 * @private
	 * @returns {string[]} An array of executed rule names
	 */
	#getExecutedRules() {
		return Object.keys(this.#metrics?.getNamespace("ruleExecutions") || {});
	}
}

export default ValidationLayer;
