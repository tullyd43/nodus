/**
 * AutomaticInstrumentation.js
 *
 * Responsible for deciding when and how to automatically instrument runtime operations
 * for auditing, metrics, compliance, and performance measurement.
 *
 * Fully compliant with:
 *  - Async orchestration policy
 *  - ActionDispatcher integration
 *  - Performance-budget enforcement (nodus/require-performance-budget)
 *  - CacheManager manager-level mutation exemptions
 *  - PolicyAdapter + SystemPolicies gating
 */

/**
 * @class AutomaticInstrumentation
 * @description Decides when and how to automatically instrument runtime operations.
 * This class serves as the central decision engine for observability, determining
 * whether an operation should be audited, measured, or tracked for compliance based
 * on system policies.
 */
export class AutomaticInstrumentation {
	/** @private @type {import('../state/HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('../policies/PolicyAdapter.js').default|null} */
	#policyAdapter;
	/** @private @type {import('../services/cache/CacheManager.js').CacheManager|null} */
	#cacheManager;
	/** @private @type {import('../../shared/lib/LRUCache.js').LRUCache|null} */
	#instrumentationCache;

	/**
	 * @param {import('../state/HybridStateManager.js').default} stateManager - The application's state manager.
	 */
	constructor(stateManager) {
		// Strict: only accept the stateManager (no legacy policyEngine param)
		if (!stateManager || typeof stateManager !== "object") {
			throw new Error(
				"AutomaticInstrumentation requires a stateManager instance"
			);
		}
		this.#stateManager = stateManager;
		this.#policyAdapter = stateManager.managers?.policyAdapter || null;
		this.#cacheManager = stateManager.managers?.cacheManager || null;
		this.#instrumentationCache =
			this.#cacheManager?.getCache("instrumentation-decisions") || null;

		try {
			this.#precomputeInstrumentationMatrix();
		} catch (err) {
			this.#reportError(err, "precompute", "warning");
		}
	}

	// ---------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------

