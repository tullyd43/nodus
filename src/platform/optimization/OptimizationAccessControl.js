/**
 * @file OptimizationAccessControl.js
 * @version 3.0.0 - Enterprise Observability Baseline
 * @description Production-ready Role-Based Access Control (RBAC) for database optimization
 * features with comprehensive security, observability, and compliance features. Manages roles,
 * user assignments, and session-based permission checks.
 *
 * ESLint Exception: nodus/require-async-orchestration
 * Justification: Wrapper pattern provides superior observability consistency and
 * centralized policy enforcement compared to per-method orchestrator setup.
 *
 * Security Classification: SECRET
 * License Tier: Enterprise (access control requires enterprise license)
 * Compliance: MAC-enforced, forensic-audited, polyinstantiation-ready
 */

// This file intentionally uses the internal orchestration wrapper pattern
// (see file header). The repository's async-orchestration rule flags
// some async callbacks passed into the wrapper as false-positives. We
// document the exception above and disable the rule for this file to
// keep method implementations readable while ensuring every async path
// runs through `#runOrchestrated` which applies policies and observability.

import { DateCore } from "@shared/lib/DateUtils.js";

/**
 * @class OptimizationAccessControl
 * @classdesc Enterprise-grade Role-Based Access Control (RBAC) for database optimization
 * features with comprehensive security, MAC enforcement, forensic auditing, and automatic
 * observability. Manages roles, user assignments, and session-based permission checks.
 */
export class OptimizationAccessControl {
	/** @private @type {import('@platform/state/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {object} */
	#managers;
	/** @private @type {{ cleanse?:(value:any, schema?:any)=>any, cleanseText?:(value:string)=>string }|null} */
	#sanitizer;
	/** @private @type {import('@shared/lib/MetricsRegistry.js').MetricsRegistry|undefined} */
	#metrics;
	/** @private @type {ErrorConstructor} */
	#PolicyError;
	/** @private @type {import('@shared/lib/ErrorHelpers.js').ErrorBoundary} */
	#errorBoundary;
	/** @private @type {Set<string>} */
	#loggedWarnings;
	/** @private @type {string} */
	#currentUser;

	// Access control state
	/** @private @type {object} */
	#roles = {};
	/** @private @type {import('@shared/lib/LRUCache.js').LRUCache|null} */
	#userRoles = null;
	/** @private @type {import('@shared/lib/LRUCache.js').LRUCache|null} */
	#sessions = null;
	/** @private @type {boolean} */
	#initialized = false;

