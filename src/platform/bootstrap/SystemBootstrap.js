/**
 * @file SystemBootstrap.js
 * @description Orchestrates the entire application startup sequence. This class is the main entry point
 * for initializing the system, ensuring all core services are loaded in the correct order, security
 * checks are performed, and the application is brought to a stable, ready state.
 * @see {@link d:\Development Files\repositories\nodus\DEVELOPER_MANDATES.md} - This file is central to enforcing Mandates 1.3, 2.1, 2.4, and 4.3.
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
 * @privateFields {#config, #stateManager, #metrics, #forensicLogger}
 * @class SystemBootstrap
 * @description Orchestrates the application's startup process, transforming a configuration object
 * into a fully operational application instance. It is responsible for the deterministic
 * initialization of all subsystems.
 */
export class SystemBootstrap {
	/** @private @type {object} */
	#config;
	/** @private @type {import('../../core/HybridStateManager.js').HybridStateManager|null} */
	#stateManager = null;

	/** @private @type {CanonicalResolver|null} */
	#canonicalResolver = null;
	/**
	 * @param {object} config - The main application configuration.
	 */
	constructor(config) {
		this.#config = config;
	}

	/**
	 * The main entry point to start the application.
	 * This method orchestrates the entire application startup sequence, initializing core services,
	 * running security checks, and bringing the application to a ready state.
	 * @param {object} authContext - The user's authentication context.
	 * @returns {Promise<HybridStateManager>} The fully initialized state manager.
	 */
	/* eslint-disable nodus/require-async-orchestration -- bootstrap-level exception: orchestrator not available until after core infra; functions below are intentionally run pre-orchestrator */
	async initialize(authContext) {
		console.log(`[SystemBootstrap] V8 Parity Initializing...`);

		try {
			// Phase 1: Create the State Manager. This is the single source of truth.
			this.#stateManager = new HybridStateManager(this.#config);

			// Phase 2: Initialize Core Infrastructure (Storage, Security, Logging).
			// This phase is critical; failure here is fatal.
			await this.#initializeCoreInfrastructure(authContext);

			// Phase 3: Run Post-Core Security Checks.
			// V8.0 Parity: Mandate 2.1 - Scan for forbidden code before loading app services.
			await this.#runSecurityChecks();

			// Phase 4: Initialize Application Services (Plugins, Event Flows, etc.).
			await this.#initializeAppServices();

			// Phase 4b: Attach PolicyEngineAdapter after policies are loaded by the
			// service registry. This keeps policy adapter registration non-invasive
			// and respects the two-phase initialization (orchestrator first).
			try {
				const policies = this.#stateManager?.managers?.policies;
				if (!policies) {
					console.warn(
						"[SystemBootstrap] No policy manager found; PolicyEngineAdapter not attached."
					);
				} else {
					const policyAdapter = new PolicyEngineAdapter(policies, {
						stateManager: this.#stateManager,
					});
					this.#stateManager.managers.policyAdapter = policyAdapter;
					console.info(
						"[SystemBootstrap] PolicyEngineAdapter attached."
					);

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
						console.warn(
							"[SystemBootstrap] policyAdapter.reportPolicyChange failed",
							e?.message
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
							metrics: this.#stateManager.managers.metricsRegistry,
							forensic: this.#stateManager.managers.forensicLogger,
							embedding: this.#stateManager.managers.embedding,
						});
						console.info(
							"[SystemBootstrap] Instrumentation registered with AsyncOrchestrator."
						);
					}
				}
			} catch (err) {
				console.warn(
					"[SystemBootstrap] Failed to attach PolicyEngineAdapter:",
					err
				);
			}

