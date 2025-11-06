/**
 * @file strict-validator.js
 * @version 8.0.0 - FULLY MIGRATED TO AUTOMATIC OBSERVATION PATTERN
 * @description Comprehensive validation for high-security environments with V8.0 automatic observation.
 * Enforces strict security, compliance, and business rules with complete audit trails.
 *
 * KEY V8.0 MIGRATION CHANGES:
 * - ALL validation operations automatically observed through ActionDispatcher
 * - NO direct core class instantiation - ALL through StateManager
 * - Performance budgets enforced on all validation operations
 * - Complete legacy code removal - zero manual observability calls
 * - Enhanced validation events for compliance auditing
 * - Validation results automatically tracked for security analysis
 */

import { DateCore } from "@shared/lib/DateUtils.js";

/**
 * @class StrictValidator
 * @description Comprehensive validation with V8.0 automatic observation.
 * ALL validation operations routed through StateManager with complete audit trails.
 * @privateFields {#securityRules, #complianceRules, #businessRules, #stateManager, #orchestrator, #policyService}
 */
export default class StrictValidator {
	/** @private @type {object} */
	#securityRules;
	/** @private @type {object} */
	#complianceRules;
	/** @private @type {object} */
	#businessRules;
	/** @private @type {import('../../policy/PolicyService.js').default|null} */
	#policyService = null;
	/** @private @type {import('../../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('@shared/lib/async/AsyncOrchestrator.js').AsyncOrchestrator|null} */
	#orchestrator = null;

	/** @public @type {string} */
	name = "StrictValidator";
	/** @public @type {string} */
	type = "security";
	/** @public @type {string[]} */
	supports = ["objects", "events", "relationships"];

	/**
	 * Creates an instance of StrictValidator.
	 * V8.0 Parity: ALL dependencies through StateManager, zero direct instantiation.
	 * @param {object} context - Application context
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - StateManager instance
	 * @param {object} [options={}] - Configuration options
	 */
	constructor({ stateManager, options = {} }) {
		if (!stateManager) {
			throw new Error(
				"[StrictValidator] StateManager is required for V8.0 compliance"
			);
		}

		this.#stateManager = stateManager;

		// V8.0 Migration: Initialize rules with enhanced security patterns
		this.#securityRules =
			StrictValidator.#_initializeSecurityRules(options);
		this.#complianceRules =
			StrictValidator.#_initializeComplianceRules(options);
		this.#businessRules =
			StrictValidator.#_initializeBusinessRules(options);
	}

	/**
	 * Initializes the StrictValidator with V8.0 automatic observation.
	 * V8.0 Parity: Mandate 1.2 - All dependencies from StateManager.
	 */
	async initialize() {
		const managers = this.#stateManager.managers;
		this.#orchestrator = managers?.orchestrator;
		this.#policyService = managers?.policies;

		if (!this.#orchestrator) {
			throw new Error(
				"[StrictValidator] AsyncOrchestrator is required for V8.0 compliance"
			);
		}

		console.log(
			"[StrictValidator] Initialized with V8.0 automatic observation pattern"
		);
	}

