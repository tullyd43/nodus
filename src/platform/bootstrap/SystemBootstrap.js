/**
 * @file SystemBootstrap.js
 * @version 3.0.0 - Enterprise Observability Baseline
 * @description Production-ready application startup orchestrator with comprehensive security,
 * observability, and compliance features. Transforms configuration into a fully operational
 * application instance with deterministic initialization of all subsystems.
 *
 * ESLint Exception: nodus/require-async-orchestration
 * Justification: Bootstrap-level exception - orchestrator not available until after core
 * infrastructure initialization. Functions run pre-orchestrator by design.
 *
 * Security Classification: SECRET
 * License Tier: Core (system bootstrap is core functionality)
 * Compliance: MAC-enforced, forensic-audited, polyinstantiation-ready
 *
 * @see {@link DEVELOPER_MANDATES.md} - Central to enforcing Mandates 1.3, 2.1, 2.4, and 4.3.
 */



import { ObservabilityCacheHandler } from "@core/actions/handlers/ObservabilityCacheHandler.js";
import { createProxyTransport } from "@core/security/adapter.js";
import { createDefaultTransport } from "@core/security/transport.js";
import { HybridStateManager } from "@core/state/HybridStateManager.js";
import { createBindEngineService } from "@features/ui/BindEngine.js";
import { ObservabilityStackBootstrap } from "@platform/observability/ObservabilityStackBootstrap.js";
import { PolicyEngineAdapter } from "@platform/policies/PolicyEngineAdapter.js";
import {
	CanonicalResolver,
	DEFAULT_LEGACY_MAP,
} from "@platform/security/CanonicalResolver.js";
import { DateCore } from "@shared/lib/DateUtils.js";

/**
 * @class SystemBootstrap
 * @classdesc Enterprise-grade application startup orchestrator with comprehensive security,
 * MAC enforcement, forensic auditing, and automatic observability. Manages the deterministic
 * initialization of all subsystems from configuration to fully operational state.
 */
export class SystemBootstrap {
	/** @private @type {object} */
	#config;
	/** @private @type {import('@core/HybridStateManager.js').HybridStateManager|null} */
	#stateManager = null;
	/** @private @type {CanonicalResolver|null} */
	#canonicalResolver = null;
	/** @private @type {Set<string>} */
	#loggedWarnings = new Set();

	/**
	 * Creates an instance of SystemBootstrap with enterprise configuration.
	 * @param {object} config - The main application configuration
	 */
	constructor(config) {
		this.#config = config;
		this.#loggedWarnings = new Set();
	}

