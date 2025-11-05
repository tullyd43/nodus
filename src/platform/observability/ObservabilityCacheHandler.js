// ObservabilityCacheHandler.js
// Minimal action handlers for observability cache operations.
// These handlers run cache mutations under the AsyncOrchestrator runner
// so operations are audited and observable per repository rules.

export const ObservabilityCacheHandler = {
	"observability.cache.set": async (payload, { stateManager }) => {
		/* @performance-budget: <10ms -- single cache set via orchestrator */
		const orchestrator = stateManager?.managers?.asyncOrchestrator;
		const cacheManager = stateManager?.managers?.cacheManager;
		// Policy guard: avoid performing cache mutations when cache policy disabled
		const policies = stateManager?.managers?.policies;
		try {
			if (
				policies?.getPolicy &&
				!policies.getPolicy("cache", "enabled")
			) {
				return null;
			}
		} catch (err) {
			stateManager?.managers?.errorHelpers?.handleError?.(err, {
				component: "ObservabilityCacheHandler",
				operation: "policy.check",
				severity: "warning",
			});
		}

		const run = () => {
			try {
				// Use manager-level helper so the linter and observability rules
				// recognize this as an approved, instrumented mutation.
				cacheManager?.applySet?.(
					payload.cache,
					payload.key,
					payload.value
				);
			} catch (err) {
				stateManager?.managers?.errorHelpers?.handleError?.(err, {
					component: "ObservabilityCacheHandler",
					operation: "cache.set",
					severity: "warning",
				});
			}
		};

		// Check async policy before creating a runner
		let allowOrchestrator = true;
		try {
			if (policies?.getPolicy && !policies.getPolicy("async", "enabled"))
				allowOrchestrator = false;
		} catch (err) {
			stateManager?.managers?.errorHelpers?.handleError?.(err, {
				component: "ObservabilityCacheHandler",
				operation: "policies.check",
				severity: "warning",
			});
		}

		if (allowOrchestrator && orchestrator?.createRunner) {
			const runner =
				/* PERFORMANCE_BUDGET: 5ms */ orchestrator.createRunner(
					"observability.cache.set"
				);
			return /* PERFORMANCE_BUDGET: 20ms */ runner.run(run, {
				label: "observability.cache.set",
				domain: "observability",
			});
		}

		return Promise.resolve().then(run);
	},

	"observability.cache.delete": async (payload, { stateManager }) => {
		/* @performance-budget: <10ms -- single cache delete via orchestrator */
		const orchestrator = stateManager?.managers?.asyncOrchestrator;
		const cacheManager = stateManager?.managers?.cacheManager;
		// Policy guard: avoid performing cache mutations when cache policy disabled
		const policies = stateManager?.managers?.policies;
		try {
			if (
				policies?.getPolicy &&
				!policies.getPolicy("cache", "enabled")
			) {
				return null;
			}
		} catch (err) {
			stateManager?.managers?.errorHelpers?.handleError?.(err, {
				component: "ObservabilityCacheHandler",
				operation: "policy.check",
				severity: "warning",
			});
		}

		const run = () => {
			try {
				cacheManager?.applyDelete?.(payload.cache, payload.key);
			} catch (err) {
				stateManager?.managers?.errorHelpers?.handleError?.(err, {
					component: "ObservabilityCacheHandler",
					operation: "cache.delete",
					severity: "warning",
				});
			}
		};

		// Check async policy before creating a runner
		let allowOrchestrator = true;
		try {
			if (policies?.getPolicy && !policies.getPolicy("async", "enabled"))
				allowOrchestrator = false;
		} catch (err) {
			stateManager?.managers?.errorHelpers?.handleError?.(err, {
				component: "ObservabilityCacheHandler",
				operation: "policies.check",
				severity: "warning",
			});
		}

		if (allowOrchestrator && orchestrator?.createRunner) {
			const runner =
				/* PERFORMANCE_BUDGET: 5ms */ orchestrator.createRunner(
					"observability.cache.delete"
				);
			return /* PERFORMANCE_BUDGET: 20ms */ runner.run(run, {
				label: "observability.cache.delete",
				domain: "observability",
			});
		}

		return Promise.resolve().then(run);
	},

	"metrics.set": async (payload, { stateManager }) => {
		/* @performance-budget: <5ms -- single metric set via orchestrator */
		const orchestrator = stateManager?.managers?.asyncOrchestrator;
		const metricsRegistry =
			stateManager?.metricsRegistry ||
			stateManager?.managers?.metricsRegistry;
		const policies = stateManager?.managers?.policies;

		// Fast sync policy guard: skip recording metrics if disabled by policy
		try {
			if (
				policies?.getPolicy &&
				!policies.getPolicy("metrics", "enabled")
			) {
				return null;
			}
		} catch (err) {
			stateManager?.managers?.errorHelpers?.handleError?.(err, {
				component: "ObservabilityCacheHandler",
				operation: "metrics.policy.check",
				severity: "warning",
			});
		}

		const run = () => {
			try {
				// Write gauge metric using the MetricsRegistry instance.
				// This is an internal, instrumented mutation allowed inside an action handler.
				metricsRegistry?.set(payload.key, payload.value);
			} catch (err) {
				stateManager?.managers?.errorHelpers?.handleError?.(err, {
					component: "ObservabilityCacheHandler",
					operation: "metrics.set",
					severity: "warning",
				});
			}
		};

		// Check async policy before using the orchestrator
		let allowOrchestrator = true;
		try {
			if (policies?.getPolicy && !policies.getPolicy("async", "enabled"))
				allowOrchestrator = false;
		} catch (err) {
			stateManager?.managers?.errorHelpers?.handleError?.(err, {
				component: "ObservabilityCacheHandler",
				operation: "policies.check",
				severity: "warning",
			});
		}

		if (allowOrchestrator && orchestrator?.createRunner) {
			const runner =
				/* PERFORMANCE_BUDGET: 5ms */ orchestrator.createRunner(
					"metrics.set"
				);
			return /* PERFORMANCE_BUDGET: 20ms */ runner.run(run, {
				label: "metrics.set",
				domain: "observability",
			});
		}

		return Promise.resolve().then(run);
	},
};
