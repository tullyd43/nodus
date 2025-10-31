/**
 * @file ServiceRegistry.js
 * @description Implements the V8 Parity Mandate for a central service registry. This module is the *only*
 * authorized source for instantiating and providing core application services, ensuring a single,
 * manageable lifecycle for all major system components.
 * @see {@link d:\Development Files\repositories\nodus\DEVELOPER_MANDATES.md} - Mandate 1.3: Service Registry Enforcement.
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
import { OptimizationAccessControl } from "./OptimizationAccessControl.js";
import { CrossDomainSolution } from "./security/cds.js";
import { NonRepudiation } from "./security/NonRepudiation.js";
import GridPolicyService from "../grid/GridPolicyIntegration.js";
import { SecurityManager } from "./security/SecurityManager.js";
import { ValidationLayer } from "./storage/ValidationLayer.js";
import { SystemPolicies } from "./SystemPolicies_Cached.js";
import { CompleteGridSystem } from "../grid/CompleteGridSystem.js";
import { EnhancedGridRenderer } from "../grid/EnhancedGridRenderer.js";
import { CacheManager } from "../managers/CacheManager.js";
import { IdManager } from "../managers/IdManager.js";
import { EmbeddingManager } from "../state/EmbeddingManager.js";
import { QueryService } from "../state/QueryService.js";
import { ErrorHelpers } from "../utils/ErrorHelpers.js";
import { MetricsRegistry } from "../utils/MetricsRegistry.js";
import { MetricsReporter } from "../utils/MetricsReporter.js";

/**
 * @description Defines foundational services with no dependencies on other managers.
 * These are the first to be initialized.
 * @private
 */
const FOUNDATIONAL_SERVICES = {
	errorHelpers: ErrorHelpers, // Note: Static class
	metricsRegistry: MetricsRegistry,
	idManager: IdManager,
	cacheManager: CacheManager,
	securityManager: SecurityManager,
	nonRepudiation: NonRepudiation, // For signing
};

/**
 * @description Defines core logic services that may depend on foundational services.
 * @private
 */
const CORE_LOGIC_SERVICES = {
	forensicLogger: ForensicLogger,
	conditionRegistry: ConditionRegistry,
	actionHandler: ActionHandlerRegistry,
	componentRegistry: ComponentDefinitionRegistry,
	eventFlowEngine: EventFlowEngine,
	policies: SystemPolicies,
	validationLayer: ValidationLayer,
};

/**
 * @description Defines application-level services that depend on core logic services.
 * @private
 */
const APPLICATION_SERVICES = {
	plugin: ManifestPluginSystem,
	embeddingManager: EmbeddingManager,
	queryService: QueryService,
	adaptiveRenderer: AdaptiveRenderer,
	buildingBlockRenderer: BuildingBlockRenderer,
	extensionManager: ExtensionManager,
	enhancedGridRenderer: EnhancedGridRenderer,
	completeGridSystem: CompleteGridSystem,
	gridPolicyService: GridPolicyService,
};

/**
 * @description Defines specialized or server-side services.
 * @private
 */
const SPECIALIZED_SERVICES = {
	databaseOptimizer: DatabaseOptimizer,
	cds: CrossDomainSolution,
	optimizationAccessControl: OptimizationAccessControl,
	metricsReporter: MetricsReporter,
};

/**
 * A map of all service names to their constructors for easy lookup.
 * @private
 */
const SERVICE_CONSTRUCTORS = {
	...FOUNDATIONAL_SERVICES,
	...CORE_LOGIC_SERVICES,
	...APPLICATION_SERVICES,
	...SPECIALIZED_SERVICES,
};

/**
 * @class ServiceRegistry
 * @description Manages the lifecycle of all core services, ensuring they are instantiated correctly,
 * in a deterministic order, and only once. This enforces the "No Direct Instantiation" mandate.
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
	 * Initializes and registers all core services with the HybridStateManager in a specific,
	 * deterministic order to correctly manage dependencies.
	 * @returns {Promise<void>}
	 */
	async initializeAll() {
		console.log("[ServiceRegistry] Initializing all core services...");

		// V8.0 Parity: Mandate 1.3 - Define an explicit, non-negotiable initialization order.
		// This makes the system's dependency structure clear and robust.
		const INITIALIZATION_ORDER = [
			// 1. Foundational: No internal dependencies.
			"errorHelpers",
			"metricsRegistry",
			"idManager",
			"cacheManager",
			"securityManager",
			"nonRepudiation",
			// 2. Core Logic: Depends on foundational services.
			"forensicLogger",
			"conditionRegistry",
			"actionHandler",
			"componentRegistry",
			"eventFlowEngine",
			"policies", // Policies can depend on other core services for validation context.
			"validationLayer",
			// 3. Application Services: Depends on core logic.
			"buildingBlockRenderer",
			"adaptiveRenderer",
			"extensionManager",
			"enhancedGridRenderer", // CompleteGridSystem depends on EnhancedGridRenderer
			"completeGridSystem", // Depends on other grid services being available.
			"gridPolicyService",
		];

		for (const serviceName of INITIALIZATION_ORDER) {
			await this.get(serviceName);
		}
		// Load plugins last, after all core registries are available.
		await this.get("plugin");
		console.log("[ServiceRegistry] All core services initialized.");
	}

	/**
	 * Gets a service instance by name. If the service is not yet instantiated,
	 * it will be created, initialized, and stored in the state manager.
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

	/**
	 * Creates a new, non-singleton instance of a service for a specific use case,
	 * such as a namespaced MetricsRegistry. This is an exception to the singleton
	 * pattern and should be used sparingly.
	 * @param {string} serviceName - The name of the service to instantiate.
	 * @param {object} options - The constructor options for the new instance.
	 * @returns {object|null} The newly created service instance.
	 */
	createNamespacedInstance(serviceName, options) {
		const ServiceClass = SERVICE_CONSTRUCTORS[serviceName];
		if (!ServiceClass) {
			console.error(
				`[ServiceRegistry] Cannot create namespaced instance. Unknown service: ${serviceName}`
			);
			return null;
		}

		try {
			// The context is merged with the specific options for this instance.
			const instance = new ServiceClass({
				stateManager: this.#stateManager,
				...options,
			});
			return instance;
		} catch (error) {
			console.error(
				`[ServiceRegistry] Failed to create namespaced instance of '${serviceName}':`,
				error
			);
			return null;
		}
	}
}
