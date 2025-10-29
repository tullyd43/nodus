// modules/validation-stack.js
// Validation stack for composable data validation

/**
 * Validation Stack Module
 * Loaded for: all configurations with validation requirements
 * Bundle size: ~2KB (core validation orchestration)
 */
export default class ValidationStack {
  #validators = [];
  #validationCache = new Map();
  #validationHistory = [];
  #config;
  #metrics = {
    validationsPerformed: 0,
    validationsFailed: 0,
    averageValidationTime: 0,
    cacheHitRate: 0
  };

  constructor(validators = [], options = {}) {
    this.#validators = validators;
    this.#config = {
      enableCaching: options.enableCaching !== false,
      cacheSize: options.cacheSize || 1000,
      cacheTTL: options.cacheTTL || 5 * 60 * 1000, // 5 minutes
      trackHistory: options.trackHistory || false,
      failFast: options.failFast || false,
      ...options
    };

    console.log(`[ValidationStack] Loaded with ${validators.length} validators`);
  }

  async init() {
    // Initialize all validators
    for (const validator of this.#validators) {
      if (validator.init) {
        await validator.init();
      }
    }

    console.log('[ValidationStack] Validation stack initialized');
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
   * Validate entity with all applicable validators
   */
  async validate(entity, context = {}) {
    const startTime = performance.now();
    const cacheKey = this.#generateCacheKey(entity, context);
    
    // Check cache first
    if (this.#config.enableCaching && this.#validationCache.has(cacheKey)) {
      const cached = this.#validationCache.get(cacheKey);
      if (Date.now() < cached.expires) {
        this.#updateCacheMetrics(true);
        return cached.result;
      } else {
        this.#validationCache.delete(cacheKey);
      }
    }

    this.#updateCacheMetrics(false);

    // Perform validation
    const result = await this.#performValidation(entity, context);
    
    // Cache result
    if (this.#config.enableCaching) {
      this.#validationCache.set(cacheKey, {
        result,
        expires: Date.now() + this.#config.cacheTTL
      });
      
      // Cleanup cache if too large
      if (this.#validationCache.size > this.#config.cacheSize) {
        this.#cleanupCache();
      }
    }

    // Update metrics
    const validationTime = performance.now() - startTime;
    this.#updateValidationMetrics(result.valid, validationTime);

    // Track history if enabled
    if (this.#config.trackHistory) {
      this.#addToHistory(entity, result, validationTime);
    }

    return result;
  }

  /**
   * Validate specific field
   */
  async validateField(entityType, fieldName, value, context = {}) {
    const applicableValidators = this.#validators.filter(v => 
      v.supportsField && v.supportsField(entityType, fieldName)
    );

    const errors = [];
    const warnings = [];

    for (const validator of applicableValidators) {
      try {
        const result = await validator.validateField(entityType, fieldName, value, context);
        
        if (!result.valid) {
          errors.push(...(result.errors || []));
          warnings.push(...(result.warnings || []));
          
          if (this.#config.failFast) {
            break;
          }
        }
      } catch (error) {
        errors.push(`Validator error: ${error.message}`);
        
        if (this.#config.failFast) {
          break;
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      validatedBy: applicableValidators.map(v => v.name || v.constructor.name)
    };
  }

  /**
   * Get validation metrics
   */
  getValidationMetrics() {
    return {
      ...this.#metrics,
      validatorsLoaded: this.#validators.length,
      cacheSize: this.#validationCache.size,
      historySize: this.#validationHistory.length
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
    this.#validationCache.clear();
    console.log('[ValidationStack] Validation cache cleared');
  }

  /**
   * Get loaded validators
   */
  getValidators() {
    return this.#validators.map(v => ({
      name: v.name || v.constructor.name,
      type: v.type || 'unknown',
      supports: v.supports || []
    }));
  }

  // Private methods
  async #performValidation(entity, context) {
    const errors = [];
    const warnings = [];
    const validationResults = [];

    for (const validator of this.#validators) {
      try {
        // Check if validator applies to this entity
        if (validator.supports && !validator.supports(entity, context)) {
          continue;
        }

        const result = await validator.validate(entity, context);
        validationResults.push({
          validator: validator.name || validator.constructor.name,
          result
        });

        if (!result.valid) {
          errors.push(...(result.errors || []));
          warnings.push(...(result.warnings || []));
          
          if (this.#config.failFast) {
            break;
          }
        }
      } catch (error) {
        const errorMsg = `Validator ${validator.name || validator.constructor.name} failed: ${error.message}`;
        errors.push(errorMsg);
        console.error(`[ValidationStack] ${errorMsg}`);
        
        if (this.#config.failFast) {
          break;
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      validationResults,
      timestamp: Date.now()
    };
  }

  #generateCacheKey(entity, context) {
    // Create deterministic cache key
    const entityKey = JSON.stringify({
      id: entity.id,
      entity_type: entity.entity_type,
      updated_at: entity.updated_at,
      // Include relevant context
      classification: context.classification,
      user: context.userId
    });
    
    // Simple hash for shorter keys
    let hash = 0;
    for (let i = 0; i < entityKey.length; i++) {
      const char = entityKey.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16);
  }

  #updateValidationMetrics(isValid, validationTime) {
    this.#metrics.validationsPerformed++;
    
    if (!isValid) {
      this.#metrics.validationsFailed++;
    }

    // Update average validation time
    const totalTime = (this.#metrics.averageValidationTime * (this.#metrics.validationsPerformed - 1)) + validationTime;
    this.#metrics.averageValidationTime = totalTime / this.#metrics.validationsPerformed;
  }

  #updateCacheMetrics(isHit) {
    const totalRequests = this.#metrics.validationsPerformed + 1;
    const hits = isHit ? 1 : 0;
    
    // Update hit rate (running average)
    this.#metrics.cacheHitRate = ((this.#metrics.cacheHitRate * (totalRequests - 1)) + hits) / totalRequests;
  }

  #addToHistory(entity, result, validationTime) {
    this.#validationHistory.push({
      entityId: entity.id,
      entityType: entity.entity_type,
      valid: result.valid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      validationTime,
      timestamp: Date.now()
    });

    // Keep history manageable
    if (this.#validationHistory.length > 1000) {
      this.#validationHistory = this.#validationHistory.slice(-500);
    }
  }

  #cleanupCache() {
    const now = Date.now();
    const toDelete = [];

    // Remove expired entries
    for (const [key, value] of this.#validationCache.entries()) {
      if (now >= value.expires) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.#validationCache.delete(key);
    }

    // If still too large, remove oldest entries
    if (this.#validationCache.size > this.#config.cacheSize) {
      const entries = Array.from(this.#validationCache.entries());
      const toRemove = entries.slice(0, entries.length - this.#config.cacheSize);
      
      for (const [key] of toRemove) {
        this.#validationCache.delete(key);
      }
    }
  }
}
