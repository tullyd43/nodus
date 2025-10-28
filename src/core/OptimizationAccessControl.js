// server/OptimizationAccessControl.js
// Role-based access control for database optimization features

export class OptimizationAccessControl {
  constructor() {
    this.roles = {
      // Super admin - full access
      'super_admin': {
        permissions: [
          'optimization:view',
          'optimization:apply',
          'optimization:rollback',
          'optimization:configure',
          'system:view_sensitive',
          'system:configure',
          'audit:view',
          'audit:export',
          'metrics:view',
          'metrics:export'
        ],
        description: 'Full system access including sensitive operations'
      },

      // Database admin - optimization focused
      'db_admin': {
        permissions: [
          'optimization:view',
          'optimization:apply',
          'optimization:rollback',
          'metrics:view',
          'audit:view'
        ],
        description: 'Database optimization and monitoring access'
      },

      // Developer - read-only with limited actions
      'developer': {
        permissions: [
          'optimization:view',
          'metrics:view'
        ],
        description: 'Read-only access to optimization data'
      },

      // Monitor - metrics and health only
      'monitor': {
        permissions: [
          'metrics:view',
          'health:view'
        ],
        description: 'System monitoring and metrics access'
      },

      // Analyst - export and reporting
      'analyst': {
        permissions: [
          'optimization:view',
          'metrics:view',
          'metrics:export',
          'audit:view',
          'audit:export'
        ],
        description: 'Analytics and reporting access'
      }
    };

    this.userRoles = new Map(); // userId -> Set of roles
    this.sessions = new Map();  // sessionId -> { userId, permissions, expires }
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(userId, permission) {
    const userRoles = this.userRoles.get(userId);
    if (!userRoles) return false;

    for (const roleName of userRoles) {
      const role = this.roles[roleName];
      if (role && role.permissions.includes(permission)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all permissions for a user
   */
  getUserPermissions(userId) {
    const userRoles = this.userRoles.get(userId);
    if (!userRoles) return [];

    const permissions = new Set();
    
    for (const roleName of userRoles) {
      const role = this.roles[roleName];
      if (role) {
        role.permissions.forEach(perm => permissions.add(perm));
      }
    }

    return Array.from(permissions);
  }

  /**
   * Assign role to user
   */
  assignRole(userId, roleName) {
    if (!this.roles[roleName]) {
      throw new Error(`Role '${roleName}' does not exist`);
    }

    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, new Set());
    }

    this.userRoles.get(userId).add(roleName);
    console.log(`👤 Assigned role '${roleName}' to user ${userId}`);
  }

  /**
   * Remove role from user
   */
  removeRole(userId, roleName) {
    const userRoles = this.userRoles.get(userId);
    if (userRoles) {
      userRoles.delete(roleName);
      console.log(`👤 Removed role '${roleName}' from user ${userId}`);
    }
  }

  /**
   * Create session with permissions
   */
  createSession(userId, sessionId) {
    const permissions = this.getUserPermissions(userId);
    const session = {
      userId,
      permissions,
      roles: Array.from(this.userRoles.get(userId) || []),
      created: new Date(),
      expires: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
      lastActivity: new Date()
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Validate session and check permission
   */
  checkSessionPermission(sessionId, permission) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    if (session.expires < new Date()) {
      this.sessions.delete(sessionId);
      return { valid: false, reason: 'Session expired' };
    }

    // Update last activity
    session.lastActivity = new Date();

    if (!session.permissions.includes(permission)) {
      return { 
        valid: false, 
        reason: `Permission '${permission}' denied`,
        requiredRoles: this.getRolesWithPermission(permission)
      };
    }

    return { valid: true, session };
  }

  /**
   * Get roles that have a specific permission
   */
  getRolesWithPermission(permission) {
    const rolesWithPermission = [];
    
    for (const [roleName, role] of Object.entries(this.roles)) {
      if (role.permissions.includes(permission)) {
        rolesWithPermission.push(roleName);
      }
    }

    return rolesWithPermission;
  }

  /**
   * Clean expired sessions
   */
  cleanExpiredSessions() {
    const now = new Date();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions) {
      if (session.expires < now) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned ${cleanedCount} expired sessions`);
    }

    return cleanedCount;
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      userId: session.userId,
      roles: session.roles,
      permissions: session.permissions,
      created: session.created,
      expires: session.expires,
      lastActivity: session.lastActivity,
      timeRemaining: Math.max(0, session.expires.getTime() - Date.now())
    };
  }

  /**
   * Extend session expiry
   */
  extendSession(sessionId, hours = 8) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.expires = new Date(Date.now() + hours * 60 * 60 * 1000);
      session.lastActivity = new Date();
      return true;
    }
    return false;
  }

  /**
   * Revoke session
   */
  revokeSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    const now = new Date();
    const activeSessions = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.expires > now) {
        activeSessions.push({
          sessionId,
          userId: session.userId,
          roles: session.roles,
          created: session.created,
          expires: session.expires,
          lastActivity: session.lastActivity
        });
      }
    }

    return activeSessions;
  }

  /**
   * Audit user action
   */
  auditUserAction(userId, action, resource, result, metadata = {}) {
    const auditLog = {
      timestamp: new Date(),
      userId,
      action,
      resource,
      result, // 'success', 'denied', 'error'
      userRoles: Array.from(this.userRoles.get(userId) || []),
      metadata,
      ip: metadata.ip,
      userAgent: metadata.userAgent
    };

    // In production, store in audit table
    console.log('📋 Audit log:', auditLog);
    
    return auditLog;
  }
}

// Express middleware for access control
export function createAccessControlMiddleware(accessControl) {
  return function accessControlMiddleware(req, res, next) {
    req.accessControl = accessControl;
    
    // Extract session ID from auth header or cookie
    const authHeader = req.headers.authorization;
    const sessionId = authHeader?.replace('Bearer ', '') || req.cookies?.sessionId;
    
    req.sessionId = sessionId;
    
    // Helper function to check permissions
    req.checkPermission = function(permission) {
      if (!sessionId) {
        return { valid: false, reason: 'No session' };
      }
      
      return accessControl.checkSessionPermission(sessionId, permission);
    };

    // Helper function to require permission
    req.requirePermission = function(permission) {
      const check = req.checkPermission(permission);
      
      if (!check.valid) {
        const error = new Error(check.reason || 'Access denied');
        error.statusCode = check.reason?.includes('expired') ? 401 : 403;
        error.requiredRoles = check.requiredRoles;
        throw error;
      }
      
      return check.session;
    };

    next();
  };
}

// Express route handlers
export function createPermissionRoutes(accessControl) {
  return {
    // Get user permissions
    getUserPermissions: (req, res) => {
      try {
        const sessionInfo = accessControl.getSessionInfo(req.sessionId);
        
        if (!sessionInfo) {
          return res.status(401).json({
            success: false,
            error: 'Invalid or expired session'
          });
        }

        res.json({
          success: true,
          permissions: sessionInfo.permissions,
          roles: sessionInfo.roles,
          session: {
            expires: sessionInfo.expires,
            timeRemaining: sessionInfo.timeRemaining
          }
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    },

    // Check specific permission
    checkPermission: (req, res) => {
      try {
        const { permission } = req.params;
        const check = req.checkPermission(permission);

        res.json({
          success: true,
          hasPermission: check.valid,
          reason: check.reason,
          requiredRoles: check.requiredRoles
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    },

    // Extend session
    extendSession: (req, res) => {
      try {
        const { hours = 8 } = req.body;
        const extended = accessControl.extendSession(req.sessionId, hours);

        if (extended) {
          res.json({
            success: true,
            message: `Session extended by ${hours} hours`
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    },

    // Admin: Get all sessions (requires admin permission)
    getAllSessions: (req, res) => {
      try {
        req.requirePermission('system:configure');
        
        const sessions = accessControl.getActiveSessions();
        res.json({
          success: true,
          sessions: sessions,
          count: sessions.length
        });

      } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
          success: false,
          error: error.message,
          requiredRoles: error.requiredRoles
        });
      }
    },

    // Admin: Revoke session
    revokeSession: (req, res) => {
      try {
        req.requirePermission('system:configure');
        
        const { sessionId } = req.params;
        const revoked = accessControl.revokeSession(sessionId);

        res.json({
          success: true,
          revoked: revoked,
          message: revoked ? 'Session revoked' : 'Session not found'
        });

      } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
          success: false,
          error: error.message,
          requiredRoles: error.requiredRoles
        });
      }
    }
  };
}

// Database optimization specific middleware
export function createOptimizationMiddleware(accessControl) {
  return {
    // Require optimization view permission
    requireOptimizationView: (req, res, next) => {
      try {
        req.requirePermission('optimization:view');
        next();
      } catch (error) {
        const statusCode = error.statusCode || 403;
        res.status(statusCode).json({
          success: false,
          error: error.message,
          requiredRoles: error.requiredRoles
        });
      }
    },

    // Require optimization apply permission
    requireOptimizationApply: (req, res, next) => {
      try {
        const session = req.requirePermission('optimization:apply');
        
        // Audit the attempt
        accessControl.auditUserAction(
          session.userId,
          'optimization:apply',
          req.originalUrl,
          'attempted',
          {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            body: req.body
          }
        );
        
        next();
      } catch (error) {
        const statusCode = error.statusCode || 403;
        res.status(statusCode).json({
          success: false,
          error: error.message,
          requiredRoles: error.requiredRoles
        });
      }
    },

    // Require system configuration permission
    requireSystemConfig: (req, res, next) => {
      try {
        req.requirePermission('system:configure');
        next();
      } catch (error) {
        const statusCode = error.statusCode || 403;
        res.status(statusCode).json({
          success: false,
          error: error.message,
          requiredRoles: error.requiredRoles
        });
      }
    }
  };
}

// Initialize default users and roles (for demo/development)
export function initializeDefaultAccess(accessControl) {
  // Create demo users
  accessControl.assignRole('admin_user', 'super_admin');
  accessControl.assignRole('db_admin_user', 'db_admin');
  accessControl.assignRole('dev_user', 'developer');
  accessControl.assignRole('monitor_user', 'monitor');
  accessControl.assignRole('analyst_user', 'analyst');

  console.log('👥 Initialized default access control roles');
  
  // Clean expired sessions every hour
  setInterval(() => {
    accessControl.cleanExpiredSessions();
  }, 60 * 60 * 1000);
}

export default OptimizationAccessControl;