// core/ConditionRegistry.js
// Reusable condition evaluators for event flows and actions

export class ConditionRegistry {
  constructor() {
    this.conditions = new Map();
    this.conditionCache = new Map();
    this.evaluationCount = 0;
    this.cacheHitCount = 0;

    // Register built-in conditions
    this.registerBuiltinConditions();
  }

  /**
   * Register a condition evaluator
   */
  register(conditionType, evaluator, options = {}) {
    const condition = {
      type: conditionType,
      evaluator,
      description: options.description || "",
      cacheable: options.cacheable !== false,
      async: options.async || false,
      schema: options.schema || {},
      examples: options.examples || [],
    };

    this.conditions.set(conditionType, condition);
    return condition;
  }

  /**
   * Evaluate a condition
   */
  async evaluate(conditionDef, context, options = {}) {
    this.evaluationCount++;

    try {
      // Generate cache key if condition is cacheable
      const cacheKey = this.generateCacheKey(conditionDef, context);

      // Check cache first
      if (
        conditionDef.cacheable !== false &&
        this.conditionCache.has(cacheKey)
      ) {
        this.cacheHitCount++;
        return this.conditionCache.get(cacheKey);
      }

      // Get condition evaluator
      const condition = this.conditions.get(conditionDef.type);
      if (!condition) {
        throw new Error(`Unknown condition type: ${conditionDef.type}`);
      }

      // Evaluate condition
      const result = await condition.evaluator(conditionDef, context, options);

      // Cache result if cacheable
      if (condition.cacheable && cacheKey) {
        this.conditionCache.set(cacheKey, result);

        // Set cache expiration if specified
        if (conditionDef.cacheTimeout) {
          setTimeout(() => {
            this.conditionCache.delete(cacheKey);
          }, conditionDef.cacheTimeout);
        }
      }

      return result;
    } catch (error) {
      console.error(
        `Condition evaluation error for ${conditionDef.type}:`,
        error,
      );
      return false; // Default to false on error
    }
  }

  /**
   * Generate cache key for condition
   */
  generateCacheKey(conditionDef, context) {
    if (conditionDef.cacheable === false) return null;

    try {
      // Create a deterministic key from condition definition and relevant context
      const keyData = {
        type: conditionDef.type,
        params: conditionDef.params || conditionDef,
        contextHash: this.hashRelevantContext(conditionDef, context),
      };

      return `condition_${JSON.stringify(keyData)}`.replace(
        /[^a-zA-Z0-9_]/g,
        "_",
      );
    } catch (error) {
      return null; // Don't cache if key generation fails
    }
  }

  /**
   * Hash relevant context for caching
   */
  hashRelevantContext(conditionDef, context) {
    // Extract only the context properties that might affect this condition
    const relevantKeys = conditionDef.contextKeys || [
      "userId",
      "entityType",
      "timestamp",
    ];
    const relevantContext = {};

    for (const key of relevantKeys) {
      if (context[key] !== undefined) {
        relevantContext[key] = context[key];
      }
    }

    return JSON.stringify(relevantContext);
  }

