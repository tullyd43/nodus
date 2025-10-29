src

main.js
src\core

AdaptiveRenderer.js
BuildingBlockRenderer.js
ComponentDefinition.js
ConditionRegistry.js
DatabaseOptimizer.js
ErrorHelpers_EventFlow.js
EventFlowEngine.js
HybridStateManager_ModernStorage.js
HybridStateManager.js
ManifestPluginSystem.js
OptimizationAccessControl.js
OptimizationWebSocketServer.js
PluginManifestSchema.js
RenderContext_PolicyHelpers.js
RenderContext.js
SystemBootstrap.js
SystemPolicies_Cached.js
storage
ComposableSecurity.js
ModernIndexedDB.js
StorageLoader.js
SyncLayer.js
ValidationLayer.js
modules
aes-crypto.js
batch-sync.js
compartment-security.js
custom-validator.js
enterprise-security.js
indexeddb-adapter.js
key-rotation.js
realtime-sync.js
strict-validator.js
sync-stack.js
validation-stack.js

src\grid

AILayoutAssistant.js
CompleteGridSystem.js
EnhancedGridRenderer.js
GridEnhancementIntegration (1).js
GridEnhancementIntegration.js
GridPolicyIntegration.js
GridToastManager.js
src\managers

DatabaseOptimizationControlPanel.js
ErrorHandlingFlow.json
IntegratedSystemExample.js
PolicyControlBlock_Enhanced.js
src\state

EmbeddingManager.js
HybridStateManager_NATS.js
QueryService.js
src\ui

blocks
ErrorHandlingFlow.json
PerformanceOverlayBlock.js
PolicyControlBlock_Enhanced.js
src\utils

BoundedStack.js
ErrorHelpers.js
LRUCache.js
MetricsRegistry.js
MetricsReporter.js
RenderMetrics.js




V8.0 Core System Parity Plan
Global Contracts (Adopt Everywhere)

State source of truth: HybridStateManager

entities: stateManager.clientState.entities (Map by id)

relationships: stateManager.clientState.relationships

events: stateManager.on(event, fn) / stateManager.emit(event, payload)

Storage I/O: stateManager.storage.instance

CRUD: .put(store, item), .get(store, id), .delete(store, id), .query(store, index, query)

Validation: stateManager.managers.validation (wraps ValidationStack)

Security/Policy: stateManager.storage.instance (security module) + ComposableSecurity

Metrics/Telemetry: write to stateManager.metrics (storage/rendering/routing/memory/interaction)

Schema access: stateManager.schema.entities & stateManager.typeDefinitions

UI sync: grid subscribes to HybridState events; no ad-hoc local caches

New Helper (drop-in)

src/ui/StateUIBridge.js — a tiny bridge for UI reactivity.

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

File-by-file diffs

Notes:

Unified diffs are context-based (safe to apply by search/replace).

Replace any remaining direct DB/adapter calls with stateManager.storage.instance.*.

If a file already matches the target form, skip that hunk.

1) src/core/RenderContext.js
- export default class RenderContext {
-   constructor(uiContext) {
-     this.uiContext = uiContext;
-   }
+ export default class RenderContext {
+   constructor(uiContext, stateManager) {
+     this.uiContext = uiContext;
+     this.stateManager = stateManager;
+   }

-   getEntity(entityId) {
-     return this.uiContext.entities?.find(e => e.id === entityId);
-   }
+   getEntity(entityId) {
+     return this.stateManager.clientState.entities.get(entityId)
+       || this.uiContext.entities?.find?.(e => e.id === entityId) || null;
+   }

+   async saveEntity(entity) {
+     await this.stateManager.managers.validation?.validate?.(entity);
+     await this.stateManager.storage.instance.put('objects', entity);
+     this.stateManager.emit?.('entitySaved', { store: 'objects', item: entity });
+   }
 }

2) src/core/RenderContext_PolicyHelpers.js
- export function evaluatePolicy(policy, context) {
-   return context?.user?.permissions?.includes(policy);
- }
+ export function evaluatePolicy(policy, context, stateManager) {
+   const security = stateManager?.storage?.instance?.security || null;
+   // policy may be a classification or a named policy
+   try {
+     return security?.canAccess?.(policy, context?.compartments || []) ?? false;
+   } catch {
+     return false;
+   }
+ }

