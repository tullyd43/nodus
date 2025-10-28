// core/SystemPolicies.js
// Enhanced with LRUCache to prevent repeated API calls

import { LRUCache } from './utils/LRUCache.js';

/**
 * Default system policies organized by domain
 */
const DEFAULT_POLICIES = {
  system: {
    enable_analytics: true,
    enable_auditing: true,
    enable_optimization: true,
    enable_monitoring: true,
    enable_debug_mode: false,
    enable_maintenance_mode: false,
    auto_backup: true,
    performance_monitoring: true,
    security_logging: true
  },
  
  ui: {
    enable_lazy_loading: true,
    enable_caching: true,
    enable_animations: true,
    enable_tooltips: true,
    enable_notifications: true,
    dark_mode_default: true,
    responsive_design: true,
    accessibility_mode: false,
    high_contrast: false,
    reduced_motion: false
  },
  
  events: {
    enable_event_flows: true,
    enable_event_logging: true,
    enable_event_replay: false,
    enable_async_processing: true,
    enable_event_validation: true,
    event_retention_days: 30,
    max_event_queue_size: 10000,
    enable_event_compression: true
  },
  
  user: {
    enable_user_analytics: true,
    enable_preference_sync: true,
    enable_session_tracking: true,
    enable_usage_metrics: true,
    data_retention_days: 365,
    privacy_mode: false,
    allow_data_export: true,
    require_consent: true
  },
  
  meta: {
    enable_performance_tracking: true,
    enable_error_reporting: true,
    enable_usage_stats: true,
    enable_health_checks: true,
    enable_capacity_planning: true,
    metrics_retention_days: 90,
    detailed_logging: false,
    export_metrics: true
  }
};

/**
 * Policy validation rules
 */
const POLICY_VALIDATORS = {
  // System domain validators
  'system.enable_debug_mode': (value, context) => {
    if (value && context.environment === 'production') {
      return { valid: false, message: 'Debug mode should not be enabled in production' };
    }
    return { valid: true };
  },
  
  'system.enable_maintenance_mode': (value, context) => {
    if (value && !context.hasPermission('system_admin')) {
      return { valid: false, message: 'Insufficient permissions to enable maintenance mode' };
    }
    return { valid: true };
  },

  // Event domain validators
  'events.event_retention_days': (value) => {
    if (typeof value !== 'number' || value < 1 || value > 365) {
      return { valid: false, message: 'Event retention must be between 1 and 365 days' };
    }
    return { valid: true };
  },

  'events.max_event_queue_size': (value) => {
    if (typeof value !== 'number' || value < 100 || value > 100000) {
      return { valid: false, message: 'Event queue size must be between 100 and 100,000' };
    }
    return { valid: true };
  },

  // User domain validators
  'user.data_retention_days': (value) => {
    if (typeof value !== 'number' || value < 30 || value > 2555) { // Max ~7 years
      return { valid: false, message: 'User data retention must be between 30 and 2555 days' };
    }
    return { valid: true };
  },

  // Meta domain validators
  'meta.metrics_retention_days': (value) => {
    if (typeof value !== 'number' || value < 7 || value > 730) { // Max 2 years
      return { valid: false, message: 'Metrics retention must be between 7 and 730 days' };
    }
    return { valid: true };
  }
};

/**
 * Policy dependencies - some policies require others to be enabled
 */
const POLICY_DEPENDENCIES = {
  'system.enable_optimization': ['system.enable_monitoring'],
  'system.enable_debug_mode': ['system.enable_auditing'],
  'events.enable_event_replay': ['events.enable_event_logging'],
  'user.enable_preference_sync': ['user.enable_session_tracking'],
  'meta.enable_capacity_planning': ['meta.enable_performance_tracking']
};

/**
 * SystemPolicies - Enhanced with caching and performance optimization
 */
export class SystemPolicies {
  static policies = null;
  static listeners = new Set();
  static validationEnabled = true;
  static persistenceEnabled = true;
  static environment = 'development';
  
  // Enhanced caching system
  static cache = null;
  static apiEndpoint = '/api/configurations';
  static stateManager = null;
  
  // Performance tracking
  static metrics = {
    cacheHits: 0,
    cacheMisses: 0,
    apiCalls: 0,
    lastSync: null,
    syncDuration: 0
  };