  /**
   * Register built-in condition types
   */
  registerBuiltinConditions() {
    // Simple property comparison
    this.register(
      "property_equals",
      (conditionDef, context) => {
        const property = conditionDef.property;
        const expectedValue = conditionDef.value;
        const actualValue = this.getNestedProperty(context, property);

        return actualValue === expectedValue;
      },
      {
        description: "Compare a property value for equality",
        schema: {
          property: { type: "string", required: true },
          value: { required: true },
        },
        examples: [
          { property: "user.role", value: "admin" },
          { property: "entity.status", value: "active" },
        ],
      },
    );

    // Numeric comparison
    this.register(
      "numeric_comparison",
      (conditionDef, context) => {
        const property = conditionDef.property;
        const operator = conditionDef.operator;
        const value = conditionDef.value;
        const actualValue = this.getNestedProperty(context, property);

        if (typeof actualValue !== "number" || typeof value !== "number") {
          return false;
        }

        switch (operator) {
          case ">":
            return actualValue > value;
          case "<":
            return actualValue < value;
          case ">=":
            return actualValue >= value;
          case "<=":
            return actualValue <= value;
          case "==":
            return actualValue === value;
          case "!=":
            return actualValue !== value;
          default:
            return false;
        }
      },
      {
        description: "Compare numeric values",
        schema: {
          property: { type: "string", required: true },
          operator: {
            type: "string",
            enum: [">", "<", ">=", "<=", "==", "!="],
            required: true,
          },
          value: { type: "number", required: true },
        },
      },
    );

    // Array membership
    this.register(
      "in_array",
      (conditionDef, context) => {
        const property = conditionDef.property;
        const array = conditionDef.array;
        const actualValue = this.getNestedProperty(context, property);

        return Array.isArray(array) && array.includes(actualValue);
      },
      {
        description: "Check if property value is in array",
        schema: {
          property: { type: "string", required: true },
          array: { type: "array", required: true },
        },
      },
    );

    // Regular expression match
    this.register(
      "regex_match",
      (conditionDef, context) => {
        const property = conditionDef.property;
        const pattern = conditionDef.pattern;
        const flags = conditionDef.flags || "";
        const actualValue = this.getNestedProperty(context, property);

        if (typeof actualValue !== "string") return false;

        const regex = new RegExp(pattern, flags);
        return regex.test(actualValue);
      },
      {
        description: "Match property against regular expression",
        schema: {
          property: { type: "string", required: true },
          pattern: { type: "string", required: true },
          flags: { type: "string" },
        },
      },
    );

    // Time-based conditions
    this.register(
      "time_range",
      (conditionDef, context) => {
        const now = Date.now();
        const contextTime = context.timestamp || now;

        if (conditionDef.after && contextTime < conditionDef.after)
          return false;
        if (conditionDef.before && contextTime > conditionDef.before)
          return false;

        return true;
      },
      {
        description: "Check if context timestamp is within time range",
        schema: {
          after: { type: "number" },
          before: { type: "number" },
        },
      },
    );

    // Time of day
    this.register(
      "time_of_day",
      (conditionDef, context) => {
        const now = new Date(context.timestamp || Date.now());
        const hour = now.getHours();
        const minute = now.getMinutes();
        const timeInMinutes = hour * 60 + minute;

        if (conditionDef.after) {
          const [afterHour, afterMinute] = conditionDef.after
            .split(":")
            .map(Number);
          const afterInMinutes = afterHour * 60 + afterMinute;
          if (timeInMinutes < afterInMinutes) return false;
        }

        if (conditionDef.before) {
          const [beforeHour, beforeMinute] = conditionDef.before
            .split(":")
            .map(Number);
          const beforeInMinutes = beforeHour * 60 + beforeMinute;
          if (timeInMinutes > beforeInMinutes) return false;
        }

        return true;
      },
      {
        description: "Check if current time is within specified hours",
        schema: {
          after: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          before: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
        },
        examples: [
          { after: "09:00", before: "17:00" }, // Business hours
          { after: "22:00", before: "06:00" }, // Night hours
        ],
      },
    );

    // User permission check
    this.register(
      "user_permission",
      (conditionDef, context) => {
        const userPermissions =
          context.userPermissions || context.user?.permissions || [];
        const requiredPermissions = conditionDef.permissions || [];
        const requireAll = conditionDef.requireAll !== false;

        if (requireAll) {
          return requiredPermissions.every((perm) =>
            userPermissions.includes(perm),
          );
        } else {
          return requiredPermissions.some((perm) =>
            userPermissions.includes(perm),
          );
        }
      },
      {
        description: "Check if user has required permissions",
        schema: {
          permissions: { type: "array", required: true },
          requireAll: { type: "boolean" },
        },
      },
    );

    // User role check
    this.register(
      "user_role",
      (conditionDef, context) => {
        const userRole = context.userRole || context.user?.role;
        const allowedRoles = conditionDef.roles || [];

        return allowedRoles.includes(userRole);
      },
      {
        description: "Check if user has allowed role",
        schema: {
          roles: { type: "array", required: true },
        },
      },
    );

    // Entity type check
    this.register(
      "entity_type",
      (conditionDef, context) => {
        const entityType = context.entityType || context.entity?.type;
        const allowedTypes = conditionDef.types || [];

        return allowedTypes.includes(entityType);
      },
      {
        description: "Check if entity is of allowed type",
        schema: {
          types: { type: "array", required: true },
        },
      },
    );

    // Rate limiting
    this.register(
      "rate_limit",
      (conditionDef, context) => {
        const key = conditionDef.key || context.userId || "global";
        const limit = conditionDef.limit || 10;
        const window = conditionDef.window || 60000; // 1 minute

        if (!this.rateLimitStore) {
          this.rateLimitStore = new Map();
        }

        const now = Date.now();
        const record = this.rateLimitStore.get(key) || {
          count: 0,
          windowStart: now,
        };

        // Reset window if expired
        if (now - record.windowStart > window) {
          record.count = 0;
          record.windowStart = now;
        }

        record.count++;
        this.rateLimitStore.set(key, record);

        return record.count <= limit;
      },
      {
        description: "Check if action is within rate limit",
        cacheable: false, // Rate limiting should not be cached
        schema: {
          key: { type: "string" },
          limit: { type: "number", required: true },
          window: { type: "number" },
        },
      },
    );

    // Complex condition (AND/OR logic)
    this.register(
      "logical",
      async (conditionDef, context, options) => {
        const operator = conditionDef.operator || "AND";
        const conditions = conditionDef.conditions || [];

        if (operator === "AND") {
          for (const condition of conditions) {
            const result = await this.evaluate(condition, context, options);
            if (!result) return false;
          }
          return true;
        } else if (operator === "OR") {
          for (const condition of conditions) {
            const result = await this.evaluate(condition, context, options);
            if (result) return true;
          }
          return false;
        } else if (operator === "NOT") {
          const condition = conditions[0];
          if (!condition) return true;
          const result = await this.evaluate(condition, context, options);
          return !result;
        }

        return false;
      },
      {
        description: "Combine multiple conditions with logical operators",
        async: true,
        schema: {
          operator: {
            type: "string",
            enum: ["AND", "OR", "NOT"],
            required: true,
          },
          conditions: { type: "array", required: true },
        },
      },
    );

    // Custom JavaScript evaluation (use with caution)
    this.register(
      "javascript",
      (conditionDef, context) => {
        try {
          // Create a safe evaluation context
          const safeContext = {
            context: context,
            Math: Math,
            Date: Date,
            JSON: JSON,
            // Add other safe globals as needed
          };

          // Use Function constructor for evaluation (safer than eval)
          const func = new Function(
            "ctx",
            `
          const { context, Math, Date, JSON } = ctx;
          return (${conditionDef.expression});
        `,
          );

          return func(safeContext);
        } catch (error) {
          console.error("JavaScript condition evaluation error:", error);
          return false;
        }
      },
      {
        description: "Evaluate custom JavaScript expression",
        cacheable: false, // Custom code should not be cached
        schema: {
          expression: { type: "string", required: true },
        },
      },
    );
  }

