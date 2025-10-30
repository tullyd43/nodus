// core/EventFlowEngine.js
// Replaces EventBus singleton with composable, entity-driven event flows

/**
 * @class EventFlowEngine
 * @classdesc Orchestrates a declarative, entity-driven event processing system.
 * It replaces a traditional event bus with a more powerful system where "flows"
 * (defined as data) are triggered by events, evaluated against conditions, and execute actions.
 */
export class EventFlowEngine {
	/**
	 * Creates an instance of EventFlowEngine.
	 * @param {import('./HybridStateManager.js').HybridStateManager} stateManager - The main state manager instance.
	 */
	constructor(stateManager) {
		/** @type {import('./HybridStateManager.js').HybridStateManager} */
		this.stateManager = stateManager;
		/** @private @type {Map<string, object>} */
		this.flows = new Map();
		/** @private @type {Map<string, Function>} */
		this.conditions = new Map();
		/** @private @type {Map<string, Function>} */
		this.actionHandlers = new Map();
		/** @private @type {object[]} */
		this.eventQueue = [];
		/** @private @type {boolean} */
		this.processing = false;

		/**
		 * Performance and usage metrics for the engine.
		 * @private
		 * @type {{eventsProcessed: number, flowsExecuted: number, conditionsEvaluated: number, averageProcessingTime: number, processingTimes: number[], errorCount: number}}
		 */
		this.metrics = {
			eventsProcessed: 0,
			flowsExecuted: 0,
			conditionsEvaluated: 0,
			averageProcessingTime: 0,
			processingTimes: [],
			errorCount: 0,
		};

		/**
		 * Tracks the current stack of executing flows to prevent infinite loops.
		 * @private
		 * @type {string[]}
		 */
		this.executionStack = [];
		/**
		 * The maximum depth for nested flow executions.
		 * @private
		 * @type {number}
		 */
		this.maxExecutionDepth = 10; // Prevent infinite loops

		this.initialize();
	}

	/**
	 * Initializes the EventFlowEngine by loading flows from storage and registering default handlers.
	 * @returns {Promise<void>}
	 */
	async initialize() {
		// Load event flows from stored entities
		await this.loadEventFlows();

		// Register default system flows
		this.registerDefaultFlows();

		// Register built-in conditions
		this.registerBuiltinConditions();

		// Register built-in action handlers
		this.registerBuiltinActionHandlers();

		console.log(
			`EventFlowEngine initialized with ${this.flows.size} flows`
		);
	}

	/**
	 * Loads event flow definitions from the persistent storage.
	 * @private
	 * @returns {Promise<void>}
	 */
	async loadEventFlows() {
		try {
			const flows = await this.stateManager.storage.instance?.query(
				"objects",
				"entity_type",
				"event_flow"
			); // ✅ store='objects'
			for (const entity of flows || []) {
				this.registerFlow(entity.data || entity.content || entity); // tolerate shapes
			}
		} catch (err) {
			console.error("Failed to load event flows:", err);
		}
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

		this.flows.set(flow.id, flow);

		// Index by trigger events for fast lookup
		this.indexFlowByTriggers(flow);

		return flow;
	}

	/**
	 * Indexes a flow by its trigger events for efficient lookup during event emission.
	 * @private
	 * @param {object} flow - The flow object to index.
	 */
	indexFlowByTriggers(flow) {
		if (!this.triggerIndex) {
			this.triggerIndex = new Map();
		}

		const triggers = Array.isArray(flow.trigger.events)
			? flow.trigger.events
			: [flow.trigger.events].filter(Boolean);

		for (const event of triggers) {
			if (!this.triggerIndex.has(event)) {
				this.triggerIndex.set(event, new Set());
			}
			this.triggerIndex.get(event).add(flow.id);
		}
	}

	/**
	 * Emits an event, adding it to a queue for asynchronous processing.
	 * This is the primary entry point for triggering event flows.
	 * @param {string} eventType - The type of the event being emitted.
	 * @param {object} [data={}] - The payload data associated with the event.
	 * @returns {string} The unique ID of the queued event.
	 */
	emit(eventType, data = {}) {
		const event = {
			type: eventType,
			data,
			timestamp: Date.now(),
			id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
		};

		// Add to processing queue
		this.eventQueue.push(event);

		// Process queue if not already processing
		if (!this.processing) {
			this.processEventQueue();
		}

		return event.id;
	}

