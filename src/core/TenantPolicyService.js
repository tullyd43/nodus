/**
 * @file TenantPolicyService.js
 * @description Manages per-tenant policy overrides layered on top of SystemPolicies.
 */

export class TenantPolicyService {
  #stateManager;
  #cache;
  #STORE = 'system_settings';

  constructor({ stateManager }) {
    this.#stateManager = stateManager;
    this.#cache = stateManager.managers.cacheManager.getCache('tenantPolicies', { max: 100, ttl: 30000 });
  }

  /** Returns current subject's tenantId or provided one */
  #tenantId(explicit) {
    if (explicit) return explicit;
    try { return this.#stateManager.managers.securityManager.getSubject()?.tenantId; } catch { return null; }
  }

  #cacheKey(tenantId) { return `tenant_policies:${tenantId}`; }

  async #load(tenantId) {
    if (!tenantId) return { overrides: {} };
    const ck = this.#cacheKey(tenantId);
    const cached = this.#cache.get(ck);
    if (cached) return cached;
    try {
      if (!this.#stateManager.storage.ready) return { overrides: {} };
      const rec = await this.#stateManager.storage.instance.get(this.#STORE, ck);
      const obj = rec || { id: ck, overrides: {} };
      this.#cache.set(ck, obj);
      return obj;
    } catch { return { overrides: {} }; }
  }

  async getPolicy(domain, key, tenantId = null) {
    const tid = this.#tenantId(tenantId);
    if (!tid) return undefined;
    const data = await this.#load(tid);
    return data.overrides?.[`${domain}.${key}`];
  }

  async setPolicy(domain, key, value, tenantId = null) {
    const tid = this.#tenantId(tenantId);
    if (!tid) throw new Error('No tenantId in context');
    const ck = this.#cacheKey(tid);
    const data = await this.#load(tid);
    data.overrides = data.overrides || {};
    if (value === undefined || value === null) {
      delete data.overrides[`${domain}.${key}`];
    } else {
      data.overrides[`${domain}.${key}`] = value;
    }
    try {
      this.#cache.set(ck, data);
      if (this.#stateManager.storage.ready) {
        await this.#stateManager.storage.instance.put(this.#STORE, { id: ck, ...data });
      }
      this.#stateManager.emit('policyEvent', { type: 'tenant_policy_updated', data: { tenantId: tid, domain, key, value } });
      return true;
    } catch (e) {
      console.warn('[TenantPolicyService] Failed to persist tenant policy:', e);
      return false;
    }
  }
}

export default TenantPolicyService;

