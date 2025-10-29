// modules/enterprise-security.js
// Enterprise security module for organizational access control

/**
 * Enterprise Security Module
 * Loaded for: confidential, secret, enterprise environments
 * Bundle size: ~4KB (role-based access control)
 */
export default class EnterpriseSecurity {
  #context = null;
  #roleCache = new Map();
  #permissionCache = new Map();
  #auditLog = [];
  #orgContext = null;

  constructor(additionalModules = []) {
    console.log('[EnterpriseSecurity] Loaded for enterprise access control');
  }

  async init() {
    console.log('[EnterpriseSecurity] Initialized with role-based access');
    return this;
  }

  async setContext(userId, clearanceLevel, compartments = [], authProof, ttl) {
    this.#context = {
      userId,
      clearanceLevel,
      compartments: new Set(compartments),
      authProof,
      expires: Date.now() + ttl,
      roles: await this.#getUserRoles(userId),
      permissions: await this.#getUserPermissions(userId)
    };

    this.#audit('enterprise_context_set', { 
      userId, 
      clearanceLevel, 
      roleCount: this.#context.roles.length 
    });
    return this;
  }

  async setOrganizationContext(organizationId) {
    this.#orgContext = {
      organizationId,
      policies: await this.#getOrganizationPolicies(organizationId),
      settings: await this.#getOrganizationSettings(organizationId)
    };

    this.#audit('organization_context_set', { organizationId });
    return this;
  }

  async canAccess(classification, compartments = []) {
    if (!this.#context || Date.now() > this.#context.expires) {
      this.#audit('access_denied_expired', { classification });
      return false;
    }

    // 1. Check clearance level
    if (!this.#hasClearance(classification)) {
      this.#audit('access_denied_clearance', { 
        classification,
        userClearance: this.#context.clearanceLevel 
      });
      return false;
    }

    // 2. Check compartments
    if (!this.#hasCompartments(compartments)) {
      this.#audit('access_denied_compartments', { 
        required: compartments,
        user: Array.from(this.#context.compartments)
      });
      return false;
    }

    // 3. Check role-based permissions
    if (!this.#hasRoleAccess(classification, compartments)) {
      this.#audit('access_denied_role', { 
        classification,
        userRoles: this.#context.roles
      });
      return false;
    }

    // 4. Check organization policies
    if (this.#orgContext && !this.#checkOrganizationPolicies(classification)) {
      this.#audit('access_denied_policy', { 
        classification,
        organizationId: this.#orgContext.organizationId
      });
      return false;
    }

    return true;
  }

  async hasPermission(permission) {
    if (!this.#context) return false;

    // Check direct permissions
    if (this.#context.permissions.includes(permission)) {
      return true;
    }

    // Check role-based permissions
    for (const role of this.#context.roles) {
      if (await this.#roleHasPermission(role, permission)) {
        return true;
      }
    }

    return false;
  }

  async canAccessResource(resourceType, resourceId, action = 'read') {
    if (!this.#context) return false;

    const cacheKey = `${resourceType}:${resourceId}:${action}`;
    
    if (this.#permissionCache.has(cacheKey)) {
      const cached = this.#permissionCache.get(cacheKey);
      if (Date.now() < cached.expires) {
        return cached.access;
      }
    }

    // Check resource-specific permissions
    const hasAccess = await this.#checkResourcePermission(resourceType, resourceId, action);
    
    // Cache result for 5 minutes
    this.#permissionCache.set(cacheKey, {
      access: hasAccess,
      expires: Date.now() + 5 * 60 * 1000
    });

    if (!hasAccess) {
      this.#audit('resource_access_denied', { 
        resourceType, 
        resourceId, 
        action,
        userId: this.#context.userId
      });
    }

    return hasAccess;
  }

  hasValidContext() {
    return this.#context && Date.now() < this.#context.expires;
  }

  getAuditLog() {
    return this.#auditLog.slice();
  }

  getUserRoles() {
    return this.#context?.roles || [];
  }

  getUserPermissions() {
    return this.#context?.permissions || [];
  }

  getOrganizationPolicies() {
    return this.#orgContext?.policies || {};
  }

  async clear() {
    this.#audit('enterprise_context_cleared', {});
    this.#context = null;
    this.#orgContext = null;
    this.#roleCache.clear();
    this.#permissionCache.clear();
  }

  // Private methods
  #hasClearance(classification) {
    const levels = [
      'public', 'internal', 'restricted', 'confidential', 'secret', 'top_secret'
    ];
    
    const userLevel = levels.indexOf(this.#context.clearanceLevel);
    const requiredLevel = levels.indexOf(classification);
    
    return userLevel >= requiredLevel;
  }

  #hasCompartments(requiredCompartments) {
    for (const compartment of requiredCompartments) {
      if (!this.#context.compartments.has(compartment)) {
        return false;
      }
    }
    return true;
  }

  #hasRoleAccess(classification, compartments) {
    // Check if any user role allows access to this classification
    for (const role of this.#context.roles) {
      if (this.#roleAllowsAccess(role, classification, compartments)) {
        return true;
      }
    }
    return false;
  }

  #roleAllowsAccess(role, classification, compartments) {
    // Role-based access logic
    const rolePermissions = {
      'admin': ['public', 'internal', 'restricted', 'confidential', 'secret'],
      'manager': ['public', 'internal', 'restricted', 'confidential'],
      'analyst': ['public', 'internal', 'restricted'],
      'viewer': ['public', 'internal'],
      'guest': ['public']
    };

    const allowedLevels = rolePermissions[role] || ['public'];
    return allowedLevels.includes(classification);
  }

  #checkOrganizationPolicies(classification) {
    if (!this.#orgContext?.policies) return true;

    const policies = this.#orgContext.policies;
    
    // Check time-based access restrictions
    if (policies.timeRestrictions) {
      const now = new Date();
      const currentHour = now.getHours();
      
      if (currentHour < policies.timeRestrictions.startHour || 
          currentHour > policies.timeRestrictions.endHour) {
        return false;
      }
    }

    // Check classification-specific policies
    if (policies.classificationLimits?.[classification]) {
      const limits = policies.classificationLimits[classification];
      
      if (limits.requireMFA && !this.#context.authProof?.mfaVerified) {
        return false;
      }
      
      if (limits.maxSessionTime) {
        const sessionAge = Date.now() - this.#context.created;
        if (sessionAge > limits.maxSessionTime) {
          return false;
        }
      }
    }

    return true;
  }

  async #getUserRoles(userId) {
    // In production, this would fetch from database/cache
    // Mock implementation for demo
    const userRoles = {
      'admin-user-001': ['admin', 'manager'],
      'manager-user-001': ['manager', 'analyst'],
      'analyst-user-001': ['analyst'],
      'viewer-user-001': ['viewer']
    };

    return userRoles[userId] || ['viewer'];
  }

  async #getUserPermissions(userId) {
    // Direct permissions beyond role-based
    const userPermissions = {
      'admin-user-001': ['system:admin', 'data:export', 'audit:view'],
      'manager-user-001': ['data:export', 'team:manage'],
      'analyst-user-001': ['data:analyze'],
      'viewer-user-001': []
    };

    return userPermissions[userId] || [];
  }

  async #getOrganizationPolicies(organizationId) {
    // Mock organization policies
    return {
      timeRestrictions: {
        startHour: 6,
        endHour: 22
      },
      classificationLimits: {
        'secret': {
          requireMFA: true,
          maxSessionTime: 4 * 3600000 // 4 hours
        },
        'confidential': {
          requireMFA: false,
          maxSessionTime: 8 * 3600000 // 8 hours
        }
      },
      dataRetention: {
        auditLogRetention: 90 * 24 * 3600000 // 90 days
      }
    };
  }

  async #getOrganizationSettings(organizationId) {
    return {
      enabledFeatures: ['audit', 'encryption', 'mfa'],
      securityLevel: 'high',
      complianceMode: 'enterprise'
    };
  }

  async #roleHasPermission(role, permission) {
    const rolePermissions = {
      'admin': ['system:admin', 'data:export', 'audit:view', 'team:manage', 'data:analyze'],
      'manager': ['data:export', 'team:manage', 'data:analyze'],
      'analyst': ['data:analyze'],
      'viewer': [],
      'guest': []
    };

    return rolePermissions[role]?.includes(permission) || false;
  }

  async #checkResourcePermission(resourceType, resourceId, action) {
    // Resource-specific permission checking
    // This would integrate with your resource management system
    
    const requiredPermission = `${resourceType}:${action}`;
    return await this.hasPermission(requiredPermission);
  }

  #audit(eventType, data) {
    const auditEvent = {
      type: eventType,
      data,
      timestamp: Date.now(),
      userId: this.#context?.userId,
      organizationId: this.#orgContext?.organizationId,
      enterpriseEvent: true
    };

    this.#auditLog.push(auditEvent);

    // Log security violations
    if (eventType.includes('denied')) {
      console.warn(`[Enterprise Security] ${eventType}:`, data);
    }

    // Keep audit log manageable
    if (this.#auditLog.length > 5000) {
      this.#auditLog = this.#auditLog.slice(-2500);
    }
  }
}
