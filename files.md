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