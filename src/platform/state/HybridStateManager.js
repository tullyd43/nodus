/**
 * @file HybridStateManager.js
 * @version 3.0.0 - Unified System Control
 * @description The HybridStateManager is the central authority and single source of truth for the entire Nodus
 * application. It manages all core services, application state, and system-wide policies, ensuring strict
 * adherence to security, performance, and observability mandates.
 *
 * Security Classification: TOP SECRET
 * License Tier: Core Infrastructure
 * Compliance: Full, SOX/HIPAA/GDPR/NATO-ready
 */

import { ServiceRegistry } from "@platform/bootstrap/ServiceRegistry.js";
import { DateCore } from "@shared/lib/DateUtils.js";

/**
 * @class HybridStateManager
 * @classdesc The HybridStateManager is the central nervous system of the Nodus platform. It is the definitive
 * source for all application state, service management, and policy enforcement. All access to core
 * functionality MUST flow through this manager to ensure universal observability and control.
 *
 * @property {object} managers - A collection of all core system services (e.g., securityManager, asyncOrchestrator).
 * @property {object} config - The application's runtime configuration.
 * @property {object} userContext - Information about the current user.
 * @property {object} license - The current license and its features.
 * @property {string} currentTenant - The identifier for the current tenant.
 */
export class HybridStateManager {
    /** @private @type {object} */
    #managers = {};
    /** @private @type {object} */
    #config = {};
    /** @private @type {object|null} */
    #userContext = null;
    /** @private @type {object|null} */
    #license = null;
    /** @private @type {string|null} */
    #currentTenant = null;
    /** @private @type {ServiceRegistry} */
    #serviceRegistry;
    /** @private @type {Map<string, Set<Function>>} */
    #eventListeners = new Map();
    /** @private @type {boolean} */
    #isInitialized = false;

    /**
     * Constructs the HybridStateManager.
     * @param {object} initialConfig - The initial application configuration.
     * @param {object} [env={}] - Environment variables.
     */
    constructor(initialConfig = {}, env = {}) {
        this.#config = initialConfig;
        this.#serviceRegistry = new ServiceRegistry(this, env);

        // Establish a direct, non-configurable link to the managers object.
        Object.defineProperty(this, "managers", {
            get: () => this.#managers,
            enumerable: true,
            configurable: false,
        });
    }

    /**
     * Initializes all core services and bootstraps the application. This is the main entry
     * point after instantiation. The process is orchestrated for full observability.
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.#isInitialized) {
            this.#emitWarning("StateManager already initialized.");
            return;
        }

        // First, initialize the orchestrator itself so it can manage other initializations.
        const orchestrator = await this.#serviceRegistry.get("asyncOrchestrator");
        if (!orchestrator) {
            throw new Error("Fatal: AsyncOrchestrator could not be initialized.");
        }

        // Now, run the rest of the initialization within an orchestrated flow.
        await orchestrator.run(
            async () => {
                await this.#serviceRegistry.initializeAll();

                // Post-initialization setup
                this.#license = this.#managers.license;
                this.#userContext = this.#managers.securityManager?.getSubject() || {};
                this.#currentTenant = this.#managers.tenantPolicyService?.getCurrentTenant() || null;

                this.#isInitialized = true;

                this.emit("system.initialized", {
                    timestamp: DateCore.timestamp(),
                    managerCount: Object.keys(this.#managers).length,
                });
            },
            {
                label: "system.bootstrap.initialization",
                classification: "TOP_SECRET",
                actorId: "system",
            }
        );
    }

    /**
     * Registers a listener for a specific event.
     * @param {string} eventName - The name of the event to listen for.
     * @param {Function} listener - The callback function to execute.
     */
    on(eventName, listener) {
        if (!this.#eventListeners.has(eventName)) {
            this.#eventListeners.set(eventName, new Set());
        }
        this.#eventListeners.get(eventName).add(listener);
    }

    /**
     * Emits an event, notifying all registered listeners.
     * This operation is orchestrated for full system observability.
     * @param {string} eventName - The name of the event to emit.
     * @param {object} [payload={}] - The data to pass to listeners.
     */
    emit(eventName, payload = {}) {
        const orchestrator = this.#managers.asyncOrchestrator;
        const listeners = this.#eventListeners.get(eventName);

        if (!listeners || listeners.size === 0) {
            return;
        }

        const operation = async () => {
            for (const listener of listeners) {
                try {
                    await Promise.resolve(listener(payload));
                } catch (error) {
                    this.#emitCriticalWarning(`Event listener for '${eventName}' failed.`, {
                        error: error.message,
                    });
                }
            }
        };

        if (orchestrator) {
            orchestrator.run(operation, {
                label: `system.event.${eventName}`,
                classification: "INTERNAL",
            }).catch(error => {
                 this.#emitCriticalWarning(`Orchestration of event '${eventName}' failed.`, {
                    error: error.message,
                });
            });
        } else {
            // Fallback if orchestrator is not yet available
            operation().catch(error => {
                 console.error(`[StateManager] Event emission failed for '${eventName}':`, error);
            });
        }
    }

    /**
     * Shuts down all services gracefully.
     * @returns {Promise<void>}
     */
    async shutdown() {
        this.emit("system.shutdown.start", {});
        for (const managerName in this.#managers) {
            const manager = this.#managers[managerName];
            if (typeof manager.shutdown === "function") {
                await manager.shutdown();
            }
        }
        this.#isInitialized = false;
        this.emit("system.shutdown.complete", {});
    }

    // --- Accessors ---

    /**
     * @type {object}
     */
    get config() {
        return this.#config;
    }

    /**
     * @type {object|null}
     */
    get userContext() {
        return this.#userContext;
    }

    /**
     * @type {object|null}
     */
    get license() {
        return this.#license;
    }

    /**
     * @type {string|null}
     */
    get currentTenant() {
        return this.#currentTenant;
    }

    /**
     * @type {boolean}
     */
    get isInitialized() {
        return this.#isInitialized;
    }

    /**
     * Emits a warning through the ActionDispatcher for system-wide observability.
     * @private
     * @param {string} message - The warning message.
     * @param {object} [meta={}] - Additional metadata.
     */
    #emitWarning(message, meta = {}) {
        this.#managers.actionDispatcher?.dispatch("observability.warning", {
            component: "HybridStateManager",
            message,
            meta,
            level: "warn",
        });
    }

    /**
     * Emits a critical warning.
     * @private
     * @param {string} message - The critical message.
     * @param {object} [meta={}] - Additional metadata.
     */
    #emitCriticalWarning(message, meta = {}) {
        const payload = {
            component: "HybridStateManager",
            message,
            meta,
            level: "error",
            critical: true,
        };
        if (this.#managers.actionDispatcher) {
            this.#managers.actionDispatcher.dispatch("observability.critical", payload);
        } else {
            console.error(`[StateManager:CRITICAL] ${message}`, meta);
        }
    }
}

export default HybridStateManager;