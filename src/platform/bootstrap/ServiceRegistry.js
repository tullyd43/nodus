/**
 * @file ServiceRegistry.js
 * @description Implements the V8 Parity Mandate for a central service registry. This module is the *only*
 * authorized source for instantiating and providing core application services, ensuring a single,
 * manageable lifecycle for all major system components.
 * @see {@link d:\Development Files\repositories\nodus\DEVELOPER_MANDATES.md} - Mandate 1.3: Service Registry Enforcement.
 */

// Import all core service classes that will be managed by the registry.
import { CompleteGridSystem } from "@features/grid/CompleteGridSystem.js";
import { EnhancedGridRenderer } from "@features/grid/EnhancedGridRenderer.js";
import GridPolicyService from "@features/grid/policies/GridPolicyIntegration.js";
import { BuildingBlockRenderer } from "@features/ui/BuildingBlockRenderer.js";
import { AdaptiveRenderer } from "@features/ui/runtime/AdaptiveRenderer.js";
import { ComponentDefinitionRegistry } from "@features/ui/runtime/ComponentDefinition.js";
import { ActionHandlerRegistry } from "@platform/actions/ActionHandlerRegistry.js";
import { ExtensionManager } from "@platform/extensions/ExtensionManager.js";
import { ManifestPluginSystem } from "@platform/extensions/ManifestPluginSystem.js";
import AsyncOperationTracker from "@platform/observability/AsyncOperationTracker.js";
import AutomaticInstrumentation from "@platform/observability/AutomaticInstrumentation.js";
import SyncOperationTracker from "@platform/observability/SyncOperationTracker.js";
import { PolicyEngineAdapter } from "@platform/policies/PolicyEngineAdapter.js";
import { ConditionRegistry } from "@platform/rules/ConditionRegistry.js";
import { ForensicLogger } from "@platform/security/ForensicLogger.js";
import { InMemoryKeyring } from "@platform/security/keyring/Keyring.js";
import { NonRepudiation } from "@platform/security/NonRepudiation.js";
// PolicyEngineAdapter belongs with other security/policies imports.
import { SystemPolicies } from "@platform/security/policies/SystemPoliciesCached.js";
import Sanitizer from "@platform/security/Sanitizer.js";
import { SecurityManager } from "@platform/security/SecurityManager.js";
import { TenantPolicyService } from "@platform/security/TenantPolicyService.js";
import { AsyncOrchestrationService } from "@platform/services/AsyncOrchestrationService.js";
import { CacheManager } from "@platform/services/cache/CacheManager.js";
import { EmbeddingManager } from "@platform/services/EmbeddingManager.js";
import { IdManager } from "@platform/services/id/IdManager.js";
import { EventFlowEngine } from "@platform/state/EventFlowEngine.js";
import { QueryService } from "@platform/state/QueryService.js";
import { StorageLoader } from "@platform/storage/StorageLoader.js";
import { ValidationLayer } from "@platform/storage/ValidationLayer.js";
import { ErrorHelpers } from "@shared/lib/ErrorHelpers.js";
import { MetricsRegistry } from "@shared/lib/MetricsRegistry.js";
import { MetricsReporter } from "@shared/lib/MetricsReporter.js";

// Map service names to constructors/values. Keep this local so the registry
// controls instantiation and lifecycle for all core services (mandate 1.3).
const SERVICE_CONSTRUCTORS = {
	// Foundational
	errorHelpers: ErrorHelpers,
	cacheManager: CacheManager,
	metricsRegistry: MetricsRegistry,
	idManager: IdManager,
	securityManager: SecurityManager,
	keyring: InMemoryKeyring,
	nonRepudiation: NonRepudiation,

	// Core logic / observability
	forensicLogger: ForensicLogger,
	conditionRegistry: ConditionRegistry,
	sanitizer: Sanitizer,
	validationLayer: ValidationLayer,

	// Services
	storageLoader: StorageLoader,
	asyncOrchestrator: AsyncOrchestrationService,
	eventFlowEngine: EventFlowEngine,
	queryService: QueryService,
	actionHandler: ActionHandlerRegistry,
	componentRegistry: ComponentDefinitionRegistry,
	policies: SystemPolicies,
	// Observability service provides automaticInstrumentation and trackers
	observability: function ObservabilityService(context) {
		// context: { stateManager }
		const stateManager = context?.stateManager;

		// The AutomaticInstrumentation constructor expects the stateManager
		// instance. Do not pass a policy engine as the first argument (older
		// versions accepted (policyEngine, stateManager)). Instead, ensure the
		// instrumentation receives the stateManager so it can resolve adapters
		// (policyAdapter/cacheManager) from `stateManager.managers` when ready.
		const obs = {
			automaticInstrumentation: new AutomaticInstrumentation(
				stateManager
			),
			asyncOperationTracker: new AsyncOperationTracker(stateManager),
			syncOperationTracker: new SyncOperationTracker(stateManager),
		};
		return obs;
	},
	tenantPolicyService: TenantPolicyService,

	// UI / features
	buildingBlockRenderer: BuildingBlockRenderer,
	adaptiveRenderer: AdaptiveRenderer,
	extensionManager: ExtensionManager,
	plugin: ManifestPluginSystem,
	enhancedGridRenderer: EnhancedGridRenderer,
	gridPolicyService: GridPolicyService,
	completeGridSystem: CompleteGridSystem,
	embeddingManager: EmbeddingManager,
	metricsReporter: MetricsReporter,
};

