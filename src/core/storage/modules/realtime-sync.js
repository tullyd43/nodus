// modules/realtime-sync.js
// Real-time synchronization module for low-latency updates

/**
 * Realtime Sync Module
 * Loaded for: real-time collaboration, live updates
 * Bundle size: ~3KB (WebSocket-based sync)
 */
export default class RealtimeSync {
  #connection;
  #messageQueue = [];
  #subscriptions = new Map();
  #reconnectAttempts = 0;
  #config;
  #metrics = {
    messagesReceived: 0,
    messagesSent: 0,
    reconnections: 0,
    averageLatency: 0,
    connectionUptime: 0
  };

  constructor(options = {}) {
    this.name = 'RealtimeSync';
    this.supportsPush = true;
    this.supportsPull = true;
    
    this.#config = {
      serverUrl: options.serverUrl || 'wss://api.nodus.com/realtime',
      reconnectDelay: options.reconnectDelay || 1000,
      maxReconnectAttempts: options.maxReconnectAttempts || 5,
      heartbeatInterval: options.heartbeatInterval || 30000,
      messageTimeout: options.messageTimeout || 5000,
      enableCompression: options.enableCompression || true,
      ...options
    };

    console.log('[RealtimeSync] Loaded for real-time synchronization');
  }

  async init() {
    await this.#connect();
    console.log('[RealtimeSync] Real-time sync initialized');
    return this;
  }

  /**
   * Subscribe to real-time updates for entity types
   */
  subscribe(entityType, callback) {
    if (!this.#subscriptions.has(entityType)) {
      this.#subscriptions.set(entityType, new Set());
    }
    
    this.#subscriptions.get(entityType).add(callback);
    
    // Send subscription message to server
    this.#sendMessage({
      type: 'subscribe',
      entityType,
      timestamp: Date.now()
    });

    console.log(`[RealtimeSync] Subscribed to ${entityType} updates`);
  }

  /**
   * Unsubscribe from entity type updates
   */
  unsubscribe(entityType, callback = null) {
    if (!this.#subscriptions.has(entityType)) return;
    
    if (callback) {
      this.#subscriptions.get(entityType).delete(callback);
    } else {
      this.#subscriptions.get(entityType).clear();
    }

    // If no more callbacks, unsubscribe from server
    if (this.#subscriptions.get(entityType).size === 0) {
      this.#sendMessage({
        type: 'unsubscribe',
        entityType,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Push changes to server in real-time
   */
  async push(options) {
    const { items = [], operation = 'update' } = options;
    const results = [];

    for (const item of items) {
      try {
        const result = await this.#pushItem(item, operation);
        results.push({
          id: item.id,
          success: true,
          result
        });
      } catch (error) {
        results.push({
          id: item.id,
          success: false,
          error: error.message
        });
      }
    }

    return {
      pushed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  /**
   * Pull changes from server
   */
  async pull(options) {
    // Real-time sync doesn't need explicit pulls - data comes via subscriptions
    // But we can request latest state if needed
    const { entityTypes = [], since } = options;
    
    return new Promise((resolve) => {
      const requestId = this.#generateRequestId();
      const timeout = setTimeout(() => {
        resolve({
          pulled: 0,
          error: 'Request timeout'
        });
      }, this.#config.messageTimeout);

      // Set up one-time listener for response
      const responseHandler = (message) => {
        if (message.requestId === requestId) {
          clearTimeout(timeout);
          this.#removeMessageListener(responseHandler);
          resolve({
            pulled: message.items?.length || 0,
            items: message.items || []
          });
        }
      };

      this.#addMessageListener(responseHandler);

      // Send pull request
      this.#sendMessage({
        type: 'pull_request',
        requestId,
        entityTypes,
        since,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Sync individual item
   */
  async syncItem(item, operation) {
    return await this.#pushItem(item, operation);
  }

  /**
   * Check if item type is supported
   */
  supportsItem(item) {
    // Support all items for real-time sync
    return true;
  }

  /**
   * Get connection metrics
   */
  getMetrics() {
    const connectionDuration = this.#connection?.readyState === WebSocket.OPEN 
      ? Date.now() - this.#metrics.connectionStartTime 
      : 0;

    return {
      ...this.#metrics,
      connectionUptime: connectionDuration,
      isConnected: this.#isConnected(),
      subscriptions: this.#subscriptions.size,
      queuedMessages: this.#messageQueue.length
    };
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect() {
    if (this.#connection) {
      this.#connection.close();
      this.#connection = null;
    }
    
    this.#subscriptions.clear();
    this.#messageQueue = [];
    
    console.log('[RealtimeSync] Disconnected');
  }

  // Private methods
  async #connect() {
    return new Promise((resolve, reject) => {
      try {
        this.#connection = new WebSocket(this.#config.serverUrl);
        
        this.#connection.onopen = () => {
          console.log('[RealtimeSync] Connected to real-time server');
          this.#reconnectAttempts = 0;
          this.#metrics.connectionStartTime = Date.now();
          
          // Process queued messages
          this.#processMessageQueue();
          
          // Setup heartbeat
          this.#setupHeartbeat();
          
          resolve();
        };

        this.#connection.onmessage = (event) => {
          this.#handleMessage(event.data);
        };

        this.#connection.onclose = () => {
          console.log('[RealtimeSync] Connection closed');
          this.#handleDisconnection();
        };

        this.#connection.onerror = (error) => {
          console.error('[RealtimeSync] Connection error:', error);
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  async #reconnect() {
    if (this.#reconnectAttempts >= this.#config.maxReconnectAttempts) {
      console.error('[RealtimeSync] Max reconnection attempts reached');
      return;
    }

    this.#reconnectAttempts++;
    this.#metrics.reconnections++;
    
    const delay = this.#config.reconnectDelay * Math.pow(2, this.#reconnectAttempts - 1);
    console.log(`[RealtimeSync] Reconnecting in ${delay}ms (attempt ${this.#reconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        await this.#connect();
      } catch (error) {
        console.error('[RealtimeSync] Reconnection failed:', error);
        this.#reconnect();
      }
    }, delay);
  }

  #handleMessage(data) {
    try {
      const message = JSON.parse(data);
      this.#metrics.messagesReceived++;
      
      // Calculate latency if timestamp provided
      if (message.timestamp) {
        const latency = Date.now() - message.timestamp;
        this.#updateLatencyMetrics(latency);
      }

      switch (message.type) {
        case 'entity_update':
          this.#handleEntityUpdate(message);
          break;
        case 'entity_delete':
          this.#handleEntityDelete(message);
          break;
        case 'heartbeat':
          this.#handleHeartbeat(message);
          break;
        case 'error':
          this.#handleError(message);
          break;
        default:
          console.warn('[RealtimeSync] Unknown message type:', message.type);
      }

    } catch (error) {
      console.error('[RealtimeSync] Failed to parse message:', error);
    }
  }

  #handleEntityUpdate(message) {
    const { entityType, entity } = message;
    const callbacks = this.#subscriptions.get(entityType);
    
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback({
            type: 'update',
            entity,
            timestamp: message.timestamp
          });
        } catch (error) {
          console.error('[RealtimeSync] Callback error:', error);
        }
      });
    }
  }

  #handleEntityDelete(message) {
    const { entityType, entityId } = message;
    const callbacks = this.#subscriptions.get(entityType);
    
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback({
            type: 'delete',
            entityId,
            timestamp: message.timestamp
          });
        } catch (error) {
          console.error('[RealtimeSync] Callback error:', error);
        }
      });
    }
  }

  #handleHeartbeat(message) {
    // Respond to heartbeat
    this.#sendMessage({
      type: 'heartbeat_response',
      timestamp: Date.now()
    });
  }

  #handleError(message) {
    console.error('[RealtimeSync] Server error:', message.error);
  }

  #handleDisconnection() {
    if (this.#reconnectAttempts < this.#config.maxReconnectAttempts) {
      this.#reconnect();
    }
  }

  #sendMessage(message) {
    if (this.#isConnected()) {
      this.#connection.send(JSON.stringify(message));
      this.#metrics.messagesSent++;
    } else {
      // Queue message for when connection is restored
      this.#messageQueue.push(message);
    }
  }

  async #pushItem(item, operation) {
    return new Promise((resolve, reject) => {
      const requestId = this.#generateRequestId();
      const timeout = setTimeout(() => {
        reject(new Error('Push timeout'));
      }, this.#config.messageTimeout);

      // Set up one-time listener for response
      const responseHandler = (message) => {
        if (message.requestId === requestId) {
          clearTimeout(timeout);
          this.#removeMessageListener(responseHandler);
          
          if (message.success) {
            resolve(message.result);
          } else {
            reject(new Error(message.error));
          }
        }
      };

      this.#addMessageListener(responseHandler);

      // Send push message
      this.#sendMessage({
        type: 'push_item',
        requestId,
        item,
        operation,
        timestamp: Date.now()
      });
    });
  }

  #processMessageQueue() {
    while (this.#messageQueue.length > 0 && this.#isConnected()) {
      const message = this.#messageQueue.shift();
      this.#sendMessage(message);
    }
  }

  #setupHeartbeat() {
    setInterval(() => {
      if (this.#isConnected()) {
        this.#sendMessage({
          type: 'heartbeat',
          timestamp: Date.now()
        });
      }
    }, this.#config.heartbeatInterval);
  }

  #isConnected() {
    return this.#connection?.readyState === WebSocket.OPEN;
  }

  #generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  #updateLatencyMetrics(latency) {
    const totalMessages = this.#metrics.messagesReceived;
    const totalLatency = (this.#metrics.averageLatency * (totalMessages - 1)) + latency;
    this.#metrics.averageLatency = totalLatency / totalMessages;
  }

  #addMessageListener(handler) {
    // Add to a list of message listeners (simplified implementation)
    if (!this._messageListeners) {
      this._messageListeners = [];
    }
    this._messageListeners.push(handler);
  }

  #removeMessageListener(handler) {
    if (this._messageListeners) {
      const index = this._messageListeners.indexOf(handler);
      if (index > -1) {
        this._messageListeners.splice(index, 1);
      }
    }
  }
}
