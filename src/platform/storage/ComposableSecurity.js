// core/security/ComposableSecurity.js
// Composable security layer for orchestrating MAC and RBAC.

import { PolicyError } from "@utils/ErrorHelpers.js";

/**
 * @privateFields {#mac, #accessCache, #config, #ready, #stateManager, #metrics, #asyncService, #run}
 * @description
 * Provides a composable, multi-layered security engine for the application.
 * This class integrates Mandatory Access Control (MAC) via the Bell-LaPadula model,
 * Role-Based Access Control (RBAC), and zero-knowledge principles to make fine-grained
 * access decisions. It is designed to be the central authority for all security checks.
 */
export class ComposableSecurity {
	/** @private @type {import("../security/MACEngine.js").MACEngine|null} */
	#mac = null;
	/** @private @type {import("../../utils/LRUCache.js").LRUCache|null} */
	#accessCache = null;
	/** @private @type {object} */
	#config;
	/** @private @type {boolean} */
	#ready = false;
	/** @private @type {import("../HybridStateManager.js").default} */
	#stateManager;
	/** @private @type {import("../../utils/MetricsRegistry.js").MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {ReturnType<import("@shared/lib/async/AsyncOrchestrationService.js").AsyncOrchestrationService["createRunner"]>} */
	#run;
	/** @private @type {import("@shared/lib/async/AsyncOrchestrationService.js").AsyncOrchestrationService|null} */
	#asyncService = null;

