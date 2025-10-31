// modules/validation-stack.js
// Validation stack for composable data validation

/**
 * @description
 * Orchestrates multiple validation modules (e.g., `StrictValidator`, `CustomValidator`) into a single, cohesive pipeline.
 * This module is responsible for running all applicable validators against an entity, aggregating the results,
 * and managing performance features like caching and history tracking. It embodies the **Composability** pillar.
 *
 * @module ValidationStack
 * @privateFields {#validators, #validationCache, #validationHistory, #config, #stateManager, #metrics, #forensicLogger, #errorHelpers}
 */
export default class ValidationStack {
	/** @private @type {Array<object>} */
	#validators = [];
	/** @private @type {import('../../../utils/LRUCache.js').LRUCache|null} */
	#validationCache = null;
	/**
	 * @private
	 * @type {Array<object>}
	 */
	#validationHistory = [];
	/** @private @type {object} */
	#config;
	/** @private @type {import('../../HybridStateManager.js').default|null} */
	#stateManager = null;
	/** @private @type {import('../../../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../../ForensicLogger.js').default|null} */
	#forensicLogger = null;
	/** @private @type {import('../../../utils/ErrorHelpers.js').default|null} */
	#errorHelpers = null;

	/**
	 * Creates an instance of ValidationStack.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @param {Array<object>} [context.validators=[]] - An array of validator module instances.
	 * @param {object} [context.options={}] - Configuration options for the validation stack.
	 */
	constructor({ stateManager, validators = [], options = {} }) {
		this.#stateManager = stateManager;
		this.#metrics =
			this.#stateManager?.metricsRegistry?.namespace("validationStack");
		this.#forensicLogger = this.#stateManager?.managers?.forensicLogger;
		this.#errorHelpers = this.#stateManager?.managers?.errorHelpers;

		// V8.0 Parity: Pass stateManager to each validator's constructor.
		this.#validators = validators.map((ValidatorClass) => {
			if (typeof ValidatorClass === "function") {
				return new ValidatorClass({
					stateManager: this.#stateManager,
					options: options.validatorOptions?.[ValidatorClass.name],
				});
			}
			return ValidatorClass; // Already an instance
		});

		this.#config = {
			enableCaching: options.enableCaching !== false,
			cacheSize: options.cacheSize || 1000,
			cacheTTL: options.cacheTTL || 5 * 60 * 1000, // 5 minutes
			trackHistory: options.trackHistory || false,
			failFast: options.failFast || false,
			...options,
		};

		console.log(
			`[ValidationStack] Loaded with ${this.#validators.length} validators`
		);
	}

	/**
	 * Initializes the validation stack and all of its underlying validator modules.
	 * @returns {Promise<this>} The initialized instance.
	 */
	async init() {
		// Initialize all validators
		for (const validator of this.#validators) {
			if (validator.init) {
				await validator.init();
			}
		}

		// V8.0 Parity: Use the centralized CacheManager.
		if (this.#config.enableCaching) {
			const cacheManager = this.#stateManager?.managers?.cacheManager;
			if (cacheManager) {
				this.#validationCache = cacheManager.getCache(
					"validationStack",
					{
						ttl: this.#config.cacheTTL,
					}
				);
			}
		}
		console.log("[ValidationStack] Validation stack initialized");
		return this;
	}

	/**
	 * Add validator to the stack
	 */
	addValidator(validator) {
		this.#validators.push(validator);

		if (validator.init) {
			validator.init();
		}
	}

	/**
	 * Validates an entity by running it through the entire stack of applicable validators.
	 * @param {object} entity - The entity to validate.
	 * @param {object} [context={}] - The validation context.
	 * @returns {Promise<object>} A promise that resolves with an aggregated validation result object.
	 */
	async validate(entity, context = {}) {
		const startTime = performance.now();
		const cacheKey = this.#generateCacheKey(entity, context);

		// Check cache first
		if (
			this.#config.enableCaching &&
			this.#validationCache?.has(cacheKey)
		) {
			this.#updateCacheMetrics(true);
			return this.#validationCache.get(cacheKey);
		}

		this.#updateCacheMetrics(false);

		// Perform validation
		const result = await this.#performValidation(entity, context);

		// Cache result
		// V8.0 Parity: The LRUCache from CacheManager handles its own size and TTL.
		if (this.#config.enableCaching && this.#validationCache) {
			this.#validationCache.set(cacheKey, result);
		}

		// Update metrics
		const validationTime = performance.now() - startTime;
		this.#updateValidationMetrics(result.valid, validationTime);

		// V8.0 Parity: Track history if enabled
		if (this.#config.trackHistory) {
			this.#addToHistory(entity, result, validationTime);
		}

		if (!result.valid && this.#stateManager) {
			this.#stateManager.emit("validationError", {
				entity,
				errors: result.errors || [],
			});
			this.#forensicLogger?.logAuditEvent("VALIDATION_FAILURE", {
				entityId: entity.id,
				entityType: entity.entity_type,
				errors: result.errors,
				validator: "ValidationStack",
			});
		}

		return result;
	}

	/**
	 * Validate specific field
	 */
	async validateField(entityType, fieldName, value, context = {}) {
		const applicableValidators = this.#validators.filter(
			(v) => v.supportsField && v.supportsField(entityType, fieldName)
		);

		const errors = [];
		const warnings = [];

		await this.#errorHelpers?.tryAsync(
			async () => {
				for (const validator of applicableValidators) {
					const result = await validator.validateField(
						entityType,
						fieldName,
						value,
						context
					);

					if (!result.valid) {
						errors.push(...(result.errors || []));
						warnings.push(...(result.warnings || []));

						if (this.#config.failFast) {
							break;
						}
					}
				}
			},
			{
				component: "ValidationStack",
				operation: "validateField",
				onError: (error) => {
					errors.push(`Validator error: ${error.message}`);
				},
			}
		);

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			validatedBy: applicableValidators.map(
				(v) => v.name || v.constructor.name
			),
		};
	}

	/**
	 * Retrieves performance and state metrics for the validation stack.
	 * @returns {object} An object containing various metrics.
	 */
	getValidationMetrics() {
		return {
			...this.#metrics?.getAllAsObject(),
			validatorsLoaded: this.#validators.length,
			cacheSize: this.#validationCache?.size || 0,
			historySize: this.#validationHistory.length,
		};
	}

	/**
	 * Get validation history
	 */
	getValidationHistory(limit = 50) {
		return this.#validationHistory.slice(-limit);
	}

	/**
	 * Clear validation cache
	 */
	clearCache() {
		this.#validationCache?.clear();
		console.log("[ValidationStack] Validation result cache cleared.");
	}

	/**
	 * Get loaded validators
	 */
	getValidators() {
		return this.#validators.map((v) => ({
			name: v.name || v.constructor.name,
			type: v.type || "unknown",
			supports: v.supports || [],
		}));
	}

	// Private methods
	/**
	 * Performs the core validation logic by iterating through validators.
	 * @private
	 * @param {object} entity - The entity to validate.
	 * @param {object} context - The validation context.
	 * @returns {Promise<object>} The aggregated validation result.
	 */
	async #performValidation(entity, context) {
		const errors = [];
		const warnings = [];
		const validationResults = [];

		await this.#errorHelpers?.tryAsync(
			async () => {
				for (const validator of this.#validators) {
					// V8.0 Parity: Use isApplicableFor to avoid name collision with 'supports' property.
					if (typeof validator.isApplicableFor === "function") {
						if (!validator.isApplicableFor(entity, context))
							continue;
					} else if (validator.supports) {
						// Fallback for older validators
						continue;
					}

					const result = await validator.validate(entity, context);
					validationResults.push({
						validator: validator.name || validator.constructor.name,
						result,
					});

					if (!result.valid) {
						errors.push(...(result.errors || []));
						warnings.push(...(result.warnings || []));

						if (this.#config.failFast) {
							break;
						}
					}
				}
			},
			{
				component: "ValidationStack",
				operation: "performValidation",
				onError: (error) => {
					const errorMsg = `ValidationStack failed during execution: ${error.message}`;
					errors.push(errorMsg);
					console.error(`[ValidationStack] ${errorMsg}`);
				},
			}
		);

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			validationResults,
			timestamp: Date.now(),
		};
	}

	#generateCacheKey(entity, context) {
		// V8.0 Parity: Create a deterministic cache key from relevant data.
		const keyObject = {
			id: entity.id,
			entity_type: entity.entity_type,
			updated_at: entity.updated_at,
			classification: context.classification,
			user: context.userId,
		};
		return JSON.stringify(keyObject);
	}

	#updateValidationMetrics(isValid, validationTime) {
		this.#metrics?.increment("validationsPerformed");

		if (!isValid) {
			this.#metrics?.increment("validationsFailed");
		}

		this.#metrics?.updateAverage("averageValidationTime", validationTime);
	}

	#updateCacheMetrics(isHit) {
		this.#metrics?.increment(isHit ? "cacheHits" : "cacheMisses");
	}

	#addToHistory(entity, result, validationTime) {
		this.#validationHistory.push({
			entityId: entity.id,
			entityType: entity.entity_type,
			valid: result.valid,
			errorCount: result.errors.length,
			warningCount: result.warnings.length,
			validationTime,
			timestamp: Date.now(),
		});

		// Keep history manageable
		if (this.#validationHistory.length > 1000) {
			this.#validationHistory = this.#validationHistory.slice(-500);
		}
	}
}