3) src/core/ConditionRegistry.js
- export function evaluateCondition(condition, dataContext) {
-   return Boolean(dataContext?.[condition.field] === condition.value);
- }
+ export function evaluateCondition(condition, dataContext, stateManager) {
+   const sourceId = condition?.entityId || dataContext?.entityId;
+   const entity = sourceId ? stateManager.clientState.entities.get(sourceId) : dataContext;
+   const fieldValue = entity?.[condition.field];
+   switch (condition.operator || 'equals') {
+     case 'equals': return fieldValue === condition.value;
+     case 'not_equals': return fieldValue !== condition.value;
+     case 'exists': return fieldValue !== undefined && fieldValue !== null;
+     case 'contains': return typeof fieldValue === 'string' && fieldValue.includes(condition.value);
+     default: return false;
+   }
+ }

4) src/core/ErrorHelpers_EventFlow.js
+ import { GridToastManager } from '../grid/GridToastManager.js';

+ export function attachErrorListeners(stateManager) {
+   stateManager.on?.('validationError', ({ entity, errors }) => {
+     GridToastManager?.show?.(`Validation error: ${entity?.id} • ${errors?.join(', ')}`);
+   });
+   stateManager.on?.('syncError', (err) => {
+     GridToastManager?.show?.(`Sync failed: ${err?.message || err}`);
+   });
+   stateManager.on?.('accessDenied', ({ resource }) => {
+     GridToastManager?.show?.(`Access denied for: ${resource}`);
+   });
+ }

5) src/core/AdaptiveRenderer.js
- constructor(state) {
-   this.state = state;
- }
+ constructor(stateManager) {
+   this.stateManager = stateManager;
+ }

- getComponent(def) { /* ... */ }
+ getComponent(def) {
+   // Prefer type metadata from schema registry
+   const typeInfo = this.stateManager.schema?.entities?.get?.(def?.type_name);
+   // existing resolution...
+   return /* resolved component using typeInfo + component registry */;
+ }

6) src/core/ComponentDefinition.js
- export const componentRegistry = new Map();
+ export const componentRegistry = new Map();
+ // Optional: attach schema-aware hints at registration time
+ export function registerComponent(name, def, stateManager) {
+   const typeInfo = def?.type_name ? stateManager.schema?.entities?.get?.(def.type_name) : null;
+   componentRegistry.set(name, { ...def, __schema: typeInfo || undefined });
+ }

7) src/core/SystemBootstrap.js
- async function bootstrap() {
-   const state = new HybridStateManager();
-   await state.initialize();
-   return state;
- }
+ async function bootstrap() {
+   const state = new HybridStateManager();
+   await state.initialize();
+   // bind global error listeners once
+   try {
+     const { attachErrorListeners } = await import('./ErrorHelpers_EventFlow.js');
+     attachErrorListeners(state);
+   } catch {}
+   return state;
+ }

8) src/core/storage/StorageLoader.js (ensure bind call)
- this.storage.instance = await this.storage.loader.createStorage(authContext, this.config.storageConfig);
+ this.storage.instance = await this.storage.loader.createStorage(authContext, this.config.storageConfig);
+ this.storage.instance.bindStateManager?.(this);

9) src/core/storage/ValidationLayer.js
- async validate(entity) {
-   return this.validatorStack.validate(entity);
- }
+ async validate(entity) {
+   const result = await this.validatorStack.validate(entity);
+   if (!result.valid) {
+     this.stateManager?.emit?.('validationError', { entity, errors: result.errors || [] });
+   }
+   return result;
+ }

10) src/core/storage/ComposableSecurity.js
- async canAccess(resource, compartments = []) {
-   return true;
- }
+ async canAccess(resource, compartments = []) {
+   const ok = await this.activeSecurityModule?.canAccess?.(resource, compartments);
+   if (!ok) this.stateManager?.emit?.('accessDenied', { resource });
+   return !!ok;
+ }

