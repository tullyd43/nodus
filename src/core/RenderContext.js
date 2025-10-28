// core/RenderContext.js
// Slimmed-down context provider for BuildingBlockRenderer
// No rendering responsibility - just runtime metadata & dependencies

export class RenderContext {
  constructor(options = {}) {
    // Environment context
    this.viewport = options.viewport || this.getViewportInfo();
    this.theme = options.theme || 'dark';
    this.locale = options.locale || 'en';
    this.inputMethod = options.inputMethod || this.detectInputMethod();
    
    // Runtime dependencies
    this.stateManager = options.stateManager || null;
    this.eventFlow = options.eventFlow || null;
    this.policies = options.policies || {};
    
    // User context
    this.userId = options.userId || null;
    this.userRole = options.userRole || 'guest';
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
   * Create extended context for child components
   */
  extend(additionalContext = {}) {
    return new RenderContext({
      ...this.toObject(),
      ...additionalContext
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
      priority: this.priority
    };
  }

  /**
   * Get current viewport information
   */
  getViewportInfo() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
      orientation: window.screen?.orientation?.type || 'unknown'
    };
  }

  /**
   * Detect input method
   */
  detectInputMethod() {
    // Simple detection - can be enhanced
    if ('ontouchstart' in window) return 'touch';
    if (navigator.maxTouchPoints > 0) return 'touch';
    return 'mouse';
  }

  /**
   * Get device capabilities
   */
  getDeviceCapabilities() {
    return {
      hasTouch: 'ontouchstart' in window,
      hasHover: window.matchMedia('(hover: hover)').matches,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      highContrast: window.matchMedia('(prefers-contrast: high)').matches,
      darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
      connectionType: navigator.connection?.effectiveType || 'unknown',
      memoryLimit: navigator.deviceMemory || null,
      concurrency: navigator.hardwareConcurrency || 1
    };
  }

  /**
   * Validate context for required properties
   */
  validate(requiredProperties = []) {
    const missing = [];
    
    for (const prop of requiredProperties) {
      if (this[prop] === undefined || this[prop] === null) {
        missing.push(prop);
      }
    }
    
    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(permission) {
    return this.userPermissions.includes(permission) || 
           this.userRole === 'super_admin';
  }

  /**
   * Check if user can access domain
   */
  canAccessDomain(domain) {
    // This will integrate with OptimizationAccessControl
    if (this.userRole === 'super_admin') return true;
    
    const rolePermissions = {
      db_admin: ['system', 'ui', 'events'],
      developer: ['ui', 'events'],
      analyst: ['user', 'meta'],
      monitor: ['meta']
    };

    return rolePermissions[this.userRole]?.includes(domain) || false;
  }

  /**
   * Get theme CSS variables
   */
  getThemeVariables() {
    const themes = {
      dark: {
        '--surface': '#1e1e1e',
        '--surface-elevated': '#2d2d2d',
        '--text': '#f5f5f5',
        '--text-muted': '#b0b0b0',
        '--primary': '#007acc',
        '--secondary': '#6c757d',
        '--success': '#28a745',
        '--warning': '#ffc107',
        '--error': '#dc3545',
        '--border': '#404040'
      },
      light: {
        '--surface': '#ffffff',
        '--surface-elevated': '#f8f9fa',
        '--text': '#212529',
        '--text-muted': '#6c757d',
        '--primary': '#007acc',
        '--secondary': '#6c757d',
        '--success': '#28a745',
        '--warning': '#ffc107',
        '--error': '#dc3545',
        '--border': '#dee2e6'
      }
    };

    return themes[this.theme] || themes.dark;
  }

  /**
   * Apply theme to document
   */
  applyTheme() {
    const variables = this.getThemeVariables();
    const root = document.documentElement;
    
    Object.entries(variables).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });
  }

  /**
   * Get adaptive breakpoints
   */
  getBreakpoints() {
    return {
      xs: 0,
      sm: 576,
      md: 768,
      lg: 992,
      xl: 1200,
      xxl: 1400
    };
  }

  /**
   * Get current breakpoint
   */
  getCurrentBreakpoint() {
    const breakpoints = this.getBreakpoints();
    const width = this.containerWidth;
    
    if (width >= breakpoints.xxl) return 'xxl';
    if (width >= breakpoints.xl) return 'xl';
    if (width >= breakpoints.lg) return 'lg';
    if (width >= breakpoints.md) return 'md';
    if (width >= breakpoints.sm) return 'sm';
    return 'xs';
  }

  /**
   * Check if context matches trigger conditions
   */
  matches(trigger) {
    return ContextMatcher.matches(trigger, this);
  }
}

