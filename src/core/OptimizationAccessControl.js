// server/OptimizationAccessControl.js
// Role-based access control for database optimization features

/**
 * @class OptimizationAccessControl
 * @classdesc Manages Role-Based Access Control (RBAC) for database optimization features.
 * It defines roles with specific permissions, manages user-to-role assignments, and handles session-based permission checks.
 * @privateFields {#stateManager, #roles, #userRoles, #sessions, #cacheManager, #forensicLogger, #errorHelpers}
 */
export class OptimizationAccessControl {
	// V8.0 Parity: Mandate 3.1 - All internal properties MUST be private and declared at the top.
	/** @private @type {import('./HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {object} */
	#roles = {};
	/** @private @type {import('../utils/LRUCache.js').LRUCache|null} */
	#userRoles = null;
	/** @private @type {import('../utils/LRUCache.js').LRUCache|null} */
	#sessions = null;
	/** @private @type {import('../managers/CacheManager.js').CacheManager|null} */
	#cacheManager;
	/** @private @type {import('./ForensicLogger.js').default|null} */
	#forensicLogger;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers;

	/**
	 * Creates an instance of OptimizationAccessControl.
	 * @param {object} context - The application context.
	 * @param {import('./HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
		// V8.0 Parity: Mandate 1.2 - Derive dependencies from the stateManager.
		this.#cacheManager = this.#stateManager.managers.cacheManager;
		this.#forensicLogger = this.#stateManager.managers.forensicLogger;
		this.#errorHelpers = this.#stateManager.managers.errorHelpers;

		/**
		 * @property {object} #roles - A map of role definitions, where each role has a set of permissions.
		 */
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
				description: "Analytics and reporting access",
			},
		};
	}

	/**
	 * Initializes the access control system.
	 */
	initialize() {
		// V8.0 Parity: Mandate 4.1 - Replace unbounded map with a bounded LRUCache from the central CacheManager.
		if (!this.#cacheManager) {
			throw new Error(
				"CacheManager is not available. OptimizationAccessControl cannot initialize."
			);
		}
		this.#sessions = this.#cacheManager.getCache("authSessions", {
			max: this.#stateManager.config?.optimization?.maxSessions || 1000,
		});
		this.#userRoles = this.#cacheManager.getCache("userRoles", {
			max: 5000, // Cache roles for up to 5000 users
		});
	}

	/**
	 * Checks if a user has a specific permission by checking all of their assigned roles.
	 * @param {string} userId - The unique identifier of the user.
	 * @param {string} permission - The permission string to check for (e.g., 'optimization:view').
	 * @returns {Promise<boolean>} A promise that resolves to `true` if the user has the permission, `false` otherwise.
	 */
	async hasPermission(userId, permission) {
		return this.#errorHelpers.tryOr(
			async () => {
				const userPermissions = await this.getUserPermissions(userId);
				return userPermissions.includes(permission);
			},
			() => false, // Default to false on error
			{
				component: "OptimizationAccessControl",
				operation: "hasPermission",
				context: { userId, permission },
			}
		);
	}

	/**
	 * Gets a consolidated list of all unique permissions for a user based on their assigned roles.
	 * @param {string} userId - The unique identifier of the user.
	 * @returns {Promise<string[]>} A promise that resolves to an array of all permissions the user has.
	 */
	async getUserPermissions(userId) {
		const userRoles = await this.getUserRoles(userId);

		const permissions = new Set();

		for (const roleName of userRoles) {
			const role = this.#roles[roleName];
			if (role) {
				role.permissions.forEach((perm) => permissions.add(perm));
			}
		}

		return Array.from(permissions);
	}

	/**
	 * Retrieves the roles assigned to a user by querying relationships.
	 * @param {string} userId - The unique identifier of the user.
	 * @returns {Promise<string[]>} A promise that resolves to an array of role names.
	 */
	async getUserRoles(userId) {
		return this.#errorHelpers.tryOr(
			async () => {
				// V8.0 Parity: Mandate 4.1 - Use the bounded cache for user roles.
				const cachedRoles = this.#userRoles.get(userId);
				if (cachedRoles) {
					return cachedRoles;
				}

				const relationships =
					await this.#stateManager.storage.instance.query(
						"relationships",
						"source_id",
						userId
					);

				const roles = relationships
					.filter((rel) => rel.type === "user_has_role")
					.map((rel) => rel.target_id);

				this.#userRoles.set(userId, roles);
				return roles;
			},
			() => [],
			{
				component: "OptimizationAccessControl",
				operation: "getUserRoles",
				context: { userId },
			}
		);
	}

	/**
	 * Assigns a role to a user.
	 * @param {string} userId - The unique identifier of the user.
	 * @param {string} roleName - The name of the role to assign.
	 * @returns {Promise<void>}
	 * @throws {Error} If the specified role does not exist.
	 */
	async assignRole(userId, roleName) {
		return this.#errorHelpers.tryOr(
			async () => {
				if (!this.#roles[roleName]) {
					throw new Error(`Role '${roleName}' does not exist`);
				}

				const relationship = {
					id: this.#stateManager.managers.idManager.generate(),
					source_id: userId,
					target_id: roleName,
					type: "user_has_role",
					created_at: new Date().toISOString(),
				};

				await this.#stateManager.storage.instance.put(
					"relationships",
					relationship
				);

				await this.#forensicLogger?.logAuditEvent(
					"RBAC_ROLE_ASSIGNED",
					{
						userId,
						roleName,
					}
				);

				console.log(`👤 Assigned role '${roleName}' to user ${userId}`);
			},
			null,
			{
				component: "OptimizationAccessControl",
				operation: "assignRole",
				context: { userId, roleName },
			}
		);
	}

	/**
	 * Removes a role from a user.
	 * @param {string} userId - The unique identifier of the user.
	 * @param {string} roleName - The name of the role to remove.
	 * @returns {Promise<void>}
	 */
	async removeRole(userId, roleName) {
		// This would require finding the specific relationship ID and deleting it.
		// This is a simplified example. A real implementation would need a more robust query.
		console.warn(
			`[OptimizationAccessControl] 'removeRole' is a complex operation and is not fully implemented in this example.`
		);
	}

	/**
	 * Creates a new session for a user, storing their roles and consolidated permissions.
	 * @param {string} userId - The unique identifier of the user.
	 * @param {string} sessionId - A unique identifier for the new session.
	 * @returns {Promise<object>} A promise that resolves with the newly created session object.
	 */
	async createSession(userId, sessionId) {
		const permissions = await this.getUserPermissions(userId);
		const roles = await this.getUserRoles(userId);
		const session = {
			userId,
			permissions,
			roles,
			created: new Date(),
			expires: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
			lastActivity: new Date(),
		};

		this.#sessions?.set(sessionId, session);
		return session;
	}

	/**
	 * Validates a session and checks if it grants a specific permission.
	 * @param {string} sessionId - The unique identifier of the session.
	 * @param {string} permission - The permission string to check for.
	 * @returns {{valid: boolean, reason?: string, requiredRoles?: string[], session?: object}} An object indicating if the permission is granted.
	 */
	checkSessionPermission(sessionId, permission) {
		const session = this.#sessions?.get(sessionId);

		if (!session) {
			return { valid: false, reason: "Session not found" };
		}

		if (session.expires < new Date()) {
			this.#sessions?.delete(sessionId);
			return { valid: false, reason: "Session expired" };
		}

		// Update last activity
		session.lastActivity = new Date();

		if (!session.permissions.includes(permission)) {
			return {
				valid: false,
				reason: `Permission '${permission}' denied`,
				requiredRoles: this.getRolesWithPermission(permission),
			};
		}

		return { valid: true, session };
	}

	/**
	 * Gets a list of all role names that include a specific permission.
	 * @param {string} permission - The permission string to search for.
	 * @returns {string[]} An array of role names that grant the permission.
	 */
	getRolesWithPermission(permission) {
		const rolesWithPermission = [];

		for (const [roleName, role] of Object.entries(this.#roles)) {
			if (role.permissions.includes(permission)) {
				rolesWithPermission.push(roleName);
			}
		}

		return rolesWithPermission;
	}

	/**
	 * Cleans up and removes all expired sessions from the session map.
	 * @returns {number} The number of expired sessions that were cleaned up.
	 */
	cleanExpiredSessions() {
		const now = new Date();
		let cleanedCount = 0;

		this.#sessions?.forEach((session, sessionId) => {
			if (session.expires < now) {
				this.#sessions?.delete(sessionId);
				cleanedCount++;
			}
		});

		if (cleanedCount > 0) {
			console.log(`🧹 Cleaned ${cleanedCount} expired sessions`);
		}

		return cleanedCount;
	}

	/**
	 * Retrieves detailed information about a specific session.
	 * @param {string} sessionId - The unique identifier of the session.
	 * @returns {object|null} An object with session details, or `null` if the session is not found.
	 */
	getSessionInfo(sessionId) {
		const session = this.#sessions?.get(sessionId);
		if (!session) return null;

		return {
			userId: session.userId,
			roles: session.roles,
			permissions: session.permissions,
			created: session.created,
			expires: session.expires,
			lastActivity: session.lastActivity,
			timeRemaining: Math.max(0, session.expires.getTime() - Date.now()),
		};
	}

	/**
	 * Extends the expiration time of an active session.
	 * @param {string} sessionId - The unique identifier of the session to extend.
	 * @param {number} [hours=8] - The number of hours to extend the session by.
	 * @returns {boolean} `true` if the session was found and extended, `false` otherwise.
	 */
	extendSession(sessionId, hours = 8) {
		const session = this.#sessions?.get(sessionId);
		if (session) {
			session.expires = new Date(Date.now() + hours * 60 * 60 * 1000);
			session.lastActivity = new Date();
			return true;
		}
		return false;
	}

	/**
	 * Immediately revokes and deletes a session.
	 * @param {string} sessionId - The unique identifier of the session to revoke.
	 * @returns {boolean} `true` if the session was found and deleted, `false` otherwise.
	 */
	revokeSession(sessionId) {
		return this.#sessions?.delete(sessionId);
	}

	/**
	 * Gets a list of all currently active (non-expired) sessions.
	 * @returns {object[]} An array of active session objects.
	 */
	getActiveSessions() {
		const now = new Date();
		const activeSessions = [];

		this.#sessions?.forEach((session, sessionId) => {
			if (session.expires > now) {
				activeSessions.push({
					sessionId,
					userId: session.userId,
					roles: session.roles,
					created: session.created,
					expires: session.expires,
					lastActivity: session.lastActivity,
				});
			}
		});

		return activeSessions;
	}
}

export default OptimizationAccessControl;