  /**
   * Get nested property value using dot notation
   */
  getNestedProperty(obj, path) {
    return path.split(".").reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Validate condition definition against schema
   */
  validateCondition(conditionDef) {
    const condition = this.conditions.get(conditionDef.type);
    if (!condition) {
      return {
        valid: false,
        error: `Unknown condition type: ${conditionDef.type}`,
      };
    }

    // Simple schema validation
    const schema = condition.schema;
    const errors = [];

    for (const [property, rules] of Object.entries(schema)) {
      const value = conditionDef[property];

      if (rules.required && value === undefined) {
        errors.push(`Missing required property: ${property}`);
      }

      if (value !== undefined) {
        if (rules.type && typeof value !== rules.type) {
          errors.push(`Property ${property} must be of type ${rules.type}`);
        }

        if (rules.enum && !rules.enum.includes(value)) {
          errors.push(
            `Property ${property} must be one of: ${rules.enum.join(", ")}`,
          );
        }

        if (rules.pattern && typeof value === "string") {
          const regex = new RegExp(rules.pattern);
          if (!regex.test(value)) {
            errors.push(
              `Property ${property} does not match pattern: ${rules.pattern}`,
            );
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
   * Get available condition types with descriptions
   */
  getAvailableConditions() {
    return Array.from(this.conditions.entries()).map(([type, condition]) => ({
      type,
      description: condition.description,
      schema: condition.schema,
      examples: condition.examples,
      async: condition.async,
      cacheable: condition.cacheable,
    }));
  }

  /**
   * Get condition statistics
   */
  getStatistics() {
    return {
      totalConditions: this.conditions.size,
      evaluationCount: this.evaluationCount,
      cacheHitCount: this.cacheHitCount,
      cacheHitRate:
        this.evaluationCount > 0
          ? this.cacheHitCount / this.evaluationCount
          : 0,
      cacheSize: this.conditionCache.size,
    };
  }

  /**
   * Clear condition cache
   */
  clearCache() {
    this.conditionCache.clear();
    if (this.rateLimitStore) {
      this.rateLimitStore.clear();
    }
  }

  /**
   * Remove condition type
   */
  unregister(conditionType) {
    return this.conditions.delete(conditionType);
  }

  /**
   * Create condition evaluator from entity definition
   */
  static fromEntity(entity) {
    if (entity.domain !== "system" || entity.type !== "condition_definition") {
      throw new Error("Invalid entity for condition definition");
    }

    const conditionDef = entity.data;

    // Create evaluator function from definition
    const evaluator = (conditionParams, context, options) => {
      // Implementation would depend on the condition definition format
      // This is a placeholder for entity-driven condition definitions
      return true;
    };

    return {
      type: conditionDef.type,
      evaluator,
      description: conditionDef.description,
      schema: conditionDef.schema,
      cacheable: conditionDef.cacheable,
    };
  }
}

export function evaluateCondition(condition, dataContext, stateManager) {
  const sourceId = condition?.entityId || dataContext?.entityId;
  const entity = sourceId ? stateManager.clientState.entities.get(sourceId) : dataContext;
  const fieldValue = entity?.[condition.field];
  switch (condition.operator || 'equals') {
    case 'equals': return fieldValue === condition.value;
    case 'not_equals': return fieldValue !== condition.value;
    case 'exists': return fieldValue !== undefined && fieldValue !== null;
    case 'contains': return typeof fieldValue === 'string' && fieldValue.includes(condition.value);
    default: return false;
  }
}

// Global condition registry instance
export const conditionRegistry = new ConditionRegistry();

export default ConditionRegistry;