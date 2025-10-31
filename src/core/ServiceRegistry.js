/**
 * @file ServiceRegistry.js
 * @description Central registry for instantiating and providing core application services.
 * @see {@link d:\Development Files\repositories\nodus\DEVELOPER_MANDATES.md} - Mandate 1.3
 */

// Import all core service classes that will be managed by the registry.
import { ActionHandlerRegistry } from "./ActionHandlerRegistry.js";
import { AdaptiveRenderer } from "./AdaptiveRenderer.js";
import { BuildingBlockRenderer } from "./BuildingBlockRenderer.js";
import { ComponentDefinitionRegistry } from "./ComponentDefinition.js";
import { ConditionRegistry } from "./ConditionRegistry.js";
import { DatabaseOptimizer } from "./DatabaseOptimizer.js";
import { EventFlowEngine } from "./EventFlowEngine.js";
import { ExtensionManager } from "./ExtensionManager.js";
import { ForensicLogger } from "./ForensicLogger.js";
import { ManifestPluginSystem } from "./ManifestPluginSystem.js";
import { CrossDomainSolution } from "./security/cds.js";
import { SecurityManager } from "./security/SecurityManager.js";
import { ValidationLayer } from "./storage/ValidationLayer.js";
import { SystemPolicies } from "./SystemPolicies_Cached.js";
import { EmbeddingManager } from "../state/EmbeddingManager.js";
import { QueryService } from "../state/QueryService.js";
import { CacheManager } from "../managers/CacheManager.js";
import { IdManager } from "../managers/IdManager.js";
import { ErrorHelpers } from "../utils/ErrorHelpers.js";
import { MetricsRegistry } from "../utils/MetricsRegistry.js";
import { MetricsReporter } from "../utils/MetricsReporter.js";
import { OptimizationAccessControl } from "./OptimizationAccessControl.js";

// A map of service names to their constructors.
const SERVICE_CONSTRUCTORS = {
	// Foundational (no dependencies on other managers)
	errorHelpers: ErrorHelpers, // Note: Static class
	metricsRegistry: MetricsRegistry,
	idManager: IdManager,
	cacheManager: CacheManager,
	securityManager: SecurityManager,

	// Core Logic (may depend on foundational services)
	forensicLogger: ForensicLogger,
	policies: SystemPolicies,
	conditionRegistry: ConditionRegistry,
	actionHandler: ActionHandlerRegistry,
	componentRegistry: ComponentDefinitionRegistry,
	eventFlowEngine: EventFlowEngine,
	validationLayer: ValidationLayer,

	// Application/Feature Level
	plugin: ManifestPluginSystem,
	embeddingManager: EmbeddingManager,
	queryService: QueryService,
	adaptiveRenderer: AdaptiveRenderer,
	buildingBlockRenderer: BuildingBlockRenderer,

	// Server-side / Specialized
	databaseOptimizer: DatabaseOptimizer,
	cds: CrossDomainSolution,
	optimizationAccessControl: OptimizationAccessControl,
	metricsReporter: MetricsReporter,
	extensionManager: ExtensionManager,
};

/**
 * @class ServiceRegistry
 * @description Manages the lifecycle of all core services, ensuring they are instantiated
 * correctly and only once.
 */
export class ServiceRegistry {
	/** @private @type {import('./HybridStateManager.js').default} */
	#stateManager;

	/**
	 * @param {import('./HybridStateManager.js').default} stateManager
	 */
	constructor(stateManager) {
		this.#stateManager = stateManager;
	}

	/**
	 * Initializes and registers all core services with the HybridStateManager.
	 * This method respects the dependency order.
	 * @returns {Promise<void>}
	 */
	async initializeAll() {
		console.log("[ServiceRegistry] Initializing all core services...");
		for (const serviceName of Object.keys(SERVICE_CONSTRUCTORS)) {
			await this.get(serviceName);
		}
		console.log("[ServiceRegistry] All core services initialized.");
	}

	/**
	 * Gets a service instance by name. If the service is not yet instantiated,
	 * it will be created, initialized, and cached.
	 * @param {string} serviceName - The name of the service to retrieve.
	 * @returns {Promise<object|null>} The service instance.
	 */
	async get(serviceName) {
		// If already instantiated, return it.
		if (this.#stateManager.managers[serviceName]) {
			return this.#stateManager.managers[serviceName];
		}

		const ServiceClass = SERVICE_CONSTRUCTORS[serviceName];
		if (!ServiceClass) {
			console.error(`[ServiceRegistry] Unknown service: ${serviceName}`);
			return null;
		}

		try {
			// Create a unified context object to pass to all service constructors.
			const context = {
				stateManager: this.#stateManager,
			};

			// Handle special context for DatabaseOptimizer
			if (serviceName === "databaseOptimizer") {
				context.dbClient = this.#stateManager.storage.instance?._db;
			}

			// Handle static classes vs. instantiable classes
			const instance =
				typeof ServiceClass === "function" &&
				ServiceClass.prototype?.constructor
					? new ServiceClass(context)
					: ServiceClass;

			// Assign the instance to the stateManager's managers object.
			this.#stateManager.managers[serviceName] = instance;

			// Call the async initialize method if it exists.
			if (typeof instance.initialize === "function") {
				await instance.initialize();
			}

			return instance;
		} catch (error) {
			console.error(
				`[ServiceRegistry] Failed to instantiate or initialize service '${serviceName}':`,
				error
			);
			// Ensure a failed service doesn't remain in the managers object.
			delete this.#stateManager.managers[serviceName];
			throw error; // Re-throw to halt bootstrap if a critical service fails.
		}
	}
}
