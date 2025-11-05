/**
 * @file BaseForensicPlugin.js
 * @description A base class for creating forensic plugins that standardizes
 * operation wrapping, metric reporting, and orchestration.
 */

export class BaseForensicPlugin {
	/** @protected @type {import('../../../state/HybridStateManager.js').default} */
	_stateManager;
	/** @protected @type {import('../../../core/actions/ActionDispatcher.js').default|null} */
	_dispatcher;
	/** @protected @type {Console|object} */
	_log;
	/** @protected @type {string} */
	_domain;
	/** @protected @type {Set<string>} */
	_features;

	/**
	 * @param {import('../../../state/HybridStateManager.js').default} stateManager
	 * @param {string} domain The forensic domain for this plugin (e.g., 'api', 'auth').
	 * @param {string[]} [features=[]] List of features enabled for this plugin instance.
	 */
	constructor(stateManager, domain, features = []) {
		if (!domain) {
			throw new Error("BaseForensicPlugin requires a domain.");
		}
		this._stateManager = stateManager;
		this._dispatcher = stateManager.managers?.actionDispatcher;
		this._log = stateManager.managers?.observabilityLogger || console;
		this._domain = domain;
		this._features = new Set(features);
	}

	/**
	 * Wraps an operation with forensic logging, metrics, and error handling.
	 * @param {string} operation The specific operation name (e.g., 'login', 'fetch').
	 * @param {Function} fn The async function to execute.
	 * @param {object} context Additional context for the operation.
	 * @returns {Promise<any>}
	 */
	wrapOperation(operation, fn, context = {}) {
		const forensic = this._stateManager?.managers?.forensicLogger;
		const start = performance.now();
		let envelope = null;

		// Adjust context based on licensed features, as suggested in the prompt.
		// These methods (classifyOperation, analyzeNetwork) would be implemented
		// in the BaseForensicPlugin or overridden in specific plugins.
		if (this._features.has("classified")) {
			context.classification = this.classifyOperation(operation);
		}
		if (this._features.has("deep_packet")) {
			context.networkAnalysis = this.analyzeNetwork(context);
		}

		const run = async () => {
			try {
				if (forensic?.createEnvelope) {
					envelope = await forensic.createEnvelope(
						`${this._domain}.${_operation}`,
						_context
					);
				}

				const result = await fn();
				const duration = performance.now() - start;

				if (forensic?.finalizeEnvelope && envelope) {
					await forensic.finalizeEnvelope(envelope, {
						duration,
						result:
							typeof result === "object"
								? { status: result?.status }
								: { value: result },
					});
				}

				if (this._dispatcher?.dispatch) {
					/* PERFORMANCE_BUDGET: 1ms */
					this._dispatcher.dispatch("metrics.increment", {
						key: `${this._domain}.${_operation}.count`,
						value: 1,
					});
					/* PERFORMANCE_BUDGET: 1ms */
					this._dispatcher.dispatch("metrics.timer", {
						key: `${this._domain}.${_operation}.duration`,
						value: duration,
					});
				}
				return result;
			} catch (err) {
				if (forensic?.finalizeEnvelope && envelope) {
					await forensic.finalizeEnvelope(envelope, null, err);
				}
				if (this._dispatcher?.dispatch) {
					/* PERFORMANCE_BUDGET: 1ms */
					this._dispatcher.dispatch("metrics.increment", {
						key: `${this._domain}.${_operation}.error`,
						value: 1,
					});
				}
				this._log?.warn?.(
					`[${this.constructor.name}] operation failed`,
					{ operation: _operation, error: err.message }
				);
				throw err;
			}
		};

		const orchestrator = this._stateManager?.managers?.asyncOrchestrator;
		const policies = this._stateManager?.managers?.policies;
		let allow = true;
		try {
			if (
				policies?.getPolicy &&
				!policies.getPolicy("async", "enabled")
			) {
				allow = false;
			}
		} catch (e) {
			this._log?.warn?.(
				`[${this.constructor.name}] policy check failed`,
				e
			);
		}

		if (allow && orchestrator?.createRunner) {
			const runner = orchestrator.createRunner(this._domain);
			return runner.run(run, { label: `${this._domain}.${_operation}` });
		}

		return run();
	}

	/**
	 * Placeholder method to classify an operation based on its name or context.
	 * This would typically be overridden by specific plugins or use a policy engine.
	 * @param {string} _operation The operation name.
	 * @returns {string} The classification level (e.g., 'UNCLASSIFIED', 'CONFIDENTIAL').
	 */
	classifyOperation(_operation) {
		// Default implementation, can be overridden by specific plugins
		return "UNCLASSIFIED";
	}

	/**
	 * Placeholder method to analyze network context for deep packet inspection features.
	 * @param {object} _context The operation context.
	 * @returns {object} Network analysis data.
	 */
	analyzeNetwork(_context) {
		return {};
	}
}
