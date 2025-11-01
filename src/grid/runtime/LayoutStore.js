// src/grid/runtime/LayoutStore.js
export class LayoutStore {
  #stateManager;
  constructor({ stateManager }) {
    this.#stateManager = stateManager;
  }

  async save(id, layout, scope) {
    const db = this.#stateManager?.storage?.instance;
    if (!db) throw new Error('Storage instance not available');
    const key = this.#key('grid_layout', id, scope);
    await db.put('system_settings', { id: key, layout, updatedAt: new Date().toISOString() });
  }

  async load(id, scope) {
    const db = this.#stateManager?.storage?.instance;
    if (!db) throw new Error('Storage instance not available');
    const key = this.#key('grid_layout', id, scope);
    const rec = await db.get('system_settings', key);
    return rec?.layout || null;
  }

  // Persist full runtime config objects separately from layout positions
  async saveConfig(id, config, scope) {
    const db = this.#stateManager?.storage?.instance;
    if (!db) throw new Error('Storage instance not available');
    const key = this.#key('grid_config', id, scope);
    await db.put('system_settings', { id: key, config, updatedAt: new Date().toISOString() });
  }

  async loadConfig(id, scope) {
    const db = this.#stateManager?.storage?.instance;
    if (!db) throw new Error('Storage instance not available');
    const key = this.#key('grid_config', id, scope);
    const rec = await db.get('system_settings', key);
    return rec?.config || null;
  }

  #key(prefix, id, scope) {
    const tenant = scope?.tenantId || this.#stateManager?.managers?.securityManager?.getSubject?.()?.tenantId || 'public';
    const user = scope?.userId || this.#stateManager?.managers?.securityManager?.getSubject?.()?.userId || 'anon';
    return `${prefix}:${tenant}:${user}:${id}`;
  }
}
