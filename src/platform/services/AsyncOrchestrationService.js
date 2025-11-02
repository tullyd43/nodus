/**
 * @file AsyncOrchestrationService.js
 * @description Provides a centralized AsyncOrchestrator with baseline instrumentation plugins and policy integration.
 */

import { AsyncOrchestrator } from "@shared/lib/async/AsyncOrchestrator.js";
import { ForensicPlugin } from "@shared/lib/async/plugins/ForensicPlugin.js";
import { MetricsPlugin } from "@shared/lib/async/plugins/MetricsPlugin.js";
import { StateEventsPlugin } from "@shared/lib/async/plugins/StateEventsPlugin.js";

const DEFAULT_ACTOR = "async.service";

/**
 * @typedef {import("@shared/lib/async/AsyncOrchestrator.js").AsyncOrchestratorPlugin} AsyncOrchestratorPlugin
 */

/**
 * @class AsyncOrchestrationService
 * @description Hosts the AsyncOrchestrator instance for the application and wires required plugins.
 */
export class AsyncOrchestrationService {
	/**
	 * @param {{ stateManager: import("../state/HybridStateManager.js").default }} context
	 */
	constructor(context) {
		if (!context?.stateManager) {
			throw new Error(
				"AsyncOrchestrationService requires a stateManager context."
			);
		}
		this.#stateManager = context.stateManager;
	}

	/**
	 * Initializes the service and registers baseline plugins.
	 * @returns {Promise<this>}
	 */
	async initialize() {
		if (this.#initialized) return this;

		const logger =
			this.#stateManager.managers?.logger ||
			this.#stateManager.managers?.metricsReporter ||
			console;
		this.#orchestrator = new AsyncOrchestrator({
			logger,
			registerGlobal: !AsyncOrchestrator.getGlobal(),
		});

		this.#registerBaselinePlugins();
		this.#initialized = true;
		return this;
	}

	/**
	 * Runs an operation through the orchestrator with default policy overrides.
	 * @template T
	 * @param {(() => Promise<T>|T)|Promise<T>} operation
	 * @param {import("@shared/lib/async/AsyncOrchestrator.js").AsyncRunOptions} [options]
	 * @returns {Promise<T>}
	 */
	async run(operation, options = {}) {
		const orchestrator = this.getOrchestrator();
		const callable =
			typeof operation === "function" ? operation : () => operation;

		const policyOverrides = this.#resolvePolicyOverrides(
			options.policyOverrides
		);

		return orchestrator.run(callable, {
			stateManager: options.stateManager || this.#stateManager,
			actorId: options.actorId || DEFAULT_ACTOR,
			policyOverrides,
			metricsSampleRate:
				options.metricsSampleRate ??
				policyOverrides?.observability?.metrics_sample_rate,
			...options,
		});
	}

	/**
	 * Registers an additional orchestrator plugin.
	 * @param {AsyncOrchestratorPlugin} plugin
	 * @returns {() => void}
	 */
	registerPlugin(plugin) {
		return this.getOrchestrator().registerPlugin(plugin);
	}

	/**
	 * Returns the underlying orchestrator instance.
	 * @returns {AsyncOrchestrator}
	 */
	getOrchestrator() {
		if (!this.#orchestrator) {
			throw new Error(
				"AsyncOrchestrationService not initialized. Call initialize() first."
			);
		}
		return this.#orchestrator;
	}

	/**
	 * Provides the current plugin list.
	 * @returns {Array<AsyncOrchestratorPlugin>}
	 */
	getPlugins() {
		return this.getOrchestrator().getPlugins();
	}

	/**
	 * Registers baseline plugins (state events, forensic, metrics).
	 * @returns {void}
	 */
	#registerBaselinePlugins() {
		const orchestrator = this.getOrchestrator();
		orchestrator.registerPlugin(
			new StateEventsPlugin({ stateManager: this.#stateManager })
		);

		const forensicLogger =
			this.#stateManager.managers?.forensicLogger ??
			this.#stateManager.forensicLogger;
		if (forensicLogger) {
			orchestrator.registerPlugin(
				new ForensicPlugin({ forensicLogger })
			);
		}

		const metricsRegistry = this.#resolveMetricsRegistry();
		if (metricsRegistry) {
			orchestrator.registerPlugin(
				new MetricsPlugin({ metrics: metricsRegistry })
			);
		}
	}

	/**
	 * Resolves the metrics registry namespace used for instrumentation.
	 * @returns {{ increment?:(name:string, value?:number)=>void, updateAverage?:(name:string, value:number)=>void }|null}
	 */
	#resolveMetricsRegistry() {
		const registry =
			this.#stateManager.metricsRegistry ||
			this.#stateManager.managers?.metricsRegistry ||
			null;
		if (!registry) return null;
		if (typeof registry.namespace === "function") {
			try {
				return registry.namespace("async");
			} catch {
				return registry;
			}
		}
		return registry;
	}

	/**
	 * Builds the default policy override payload for orchestrated runs.
	 * @param {Record<string, any>|undefined} additional
	 * @returns {Record<string, any>|undefined}
	 */
	#resolvePolicyOverrides(additional) {
		const policies = this.#stateManager.managers?.policies;
		const base = {};
		if (policies?.getPolicy) {
			const observability = {
				forensic_depth: policies.getPolicy(
					"observability",
					"forensic_depth"
				),
				metrics_sample_rate: policies.getPolicy(
					"observability",
					"metrics_sample_rate"
				),
				embedding_depth: policies.getPolicy(
					"observability",
					"embedding_depth"
				),
				embedding_version_retention: policies.getPolicy(
					"observability",
					"embedding_version_retention"
				),
				i18n_enabled_languages: policies.getPolicy(
					"observability",
					"i18n_enabled_languages"
				),
				i18n_scope: policies.getPolicy("observability", "i18n_scope"),
			};
			const defined = Object.entries(observability).filter(
				([, value]) => value !== undefined && value !== null
			);
			if (defined.length > 0) {
				base.observability = Object.fromEntries(defined);
			}
		}

		if (!additional) {
			return Object.keys(base).length > 0 ? base : undefined;
		}

		return {
			...(Object.keys(base).length > 0 ? base : {}),
			...additional,
		};
	}

	#stateManager;
	#orchestrator = null;
	#initialized = false;
}

export default AsyncOrchestrationService;