  /**
   * Initialize the policy system with enhanced caching
   */
  static async initialize(config = {}) {
    this.environment = config.environment || 'development';
    this.validationEnabled = config.validationEnabled !== false;
    this.persistenceEnabled = config.persistenceEnabled !== false;
    this.apiEndpoint = config.apiEndpoint || '/api/configurations';
    this.stateManager = config.stateManager || null;

    // Initialize cache with appropriate TTL
    this.cache = new LRUCache(500, {
      ttl: config.cacheTTL || 300000, // 5 minutes default
      enableMetrics: true,
      onEvict: (key, value, reason) => {
        console.log(`Policy cache eviction: ${key} (${reason})`);
      },
      onExpire: (key, value) => {
        console.log(`Policy cache expiration: ${key}`);
        // Optionally trigger background refresh
        this.backgroundRefresh(key);
      }
    });

    try {
      // Load policies with caching
      await this.loadPolicies();
      
      // Validate all policies
      if (this.validationEnabled) {
        await this.validateAllPolicies();
      }

      // Set up background sync if API is available
      if (this.persistenceEnabled && this.apiEndpoint) {
        this.setupBackgroundSync(config.syncInterval || 60000); // 1 minute default
      }

      console.log('SystemPolicies initialized:', {
        environment: this.environment,
        validation: this.validationEnabled,
        persistence: this.persistenceEnabled,
        domains: Object.keys(this.policies),
        cacheEnabled: !!this.cache,
        apiEndpoint: this.apiEndpoint
      });

    } catch (error) {
      console.error('Failed to initialize SystemPolicies:', error);
      // Fall back to defaults
      this.policies = JSON.parse(JSON.stringify(DEFAULT_POLICIES));
    }
  }

  /**
   * Enhanced policy loading with multi-tier caching
   */
  static async loadPolicies() {
    const startTime = performance.now();
    
    try {
      // Tier 1: Memory cache
      const cached = this.getCachedPolicies();
      if (cached) {
        this.policies = cached;
        this.metrics.cacheHits++;
        console.log('Policies loaded from memory cache');
        return;
      }

      // Tier 2: StateManager cache (if available)
      if (this.stateManager) {
        const stateManagerPolicies = this.stateManager.getCachedValue('system_policies');
        if (stateManagerPolicies) {
          this.policies = stateManagerPolicies;
          this.setCachedPolicies(this.policies);
          this.metrics.cacheHits++;
          console.log('Policies loaded from StateManager cache');
          return;
        }
      }

      // Tier 3: Local storage
      if (this.persistenceEnabled) {
        const stored = localStorage.getItem('system_policies');
        if (stored) {
          const parsed = JSON.parse(stored);
          this.policies = this.mergePolicies(DEFAULT_POLICIES, parsed);
          this.setCachedPolicies(this.policies);
          this.metrics.cacheMisses++;
          console.log('Policies loaded from localStorage');
          return;
        }
      }

      // Tier 4: API fetch (if available)
      if (this.apiEndpoint) {
        try {
          const apiPolicies = await this.fetchPoliciesFromAPI();
          this.policies = this.mergePolicies(DEFAULT_POLICIES, apiPolicies);
          this.setCachedPolicies(this.policies);
          await this.savePolicies();
          this.metrics.apiCalls++;
          console.log('Policies loaded from API');
          return;
        } catch (apiError) {
          console.warn('Failed to load policies from API:', apiError);
        }
      }

      // Fallback: Use defaults
      this.policies = JSON.parse(JSON.stringify(DEFAULT_POLICIES));
      this.setCachedPolicies(this.policies);
      await this.savePolicies();
      console.log('Policies initialized with defaults');

    } finally {
      this.metrics.syncDuration = performance.now() - startTime;
      this.metrics.lastSync = new Date().toISOString();
    }
  }

