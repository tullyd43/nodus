/**
 * @file ComposableSecurity.js
 * @version 2.0.0 - Enterprise Observability Baseline
 * @description Production-ready composable security layer with comprehensive orchestration,
 * observability, and compliance features. Uses centralized orchestration wrapper for
 * consistent observability and minimal logging noise.
 *
 * ESLint Exception: nodus/require-async-orchestration
 * Justification: Wrapper pattern provides superior observability consistency and
 * centralized policy enforcement compared to per-method orchestrator setup.
 *
 * Security Classification: CONFIDENTIAL
 * License Tier: Enterprise (security operations require license validation)
 * Compliance: MAC-enforced, forensic-audited, polyinstantiation-ready
 *
 * @see {@link NODUS_DEVELOPER_MIGRATION_GUIDE.md} - Orchestrator patterns and observability requirements
 */

/* eslint-disable nodus/require-async-orchestration */

import { PolicyError } from "@shared/lib/ErrorHelpers.js";

/**
 * @class ComposableSecurity
 * @classdesc Enterprise-grade multi-layered security engine with comprehensive observability,
 * MAC enforcement, forensic auditing, and automatic observability. Integrates Mandatory Access
 * Control (MAC) via Bell-LaPadula model, Role-Based Access Control (RBAC), and zero-knowledge
 * principles with full compliance to Nodus mandates.
 *
 * Key Features:
 * - Automatic instrumentation via AsyncOrchestrator for all security operations
 * - Complete audit trails for access control decisions
 * - Performance budget compliance with security timing requirements
 * - Zero-tolerance error handling with proper escalation
 * - Centralized orchestration wrapper for consistent observability
 *
 * @privateFields {#mac, #accessCache, #config, #ready, #stateManager, #metrics, #runner, #asyncService}
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
	#runner;
	/** @private @type {import("@shared/lib/async/AsyncOrchestrationService.js").AsyncOrchestrationService|null} */
	#asyncService = null;
	/** @private @type {import("@platform/observability/ForensicRegistry.js").ForensicRegistry|null} */
	#forensicRegistry = null;

	/**
	 * Creates an instance of the ComposableSecurity layer with enterprise security and observability.
	 * @param {object} context - The application context.
	 * @param {import("../HybridStateManager.js").default} context.stateManager - A global state manager for event emission.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;

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

		this.#runner = this.#asyncService.createRunner({
			labelPrefix: "security.composable",
			actorId: "security.composable",
			eventType: "SECURITY_COMPOSABLE_OPERATION",
			meta: { component: "ComposableSecurity" },
		});
	}

	/**
	 * Centralized orchestration wrapper for this security component.
	 * Ensures all async operations run through the AsyncOrchestrator runner.
	 * @private
	 * @param {string} operationName - Operation identifier for metrics and logging
	 * @param {Function} operation - Async operation to execute
	 * @param {object} [options={}] - Additional orchestrator options
	 * @returns {Promise<any>}
	 */
	async #runOrchestrated(operationName, operation, options = {}) {
		const policies = this.#stateManager?.managers?.policies;
		if (!policies?.getPolicy("async", "enabled")) {
			console.warn(
				"[ComposableSecurity] Async operations disabled by policy",
				{
					operation: operationName,
				}
			);
			return null;
		}

		// Security-specific policy check
		if (!policies?.getPolicy("security", "enabled")) {
			console.warn(
				"[ComposableSecurity] Security operations disabled by policy",
				{
					operation: operationName,
				}
			);
			return null;
		}

		try {
			/* PERFORMANCE_BUDGET: 10ms */
			return await this.#runner(operation, {
				labelSuffix: operationName,
				eventType: `SECURITY_COMPOSABLE_${operationName.toUpperCase()}`,
				classification: "CONFIDENTIAL",
				meta: {
					component: "ComposableSecurity",
					operation: operationName,
					...options.meta,
				},
				timeout: options.timeout || 5000,
				retries: options.retries || 1,
				...options,
			});
		} catch (error) {
			this.#metrics?.increment("orchestration_error");
			console.error(
				`[ComposableSecurity] Orchestration failed for ${operationName}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * Initializes the security layer and starts background tasks like cache cleanup.
	 * @returns {Promise<this>} The initialized security instance.
	 */
	init() {
		return this.#runOrchestrated("init", () => this.#executeInit());
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
		return this.#runOrchestrated(
			"checkAccess",
			() => this.#executeCheckAccess(entity, action, context),
			{
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
		return this.#runOrchestrated(
			"canAccess",
			() => this.#executeCanAccess(classification, compartments),
			{
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
		return this.#accessCache?.stats?.hitRate ?? 0;
	}

	/**
	 * Retrieves the most recent security audit events.
	 * @param {number} [limit=10] - The maximum number of events to return.
	 * @returns {Array<object>} An array of audit event objects.
	 */
	getRecentAuditEvents(limit = 10) {
		return this.#stateManager?.managers?.forensicLogger?.getAuditTrail({
			limit,
		});
	}

	/**
	 * Clears the current security context and purges the access cache.
	 * @returns {void}
	 */
	clear() {
		// Use ForensicRegistry for cache operations to ensure security compliance
		if (this.#forensicRegistry) {
			this.#forensicRegistry.wrapOperation("cache", "clear", () => {
				this.#accessCache?.clear();
			});
		} else {
			this.#accessCache?.clear();
		}
		this.#metrics?.increment("securityCleared");
	}

	/**
	 * Closes the security layer and cleans up resources.
	 */
	close() {
		this.clear();
		this.#ready = false;
	}

	/**
	 * Executes the initialization logic with proper dependency resolution.
	 * @private
	 * @returns {Promise<this>}
	 */
	async #executeInit() {
		if (this.#ready) {
			return this;
		}

		await this.#connectDependencies();
		this.#ready = true;
		console.warn("[ComposableSecurity] Security layer is ready.");

		// Apply performance measurement decorators if available
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
	}

	/**
	 * Connects to required dependencies from the state manager.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #connectDependencies() {
		this.#metrics =
			this.#stateManager?.metricsRegistry?.namespace("security");
		this.#mac = this.#stateManager?.managers?.securityManager?.mac;
		this.#forensicRegistry = this.#stateManager?.managers?.forensicRegistry;

		// Use the centralized CacheManager for bounded caches
		const cacheManager = this.#stateManager?.managers?.cacheManager;
		if (cacheManager) {
			this.#accessCache = cacheManager.getCache("securityAccess", {
				ttl: this.#config.cache?.ttl,
			});
		}

		return Promise.resolve();
	}

	/**
	 * Executes the core access control logic with MAC and RBAC enforcement.
	 * @private
	 * @param {object} entity - The data entity being accessed
	 * @param {string} action - The action being performed
	 * @param {object} context - Additional context
	 * @returns {Promise<boolean>}
	 */
	async #executeCheckAccess(entity, action, context) {
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
			// Use ActionDispatcher for state mutations (access denied events)
			const actionDispatcher =
				this.#stateManager?.managers?.actionDispatcher;
			if (actionDispatcher) {
				await actionDispatcher.dispatch("SECURITY_ACCESS_DENIED", {
					reason: error.message.includes("MAC") ? "MAC" : "RBAC",
					entityId: entity?.id,
					action,
					timestamp: new Date().toISOString(),
				});
			} else {
				this.#stateManager?.emit("accessDenied", {
					reason: error.message.includes("MAC") ? "MAC" : "RBAC",
					entityId: entity?.id,
					action,
				});
			}

			throw new PolicyError("ACCESS_DENIED", {
				cause: error,
				context: { entityId: entity?.id, action },
			});
		}

		const compartments = Array.from(objectLabel.compartments ?? []);
		try {
			const hasRbacAccess = await this.#executeCanAccess(
				objectLabel.level,
				compartments
			);

			if (!hasRbacAccess) {
				this.#metrics?.increment("accessDenied");
				console.warn("[ComposableSecurity] RBAC denied access", {
					entityId: entity?.id,
					action,
					classification: objectLabel.level,
				});
				throw new PolicyError("RBAC_DENY");
			}

			// Use ActionDispatcher for successful access events
			const actionDispatcher =
				this.#stateManager?.managers?.actionDispatcher;
			if (actionDispatcher) {
				await actionDispatcher.dispatch("SECURITY_ACCESS_GRANTED", {
					reason: "MAC+RBAC",
					entityId: entity.id,
					action,
					classification: objectLabel.level,
					compartments,
					timestamp: new Date().toISOString(),
				});
			} else {
				this.#stateManager?.emit?.("accessGranted", {
					reason: "MAC+RBAC",
					entityId: entity.id,
					action,
				});
			}

			return true;
		} catch (error) {
			// Use ActionDispatcher for access denied events
			const actionDispatcher =
				this.#stateManager?.managers?.actionDispatcher;
			if (actionDispatcher) {
				await actionDispatcher.dispatch("SECURITY_ACCESS_DENIED", {
					reason: error.message.includes("MAC") ? "MAC" : "RBAC",
					entityId: entity?.id,
					action,
					timestamp: new Date().toISOString(),
				});
			} else {
				this.#stateManager?.emit("accessDenied", {
					reason: error.message.includes("MAC") ? "MAC" : "RBAC",
					entityId: entity?.id,
					action,
				});
			}

			if (error instanceof PolicyError) {
				throw error;
			}
			throw new PolicyError("ACCESS_DENIED", {
				cause: error,
				context: { entityId: entity?.id, action },
			});
		}
	}

	/**
	 * Executes the RBAC access check with caching and performance optimization.
	 * @private
	 * @param {string} classification - Required classification level
	 * @param {string[]} compartments - Required compartments
	 * @returns {Promise<boolean>}
	 */
	async #executeCanAccess(classification, compartments) {
		const userContext =
			this.#stateManager?.managers?.securityManager?.getSubject();
		if (!userContext) {
			this.#metrics?.increment("accessDenied");
			console.warn(
				"[ComposableSecurity] Access denied: missing user context",
				{
					classification,
				}
			);
			return false;
		}

		const cacheKey = `${classification}:${[...compartments].sort().join(",")}`;

		// Use ForensicRegistry for cache operations to ensure security compliance
		let cachedAccess;
		if (this.#forensicRegistry) {
			cachedAccess = await this.#forensicRegistry.wrapOperation(
				"cache",
				"get",
				() => {
					return this.#accessCache?.get(cacheKey);
				}
			);
		} else {
			cachedAccess = this.#accessCache?.get(cacheKey);
		}

		if (cachedAccess !== undefined) {
			return cachedAccess;
		}

		this.#metrics?.increment("accessChecks");

		const hasAccess = await this.#performAccessCheck(
			userContext,
			classification,
			compartments
		);

		// Use ForensicRegistry for cache operations
		if (this.#forensicRegistry) {
			await this.#forensicRegistry.wrapOperation("cache", "set", () => {
				this.#accessCache?.set(cacheKey, hasAccess);
			});
		} else {
			this.#accessCache?.set(cacheKey, hasAccess);
		}

		if (!hasAccess) {
			this.#metrics?.increment("accessDenied");
			console.warn("[ComposableSecurity] Access denied", {
				classification,
				compartments,
			});
		}

		return hasAccess;
	}

	/**
	 * The core logic for an RBAC access check, comparing user clearance and compartments against requirements.
	 * @private
	 * @param {object} userContext - The user's security context
	 * @param {string} classification - The required classification level
	 * @param {string[]} compartments - The required compartments
	 * @returns {Promise<boolean>} True if access is permitted
	 */
	async #performAccessCheck(userContext, classification, compartments) {
		// Delegate to enterprise security module when available
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

		// Fallback to default access check
		return Promise.resolve(
			this.#defaultAccessCheck(userContext, classification, compartments)
		);
	}

	/**
	 * Default access check when enterprise security module is not available.
	 * @private
	 * @param {object} userContext - The user's security context
	 * @param {string} classification - Required classification level
	 * @param {string[]} compartments - Required compartments
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
	 * @param {string} userClearance - The user's clearance level
	 * @param {string} requiredClearance - The required clearance level
	 * @returns {boolean} True if clearance is sufficient
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
	 * @param {Set<string>} userCompartments - The set of the user's compartments
	 * @param {string[]} requiredCompartments - An array of required compartments
	 * @returns {boolean} True if the user has all required compartments
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