/**
 * Lightweight ServiceRegistry that is the single-authority for creating core
 * services. It follows the project's mandates (no direct instantiation outside
 * this file) and runs initialization under the AsyncOrchestrator runner when
 * available so instrumentation/plugins attach automatically.
 */
export class ServiceRegistry {
	#stateManager;
	#env;

	constructor(stateManager, env = {}) {
		this.#stateManager = stateManager;
		this.#env = env;
		if (!this.#stateManager.managers) this.#stateManager.managers = {};
	}

	/**
	 * Initialize all core services in a deterministic order. If an
	 * AsyncOrchestrator is available, run initialization inside its runner so
	 * plugins/forensics/metrics are attached.
	 */
	async initializeAll() {
		const PRE_ORCHESTRATOR_SERVICES = ["errorHelpers", "asyncOrchestrator"];
		const POST_ORCHESTRATOR_SERVICES = [
			"cacheManager",
			"metricsRegistry",
			"observability",
			"idManager",
			"securityManager",
			"keyring",
			"nonRepudiation",
			"storageLoader",
			"sanitizer",
			"forensicLogger",
			"conditionRegistry",
			"actionHandler",
			"componentRegistry",
			"policies",
			"validationLayer",
			"eventFlowEngine",
			"queryService",
			"plugin",
			"buildingBlockRenderer",
			"adaptiveRenderer",
			"extensionManager",
			"enhancedGridRenderer",
			"gridPolicyService",
			"completeGridSystem",
		];

		for (const name of PRE_ORCHESTRATOR_SERVICES) {
			await this.get(name);
		}

		const orchestrator = this.#stateManager.managers.asyncOrchestrator;

		if (orchestrator) {
			// @performance-budget: 50ms
			await orchestrator.run(async () => {
				for (const name of POST_ORCHESTRATOR_SERVICES) {
					await this.get(name);
				}
			});
		}
	}

	/**
	 * Retrieve (and lazily instantiate) a named service. Uses AsyncOrchestrator
	 * runner when available so operations are audited.
	 * @param {string} serviceName
	 */
	async get(serviceName) {
		if (this.#stateManager.managers[serviceName]) {
			return this.#stateManager.managers[serviceName];
		}

		/* eslint-disable-next-line nodus/require-async-orchestration -- createAndInitService is a factory used by orchestrated runners below; execution is wrapped by orchestrator when available */
		const createAndInitService = async () => {
			const ServiceClass = SERVICE_CONSTRUCTORS[serviceName];

			// Special-case: policyAdapter is a thin runtime adapter that wraps the
			// SystemPolicies manager. Create it here so callers can `get("policyAdapter")`
			// from the ServiceRegistry without modifying the core SystemPolicies.
			if (!ServiceClass && serviceName === "policyAdapter") {
				try {
					const policies = this.#stateManager.managers.policies;
					if (!policies) {
						console.warn(
							"[ServiceRegistry] 'policyAdapter' requested but 'policies' manager not available yet."
						);
						return null;
					}
					const adapter = new PolicyEngineAdapter(policies, {
						stateManager: this.#stateManager,
					});
					this.#stateManager.managers.policyAdapter = adapter;
					return adapter;
				} catch (err) {
					console.error(
						"[ServiceRegistry] Failed to create policyAdapter:",
						err
					);
					return null;
				}
			}
			if (!ServiceClass) {
				console.error(
					`[ServiceRegistry] Unknown service: ${serviceName}`
				);
				return null;
			}

			try {
				const context = { stateManager: this.#stateManager };
				let instance;

				if (
					typeof ServiceClass === "function" &&
					ServiceClass.prototype?.constructor
				) {
					const opts = this.#resolveServiceOptions(serviceName);
					instance = opts
						? new ServiceClass(context, opts)
						: new ServiceClass(context);
				} else {
					instance = ServiceClass;
				}

				this.#stateManager.managers[serviceName] = instance;

				if (serviceName === "forensicLogger") {
					try {
						ForensicLogger.registerGlobal(instance);
					} catch {
						// best-effort
					}
				}

				// Attach a small helper so services can opt-in to forensic-wrapped
				// operations. This is non-invasive and only used when a forensic
				// registry is available.
				const registry =
					this.#stateManager?.managers?.observability
						?.forensicRegistry ||
					this.#stateManager?.forensicRegistry ||
					null;
				if (registry && instance) {
					instance.forensicRun = (op, fn, ctx = {}) =>
						registry.wrapOperation(
							"service",
							`${serviceName}.${op}`,
							() => Promise.resolve().then(() => fn()),
							Object.assign({ serviceId: serviceName }, ctx)
						);
				}

				if (typeof instance.initialize === "function") {
					/* PERFORMANCE_BUDGET: 20ms */
					const runInit = () => {
						const p = instance.initialize();
						return p && typeof p.then === "function"
							? p
							: Promise.resolve(p);
					};
					try {
						if (
							registry &&
							typeof registry.wrapOperation === "function"
						) {
							/* PERFORMANCE_BUDGET: 10ms */
							await registry.wrapOperation(
								"service",
								`initialize.${serviceName}`,
								runInit,
								{
									component: "ServiceRegistry",
									serviceId: serviceName,
								}
							);
						} else {
							await runInit();
						}
					} catch (initErr) {
						// Best-effort forensic notify on init failure (do not mask original error)
						try {
							if (
								registry &&
								typeof registry.wrapOperation === "function"
							) {
								registry.wrapOperation(
									"service",
									`initialize.${serviceName}.failed`,
									() =>
										Promise.resolve({
											error:
												initErr?.message ||
												String(initErr),
										}),
									{
										component: "ServiceRegistry",
										serviceId: serviceName,
									}
								);
							}
						} catch {
							/* noop - never throw from notification */
						}
						throw initErr;
					}
				}

				return instance;
			} catch (error) {
				console.error(
					`[ServiceRegistry] Failed to instantiate or initialize service '${serviceName}':`,
					error
				);
				delete this.#stateManager.managers[serviceName];
				throw error;
			}
		};

		// The orchestrator is a special case: it must be created before it can be used.
		// All other services must run under the orchestrator if it exists.
		const orchestrator = this.#stateManager?.managers?.asyncOrchestrator;
		if (!orchestrator || serviceName === "asyncOrchestrator") {
			if (!orchestrator && serviceName !== "asyncOrchestrator") {
				console.warn(
					`[ServiceRegistry] Orchestrator not found while getting '${serviceName}'. Service will be created without orchestration. Ensure 'asyncOrchestrator' is initialized first.`
				);
			}
			return createAndInitService();
		}

		// For all other services, use the orchestrator to run the initialization.
		// @performance-budget: 50ms
		return orchestrator.run(createAndInitService, {
			label: `service.initialize.${serviceName}`,
		});
	}

	/**
	 * Create a non-singleton (namespaced) instance for cases like MetricsRegistry
	 * namespacing. Returns the raw instance (does not register it on managers).
	 */
	createNamespacedInstance(serviceName, options) {
		const ServiceClass = SERVICE_CONSTRUCTORS[serviceName];
		if (!ServiceClass) return null;
		if (
			typeof ServiceClass === "function" &&
			ServiceClass.prototype?.constructor
		) {
			return options
				? new ServiceClass(
						{ stateManager: this.#stateManager },
						options
					)
				: new ServiceClass({ stateManager: this.#stateManager });
		}
		return ServiceClass;
	}

	// Keep resolver behavior from the original implementation (safe, no direct
	// window access).
	#resolveServiceOptions(serviceName) {
		try {
			const wcfg = this.#env?.NODUS_CONFIG || {};
			if (serviceName === "completeGridSystem") {
				const bool = (v, fallback) => {
					if (v === true || v === false) return v;
					if (typeof v === "string")
						return v.toLowerCase() === "true";
					return fallback;
				};
				return {
					enablePolicies: bool(
						wcfg?.grid?.enablePolicies ??
							this.#env?.VITE_GRID_ENABLE_POLICIES,
						true
					),
					enableAnalytics: bool(
						wcfg?.grid?.enableAnalytics ??
							this.#env?.VITE_GRID_ENABLE_ANALYTICS,
						true
					),
					enableToasts: bool(
						wcfg?.grid?.enableToasts ??
							this.#env?.VITE_GRID_ENABLE_TOASTS,
						true
					),
					enableAI: bool(
						wcfg?.grid?.enableAI ?? this.#env?.VITE_GRID_ENABLE_AI,
						true
					),
					enableNesting: bool(
						wcfg?.grid?.enableNesting ??
							this.#env?.VITE_GRID_ENABLE_NESTING,
						false
					),
					enableHistoryInspector: bool(
						wcfg?.grid?.enableHistoryInspector ??
							this.#env?.VITE_GRID_HISTORY_INSPECTOR,
						true
					),
				};
			}
			return null;
		} catch {
			return null;
		}
	}
}
