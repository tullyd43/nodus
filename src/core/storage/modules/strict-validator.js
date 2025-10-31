// modules/strict-validator.js
// Strict validation module for high-security environments

/**
 * @description
 * A comprehensive validation module for high-security environments.
 * It enforces strict rules related to security classifications, compliance standards (like GDPR/HIPAA),
 * business logic, and data integrity (checking for patterns like SQL injection or XSS).
 * This module is a key component of the **Compliance** and **Robustness** pillars.
 *
 * @module StrictValidator
 */
export default class StrictValidator {
	/** @private @type {object} */
	#securityRules;
	/** @private @type {object} */
	#complianceRules;
	/** @private @type {object} */
	#businessRules;
	/** @private @type {import('../../HybridStateManager.js').default} */
	#stateManager = null;
	/** @private @type {import('../../../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../../ForensicLogger.js').default|null} */
	#forensicLogger = null;

	/** @public @type {string} */
	name = "StrictValidator";
	/** @public @type {string} */
	type = "security";
	/** @public @type {string[]} */
	supports = ["objects", "events", "relationships"];

	/**
	 * Creates an instance of StrictValidator.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @param {object} [context.options={}] - Configuration options for the validator.
	 */
	constructor({ stateManager, options = {} }) {
		this.#stateManager = stateManager;
		// V8.0 Parity: Derive dependencies from the stateManager.
		this.#metrics =
			this.#stateManager?.metricsRegistry?.namespace("strictValidator");
		this.#forensicLogger = this.#stateManager?.managers?.forensicLogger;

		// Initialize rule sets.
		this.#securityRules = StrictValidator.#initializeSecurityRules(options);
		this.#complianceRules =
			StrictValidator.#initializeComplianceRules(options);
		this.#businessRules = StrictValidator.#initializeBusinessRules(options);
		console.log("[StrictValidator] Loaded for strict validation");
	}

	/**
	 * Initializes the strict validator module.
	 * @returns {Promise<this>} The initialized validator instance.
	 */
	async init() {
		console.log("[StrictValidator] Strict validation rules initialized");
		return this;
	}