	/**
	 * Creates an instance of the ComposableSecurity layer.
	 * @param {object} context - The application context.
	 * @param {import("../HybridStateManager.js").default} context.stateManager - A global state manager for event emission.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager; // Keep a reference to the central state manager.

		this.#config = {
			...stateManager.config,
			auditLevel: stateManager.config.auditLevel || "standard",
			cache: {
				size: stateManager.config.security?.cacheSize || 1000,
				ttl: stateManager.config.security?.cacheTTL || 5 * 60 * 1000, // 5 minutes
			},
		};

		this.#asyncService =
			this.#stateManager?.managers?.asyncOrchestrator ?? null;
		if (!this.#asyncService) {
			throw new Error(
				"ComposableSecurity requires AsyncOrchestrationService manager."
			);
		}

		this.#run = this.#asyncService.createRunner({
			labelPrefix: "security.composable",
			actorId: "security.composable",
			eventType: "SECURITY_COMPOSABLE_OPERATION",
			meta: { component: "ComposableSecurity" },
		});
	}

	/**
	 * Initializes the security layer and starts background tasks like cache cleanup.
	 * @returns {Promise<this>} The initialized security instance.
	 */
	init() {
		return this.#run(
			() => this.#executeInit(),
			{
				labelSuffix: "init",
				eventType: "SECURITY_COMPOSABLE_INIT",
				meta: {
					cacheTtl: this.#config.cache?.ttl ?? null,
					cacheSize: this.#config.cache?.size ?? null,
				},
			}
		);
	}

	/**
	 * The primary access control decision point. It first enforces non-bypassable
	 * Mandatory Access Control (MAC) rules and then evaluates Role-Based Access Control (RBAC) policies.
	 * @param {object} entity - The data entity being accessed.
	 * @param {'read'|'write'|'delete'} action - The action being performed.
	 * @param {object} [context={}] - Additional context, like the store name.
	 * @returns {Promise<boolean>} A promise that resolves to `true` if access is granted.
	 * @throws {Error} If access is denied by either MAC or RBAC checks.
	 */
	checkAccess(entity, action, context = {}) {
		return this.#run(
			() => this.#executeCheckAccess(entity, action, context),
			{
				labelSuffix: "checkAccess",
				eventType: "SECURITY_COMPOSABLE_CHECK_ACCESS",
				meta: {
					action,
					entityId: entity?.id ?? null,
					classification: entity?.classification ?? null,
					contextStore: context?.store ?? null,
				},
			}
		);
	}

	/**
	 * Performs a Role-Based Access Control (RBAC) check to determine if the current user
	 * can access data with a specific classification and set of compartments.
	 * @param {string} classification - The classification level of the data.
	 * @param {string[]} [compartments=[]] - An array of compartments required for access.
	 * @returns {Promise<boolean>} True if access is permitted, false otherwise.
	 */
	canAccess(classification, compartments = []) {
		return this.#run(
			() => this.#executeCanAccess(classification, compartments),
			{
				labelSuffix: "canAccess",
				eventType: "SECURITY_COMPOSABLE_CAN_ACCESS",
				meta: { classification, compartments },
			}
		);
	}

	/**
	 * Checks if the current security context is still valid and has not expired.
	 * @returns {boolean} True if the context is valid.
	 */
	hasValidContext() {
		return (
			this.#stateManager?.managers?.securityManager?.hasValidContext() ??
			false
		);
	}

	/**
	 * Gets the cache hit rate for access control decisions, useful for performance monitoring.
	 * @returns {number} The cache hit rate as a value between 0 and 1.
	 */
	getCacheHitRate() {
		// V8.0 Parity: Delegate to the CacheManager's built-in stats.
		return this.#accessCache?.stats?.hitRate ?? 0;
	}

	/**
	 * Retrieves the most recent security audit events.
	 * @param {number} [limit=10] - The maximum number of events to return.
	 * @returns {Array<object>} An array of audit event objects.
	 */
	getRecentAuditEvents(limit = 10) {
		// V8.0 Parity: Delegate to the ForensicLogger.
		return this.#stateManager?.managers?.forensicLogger?.getAuditTrail({
			limit,
		});
	}

	/**
	 * Clears the current security context and purges the access cache.
	 * @returns {void}
	 */
	clear() {
		this.#accessCache?.clear();
		this.#metrics?.increment("securityCleared");
	}

	/**
	 * Closes the security layer and cleans up resources.
	 */
	close() {
		this.clear();
		this.#ready = false;
	}

	#executeInit() {
		if (this.#ready) {
			return Promise.resolve(this);
		}

		return this.#connectDependencies().then(() => {
			this.#ready = true;
			console.log("[ComposableSecurity] Security layer is ready.");

			const measure =
				this.#stateManager.managers.metricsRegistry?.measure.bind(
					this.#stateManager.managers.metricsRegistry
				);
			if (measure) {
				this.checkAccess = measure("security.checkAccess")(
					this.checkAccess.bind(this)
				);
				this.canAccess = measure("security.canAccess")(
					this.canAccess.bind(this)
				);
			}
			return this;
		});
	}

	#connectDependencies() {
		// V8.0 Parity: Derive dependencies at initialization time.
		this.#metrics =
			this.#stateManager?.metricsRegistry?.namespace("security");
		this.#mac = this.#stateManager?.managers?.securityManager?.mac;

		// V8.0 Parity: Use the centralized CacheManager.
		const cacheManager = this.#stateManager?.managers?.cacheManager;
		if (cacheManager) {
			this.#accessCache = cacheManager.getCache("securityAccess", {
				ttl: this.#config.cache?.ttl,
			});
		}

		return Promise.resolve();
	}

	#executeCheckAccess(entity, action, context) {
		let objectLabel;
		try {
			const subject = this.#mac?.subject();
			objectLabel = this.#mac.label(entity, context);

			if (action === "read") {
				this.#mac.enforceNoReadUp(subject, objectLabel);
			} else {
				this.#mac.enforceNoWriteDown(subject, objectLabel);
			}
		} catch (error) {
			this.#stateManager?.emit("accessDenied", {
				reason: error.message.includes("MAC") ? "MAC" : "RBAC",
				entityId: entity?.id,
				action,
			});
			return Promise.reject(
				new PolicyError("ACCESS_DENIED", {
					cause: error,
					context: { entityId: entity?.id, action },
				})
			);
		}

		const compartments = Array.from(objectLabel.compartments ?? []);
		return this.#executeCanAccess(objectLabel.level, compartments)
			.then((hasRbacAccess) => {
				if (!hasRbacAccess) {
					this.#metrics?.increment("accessDenied");
					console.warn("[ComposableSecurity] RBAC denied access", {
						entityId: entity?.id,
						action,
						classification: objectLabel.level,
					});
					throw new PolicyError("RBAC_DENY");
				}

				this.#stateManager?.emit?.("accessGranted", {
					reason: "MAC+RBAC",
					entityId: entity.id,
					action,
				});
				return true;
			})
			.catch((error) => {
				this.#stateManager?.emit("accessDenied", {
					reason: error.message.includes("MAC") ? "MAC" : "RBAC",
					entityId: entity?.id,
					action,
				});
				if (error instanceof PolicyError) {
					throw error;
				}
				throw new PolicyError("ACCESS_DENIED", {
					cause: error,
					context: { entityId: entity?.id, action },
				});
			});
	}

	#executeCanAccess(classification, compartments) {
		const userContext =
			this.#stateManager?.managers?.securityManager?.getSubject();
		if (!userContext) {
			this.#metrics?.increment("accessDenied");
			console.warn(
				"[ComposableSecurity] Access denied: missing user context",
				{ classification }
			);
			return Promise.resolve(false);
		}

		const cacheKey = `${classification}:${[...compartments]
			.sort()
			.join(",")}`;

		const cachedAccess = this.#accessCache?.get(cacheKey);
		if (cachedAccess !== undefined) {
			return Promise.resolve(cachedAccess);
		}
		this.#metrics?.increment("accessChecks");

		return this.#performAccessCheck(
			userContext,
			classification,
			compartments
		).then((hasAccess) => {
			this.#accessCache?.set(cacheKey, hasAccess);
			if (!hasAccess) {
				this.#metrics?.increment("accessDenied");
				console.warn("[ComposableSecurity] Access denied", {
					classification,
					compartments,
				});
			}
			return hasAccess;
		});
	}

	// ===== PRIVATE ACCESS CONTROL METHODS =====

	/**
	 * The core logic for an RBAC access check, comparing user clearance and compartments against requirements.
	 * @private
	 * @param {string} classification - The required classification level.
	 * @param {string[]} compartments - The required compartments.
	 * @returns {Promise<boolean>} True if access is permitted.
	 */
	#performAccessCheck(userContext, classification, compartments) {
		// V8.0 Parity: Delegate all policy evaluation to the appropriate managers.
		// The `enterprise-security` module already performs these checks.
		const enterpriseSecurity =
			this.#stateManager?.storage?.instance?.security;

		if (
			enterpriseSecurity &&
			typeof enterpriseSecurity.canAccess === "function"
		) {
			return Promise.resolve(
				enterpriseSecurity.canAccess(classification, compartments)
			).then(Boolean);
		}

		return Promise.resolve(
			this.#defaultAccessCheck(
				userContext,
				classification,
				compartments
			)
		);
	}

	/**
	 * Default access check when enterprise security module is not available.
	 * @private
	 * @returns {boolean}
	 */
	#defaultAccessCheck(userContext, classification, compartments) {
		const hasClearance = this.#hasSufficientClearance(
			userContext.level,
			classification
		);
		const hasCompartments = this.#hasRequiredCompartments(
			userContext.compartments,
			compartments
		);
		return hasClearance && hasCompartments;
	}

	/**
	 * Checks if the user's clearance level is greater than or equal to the required level.
	 * @private
	 * @param {string} userClearance - The user's clearance level.
	 * @param {string} requiredClearance - The required clearance level.
	 * @returns {boolean} True if clearance is sufficient.
	 */
	#hasSufficientClearance(userClearance, requiredClearance) {
		const clearanceLevels = [
			"public",
			"internal",
			"restricted",
			"confidential",
			"secret",
			"top_secret",
			"nato_restricted",
			"nato_confidential",
			"nato_secret",
			"cosmic_top_secret",
		];

		const userLevel = clearanceLevels.indexOf(userClearance);
		const requiredLevel = clearanceLevels.indexOf(requiredClearance);

		return userLevel >= requiredLevel;
	}

	/**
	 * Checks if the user's compartments are a superset of the required compartments.
	 * @private
	 * @param {Set<string>} userCompartments - The set of the user's compartments.
	 * @param {string[]} requiredCompartments - An array of required compartments.
	 * @returns {boolean} True if the user has all required compartments.
	 */
	#hasRequiredCompartments(userCompartments, requiredCompartments) {
		for (const required of requiredCompartments) {
			if (!userCompartments.has(required)) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Gets the current security context.
	 * @returns {object|null}
	 */
	get context() {
		return this.#stateManager?.managers?.securityManager?.context ?? null;
	}

	/**
	 * Whether the security layer has completed initialization.
	 * @returns {boolean}
	 */
	get isReady() {
		return this.#ready;
	}
}

export default ComposableSecurity;