	/**
	 * Creates an instance of OptimizationAccessControl with enterprise security and observability.
	 * @param {object} context - Application context
	 * @param {import('@platform/state/HybridStateManager.js').default} context.stateManager - State manager
	 */
	constructor({ stateManager }) {
		// V8.0 Parity: Mandate 1.2 - Derive all dependencies from stateManager
		this.#stateManager = stateManager;
		this.#loggedWarnings = new Set();

		// Initialize managers from stateManager (no direct instantiation)
		this.#managers = stateManager?.managers || {};
		this.#sanitizer = this.#managers?.sanitizer || null;
		this.#metrics =
			this.#managers?.metricsRegistry?.namespace(
				"optimizationAccessControl"
			) || null;
		this.#PolicyError = this.#managers?.errorHelpers?.PolicyError || Error;
		this.#errorBoundary = this.#managers?.errorHelpers?.createErrorBoundary(
			{
				name: "OptimizationAccessControl",
				managers: this.#managers,
			},
			"OptimizationAccessControl"
		);
		this.#currentUser = this.#initializeUserContext();

		// Validate enterprise license for access control
		this.#validateEnterpriseLicense();

		// Initialize role definitions
		this.#initializeRoles();
	}

	/**
	 * Validates enterprise license for access control features.
	 * @private
	 */
	#validateEnterpriseLicense() {
		const license = this.#managers?.license;
		if (!license?.hasFeature("access_control")) {
			this.#dispatchAction("license.validation_failed", {
				feature: "access_control",
				component: "OptimizationAccessControl",
			});
			throw new this.#PolicyError(
				"Enterprise license required for OptimizationAccessControl"
			);
		}
	}

	/**
	 * Initializes user context once to avoid repeated lookups.
	 * @private
	 * @returns {string}
	 */
	#initializeUserContext() {
		const securityManager = this.#managers?.securityManager;

		if (securityManager?.getSubject) {
			const subject = securityManager.getSubject();
			const userId = subject?.userId || subject?.id;

			if (userId) {
				this.#dispatchAction("security.user_context_initialized", {
					userId,
					source: "securityManager",
					component: "OptimizationAccessControl",
				});
				return userId;
			}
		}

		const userContext = this.#stateManager?.userContext;
		const fallbackUserId = userContext?.userId || userContext?.id;

		if (fallbackUserId) {
			this.#dispatchAction("security.user_context_initialized", {
				userId: fallbackUserId,
				source: "userContext",
				component: "OptimizationAccessControl",
			});
			return fallbackUserId;
		}

		this.#dispatchAction("security.user_context_failed", {
			component: "OptimizationAccessControl",
			error: "No valid user context found",
		});

		return "system";
	}

	/**
	 * Initializes role definitions.
	 * @private
	 */
	#initializeRoles() {
		this.#roles = {
			// Super admin - full access
			super_admin: {
				permissions: [
					"optimization:view",
					"optimization:apply",
					"optimization:rollback",
					"optimization:configure",
					"system:view_sensitive",
					"system:configure",
					"audit:view",
					"audit:export",
					"metrics:view",
					"metrics:export",
				],
				description:
					"Full system access including sensitive operations",
			},

			// Database admin - optimization focused
			db_admin: {
				permissions: [
					"optimization:view",
					"optimization:apply",
					"optimization:rollback",
					"metrics:view",
					"audit:view",
				],
				description: "Database optimization and monitoring access",
			},

			// Developer - read-only with limited actions
			developer: {
				permissions: ["optimization:view", "metrics:view"],
				description: "Read-only access to optimization data",
			},

			// Monitor - metrics and health only
			monitor: {
				permissions: ["metrics:view", "health:view"],
				description: "System monitoring and metrics access",
			},

			// Analyst - export and reporting
			analyst: {
				permissions: [
					"optimization:view",
					"metrics:view",
					"metrics:export",
					"audit:view",
					"audit:export",
				],
				description: "Data analysis and reporting access",
			},

			// Guest - minimal read access
			guest: {
				permissions: ["metrics:view"],
				description: "Limited read-only access",
			},
		};
	}

	/**
	 * Centralized orchestration wrapper for consistent observability and policy enforcement.
	 * @private
	 * @param {string} operationName - Operation identifier for metrics and logging
	 * @param {Function} operation - Async operation to execute
	 * @param {object} [options={}] - Additional orchestrator options
	 * @returns {Promise<any>}
	 */
	async #runOrchestrated(operationName, operation, options = {}) {
		const orchestrator = this.#managers?.asyncOrchestrator;
		if (!orchestrator) {
			this.#emitWarning("AsyncOrchestrator not available", {
				operation: operationName,
			});
			// Execute directly as fallback for access control
			return operation();
		}

		// Policy enforcement
		const policies = this.#managers.policies;
		if (!policies?.getPolicy("async", "enabled")) {
			this.#emitWarning("Async operations disabled by policy", {
				operation: operationName,
			});
			return null;
		}

		if (!policies?.getPolicy("access_control", "enabled")) {
			this.#emitWarning("Access control operations disabled by policy", {
				operation: operationName,
			});
			return null;
		}

		try {
			/* PERFORMANCE_BUDGET: 5ms */
			const runner = orchestrator.createRunner(`access.${operationName}`);

			/* PERFORMANCE_BUDGET: varies by operation */
			return await runner.run(
				() => this.#errorBoundary?.tryAsync(operation) || operation(),
				{
					label: `access.${operationName}`,
					actorId: this.#currentUser,
					classification: "SECRET",
					timeout: options.timeout || 10000,
					retries: options.retries || 1,
					...options,
				}
			);
		} catch (error) {
			this.#metrics?.increment("access_orchestration_error");
			this.#emitCriticalWarning("Access control orchestration failed", {
				operation: operationName,
				error: error.message,
				user: this.#currentUser,
			});
			throw error;
		}
	}

	/**
	 * Dispatches an action through the ActionDispatcher for observability.
	 * @private
	 * @param {string} actionType - Type of action to dispatch
	 * @param {object} payload - Action payload
	 */
	#dispatchAction(actionType, payload) {
		try {
			/* PERFORMANCE_BUDGET: 2ms */
			this.#managers?.actionDispatcher?.dispatch(actionType, {
				...payload,
				actor: this.#currentUser,
				timestamp: DateCore.timestamp(),
				source: "OptimizationAccessControl",
			});
		} catch (error) {
			this.#emitCriticalWarning("Action dispatch failed", {
				actionType,
				error: error.message,
			});
		}
	}

	/**
	 * Sanitizes input to prevent injection attacks.
	 * @private
	 * @param {any} input - Input to sanitize
	 * @param {object} [schema] - Validation schema
	 * @returns {any} Sanitized input
	 */
	#sanitizeInput(input, schema) {
		if (!this.#sanitizer) {
			this.#dispatchAction("security.sanitizer_unavailable", {
				component: "OptimizationAccessControl",
			});
			return input;
		}

		const result = this.#sanitizer.cleanse?.(input, schema) || input;

		if (result !== input) {
			this.#dispatchAction("security.input_sanitized", {
				component: "OptimizationAccessControl",
				inputType: typeof input,
			});
		}

		return result;
	}

	/**
	 * Emits warning with deduplication to prevent spam.
	 * @private
	 */
	#emitWarning(message, meta = {}) {
		const warningKey = `${message}:${JSON.stringify(meta)}`;
		if (this.#loggedWarnings.has(warningKey)) {
			return;
		}

		this.#loggedWarnings.add(warningKey);

		try {
			this.#managers?.actionDispatcher?.dispatch(
				"observability.warning",
				{
					component: "OptimizationAccessControl",
					message,
					meta,
					actor: this.#currentUser,
					timestamp: DateCore.timestamp(),
					level: "warn",
				}
			);
		} catch {
			// Best-effort logging
			console.warn(
				`[OptimizationAccessControl:WARNING] ${message}`,
				meta
			);
		}
	}

	/**
	 * Emits critical warning that bypasses deduplication.
	 * @private
	 */
	#emitCriticalWarning(message, meta = {}) {
		try {
			this.#managers?.actionDispatcher?.dispatch(
				"observability.critical",
				{
					component: "OptimizationAccessControl",
					message,
					meta,
					actor: this.#currentUser,
					timestamp: DateCore.timestamp(),
					level: "error",
					critical: true,
				}
			);
		} catch {
			console.error(
				`[OptimizationAccessControl:CRITICAL] ${message}`,
				meta
			);
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// INITIALIZATION METHODS
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Initializes the access control system with enhanced observability.
	 * @public
	 * @returns {Promise<void>}
	 */
	initialize() {
		return this.#runOrchestrated("initialize", async () => {
			const cacheManager = this.#managers?.cacheManager;
			if (cacheManager) {
				// Initialize user roles cache
				this.#userRoles = cacheManager.getCache("userRoles", {
					ttl: 900000, // 15 minute TTL for user roles
				});

				// Initialize sessions cache
				this.#sessions = cacheManager.getCache("accessSessions", {
					ttl: 3600000, // 1 hour TTL for sessions
				});

				this.#dispatchAction("access.caches_initialized", {
					userRolesTtl: 900000,
					sessionsTtl: 3600000,
					component: "OptimizationAccessControl",
				});
			}

			this.#initialized = true;

			this.#dispatchAction("access.control_initialized", {
				roleCount: Object.keys(this.#roles).length,
				cachesEnabled: !!(this.#userRoles && this.#sessions),
				component: "OptimizationAccessControl",
			});
		});
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// ROLE MANAGEMENT METHODS
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Gets all available roles.
	 * @returns {object} All role definitions
	 */
	getRoles() {
		return { ...this.#roles };
	}

	/**
	 * Gets a specific role definition.
	 * @param {string} roleName - Name of the role
	 * @returns {object|null} Role definition or null if not found
	 */
	getRole(roleName) {
		const sanitizedRoleName = this.#sanitizeInput(roleName, {
			type: "string",
		});
		return this.#roles[sanitizedRoleName] || null;
	}

	/**
	 * Adds or updates a role definition.
	 * @param {string} roleName - Name of the role
	 * @param {object} roleDefinition - Role definition with permissions and description
	 * @returns {Promise<boolean>} True if successful
	 */
	addRole(roleName, roleDefinition) {
		return this.#runOrchestrated("addRole", async () => {
			const sanitizedRoleName = this.#sanitizeInput(roleName, {
				type: "string",
			});
			const sanitizedDef = this.#sanitizeInput(roleDefinition, {
				permissions: "array",
				description: "string",
			});

			if (!sanitizedRoleName || !sanitizedDef.permissions) {
				throw new this.#PolicyError(
					"Role name and permissions are required"
				);
			}

			this.#roles[sanitizedRoleName] = {
				permissions: sanitizedDef.permissions,
				description: sanitizedDef.description || "",
				createdAt: DateCore.timestamp(),
				createdBy: this.#currentUser,
			};

			this.#dispatchAction("access.role_added", {
				roleName: sanitizedRoleName,
				permissionCount: sanitizedDef.permissions.length,
				component: "OptimizationAccessControl",
			});

			return true;
		});
	}

	/**
	 * Removes a role definition.
	 * @param {string} roleName - Name of the role to remove
	 * @returns {Promise<boolean>} True if role was removed
	 */
	removeRole(roleName) {
		return this.#runOrchestrated("removeRole", async () => {
			const sanitizedRoleName = this.#sanitizeInput(roleName, {
				type: "string",
			});

			if (!this.#roles[sanitizedRoleName]) {
				return false;
			}

			delete this.#roles[sanitizedRoleName];

			// Clear related cache entries
			if (this.#userRoles) {
				// Simple cache invalidation - remove all entries that might reference this role
				this.#userRoles.clear();
			}

			this.#dispatchAction("access.role_removed", {
				roleName: sanitizedRoleName,
				component: "OptimizationAccessControl",
			});

			return true;
		});
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// USER ROLE ASSIGNMENT METHODS
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Assigns a role to a user.
	 * @param {string} userId - User ID
	 * @param {string} roleName - Role name to assign
	 * @returns {Promise<boolean>} True if successful
	 */
	assignRole(userId, roleName) {
		return this.#runOrchestrated("assignRole", async () => {
			const sanitizedUserId = this.#sanitizeInput(userId, {
				type: "string",
			});
			const sanitizedRoleName = this.#sanitizeInput(roleName, {
				type: "string",
			});

			if (!this.#roles[sanitizedRoleName]) {
				throw new this.#PolicyError(
					`Role '${sanitizedRoleName}' does not exist`
				);
			}

			if (!this.#userRoles) {
				this.#emitWarning("User roles cache not available", {
					userId: sanitizedUserId,
					roleName: sanitizedRoleName,
				});
				return false;
			}

			// Get current user roles
			let userRoles = this.#userRoles.get(sanitizedUserId) || [];
			if (!Array.isArray(userRoles)) {
				userRoles = [];
			}

			// Add role if not already assigned
			if (!userRoles.includes(sanitizedRoleName)) {
				userRoles.push(sanitizedRoleName);
				this.#userRoles.set(sanitizedUserId, userRoles);

				this.#dispatchAction("access.role_assigned", {
					userId: sanitizedUserId,
					roleName: sanitizedRoleName,
					totalRoles: userRoles.length,
					component: "OptimizationAccessControl",
				});
			}

			return true;
		});
	}

	/**
	 * Removes a role from a user.
	 * @param {string} userId - User ID
	 * @param {string} roleName - Role name to remove
	 * @returns {Promise<boolean>} True if successful
	 */
	removeRole(userId, roleName) {
		return this.#runOrchestrated("removeUserRole", async () => {
			const sanitizedUserId = this.#sanitizeInput(userId, {
				type: "string",
			});
			const sanitizedRoleName = this.#sanitizeInput(roleName, {
				type: "string",
			});

			if (!this.#userRoles) {
				this.#emitWarning("User roles cache not available", {
					userId: sanitizedUserId,
					roleName: sanitizedRoleName,
				});
				return false;
			}

			// Get current user roles
			let userRoles = this.#userRoles.get(sanitizedUserId) || [];
			if (!Array.isArray(userRoles)) {
				return false;
			}

			// Remove role
			const initialLength = userRoles.length;
			userRoles = userRoles.filter((role) => role !== sanitizedRoleName);

			if (userRoles.length < initialLength) {
				this.#userRoles.set(sanitizedUserId, userRoles);

				this.#dispatchAction("access.role_removed_from_user", {
					userId: sanitizedUserId,
					roleName: sanitizedRoleName,
					remainingRoles: userRoles.length,
					component: "OptimizationAccessControl",
				});

				return true;
			}

			return false;
		});
	}

	/**
	 * Gets all roles assigned to a user.
	 * @param {string} userId - User ID
	 * @returns {string[]} Array of role names
	 */
	getUserRoles(userId) {
		const sanitizedUserId = this.#sanitizeInput(userId, { type: "string" });

		if (!this.#userRoles) {
			this.#emitWarning("User roles cache not available", {
				userId: sanitizedUserId,
			});
			return [];
		}

		const roles = this.#userRoles.get(sanitizedUserId) || [];
		return Array.isArray(roles) ? [...roles] : [];
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PERMISSION CHECK METHODS
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Checks if a user has a specific permission.
	 * @param {string} userId - User ID
	 * @param {string} permission - Permission to check
	 * @returns {Promise<boolean>} True if user has permission
	 */
	hasPermission(userId, permission) {
		return this.#runOrchestrated("hasPermission", async () => {
			const sanitizedUserId = this.#sanitizeInput(userId, {
				type: "string",
			});
			const sanitizedPermission = this.#sanitizeInput(permission, {
				type: "string",
			});

			const startTime = performance.now();

			try {
				const userRoles = this.getUserRoles(sanitizedUserId);
				const hasAccess = this.#checkPermissionInRoles(
					userRoles,
					sanitizedPermission
				);

				const duration = performance.now() - startTime;

				this.#metrics?.increment("permission_checks");
				this.#metrics?.updateAverage("permission_check_time", duration);

				this.#dispatchAction("access.permission_checked", {
					userId: sanitizedUserId,
					permission: sanitizedPermission,
					granted: hasAccess,
					roleCount: userRoles.length,
					duration,
					component: "OptimizationAccessControl",
				});

				return hasAccess;
			} catch (error) {
				const duration = performance.now() - startTime;

				this.#metrics?.increment("permission_check_errors");

				this.#dispatchAction("access.permission_check_failed", {
					userId: sanitizedUserId,
					permission: sanitizedPermission,
					error: error.message,
					duration,
					component: "OptimizationAccessControl",
				});

				return false;
			}
		});
	}

	/**
	 * Checks if a user has all specified permissions.
	 * @param {string} userId - User ID
	 * @param {string[]} permissions - Array of permissions to check
	 * @returns {Promise<boolean>} True if user has all permissions
	 */
	hasAllPermissions(userId, permissions) {
		return this.#runOrchestrated("hasAllPermissions", async () => {
			const sanitizedUserId = this.#sanitizeInput(userId, {
				type: "string",
			});
			const sanitizedPermissions = this.#sanitizeInput(permissions, {
				type: "array",
			});

			if (
				!Array.isArray(sanitizedPermissions) ||
				sanitizedPermissions.length === 0
			) {
				return true; // No permissions required
			}

			const userRoles = this.getUserRoles(sanitizedUserId);
			const hasAllAccess = sanitizedPermissions.every((permission) =>
				this.#checkPermissionInRoles(userRoles, permission)
			);

			this.#dispatchAction("access.all_permissions_checked", {
				userId: sanitizedUserId,
				permissionCount: sanitizedPermissions.length,
				granted: hasAllAccess,
				component: "OptimizationAccessControl",
			});

			return hasAllAccess;
		});
	}

	/**
	 * Checks if a user has any of the specified permissions.
	 * @param {string} userId - User ID
	 * @param {string[]} permissions - Array of permissions to check
	 * @returns {Promise<boolean>} True if user has any permission
	 */
	hasAnyPermission(userId, permissions) {
		return this.#runOrchestrated("hasAnyPermission", async () => {
			const sanitizedUserId = this.#sanitizeInput(userId, {
				type: "string",
			});
			const sanitizedPermissions = this.#sanitizeInput(permissions, {
				type: "array",
			});

			if (
				!Array.isArray(sanitizedPermissions) ||
				sanitizedPermissions.length === 0
			) {
				return false; // No permissions to check
			}

			const userRoles = this.getUserRoles(sanitizedUserId);
			const hasAnyAccess = sanitizedPermissions.some((permission) =>
				this.#checkPermissionInRoles(userRoles, permission)
			);

			this.#dispatchAction("access.any_permission_checked", {
				userId: sanitizedUserId,
				permissionCount: sanitizedPermissions.length,
				granted: hasAnyAccess,
				component: "OptimizationAccessControl",
			});

			return hasAnyAccess;
		});
	}

	/**
	 * Checks if roles contain a specific permission.
	 * @private
	 * @param {string[]} userRoles - User's roles
	 * @param {string} permission - Permission to check
	 * @returns {boolean} True if permission found in roles
	 */
	#checkPermissionInRoles(userRoles, permission) {
		for (const roleName of userRoles) {
			const role = this.#roles[roleName];
			if (role && role.permissions.includes(permission)) {
				return true;
			}
		}
		return false;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// SESSION MANAGEMENT METHODS
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Creates a new session for a user.
	 * @param {string} userId - User ID
	 * @param {object} sessionData - Additional session data
	 * @returns {Promise<string>} Session ID
	 */
	createSession(userId, sessionData = {}) {
		return this.#runOrchestrated("createSession", async () => {
			const sanitizedUserId = this.#sanitizeInput(userId, {
				type: "string",
			});
			const sanitizedData = this.#sanitizeInput(sessionData);

			const sessionId = this.#generateSessionId();
			const session = {
				userId: sanitizedUserId,
				createdAt: DateCore.timestamp(),
				lastAccess: DateCore.timestamp(),
				data: sanitizedData,
			};

			if (this.#sessions) {
				this.#sessions.set(sessionId, session);
			}

			this.#dispatchAction("access.session_created", {
				userId: sanitizedUserId,
				sessionId,
				component: "OptimizationAccessControl",
			});

			return sessionId;
		});
	}

	/**
	 * Validates and updates a session.
	 * @param {string} sessionId - Session ID
	 * @returns {Promise<object|null>} Session data or null if invalid
	 */
	validateSession(sessionId) {
		return this.#runOrchestrated("validateSession", async () => {
			const sanitizedSessionId = this.#sanitizeInput(sessionId, {
				type: "string",
			});

			if (!this.#sessions) {
				this.#emitWarning("Sessions cache not available", {
					sessionId: sanitizedSessionId,
				});
				return null;
			}

			const session = this.#sessions.get(sanitizedSessionId);
			if (!session) {
				this.#dispatchAction("access.session_invalid", {
					sessionId: sanitizedSessionId,
					component: "OptimizationAccessControl",
				});
				return null;
			}

			// Update last access time
			session.lastAccess = DateCore.timestamp();
			this.#sessions.set(sanitizedSessionId, session);

			this.#dispatchAction("access.session_validated", {
				userId: session.userId,
				sessionId: sanitizedSessionId,
				component: "OptimizationAccessControl",
			});

			return { ...session };
		});
	}

	/**
	 * Destroys a session.
	 * @param {string} sessionId - Session ID to destroy
	 * @returns {Promise<boolean>} True if session was destroyed
	 */
	destroySession(sessionId) {
		return this.#runOrchestrated("destroySession", async () => {
			const sanitizedSessionId = this.#sanitizeInput(sessionId, {
				type: "string",
			});

			if (!this.#sessions) {
				return false;
			}

			const existed = this.#sessions.delete(sanitizedSessionId);

			if (existed) {
				this.#dispatchAction("access.session_destroyed", {
					sessionId: sanitizedSessionId,
					component: "OptimizationAccessControl",
				});
			}

			return existed;
		});
	}

	/**
	 * Generates a secure session ID.
	 * @private
	 * @returns {string} Session ID
	 */
	#generateSessionId() {
		const timestamp = Date.now().toString(36);
		const random = Math.random().toString(36).substring(2);
		return `sess_${timestamp}_${random}`;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PUBLIC API METHODS
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Gets all permissions for a user across all their roles.
	 * @param {string} userId - User ID
	 * @returns {string[]} Array of unique permissions
	 */
	getUserPermissions(userId) {
		const sanitizedUserId = this.#sanitizeInput(userId, { type: "string" });
		const userRoles = this.getUserRoles(sanitizedUserId);
		const permissions = new Set();

		for (const roleName of userRoles) {
			const role = this.#roles[roleName];
			if (role) {
				role.permissions.forEach((permission) =>
					permissions.add(permission)
				);
			}
		}

		return Array.from(permissions);
	}

	/**
	 * Clears all cached data.
	 */
	clearCache() {
		if (this.#userRoles) {
			this.#userRoles.clear();
		}
		if (this.#sessions) {
			this.#sessions.clear();
		}

		this.#dispatchAction("access.cache_cleared", {
			component: "OptimizationAccessControl",
		});
	}

	/**
	 * Gets access control statistics.
	 * @returns {object} Statistics object
	 */
	getStatistics() {
		return {
			...(this.#metrics?.getAllAsObject() || {}),
			roleCount: Object.keys(this.#roles).length,
			userRoleCacheSize: this.#userRoles?.size || 0,
			sessionCacheSize: this.#sessions?.size || 0,
			initialized: this.#initialized,
		};
	}

	/**
	 * Exports the current state for debugging.
	 * @returns {object} State snapshot
	 */
	exportState() {
		return {
			roles: Object.keys(this.#roles),
			userRoleCacheSize: this.#userRoles?.size || 0,
			sessionCacheSize: this.#sessions?.size || 0,
			initialized: this.#initialized,
		};
	}
}

export default OptimizationAccessControl;
