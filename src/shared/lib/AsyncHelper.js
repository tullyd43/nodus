/**
 * @file AsyncHelper.js
 * @description Legacy async helper utilities bridged onto AsyncOrchestrator with plugin instrumentation.
 */

import { AsyncOrchestrator } from "./async/AsyncOrchestrator.js";
import { MetricsPlugin } from "./async/plugins/MetricsPlugin.js";
import { ForensicPlugin } from "./async/plugins/ForensicPlugin.js";
import { StateEventsPlugin } from "./async/plugins/StateEventsPlugin.js";

/**
 * @template T
 * @typedef {object} AsyncHelperInstance
 * @property {() => Promise<T|undefined>} load Executes the loader function.
 * @property {() => Promise<T|undefined>} retry Executes the loader with automatic retries on failure.
 * @property {() => void} dispose Aborts any in-progress load and cleans up.
 * @property {(callback: (state: string) => void) => () => void} onStateChange Subscribes to state changes.
 * @property {() => 'idle'|'loading'|'ready'|'error'|'disposed'} getState Retrieves the current state.
 * @property {() => boolean} isLoading Indicates whether the helper is loading.
 */

const orchestratorCache = new WeakMap();

/**
 * Generates a helper identifier for logging.
 * @param {string} [prefix]
 * @returns {string}
 */
function createHelperId(prefix = "AsyncHelper") {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
		return `${prefix}-${crypto.randomUUID()}`;
	return `${prefix}-${Date.now()}-${Math.random()
		.toString(16)
		.slice(2, 8)}`;
}

/**
 * Resolves a metrics registry namespace for async instrumentation.
 * @param {object} context
 * @param {import("../platform/state/HybridStateManager.js").default} [stateManager]
 * @returns {{ increment?:(name:string, value?:number)=>void, updateAverage?:(name:string, value:number)=>void }|null}
 */
function resolveMetricsRegistry(context, stateManager) {
	const explicit = context.metricsRegistry;
	if (explicit) return explicit;

	const candidate =
		stateManager?.metricsRegistry ||
		stateManager?.managers?.metricsRegistry ||
		null;
	if (!candidate) return null;
	if (typeof candidate.namespace === "function") {
		try {
			const ns = candidate.namespace("async");
			if (ns) return ns;
		} catch {
			/* namespace best-effort */
		}
	}
	return candidate;
}

/**
 * Resolves or creates an orchestrator configured for the provided context.
 * @param {object} context
 * @returns {AsyncOrchestrator}
 */
function resolveOrchestrator(context = {}) {
	if (context.asyncOrchestrator instanceof AsyncOrchestrator) {
		return context.asyncOrchestrator;
	}

	const candidate = context.asyncOrchestrator;
	if (
		candidate &&
		typeof candidate.getOrchestrator === "function" &&
		candidate.getOrchestrator() instanceof AsyncOrchestrator
	) {
		return candidate.getOrchestrator();
	}

	const stateManager = context.stateManager;
	const service = stateManager?.managers?.asyncOrchestrator;
	if (service?.getOrchestrator) {
		return service.getOrchestrator();
	}

	if (stateManager) {
		const cached = orchestratorCache.get(stateManager);
		if (cached) return cached;

		const orchestrator = new AsyncOrchestrator({
			logger: stateManager?.managers?.logger || console,
		});
		orchestrator.registerPlugin(
			new StateEventsPlugin({ stateManager })
		);

		const forensicLogger =
			context.forensicLogger ||
			stateManager?.forensicLogger ||
			stateManager?.managers?.forensicLogger ||
			null;
		if (forensicLogger) {
			orchestrator.registerPlugin(
				new ForensicPlugin({ forensicLogger })
			);
		}

		const metricsRegistry = resolveMetricsRegistry(context, stateManager);
		if (metricsRegistry) {
			orchestrator.registerPlugin(
				new MetricsPlugin({ metrics: metricsRegistry })
			);
		}

		orchestratorCache.set(stateManager, orchestrator);
		if (!AsyncOrchestrator.getGlobal()) {
			AsyncOrchestrator.registerGlobal(orchestrator);
		}
		return orchestrator;
	}

	const global = AsyncOrchestrator.getGlobal();
	if (global) return global;

	const fallback = new AsyncOrchestrator({ logger: console });
	AsyncOrchestrator.registerGlobal(fallback);
	return fallback;
}

/**
 * Resolves the async orchestration service if available.
 * @param {object} context
 * @returns {{ run?:(operation:any, options:any)=>Promise<any>, getOrchestrator?:()=>AsyncOrchestrator }|null}
 */
function resolveAsyncService(context = {}) {
	const stateManager = context.stateManager;
	const service = stateManager?.managers?.asyncOrchestrator;
	if (service && typeof service.run === "function") {
		return service;
	}
	return null;
}

/**
 * @class AsyncHelper
 * @description Transitional wrapper that routes async operations through AsyncOrchestrator.
 */
