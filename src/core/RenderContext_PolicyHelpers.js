// core/RenderContext.js
// Enhanced with policy access helpers

export class RenderContext {
  constructor(options = {}) {
    // ... existing constructor code ...

    // Environment context
    this.viewport = options.viewport || this.getViewportInfo();
    this.theme = options.theme || "dark";
    this.locale = options.locale || "en";
    this.inputMethod = options.inputMethod || this.detectInputMethod();

    // Runtime dependencies
    this.stateManager = options.stateManager || null;
    this.eventFlow = options.eventFlow || null;
    this.policies = options.policies || {};

    // User context
    this.userId = options.userId || null;
    this.userRole = options.userRole || "guest";
    this.userPermissions = options.userPermissions || [];

    // Device capabilities
    this.device = this.getDeviceCapabilities();
    this.networkLatency = options.networkLatency || null;

    // Component context (for current render)
    this.componentId = options.componentId || null;
    this.data = options.data || {};
    this.config = options.config || {};

    // Container context
    this.containerWidth = options.containerWidth || window.innerWidth;
    this.containerHeight = options.containerHeight || window.innerHeight;
    this.containerArea = this.containerWidth * this.containerHeight;

    // Adaptive context
    this.intent = options.intent || null;
    this.purpose = options.purpose || null;
    this.entityType = options.entityType || null;
    this.entityId = options.entityId || null;
    this.entity = options.entity || null;

    // Render metadata
    this.adaptationName = options.adaptationName || null;
    this.timestamp = Date.now();
    this.priority = options.priority || 0;
  }

  /**
   * Helper: Get policy value with safe nested access
   * Avoids deep lookups in every block
   */
  getPolicy(domain, key, defaultValue = undefined) {
    try {
      const domainPolicies = this.policies[domain];
      if (!domainPolicies || typeof domainPolicies !== "object") {
        return defaultValue;
      }

      const value = domainPolicies[key];
      return value !== undefined ? value : defaultValue;
    } catch (error) {
      console.warn(`Policy access error for ${domain}.${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Helper: Check if policy is enabled (boolean policies)
   */
  isPolicyEnabled(domain, key) {
    return !!this.getPolicy(domain, key, false);
  }

  /**
   * Helper: Get policy with type validation
   */
  getPolicyTyped(domain, key, expectedType, defaultValue = undefined) {
    const value = this.getPolicy(domain, key, defaultValue);

    if (value !== undefined && typeof value !== expectedType) {
      console.warn(
        `Policy ${domain}.${key} expected ${expectedType}, got ${typeof value}`,
      );
      return defaultValue;
    }

    return value;
  }

  /**
   * Helper: Get numeric policy with bounds checking
   */
  getNumericPolicy(domain, key, min = null, max = null, defaultValue = 0) {
    const value = this.getPolicyTyped(domain, key, "number", defaultValue);

    if (min !== null && value < min) return min;
    if (max !== null && value > max) return max;

    return value;
  }

  /**
   * Helper: Get all policies for a domain
   */
  getDomainPolicies(domain) {
    return this.policies[domain] ? { ...this.policies[domain] } : {};
  }

  /**
   * Helper: Check if domain has any policies configured
   */
  hasDomainPolicies(domain) {
    const domainPolicies = this.policies[domain];
    return domainPolicies && Object.keys(domainPolicies).length > 0;
  }

  // ... rest of existing methods remain the same ...

  /**
   * Create extended context for child components
   */
  extend(additionalContext = {}) {
    return new RenderContext({
      ...this.toObject(),
      ...additionalContext,
    });
  }

  /**
   * Convert to plain object for serialization/caching
   */
  toObject() {
    return {
      viewport: this.viewport,
      theme: this.theme,
      locale: this.locale,
      inputMethod: this.inputMethod,
      stateManager: this.stateManager,
      eventFlow: this.eventFlow,
      policies: this.policies,
      userId: this.userId,
      userRole: this.userRole,
      userPermissions: this.userPermissions,
      device: this.device,
      networkLatency: this.networkLatency,
      componentId: this.componentId,
      data: this.data,
      config: this.config,
      containerWidth: this.containerWidth,
      containerHeight: this.containerHeight,
      containerArea: this.containerArea,
      intent: this.intent,
      purpose: this.purpose,
      entityType: this.entityType,
      entityId: this.entityId,
      entity: this.entity,
      adaptationName: this.adaptationName,
      timestamp: this.timestamp,
      priority: this.priority,
    };
  }

  // ... rest of existing methods (getViewportInfo, detectInputMethod, etc.) ...
}

// ... ContextMatcher class remains the same ...

export default RenderContext;