11) src/core/storage/SyncLayer.js
- async performSync(options = {}) {
-   console.log('[SyncLayer] Performing sync...');
- }
+ async performSync(options = {}) {
+   try {
+     const stats = await this.syncStack.performSync(options);
+     this.stateManager?.emit?.('syncCompleted', stats);
+     return stats;
+   } catch (err) {
+     this.stateManager?.emit?.('syncError', err);
+     throw err;
+   }
+ }

12) src/state/QueryService.js (pivot to HybridState)
- export async function queryEntities(index, value) {
-   // previous direct adapter call or in-memory filter
- }
+ export async function queryEntities(stateManager, { store = 'objects', index, query, fallbackFilter } = {}) {
+   const results = await stateManager.storage.instance.query(store, index, query);
+   if (fallbackFilter) return results.filter(fallbackFilter);
+   return results;
+ }

13) src/state/EmbeddingManager.js (optional alignment)
- constructor() { /* ... */ }
+ constructor(stateManager) {
+   this.stateManager = stateManager;
+ }

- async upsertEmbedding(entityId, vector) { /* ... */ }
+ async upsertEmbedding(entityId, vector) {
+   const entity = this.stateManager.clientState.entities.get(entityId);
+   if (!entity) return;
+   // store in objects.content or dedicated embeddings table per your schema mirror
+   entity.embeddings = entity.embeddings || {};
+   entity.embeddings.default = vector;
+   await this.stateManager.storage.instance.put('objects', entity);
+   this.stateManager.emit?.('entitySaved', { store: 'objects', item: entity });
+ }

14) src/utils/MetricsReporter.js
- log(metric, value) {
-   console.log(`[Metrics] ${metric}: ${value}`);
- }
+ log(metric, value) {
+   console.log(`[Metrics] ${metric}: ${value}`);
+   try { this.stateManager?.metrics?.[metric] = value; } catch {}
+ }

15) src/grid/EnhancedGridRenderer.js (subscribe to state events)
- constructor(gridOptions) {
-   this.gridOptions = gridOptions;
- }
+ constructor(gridOptions, stateManager) {
+   this.gridOptions = gridOptions;
+   this.stateManager = stateManager;
+ }

+ bindState() {
+   const refresh = () => this.refresh?.();
+   this.stateManager.on?.('entitySaved', refresh);
+   this.stateManager.on?.('entityDeleted', refresh);
+   this.stateManager.on?.('syncCompleted', refresh);
+ }

16) src/grid/GridPolicyIntegration.js
- export function canEditCell(user, cell) { /* role check */ }
+ export function canEditCell(stateManager, user, cell) {
+   const security = stateManager.storage.instance.security;
+   return security?.canAccess?.('internal', user?.compartments || []) ?? false;
+ }

17) src/grid/GridToastManager.js (no change required; ensure exported show exists)
Sanity Pass (quick checks before wiring the Grid)

HybridStateManager.initializeStorageSystem() must call:

this.storage.loader.init() (already)

this.storage.loader.createStorage(...)

this.storage.instance.bindStateManager(this) ✅

ModularOfflineStorage includes:

bindStateManager(manager) ✅

CRUD passthroughs (put/get/delete/query) ✅

emits entitySaved / entityDeleted ✅

ModernIndexedDB mirrors the schema (objects, events, links, type_definitions, organizations, app_users, etc.) ✅

ValidationLayer, SyncLayer, ComposableSecurity now emit HybridState events ✅

After Applying: Connect the Grid

Example boot code:

import { StateUIBridge } from '../ui/StateUIBridge.js';
import EnhancedGridRenderer from '../grid/EnhancedGridRenderer.js';

const state = await SystemBootstrap();
const grid = new EnhancedGridRenderer({ /* options */ }, state);
grid.bindState();

const uiBridge = new StateUIBridge(state);
uiBridge.bindGrid(grid);