	/**
	 * Validates an entity against a comprehensive set of security, compliance, and business rules.
	 * This is the main entry point for the validator.
	 * @param {object} entity - The entity to validate.
	 * @param {object} [context={}] - The validation context.
	 * @returns {Promise<object>} A validation result object.
	 */
	async validate(entity, context = {}) {
		this.#metrics?.increment("validationsPerformed");
		const startTime = performance.now();
		const errors = [];
		const warnings = [];
		const validationSteps = [
			this.#validateSecurity.bind(this),
			this.#validateCompliance.bind(this),
			this.#validateBusinessRules.bind(this),
			this.#validateDataIntegrity.bind(this),
		];

		// V8.0 Parity: Simplify validation pipeline execution.
		for (const step of validationSteps) {
			const result = await step(entity, context);
			errors.push(...result.errors);
			warnings.push(...result.warnings);
		}

		const isValid = errors.length === 0;
		const duration = performance.now() - startTime;
		this.#metrics?.updateAverage("averageValidationTime", duration);

		if (!isValid) {
			this.#metrics?.increment("validationsFailed");
			this.#audit("validation_failed", {
				entityId: entity.id,
				entityType: entity.entity_type,
				errors,
			});
		}

		const result = {
			valid: errors.length === 0,
			errors,
			warnings,
			validator: this.name,
		};
		return result;
	}

	/**
	 * Performs validation for a single field against strict security and format rules.
	 * @param {string} entityType - The type of the entity.
	 * @param {string} fieldName - The name of the field to validate.
	 * @param {*} value - The value of the field.
	 * @param {object} [context={}] - The validation context.
	 * @returns {Promise<object>} A validation result object for the field.
	 */
	async validateField(entityType, fieldName, value, context = {}) {
		const errors = [];
		const warnings = [];

		const fieldRule = this.#securityRules.fields[fieldName] || {};

		// V8.0 Parity: Simplify field validation logic.
		if (
			fieldRule.required &&
			(value === null || value === undefined || value === "")
		) {
			errors.push(
				`Field ${fieldName} is required for security compliance`
			);
		}

		if (
			fieldRule.maxLength &&
			typeof value === "string" &&
			value.length > fieldRule.maxLength
		) {
			errors.push(
				`Field ${fieldName} exceeds maximum length of ${fieldRule.maxLength}`
			);
		}

		if (
			fieldRule.pattern &&
			typeof value === "string" &&
			!fieldRule.pattern.test(value)
		) {
			errors.push(`Field ${fieldName} does not match required pattern`);
		}

		if (fieldRule.sensitiveData) {
			const isSensitiveAndInvalid =
				!StrictValidator.#validateSensitiveData(value);
			if (isSensitiveAndInvalid) {
				errors.push(
					`Field ${fieldName} contains potentially sensitive data that requires encryption`
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
	 * Checks if this validator should be applied to a given entity.
	 * In strict mode, it applies to all entities.
	 * @param {object} entity - The entity to check.
	 * @param {object} context - The validation context.
	 * @returns {boolean} True if the entity is supported.
	 */
	isApplicableFor(entity, context) {
		// Support all entities in strict mode
		return true;
	}

	/**
	 * Checks if this validator should be applied to a given field.
	 * @param {string} entityType - The type of the entity.
	 * @param {string} fieldName - The name of the field.
	 * @returns {boolean} True if the field is supported.
	 */
	supportsField(entityType, fieldName) {
		// Support all fields in strict mode
		return true;
	}

	// Private validation methods
	/**
	 * Validates security-related aspects of an entity.
	 * @private
	 * @param {object} entity - The entity to validate.
	 * @returns {Promise<{errors: string[], warnings: string[]}>} The validation errors and warnings.
	 */
	async #validateSecurity(entity, context) {
		const errors = [];
		const warnings = [];

		// 1. Classification validation
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
		if (!entity.classification) {
			errors.push("Missing required 'classification' field.");
		} else if (!validClassifications.includes(entity.classification)) {
			errors.push(`Invalid classification: ${entity.classification}`);
		}

		// 2. Compartment validation
		if (
			entity.compartment_markings &&
			Array.isArray(entity.compartment_markings)
		) {
			for (const compartment of entity.compartment_markings) {
				if (!StrictValidator.#isValidCompartment(compartment)) {
					errors.push(`Invalid compartment marking: ${compartment}`);
				}
			}
		}

		// 3. Data integrity hash validation (Example, assuming it's a feature)
		if (entity.integrity_hash) {
			const calculatedHash =
				await StrictValidator.#calculateIntegrityHash(entity);
			if (calculatedHash !== entity.integrity_hash) {
				errors.push(
					"Data integrity hash mismatch - possible tampering detected"
				);
			}
		}

		// 4. Audit trail validation (Example, assuming it's a feature)
		if (
			this.#securityRules.requireAuditTrail &&
			(!entity.audit_trail || !Array.isArray(entity.audit_trail))
		) {
			warnings.push("Missing or invalid audit trail");
		}

		return { errors, warnings };
	}

	async #validateCompliance(entity, context) {
		const errors = [];
		const warnings = [];

		// 1. GDPR compliance (if applicable)
		if (
			StrictValidator.#containsPersonalData(entity, this.#complianceRules)
		) {
			if (!entity.gdpr_compliant) {
				errors.push(
					"Entity contains personal data but lacks GDPR compliance marking"
				);
			}

			if (!entity.data_subject_consent) {
				warnings.push(
					"Personal data present without explicit consent documentation"
				);
			}
		}

		// 2. HIPAA compliance (if applicable)
		if (
			StrictValidator.#containsHealthData(entity, this.#complianceRules)
		) {
			if (!entity.hipaa_compliant) {
				errors.push(
					"Entity contains health data but lacks HIPAA compliance marking"
				);
			}
		}

		// 3. Export control validation
		if (entity.export_controlled) {
			if (!entity.export_license || !entity.export_jurisdiction) {
				errors.push(
					"Export controlled data missing required licensing information"
				);
			}
		}

		// 4. Retention policy validation
		if (entity.retention_policy) {
			const retentionDate = new Date(entity.created_at);
			retentionDate.setMilliseconds(
				retentionDate.getMilliseconds() +
					entity.retention_policy.duration
			);

			if (Date.now() > retentionDate.getTime()) {
				warnings.push(
					"Entity has exceeded its retention policy duration"
				);
			}
		}

		return { errors, warnings };
	}

	async #validateBusinessRules(entity, context) {
		const errors = [];
		const warnings = [];

		// 1. Required fields validation
		const requiredFields = StrictValidator.#getRequiredFields(
			entity.entity_type,
			this.#businessRules
		);
		for (const field of requiredFields) {
			if (!entity[field] || entity[field] === "") {
				errors.push(`Required field missing: ${field}`);
			}
		}

		// 2. Field format validation
		if (entity.email && !StrictValidator.#isValidEmail(entity.email)) {
			errors.push("Invalid email format");
		}

		if (entity.phone && !StrictValidator.#isValidPhone(entity.phone)) {
			warnings.push("Phone number format may be invalid");
		}

		// 3. Date validation
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

		// 4. Relationship validation
		if (entity.relationships && Array.isArray(entity.relationships)) {
			for (const rel of entity.relationships) {
				if (!rel.target_id || !rel.relationship_type) {
					errors.push("Incomplete relationship definition");
				}
			}
		}

		return { errors, warnings };
	}

	async #validateDataIntegrity(entity, context) {
		const errors = [];
		const warnings = [];

		// 1. Check for SQL injection patterns
		const textFields = StrictValidator.#getTextFields(entity);
		for (const [field, value] of textFields) {
			if (StrictValidator.#containsSQLInjection(value)) {
				errors.push(
					`Potential SQL injection detected in field: ${field}`
				);
			}
		}

		// 2. Check for XSS patterns
		for (const [field, value] of textFields) {
			if (StrictValidator.#containsXSS(value)) {
				errors.push(
					`Potential XSS content detected in field: ${field}`
				);
			}
		}

		// 3. Check for excessively long fields
		for (const [field, value] of textFields) {
			if (value.length > 10000) {
				warnings.push(
					`Field ${field} is unusually long (${value.length} characters)`
				);
			}
		}

		// 4. Check for binary data in text fields
		for (const [field, value] of textFields) {
			if (StrictValidator.#containsBinaryData(value)) {
				warnings.push(`Field ${field} may contain binary data`);
			}
		}

		return { errors, warnings };
	}

	// Helper methods
	/** @private @static */
	static #initializeSecurityRules(options) {
		return {
			requireAuditTrail: options.requireAuditTrail ?? false,
			fields: {
				classification: {
					required: true,
					pattern:
						/^(public|internal|restricted|confidential|secret|top_secret|nato_restricted|nato_confidential|nato_secret|cosmic_top_secret)$/,
				},
				social_security_number: {
					sensitiveData: true,
					pattern: /^\d{3}-\d{2}-\d{4}$/,
				},
				credit_card: {
					sensitiveData: true,
					pattern: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/,
				},
				password: {
					sensitiveData: true,
					minLength: 12,
				},
			},
		};
	}

	/** @private @static */
	static #initializeComplianceRules(options) {
		return {
			gdpr: {
				personalDataFields: [
					"name",
					"email",
					"phone",
					"address",
					"date_of_birth",
				],
				requiresConsent: true,
				retentionPeriod: 7 * 365 * 24 * 3600000, // 7 years
			},
			hipaa: {
				healthDataFields: [
					"medical_record",
					"diagnosis",
					"treatment",
					"prescription",
				],
				requiresEncryption: true,
			},
		};
	}

	/** @private @static */
	static #initializeBusinessRules(options) {
		return {
			requiredFields: {
				person: ["name", "entity_type"],
				organization: ["name", "entity_type"],
				document: ["title", "entity_type", "content"],
				event: ["title", "entity_type", "date"],
			},
		};
	}

	/** @private @static */
	static #isValidCompartment(compartment) {
		const validCompartments = [
			"NATO",
			"HUMINT",
			"SIGINT",
			"GEOINT",
			"NUCLEAR",
			"COSMIC",
			"ATOMAL",
			"CRYPTO",
			"SPECIAL_ACCESS",
			"EYES_ONLY",
		];
		return validCompartments.includes(compartment);
	}

	/** @private @static */
	static async #calculateIntegrityHash(entity) {
		// Simple integrity hash calculation
		const dataToHash = JSON.stringify({
			id: entity.id,
			content: entity.content,
			classification: entity.classification,
			updated_at: entity.updated_at,
		});

		const encoder = new TextEncoder();
		const data = encoder.encode(dataToHash);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);

		return Array.from(new Uint8Array(hashBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	/** @private @static */
	static #containsPersonalData(entity, complianceRules) {
		const personalFields = complianceRules.gdpr.personalDataFields;
		return personalFields.some(
			(field) => entity[field] && entity[field] !== ""
		);
	}

	/** @private @static */
	static #containsHealthData(entity, complianceRules) {
		const healthFields = complianceRules.hipaa.healthDataFields;
		return healthFields.some(
			(field) => entity[field] && entity[field] !== ""
		);
	}

	/** @private @static */
	static #getRequiredFields(entityType, businessRules) {
		return businessRules.requiredFields[entityType] || ["entity_type"];
	}

	/** @private @static */
	static #isValidEmail(email) {
		// A more robust regex could be used, but this is a common, reasonable one.
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	}

	/**
	 * Validates a phone number format.
	 * @private
	 * @static
	 */
	static #isValidPhone(phone) {
		const phoneRegex = /^[+]?[1-9][\d]{0,15}$/;
		return phoneRegex.test(phone.replace(/[\s\-()]/g, ""));
	}

	/** @private @static */
	static #getTextFields(entity) {
		const textFields = [];
		for (const [key, value] of Object.entries(entity)) {
			if (typeof value === "string" && value.length > 0) {
				textFields.push([key, value]);
			}
		}
		return textFields;
	}

	/** @private @static */
	static #containsSQLInjection(text) {
		// This is a basic check. A real-world implementation should be more robust.
		const sqlPatterns = [
			/(\b(union|select|insert|update|delete|drop)\b)/i,
			/(--|#|\/\*|\*\/)/,
			/(\b(or|and)\b\s+\d+\s*=\s*\d+)/i,
		];

		return sqlPatterns.some((pattern) => pattern.test(text));
	}

	/** @private @static */
	static #containsXSS(text) {
		// This is a basic check. A real-world implementation should use a library like DOMPurify on the receiving end.
		const xssPatterns = [
			/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
			/javascript:/gi,
			/on\w+\s*=/gi,
			/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
		];

		return xssPatterns.some((pattern) => pattern.test(text));
	}

	/** @private @static */
	static #containsBinaryData(text) {
		// This regex specifically targets non-whitespace ASCII control characters (0x00-0x08, 0x0B-0x0C, 0x0E-0x1F)
		// and the DEL character (0x7F), which are typically unexpected in clean text fields.
		return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
	}

	/** @private @static */
	static #validateSensitiveData(value) {
		// This is a placeholder. In a real system, this would check if the data
		// appears to be unencrypted PII. For this validator, we assume that if
		// a field is marked as sensitive, it must be passed in an encrypted format.
		if (typeof value !== "string") return true; // Not a string, can't be unencrypted PII text.

		// A simple heuristic: if it looks like random base64, it might be encrypted.
		// If it looks like plain text, it's a problem.
		const isLikelyBase64 =
			/^[A-Za-z0-9+/=]+$/.test(value) && value.length > 20;
		const hasSpaces = /\s/.test(value);

		// If it has spaces, it's probably not encrypted. If it's not likely base64, also a problem.
		if (hasSpaces || !isLikelyBase64) {
			// Further check for common PII patterns to reduce false positives.
			const piiPatterns = [
				/\d{3}-\d{2}-\d{4}/, // SSN
				/\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/, // Credit Card
			];
			if (piiPatterns.some((p) => p.test(value))) {
				return false; // Found PII that doesn't look encrypted.
			}
		}

		return true; // Assume it's either not PII or is properly handled.
	}

	/**
	 * Logs an audit event using the ForensicLogger.
	 * @private
	 * @param {string} eventType - The type of event to log.
	 * @param {object} data - The data associated with the event.
	 */
	#audit(eventType, data) {
		if (this.#forensicLogger) {
			this.#forensicLogger.logAuditEvent(
				`STRICT_VALIDATOR_${eventType.toUpperCase()}`,
				data
			);
		}
	}
}
