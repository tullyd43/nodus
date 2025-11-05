/**
 * @file validation-stack.js
 * @version 8.0.0
 * @description Enterprise validation orchestrator with composable validation modules.
 * Provides automatic observability, caching, and policy-compliant validation operations.
 *
 * All validation operations flow through orchestrated patterns for complete audit trails,
 * performance monitoring, and security compliance. Results are cached with TTL management
 * and history tracking for comprehensive validation analytics.
 *
 * Key Features:
 * - Orchestrated validation with automatic instrumentation
 * - Composable validator modules with lifecycle management
 * - Intelligent caching with LRU eviction and TTL
 * - Performance budget compliance with fail-fast options
 * - Complete audit trails for validation decisions
 *
 * @see {@link NODUS_DEVELOPER_MIGRATION_GUIDE.md} - Orchestrator patterns and validation compliance
 */

/**
 * @typedef {Object} ValidatorModule
 * @property {string} [name] - Human-readable validator name
 * @property {string} [type] - Validator type classification
 * @property {Array<string>} [supports] - Array of supported entity types
 * @property {() => Promise<void>} [init] - Validator initialization function
 * @property {(entity: Object, context: Object) => boolean} [isApplicableFor] - Check if validator applies to entity
 * @property {(entity: Object, context: Object) => Promise<ValidationResult>} validate - Main validation function
 * @property {(entityType: string, fieldName: string) => boolean} [supportsField] - Check field support
 * @property {(entityType: string, fieldName: string, value: any, context: Object) => Promise<ValidationResult>} [validateField] - Field validation
 */

/**
 * @typedef {Object} ValidationStackOptions
 * @property {boolean} [enableCaching=true] - Enable result caching
 * @property {number} [cacheSize=1000] - Maximum cache entries
 * @property {number} [cacheTTL=300000] - Cache TTL in milliseconds (5 minutes)
 * @property {boolean} [trackHistory=false] - Enable validation history tracking
 * @property {boolean} [failFast=false] - Stop on first validation failure
 * @property {Object} [validatorOptions] - Per-validator configuration options
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {Array<string>} [errors] - Array of validation error messages
 * @property {Array<string>} [warnings] - Array of validation warning messages
 * @property {Array<Object>} [validationResults] - Detailed results from each validator
 * @property {Array<string>} [validatedBy] - Names of validators that ran
 * @property {number} [timestamp] - Validation timestamp
 */

/**
 * Enterprise validation orchestrator that manages multiple validation modules
 * in a composable, observable pipeline with intelligent caching and analytics.
 *
 * All operations are instrumented through AsyncOrchestrator for complete
 * observability and compliance with enterprise security requirements.
 *
 * @class ValidationStack
 */
export default class ValidationStack {
	/** @private @type {Array<ValidatorModule>} */
	#validators = [];
	/** @private @type {import('@shared/lib/LRUCache.js').LRUCache|null} */
	#validationCache = null;
	/** @private @type {Array<Object>} */
	#validationHistory = [];
	/** @private @type {ValidationStackOptions} */
	#config;
	/** @private @type {import('@platform/state/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {ReturnType<import('@shared/lib/async/AsyncOrchestrationService.js').AsyncOrchestrationService["createRunner"]>} */
	#runOrchestrated;

	/**
	 * Creates an instance of ValidationStack with enterprise observability integration.
	 *
	 * @param {Object} context - Configuration context
	 * @param {import('@platform/state/HybridStateManager.js').default} context.stateManager - State manager instance
	 * @param {Array<Function>} [context.validators=[]] - Array of validator module constructors
	 * @param {ValidationStackOptions} [context.options={}] - Configuration options
	 * @throws {Error} If stateManager or required services are missing
	 */
	constructor({ stateManager, validators = [], options = {} }) {
		if (!stateManager) {
			throw new Error(
				"ValidationStack requires stateManager for observability compliance"
			);
		}

		this.#stateManager = stateManager;
		this.#config = {
			enableCaching: options.enableCaching !== false,
			cacheSize: options.cacheSize || 1000,
			cacheTTL: options.cacheTTL || 5 * 60 * 1000, // 5 minutes
			trackHistory: options.trackHistory || false,
			failFast: options.failFast || false,
			validatorOptions: options.validatorOptions || {},
			...options,
		};

