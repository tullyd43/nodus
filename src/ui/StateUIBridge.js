/**
 * @class StateUIBridge
 * @description A utility class that acts as a bridge between the core StateManager
 * and UI components, ensuring the UI reflects the current application state.
 * It listens for state change events and triggers updates on the bound UI components.
 */
export class StateUIBridge {
	/**
	 * Creates an instance of StateUIBridge.
	 * @param {import('../core/StateManager.js').StateManager} stateManager - The central state management instance that emits events.
	 */
	constructor(stateManager) {
		this.stateManager = stateManager;
	}

	/**
	 * Binds StateManager events to a grid component to keep it synchronized in real-time.
	 * - On 'entitySaved', it refreshes the corresponding row in the grid.
	 * - On 'entityDeleted', it removes the corresponding row from the grid.
	 * - On 'syncCompleted', it refreshes the entire grid to ensure consistency.
	 * @param {object} grid - The grid component instance to bind.
	 * @param {function(object): void} [grid.refreshRow] - Method to refresh a single row with new item data.
	 * @param {function(string): void} [grid.removeRow] - Method to remove a row by its ID.
	 * @param {function(): void} [grid.refresh] - Method to refresh the entire grid.
	 * @returns {void}
	 */
	bindGrid(grid) {
		if (!this.stateManager?.on || !grid) {
			console.warn(
				"StateUIBridge: Could not bind grid. StateManager or grid is invalid."
			);
			return;
		}

		this.stateManager.on("entitySaved", ({ store, item }) => {
			if (store === "objects") grid.refreshRow?.(item);
		});
		this.stateManager.on("entityDeleted", ({ store, id }) => {
			if (store === "objects") grid.removeRow?.(id);
		});
		this.stateManager.on("syncCompleted", () => grid.refresh?.());
	}
}