  /**
   * Fetch policies from API
   */
  static async fetchPoliciesFromAPI() {
    const response = await fetch(`${this.apiEndpoint}/system`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Add authentication headers if needed
        ...(this.getAuthHeaders && this.getAuthHeaders())
      }
    });

    if (!response.ok) {
      throw new Error(`API fetch failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.policies || data; // Handle different API response formats
  }

  /**
   * Save policies to API
   */
  static async savePoliciesAPI(policies) {
    if (!this.apiEndpoint) return;

    try {
      const response = await fetch(`${this.apiEndpoint}/system`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(this.getAuthHeaders && this.getAuthHeaders())
        },
        body: JSON.stringify({ policies })
      });

      if (!response.ok) {
        throw new Error(`API save failed: ${response.status} ${response.statusText}`);
      }

      console.log('Policies saved to API successfully');
    } catch (error) {
      console.error('Failed to save policies to API:', error);
      throw error;
    }
  }

  /**
   * Cache management methods
   */
  static getCachedPolicies() {
    if (!this.cache) return null;
    return this.cache.get('system_policies');
  }

  static setCachedPolicies(policies) {
    if (!this.cache) return;
    this.cache.set('system_policies', JSON.parse(JSON.stringify(policies)));
  }

  static invalidateCache() {
    if (this.cache) {
      this.cache.delete('system_policies');
    }
    if (this.stateManager) {
      this.stateManager.clearCachedValue('system_policies');
    }
  }

  /**
   * Background refresh for expired cache entries
   */
  static async backgroundRefresh(key) {
    if (key === 'system_policies') {
      try {
        console.log('Background refresh triggered for policies');
        await this.loadPolicies();
        this.emitPolicyEvent('policies_refreshed', {
          timestamp: new Date().toISOString(),
          trigger: 'background_refresh'
        });
      } catch (error) {
        console.error('Background refresh failed:', error);
      }
    }
  }

  /**
   * Set up background synchronization
   */
  static setupBackgroundSync(interval) {
    setInterval(async () => {
      try {
        // Only sync if we have local changes or cache is stale
        const lastModified = localStorage.getItem('system_policies_modified');
        const cacheAge = this.cache ? this.cache.getAge('system_policies') : Infinity;
        
        if (lastModified || cacheAge > 300000) { // 5 minutes
          await this.loadPolicies();
        }
      } catch (error) {
        console.error('Background sync failed:', error);
      }
    }, interval);
  }

  /**
   * Enhanced save with multi-tier persistence
   */
  static async savePolicies() {
    if (!this.persistenceEnabled || !this.policies) return;

    try {
      // Save to memory cache
      this.setCachedPolicies(this.policies);

      // Save to StateManager if available
      if (this.stateManager) {
        this.stateManager.setCachedValue('system_policies', this.policies);
      }

      // Save to localStorage
      localStorage.setItem('system_policies', JSON.stringify(this.policies));
      localStorage.setItem('system_policies_modified', new Date().toISOString());

      // Save to API (async, don't block)
      if (this.apiEndpoint) {
        this.savePoliciesAPI(this.policies).catch(error => {
          console.error('Background API save failed:', error);
        });
      }
      
      // Emit save event
      this.emitPolicyEvent('policies_saved', {
        timestamp: new Date().toISOString(),
        domains: Object.keys(this.policies)
      });

    } catch (error) {
      console.error('Failed to save policies:', error);
    }
  }

  /**
   * Get all policies (cached)
   */
  static getAllPolicies() {
    // Try cache first
    const cached = this.getCachedPolicies();
    if (cached) {
      this.metrics.cacheHits++;
      return JSON.parse(JSON.stringify(cached));
    }

    // Fallback to loaded policies
    this.metrics.cacheMisses++;
    return this.policies ? JSON.parse(JSON.stringify(this.policies)) : {};
  }

  /**
   * Get policies for specific domain (cached)
   */
  static getDomainPolicies(domain) {
    const cacheKey = `domain_policies_${domain}`;
    
    // Check cache first
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.metrics.cacheHits++;
        return cached;
      }
    }

    // Generate and cache result
    const result = this.policies?.[domain] ? { ...this.policies[domain] } : {};
    
    if (this.cache) {
      this.cache.set(cacheKey, result, 60000); // 1 minute TTL for domain-specific cache
    }
    
    this.metrics.cacheMisses++;
    return result;
  }

  /**
   * Get specific policy value (cached)
   */
  static getPolicy(domain, key) {
    const cacheKey = `policy_${domain}_${key}`;
    
    // Check cache first
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        this.metrics.cacheHits++;
        return cached;
      }
    }

    // Generate and cache result
    const result = this.policies?.[domain]?.[key];
    
    if (this.cache) {
      this.cache.set(cacheKey, result, 30000); // 30 seconds TTL for individual policies
    }
    
    this.metrics.cacheMisses++;
    return result;
  }

  /**
   * Enhanced update with cache invalidation
   */
  static async update(domain, key, value, context = {}) {
    if (!this.policies) {
      throw new Error('Policies not initialized');
    }

    const policyPath = `${domain}.${key}`;
    
    // Validate the update
    if (this.validationEnabled) {
      const validation = this.validatePolicy(policyPath, value, context);
      if (!validation.valid) {
        throw new Error(`Policy validation failed: ${validation.message}`);
      }
    }

    // Check dependencies
    const depCheck = this.checkDependencies(domain, key, value);
    if (!depCheck.valid) {
      throw new Error(`Policy dependency check failed: ${depCheck.message}`);
    }

    // Store old value for rollback
    const oldValue = this.policies[domain]?.[key];

    try {
      // Update the policy
      if (!this.policies[domain]) {
        this.policies[domain] = {};
      }
      this.policies[domain][key] = value;

      // Invalidate related cache entries
      this.invalidatePolicyCache(domain, key);

      // Save to persistent storage
      await this.savePolicies();

      // Emit change event
      this.emitPolicyEvent('policy_updated', {
        domain,
        key,
        oldValue,
        newValue: value,
        timestamp: new Date().toISOString(),
        context
      });

      console.log(`Policy updated: ${policyPath} = ${value}`);

    } catch (error) {
      // Rollback on failure
      if (oldValue !== undefined) {
        this.policies[domain][key] = oldValue;
      } else {
        delete this.policies[domain][key];
      }
      
      // Re-invalidate cache to ensure consistency
      this.invalidatePolicyCache(domain, key);
      
      throw error;
    }
  }

  /**
   * Invalidate cache entries related to a policy change
   */
  static invalidatePolicyCache(domain, key) {
    if (!this.cache) return;

    // Invalidate specific policy cache
    this.cache.delete(`policy_${domain}_${key}`);
    
    // Invalidate domain cache
    this.cache.delete(`domain_policies_${domain}`);
    
    // Invalidate main policies cache
    this.cache.delete('system_policies');
  }

  /**
   * Get cache performance metrics
   */
  static getCacheMetrics() {
    const cacheStats = this.cache ? this.cache.getStatistics() : null;
    
    return {
      ...this.metrics,
      cacheStatistics: cacheStats,
      hitRate: this.metrics.cacheHits + this.metrics.cacheMisses > 0 ? 
        (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100 : 0
    };
  }

  /**
   * Force refresh from API
   */
  static async forceRefresh() {
    console.log('Force refreshing policies from API...');
    
    // Clear all caches
    this.invalidateCache();
    localStorage.removeItem('system_policies');
    localStorage.removeItem('system_policies_modified');
    
    // Reload policies
    await this.loadPolicies();
    
    this.emitPolicyEvent('policies_force_refreshed', {
      timestamp: new Date().toISOString()
    });
  }

  // ... All other existing methods remain the same ...
  // (validatePolicy, checkDependencies, mergePolicies, etc.)

  /**
   * Validate individual policy
   */
  static validatePolicy(policyPath, value, context = {}) {
    const validator = POLICY_VALIDATORS[policyPath];
    if (!validator) {
      return { valid: true }; // No validator = allow
    }

    // Add environment and other context
    const fullContext = {
      environment: this.environment,
      ...context
    };

    return validator(value, fullContext);
  }

  /**
   * Check policy dependencies
   */
  static checkDependencies(domain, key, value) {
    const policyPath = `${domain}.${key}`;
    const dependencies = POLICY_DEPENDENCIES[policyPath];
    
    if (!dependencies || !value) {
      return { valid: true }; // No dependencies or policy being disabled
    }

    // Check if all dependencies are enabled
    for (const depPath of dependencies) {
      const [depDomain, depKey] = depPath.split('.');
      const depValue = this.getPolicy(depDomain, depKey);
      
      if (!depValue) {
        return {
          valid: false,
          message: `Required dependency not enabled: ${depPath}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Get policy dependencies
   */
  static getPolicyDependencies(domain, key) {
    const policyPath = `${domain}.${key}`;
    return POLICY_DEPENDENCIES[policyPath] || [];
  }

  /**
   * Merge policies (for loading from storage)
   */
  static mergePolicies(defaults, stored) {
    const merged = JSON.parse(JSON.stringify(defaults));

    for (const [domain, domainPolicies] of Object.entries(stored)) {
      if (merged[domain]) {
        Object.assign(merged[domain], domainPolicies);
      } else {
        merged[domain] = domainPolicies;
      }
    }

    return merged;
  }

  /**
   * Event system
   */
  static addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  static emitPolicyEvent(type, data) {
    const event = {
      type,
      data,
      timestamp: Date.now()
    };

    // Notify all listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Policy event listener error:', error);
      }
    }

    // Also emit through global event system if available
    if (typeof window !== 'undefined' && window.eventFlowEngine) {
      window.eventFlowEngine.emit('policy_event', event);
    }
  }

  /**
   * Get policy statistics with cache info
   */
  static getStatistics() {
    if (!this.policies) return null;

    const stats = {
      totalDomains: Object.keys(this.policies).length,
      totalPolicies: 0,
      enabledPolicies: 0,
      domainStats: {},
      cacheMetrics: this.getCacheMetrics()
    };

    for (const [domain, domainPolicies] of Object.entries(this.policies)) {
      const domainCount = Object.keys(domainPolicies).length;
      const enabledCount = Object.values(domainPolicies).filter(Boolean).length;
      
      stats.totalPolicies += domainCount;
      stats.enabledPolicies += enabledCount;
      
      stats.domainStats[domain] = {
        total: domainCount,
        enabled: enabledCount,
        disabled: domainCount - enabledCount
      };
    }

    return stats;
  }

  /**
   * Cleanup and destruction
   */
  static destroy() {
    if (this.cache) {
      this.cache.destroy();
      this.cache = null;
    }
    this.listeners.clear();
    this.policies = null;
  }
}

export default SystemPolicies;