		// Initialize validators with proper dependency injection
		this.#validators = validators.map((ValidatorClass) => {
			if (typeof ValidatorClass === "function") {
				return new ValidatorClass({
					stateManager: this.#stateManager,
					options: this.#config.validatorOptions[ValidatorClass.name],
				});
			}
			return ValidatorClass; // Already an instance
		});

		// Initialize orchestrated runner for all validation operations
		const orchestrator = this.#stateManager.managers?.asyncOrchestrator;
		if (!orchestrator) {
			throw new Error(
				"AsyncOrchestrationService required for ValidationStack observability compliance"
			);
		}

		this.#runOrchestrated = orchestrator.createRunner({
			labelPrefix: "validation.stack",
			actorId: "validation.stack",
			eventType: "VALIDATION_STACK_OPERATION",
			meta: {
				component: "ValidationStack",
				validatorCount: this.#validators.length,
			},
		});
	}

	/**
	 * Initializes the validation stack and all underlying validator modules.
	 * Operations are orchestrated for complete observability.
	 *
	 * @returns {Promise<ValidationStack>} The initialized instance
	 */
	async init() {
		return this.#runOrchestrated(() => this.#executeInit(), {
			labelSuffix: "init",
			eventType: "VALIDATION_STACK_INIT",
			meta: { validatorCount: this.#validators.length },
		});
	}

	/**
	 * Adds a validator to the stack with proper initialization.
	 *
	 * @param {ValidatorModule} validator - The validator instance to add
	 * @returns {Promise<void>}
	 */
	async addValidator(validator) {
		this.#validators.push(validator);

		if (validator.init) {
			/* PERFORMANCE_BUDGET: 10ms */
			await this.#runOrchestrated(() => validator.init(), {
				labelSuffix: "addValidator",
				eventType: "VALIDATION_STACK_ADD_VALIDATOR",
				meta: {
					validatorName: validator.name || validator.constructor.name,
				},
			});
		}

		// Emit validator added event
		this.#stateManager.emit?.("validation.validator.added", {
			validatorName: validator.name || validator.constructor.name,
			totalValidators: this.#validators.length,
			timestamp: Date.now(),
		});
	}

	/**
	 * Validates an entity by running it through all applicable validators.
	 * Results are cached and audit trails are automatically generated.
	 *
	 * @param {Object} entity - The entity to validate
	 * @param {Object} [context={}] - Validation context
	 * @returns {Promise<ValidationResult>} Aggregated validation result
	 */
	async validate(entity, context = {}) {
		/* PERFORMANCE_BUDGET: 50ms */
		return this.#runOrchestrated(
			() => this.#executeValidate(entity, context),
			{
				labelSuffix: "validate",
				eventType: "VALIDATION_STACK_VALIDATE",
				meta: {
					entityId: entity?.id,
					entityType: entity?.entity_type,
					hasContext: Object.keys(context).length > 0,
				},
			}
		);
	}

	/**
	 * Validates a specific field with targeted validator modules.
	 *
	 * @param {string} entityType - The type of entity being validated
	 * @param {string} fieldName - The name of the field to validate
	 * @param {any} value - The field value to validate
	 * @param {Object} [context={}] - Validation context
	 * @returns {Promise<ValidationResult>} Field validation result
	 */
	async validateField(entityType, fieldName, value, context = {}) {
		/* PERFORMANCE_BUDGET: 25ms */
		return this.#runOrchestrated(
			() =>
				this.#executeValidateField(
					entityType,
					fieldName,
					value,
					context
				),
			{
				labelSuffix: "validateField",
				eventType: "VALIDATION_STACK_VALIDATE_FIELD",
				meta: { entityType, fieldName, hasValue: value !== undefined },
			}
		);
	}

	/**
	 * Retrieves comprehensive validation performance and state metrics.
	 *
	 * @returns {Object} Validation metrics and statistics
	 */
	getValidationMetrics() {
		return {
			validatorsLoaded: this.#validators.length,
			cacheSize: this.#validationCache?.size || 0,
			cacheHitRate: this.#validationCache?.stats?.hitRate || 0,
			historySize: this.#validationHistory.length,
			lastValidationTime: this.#getLastValidationTime(),
			averageValidationTime: this.#getAverageValidationTime(),
		};
	}

	/**
	 * Gets validation history with optional limit.
	 *
	 * @param {number} [limit=50] - Maximum number of history entries to return
	 * @returns {Array<Object>} Array of validation history entries
	 */
	getValidationHistory(limit = 50) {
		return this.#validationHistory.slice(-limit);
	}

	/**
	 * Clears the validation result cache.
	 */
	clearCache() {
		this.#validationCache?.clear();

		// Emit cache clear event
		this.#stateManager.emit?.("validation.cache.cleared", {
			timestamp: Date.now(),
		});
	}

	/**
	 * Gets information about loaded validators.
	 *
	 * @returns {Array<Object>} Array of validator information
	 */
	getValidators() {
		return this.#validators.map((v) => ({
			name: v.name || v.constructor.name,
			type: v.type || "unknown",
			supports: v.supports || [],
			hasFieldValidation: typeof v.supportsField === "function",
		}));
	}

	// ===== PRIVATE IMPLEMENTATION METHODS =====

	/**
	 * Executes validation stack initialization with cache setup.
	 *
	 * @private
	 * @returns {Promise<ValidationStack>}
	 */
	#executeInit() {
		// Initialize all validators
		return Promise.all(
			this.#validators.map((validator) =>
				validator.init ? validator.init() : Promise.resolve()
			)
		).then(() => {
			// Initialize cache if enabled
			if (this.#config.enableCaching) {
				const cacheManager = this.#stateManager.managers?.cacheManager;
				if (cacheManager) {
					this.#validationCache = cacheManager.getCache(
						"validationStack",
						{
							ttl: this.#config.cacheTTL,
						}
					);
				}
			}

			// Emit initialization success
			this.#stateManager.emit?.("validation.stack.initialized", {
				validatorCount: this.#validators.length,
				cachingEnabled: this.#config.enableCaching,
				historyEnabled: this.#config.trackHistory,
				timestamp: Date.now(),
			});

			return this;
		});
	}

	/**
	 * Executes entity validation with caching and audit trail.
	 *
	 * @private
	 * @param {Object} entity - The entity to validate
	 * @param {Object} context - Validation context
	 * @returns {Promise<ValidationResult>}
	 */
	#executeValidate(entity, context) {
		const startTime = performance.now();
		const cacheKey = this.#generateCacheKey(entity, context);

		// Check cache first
		if (
			this.#config.enableCaching &&
			this.#validationCache?.has(cacheKey)
		) {
			// Emit cache hit event
			this.#stateManager.emit?.("validation.cache.hit", {
				entityId: entity?.id,
				cacheKey,
				timestamp: Date.now(),
			});
			return this.#validationCache.get(cacheKey);
		}

		// Emit cache miss event
		if (this.#config.enableCaching) {
			this.#stateManager.emit?.("validation.cache.miss", {
				entityId: entity?.id,
				cacheKey,
				timestamp: Date.now(),
			});
		}

		// Perform validation
		return this.#performValidation(entity, context).then((result) => {
			// Cache result if enabled
			if (this.#config.enableCaching && this.#validationCache) {
				this.#validationCache.set(cacheKey, result);
			}

			// Track history if enabled
			const validationTime = performance.now() - startTime;
			if (this.#config.trackHistory) {
				this.#addToHistory(entity, result, validationTime);
			}

			// Emit validation completion event
			this.#stateManager.emit?.("validation.entity.completed", {
				entityId: entity?.id,
				entityType: entity?.entity_type,
				valid: result.valid,
				errorCount: result.errors?.length || 0,
				warningCount: result.warnings?.length || 0,
				validationTime,
				timestamp: Date.now(),
			});

			// Emit validation failure event for security audit
			if (!result.valid) {
				this.#stateManager.emit?.("validation.entity.failed", {
					entityId: entity?.id,
					entityType: entity?.entity_type,
					errors: result.errors || [],
					timestamp: Date.now(),
				});
			}

			return result;
		});
	}

	/**
	 * Executes field validation with targeted validators.
	 *
	 * @private
	 * @param {string} entityType - Entity type
	 * @param {string} fieldName - Field name
	 * @param {any} value - Field value
	 * @param {Object} context - Validation context
	 * @returns {Promise<ValidationResult>}
	 */
	#executeValidateField(entityType, fieldName, value, context) {
		const applicableValidators = this.#validators.filter(
			(v) => v.supportsField && v.supportsField(entityType, fieldName)
		);

		const errors = [];
		const warnings = [];

		const validationPromises = applicableValidators.map((validator) => {
			return Promise.resolve()
				.then(() =>
					validator.validateField(
						entityType,
						fieldName,
						value,
						context
					)
				)
				.then((result) => {
					if (!result.valid) {
						errors.push(...(result.errors || []));
						warnings.push(...(result.warnings || []));
						if (this.#config.failFast) {
							// Throw to stop Promise.all
							throw new Error("fail-fast");
						}
					}
				})
				.catch((error) => {
					if (error.message === "fail-fast") throw error;
					errors.push(`Validator error: ${error.message}`);
					this.#stateManager.emit?.("validation.validator.error", {
						validatorName:
							validator.name || validator.constructor.name,
						entityType,
						fieldName,
						error: error.message,
						timestamp: Date.now(),
					});
				});
		});

		return Promise.all(validationPromises)
			.catch((err) => {
				if (err.message !== "fail-fast") throw err;
			})
			.then(() => {
				this.#stateManager.emit?.("validation.field.completed", {
					entityType,
					fieldName,
					valid: errors.length === 0,
					errorCount: errors.length,
					warningCount: warnings.length,
					validatorCount: applicableValidators.length,
					timestamp: Date.now(),
				});

				return {
					valid: errors.length === 0,
					errors,
					warnings,
					validatedBy: applicableValidators.map(
						(v) => v.name || v.constructor.name
					),
					timestamp: Date.now(),
				};
			});
	}

	/**
	 * Performs the core validation logic across all applicable validators.
	 *
	 * @private
	 * @param {Object} entity - The entity to validate
	 * @param {Object} context - Validation context
	 * @returns {Promise<ValidationResult>}
	 */
	#performValidation(entity, context) {
		const errors = [];
		const warnings = [];
		const validationResults = [];

		const validationPromises = this.#validators.map((validator) => {
			return Promise.resolve()
				.then(() => {
					if (typeof validator.isApplicableFor === "function") {
						if (!validator.isApplicableFor(entity, context)) {
							return null; // Skip this validator
						}
					}
					return validator.validate(entity, context);
				})
				.then((result) => {
					if (result === null) return; // Validator was skipped

					validationResults.push({
						validator: validator.name || validator.constructor.name,
						result,
					});

					if (!result.valid) {
						errors.push(...(result.errors || []));
						warnings.push(...(result.warnings || []));

						if (this.#config.failFast) {
							throw new Error("fail-fast");
						}
					}
				})
				.catch((error) => {
					if (error.message === "fail-fast") throw error;

					const errorMsg = `ValidationStack failed during execution: ${error.message}`;
					errors.push(errorMsg);

					this.#stateManager.emit?.("validation.validator.error", {
						validatorName:
							validator.name || validator.constructor.name,
						entityId: entity?.id,
						error: error.message,
						timestamp: Date.now(),
					});
				});
		});

		return Promise.all(validationPromises)
			.catch((err) => {
				if (err.message !== "fail-fast") throw err;
			})
			.then(() => ({
				valid: errors.length === 0,
				errors,
				warnings,
				validationResults,
				timestamp: Date.now(),
			}));
	}

	/**
	 * Generates a deterministic cache key for validation results.
	 *
	 * @private
	 * @param {Object} entity - The entity being validated
	 * @param {Object} context - Validation context
	 * @returns {string} Cache key
	 */
	#generateCacheKey(entity, context) {
		const keyObject = {
			id: entity?.id,
			entity_type: entity?.entity_type,
			updated_at: entity?.updated_at,
			classification: context?.classification,
			userId: context?.userId,
		};
		return JSON.stringify(keyObject);
	}

	/**
	 * Adds validation result to history with size management.
	 *
	 * @private
	 * @param {Object} entity - The validated entity
	 * @param {ValidationResult} result - Validation result
	 * @param {number} validationTime - Time taken for validation
	 */
	#addToHistory(entity, result, validationTime) {
		this.#validationHistory.push({
			entityId: entity?.id,
			entityType: entity?.entity_type,
			valid: result.valid,
			errorCount: result.errors?.length || 0,
			warningCount: result.warnings?.length || 0,
			validationTime,
			timestamp: Date.now(),
		});

		// Keep history manageable
		if (this.#validationHistory.length > 1000) {
			this.#validationHistory = this.#validationHistory.slice(-500);
		}
	}

	/**
	 * Gets the timestamp of the last validation operation.
	 *
	 * @private
	 * @returns {number|null} Last validation timestamp
	 */
	#getLastValidationTime() {
		return this.#validationHistory.length > 0
			? this.#validationHistory[this.#validationHistory.length - 1]
					.timestamp
			: null;
	}

	/**
	 * Calculates average validation time from history.
	 *
	 * @private
	 * @returns {number} Average validation time in milliseconds
	 */
	#getAverageValidationTime() {
		if (this.#validationHistory.length === 0) return 0;

		const totalTime = this.#validationHistory.reduce(
			(sum, entry) => sum + entry.validationTime,
			0
		);
		return totalTime / this.#validationHistory.length;
	}
}