			// Phase 5: Finalize and signal readiness.
			return this.#finalizeInitialization();
		} catch (error) {
			console.error(
				`[SystemBootstrap] CRITICAL FAILURE during initialization:`,
				error
			);

			throw new Error(`System initialization failed: ${error.message}`);
		}
	}

	/**
	 * Loads and initializes the core, foundational managers in the correct dependency order.
	 * This includes storage, security, logging, and metrics.
	 * @private
	 * @param {object} authContext - The user's authentication context.
	 * @returns {Promise<void>}
	 */
	async #initializeCoreInfrastructure(authContext) {
		// Initialize core services via the registry first to make them available.
		// This enforces Mandate 1.3: Service Registry Enforcement.
		await this.#stateManager.serviceRegistry.initializeAll();

		// Ensure the secure storage stack is online before any downstream service
		// attempts to query it (plugins, grid, forensic logging, etc.).
		await this.#stateManager.initializeStorageSystem(
			authContext,
			this.#stateManager
		);

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
					}
				} else if (typeof cfgTransport === "function") {
					globalThis.__NODUS_CDS_TRANSPORT__ = cfgTransport;
				} else if (
					cfgTransport &&
					typeof cfgTransport.nativeFetch === "function"
				) {
					globalThis.__NODUS_CDS_TRANSPORT__ = createDefaultTransport(
						cfgTransport.nativeFetch
					);
				} else if (
					typeof globalThis !== "undefined" &&
					typeof globalThis.__NODUS_NATIVE_FETCH__ === "function"
				) {
					globalThis.__NODUS_CDS_TRANSPORT__ = createDefaultTransport(
						globalThis.__NODUS_NATIVE_FETCH__
					);
				}
			}
		} catch (err) {
			console.warn(
				"[SystemBootstrap] Failed to wire CDS transport:",
				err
			);
		}
		console.log(
			"[SystemBootstrap] Loading core infrastructure managers..."
		);
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
		}
	}

	/**
	 * Loads application-level services and lazy-loads non-critical managers.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #initializeAppServices() {
		console.log("[SystemBootstrap] Loading application services...");

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
				console.info(
					"[SystemBootstrap] Observability stack initialized."
				);
			} catch (err) {
				console.warn(
					"[SystemBootstrap] Observability stack init failed:",
					err
				);
			}
			const actionHandler = this.#stateManager.managers.actionHandler;
			if (actionHandler && typeof actionHandler.register === "function") {
				for (const [actionType, handlerFn] of Object.entries(
					ObservabilityCacheHandler
				)) {
					actionHandler.register(actionType, handlerFn);
				}
				console.info(
					"[SystemBootstrap] ObservabilityCacheHandler registered with ActionHandlerRegistry"
				);
			}
		}

		// --- Initialize UI Framework (BindEngine) before lazy-loading non-critical managers ---
		try {
			await this.#initializeUIFramework();
		} catch (err) {
			console.warn(
				"[SystemBootstrap] BindEngine initialization failed:",
				err
			);
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
					console.log(
						"[SystemBootstrap] Ensuring completeGridSystem is initialized..."
					);
					await gridSvc.initialize();
					console.info(
						"[SystemBootstrap] completeGridSystem initialized."
					);
				}
			}
		} catch (err) {
			console.warn(
				"[SystemBootstrap] Warning: completeGridSystem initialization failed (non-fatal):",
				err
			);
		}
	}

	/**
	 * Runs critical security validation checks after core services are up.
	 * @private
	 */
	async #runSecurityChecks() {
		console.log("[SystemBootstrap] Running security validation checks...");
		// V8.0 Parity: Mandate 2.1 - This is where we would trigger the ArbitraryCodeValidator
		// on any pre-loaded or discovered plugin code before it's executed.
		const pluginManager = this.#stateManager.managers.plugin;
		if (
			pluginManager &&
			typeof pluginManager.validateAllRuntimes === "function"
		) {
			await pluginManager.validateAllRuntimes();
		}
	}
	/**
	 * Finalizes the initialization process and emits the 'systemInitialized' event.
	 * @private
	 * @returns {HybridStateManager} The fully initialized state manager.
	 */
	#finalizeInitialization() {
		this.#stateManager.initialized = true;

		console.log("[SystemBootstrap] Application initialized successfully.");
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
		console.log("[SystemBootstrap] Initializing metrics pipeline...");

		// The ServiceRegistry has already instantiated the reporter. We just need to start it.
		// We don't await this; it runs in the background.
		this.#stateManager.managers.metricsReporter
			?.start()
			.then(() =>
				console.log(
					"[SystemBootstrap] Metrics reporting pipeline started."
				)
			)
			.catch((err) =>
				console.error("Failed to start metrics pipeline:", err)
			);
	}

	/**
	 * Kicks off the loading of non-critical managers in the background.
	 * @private
	 */
	#lazyLoadManagers() {
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
		if (!eventFlowEngine || !this.#stateManager.storage.ready) return;

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
			console.log(
				`[SystemBootstrap] Loaded ${flows?.length || 0} event flows from storage.`
			);
		} catch (err) {
			console.error("[SystemBootstrap] Failed to load event flows:", err);
		}
	}

	/**
	 * Initializes UI framework services such as the BindEngine and registers them with the service registry.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #initializeUIFramework() {
		/* eslint-enable nodus/require-async-orchestration */
		const hybridStateManager = this.#stateManager;
		const forensicLogger = this.#stateManager.managers.forensicLogger;
		const eventFlow =
			this.#stateManager?.managers?.eventFlowEngine ||
			this.#stateManager?.managers?.eventFlow;
		const metrics = this.#stateManager?.managers?.metricsRegistry;
		const securityManager = this.#stateManager?.managers?.securityManager;
		const securityExplainer =
			this.#stateManager?.managers?.securityExplainer;

		/* copilotGuard:require-forensic-envelope */
		/* ForensicLogger.createEnvelope */
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
		console.log(
			"[SystemBootstrap] ✅ BindEngine service initialized and running"
		);
	}
}
