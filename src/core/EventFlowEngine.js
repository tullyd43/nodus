// core/EventFlowEngine.js
// Replaces EventBus singleton with composable, entity-driven event flows

import { BoundedStack } from "../utils/BoundedStack.js";

/**
 * @privateFields {#stateManager, #flows, #executionStack, #maxExecutionDepth, #eventQueue, #processing, #triggerIndex, #metrics, #conditionRegistry, #actionHandler, #errorHelpers}
 * @class EventFlowEngine
 * @classdesc Orchestrates a declarative, entity-driven event processing system.
 * It replaces a traditional event bus with a more powerful system where "flows"
 * (defined as data) are triggered by events, evaluated against conditions, and execute actions.
 */
export class EventFlowEngine {
	// V8.0 Parity: Use private fields for true encapsulation.
	#stateManager;
	/** @private @type {Map<string, object>} */
	#flows;
	/**
	 * Tracks the current stack of executing flows to prevent infinite loops.
	 * @private
	 * @type {BoundedStack<string>}
	 */
	#executionStack;
	/**
	 * The maximum depth for nested flow executions.
	 * @private
	 * @type {number}
	 */
	#maxExecutionDepth = 10;

	// V8.0 Parity: Use a BoundedStack for the event queue to prevent memory exhaustion.
	/** @private @type {BoundedStack<object>} */
	#eventQueue;
	/** @private @type {boolean} */
	#processing;
	/** @private @type {Map<string, Set<string>>} */
	#triggerIndex = new Map();

