// core/EventFlowEngine.js
// Replaces EventBus singleton with composable, entity-driven event flows

export class EventFlowEngine {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.flows = new Map();
    this.conditions = new Map();
    this.actionHandlers = new Map();
    this.eventQueue = [];
    this.processing = false;
    
    // Performance metrics
    this.metrics = {
      eventsProcessed: 0,
      flowsExecuted: 0,
      conditionsEvaluated: 0,
      averageProcessingTime: 0,
      processingTimes: [],
      errorCount: 0
    };

    // Flow execution state
    this.executionStack = [];
    this.maxExecutionDepth = 10; // Prevent infinite loops
    
    this.initialize();
  }

  /**
   * Initialize the event flow engine
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
    
    console.log(`EventFlowEngine initialized with ${this.flows.size} flows`);
  }

  /**
   * Load event flows from stored entities
   */
  async loadEventFlows() {
    try {
      const flowEntities = await this.stateManager.getEntitiesByType('event_flow');
      
      for (const entity of flowEntities) {
        this.registerFlow(entity.data);
      }
    } catch (error) {
      console.error('Failed to load event flows:', error);
    }
  }

  /**
   * Register an event flow
   */
  registerFlow(flowDefinition) {
    const flow = {
      id: flowDefinition.id || `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: flowDefinition.name,
      description: flowDefinition.description,
      trigger: flowDefinition.trigger,
      conditions: flowDefinition.conditions || {},
      actions: flowDefinition.actions || {},
      enabled: flowDefinition.enabled !== false,
      priority: flowDefinition.priority || 'normal',
      metadata: flowDefinition.metadata || {}
    };

    this.flows.set(flow.id, flow);
    
    // Index by trigger events for fast lookup
    this.indexFlowByTriggers(flow);
    
    return flow;
  }

  /**
   * Index flow by its trigger events for fast lookup
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
   * Main event emission method - replaces EventBus.emit()
   */
  emit(eventType, data = {}) {
    const event = {
      type: eventType,
      data,
      timestamp: Date.now(),
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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
   * Process the event queue
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
   * Process a single event
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
      if (event.type !== 'event_processing_error') {
        this.emit('event_processing_error', { originalEvent: event, error });
      }
    } finally {
      const duration = performance.now() - startTime;
      this.recordProcessingTime(duration);
    }
  }

  /**
   * Get flows that match the event type
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
    if (this.triggerIndex && this.triggerIndex.has('*')) {
      const wildcardFlowIds = this.triggerIndex.get('*');
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
   * Sort flows by priority
   */
  sortFlowsByPriority(flows) {
    const priorityOrder = { 'high': 3, 'normal': 2, 'low': 1 };
    
    return flows.sort((a, b) => {
      const aPriority = priorityOrder[a.priority] || 2;
      const bPriority = priorityOrder[b.priority] || 2;
      return bPriority - aPriority;
    });
  }

  /**
   * Execute a flow for an event
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
      const actions = flow.actions[conditionResult] || flow.actions.default || [];
      
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
   * Evaluate conditions for a flow
   */
  async evaluateConditions(flow, event) {
    this.metrics.conditionsEvaluated++;
    
    // If no conditions, return 'default'
    if (!flow.conditions || Object.keys(flow.conditions).length === 0) {
      return 'default';
    }

    // Evaluate each condition
    for (const [conditionName, conditionDef] of Object.entries(flow.conditions)) {
      if (await this.evaluateCondition(conditionDef, event, flow)) {
        return conditionName;
      }
    }

    // No conditions matched
    return 'default';
  }

  /**
   * Evaluate a single condition
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
      for (const [property, expectedValue] of Object.entries(conditionDef)) {
        if (property === 'type') continue; // Skip type property
        
        const actualValue = this.getPropertyValue(event, property);
        
        if (!this.compareValues(actualValue, expectedValue)) {
          return false;
        }
      }

      return true;
      
    } catch (error) {
      console.error('Condition evaluation error:', error);
      return false;
    }
  }

  /**
   * Get property value from event data using dot notation
   */
  getPropertyValue(event, property) {
    const parts = property.split('.');
    let value = event;
    
    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) break;
    }
    
    return value;
  }

  /**
   * Compare values with support for operators
   */
  compareValues(actual, expected) {
    if (typeof expected === 'object' && expected !== null) {
      // Handle operators like { ">": 100 }, { "in": ["a", "b"] }
      for (const [operator, value] of Object.entries(expected)) {
        switch (operator) {
          case '>': return actual > value;
          case '<': return actual < value;
          case '>=': return actual >= value;
          case '<=': return actual <= value;
          case '!=': return actual !== value;
          case 'in': return Array.isArray(value) && value.includes(actual);
          case 'contains': return String(actual).includes(value);
          case 'regex': return new RegExp(value).test(String(actual));
          default: return actual === value;
        }
      }
    }
    
    return actual === expected;
  }

  /**
   * Execute an action
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
      this.emit('action_execution_error', {
        action,
        event,
        flow: flow.id,
        error: error.message
      });
    }
  }

  /**
   * Register default system flows
   */
  registerDefaultFlows() {
    // Error handling flow
    this.registerFlow({
      id: 'error_handling',
      name: 'Error Handling',
      trigger: { events: ['error', 'exception', 'action_execution_error'] },
      conditions: {
        critical: { 'data.severity': 'error', 'data.user_facing': true },
        warning: { 'data.severity': 'warn' },
        info: { 'data.severity': 'info' }
      },
      actions: {
        critical: [
          { type: 'log_error', level: 'error' },
          { type: 'show_notification', template: 'error_dialog', duration: 0 },
          { type: 'track_metric', metric: 'errors.critical' }
        ],
        warning: [
          { type: 'log_error', level: 'warn' },
          { type: 'show_notification', template: 'warning_toast', duration: 5000 }
        ],
        info: [
          { type: 'log_error', level: 'info' }
        ]
      }
    });

    // Performance monitoring flow
    this.registerFlow({
      id: 'performance_monitoring',
      name: 'Performance Monitoring',
      trigger: { events: ['operation_completed', 'render_completed'] },
      conditions: {
        slow: { 'data.duration': { '>': 1000 } },
        normal: { 'data.duration': { '<=': 1000 } }
      },
      actions: {
        slow: [
          { type: 'log_error', level: 'warn', message: 'Slow operation detected' },
          { type: 'track_metric', metric: 'performance.slow_operations' }
        ],
        normal: [
          { type: 'track_metric', metric: 'performance.operations' }
        ]
      }
    });

    // State change notification flow
    this.registerFlow({
      id: 'state_change_notification',
      name: 'State Change Notification',
      trigger: { events: ['entity_created', 'entity_updated', 'entity_deleted'] },
      conditions: {
        important: { 'data.entity.type': { 'in': ['user', 'organization', 'project'] } },
        normal: {}
      },
      actions: {
        important: [
          { type: 'broadcast_event', event: 'important_entity_changed' },
          { type: 'invalidate_cache', pattern: 'entity.*' }
        ],
        normal: [
          { type: 'invalidate_cache', pattern: `entity.${event.data.entity.id}` }
        ]
      }
    });
  }

  /**
   * Register built-in condition evaluators
   */
  registerBuiltinConditions() {
    // Time-based condition
    this.conditions.set('time_range', (conditionDef, event) => {
      const now = Date.now();
      const eventTime = event.timestamp;
      
      if (conditionDef.after && eventTime < conditionDef.after) return false;
      if (conditionDef.before && eventTime > conditionDef.before) return false;
      
      return true;
    });

    // User permission condition
    this.conditions.set('user_permission', (conditionDef, event) => {
      const userPermissions = event.data.userPermissions || [];
      const requiredPermissions = conditionDef.permissions || [];
      
      return requiredPermissions.every(perm => userPermissions.includes(perm));
    });

    // Rate limiting condition
    this.conditions.set('rate_limit', (conditionDef, event) => {
      const key = `rate_limit_${conditionDef.key || event.type}`;
      const limit = conditionDef.limit || 10;
      const window = conditionDef.window || 60000; // 1 minute default
      
      // Simple in-memory rate limiting (could be enhanced with Redis)
      if (!this.rateLimitCache) {
        this.rateLimitCache = new Map();
      }
      
      const now = Date.now();
      const record = this.rateLimitCache.get(key) || { count: 0, windowStart: now };
      
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
   * Register built-in action handlers
   */
  registerBuiltinActionHandlers() {
    // Logging action
    this.actionHandlers.set('log_error', (action, event, flow) => {
      const level = action.level || 'info';
      const message = action.message || `Event: ${event.type}`;
      
      console[level](`[EventFlow:${flow.id}] ${message}`, event.data);
    });

    // Notification action
    this.actionHandlers.set('show_notification', (action, event, flow, engine) => {
      const notification = {
        type: action.template || 'info',
        message: action.message || `Event: ${event.type}`,
        duration: action.duration || 3000,
        data: event.data
      };
      
      engine.emit('show_notification', notification);
    });

    // Metric tracking action
    this.actionHandlers.set('track_metric', (action, event, flow, engine) => {
      const metric = {
        name: action.metric,
        value: action.value || 1,
        timestamp: Date.now(),
        event: event.type,
        flow: flow.id
      };
      
      engine.emit('metric_tracked', metric);
    });

    // Cache invalidation action
    this.actionHandlers.set('invalidate_cache', (action, event, flow, engine) => {
      const pattern = action.pattern || '*';
      
      if (engine.stateManager.clientState?.cache) {
        // Simple pattern matching for cache invalidation
        const cache = engine.stateManager.clientState.cache;
        const keys = Array.from(cache.keys());
        
        for (const key of keys) {
          if (pattern === '*' || key.includes(pattern.replace('*', ''))) {
            cache.delete(key);
          }
        }
      }
    });

    // Event broadcasting action
    this.actionHandlers.set('broadcast_event', (action, event, flow, engine) => {
      engine.emit(action.event, {
        ...event.data,
        originalEvent: event.type,
        flow: flow.id
      });
    });
  }

  /**
   * Subscribe to events (replaces EventBus.on)
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
        always: [
          { type: 'execute_callback', callback: handler }
        ]
      }
    });

    // Register callback action handler for this subscription
    this.actionHandlers.set('execute_callback', (action, event, flow) => {
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
   * Rebuild trigger index after flow removal
   */
  rebuildTriggerIndex() {
    this.triggerIndex = new Map();
    for (const flow of this.flows.values()) {
      this.indexFlowByTriggers(flow);
    }
  }

  /**
   * Record processing time for metrics
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
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      registeredFlows: this.flows.size,
      registeredConditions: this.conditions.size,
      registeredActionHandlers: this.actionHandlers.size,
      currentExecutionDepth: this.executionStack.length,
      queueSize: this.eventQueue.length
    };
  }

  /**
   * Create flow from definition (for dynamic creation)
   */
  createFlow(definition) {
    return this.registerFlow(definition);
  }

  /**
   * Remove flow
   */
  removeFlow(flowId) {
    const removed = this.flows.delete(flowId);
    if (removed) {
      this.rebuildTriggerIndex();
    }
    return removed;
  }

  /**
   * Export all flows as entities
   */
  exportFlows() {
    return Array.from(this.flows.values()).map(flow => ({
      domain: 'system',
      type: 'event_flow',
      data: flow
    }));
  }
}

export default EventFlowEngine;