	/**
	 * Processes the event queue sequentially, ensuring events are handled in the order they were emitted.
	 * @private
	 * @returns {Promise<void>}
	 */
	async processEventQueue() {
		if (this.processing) return;

		this.processing = true;

		while (this.eventQueue.length > 0) {
			const event = this.eventQueue.shift();
			await this.processEvent(event);
		}

		this.processing = false;
	}

	/**
	 * Processes a single event by finding and executing all matching flows.
	 * @private
	 * @param {object} event - The event object to process.
	 */
	async processEvent(event) {
		const startTime = performance.now();

		try {
			// Find matching flows for this event
			const matchingFlows = this.getFlowsForEvent(event.type);

			// Sort by priority
			const sortedFlows = this.sortFlowsByPriority(matchingFlows);

			// Execute each matching flow
			for (const flow of sortedFlows) {
				if (flow.enabled) {
					await this.executeFlow(flow, event);
				}
			}

			this.metrics.eventsProcessed++;
		} catch (error) {
			console.error(`Error processing event ${event.type}:`, error);
			this.metrics.errorCount++;

			// Emit error event (but prevent infinite loops)
			if (event.type !== "event_processing_error") {
				this.emit("event_processing_error", {
					originalEvent: event,
					error,
				});
			}
		} finally {
			const duration = performance.now() - startTime;
			this.recordProcessingTime(duration);
		}
	}

