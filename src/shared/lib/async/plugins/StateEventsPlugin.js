/**
 * @file StateEventsPlugin.js
 * @description Emits async lifecycle events on the HybridStateManager.
 */

const MANAGER_SLOT = Symbol("async.state.manager");

/**
 * @typedef {import("../AsyncOrchestrator.js").AsyncRunContext} AsyncRunContext
 */

/**
 * @class StateEventsPlugin
 * @classdesc Bridges orchestrator lifecycle to the state manager event bus.
 */
export class StateEventsPlugin {
	/**
	 * @param {{ stateManager?: { emit?:(event:string, payload?:any)=>void } }} [options]
	 */
	constructor(options = {}) {
		this.name = "state-events";
		this.priority = 10;
		this.#stateManager = options.stateManager || null;
	}

	/**
	 * @param {AsyncRunContext} context
	 * @returns {boolean}
	 */
	supports(context) {
		return !!this.#resolveManager(context)?.emit;
	}

	/**
	 * Emits the async:start event.
	 * @param {AsyncRunContext} context
	 * @returns {void}
	 */
	beforeRun(context) {
		const manager = this.#resolveManager(context);
		if (!manager?.emit) return;
		manager.emit("async:start", {
			label: context.label,
			meta: context.meta,
		});
		context.attach(MANAGER_SLOT, manager);
	}

	/**
	 * Emits the async:end event after completion.
	 * @param {AsyncRunContext} context
	 * @returns {void}
	 */
	afterRun(context) {
		const manager =
			context.getAttachment(MANAGER_SLOT) || this.#resolveManager(context);
		if (!manager?.emit) return;
		context.deleteAttachment(MANAGER_SLOT);
		manager.emit("async:end", {
			label: context.label,
			status: context.status,
			durationMs: context.durationMs,
			errorName: context.error?.name,
		});
	}

	/**
	 * Resolves the state manager from plugin options or run options.
	 * @param {AsyncRunContext} context
	 * @returns {{ emit?:(event:string, payload?:any)=>void }|null}
	 */
	#resolveManager(context) {
		return (
			context.options?.stateManager ||
			this.#stateManager ||
			null
		);
	}

	#stateManager;
}

export default StateEventsPlugin;
