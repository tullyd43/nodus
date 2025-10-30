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
	/**
	 * @private
	 * @type {object}
	 */
	#securityRules;
	/**
	 * @private
	 * @type {object}
	 */
	#complianceRules;
	/**
	 * @private
	 * @type {object}
	 */
	#businessRules;

	/**
	 * Creates an instance of StrictValidator.
	 * @param {object} [options={}] - Configuration options for the validator.
	 */
	constructor(options = {}) {
		this.name = "StrictValidator";
		this.type = "security";
		this.supports = ["objects", "events", "relationships"];

		this.#securityRules = this.#initializeSecurityRules(options);
		this.#complianceRules = this.#initializeComplianceRules(options);
		this.#businessRules = this.#initializeBusinessRules(options);

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
		const errors = [];
		const warnings = [];

		// 1. Security validation
		const securityResult = await this.#validateSecurity(entity);
		errors.push(...securityResult.errors);
		warnings.push(...securityResult.warnings);

		// 2. Compliance validation
		const complianceResult = await this.#validateCompliance(entity);
		errors.push(...complianceResult.errors);
		warnings.push(...complianceResult.warnings);

		// 3. Business rules validation
		const businessResult = await this.#validateBusinessRules(entity);
		errors.push(...businessResult.errors);
		warnings.push(...businessResult.warnings);

		// 4. Data integrity validation
		const integrityResult = await this.#validateDataIntegrity(entity);
		errors.push(...integrityResult.errors);
		warnings.push(...integrityResult.warnings);

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			validator: this.name,
		};
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

		// Check field-level security rules
		if (this.#securityRules.fields[fieldName]) {
			const fieldRule = this.#securityRules.fields[fieldName];

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
				errors.push(
					`Field ${fieldName} does not match required pattern`
				);
			}

			if (
				fieldRule.sensitiveData &&
				!this.#validateSensitiveData(value)
			) {
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
	supports(entity, context) {
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
	async #validateSecurity(entity) {
		const errors = [];
		const warnings = [];

		// 1. Classification validation
		if (!entity.nato_classification) {
			errors.push("Missing required classification marking");
		} else {
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

			if (!validClassifications.includes(entity.nato_classification)) {
				errors.push(
					`Invalid classification: ${entity.nato_classification}`
				);
			}
		}

		// 2. Compartment validation
		if (
			entity.compartment_markings &&
			Array.isArray(entity.compartment_markings)
		) {
			for (const compartment of entity.compartment_markings) {
				if (!this.#isValidCompartment(compartment)) {
					errors.push(`Invalid compartment marking: ${compartment}`);
				}
			}
		}

		// 3. Data integrity hash validation
		if (entity.integrity_hash) {
			const calculatedHash = await this.#calculateIntegrityHash(entity);
			if (calculatedHash !== entity.integrity_hash) {
				errors.push(
					"Data integrity hash mismatch - possible tampering detected"
				);
			}
		}

		// 4. Audit trail validation
		if (!entity.audit_trail || !Array.isArray(entity.audit_trail)) {
			warnings.push("Missing or invalid audit trail");
		}

		return { errors, warnings };
	}

	async #validateCompliance(entity) {
		const errors = [];
		const warnings = [];

		// 1. GDPR compliance (if applicable)
		if (this.#containsPersonalData(entity)) {
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
		if (this.#containsHealthData(entity)) {
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

	async #validateBusinessRules(entity) {
		const errors = [];
		const warnings = [];

		// 1. Required fields validation
		const requiredFields = this.#getRequiredFields(entity.entity_type);
		for (const field of requiredFields) {
			if (!entity[field] || entity[field] === "") {
				errors.push(`Required field missing: ${field}`);
			}
		}

		// 2. Field format validation
		if (entity.email && !this.#isValidEmail(entity.email)) {
			errors.push("Invalid email format");
		}

		if (entity.phone && !this.#isValidPhone(entity.phone)) {
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

	async #validateDataIntegrity(entity) {
		const errors = [];
		const warnings = [];

		// 1. Check for SQL injection patterns
		const textFields = this.#getTextFields(entity);
		for (const [field, value] of textFields) {
			if (this.#containsSQLInjection(value)) {
				errors.push(
					`Potential SQL injection detected in field: ${field}`
				);
			}
		}

		// 2. Check for XSS patterns
		for (const [field, value] of textFields) {
			if (this.#containsXSS(value)) {
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
			if (this.#containsBinaryData(value)) {
				warnings.push(`Field ${field} may contain binary data`);
			}
		}

		return { errors, warnings };
	}

	// Helper methods
	#initializeSecurityRules(options) {
		return {
			fields: {
				nato_classification: {
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

	#initializeComplianceRules(options) {
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

	#initializeBusinessRules(options) {
		return {
			requiredFields: {
				person: ["name", "entity_type"],
				organization: ["name", "entity_type"],
				document: ["title", "entity_type", "content"],
				event: ["title", "entity_type", "date"],
			},
		};
	}

	#isValidCompartment(compartment) {
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

	async #calculateIntegrityHash(entity) {
		// Simple integrity hash calculation
		const dataToHash = JSON.stringify({
			id: entity.id,
			content: entity.content,
			nato_classification: entity.nato_classification,
			updated_at: entity.updated_at,
		});

		const encoder = new TextEncoder();
		const data = encoder.encode(dataToHash);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);

		return Array.from(new Uint8Array(hashBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	#containsPersonalData(entity) {
		const personalFields = this.#complianceRules.gdpr.personalDataFields;
		return personalFields.some(
			(field) => entity[field] && entity[field] !== ""
		);
	}

	#containsHealthData(entity) {
		const healthFields = this.#complianceRules.hipaa.healthDataFields;
		return healthFields.some(
			(field) => entity[field] && entity[field] !== ""
		);
	}

	#getRequiredFields(entityType) {
		return (
			this.#businessRules.requiredFields[entityType] || ["entity_type"]
		);
	}

	#isValidEmail(email) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	}

	/**
	 * Validates a phone number format.
	 */
	#isValidPhone(phone) {
		const phoneRegex = /^[+]?[1-9][\d]{0,15}$/;
		return phoneRegex.test(phone.replace(/[\s\-()]/g, ""));
	}

	#getTextFields(entity) {
		const textFields = [];
		for (const [key, value] of Object.entries(entity)) {
			if (typeof value === "string" && value.length > 0) {
				textFields.push([key, value]);
			}
		}
		return textFields;
	}

	#containsSQLInjection(text) {
		const sqlPatterns = [
			/(\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b)/i,
			/(--|#|\/\*|\*\/)/,
			/(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/i,
		];

		return sqlPatterns.some((pattern) => pattern.test(text));
	}

	#containsXSS(text) {
		const xssPatterns = [
			/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
			/javascript:/gi,
			/on\w+\s*=/gi,
			/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
		];

		return xssPatterns.some((pattern) => pattern.test(text));
	}

	#containsBinaryData(text) {
		// This regex specifically targets non-whitespace ASCII control characters (0x00-0x08, 0x0B-0x0C, 0x0E-0x1F)
		// and the DEL character (0x7F), which are typically unexpected in clean text fields.
		return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
	}

	#validateSensitiveData(value) {
		// Check if sensitive data is properly formatted/encrypted
		if (typeof value !== "string") return true;

		// Look for common sensitive data patterns
		const sensitivePatterns = [
			/\d{3}-\d{2}-\d{4}/, // SSN
			/\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/, // Credit card
			/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email (might be sensitive in some contexts)
		];

		// If it matches sensitive patterns and isn't encrypted, flag it
		const matchesSensitive = sensitivePatterns.some((pattern) =>
			pattern.test(value)
		);
		const appearsEncrypted = /^[A-Za-z0-9+/]{40,}={0,2}$/.test(value); // Base64-like pattern

		return !matchesSensitive || appearsEncrypted;
	}
}