	/**
	 * Retrieves all flows that are triggered by a given event type, including wildcard ('*') triggers.
	 * @private
	 * @param {string} eventType - The type of the event.
	 * @returns {object[]} An array of matching flow objects.
	 */
	getFlowsForEvent(eventType) {
		const matchingFlows = [];

		// Use trigger index for fast lookup
		if (this.triggerIndex && this.triggerIndex.has(eventType)) {
			const flowIds = this.triggerIndex.get(eventType);
			for (const flowId of flowIds) {
				const flow = this.flows.get(flowId);
				if (flow) {
					matchingFlows.push(flow);
				}
			}
		}

		// Also check for wildcard flows
		if (this.triggerIndex && this.triggerIndex.has("*")) {
			const wildcardFlowIds = this.triggerIndex.get("*");
			for (const flowId of wildcardFlowIds) {
				const flow = this.flows.get(flowId);
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
	sortFlowsByPriority(flows) {
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
	async executeFlow(flow, event) {
		// Prevent infinite recursion
		if (this.executionStack.length >= this.maxExecutionDepth) {
			console.warn(`Maximum execution depth reached for flow ${flow.id}`);
			return;
		}

		this.executionStack.push(flow.id);

		try {
			// Evaluate conditions to determine which actions to execute
			const conditionResult = await this.evaluateConditions(flow, event);

			// Get actions for the condition result
			const actions =
				flow.actions[conditionResult] || flow.actions.default || [];

			// Execute actions
			for (const action of actions) {
				await this.executeAction(action, event, flow);
			}

			this.metrics.flowsExecuted++;
		} catch (error) {
			console.error(`Error executing flow ${flow.id}:`, error);
			throw error;
		} finally {
			this.executionStack.pop();
		}
	}

	/**
	 * Evaluates all conditions defined in a flow against an event to determine which set of actions to run.
	 * @private
	 * @param {object} flow - The flow containing the conditions.
	 * @param {object} event - The event context for evaluation.
	 * @returns {Promise<string>} A promise that resolves to the name of the matched condition (e.g., 'critical', 'default').
	 */
	async evaluateConditions(flow, event) {
		this.metrics.conditionsEvaluated++;

		// If no conditions, return 'default'
		if (!flow.conditions || Object.keys(flow.conditions).length === 0) {
			return "default";
		}

		// Evaluate each condition
		for (const [conditionName, conditionDef] of Object.entries(
			flow.conditions
		)) {
			if (await this.evaluateCondition(conditionDef, event, flow)) {
				return conditionName;
			}
		}

		// No conditions matched
		return "default";
	}

	/**
	 * Evaluates a single condition definition.
	 * @private
	 * @param {object} conditionDef - The definition of the condition.
	 * @param {object} event - The event context.
	 * @param {object} flow - The parent flow.
	 * @returns {Promise<boolean>} A promise that resolves to `true` if the condition is met, `false` otherwise.
	 */
	async evaluateCondition(conditionDef, event, flow) {
		try {
			// Built-in condition types
			if (conditionDef.type) {
				const conditionHandler = this.conditions.get(conditionDef.type);
				if (conditionHandler) {
					return await conditionHandler(conditionDef, event, flow);
				}
			}

			// Simple property conditions
			for (const [property, expectedValue] of Object.entries(
				conditionDef
			)) {
				if (property === "type") continue; // Skip type property

				const actualValue = this.getPropertyValue(event, property);

				if (!this.compareValues(actualValue, expectedValue)) {
					return false;
				}
			}

			return true;
		} catch (error) {
			console.error("Condition evaluation error:", error);
			return false;
		}
	}

	/**
	 * Retrieves a nested property value from an object using a dot-notation path.
	 * @private
	 * @param {object} event - The object to query.
	 * @param {string} property - The dot-notation path (e.g., 'data.user.id').
	 * @returns {*} The value at the specified path, or undefined if not found.
	 */
	getPropertyValue(event, property) {
		const parts = property.split(".");
		let value = event;

		for (const part of parts) {
			value = value?.[part];
			if (value === undefined) break;
		}

		return value;
	}

	/**
	 * Compares two values, with support for operators like '>', '<', 'in', 'contains', and 'regex'.
	 * @private
	 * @param {*} actual - The actual value from the event context.
	 * @param {*} expected - The expected value or operator object from the condition definition.
	 * @returns {boolean} The result of the comparison.
	 */
	compareValues(actual, expected) {
		if (typeof expected === "object" && expected !== null) {
			// Handle operators like { ">": 100 }, { "in": ["a", "b"] }
			for (const [operator, value] of Object.entries(expected)) {
				switch (operator) {
					case ">":
						return actual > value;
					case "<":
						return actual < value;
					case ">=":
						return actual >= value;
					case "<=":
						return actual <= value;
					case "!=":
						return actual !== value;
					case "in":
						return Array.isArray(value) && value.includes(actual);
					case "contains":
						return String(actual).includes(value);
					case "regex":
						return new RegExp(value).test(String(actual));
					default:
						return actual === value;
				}
			}
		}

		return actual === expected;
	}

	/**
	 * Executes a single action by finding and invoking its registered handler.
	 * @private
	 * @param {object} action - The action definition.
	 * @param {object} event - The current event context.
	 * @param {object} flow - The parent flow.
	 * @returns {Promise<void>}
	 */
	async executeAction(action, event, flow) {
		try {
			const actionHandler = this.actionHandlers.get(action.type);

			if (actionHandler) {
				await actionHandler(action, event, flow, this);
			} else {
				console.warn(`No handler for action type: ${action.type}`);
			}
		} catch (error) {
			console.error(`Error executing action ${action.type}:`, error);

			// Emit action error event
			this.emit("action_execution_error", {
				action,
				event,
				flow: flow.id,
				error: error.message,
			});
		}
	}

	/**
	 * Registers a set of default system flows for common tasks like error handling and performance monitoring.
	 * @private
	 */
	registerDefaultFlows() {
		// Error handling flow
		this.registerFlow({
			id: "error_handling",
			name: "Error Handling",
			trigger: {
				events: ["error", "exception", "action_execution_error"],
			},
			conditions: {
				critical: {
					"data.severity": "error",
					"data.user_facing": true,
				},
				warning: { "data.severity": "warn" },
				info: { "data.severity": "info" },
			},
			actions: {
				critical: [
					{ type: "log_error", level: "error" },
					{
						type: "show_notification",
						template: "error_dialog",
						duration: 0,
					},
					{ type: "track_metric", metric: "errors.critical" },
				],
				warning: [
					{ type: "log_error", level: "warn" },
					{
						type: "show_notification",
						template: "warning_toast",
						duration: 5000,
					},
				],
				info: [{ type: "log_error", level: "info" }],
			},
		});

		// Performance monitoring flow
		this.registerFlow({
			id: "performance_monitoring",
			name: "Performance Monitoring",
			trigger: { events: ["operation_completed", "render_completed"] },
			conditions: {
				slow: { "data.duration": { ">": 1000 } },
				normal: { "data.duration": { "<=": 1000 } },
			},
			actions: {
				slow: [
					{
						type: "log_error",
						level: "warn",
						message: "Slow operation detected",
					},
					{
						type: "track_metric",
						metric: "performance.slow_operations",
					},
				],
				normal: [
					{ type: "track_metric", metric: "performance.operations" },
				],
			},
		});

		// State change notification flow
		this.registerFlow({
			id: "state_change_notification",
			name: "State Change Notification",
			trigger: {
				events: ["entity_created", "entity_updated", "entity_deleted"],
			},
			conditions: {
				important: {
					"data.entity.type": {
						in: ["user", "organization", "project"],
					},
				},
				normal: {},
			},
			actions: {
				important: [
					{
						type: "broadcast_event", // The handler will pass the event data automatically
						event: "important_entity_changed",
					},
					{ type: "invalidate_cache", pattern: "entity.*" },
				],
				normal: [
					{
						type: "invalidate_cache", // The handler will need to resolve the ID at runtime
						pattern: "entity.{{data.entity.id}}", // Use template syntax
					},
				],
			},
		});
	}

	/**
	 * Registers a set of common, built-in condition evaluator functions.
	 * @private
	 */
	registerBuiltinConditions() {
		// Time-based condition
		this.conditions.set("time_range", (conditionDef, event) => {
			const eventTime = event.timestamp;

			if (conditionDef.after && eventTime < conditionDef.after)
				return false;
			if (conditionDef.before && eventTime > conditionDef.before)
				return false;

			return true;
		});

		// User permission condition
		this.conditions.set("user_permission", (conditionDef, event) => {
			const userPermissions = event.data.userPermissions || [];
			const requiredPermissions = conditionDef.permissions || [];

			return requiredPermissions.every((perm) =>
				userPermissions.includes(perm)
			);
		});

		// Rate limiting condition
		this.conditions.set("rate_limit", (conditionDef, event) => {
			const key = `rate_limit_${conditionDef.key || event.type}`;
			const limit = conditionDef.limit || 10;
			const window = conditionDef.window || 60000; // 1 minute default

			// Simple in-memory rate limiting (could be enhanced with Redis)
			if (!this.rateLimitCache) {
				this.rateLimitCache = new Map();
			}

			const now = Date.now();
			const record = this.rateLimitCache.get(key) || {
				count: 0,
				windowStart: now,
			};

			// Reset window if expired
			if (now - record.windowStart > window) {
				record.count = 0;
				record.windowStart = now;
			}

			record.count++;
			this.rateLimitCache.set(key, record);

			return record.count <= limit;
		});
	}

	/**
	 * Registers a set of common, built-in action handler functions.
	 * @private
	 */
	registerBuiltinActionHandlers() {
		// Logging action
		this.actionHandlers.set("log_error", (action, event, flow) => {
			const level = action.level || "info";
			const message = action.message || `Event: ${event.type}`;
			const allowedLevels = {
				log: console.log,
				warn: console.warn,
				error: console.error,
				info: console.info,
				debug: console.debug,
			};
			// Default to console.log if an invalid level is provided
			const logFn = allowedLevels[level] || console.log;
			logFn(`[EventFlow:${flow.id}] ${message}`, event.data || "");
		});

		// Notification action
		this.actionHandlers.set(
			"show_notification",
			(action, event, flow, engine) => {
				const notification = {
					type: action.template || "info",
					message: action.message || `Event: ${event.type}`,
					duration: action.duration || 3000,
					data: event.data,
				};

				engine.emit("show_notification", notification);
			}
		);

		// Metric tracking action
		this.actionHandlers.set(
			"track_metric",
			(action, event, flow, engine) => {
				const metric = {
					name: action.metric,
					value: action.value || 1,
					timestamp: Date.now(),
					event: event.type,
					flow: flow.id,
				};

				engine.emit("metric_tracked", metric);
			}
		);

		// Cache invalidation action
		this.actionHandlers.set(
			"invalidate_cache",
			(action, event, flow, engine) => {
				const pattern = action.pattern || "*";

				if (engine.stateManager.clientState?.cache) {
					// Simple pattern matching for cache invalidation
					const cache = engine.stateManager.clientState.cache;
					const keys = Array.from(cache.keys());

					for (const key of keys) {
						if (
							pattern === "*" ||
							key.includes(pattern.replace("*", ""))
						) {
							cache.delete(key);
						}
					}
				}
			}
		);

		// Event broadcasting action
		this.actionHandlers.set(
			"broadcast_event",
			(action, event, flow, engine) => {
				engine.emit(action.event, {
					...event.data,
					originalEvent: event.type,
					flow: flow.id,
				});
			}
		);
	}

	/**
	 * Subscribes a handler function to a specific event type.
	 * This is a convenience method that creates a dynamic event flow under the hood.
	 * @param {string} eventType - The name of the event to subscribe to.
	 * @param {Function} handler - The callback function to execute when the event is emitted.
	 * @returns {Function} An unsubscribe function to remove the listener.
	 */
	on(eventType, handler) {
		// Create a flow for this subscription
		const flowId = `subscription_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		this.registerFlow({
			id: flowId,
			name: `Subscription to ${eventType}`,
			trigger: { events: [eventType] },
			conditions: { always: {} },
			actions: {
				always: [{ type: "execute_callback", callback: handler }],
			},
		});

		// Register callback action handler for this subscription
		this.actionHandlers.set("execute_callback", (action, event, flow) => {
			if (action.callback) {
				action.callback(event.data);
			}
		});

		// Return unsubscribe function
		return () => {
			this.flows.delete(flowId);
			this.rebuildTriggerIndex();
		};
	}

	/**
	 * Rebuilds the internal trigger index. This is necessary after a flow is removed.
	 * @private
	 */
	rebuildTriggerIndex() {
		this.triggerIndex = new Map();
		for (const flow of this.flows.values()) {
			this.indexFlowByTriggers(flow);
		}
	}

	/**
	 * Records the processing time of an event for performance metrics.
	 * @private
	 * @param {number} duration - The duration of the event processing in milliseconds.
	 */
	recordProcessingTime(duration) {
		this.metrics.processingTimes.push(duration);

		// Keep only last 100 measurements
		if (this.metrics.processingTimes.length > 100) {
			this.metrics.processingTimes.shift();
		}

		// Calculate average
		this.metrics.averageProcessingTime =
			this.metrics.processingTimes.reduce((sum, time) => sum + time, 0) /
			this.metrics.processingTimes.length;
	}

	/**
	 * Retrieves the current performance and usage metrics for the engine.
	 * @returns {object} An object containing various metrics.
	 */
	getMetrics() {
		return {
			...this.metrics,
			registeredFlows: this.flows.size,
			registeredConditions: this.conditions.size,
			registeredActionHandlers: this.actionHandlers.size,
			currentExecutionDepth: this.executionStack.length,
			queueSize: this.eventQueue.length,
		};
	}

	/**
	 * Creates and registers a new flow from a definition object.
	 * @param {object} definition - The flow definition.
	 * @returns {object} The created flow object.
	 */
	createFlow(definition) {
		return this.registerFlow(definition);
	}

	/**
	 * Removes a flow from the engine by its ID.
	 * @param {string} flowId - The ID of the flow to remove.
	 * @returns {boolean} `true` if the flow was found and removed, `false` otherwise.
	 */
	removeFlow(flowId) {
		const removed = this.flows.delete(flowId);
		if (removed) {
			this.rebuildTriggerIndex();
		}
		return removed;
	}

	/**
	 * Exports all registered flows into an entity format suitable for storage.
	 * @returns {object[]} An array of flow entities.
	 */
	exportFlows() {
		return Array.from(this.flows.values()).map((flow) => ({
			domain: "system",
			type: "event_flow",
			data: flow,
		}));
	}
}

export default EventFlowEngine;
