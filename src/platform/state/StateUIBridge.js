import { SafeDOM } from "@shared/lib/SafeDOM.js";

/**
 * @class StateUIBridge
 * @description Bridges HybridStateManager events with vanilla UI helpers so the grid, BindEngine, and DOM bindings stay in sync.
 * @privateFields {#stateManager, #logger, #gridSubscriptions, #domBridgeUnsubscribe, #bindEngine, #asyncService}
 */
export class StateUIBridge {
	/**
	 * Creates an instance of StateUIBridge.
	 * @param {import('../core/HybridStateManager.js').HybridStateManager} stateManager - The central state management instance.
	 */
	constructor(stateManager) {
		if (!stateManager) throw new Error("StateUIBridge requires a stateManager instance.");
		this.#stateManager = stateManager;
		this.#logger = stateManager?.forensicLogger ?? null;
		this.#asyncService =
			stateManager?.managers?.asyncOrchestrator ?? null;
		if (!this.#asyncService) {
			throw new Error(
				"StateUIBridge requires AsyncOrchestrationService on the state manager."
			);
		}
	}

	/**
	 * Binds StateManager events to a grid component to keep it synchronized in real-time.
	 * @param {object} grid - The grid component instance to bind, which should expose `refreshRow`, `removeRow`, and `refresh` methods.
	 * @returns {() => void} Cleanup callback that removes the subscriptions.
	 */
	bindGrid(grid) {
		if (!this.#stateManager || !grid?.refreshRow || !grid?.removeRow) {
			this.#logger?.warn?.(
				"StateUIBridge: Could not bind grid. StateManager is missing or grid does not implement the required methods (refreshRow, removeRow).",
				{ context: "UIBinding" }
			);
			return () => {};
		}

		const saved = this.#stateManager.on(
			"entitySaved",
			this.#handleEntitySaved.bind(this, grid)
		);
		const deleted = this.#stateManager.on(
			"entityDeleted",
			this.#handleEntityDeleted.bind(this, grid)
		);
		const synced = this.#stateManager.on(
			"syncCompleted",
			this.#handleSyncCompleted.bind(this, grid)
		);

		const cleanup = () => {
			saved?.();
			deleted?.();
			synced?.();
			this.#gridSubscriptions.delete(cleanup);
		};
		this.#gridSubscriptions.add(cleanup);
		return cleanup;
	}

	/**
	 * Registers the active BindEngine so the bridge can reuse it when present.
	 * @param {import('../../features/ui/BindEngine.js').default|null} bindEngine
	 * @returns {void}
	 */
	attachBindEngine(bindEngine) {
		this.#bindEngine = bindEngine || null;
	}

	/**
	 * Enables a lightweight DOM bridge mirroring `stateChange` events to `[data-bind]` elements.
	 * @param {object} [options]
	 * @param {ParentNode} [options.root=document] - Root node used for query selection.
	 * @param {boolean} [options.updateInputs=false] - Whether to push values into form controls (skipping the focused element).
	 * @returns {() => void} Cleanup callback.
	 */
	enableDomBridge({ root = document, updateInputs = false } = {}) {
		this.disableDomBridge();
		if (!root?.querySelectorAll || typeof this.#stateManager?.on !== "function") {
			return () => {};
		}

		const handler = ({ path, value }) => {
			// If a BindEngine is available, delegate fine-grained updates to it.
			if (typeof this.#bindEngine?.updateBinding === "function") {
				this.#bindEngine.updateBinding(path, value);
				return;
			}

			const targets = root.querySelectorAll?.(`[data-bind="${path}"]`);
			if (!targets || targets.length === 0) return;
			for (const el of targets) {
				const isFormControl =
					updateInputs &&
					el &&
					el.nodeType === 1 &&
					typeof el.matches === "function" &&
					el.matches("input, textarea, select");
				if (isFormControl) {
					if (document.activeElement !== el) {
						el.value = value == null ? "" : String(value);
					}
				} else {
					SafeDOM.setText(el, value == null ? "" : String(value));
				}
			}
		};

		const unsubscribe = this.#stateManager.on("stateChange", handler);
		this.#domBridgeUnsubscribe = () => {
			unsubscribe?.();
			this.#domBridgeUnsubscribe = null;
		};
		return this.#domBridgeUnsubscribe;
	}

	/**
	 * Disables the DOM bridge created by {@link enableDomBridge}.
	 * @returns {void}
	 */
	disableDomBridge() {
		this.#domBridgeUnsubscribe?.();
		this.#domBridgeUnsubscribe = null;
	}

	/**
	 * Emits a UI-driven state update (with forensic logging best-effort).
	 * @param {string} path
	 * @param {any} value
	 * @param {object} [options]
	 * @param {string} [options.eventType="UI_STATE_CHANGE"]
	 * @param {string} [options.actorId="ui.bridge"]
	 * @returns {Promise<any>}
	 */
	updateState(
		path,
		value,
		{ eventType = "UI_STATE_CHANGE", actorId = "ui.bridge" } = {}
	) {
		if (!path) return undefined;
		const setter = this.#stateManager?.set;
		if (typeof setter !== "function") {
			return undefined;
		}

		return this.#asyncService.wrap(
			() => setter.call(this.#stateManager, path, value),
			{
				stateManager: this.#stateManager,
				label: `ui.state.update.${path}`,
				eventType,
				actorId,
				meta: {
					path,
					source: "StateUIBridge.updateState",
				},
			}
		);
	}

	/**
	 * Releases grid subscriptions and DOM bridge helpers.
	 * @returns {void}
	 */
	dispose() {
		this.disableDomBridge();
		for (const cleanup of this.#gridSubscriptions) {
			try {
				cleanup();
			} catch {
				/* noop */
			}
		}
		this.#gridSubscriptions.clear();
		this.#bindEngine = null;
	}

	#handleEntitySaved(grid, { store, item }) {
		if (store === "objects") {
			grid.refreshRow(item);
		}
	}

	#handleEntityDeleted(grid, { store, id }) {
		if (store === "objects") {
			grid.removeRow(id);
		}
	}

	#handleSyncCompleted(grid) {
		grid.refresh?.();
	}

	#stateManager;
	#logger;
	#gridSubscriptions = new Set();
	#domBridgeUnsubscribe = null;
	#bindEngine = null;
	#asyncService = null;
}

export default StateUIBridge;