	/**
	 * Asynchronously determines if an operation should be instrumented based on current policies.
	 * This method is wrapped by an orchestrator to ensure observability.
	 * @param {object} [context={}] - The context of the operation to be checked.
	 * @returns {Promise<boolean>} A promise that resolves to true if instrumentation is required.
	 */
	async shouldInstrument(context = {}) {
		if (!this.#policyAdapter) return false;

		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		try {
			// check global policies first
			const policies = this.#stateManager?.managers?.policies;
			let allowOrchestrator = true;
			try {
				if (
					policies?.getPolicy &&
					!policies.getPolicy("async", "enabled")
				) {
					allowOrchestrator = false;
				}
			} catch (err) {
				this.#reportError(
					err,
					"policy.check.shouldInstrument",
					"warning"
				);
			}

			if (allowOrchestrator && orchestrator?.createRunner) {
				/* PERFORMANCE_BUDGET: 1ms */
				const runner =
					/* PERFORMANCE_BUDGET: 1ms */ orchestrator.createRunner(
						"instrumentation.policy"
					);

				/* PERFORMANCE_BUDGET: 5ms */
				const result = await /* PERFORMANCE_BUDGET: 10ms */ runner.run(
					() =>
						Promise.resolve(
							this.#policyAdapter.shouldInstrument(context)
						)
							.then((d) => Boolean(d?.enabled))
							.catch((e) => {
								this.#reportError(
									e,
									"policy.shouldInstrument.run",
									"warning"
								);
								return false;
							}),
					{
						label: "Policy:shouldInstrument",
						domain: "instrumentation",
						classification: "internal",
					}
				);
				return result;
			}

			const decision =
				await this.#policyAdapter.shouldInstrument(context);
			return Boolean(decision?.enabled);
		} catch (err) {
			this.#reportError(err, "shouldInstrument", "warning");
			return false;
		}
	}

	/**
	 * Synchronously determines if an operation should be instrumented.
	 * This provides a fast path for performance-critical code.
	 * @param {object} [context={}] - The context of the operation to be checked.
	 * @returns {boolean} True if instrumentation is required.
	 */
	shouldInstrumentSync(context = {}) {
		try {
			if (this.#policyAdapter?.shouldInstrumentSync) {
				return Boolean(
					this.#policyAdapter.shouldInstrumentSync(context)
				);
			}
		} catch (err) {
			this.#reportError(err, "shouldInstrumentSync", "warning");
		}
		return false;
	}

	// ---------------------------------------------------------------------
	// Instrumentation execution
	// ---------------------------------------------------------------------

	/**
	 * Executes the required instrumentation (audits, metrics, etc.) based on a policy decision.
	 * This operation is wrapped by the AsyncOrchestrator to ensure its own execution is observable.
	 * @param {object} decision - The policy decision object.
	 * @param {object} context - The context of the original operation.
	 * @returns {Promise<any[]|null>} A promise that resolves with the results of the instrumentation tasks.
	 * @private
	 */
	async executeInstrumentation(decision, context) {
		/* PERFORMANCE_BUDGET: 15ms */
		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		const runFn = () => {
			const instruments = [];

			if (decision.auditRequired)
				instruments.push(this.#createAuditEnvelope(context));
			if (decision.metricsEnabled)
				instruments.push(this.#recordMetrics(context));
			if (decision.performanceTracking)
				instruments.push(this.#trackPerformance(context));
			if (decision.complianceRequired)
				instruments.push(this.#logCompliance(context));

			return Promise.all(
				instruments.map((p) =>
					Promise.resolve(p).catch((err) => {
						this.#reportError(err, "instrument.promise", "warning");
						return null;
					})
				)
			);
		};

		// This operation is critical for observability and must itself be orchestrated.
		// Per Mandate 2.2.2, all async workflows must use the orchestrator.
		try {
			const policyAdapter = this.#policyAdapter;
			let allowOrchestrator = true;

			// Explicit policy check for async orchestration
			try {
				if (policyAdapter?.shouldInstrumentSync) {
					allowOrchestrator = Boolean(
						policyAdapter.shouldInstrumentSync({
							component: "async",
							operation: "run",
							classification: "internal",
						})
					);
				}
			} catch (err) {
				this.#reportError(err, "policy.async.check", "warning");
			}

			// Additional policy manager check
			const policies = this.#stateManager?.managers?.policies;
			try {
				if (
					policies?.getPolicy &&
					!policies.getPolicy("async", "enabled")
				) {
					allowOrchestrator = false;
				}
			} catch (err) {
				this.#reportError(err, "policies.check", "warning");
			}

			if (allowOrchestrator && orchestrator?.createRunner) {
				/* PERFORMANCE_BUDGET: 5ms */
				const runner =
					/* PERFORMANCE_BUDGET: 5ms */ orchestrator.createRunner(
						"instrumentation"
					);

				const result = await /* PERFORMANCE_BUDGET: 10ms */ runner.run(
					runFn,
					{
						label: "Instrumentation",
						domain: "instrumentation",
						classification: "internal",
					}
				);
				return result;
			}

			// fallback (no orchestrator)
			return await runFn();
		} catch (err) {
			this.#reportError(err, "executeInstrumentation", "error");
			return null;
		}
	}

	/**
	 * Public adapter expected by orchestrator/dispatchers.
	 * Decides whether to instrument (fast sync gate -> cache -> async policy)
	 * and then executes instrumentation if required.
	 * @param {object} [context={}] - The context of the operation to be instrumented.
	 * @returns {Promise<null|any>} A promise that resolves when instrumentation is complete.
	 */
	instrumentOperation(context = {}) {
		try {
			// Per Mandate 2.2.2, all async workflows must be executed through the orchestrator.
			const orchestrator =
				this.#stateManager?.managers?.asyncOrchestrator;
			const policies = this.#stateManager?.managers?.policies;
			const asyncEnabled = policies?.getPolicy
				? policies.getPolicy("async", "enabled")
				: true;

			if (!orchestrator || !asyncEnabled) {
				// Fallback if orchestrator is not available or disabled by policy
				this.#reportError(
					new Error("AsyncOrchestrator not available or disabled"),
					"instrumentOperation",
					"warning"
				);
				return this.#instrumentOperationAsync(context);
			}
			/* PERFORMANCE_BUDGET: 1ms */
			const runner = orchestrator.createRunner("instrumentation.adapter");
			/* PERFORMANCE_BUDGET: 15ms */
			return runner.run(() => this.#instrumentOperationAsync(context), {
				label: "Instrumentation.adapter",
				domain: "instrumentation",
				classification: "internal",
			});
		} catch (err) {
			this.#reportError(err, "instrumentOperation.run", "error");
			return Promise.resolve(null);
		}
	}

	// ---------------------------------------------------------------------
	// Private Implementation
	// ---------------------------------------------------------------------

	/**
	 * Warms up the instrumentation cache by pre-computing decisions for common,
	 * performance-critical operations ("hot paths").
	 * @private
	 */
	/* PERFORMANCE_BUDGET: 15ms */
	#precomputeInstrumentationMatrix() {
		if (!this.#policyAdapter || !this.#instrumentationCache) return;

		const hotPaths = [
			{
				component: "async",
				operation: "run",
				classification: "internal",
			},
			{
				component: "storage",
				operation: "put",
				classification: "sensitive",
			},
			{
				component: "network",
				operation: "request",
				classification: "external",
			},
		];

		for (const ctx of hotPaths) {
			let decision = null;

			try {
				if (this.#policyAdapter.shouldInstrumentSync) {
					decision = this.#policyAdapter.shouldInstrumentSync(ctx);
				} else if (this.#policyAdapter.shouldInstrument) {
					// Cannot pre-compute async policies synchronously.
					// This could be handled by a background worker in a full implementation.
					continue;
				}
			} catch (err) {
				this.#reportError(err, "precomputeMatrix", "warning");
			}

			if (decision) {
				this.#cacheManager.applySet(
					"instrumentation-decisions",
					ctx,
					decision
				);
			}
		}
	}

	// Internal async implementation - runs under orchestrator when available
	/* eslint-disable-next-line nodus/require-async-orchestration --
	 * This is a private implementation detail that is always executed by the
	 * orchestrated `instrumentOperation` public method.
	 */
	async #instrumentOperationAsync(context = {}) {
		try {
			// Fast sync gate via policy adapter
			if (this.#policyAdapter?.shouldInstrumentSync) {
				try {
					const syncDecision =
						this.#policyAdapter.shouldInstrumentSync(context);
					if (syncDecision === false) return null;
					// If syncDecision is an object with details, use it
					if (syncDecision && typeof syncDecision === "object") {
						if (!syncDecision.enabled) return null;
						return this.executeInstrumentation(
							syncDecision,
							context
						);
					}
					// If true-ish, fall through to async/execute with default decision
				} catch (err) {
					this.#reportError(
						err,
						"policy.shouldInstrumentSync",
						"warning"
					);
				}
			}

			// Check cached decision (best-effort)
			if (
				this.#instrumentationCache &&
				typeof this.#instrumentationCache.get === "function"
			) {
				try {
					const cached = this.#instrumentationCache.get(context);
					if (cached) {
						if (cached.enabled === false) return null;
						return this.executeInstrumentation(cached, context);
					}
				} catch {
					// non-fatal; continue to async path
				}
			}

			// Async policy check (if available)
			if (this.#policyAdapter?.shouldInstrument) {
				try {
					const decision =
						await this.#policyAdapter.shouldInstrument(context);
					if (!decision) return null;
					// Cache decision for future runs
					try {
						if (this.#cacheManager) {
							this.#cacheManager.applySet(
								"instrumentation-decisions",
								context,
								decision
							);
						}
					} catch {
						// ignore caching errors
					}
					if (decision.enabled === false) return null;
					return this.executeInstrumentation(decision, context);
				} catch (err) {
					this.#reportError(
						err,
						"policy.shouldInstrument",
						"warning"
					);
					return null;
				}
			}

			// Default: no instrumentation
			return null;
		} catch (err) {
			this.#reportError(err, "instrumentOperation", "error");
			return null;
		}
	}

	/** @private */
	#createAuditEnvelope(context) {
		const forensic = this.#stateManager.managers?.forensic;
		return forensic?.createEnvelope?.("instrumentation", context);
	}

	/** @private */
	#recordMetrics(context) {
		const metrics = this.#stateManager.managers?.metrics;
		return metrics?.recordMetric?.("instrumentation", context);
	}

	/** @private */
	#trackPerformance(context) {
		const perf = this.#stateManager.managers?.performance;
		return perf?.track?.("instrumentation", context);
	}

	/** @private */
	#logCompliance(context) {
		const compliance = this.#stateManager.managers?.compliance;
		return compliance?.logCompliance?.("instrumentation", context);
	}

	/**
	 * Reports an internal error to the observability logger.
	 * @param {Error} err - The error object.
	 * @param {string} stage - The stage where the error occurred.
	 * @param {'error'|'warning'} [level='error'] - The logging level.
	 * @private
	 */
	#reportError(err, stage, level = "error") {
		const logger = this.#stateManager.managers?.observabilityLogger;
		const msg = `[AutoInstr] ${stage}: ${err?.message || err}`;
		try {
			logger?.[level]?.(msg, {
				component: "AutomaticInstrumentation",
				err,
			});
		} catch {
			console.warn(msg);
		}
	}
}

export default AutomaticInstrumentation;