	/**
	 * Validates an entity against all rule sets with automatic observation.
	 * @param {object} entity - Entity to validate
	 * @param {object} [context={}] - Validation context
	 * @returns {Promise<object>} Validation results
	 */
	async validate(entity, context = {}) {
		const runner = this.#orchestrator.createRunner("strict_validation");

		/* PERFORMANCE_BUDGET: 200ms */
		return runner.run(() => this.#performValidation(entity, context));
	}

	/**
	 * Internal validation implementation with automatic observation
	 * @private
	 */
	async #performValidation(entity, context) {
		// V8.0 Migration: Validation attempt automatically observed
		this.#dispatchValidationEvent("security.validation_attempt", {
			entityType: entity?.type || "unknown",
			entityId: entity?.id,
			validationType: "strict",
			timestamp: Date.now(),
		});

		const results = {
			valid: true,
			errors: [],
			warnings: [],
			securityValidation: {},
			complianceValidation: {},
			businessValidation: {},
			dataIntegrityValidation: {},
		};

		try {
			// Run all validation types
			const [
				securityResult,
				complianceResult,
				businessResult,
				integrityResult,
			] = await Promise.all([
				this.#validateSecurity(entity, context),
				this.#validateCompliance(entity, context),
				this.#validateBusinessRules(entity, context),
				this.#validateDataIntegrity(entity, context),
			]);

			// Aggregate results
			results.securityValidation = securityResult;
			results.complianceValidation = complianceResult;
			results.businessValidation = businessResult;
			results.dataIntegrityValidation = integrityResult;

			// Collect all errors and warnings
			[
				securityResult,
				complianceResult,
				businessResult,
				integrityResult,
			].forEach((result) => {
				results.errors.push(...(result.errors || []));
				results.warnings.push(...(result.warnings || []));
			});

			results.valid = results.errors.length === 0;

			// V8.0 Migration: Validation result automatically observed
			this.#dispatchValidationEvent("security.validation_completed", {
				entityType: entity?.type || "unknown",
				entityId: entity?.id,
				valid: results.valid,
				errorCount: results.errors.length,
				warningCount: results.warnings.length,
				timestamp: Date.now(),
			});

			return results;
		} catch (error) {
			// V8.0 Migration: Validation failure automatically observed
			this.#dispatchValidationEvent("security.validation_failed", {
				entityType: entity?.type || "unknown",
				entityId: entity?.id,
				error: error.message,
				timestamp: Date.now(),
			});

			throw error;
		}
	}

	/**
	 * Validates security rules with automatic observation.
	 * @private
	 */
	async #validateSecurity(entity, context) {
		const runner = this.#orchestrator.createRunner("security_validation");

		/* PERFORMANCE_BUDGET: 50ms */
		return runner.run(() => this.#executeValidateSecurity(entity, context));
	}

	/**
	 * Internal security validation implementation
	 * @private
	 */
	#executeValidateSecurity(entity, context) {
		return Promise.resolve().then(() => {
			const errors = [];
			const warnings = [];

			// V8.0 Migration: Security validation automatically observed
			this.#dispatchValidationEvent(
				"security.security_validation_attempt",
				{
					entityType: entity?.type,
					entityId: entity?.id,
					classification: entity?.classification,
					timestamp: Date.now(),
				}
			);

			// Validate classification
			if (
				!entity.classification ||
				!this.#securityRules.fields.classification.pattern.test(
					entity.classification
				)
			) {
				errors.push("Invalid or missing security classification");
			}

			// Validate compartments
			if (entity.compartments && Array.isArray(entity.compartments)) {
				for (const compartment of entity.compartments) {
					if (
						typeof compartment !== "string" ||
						compartment.length === 0
					) {
						errors.push("Invalid compartment definition");
					}
				}
			}

			// Check for sensitive data patterns
			const textFields = StrictValidator.#_getTextFields(entity);
			for (const [field, value] of textFields) {
				if (StrictValidator.#_containsSensitiveData(value)) {
					warnings.push(
						`Field ${field} may contain sensitive data without proper classification`
					);
				}
			}

			// V8.0 Migration: Security validation result automatically observed
			this.#dispatchValidationEvent(
				"security.security_validation_completed",
				{
					entityType: entity?.type,
					entityId: entity?.id,
					errorCount: errors.length,
					warningCount: warnings.length,
					timestamp: Date.now(),
				}
			);

			return { errors, warnings };
		});
	}

	/**
	 * Validates compliance rules with automatic observation.
	 * @private
	 */
	async #validateCompliance(entity, context) {
		const runner = this.#orchestrator.createRunner("compliance_validation");

		/* PERFORMANCE_BUDGET: 50ms */
		return runner.run(() =>
			this.#executeValidateCompliance(entity, context)
		);
	}

	/**
	 * Internal compliance validation implementation
	 * @private
	 */
	#executeValidateCompliance(entity, context) {
		return Promise.resolve().then(() => {
			const errors = [];
			const warnings = [];

			// V8.0 Migration: Compliance validation automatically observed
			this.#dispatchValidationEvent(
				"security.compliance_validation_attempt",
				{
					entityType: entity?.type,
					entityId: entity?.id,
					complianceRegime: this.#complianceRules.regime,
					timestamp: Date.now(),
				}
			);

			// GDPR compliance checks
			if (this.#complianceRules.gdpr?.enabled) {
				if (entity.personal_data && !entity.gdpr_consent) {
					errors.push(
						"GDPR: Personal data requires explicit consent"
					);
				}
				if (entity.personal_data && !entity.data_retention_period) {
					warnings.push(
						"GDPR: Data retention period should be specified"
					);
				}
			}

			// HIPAA compliance checks
			if (this.#complianceRules.hipaa?.enabled) {
				if (entity.medical_data && !entity.hipaa_authorization) {
					errors.push(
						"HIPAA: Medical data requires proper authorization"
					);
				}
			}

			// SOX compliance checks
			if (this.#complianceRules.sox?.enabled) {
				if (entity.financial_data && !entity.sox_controls) {
					warnings.push(
						"SOX: Financial data should have proper controls documented"
					);
				}
			}

			// V8.0 Migration: Compliance validation result automatically observed
			this.#dispatchValidationEvent(
				"security.compliance_validation_completed",
				{
					entityType: entity?.type,
					entityId: entity?.id,
					regime: this.#complianceRules.regime,
					errorCount: errors.length,
					warningCount: warnings.length,
					timestamp: Date.now(),
				}
			);

			return { errors, warnings };
		});
	}

	/**
	 * Validates business rules with automatic observation.
	 * @private
	 */
	async #validateBusinessRules(entity, context) {
		const runner = this.#orchestrator.createRunner("business_validation");

		/* PERFORMANCE_BUDGET: 50ms */
		return runner.run(() =>
			this.#executeValidateBusinessRules(entity, context)
		);
	}

	/**
	 * Internal business rules validation implementation
	 * @private
	 */
	#executeValidateBusinessRules(entity, context) {
		return Promise.resolve().then(() => {
			const errors = [];
			const warnings = [];

			// V8.0 Migration: Business validation automatically observed
			this.#dispatchValidationEvent(
				"security.business_validation_attempt",
				{
					entityType: entity?.type,
					entityId: entity?.id,
					timestamp: Date.now(),
				}
			);

			// Email validation
			if (entity.email && !StrictValidator.#_isValidEmail(entity.email)) {
				errors.push("Invalid email format");
			}

			// Phone validation
			if (entity.phone && !StrictValidator.#_isValidPhone(entity.phone)) {
				warnings.push("Phone number format may be invalid");
			}

			// Date of birth validation
			if (entity.date_of_birth) {
				const birthDate = new Date(entity.date_of_birth);
				const now = new Date();
				if (birthDate > now) {
					errors.push("Date of birth cannot be in the future");
				}
				const age = now.getFullYear() - birthDate.getFullYear();
				if (age > 150) {
					warnings.push("Age seems unusually high - please verify");
				}
			}

			// Relationships validation
			if (entity.relationships && Array.isArray(entity.relationships)) {
				for (const rel of entity.relationships) {
					if (!rel.target_id || !rel.relationship_type) {
						errors.push("Incomplete relationship definition");
					}
				}
			}

			// V8.0 Migration: Business validation result automatically observed
			this.#dispatchValidationEvent(
				"security.business_validation_completed",
				{
					entityType: entity?.type,
					entityId: entity?.id,
					errorCount: errors.length,
					warningCount: warnings.length,
					timestamp: Date.now(),
				}
			);

			return { errors, warnings };
		});
	}

	/**
	 * Validates data integrity with automatic observation.
	 * @private
	 */
	async #validateDataIntegrity(entity, context) {
		const runner = this.#orchestrator.createRunner("integrity_validation");

		/* PERFORMANCE_BUDGET: 50ms */
		return runner.run(() =>
			this.#executeValidateDataIntegrity(entity, context)
		);
	}

	/**
	 * Internal data integrity validation implementation
	 * @private
	 */
	#executeValidateDataIntegrity(entity, context) {
		return Promise.resolve().then(() => {
			const errors = [];
			const warnings = [];

			// V8.0 Migration: Data integrity validation automatically observed
			this.#dispatchValidationEvent(
				"security.integrity_validation_attempt",
				{
					entityType: entity?.type,
					entityId: entity?.id,
					timestamp: Date.now(),
				}
			);

			const textFields = StrictValidator.#_getTextFields(entity);

			// SQL injection detection
			for (const [field, value] of textFields) {
				if (StrictValidator.#_containsSQLInjection(value)) {
					errors.push(
						`Potential SQL injection detected in field: ${field}`
					);
				}
			}

			// XSS detection
			for (const [field, value] of textFields) {
				if (StrictValidator.#_containsXSS(value)) {
					errors.push(
						`Potential XSS content detected in field: ${field}`
					);
				}
			}

			// Field length validation
			for (const [field, value] of textFields) {
				if (value.length > 10000) {
					warnings.push(
						`Field ${field} is unusually long (${value.length} characters)`
					);
				}
			}

			// Binary data detection
			for (const [field, value] of textFields) {
				if (StrictValidator.#_containsBinaryData(value)) {
					warnings.push(`Field ${field} may contain binary data`);
				}
			}

			// V8.0 Migration: Data integrity validation result automatically observed
			this.#dispatchValidationEvent(
				"security.integrity_validation_completed",
				{
					entityType: entity?.type,
					entityId: entity?.id,
					errorCount: errors.length,
					warningCount: warnings.length,
					timestamp: Date.now(),
				}
			);

			return { errors, warnings };
		});
	}

	// Static helper methods

	/** @private @static */
	static #_initializeSecurityRules(options) {
		return {
			requireAuditTrail: options.requireAuditTrail ?? false,
			fields: {
				classification: {
					required: true,
					pattern:
						/^(public|internal|restricted|confidential|secret|top_secret|nato_restricted|nato_confidential|nato_secret|cosmic_top_secret)$/,
				},
				compartments: {
					required: false,
					type: "array",
					itemPattern: /^[A-Z0-9_]+$/,
				},
			},
		};
	}

	/** @private @static */
	static #_initializeComplianceRules(options) {
		return {
			regime: options.complianceRegime || "basic",
			gdpr: {
				enabled: options.enableGDPR ?? false,
				dataMinimization: true,
				consentRequired: true,
			},
			hipaa: {
				enabled: options.enableHIPAA ?? false,
				encryptionRequired: true,
				accessLogging: true,
			},
			sox: {
				enabled: options.enableSOX ?? false,
				financialControlsRequired: true,
				auditTrailMandatory: true,
			},
		};
	}

	/** @private @static */
	static #_initializeBusinessRules(options) {
		return {
			strictEmailValidation: options.strictEmailValidation ?? true,
			phoneValidation: options.phoneValidation ?? true,
			ageValidation: options.ageValidation ?? true,
			relationshipValidation: options.relationshipValidation ?? true,
		};
	}

	/** @private @static */
	static #_getTextFields(entity) {
		const textFields = [];
		for (const [key, value] of Object.entries(entity)) {
			if (typeof value === "string") {
				textFields.push([key, value]);
			}
		}
		return textFields;
	}

	/** @private @static */
	static #_isValidEmail(email) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	}

	/** @private @static */
	static #_isValidPhone(phone) {
		const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
		return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ""));
	}

	/** @private @static */
	static #_containsSQLInjection(text) {
		const sqlPatterns = [
			/(\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bUNION\b)/i,
			/(\bOR\s+1\s*=\s*1\b|\bAND\s+1\s*=\s*1\b)/i,
			/(';\s*--|\bxp_cmdshell\b|\bsp_executesql\b)/i,
		];
		return sqlPatterns.some((pattern) => pattern.test(text));
	}

	/** @private @static */
	static #_containsXSS(text) {
		const xssPatterns = [
			/<script[\s\S]*?>[\s\S]*?<\/script>/i,
			/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/i,
			/javascript\s*:/i,
			/on\w+\s*=\s*["'][^"']*["']/i,
		];
		return xssPatterns.some((pattern) => pattern.test(text));
	}

	/** @private @static */
	static #_containsBinaryData(text) {
		// Check for binary data patterns
		const binaryPatterns = [/[\x00-\x08\x0E-\x1F\x7F-\xFF]/, /\x00/];
		return binaryPatterns.some((pattern) => pattern.test(text));
	}

	/** @private @static */
	static #_containsSensitiveData(text) {
		const sensitivePatterns = [
			/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card numbers
			/\b\d{3}-\d{2}-\d{4}\b/, // SSN
			/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email addresses
		];
		return sensitivePatterns.some((pattern) => pattern.test(text));
	}

	/**
	 * V8.0 Migration: Dispatch validation events through ActionDispatcher for automatic observation
	 * @private
	 */
	#dispatchValidationEvent(eventType, payload) {
		try {
			const actionDispatcher =
				this.#stateManager?.managers?.actionDispatcher;
			if (actionDispatcher?.dispatch) {
				// Fire-and-forget to avoid blocking validation operations
				actionDispatcher
					.dispatch(eventType, {
						...payload,
						component: "StrictValidator",
					})
					.catch(() => {
						// Silent failure - validation operations should not be blocked
					});
			}
		} catch (error) {
			// Silent failure - validation operations should not be blocked
		}
	}
}
