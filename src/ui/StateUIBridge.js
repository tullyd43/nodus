export class StateUIBridge {
  constructor(stateManager) { this.stateManager = stateManager; }

  bindGrid(grid) {
    this.stateManager.on?.('entitySaved', ({ store, item }) => {
      if (store === 'objects') grid.refreshRow?.(item);
    });
    this.stateManager.on?.('entityDeleted', ({ store, id }) => {
      if (store === 'objects') grid.removeRow?.(id);
    });
    this.stateManager.on?.('syncCompleted', () => grid.refresh?.());
  }
}