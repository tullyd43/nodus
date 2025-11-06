import { PluginSignatureValidator } from "./PluginSignatureValidator.js";

/**
 * @class ForensicRegistry
 * @description Performance-optimized forensic registry with policy-driven audit levels.
 * Implements tunable observability to maintain <5ms overhead guarantees.
 * @implements {IForensicRegistry}
 */
export class ForensicRegistry {
	/** @private @type {Map<string, object>} */
	#plugins = new Map();
	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {string} */
	#auditPolicy = "optimized";
	/** @private @type {number} */
	#sampleRate = 1.0;
	/** @private @type {PluginSignatureValidator} */
	#pluginValidator;
	/** @private @type {object} */
	#logger;

	constructor(stateManager, enterpriseLicense = {}) {
		this.#logger = stateManager.managers?.observabilityLogger || console;
		this.#stateManager = stateManager;
		// Pass the AsyncOrchestrator from the stateManager into the validator so
		// plugin validation runs under orchestration and is observable.
		this.#pluginValidator = new PluginSignatureValidator(
			enterpriseLicense,
			this.#stateManager?.managers?.asyncOrchestrator
		);

		// Configure audit policy from enterprise license
		this.#auditPolicy =
			enterpriseLicense?.features?.auditPolicy || "optimized";
		this.#sampleRate = enterpriseLicense?.features?.sampleRate || 1.0;

		this.#logger.log(
			`[ForensicRegistry] Initialized with policy: ${this.#auditPolicy}`
		);
	}

	/**
	 * Registers a forensic plugin with signature validation.
	 * @param {string} domain - The domain name
	 * @param {object} plugin - The plugin instance
	 * @param {string} [signature=null] - The plugin's cryptographic signature
	 */
	register(domain, plugin, signature = null) {
		const run = () =>
			this.#pluginValidator
				.validatePlugin(plugin, signature)
				.then((isValid) => {
					if (!isValid) {
						throw new Error(
							`[ForensicRegistry] Plugin validation failed for ${domain}`
						);
					}

					this.#plugins.set(domain, plugin);
					this.#logger.log(
						`[ForensicRegistry] Registered signed ${domain} plugin`
					);
					return true;
				});

		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		// Check async policy before using orchestrator
		let allowOrchestrator = true;
		try {
			const policies = this.#stateManager?.managers?.policies;
			if (policies?.getPolicy && !policies.getPolicy("async", "enabled"))
				allowOrchestrator = false;
		} catch (pErr) {
			this.#stateManager?.managers?.errorHelpers?.handleError?.(pErr, {
				component: "ForensicRegistry",
				operation: "register.policy",
				severity: "warning",
			});
		}

		if (allowOrchestrator && orchestrator?.run) {
			/* PERFORMANCE_BUDGET: 10ms */
			return orchestrator.run(run, {
				component: "ForensicRegistry",
				operation: "register",
			});
		}

		return run();
	}

	/**
	 * Policy-driven operation wrapper with performance optimization.
	 * @param {string} domain - The domain (storage, security, etc.)
	 * @param {string} operation - The operation name
	 * @param {Function} fn - The function to wrap
	 * @param {object} [context={}] - Additional context for logging
	 * @returns {Promise<any>} The wrapped operation result
	 */
	wrapOperation(domain, operation, fn, context = {}) {
		// Policy-driven performance optimization
		if (!this.#shouldAudit(domain, operation)) {
			return fn(); // Skip auditing for performance
		}

		const plugin = this.#plugins.get(domain);
		if (!plugin) {
			console.warn(`[ForensicRegistry] No plugin for domain: ${domain}`);
			return fn();
		}

		const run = () => {
			const startTime = performance.now();
			return Promise.resolve()
				.then(() => plugin.wrapOperation(operation, fn, context))
				.then((result) => {
					const duration = performance.now() - startTime;
					if (duration > 5) {
						console.warn(
							`[ForensicRegistry] Slow operation: ${domain}.${operation} took ${duration}ms`
						);
					}
					return result;
				});
		};

		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		// Check async policy before using orchestrator
		let allowOrchestrator2 = true;
		try {
			const policies = this.#stateManager?.managers?.policies;
			if (policies?.getPolicy && !policies.getPolicy("async", "enabled"))
				allowOrchestrator2 = false;
		} catch (pErr) {
			this.#stateManager?.managers?.errorHelpers?.handleError?.(pErr, {
				component: "ForensicRegistry",
				operation: "wrapOperation.policy",
				severity: "warning",
			});
		}

		if (allowOrchestrator2 && orchestrator?.run) {
			/* PERFORMANCE_BUDGET: 5ms */
			return orchestrator.run(run, {
				component: "ForensicRegistry",
				operation: `wrap:${domain}.${operation}`,
			});
		}

		return run();
	}

	/**
	 * Determines if an operation should be audited based on policy.
	 * @private
	 * @param {string} domain - The domain
	 * @param {string} operation - The operation name
	 * @returns {boolean} Whether to audit
	 */
	#shouldAudit(domain, operation) {
		switch (this.#auditPolicy) {
			case "full":
				return Math.random() <= this.#sampleRate;
			case "critical": {
				const writeOps = [
					"put",
					"delete",
					"canWrite",
					"grant",
					"revoke",
				];
				return (
					writeOps.includes(operation) &&
					Math.random() <= this.#sampleRate
				);
			}
			case "optimized": {
				const criticalOps = ["put", "delete", "canWrite"];
				if (criticalOps.includes(operation)) {
					return Math.random() <= this.#sampleRate;
				}
				// Sample read operations at lower rate
				return Math.random() <= this.#sampleRate * 0.1;
			}
			case "minimal": {
				const essentialOps = ["delete", "grant", "revoke"];
				return (
					essentialOps.includes(operation) &&
					Math.random() <= this.#sampleRate
				);
			}
			case "none":
				return false;
			default:
				return true;
		}
	}

	/**
	 * Updates audit policy at runtime (enterprise feature).
	 * @param {string} policy - New audit policy
	 * @param {number} [sampleRate=1.0] - New sample rate
	 */
	updateAuditPolicy(policy, sampleRate = 1.0) {
		this.#auditPolicy = policy;
		this.#sampleRate = sampleRate;
		this.#logger.log(
			`[ForensicRegistry] Audit policy updated: ${policy} (${sampleRate})`
		);
	}
}
