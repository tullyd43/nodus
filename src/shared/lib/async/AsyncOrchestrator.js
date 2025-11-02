/**
 * @file AsyncOrchestrator.js
 * @description Policy-aware asynchronous orchestration kernel with pluggable instrumentation hooks.
 */

const DEFAULT_LABEL = "async.operation";
const DEFAULT_EVENT_TYPE = "ASYNC_OPERATION";
const DEFAULT_ACTOR = "system";
const DEFAULT_TENANT = "shared";
const RUN_ID_PREFIX = "async";

const HOOK_SEQUENCE = [
	"beforeRun",
	"onSuccess",
	"onError",
	"onSkip",
	"afterRun",
];

const STATUS = Object.freeze({
	PENDING: "pending",
	SUCCESS: "success",
	ERROR: "error",
	SKIPPED: "skipped",
});

/**
 * @typedef {object} AsyncClassification
 * @property {string} level
 * @property {Iterable<string>} [compartments]
 */

/**
 * @typedef {object} AsyncRunOptions
 * @property {string} [id] Optional stable identifier for the run.
 * @property {string} [label] Friendly label used for metrics and forensic payloads.
 * @property {string} [eventType] Overrides the forensic event type (default: ASYNC_OPERATION).
 * @property {Record<string, any>} [meta] Free-form metadata for plugins.
 * @property {AsyncClassification|string} [classification] Security classification metadata.
 * @property {string} [actorId] Identity of the actor performing the operation.
 * @property {string} [tenantId] Tenant or workspace identifier.
 * @property {import("../../platform/state/HybridStateManager.js").default} [stateManager]
 * State manager reference for legacy event emission.
 * @property {Array<AsyncOrchestratorPlugin>} [plugins] Optional per-run plugins.
 * @property {number} [metricsSampleRate] Sampling hint for metrics plugins (0-1).
 * @property {Record<string, any>} [policyOverrides] Optional policy overrides.
 */

/**
 * @typedef {object} AsyncOrchestratorPlugin
 * @property {string} name Unique plugin name.
 * @property {number} [priority] Execution priority; lower values run earlier.
 * @property {(context: AsyncRunContext) => boolean|Promise<boolean>} [supports] Optional gate to skip plugin at runtime.
 * @property {(context: AsyncRunContext) => void|Promise<void>} [beforeRun]
 * @property {(context: AsyncRunContext) => void|Promise<void>} [onSuccess]
 * @property {(context: AsyncRunContext) => void|Promise<void>} [onError]
 * @property {(context: AsyncRunContext) => void|Promise<void>} [onSkip]
 * @property {(context: AsyncRunContext) => void|Promise<void>} [afterRun]
 */

/**
 * @typedef {ReturnType<typeof createExecutionContext>} AsyncRunContext
 */

/**
 * Generates a unique identifier for an orchestrated run.
 * @param {string} label
 * @returns {string}
 */
function createRunId(label) {
	const base = label || DEFAULT_LABEL;
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
		return crypto.randomUUID();
	const suffix = Math.random().toString(16).slice(2, 10);
	return `${RUN_ID_PREFIX}-${base}-${Date.now()}-${suffix}`;
}

/**
 * Produces a monotonic-ish time source suitable for measuring durations.
 * @returns {number}
 */
function defaultNow() {
	if (
		typeof globalThis !== "undefined" &&
		globalThis.performance &&
		typeof globalThis.performance.now === "function"
	) {
		return globalThis.performance.now();
	}
	return Date.now();
}

/**
 * Normalizes classification metadata into a canonical structure.
 * @param {AsyncClassification|string|undefined|null} input
 * @returns {{ level:string, compartments:Set<string> }}
 */
function normalizeClassification(input) {
	if (!input) {
		return {
			level: DEFAULT_EVENT_TYPE,
			compartments: new Set(),
		};
	}
	if (typeof input === "string") {
		return { level: input, compartments: new Set() };
	}
	const level =
		typeof input.level === "string" && input.level.length > 0
			? input.level
			: DEFAULT_EVENT_TYPE;
	const compartments = new Set();
	if (input.compartments && Symbol.iterator in Object(input.compartments)) {
		for (const value of input.compartments) {
			if (typeof value === "string" && value.length > 0) {
				compartments.add(value);
			}
		}
	}
	return { level, compartments };
}

/**
 * Ensures run metadata is a plain object.
 * @param {Record<string, any>|undefined|null} meta
 * @returns {Record<string, any>}
 */
function normalizeMeta(meta) {
	if (!meta || typeof meta !== "object") return {};
	return { ...meta };
}

/**
 * Creates the mutable execution context shared with plugins.
 * @param {AsyncOrchestrator} orchestrator
 * @param {AsyncRunOptions} options
 * @param {() => number} now
 * @returns {object}
 */