	// V8.0 Parity: Store derived managers for cleaner access.
	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('./ConditionRegistry.js').ConditionRegistry|null} */
	#conditionRegistry = null;
	/** @private @type {import('./ActionHandlerRegistry.js').default|null} */
	#actionHandler = null;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;

	/**
	 * Creates an instance of EventFlowEngine.
	 * @param {object} context - The application context.
	 * @param {import('./HybridStateManager.js').HybridStateManager} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;

		// V8.0 Parity: Derive all dependencies from the stateManager in the constructor.
		this.#metrics =
			this.#stateManager.metricsRegistry?.namespace("eventFlow");
		this.#conditionRegistry = this.#stateManager.managers.conditionRegistry;
		this.#actionHandler = this.#stateManager.managers.actionHandler;
		this.#errorHelpers = this.#stateManager.managers.errorHelpers;

		const queueSize =
			this.#stateManager.config?.eventFlow?.queueSize || 500;
		this.#eventQueue = new BoundedStack(queueSize);
		this.#eventQueue.on("overflow", (item) => {
			this.#metrics?.increment("queueOverflows");
			console.warn(
				"[EventFlowEngine] Event queue overflow. Event dropped:",
				item
			);
		});

		// Initialize private fields
		this.#flows = new Map();
		this.#executionStack = new BoundedStack(this.#maxExecutionDepth);
		this.#processing = false;
	}

	/**
	 * Initializes the EventFlowEngine by loading flows from storage and registering default handlers.
	 */
	initialize() {
		// V8.0 Parity: Loading flows is now handled externally by the bootstrap process.
		// The engine now listens to the stateManager for all events.
		this.#stateManager.on("*", (payload, eventName) => {
			if (eventName && eventName !== "systemInitialized") {
				// Avoid processing the init event itself
				this.#handleEvent(eventName, payload);
			}
		});

		this.#registerDefaultFlows();
		console.log(
			`EventFlowEngine initialized with ${this.#flows.size} flows`
		);
	}

	/**
	 * Registers a new event flow definition with the engine.
	 * @param {object} flowDefinition - The definition object for the flow.
	 * @returns {object} The registered flow object.
	 */
	registerFlow(flowDefinition) {
		const flow = {
			id:
				flowDefinition.id ||
				`flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			name: flowDefinition.name,
			description: flowDefinition.description,
			trigger: flowDefinition.trigger,
			conditions: flowDefinition.conditions || {},
			actions: flowDefinition.actions || {},
			enabled: flowDefinition.enabled !== false,
			priority: flowDefinition.priority || "normal",
			metadata: flowDefinition.metadata || {},
		};

		this.#flows.set(flow.id, flow);

		// Index by trigger events for fast lookup
		this.#indexFlowByTriggers(flow);

		return flow;
	}

	/**
	 * Indexes a flow by its trigger events for efficient lookup during event emission.
	 * @private
	 * @param {object} flow - The flow object to index.
	 */
	#indexFlowByTriggers(flow) {
		const triggers = Array.isArray(flow.trigger.events)
			? flow.trigger.events
			: [flow.trigger.events].filter(Boolean);

		for (const event of triggers) {
			if (!this.#triggerIndex.has(event)) {
				this.#triggerIndex.set(event, new Set());
			}
			this.#triggerIndex.get(event).add(flow.id);
		}
	}

	/**
	 * Handles events received from the stateManager's central event bus by queuing them for processing.
	 * The `emit` method is removed as the engine now listens directly to the stateManager.
	 * @param {string} eventName - The name of the event.
	 * @param {object} payload - The event data.
	 * @private
	 */
	#handleEvent(eventName, payload) {
		const wasAdded = this.#eventQueue.push({
			type: eventName,
			timestamp: Date.now(),
			data: payload,
		});
		if (!wasAdded) return; // Event was dropped due to queue overflow.

		if (!this.#processing) {
			this.#processEventQueue();
		}
	}

	/**
	 * Processes the event queue sequentially, ensuring events are handled in the order they were emitted.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #processEventQueue() {
		if (this.#processing) return;

		this.#processing = true;

		while (!this.#eventQueue.isEmpty()) {
			const event = this.#eventQueue.pop(); // BoundedStack pops from the "oldest" end.
			await this.#processEvent(event);
		}

		this.#processing = false;
	}

	/**
	 * Processes a single event by finding and executing all matching flows.
	 * @private
	 * @param {object} event - The event object to process.
	 * @returns {Promise<void>}
	 */
	async #processEvent(event) {
		const startTime = performance.now();
		this.#metrics?.increment("eventsProcessed");

		await this.#errorHelpers?.tryOr(
			async () => {
				// Find matching flows for this event
				const matchingFlows = this.#getFlowsForEvent(event.type);

				const sortedFlows = this.#sortFlowsByPriority(matchingFlows);

				// Execute each matching flow
				for (const flow of sortedFlows) {
					if (flow?.enabled) {
						await this.#executeFlow(flow, event);
					}
				}
			},
			null, // Let the global error handler manage it.
			{ component: "EventFlowEngine", operation: "processEvent" },
			() => this.#recordProcessingTime(performance.now() - startTime) // `finally` block
		);
	}

	/**
	 * Retrieves all flows that are triggered by a given event type, including wildcard ('*') triggers.
	 * @private
	 * @param {string} eventType - The type of the event.
	 * @returns {object[]} An array of matching flow objects.
	 */
	#getFlowsForEvent(eventType) {
		const matchingFlows = [];

		// Use trigger index for fast lookup
		if (this.#triggerIndex && this.#triggerIndex.has(eventType)) {
			const flowIds = this.#triggerIndex.get(eventType);
			for (const flowId of flowIds) {
				const flow = this.#flows.get(flowId);
				if (flow) {
					matchingFlows.push(flow);
				}
			}
		}

		// Also check for wildcard flows
		if (this.#triggerIndex && this.#triggerIndex.has("*")) {
			const wildcardFlowIds = this.#triggerIndex.get("*");
			for (const flowId of wildcardFlowIds) {
				const flow = this.#flows.get(flowId);
				if (flow && !matchingFlows.includes(flow)) {
					matchingFlows.push(flow);
				}
			}
		}

		return matchingFlows;
	}

	/**
	 * Sorts an array of flows based on their priority ('high', 'normal', 'low').
	 * @private
	 * @param {object[]} flows - The array of flows to sort.
	 * @returns {object[]} The sorted array of flows.
	 */
	#sortFlowsByPriority(flows) {
		const priorityOrder = { high: 3, normal: 2, low: 1 };

		return flows.sort((a, b) => {
			const aPriority = priorityOrder[a.priority] || 2;
			const bPriority = priorityOrder[b.priority] || 2;
			return bPriority - aPriority;
		});
	}

	/**
	 * Executes a single flow for a given event, including condition evaluation and action execution.
	 * @private
	 * @param {object} flow - The flow to execute.
	 * @param {object} event - The event that triggered the flow.
	 * @returns {Promise<void>}
	 */
	async #executeFlow(flow, event) {
		// Prevent infinite recursion
		if (this.#executionStack.isFull()) {
			const error = new Error(
				`Maximum flow execution depth (${this.#maxExecutionDepth}) reached for flow: ${flow.id}. This may indicate a recursive loop.`
			);
			this.#stateManager.managers.forensicLogger?.logAuditEvent(
				"EVENT_FLOW_RECURSION_LIMIT",
				{
					flowId: flow.id,
					executionStack: this.#executionStack.toArray(),
				}
			);
			this.#errorHelpers?.handleError(error, {
				component: "EventFlowEngine",
			});
			return;
		}

		this.#executionStack.push(flow.id);
		this.#metrics?.increment("flowsExecuted");

		try {
			const conditionResult = await this.#evaluateConditions(flow, event);
			const actions =
				flow.actions[conditionResult] || flow.actions.default || [];

			for (const action of actions) {
				await this.#executeAction(action, event, flow);
			}
		} finally {
			this.#executionStack.pop();
		}
	}

	/**
	 * Evaluates all conditions defined in a flow against an event to determine which set of actions to run.
	 * @private
	 * @param {object} flow - The flow containing the conditions.
	 * @param {object} event - The event context for evaluation.
	 * @returns {Promise<string>} A promise that resolves to the name of the matched condition (e.g., 'critical', 'default').
	 */
	async #evaluateConditions(flow, event) {
		this.#metrics?.increment("conditionsEvaluated");
		const startTime = performance.now();

		// If no conditions, return 'default'
		if (!flow.conditions || Object.keys(flow.conditions).length === 0) {
			return "default";
		}

		// Evaluate each condition
		for (const [conditionName, conditionDef] of Object.entries(
			flow.conditions
		)) {
			const result = await this.#evaluateCondition(conditionDef, event);
			if (result) {
				const duration = performance.now() - startTime;
				this.#metrics?.updateAverage("conditionEvalTime", duration);
				return conditionName; // Return the name of the first matched condition
			}
		}

		this.#metrics?.updateAverage(
			"conditionEvalTime",
			performance.now() - startTime
		);
		// No conditions matched
		return "default";
	}

	/**
	 * Evaluates a single condition definition.
	 * @private
	 * @param {object} conditionDef - The definition of the condition.
	 * @param {object} event - The event context.
	 * @returns {Promise<boolean>} A promise that resolves to `true` if the condition is met, `false` otherwise.
	 */
	async #evaluateCondition(conditionDef, event) {
		// V8.0 Parity: Ensure all required managers are available before proceeding.
		if (!this.#conditionRegistry || !this.#errorHelpers) {
			console.warn(
				"[EventFlowEngine] ConditionRegistry or ErrorHelpers not found. Cannot evaluate condition."
			);
			return false;
		}

		// V8.0 Parity: Enforce that all conditions must have a `type` and be evaluated by the registry.
		// The security subject is derived from the stateManager for the evaluation context.
		const securitySubject =
			this.#stateManager.managers.securityManager?.getSubject();

		return this.#errorHelpers.tryOr(
			() =>
				this.#conditionRegistry.evaluate(
					conditionDef,
					event,
					securitySubject
				),
			() => false, // Default to false on evaluation error
			{
				component: "EventFlowEngine",
				operation: "evaluateCondition",
				conditionType: conditionDef.type,
			}
		);
	}

	/**
	 * Executes a single action by finding and invoking its registered handler.
	 * @private
	 * @param {object} action - The action definition.
	 * @param {object} event - The current event context.
	 * @param {object} flow - The parent flow.
	 * @returns {Promise<void>}
	 * @private
	 */
	async #executeAction(action, event, flow) {
		// V8.0 Parity: Use the action handler from the dedicated manager and error helpers.
		if (!this.#actionHandler) {
			console.warn("[EventFlowEngine] ActionHandlerRegistry not found.");
			return;
		}
		const handler = this.#actionHandler.get(action.type);
		if (!handler) {
			console.warn(
				`[EventFlowEngine] No handler for action type: ${action.type}`
			);
			return;
		}

		if (!this.#errorHelpers) {
			console.warn("[EventFlowEngine] ErrorHelpers not found.");
			await handler(action, event, flow, this.#stateManager);
			return;
		}
		await this.#errorHelpers.tryOr(
			() => handler(action, event, flow, this.#stateManager),
			null, // Let the global handler manage it
			{
				component: "EventFlowEngine",
				operation: "executeAction",
				actionType: action.type,
			}
		);
		this.#metrics?.increment(`actionsExecuted.${action.type}`);
	}

	/**
	 * Rebuilds the internal trigger index. This is necessary after a flow is removed.
	 * @private
	 */
	#rebuildTriggerIndex() {
		this.#triggerIndex = new Map();
		for (const flow of this.#flows.values()) {
			this.#indexFlowByTriggers(flow);
		}
	}

	/**
	 * Records the processing time of an event for performance metrics.
	 * @private
	 * @param {number} duration - The duration of the event processing in milliseconds.
	 */
	#recordProcessingTime(duration) {
		this.#metrics?.updateAverage("averageProcessingTime", duration);
	}

	/**
	 * Retrieves the current performance and usage metrics for the engine.
	 * @returns {object} An object containing various metrics.
	 */
	getStats() {
		return {
			...(this.#metrics?.getAllAsObject() || {}),
			registeredFlows: this.#flows.size,
			currentExecutionDepth: this.#executionStack.length,
			queueSize: this.#eventQueue.size,
		};
	}

	/**
	 * Removes a flow from the engine by its ID.
	 * @param {string} flowId - The ID of the flow to remove.
	 * @returns {boolean} `true` if the flow was found and removed, `false` otherwise.
	 */
	removeFlow(flowId) {
		const removed = this.#flows.delete(flowId);
		if (removed) {
			this.#rebuildTriggerIndex();
		}
		return removed;
	}

	/**
	 * Registers the default system event flows for core functionality like error handling.
	 * @private
	 */
	#registerDefaultFlows() {
		// Error handling flow
		this.registerFlow({
			id: "error_handling",
			name: "Error Handling",
			trigger: {
				events: ["error", "exception", "action_execution_error"],
			},
			conditions: {
				critical: {
					type: "property_equals",
					property: "data.severity", // Matches AppError structure
					value: "high",
				},
				warning: {
					type: "property_equals",
					property: "data.severity",
					value: "warn",
				},
			},
			actions: {
				critical: [
					{ type: "log_event", level: "error" },
					{
						type: "show_notification",
						template: "error", // Use standard notification types
						duration: 0,
					},
					{ type: "track_metric", metric: "errors.critical" },
				],
				warning: [
					{ type: "log_event", level: "warn" },
					{
						type: "show_notification",
						template: "warning",
						duration: 5000,
					},
				],
				default: [{ type: "log_event", level: "info" }],
			},
		});

		// State change notification flow
		this.registerFlow({
			id: "state_change_notification",
			name: "State Change Notification",
			trigger: {
				events: ["entitySaved", "entityDeleted"], // V8.0 Parity: Use standardized event names
			},
			actions: {
				default: [
					// Invalidate a general entity cache and any specific entity view caches
					{ type: "invalidate_cache", pattern: "entity:*" },
				],
			},
		});

		console.log("[EventFlowEngine] Registered default system event flows.");
	}

	/**
	 * Exports all registered flows into an entity format suitable for storage.
	 * @returns {object[]} An array of flow entities.
	 */
	exportFlows() {
		return Array.from(this.#flows.values()).map((flow) => ({
			domain: "system",
			type: "event_flow",
			data: flow,
		}));
	}
}

export default EventFlowEngine;