export class AsyncHelper {
	/**
	 * Wraps an operation (promise or factory) with orchestrated instrumentation.
	 * @template T
	 * @param {Promise<T>|(() => Promise<T>|T)} operation Operation or factory to execute.
	 * @param {object} [options]
	 * @param {string} [options.label]
	 * @param {import('../platform/state/HybridStateManager.js').default} [options.stateManager]
	 * @param {object} [options.meta]
	 * @param {string} [options.actorId]
	 * @param {string} [options.tenantId]
	 * @param {object} [options.policyOverrides]
	 * @param {object} [options.classification]
	 * @param {AsyncOrchestrator} [options.asyncOrchestrator]
	 * @returns {Promise<T>}
	 */
	static async wrap(operation, options = {}) {
		const callable =
			typeof operation === "function" ? operation : () => operation;

		const label = options.label || "async.operation";
		if (!options.label) {
			console.warn(
				"[AsyncHelper.wrap] Missing label; defaulting to 'async.operation'."
			);
		}
		if (!options.stateManager) {
			console.warn(
				"[AsyncHelper.wrap] Missing stateManager; state events will not be emitted."
			);
		}

		const service = resolveAsyncService(options);
		const runOptions = {
			label,
			meta: { source: "AsyncHelper.wrap", ...(options.meta || {}) },
			stateManager: options.stateManager,
			actorId: options.actorId,
			tenantId: options.tenantId,
			classification: options.classification,
			policyOverrides: options.policyOverrides,
			metricsSampleRate: options.metricsSampleRate,
			eventType: options.eventType,
		};

		if (service?.run) {
			return service.run(callable, runOptions);
		}

		const orchestrator = resolveOrchestrator(options);
		return orchestrator.run(callable, runOptions);
	}
}

/**
 * Creates a managed asynchronous operation helper.
 *
 * @template T
 * @param {(context:{signal: AbortSignal}) => Promise<T>} loader Async loader function to execute.
 * @param {object} [context={}] Optional configuration.
 * @param {import('./ErrorHelpers.js').ErrorHelpers} [context.errorHelpers]
 * @param {import('../platform/state/HybridStateManager.js').default} [context.stateManager]
 * @param {object} [context.meta]
 * @param {object} [context.policyOverrides]
 * @param {string} [context.actorId]
 * @param {string} [context.tenantId]
 * @param {object} [context.classification]
 * @param {number} [context.metricsSampleRate]
 * @param {AsyncOrchestrator} [context.asyncOrchestrator]
 * @returns {AsyncHelperInstance<T>}
 */
export function createAsyncHelper(loader, context = {}) {
	if (typeof loader !== "function") {
		throw new TypeError("createAsyncHelper requires a loader function.");
	}

	const orchestrator = resolveOrchestrator(context);
	const service = resolveAsyncService(context);
	const helperId = createHelperId(context.label || "AsyncHelper");

	let ctrl = null;
	let state = "idle";
	const subscribers = new Set();

	const errorHelpers = context.errorHelpers || null;

	/**
	 * Updates internal state and notifies subscribers.
	 * @param {'idle'|'loading'|'ready'|'error'|'disposed'} newState
	 * @returns {void}
	 */
	const setState = (newState) => {
		if (state === newState) return;
		state = newState;
		for (const callback of subscribers) {
			try {
				callback(state);
			} catch (error) {
				console.error("[AsyncHelper] Subscriber failed:", error);
			}
		}
	};

	/**
	 * Executes the loader under orchestration.
	 * @returns {Promise<T|undefined>}
	 */
	const executeLoad = async () => {
		ctrl?.abort();
		ctrl = new AbortController();
		setState("loading");

		const runOptions = {
			label: context.label || `async.helper.${helperId}`,
			meta: {
				helperId,
				source: "AsyncHelper.load",
				...(context.meta || {}),
			},
			stateManager: context.stateManager,
			actorId: context.actorId || "async.helper",
			tenantId: context.tenantId,
			classification: context.classification,
			policyOverrides: context.policyOverrides,
			metricsSampleRate: context.metricsSampleRate,
			eventType: context.eventType,
		};

		try {
			const task = () => loader({ signal: ctrl.signal });
			const data = service?.run
				? await service.run(task, runOptions)
				: await orchestrator.run(task, runOptions);
			if (ctrl.signal.aborted) return undefined;
			setState("ready");
			return data;
		} catch (error) {
			if (error?.name === "AbortError") {
				return undefined;
			}
			setState("error");
			errorHelpers?.handleError?.(error, {
				component: "AsyncHelper",
				operation: "load",
				helperId,
			});
			throw error;
		}
	};

	return {
		/**
		 * Executes the loader once.
		 * @returns {Promise<T|undefined>}
		 */
		load: executeLoad,

		/**
		 * Executes the loader with retries and exponential backoff.
		 * @param {object} [options]
		 * @param {number} [options.retries=3]
		 * @param {number} [options.delay=1000]
		 * @param {(delay:number) => number} [options.backoff=(delay) => delay * 2]
		 * @returns {Promise<T|undefined>}
		 */
		async retry(options = {}) {
			const {
				retries = 3,
				delay: initialDelay = 1000,
				backoff = (delay) => delay * 2,
			} = options;

			let attemptDelay = initialDelay;
			for (let attempt = 0; attempt <= retries; attempt += 1) {
				try {
					return await executeLoad();
				} catch (error) {
					if (attempt === retries) throw error;
					await new Promise((resolve) =>
						setTimeout(resolve, attemptDelay)
					);
					attemptDelay = backoff(attemptDelay);
				}
			}
			return undefined;
		},

		/**
		 * Aborts any in-flight work and marks the helper as disposed.
		 * @returns {void}
		 */
		dispose() {
			ctrl?.abort();
			setState("disposed");
			subscribers.clear();
		},

		/**
		 * Registers a subscriber for state changes.
		 * @param {(state:string) => void} callback
		 * @returns {() => void}
		 */
		onStateChange(callback) {
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		},

		/**
		 * @returns {'idle'|'loading'|'ready'|'error'|'disposed'}
		 */
		getState: () => state,

		/**
		 * @returns {boolean}
		 */
		isLoading: () => state === "loading",
	};
}

export default createAsyncHelper;