function createExecutionContext(orchestrator, options, now) {
	const attachments = new Map();
	let skip = false;
	let resultValue;

	const classification = normalizeClassification(options.classification);
	const meta = normalizeMeta(options.meta);
	const startTime = now();

	const context = {
		id: options.id || createRunId(options.label || DEFAULT_LABEL),
		label: options.label || DEFAULT_LABEL,
		eventType: options.eventType || DEFAULT_EVENT_TYPE,
		meta,
		classification,
		actorId: options.actorId || DEFAULT_ACTOR,
		tenantId: options.tenantId || DEFAULT_TENANT,
		startTime,
		endTime: null,
		status: STATUS.PENDING,
		error: null,
		orchestrator,
		options,
		get result() {
			return resultValue;
		},
		set result(value) {
			resultValue = value;
		},
		/**
		 * Attaches metadata for plugins.
		 * @param {string|symbol} key
		 * @param {any} value
		 * @returns {void}
		 */
		attach(key, value) {
			attachments.set(key, value);
		},
		/**
		 * Retrieves previously attached data.
		 * @param {string|symbol} key
		 * @returns {any}
		 */
		getAttachment(key) {
			return attachments.get(key);
		},
		/**
		 * Removes an attachment.
		 * @param {string|symbol} key
		 * @returns {void}
		 */
		deleteAttachment(key) {
			attachments.delete(key);
		},
		/**
		 * Marks the run as skipped and optionally sets a synthetic result.
		 * @param {any} value
		 * @returns {void}
		 */
		skip(value) {
			skip = true;
			if (value !== undefined) {
				resultValue = value;
			}
			context.status = STATUS.SKIPPED;
		},
		/**
		 * Checks if execution has been skipped.
		 * @returns {boolean}
		 */
		isSkipped() {
			return skip;
		},
	};

	Object.defineProperty(context, "durationMs", {
		enumerable: true,
		get() {
			const end = context.endTime ?? now();
			return end - context.startTime;
		},
	});

	return context;
}

/**
 * @typedef {object} AsyncOrchestratorDeps
 * @property {{ debug?:(...args:any[])=>void, info?:(...args:any[])=>void, warn?:(...args:any[])=>void, error?:(...args:any[])=>void }} [logger]
 * Structured logger interface.
 * @property {() => number} [now] Custom monotonic timer provider.
 */

/**
 * @class AsyncOrchestrator
 * @classdesc Centralized async runner that executes instrumentation plugins around user operations.
 */
export class AsyncOrchestrator {
	/** @type {AsyncOrchestrator|null} */
	static #globalInstance = null;

	/** @type {Array<AsyncOrchestratorPlugin>} */
	#plugins = [];
	/** @type {AsyncOrchestratorDeps["logger"]} */
	#logger;
	/** @type {() => number} */
	#now;

	/**
	 * Creates an orchestrator instance.
	 * @param {AsyncOrchestratorDeps & { plugins?:Array<AsyncOrchestratorPlugin>, registerGlobal?:boolean }} [deps]
	 */
	constructor(deps = {}) {
		this.#logger = deps.logger || console;
		this.#now = typeof deps.now === "function" ? deps.now : defaultNow;
		if (Array.isArray(deps.plugins)) {
			for (const plugin of deps.plugins) {
				this.registerPlugin(plugin);
			}
		}
		if (deps.registerGlobal) {
			AsyncOrchestrator.registerGlobal(this);
		}
	}

