// core/validation/ValidationLayer.js
// Universal schema validation with composable rules

/**
 * Validation Layer - Separate from Sync Layer
 * 
 * PURPOSE:
 * - Schema validation ensures data integrity
 * - Type checking prevents corruption
 * - Business rule enforcement
 * - Security validation (separate from access control)
 * 
 * NOT A SYNC LAYER:
 * - Validation happens before storage/transmission
 * - Sync layer handles conflict resolution and merging
 * - This is about data correctness, sync is about consistency
 */
export class ValidationLayer {
  #validators = new Map();
  #customRules = new Map();
  #metrics;
  #config;
  #ready = false;

  constructor(options = {}) {
    this.#config = {
      strictMode: options.strictMode !== false,
      performanceMode: options.performanceMode || 'balanced',
      customValidators: options.customValidators || {},
      maxErrors: options.maxErrors || 10,
      asyncTimeout: options.asyncTimeout || 5000,
      ...options
    };

    this.#metrics = {
      validationCount: 0,
      validationErrors: 0,
      averageLatency: 0,
      ruleExecutions: new Map(),
      recentErrors: []
    };

    this.#initializeBaseValidators();
    this.#loadCustomValidators(this.#config.customValidators);
  }

  /**
   * Initialize validation system
   */
  async init() {
    if (this.#ready) return this;

    // Initialize async validators if any
    await this.#initializeAsyncValidators();
    
    this.#ready = true;
    console.log('[ValidationLayer] Ready with schema validation');
    return this;
  }

  /**
   * Validate entity against universal schema + custom rules
   */
  async validateEntity(entity) {
    if (!this.#ready) throw new Error('ValidationLayer not initialized');
    
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
      
      return {
        valid: isValid,
        errors: errors.slice(0, this.#config.maxErrors),
        warnings: [],
        metadata: {
          latency,
          rulesExecuted: this.#getExecutedRules(),
          entityType: entity.entity_type
        }
      };

    } catch (error) {
      const latency = performance.now() - startTime;
      this.#recordValidation(false, latency, [error.message]);
      
      return {
        valid: false,
        errors: [`Validation system error: ${error.message}`],
        warnings: [],
        metadata: { latency, systemError: true }
      };
    }
  }

  /**
   * Validate field value against field definition
   */
  validateField(fieldName, value, fieldDefinition) {
    const errors = [];
    
    // Required check
    if (fieldDefinition.required && (value === null || value === undefined || value === '')) {
      errors.push(`Field '${fieldName}' is required`);
      return { valid: false, errors };
    }

    // Skip further validation if value is empty and not required
    if (value === null || value === undefined || value === '') {
      return { valid: true, errors: [] };
    }

    // Type validation
    const typeResult = this.#validateFieldType(fieldName, value, fieldDefinition.type);
    if (!typeResult.valid) {
      errors.push(...typeResult.errors);
    }

    // Format validation
    if (fieldDefinition.format) {
      const formatResult = this.#validateFieldFormat(fieldName, value, fieldDefinition.format);
      if (!formatResult.valid) {
        errors.push(...formatResult.errors);
      }
    }

    // Range/length validation
    if (fieldDefinition.min !== undefined || fieldDefinition.max !== undefined) {
      const rangeResult = this.#validateFieldRange(fieldName, value, fieldDefinition);
      if (!rangeResult.valid) {
        errors.push(...rangeResult.errors);
      }
    }

    // Custom validator
    if (fieldDefinition.validator && this.#validators.has(fieldDefinition.validator)) {
      const validator = this.#validators.get(fieldDefinition.validator);
      const customResult = validator(value, fieldDefinition);
      if (!customResult.valid) {
        errors.push(...customResult.errors);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Add custom validation rule
   */
  addValidationRule(name, rule) {
    if (typeof rule !== 'function') {
      throw new Error('Validation rule must be a function');
    }
    
    this.#customRules.set(name, rule);
    console.log(`[ValidationLayer] Added custom rule: ${name}`);
  }

  /**
   * Add field validator
   */
  addFieldValidator(name, validator) {
    if (typeof validator !== 'function') {
      throw new Error('Field validator must be a function');
    }
    
    this.#validators.set(name, validator);
    console.log(`[ValidationLayer] Added field validator: ${name}`);
  }

  /**
   * Get validation statistics
   */
  getStats() {
    return {
      ...this.#metrics,
      customRules: this.#customRules.size,
      fieldValidators: this.#validators.size,
      isReady: this.#ready
    };
  }

  /**
   * Get average validation latency
   */
  getAverageLatency() {
    return this.#metrics.averageLatency;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.#validators.clear();
    this.#customRules.clear();
    this.#ready = false;
  }

  // ===== PRIVATE VALIDATION METHODS =====

  /**
   * Validate base entity schema (universal)
   */
  #validateBaseSchema(entity) {
    const errors = [];
    
    // Required fields
    const requiredFields = ['id', 'entity_type'];
    for (const field of requiredFields) {
      if (!entity[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // ID format
    if (entity.id && !this.#isValidUUID(entity.id)) {
      errors.push('ID must be a valid UUID');
    }

    // Entity type
    const validTypes = ['task', 'document', 'event', 'user', 'project', 'component', 'block'];
    if (entity.entity_type && !validTypes.includes(entity.entity_type)) {
      errors.push(`Invalid entity_type: ${entity.entity_type}`);
    }

    // Timestamps
    if (entity.created_at && !this.#isValidTimestamp(entity.created_at)) {
      errors.push('created_at must be a valid ISO timestamp');
    }
    
    if (entity.updated_at && !this.#isValidTimestamp(entity.updated_at)) {
      errors.push('updated_at must be a valid ISO timestamp');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate entity type-specific fields
   */
  #validateEntityType(entity) {
    switch (entity.entity_type) {
      case 'task':
        return this.#validateTaskEntity(entity);
      case 'document':
        return this.#validateDocumentEntity(entity);
      case 'event':
        return this.#validateEventEntity(entity);
      case 'user':
        return this.#validateUserEntity(entity);
      default:
        // Generic validation for unknown types
        return { valid: true, errors: [] };
    }
  }

  /**
   * Validate security-related fields
   */
  #validateSecurity(entity) {
    const errors = [];
    
    // Classification validation
    const validClassifications = [
      'public', 'internal', 'restricted', 'confidential', 'secret', 'top_secret',
      'nato_restricted', 'nato_confidential', 'nato_secret', 'cosmic_top_secret'
    ];
    
    if (entity.nato_classification && !validClassifications.includes(entity.nato_classification)) {
      errors.push(`Invalid classification: ${entity.nato_classification}`);
    }

    // Compartment markings
    if (entity.compartment_markings) {
      if (!Array.isArray(entity.compartment_markings)) {
        errors.push('compartment_markings must be an array');
      } else {
        for (const marking of entity.compartment_markings) {
          if (typeof marking !== 'string' || marking.length === 0) {
            errors.push('All compartment markings must be non-empty strings');
            break;
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate task entity
   */
  #validateTaskEntity(entity) {
    const errors = [];
    
    // Title is required
    if (!entity.title || typeof entity.title !== 'string') {
      errors.push('Task title is required and must be a string');
    } else if (entity.title.length > 200) {
      errors.push('Task title must be 200 characters or less');
    }

    // Status validation
    const validStatuses = ['pending', 'in-progress', 'completed', 'cancelled'];
    if (entity.status && !validStatuses.includes(entity.status)) {
      errors.push(`Invalid task status: ${entity.status}`);
    }

    // Priority validation
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (entity.priority && !validPriorities.includes(entity.priority)) {
      errors.push(`Invalid task priority: ${entity.priority}`);
    }

    // Due date validation
    if (entity.due_date && !this.#isValidTimestamp(entity.due_date)) {
      errors.push('Task due_date must be a valid ISO timestamp');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate document entity
   */
  #validateDocumentEntity(entity) {
    const errors = [];
    
    // Title is required
    if (!entity.title || typeof entity.title !== 'string') {
      errors.push('Document title is required and must be a string');
    } else if (entity.title.length > 200) {
      errors.push('Document title must be 200 characters or less');
    }

    // Content validation
    if (entity.content && typeof entity.content !== 'string') {
      errors.push('Document content must be a string');
    } else if (entity.content && entity.content.length > 50000) {
      errors.push('Document content must be 50,000 characters or less');
    }

    // Content type validation
    const validContentTypes = ['text', 'markdown', 'html', 'json'];
    if (entity.content_type && !validContentTypes.includes(entity.content_type)) {
      errors.push(`Invalid document content_type: ${entity.content_type}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate event entity
   */
  #validateEventEntity(entity) {
    const errors = [];
    
    // Event type validation
    if (!entity.event_type || typeof entity.event_type !== 'string') {
      errors.push('Event event_type is required and must be a string');
    }

    // Severity validation
    const validSeverities = ['debug', 'info', 'warning', 'error', 'critical'];
    if (entity.severity && !validSeverities.includes(entity.severity)) {
      errors.push(`Invalid event severity: ${entity.severity}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate user entity
   */
  #validateUserEntity(entity) {
    const errors = [];
    
    // Email validation
    if (entity.email && !this.#isValidEmail(entity.email)) {
      errors.push('Invalid email format');
    }

    // Display name validation
    if (entity.display_name && typeof entity.display_name !== 'string') {
      errors.push('Display name must be a string');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate custom business rules
   */
  async #validateCustomRules(entity) {
    const errors = [];
    
    for (const [ruleName, rule] of this.#customRules) {
      try {
        const result = await Promise.race([
          rule(entity),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Validation timeout')), this.#config.asyncTimeout)
          )
        ]);
        
        if (!result.valid) {
          errors.push(...result.errors);
        }
        
        this.#metrics.ruleExecutions.set(ruleName, (this.#metrics.ruleExecutions.get(ruleName) || 0) + 1);
        
      } catch (error) {
        console.warn(`Custom rule '${ruleName}' failed:`, error);
        if (this.#config.strictMode) {
          errors.push(`Custom rule '${ruleName}' failed: ${error.message}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate cross-field relationships
   */
  #validateCrossFields(entity) {
    const errors = [];
    
    // Task-specific cross-field validation
    if (entity.entity_type === 'task') {
      // Due date must be in the future for pending tasks
      if (entity.status === 'pending' && entity.due_date) {
        const dueDate = new Date(entity.due_date);
        if (dueDate < new Date()) {
          errors.push('Due date cannot be in the past for pending tasks');
        }
      }
      
      // Completed tasks should have a completion date
      if (entity.status === 'completed' && !entity.completed_at) {
        errors.push('Completed tasks should have a completion date');
      }
    }

    // Document-specific cross-field validation
    if (entity.entity_type === 'document') {
      // Content type should match content format
      if (entity.content_type === 'json' && entity.content) {
        try {
          JSON.parse(entity.content);
        } catch (error) {
          errors.push('Document content is not valid JSON despite content_type being json');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // ===== PRIVATE HELPER METHODS =====

  #validateFieldType(fieldName, value, expectedType) {
    const errors = [];
    const actualType = typeof value;
    
    if (expectedType === 'array' && !Array.isArray(value)) {
      errors.push(`Field '${fieldName}' must be an array`);
    } else if (expectedType !== 'array' && actualType !== expectedType) {
      errors.push(`Field '${fieldName}' must be of type ${expectedType}, got ${actualType}`);
    }

    return { valid: errors.length === 0, errors };
  }

  #validateFieldFormat(fieldName, value, format) {
    const errors = [];
    
    switch (format) {
      case 'email':
        if (!this.#isValidEmail(value)) {
          errors.push(`Field '${fieldName}' must be a valid email address`);
        }
        break;
      case 'uuid':
        if (!this.#isValidUUID(value)) {
          errors.push(`Field '${fieldName}' must be a valid UUID`);
        }
        break;
      case 'url':
        if (!this.#isValidURL(value)) {
          errors.push(`Field '${fieldName}' must be a valid URL`);
        }
        break;
      case 'iso-date':
        if (!this.#isValidTimestamp(value)) {
          errors.push(`Field '${fieldName}' must be a valid ISO timestamp`);
        }
        break;
    }

    return { valid: errors.length === 0, errors };
  }

  #validateFieldRange(fieldName, value, fieldDefinition) {
    const errors = [];
    
    if (typeof value === 'string') {
      if (fieldDefinition.min !== undefined && value.length < fieldDefinition.min) {
        errors.push(`Field '${fieldName}' must be at least ${fieldDefinition.min} characters`);
      }
      if (fieldDefinition.max !== undefined && value.length > fieldDefinition.max) {
        errors.push(`Field '${fieldName}' must be at most ${fieldDefinition.max} characters`);
      }
    } else if (typeof value === 'number') {
      if (fieldDefinition.min !== undefined && value < fieldDefinition.min) {
        errors.push(`Field '${fieldName}' must be at least ${fieldDefinition.min}`);
      }
      if (fieldDefinition.max !== undefined && value > fieldDefinition.max) {
        errors.push(`Field '${fieldName}' must be at most ${fieldDefinition.max}`);
      }
    } else if (Array.isArray(value)) {
      if (fieldDefinition.min !== undefined && value.length < fieldDefinition.min) {
        errors.push(`Field '${fieldName}' must have at least ${fieldDefinition.min} items`);
      }
      if (fieldDefinition.max !== undefined && value.length > fieldDefinition.max) {
        errors.push(`Field '${fieldName}' must have at most ${fieldDefinition.max} items`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  #isValidUUID(value) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  #isValidEmail(value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }

  #isValidURL(value) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  #isValidTimestamp(value) {
    const date = new Date(value);
    return !isNaN(date.getTime()) && date.toISOString() === value;
  }

  #initializeBaseValidators() {
    // Add basic field validators
    this.#validators.set('email', (value) => ({
      valid: this.#isValidEmail(value),
      errors: this.#isValidEmail(value) ? [] : ['Invalid email format']
    }));

    this.#validators.set('uuid', (value) => ({
      valid: this.#isValidUUID(value),
      errors: this.#isValidUUID(value) ? [] : ['Invalid UUID format']
    }));

    this.#validators.set('url', (value) => ({
      valid: this.#isValidURL(value),
      errors: this.#isValidURL(value) ? [] : ['Invalid URL format']
    }));
  }

  #loadCustomValidators(customValidators) {
    for (const [name, validator] of Object.entries(customValidators)) {
      this.addFieldValidator(name, validator);
    }
  }

  async #initializeAsyncValidators() {
    // Initialize any async validators here
    // For now, all validators are synchronous
  }

  #recordValidation(success, latency, errors) {
    this.#metrics.validationCount++;
    if (!success) {
      this.#metrics.validationErrors++;
      this.#metrics.recentErrors.push({
        errors,
        timestamp: Date.now()
      });
      
      // Keep only recent errors
      if (this.#metrics.recentErrors.length > 100) {
        this.#metrics.recentErrors = this.#metrics.recentErrors.slice(-100);
      }
    }

    // Update average latency
    this.#metrics.averageLatency = 
      (this.#metrics.averageLatency * (this.#metrics.validationCount - 1) + latency) / 
      this.#metrics.validationCount;
  }

  #getExecutedRules() {
    return Array.from(this.#metrics.ruleExecutions.keys());
  }
}

export default ValidationLayer;
