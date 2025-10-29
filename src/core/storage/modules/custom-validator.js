// modules/custom-validator.js
// Custom validation module for user-defined business rules

/**
 * Custom Validator Module
 * Loaded for: configurations with custom validation requirements
 * Bundle size: ~2KB (rule engine and custom validators)
 */
export default class CustomValidator {
  #customRules = new Map();
  #ruleEngine;
  #validationContext;
  #metrics = {
    rulesExecuted: 0,
    rulesPassed: 0,
    rulesFailed: 0,
    averageExecutionTime: 0
  };

  constructor(customRules = [], options = {}) {
    this.name = 'CustomValidator';
    this.type = 'business';
    this.supports = ['objects', 'events', 'relationships'];
    
    this.#ruleEngine = new ValidationRuleEngine(options);
    this.#loadCustomRules(customRules);
    
    console.log(`[CustomValidator] Loaded with ${customRules.length} custom rules`);
  }

  async init() {
    await this.#ruleEngine.init();
    console.log('[CustomValidator] Custom validation rules initialized');
    return this;
  }

  /**
   * Add custom validation rule
   */
  addRule(ruleName, ruleDefinition) {
    this.#customRules.set(ruleName, {
      ...ruleDefinition,
      name: ruleName,
      createdAt: Date.now()
    });
    
    console.log(`[CustomValidator] Added custom rule: ${ruleName}`);
  }

  /**
   * Remove custom validation rule
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
   */
  async validate(entity, context = {}) {
    this.#validationContext = context;
    
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
          message: result.message
        });

        if (!result.passed) {
          if (rule.severity === 'error') {
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
      validator: this.name
    };
  }

  /**
   * Field-specific validation
   */
  async validateField(entityType, fieldName, value, context = {}) {
    const errors = [];
    const warnings = [];

    // Find field-specific rules
    const fieldRules = Array.from(this.#customRules.values()).filter(rule => 
      rule.scope === 'field' && 
      rule.entityType === entityType &&
      rule.fieldName === fieldName
    );

    for (const rule of fieldRules) {
      try {
        const result = await this.#executeFieldRule(rule, value, context);
        
        if (!result.passed) {
          if (rule.severity === 'error') {
            errors.push(result.message);
          } else {
            warnings.push(result.message);
          }
        }
      } catch (error) {
        errors.push(`Field rule '${rule.name}' failed: ${error.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if validator supports entity
   */
  supports(entity, context) {
    return this.#getApplicableRules(entity).length > 0;
  }

  /**
   * Check if validator supports field
   */
  supportsField(entityType, fieldName) {
    return Array.from(this.#customRules.values()).some(rule => 
      rule.scope === 'field' && 
      rule.entityType === entityType &&
      rule.fieldName === fieldName
    );
  }

  /**
   * Get validation metrics
   */
  getMetrics() {
    return {
      ...this.#metrics,
      rulesLoaded: this.#customRules.size,
      successRate: this.#metrics.rulesExecuted > 0 
        ? (this.#metrics.rulesPassed / this.#metrics.rulesExecuted) * 100 
        : 0
    };
  }

  /**
   * Get loaded rules
   */
  getRules() {
    return Array.from(this.#customRules.entries()).map(([name, rule]) => ({
      name,
      description: rule.description,
      entityType: rule.entityType,
      scope: rule.scope,
      severity: rule.severity,
      enabled: rule.enabled !== false
    }));
  }

  // Private methods
  #loadCustomRules(customRules) {
    for (const rule of customRules) {
      this.addRule(rule.name, rule);
    }
  }

  #getApplicableRules(entity) {
    return Array.from(this.#customRules.values()).filter(rule => {
      // Check if rule is enabled
      if (rule.enabled === false) return false;
      
      // Check entity type match
      if (rule.entityType && rule.entityType !== entity.entity_type) return false;
      
      // Check scope (entity-level rules)
      if (rule.scope !== 'entity') return false;
      
      // Check conditions
      if (rule.conditions) {
        return this.#evaluateConditions(rule.conditions, entity);
      }
      
      return true;
    });
  }

  #evaluateConditions(conditions, entity) {
    for (const condition of conditions) {
      if (!this.#evaluateCondition(condition, entity)) {
        return false;
      }
    }
    return true;
  }

  #evaluateCondition(condition, entity) {
    const { field, operator, value } = condition;
    const entityValue = this.#getNestedValue(entity, field);
    
    switch (operator) {
      case 'equals':
        return entityValue === value;
      case 'not_equals':
        return entityValue !== value;
      case 'contains':
        return typeof entityValue === 'string' && entityValue.includes(value);
      case 'starts_with':
        return typeof entityValue === 'string' && entityValue.startsWith(value);
      case 'ends_with':
        return typeof entityValue === 'string' && entityValue.endsWith(value);
      case 'greater_than':
        return Number(entityValue) > Number(value);
      case 'less_than':
        return Number(entityValue) < Number(value);
      case 'exists':
        return entityValue !== null && entityValue !== undefined;
      case 'not_exists':
        return entityValue === null || entityValue === undefined;
      case 'in':
        return Array.isArray(value) && value.includes(entityValue);
      case 'not_in':
        return Array.isArray(value) && !value.includes(entityValue);
      default:
        console.warn(`[CustomValidator] Unknown condition operator: ${operator}`);
        return false;
    }
  }

  #getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  async #executeRule(rule, entity, context) {
    switch (rule.type) {
      case 'javascript':
        return await this.#executeJavaScriptRule(rule, entity, context);
      case 'expression':
        return await this.#executeExpressionRule(rule, entity, context);
      case 'regex':
        return await this.#executeRegexRule(rule, entity, context);
      case 'lookup':
        return await this.#executeLookupRule(rule, entity, context);
      default:
        throw new Error(`Unknown rule type: ${rule.type}`);
    }
  }

  async #executeJavaScriptRule(rule, entity, context) {
    // Create safe execution context
    const sandbox = {
      entity,
      context,
      // Safe utility functions
      utils: {
        isEmail: (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str),
        isPhone: (str) => /^[\+]?[1-9][\d]{0,15}$/.test(str),
        isDate: (str) => !isNaN(Date.parse(str)),
        isEmpty: (val) => val === null || val === undefined || val === '',
        length: (val) => val?.length || 0
      }
    };

    try {
      // Execute rule function with sandbox
      const result = rule.function.call(sandbox, entity, context);
      
      return {
        passed: Boolean(result),
        message: result === true ? `Rule ${rule.name} passed` : 
                 typeof result === 'string' ? result : 
                 `Rule ${rule.name} failed`
      };
    } catch (error) {
      throw new Error(`JavaScript rule execution failed: ${error.message}`);
    }
  }

  async #executeExpressionRule(rule, entity, context) {
    // Simple expression evaluation
    const expression = rule.expression;
    const variables = { ...entity, ...context };
    
    try {
      const result = this.#ruleEngine.evaluateExpression(expression, variables);
      
      return {
        passed: Boolean(result),
        message: result ? `Expression rule ${rule.name} passed` : 
                         `Expression rule ${rule.name} failed: ${expression}`
      };
    } catch (error) {
      throw new Error(`Expression evaluation failed: ${error.message}`);
    }
  }

  async #executeRegexRule(rule, entity, context) {
    const fieldValue = this.#getNestedValue(entity, rule.field);
    const regex = new RegExp(rule.pattern, rule.flags || 'i');
    
    const passed = regex.test(String(fieldValue || ''));
    
    return {
      passed,
      message: passed ? 
        `Field ${rule.field} matches pattern` : 
        `Field ${rule.field} does not match required pattern`
    };
  }

  async #executeLookupRule(rule, entity, context) {
    const lookupValue = this.#getNestedValue(entity, rule.field);
    
    // Simulate lookup (in real implementation, this would query a database/API)
    const validValues = rule.lookupTable || [];
    const passed = validValues.includes(lookupValue);
    
    return {
      passed,
      message: passed ? 
        `Field ${rule.field} has valid value` : 
        `Field ${rule.field} contains invalid value: ${lookupValue}`
    };
  }

  async #executeFieldRule(rule, value, context) {
    // Create field-specific entity for rule execution
    const fieldEntity = { [rule.fieldName]: value };
    return await this.#executeRule(rule, fieldEntity, context);
  }

  #updateRuleMetrics(passed, executionTime) {
    this.#metrics.rulesExecuted++;
    
    if (passed) {
      this.#metrics.rulesPassed++;
    } else {
      this.#metrics.rulesFailed++;
    }

    // Update average execution time
    const totalTime = (this.#metrics.averageExecutionTime * (this.#metrics.rulesExecuted - 1)) + executionTime;
    this.#metrics.averageExecutionTime = totalTime / this.#metrics.rulesExecuted;
  }
}

/**
 * Simple expression evaluation engine
 */
class ValidationRuleEngine {
  constructor(options = {}) {
    this.options = options;
  }

  async init() {
    // Initialize expression engine
    return this;
  }

  evaluateExpression(expression, variables) {
    // Simple expression evaluator (in production, use a proper expression parser)
    try {
      // Replace variables in expression
      let evaluableExpression = expression;
      
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        const replacement = typeof value === 'string' ? `"${value}"` : String(value);
        evaluableExpression = evaluableExpression.replace(regex, replacement);
      }

      // Simple evaluation for demo (in production, use a safe parser)
      // This is just for demonstration - in real use, implement proper expression parsing
      return this.#simpleSafeEval(evaluableExpression);
    } catch (error) {
      throw new Error(`Expression evaluation failed: ${error.message}`);
    }
  }

  #simpleSafeEval(expression) {
    // Very basic expression evaluation for demo
    // In production, use a proper expression parser like jexl or similar
    
    // Handle simple comparisons
    if (expression.includes('==')) {
      const [left, right] = expression.split('==').map(s => s.trim());
      return this.#parseValue(left) === this.#parseValue(right);
    }
    
    if (expression.includes('!=')) {
      const [left, right] = expression.split('!=').map(s => s.trim());
      return this.#parseValue(left) !== this.#parseValue(right);
    }
    
    if (expression.includes('>=')) {
      const [left, right] = expression.split('>=').map(s => s.trim());
      return Number(this.#parseValue(left)) >= Number(this.#parseValue(right));
    }
    
    if (expression.includes('<=')) {
      const [left, right] = expression.split('<=').map(s => s.trim());
      return Number(this.#parseValue(left)) <= Number(this.#parseValue(right));
    }
    
    if (expression.includes('>')) {
      const [left, right] = expression.split('>').map(s => s.trim());
      return Number(this.#parseValue(left)) > Number(this.#parseValue(right));
    }
    
    if (expression.includes('<')) {
      const [left, right] = expression.split('<').map(s => s.trim());
      return Number(this.#parseValue(left)) < Number(this.#parseValue(right));
    }
    
    // Default: try to parse as boolean
    return Boolean(this.#parseValue(expression));
  }

  #parseValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (value === 'undefined') return undefined;
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1); // Remove quotes
    }
    if (!isNaN(value)) return Number(value);
    return value;
  }
}