	/**
	 * Registers a plugin and returns an unsubscribe function.
	 * @param {AsyncOrchestratorPlugin} plugin
	 * @returns {() => void}
	 */
	registerPlugin(plugin) {
		if (!plugin || typeof plugin.name !== "string") {
			throw new Error("AsyncOrchestrator plugin must define a name.");
		}
		if (this.#plugins.some((existing) => existing.name === plugin.name)) {
			this.#logger?.warn?.(
				`[AsyncOrchestrator] Plugin '${plugin.name}' already registered. Skipping duplicate.`
			);
			return () => this.unregisterPlugin(plugin.name);
		}
		this.#plugins.push(plugin);
		this.#sortPlugins();
		return () => this.unregisterPlugin(plugin.name);
	}

	/**
	 * Removes a plugin by name.
	 * @param {string} name
	 * @returns {void}
	 */
	unregisterPlugin(name) {
		this.#plugins = this.#plugins.filter((plugin) => plugin.name !== name);
	}

	/**
	 * Clears all registered plugins.
	 * @returns {void}
	 */
	clearPlugins() {
		this.#plugins.length = 0;
	}

	/**
	 * Executes an operation under orchestration with the configured plugin pipeline.
	 * @template T
	 * @param {(() => Promise<T|void>|T|Promise<T|void>)|Promise<T|void>} operation
	 * Operation to execute. When a function is provided, it receives the run context.
	 * @param {AsyncRunOptions} [options]
	 * @returns {Promise<T|void>}
	 */
	async run(operation, options = {}) {
		const callable =
			typeof operation === "function" ? operation : () => operation;
		const pipeline = this.#buildPipeline(options.plugins);
		const context = createExecutionContext(this, options, this.#now);

		await this.#dispatch("beforeRun", pipeline, context);
		if (context.isSkipped()) {
			context.endTime = this.#now();
			await this.#dispatch("onSkip", pipeline, context);
			await this.#dispatch("afterRun", pipeline, context);
			return context.result;
		}

		try {
			const output = await callable(context);
			context.result = output;
			context.status = STATUS.SUCCESS;
			context.endTime = this.#now();
			await this.#dispatch("onSuccess", pipeline, context);
			return output;
		} catch (error) {
			context.error = error;
			context.status = STATUS.ERROR;
			context.endTime = this.#now();
			await this.#dispatch("onError", pipeline, context);
			throw error;
		} finally {
			await this.#dispatch("afterRun", pipeline, context);
		}
	}

	/**
	 * Retrieves the currently registered plugin list.
	 * @returns {Array<AsyncOrchestratorPlugin>}
	 */
	getPlugins() {
		return [...this.#plugins];
	}

	/**
	 * Registers this instance as the global orchestrator.
	 * @param {AsyncOrchestrator} instance
	 * @returns {AsyncOrchestrator}
	 */
	static registerGlobal(instance) {
		AsyncOrchestrator.#globalInstance = instance;
		return instance;
	}

	/**
	 * Retrieves the global orchestrator instance, if any.
	 * @returns {AsyncOrchestrator|null}
	 */
	static getGlobal() {
		return AsyncOrchestrator.#globalInstance;
	}

	/**
	 * Retrieves or lazily creates the global orchestrator.
	 * @param {AsyncOrchestratorDeps} [deps]
	 * @returns {AsyncOrchestrator}
	 */
	static getOrCreateGlobal(deps) {
		if (!AsyncOrchestrator.#globalInstance) {
			AsyncOrchestrator.#globalInstance = new AsyncOrchestrator(deps);
		}
		return AsyncOrchestrator.#globalInstance;
	}

	/**
	 * Internal helper to order plugins by priority.
	 * @returns {void}
	 */
	#sortPlugins() {
		this.#plugins.sort((a, b) => {
			const pa = typeof a.priority === "number" ? a.priority : 100;
			const pb = typeof b.priority === "number" ? b.priority : 100;
			return pa - pb;
		});
	}

	/**
	 * Combines registered plugins with run-scoped plugins.
	 * @param {Array<AsyncOrchestratorPlugin>} [runPlugins]
	 * @returns {Array<AsyncOrchestratorPlugin>}
	 */
	#buildPipeline(runPlugins = []) {
		const combined = [...this.#plugins];
		for (const plugin of runPlugins) {
			if (!plugin || typeof plugin.name !== "string") continue;
			if (combined.some((existing) => existing.name === plugin.name)) {
				this.#logger?.warn?.(
					`[AsyncOrchestrator] Run-scoped plugin '${plugin.name}' ignored (duplicate name).`
				);
				continue;
			}
			combined.push(plugin);
		}
		combined.sort((a, b) => {
			const pa = typeof a.priority === "number" ? a.priority : 100;
			const pb = typeof b.priority === "number" ? b.priority : 100;
			return pa - pb;
		});
		return combined;
	}

	/**
	 * Executes a lifecycle hook across the pipeline.
	 * @param {keyof AsyncOrchestratorPlugin} hook
	 * @param {Array<AsyncOrchestratorPlugin>} pipeline
	 * @param {AsyncRunContext} context
	 * @returns {Promise<void>}
	 */
	async #dispatch(hook, pipeline, context) {
		if (!HOOK_SEQUENCE.includes(hook)) return;
		for (const plugin of pipeline) {
			const handler = plugin[hook];
			if (typeof handler !== "function") continue;
			try {
				if (typeof plugin.supports === "function") {
					const gateResult = plugin.supports(context);
					if (gateResult === false) continue;
					if (
						gateResult &&
						typeof gateResult.then === "function" &&
						!(await gateResult)
					) {
						continue;
					}
				}
				const maybePromise = handler.call(plugin, context);
				if (maybePromise && typeof maybePromise.then === "function") {
					await maybePromise;
				}
			} catch (error) {
				this.#logger?.warn?.(
					`[AsyncOrchestrator] Plugin '${plugin.name}' hook '${hook}' failed:`,
					error
				);
			}
		}
	}
}

export default AsyncOrchestrator;
