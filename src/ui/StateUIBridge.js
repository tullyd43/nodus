/**
 * @class StateUIBridge
 * @description Bridges the core HybridStateManager with UI components, ensuring the UI
 * reflects the current application state in real-time. It translates state
 * management events into UI-specific actions.
 * @privateFields {#stateManager, #logger}
 */
export class StateUIBridge {
	/**
	 * @private
	 * @type {import('../core/HybridStateManager.js').HybridStateManager}
	 * The central state management instance.
	 */
	#stateManager;

	/**
	 * @private
	 * @type {import('../core/services/ForensicLogger.js').ForensicLogger}
	 * The centralized logging service.
	 */
	#logger;

	/**
	 * Creates an instance of StateUIBridge.
	 * @param {import('../core/HybridStateManager.js').HybridStateManager} stateManager - The central state management instance.
	 */
	constructor(stateManager) {
		this.#stateManager = stateManager;
		this.#logger = stateManager.forensicLogger;
	}

	/**
	 * Binds StateManager events to a grid component to keep it synchronized in real-time.
	 * @param {object} grid - The grid component instance to bind, which should expose `refreshRow`, `removeRow`, and `refresh` methods.
	 * @returns {void}
	 */
	bindGrid(grid) {
		if (!this.#stateManager || !grid?.refreshRow || !grid?.removeRow) {
			this.#logger.warn(
				"StateUIBridge: Could not bind grid. StateManager is missing or grid does not implement the required methods (refreshRow, removeRow).",
				{ context: "UIBinding" }
			);
			return;
		}

		this.#stateManager.on(
			"entitySaved",
			this.#handleEntitySaved.bind(this, grid)
		);
		this.#stateManager.on(
			"entityDeleted",
			this.#handleEntityDeleted.bind(this, grid)
		);
		this.#stateManager.on(
			"syncCompleted",
			this.#handleSyncCompleted.bind(this, grid)
		);
	}

	/**
	 * Handles the 'entitySaved' event to refresh a grid row.
	 * @private
	 * @param {object} grid - The grid component instance.
	 * @param {{store: string, item: object}} eventData - The event payload.
	 */
	#handleEntitySaved(grid, { store, item }) {
		if (store === "objects") {
			grid.refreshRow(item);
		}
	}

	/**
	 * Handles the 'entityDeleted' event to remove a grid row.
	 * @private
	 * @param {object} grid - The grid component instance.
	 * @param {{store: string, id: string}} eventData - The event payload.
	 */
	#handleEntityDeleted(grid, { store, id }) {
		if (store === "objects") {
			grid.removeRow(id);
		}
	}

	/**
	 * Handles the 'syncCompleted' event to refresh the entire grid.
	 * @private
	 * @param {object} grid - The grid component instance.
	 */
	#handleSyncCompleted(grid) {
		// The refresh method might be optional on some grid implementations.
		grid.refresh?.();
	}
}
