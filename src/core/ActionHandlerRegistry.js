/**
 * @file ActionHandlerRegistry.js
 * @description A centralized registry for managing and executing reusable action handlers for the EventFlowEngine.
 */

/**
 * @class ActionHandlerRegistry
 * @classdesc Manages the registration and execution of action handlers used by the EventFlowEngine.
 * This centralization makes actions reusable, testable, and consistent across the application.
 */
export class ActionHandlerRegistry {
	/** @private @type {import('./HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {Map<string, Function>} */
	#handlers = new Map();
	/**
	 * Creates an instance of ActionHandlerRegistry.
	 * @param {object} context - The application context.
	 * @param {import('./HybridStateManager.js').default} context.stateManager - The main state manager, providing access to all other managers.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
	}

	/**
	 * Initializes the registry by registering built-in action handlers.
	 */
	initialize() {
		this.#registerBuiltinHandlers();
		console.log(
			`[ActionHandlerRegistry] Initialized with ${this.#handlers.size} built-in handlers.`
		);
	}

	/**
	 * Registers a new action handler function.
	 * @param {string} actionType - The unique name for the action type.
	 * @param {Function} handler - The async function that executes the action. It receives `(action, event, flow, stateManager)`.
	 */
	register(actionType, handler) {
		if (this.#handlers.has(actionType)) {
			console.warn(
				`[ActionHandlerRegistry] Overwriting existing handler for action type: ${actionType}`
			);
		}
		this.#handlers.set(actionType, handler);
		this.#stateManager.metricsRegistry?.increment(
			"actionHandler.handlersRegistered"
		);
	}

	/**
	 * Retrieves a registered action handler.
	 * @param {string} actionType - The name of the action type.
	 * @returns {Function|undefined} The handler function, or undefined if not found.
	 */
	get(actionType) {
		return this.#handlers.get(actionType);
	}

	/**
	 * Registers a set of common, built-in action handler functions.
	 * @private
	 */
	#registerBuiltinHandlers() {
		// Logging action
		this.register(
			"log_event",
			async (action, event, flow, stateManager) => {
				const level = action.level || "info";
				const message = action.message || `Event: ${event.type}`;
				const allowedLevels = {
					log: console.log,
					warn: console.warn,
					error: console.error,
					info: console.info,
					debug: console.debug,
				};
				const logFn = allowedLevels[level] || console.log;
				logFn(`[EventFlow:${flow.id}] ${message}`, event.data || "");

				// Integrate with ForensicLogger for auditable logs
				if (action.audit) {
					const forensicLogger = stateManager.managers.forensicLogger;
					if (forensicLogger) {
						await forensicLogger.logAuditEvent(
							`EVENT_FLOW_LOG_${level.toUpperCase()}`,
							{
								flowId: flow.id,
								message,
								eventData: event.data,
							}
						);
					}
				}
			}
		);

		// Notification action
		this.register(
			"show_notification",
			async (action, event, flow, stateManager) => {
				const notification = {
					type: action.template || "info",
					message: action.message || `Event: ${event.type}`,
					duration: action.duration || 3000,
					data: event.data,
				};
				stateManager?.emit("show_notification", notification);
			}
		);

		// Metric tracking action
		this.register(
			"track_metric",
			async (action, event, flow, stateManager) => {
				const metric = {
					name: action.metric,
					value: action.value || 1,
				};
				stateManager?.metricsRegistry?.increment(
					metric.name,
					metric.value
				);
			}
		);

		// Cache invalidation action
		this.register(
			"invalidate_cache",
			async (action, event, flow, stateManager) => {
				const cacheManager = stateManager?.managers?.cacheManager;
				if (!cacheManager) return;

				let pattern = action.pattern || "*";

				// Simple template replacement
				pattern = pattern.replace(
					/\{\{data\.entity\.id\}\}/g,
					event.data?.entity?.id ?? event.data?.id ?? ""
				);

				if (pattern === "*") {
					cacheManager.clearAll();
					console.log(
						`[ActionHandlerRegistry] Cleared all caches via flow: ${flow.id}`
					);
				} else {
					// Invalidate a specific cache instance by name/pattern
					cacheManager.invalidate(pattern);
					console.log(
						`[ActionHandlerRegistry] Invalidated cache '${pattern}' via flow: ${flow.id}`
					);
				}
			}
		);

		// Event broadcasting action
		this.register(
			"broadcast_event",
			async (action, event, flow, stateManager) => {
				stateManager?.emit(action.event, {
					...event.data,
					originalEvent: event.type,
					flow: flow.id,
				});
			}
		);

		// Data manipulation action: Create or update an entity
		this.register(
			"save_entity",
			async (action, event, flow, stateManager) => {
				const entityData = action.entity || event.data?.entity;
				if (!entityData) {
					console.warn(
						`[ActionHandlerRegistry] 'save_entity' action in flow ${flow.id} is missing entity data.`
					);
					return;
				}

				try {
					await stateManager.saveEntity(entityData);
				} catch (error) {
					console.error(
						`[ActionHandlerRegistry] 'save_entity' action failed in flow ${flow.id}:`,
						error
					);
					// Optionally emit a failure event
					stateManager.emit("action_execution_error", {
						action,
						event,
						flow,
						error,
					});
				}
			}
		);
	}

	/**
	 * Cleans up the registry.
	 */
	cleanup() {
		this.#handlers.clear();
		console.log("[ActionHandlerRegistry] Cleaned up.");
	}
}

export default ActionHandlerRegistry;