	/**
	 * Dispatches an action through the ActionDispatcher for observability.
	 * @private
	 * @param {string} actionType - Type of action to dispatch
	 * @param {object} payload - Action payload
	 */
	#dispatchAction(actionType, payload) {
		try {
			const actionDispatcher =
				this.#stateManager?.managers?.actionDispatcher;
			if (actionDispatcher) {
				actionDispatcher.dispatch(actionType, {
					...payload,
					actor: "system",
					timestamp: DateCore.timestamp(),
					source: "SystemBootstrap",
				});
			} else {
				// Best-effort logging during bootstrap when ActionDispatcher not yet available
				console.warn(`[SystemBootstrap:${actionType}]`, payload);
			}
		} catch (error) {
			// Ultimate fallback during bootstrap
			console.warn(
				`[SystemBootstrap] Action dispatch failed: ${actionType}`,
				{
					error: error.message,
					...payload,
				}
			);
		}
	}

	/**
	 * Emits warning with deduplication to prevent spam.
	 * @private
	 */
	#emitWarning(message, meta = {}) {
		const warningKey = `${message}:${JSON.stringify(meta)}`;
		if (this.#loggedWarnings.has(warningKey)) {
			return;
		}

		this.#loggedWarnings.add(warningKey);

		try {
			const actionDispatcher =
				this.#stateManager?.managers?.actionDispatcher;
			if (actionDispatcher) {
				actionDispatcher.dispatch("observability.warning", {
					component: "SystemBootstrap",
					message,
					meta,
					actor: "system",
					timestamp: DateCore.timestamp(),
					level: "warn",
				});
			} else {
				console.warn(`[SystemBootstrap:WARNING] ${message}`, meta);
			}
		} catch {
			console.warn(`[SystemBootstrap:WARNING] ${message}`, meta);
		}
	}

	/**
	 * Emits critical warning that bypasses deduplication.
	 * @private
	 */
	#emitCriticalWarning(message, meta = {}) {
		try {
			const actionDispatcher =
				this.#stateManager?.managers?.actionDispatcher;
			if (actionDispatcher) {
				actionDispatcher.dispatch("observability.critical", {
					component: "SystemBootstrap",
					message,
					meta,
					actor: "system",
					timestamp: DateCore.timestamp(),
					level: "error",
					critical: true,
				});
			} else {
				console.error(`[SystemBootstrap:CRITICAL] ${message}`, meta);
			}
		} catch {
			console.error(`[SystemBootstrap:CRITICAL] ${message}`, meta);
		}
	}

	/**
	 * The main entry point to start the application with enhanced observability.
	 * This method orchestrates the entire application startup sequence, initializing core services,
	 * running security checks, and bringing the application to a ready state.
	 * @param {object} authContext - The user's authentication context
	 * @returns {Promise<HybridStateManager>} The fully initialized state manager
	 */
	async initialize(authContext) {
		const initializationStart = DateCore.timestamp();

		this.#dispatchAction("system.initialization_started", {
			version: "8.0",
			authContext: authContext ? "provided" : "none",
		});

		try {
			// Phase 1: Create the State Manager. This is the single source of truth.
			this.#stateManager = new HybridStateManager(this.#config);

			this.#dispatchAction("system.state_manager_created", {
				phase: 1,
			});

			// Phase 2: Initialize Core Infrastructure (Storage, Security, Logging).
			// This phase is critical; failure here is fatal.
			await this.#initializeCoreInfrastructure(authContext);

			this.#dispatchAction("system.core_infrastructure_ready", {
				phase: 2,
			});

			// Phase 3: Run Post-Core Security Checks.
			// V8.0 Parity: Mandate 2.1 - Scan for forbidden code before loading app services.
			await this.#runSecurityChecks();

			this.#dispatchAction("system.security_checks_completed", {
				phase: 3,
			});

			// Phase 4: Initialize Application Services (Plugins, Event Flows, etc.).
			await this.#initializeAppServices();

			this.#dispatchAction("system.app_services_ready", {
				phase: 4,
			});

			// Phase 4b: Attach PolicyEngineAdapter after policies are loaded by the
			// service registry. This keeps policy adapter registration non-invasive
			// and respects the two-phase initialization (orchestrator first).
			try {
				const policies = this.#stateManager?.managers?.policies;
				if (!policies) {
					this.#emitWarning(
						"No policy manager found; PolicyEngineAdapter not attached"
					);
				} else {
					const policyAdapter = new PolicyEngineAdapter(policies, {
						stateManager: this.#stateManager,
					});
					this.#stateManager.managers.policyAdapter = policyAdapter;

					this.#dispatchAction("system.policy_adapter_attached", {
						phase: "4b",
					});

					// Inform the adapter that it was attached (best-effort forensic/reporting)
					try {
						if (
							typeof policyAdapter.reportPolicyChange ===
							"function"
						) {
							policyAdapter.reportPolicyChange({
								attached: true,
							});
						}
					} catch (e) {
						this.#emitWarning(
							"policyAdapter.reportPolicyChange failed",
							{
								error: e?.message,
							}
						);
					}

					// If an AsyncOrchestrator is available, register instrumentation
					// providers so async flows can consult the adapter.
					const asyncOrchestrator =
						this.#stateManager?.managers?.asyncOrchestrator;
					if (
						asyncOrchestrator &&
						typeof asyncOrchestrator.registerInstrumentation ===
							"function"
					) {
						asyncOrchestrator.registerInstrumentation({
							policyAdapter:
								this.#stateManager.managers.policyAdapter,
							metrics:
								this.#stateManager.managers.metricsRegistry,
							forensic:
								this.#stateManager.managers.forensicLogger,
							embedding: this.#stateManager.managers.embedding,
						});

						this.#dispatchAction(
							"system.instrumentation_registered",
							{
								component: "AsyncOrchestrator",
							}
						);
					}
				}
			} catch (err) {
				this.#emitCriticalWarning(
					"Failed to attach PolicyEngineAdapter",
					{
						error: err.message,
					}
				);
			}

			// Phase 5: Finalize and signal readiness.
			const result = this.#finalizeInitialization();

			const initializationEnd = DateCore.timestamp();
			const duration = initializationEnd - initializationStart;

			this.#dispatchAction("system.initialization_completed", {
				duration,
				phases: 5,
				success: true,
			});

			return result;
		} catch (error) {
			const initializationEnd = DateCore.timestamp();
			const duration = initializationEnd - initializationStart;

			this.#emitCriticalWarning(
				"CRITICAL FAILURE during initialization",
				{
					error: error.message,
					duration,
				}
			);

			this.#dispatchAction("system.initialization_failed", {
				error: error.message,
				duration,
				phase: "unknown",
			});

			throw new Error(`System initialization failed: ${error.message}`);
		}
	}

	/**
	 * Loads and initializes the core, foundational managers in the correct dependency order.
	 * This includes storage, security, logging, and metrics.
	 * @private
	 * @param {object} authContext - The user's authentication context
	 * @returns {Promise<void>}
	 */
	async #initializeCoreInfrastructure(authContext) {
		this.#dispatchAction("system.core_infrastructure_started", {
			authContext: authContext ? "provided" : "none",
		});

		// Initialize core services via the registry first to make them available.
		// This enforces Mandate 1.3: Service Registry Enforcement.
		await this.#stateManager.serviceRegistry.initializeAll();

		this.#dispatchAction("system.service_registry_initialized", {});

		// Ensure the secure storage stack is online before any downstream service
		// attempts to query it (plugins, grid, forensic logging, etc.).
		await this.#stateManager.initializeStorageSystem(
			authContext,
			this.#stateManager
		);

		this.#dispatchAction("system.storage_system_initialized", {});

		// Ensure CDS transport is wired early so services that perform network calls
		// via CDS.fetch have a platform-provided transport available.
		try {
			if (!globalThis.__NODUS_CDS_TRANSPORT__) {
				// Priority: proxy endpoint -> explicit transport -> pre-registered native fetch -> skip
				const cfgTransport = this.#config?.cdsTransport;
				if (this.#config?.cdsProxyEndpoint) {
					const native =
						typeof globalThis !== "undefined" &&
						globalThis.__NODUS_NATIVE_FETCH__;
					if (typeof native === "function") {
						globalThis.__NODUS_CDS_TRANSPORT__ =
							createProxyTransport(
								{
									proxyEndpoint:
										this.#config.cdsProxyEndpoint,
								},
								native,
								this.#stateManager.managers.forensicLogger // V8.0 Parity: Inject logger.
							);

						this.#dispatchAction(
							"system.cds_transport_configured",
							{
								type: "proxy",
								endpoint: this.#config.cdsProxyEndpoint,
							}
						);
					}
				} else if (typeof cfgTransport === "function") {
					globalThis.__NODUS_CDS_TRANSPORT__ = cfgTransport;

					this.#dispatchAction("system.cds_transport_configured", {
						type: "function",
					});
				} else if (
					cfgTransport &&
					typeof cfgTransport.nativeFetch === "function"
				) {
					globalThis.__NODUS_CDS_TRANSPORT__ = createDefaultTransport(
						cfgTransport.nativeFetch
					);

					this.#dispatchAction("system.cds_transport_configured", {
						type: "default",
					});
				} else if (
					typeof globalThis !== "undefined" &&
					typeof globalThis.__NODUS_NATIVE_FETCH__ === "function"
				) {
					globalThis.__NODUS_CDS_TRANSPORT__ = createDefaultTransport(
						globalThis.__NODUS_NATIVE_FETCH__
					);

					this.#dispatchAction("system.cds_transport_configured", {
						type: "native",
					});
				}
			}
		} catch (err) {
			this.#emitWarning("Failed to wire CDS transport", {
				error: err.message,
			});
		}

		// Initialize canonical resolver
		this.#dispatchAction("system.loading_core_managers", {});

		if (!this.#canonicalResolver) {
			const bootstrap = this;
			this.#canonicalResolver = new CanonicalResolver({
				searchPaths: [
					"/src/platform/security/encryption",
					"/src/platform/security",
					"/src/platform/storage/validation",
					"/src/platform/storage/sync",
					"/src/platform/storage/adapters",
					"/src/platform/storage",
				],
				legacyMap: new Map(Object.entries(DEFAULT_LEGACY_MAP)),
				baseURL: "/src/platform/storage/modules/",
				metrics: this.#stateManager?.metricsRegistry,
				forensic: this.#stateManager?.managers?.forensicLogger,
				policy: {
					get enforceCanonicalOnly() {
						try {
							return (
								bootstrap.#stateManager?.managers?.policies?.getPolicy?.(
									"storage",
									"enforce_canonical_only"
								) === true
							);
						} catch {
							return false;
						}
					},
				},
			});
			this.#stateManager.canonicalResolver = this.#canonicalResolver;

			this.#dispatchAction("system.canonical_resolver_initialized", {
				searchPathCount: 6,
			});
		}
	}

	/**
	 * Loads application-level services and lazy-loads non-critical managers.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #initializeAppServices() {
		this.#dispatchAction("system.app_services_loading", {});

		// The ServiceRegistry has already initialized all managers, including the plugin system.
		// Now, we load data that depends on those managers, like event flow definitions.
		await this.#loadEventFlows();

		// Register built-in action handlers that are not part of event flows.
		try {
			// Initialize the observability stack (registers forensic plugins, trackers, handlers)
			try {
				await ObservabilityStackBootstrap.initialize(
					this.#stateManager,
					this.#config?.enterpriseLicense || null
				);

				this.#dispatchAction(
					"system.observability_stack_initialized",
					{}
				);
			} catch (err) {
				this.#emitWarning("Observability stack init failed", {
					error: err.message,
				});
			}

			const actionHandler = this.#stateManager.managers.actionHandler;
			if (actionHandler && typeof actionHandler.register === "function") {
				for (const [actionType, handlerFn] of Object.entries(
					ObservabilityCacheHandler
				)) {
					actionHandler.register(actionType, handlerFn);
				}

				this.#dispatchAction(
					"system.observability_handlers_registered",
					{
						handlerCount: Object.keys(ObservabilityCacheHandler)
							.length,
					}
				);
			}
		} catch (err) {
			this.#emitWarning("Failed to register observability handlers", {
				error: err.message,
			});
		}

		// --- Initialize UI Framework (BindEngine) before lazy-loading non-critical managers ---
		try {
			await this.#initializeUIFramework();
		} catch (err) {
			this.#emitWarning("BindEngine initialization failed", {
				error: err.message,
			});
		}

		// --- Lazy-load non-critical managers in the background ---
		this.#lazyLoadManagers();

		// Ensure critical UI services are ready before finalizing bootstrap.
		// Sometimes services (like completeGridSystem) are registered but lazily
		// initialized; make sure we await their initialization so callers of
		// SystemBootstrap.initialize() (e.g., app bootstrap) can safely use them.
		try {
			const gridSvc = this.#stateManager?.managers?.completeGridSystem;
			if (gridSvc && typeof gridSvc.initialize === "function") {
				// Only initialize if not already initialized
				const already =
					(typeof gridSvc.isInitialized === "function" &&
						gridSvc.isInitialized()) ||
					false;
				if (!already) {
					this.#dispatchAction("system.grid_system_initializing", {});

					await gridSvc.initialize();

					this.#dispatchAction("system.grid_system_initialized", {});
				}
			}
		} catch (err) {
			this.#emitWarning(
				"completeGridSystem initialization failed (non-fatal)",
				{
					error: err.message,
				}
			);
		}
	}

	/**
	 * Runs critical security validation checks after core services are up.
	 * @private
	 */
	async #runSecurityChecks() {
		this.#dispatchAction("system.security_checks_started", {});

		// V8.0 Parity: Mandate 2.1 - This is where we would trigger the ArbitraryCodeValidator
		// on any pre-loaded or discovered plugin code before it's executed.
		const pluginManager = this.#stateManager.managers.plugin;
		if (
			pluginManager &&
			typeof pluginManager.validateAllRuntimes === "function"
		) {
			try {
				await pluginManager.validateAllRuntimes();

				this.#dispatchAction("system.plugin_runtimes_validated", {});
			} catch (error) {
				this.#emitCriticalWarning("Plugin runtime validation failed", {
					error: error.message,
				});
				throw error;
			}
		} else {
			this.#dispatchAction("system.plugin_validation_skipped", {
				reason: "plugin_manager_unavailable",
			});
		}
	}

	/**
	 * Finalizes the initialization process and emits the 'systemInitialized' event.
	 * @private
	 * @returns {HybridStateManager} The fully initialized state manager
	 */
	#finalizeInitialization() {
		this.#stateManager.initialized = true;

		this.#dispatchAction("system.initialization_finalized", {
			timestamp: DateCore.now(),
		});

		this.#stateManager.emit("systemInitialized", {
			timestamp: DateCore.now(),
		});

		return this.#stateManager;
	}

	/**
	 * Initializes the metrics and performance monitoring pipeline.
	 * This is done asynchronously to avoid blocking the main application startup.
	 * It ensures that `RenderMetrics` is loaded and started before `MetricsReporter`.
	 * @private
	 */
	#initializeMetricsPipeline() {
		this.#dispatchAction("system.metrics_pipeline_initializing", {});

		// The ServiceRegistry has already instantiated the reporter. We just need to start it.
		// We don't await this; it runs in the background.
		this.#stateManager.managers.metricsReporter
			?.start()
			.then(() => {
				this.#dispatchAction("system.metrics_pipeline_started", {});
			})
			.catch((err) => {
				this.#emitCriticalWarning("Failed to start metrics pipeline", {
					error: err.message,
				});
			});
	}

	/**
	 * Kicks off the loading of non-critical managers in the background.
	 * @private
	 */
	#lazyLoadManagers() {
		this.#dispatchAction("system.lazy_loading_started", {});

		// Load and start the full metrics pipeline in the background.
		this.#initializeMetricsPipeline();
	}

	/**
	 * Loads event flow definitions from storage and registers them with the engine.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #loadEventFlows() {
		const eventFlowEngine = this.#stateManager.managers.eventFlowEngine; // Already initialized by ServiceRegistry
		if (!eventFlowEngine || !this.#stateManager.storage.ready) {
			this.#dispatchAction("system.event_flows_skipped", {
				reason: !eventFlowEngine
					? "engine_unavailable"
					: "storage_not_ready",
			});
			return;
		}

		try {
			const flows = await this.#stateManager.storage.instance.query(
				"objects",
				"entity_type",
				"event_flow"
			);

			for (const entity of flows || []) {
				eventFlowEngine.registerFlow(
					entity.data || entity.content || entity
				);
			}

			this.#dispatchAction("system.event_flows_loaded", {
				count: flows?.length || 0,
			});
		} catch (err) {
			this.#emitCriticalWarning("Failed to load event flows", {
				error: err.message,
			});
		}
	}

	/**
	 * Initializes UI framework services such as the BindEngine and registers them with the service registry.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #initializeUIFramework() {
		this.#dispatchAction("system.ui_framework_initializing", {});

		const hybridStateManager = this.#stateManager;
		const forensicLogger = this.#stateManager.managers.forensicLogger;
		const eventFlow =
			this.#stateManager?.managers?.eventFlowEngine ||
			this.#stateManager?.managers?.eventFlow;
		const metrics = this.#stateManager?.managers?.metricsRegistry;
		const securityManager = this.#stateManager?.managers?.securityManager;
		const securityExplainer =
			this.#stateManager?.managers?.securityExplainer;

		try {
			const bindEngine = await createBindEngineService({
				stateManager: hybridStateManager,
				forensicLogger,
				eventBus: eventFlow,
				metrics,
				securityManager,
				securityExplainer,
			});

			this.#stateManager?.serviceRegistry?.register?.(
				"bindEngine",
				bindEngine
			);

			this.#dispatchAction("system.bind_engine_initialized", {
				components: [
					"stateManager",
					"forensicLogger",
					"eventBus",
					"metrics",
					"securityManager",
					"securityExplainer",
				],
			});
		} catch (error) {
			this.#emitCriticalWarning("BindEngine initialization failed", {
				error: error.message,
			});
			throw error;
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PUBLIC API METHODS
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Gets the current state manager instance.
	 * @returns {HybridStateManager|null} State manager or null if not initialized
	 */
	getStateManager() {
		return this.#stateManager;
	}

	/**
	 * Gets the canonical resolver instance.
	 * @returns {CanonicalResolver|null} Canonical resolver or null if not initialized
	 */
	getCanonicalResolver() {
		return this.#canonicalResolver;
	}

	/**
	 * Checks if the system is fully initialized.
	 * @returns {boolean} True if system is initialized
	 */
	isInitialized() {
		return this.#stateManager?.initialized || false;
	}

	/**
	 * Gets bootstrap statistics and configuration.
	 * @returns {object} Bootstrap information
	 */
	getBootstrapInfo() {
		return {
			initialized: this.isInitialized(),
			stateManagerAvailable: !!this.#stateManager,
			canonicalResolverAvailable: !!this.#canonicalResolver,
			configProvided: !!this.#config,
			version: "8.0",
		};
	}
}

export default SystemBootstrap;