/**
 * Shared context matching utilities
 */
export class ContextMatcher {
  /**
   * Check if context matches trigger conditions
   */
  static matches(trigger, context) {
    if (!trigger) return true;

    // Ensure context is a RenderContext instance
    const ctx = context instanceof RenderContext ? context : new RenderContext(context);

    // Container size matching
    if (trigger.containerWidth) {
      if (trigger.containerWidth.min && ctx.containerWidth < trigger.containerWidth.min) return false;
      if (trigger.containerWidth.max && ctx.containerWidth > trigger.containerWidth.max) return false;
    }

    if (trigger.containerHeight) {
      if (trigger.containerHeight.min && ctx.containerHeight < trigger.containerHeight.min) return false;
      if (trigger.containerHeight.max && ctx.containerHeight > trigger.containerHeight.max) return false;
    }

    // Container area matching
    if (trigger.containerArea) {
      if (trigger.containerArea.min && ctx.containerArea < trigger.containerArea.min) return false;
      if (trigger.containerArea.max && ctx.containerArea > trigger.containerArea.max) return false;
    }

    // Purpose/intent matching
    if (trigger.purpose && ctx.purpose !== trigger.purpose) return false;
    if (trigger.intent && ctx.intent !== trigger.intent) return false;

    // Device capability matching
    if (trigger.hasTouch !== undefined && ctx.device.hasTouch !== trigger.hasTouch) return false;
    if (trigger.hasHover !== undefined && ctx.device.hasHover !== trigger.hasHover) return false;

    // Theme matching
    if (trigger.theme && ctx.theme !== trigger.theme) return false;

    // User role matching
    if (trigger.userRole && ctx.userRole !== trigger.userRole) return false;

    // Permission matching
    if (trigger.permission && !ctx.hasPermission(trigger.permission)) return false;

    // Breakpoint matching
    if (trigger.breakpoint) {
      const currentBreakpoint = ctx.getCurrentBreakpoint();
      if (Array.isArray(trigger.breakpoint)) {
        if (!trigger.breakpoint.includes(currentBreakpoint)) return false;
      } else if (currentBreakpoint !== trigger.breakpoint) {
        return false;
      }
    }

    // Entity type matching
    if (trigger.entityType && ctx.entityType !== trigger.entityType) return false;

    // Custom predicate matching
    if (trigger.predicate && typeof trigger.predicate === 'function') {
      if (!trigger.predicate(ctx)) return false;
    }

    return true;
  }

  /**
   * Find best matching adaptation from component adaptations
   */
  static findBestMatch(adaptations, context) {
    if (!adaptations || typeof adaptations !== 'object') return null;

    let bestMatch = null;
    let bestScore = -1;

    for (const [name, adaptation] of Object.entries(adaptations)) {
      if (this.matches(adaptation.trigger, context)) {
        const score = this.calculateMatchScore(adaptation.trigger, context);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = { name, ...adaptation };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Calculate match score for prioritizing adaptations
   */
  static calculateMatchScore(trigger, context) {
    if (!trigger) return 1; // Default match

    let score = 0;

    // More specific matches get higher scores
    if (trigger.containerWidth) score += 10;
    if (trigger.containerHeight) score += 10;
    if (trigger.containerArea) score += 15;
    if (trigger.purpose) score += 20;
    if (trigger.intent) score += 20;
    if (trigger.entityType) score += 25;
    if (trigger.userRole) score += 15;
    if (trigger.permission) score += 30;
    if (trigger.breakpoint) score += 10;
    if (trigger.theme) score += 5;
    if (trigger.predicate) score += 50; // Custom predicates are highly specific

    return score;
  }
}

export default RenderContext;
