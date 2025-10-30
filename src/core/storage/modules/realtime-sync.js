// modules/realtime-sync.js
// Real-time synchronization module for low-latency updates

/**
 * @description
 * Manages real-time data synchronization using a WebSocket connection.
 * This module is designed for low-latency applications like live collaboration,
 * instant messaging, or real-time dashboards. It handles connection management,
 * automatic reconnection, message queuing, and a subscription model for receiving updates.
 *
 * @module RealtimeSync
 */
export default class RealtimeSync {
	/**
	 * @private
	 * @type {WebSocket|null}
	 */
	#connection;
	/**
	 * @private
	 * @type {Array<object>}
	 */
	#messageQueue = [];
	/**
	 * @private
	 * @type {Map<string, Set<Function>>}
	 */
	#subscriptions = new Map();
	/**
	 * @private
	 * @type {number}
	 */
	#reconnectAttempts = 0;
	/**
	 * @private
	 * @type {object}
	 */
	#config;
	/**
	 * @private
	 * @type {{messagesReceived: number, messagesSent: number, reconnections: number, averageLatency: number, connectionUptime: number}}
	 */
	#metrics = {
		messagesReceived: 0,
		messagesSent: 0,
		reconnections: 0,
		averageLatency: 0,
		connectionUptime: 0,
	};

	/**
	 * Creates an instance of RealtimeSync.
	 * @param {object} [options={}] - Configuration options for the WebSocket connection.
	 * @param {string} [options.serverUrl='wss://api.nodus.com/realtime'] - The URL of the real-time server.
	 * @param {number} [options.reconnectDelay=1000] - The base delay for reconnection attempts in milliseconds.
	 * @param {number} [options.maxReconnectAttempts=5] - The maximum number of times to try reconnecting.
	 * @param {number} [options.heartbeatInterval=30000] - The interval for sending heartbeat messages to keep the connection alive.
	 * @param {number} [options.messageTimeout=5000] - The timeout for waiting for a response to a request.
	 */
	constructor(options = {}) {
		this.name = "RealtimeSync";
		this.supportsPush = true;
		this.supportsPull = true;

		this.#config = {
			serverUrl: options.serverUrl || "wss://api.nodus.com/realtime",
			reconnectDelay: options.reconnectDelay || 1000,
			maxReconnectAttempts: options.maxReconnectAttempts || 5,
			heartbeatInterval: options.heartbeatInterval || 30000,
			messageTimeout: options.messageTimeout || 5000,
			enableCompression: options.enableCompression || true,
			...options,
		};

		console.log("[RealtimeSync] Loaded for real-time synchronization");
	}

	/**
	 * Initializes the module by establishing a connection to the real-time server.
	 * @returns {Promise<this>} The initialized instance.
	 */
	async init() {
		await this.#connect();
		console.log("[RealtimeSync] Real-time sync initialized");
		return this;
	}

	/**
	 * Subscribes to real-time updates for a specific entity type.
	 * @param {string} entityType - The type of entity to subscribe to (e.g., 'event', 'object').
	 * @param {Function} callback - The callback function to execute when an update is received.
	 */
	subscribe(entityType, callback) {
		if (!this.#subscriptions.has(entityType)) {
			this.#subscriptions.set(entityType, new Set());
		}

		this.#subscriptions.get(entityType).add(callback);

		// Send subscription message to server
		this.#sendMessage({
			type: "subscribe",
			entityType,
			timestamp: Date.now(),
		});

		console.log(`[RealtimeSync] Subscribed to ${entityType} updates`);
	}

	/**
	 * Unsubscribes from real-time updates for an entity type.
	 * @param {string} entityType - The entity type to unsubscribe from.
	 * @param {Function} [callback=null] - The specific callback to remove. If null, all callbacks for the entity type are removed.
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
				type: "unsubscribe",
				entityType,
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Pushes an array of items to the server in real-time.
	 * Each item is sent as a separate message.
	 * @param {object} options - The push operation options.
	 * @param {Array<object>} [options.items=[]] - The array of items to push.
	 * @param {string} [options.operation='update'] - The default operation type for the items.
	 * @returns {Promise<{pushed: number, failed: number, results: Array<object>}>} A summary of the push operation.
	 */
	async push(options) {
		const { items = [], operation = "update" } = options;
		const results = [];

		for (const item of items) {
			try {
				const result = await this.#pushItem(item, operation);
				results.push({
					id: item.id,
					success: true,
					result,
				});
			} catch (error) {
				results.push({
					id: item.id,
					success: false,
					error: error.message,
				});
			}
		}

		return {
			pushed: results.filter((r) => r.success).length,
			failed: results.filter((r) => !r.success).length,
			results,
		};
	}

	/**
	 * Pulls the latest state for given entity types from the server.
	 * In a real-time system, this is typically used for initial state synchronization.
	 * @param {object} options - The pull operation options.
	 * @param {string[]} [options.entityTypes=[]] - The types of entities to pull.
	 * @param {string|number} [options.since] - A timestamp or token indicating the last sync point.
	 * @returns {Promise<{pulled: number, items?: Array<object>, error?: string}>} The pulled data.
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
					error: "Request timeout",
				});
			}, this.#config.messageTimeout);

			// Set up one-time listener for response
			const responseHandler = (message) => {
				if (message.requestId === requestId) {
					clearTimeout(timeout);
					this.#removeMessageListener(responseHandler);
					resolve({
						pulled: message.items?.length || 0,
						items: message.items || [],
					});
				}
			};

			this.#addMessageListener(responseHandler);

			// Send pull request
			this.#sendMessage({
				type: "pull_request",
				requestId,
				entityTypes,
				since,
				timestamp: Date.now(),
			});
		});
	}

	/**
	 * Syncs a single item by pushing it to the server in real-time.
	 * @param {object} item - The item to sync.
	 * @param {string} operation - The operation type (e.g., 'create', 'update').
	 * @returns {Promise<object>} A promise that resolves with the result of the push.
	 */
	async syncItem(item, operation) {
		return await this.#pushItem(item, operation);
	}

	/**
	 * Check if item type is supported
	 * @param {object} item - The item to check.
	 * @returns {boolean} Always returns true as this module supports all item types.
	 */
	supportsItem(item) {
		// Support all items for real-time sync
		return true;
	}

	/**
	 * Retrieves performance and state metrics for the real-time connection.
	 * @returns {object} An object containing various metrics.
	 */
	getMetrics() {
		const connectionDuration =
			this.#connection?.readyState === WebSocket.OPEN
				? Date.now() - this.#metrics.connectionStartTime
				: 0;

		return {
			...this.#metrics,
			connectionUptime: connectionDuration,
			isConnected: this.#isConnected(),
			subscriptions: this.#subscriptions.size,
			queuedMessages: this.#messageQueue.length,
		};
	}

	/**
	 * Disconnects from the server and cleans up resources.
	 */
	async disconnect() {
		if (this.#connection) {
			this.#connection.close();
			this.#connection = null;
		}

		this.#subscriptions.clear();
		this.#messageQueue = [];

		console.log("[RealtimeSync] Disconnected");
	}

	// Private methods
	/**
	 * Establishes a WebSocket connection to the server and sets up event listeners.
	 * @private
	 * @returns {Promise<void>} A promise that resolves when the connection is open.
	 */
	async #connect() {
		return new Promise((resolve, reject) => {
			try {
				this.#connection = new WebSocket(this.#config.serverUrl);

				this.#connection.onopen = () => {
					console.log("[RealtimeSync] Connected to real-time server");
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
					console.log("[RealtimeSync] Connection closed");
					this.#handleDisconnection();
				};

				this.#connection.onerror = (error) => {
					console.error("[RealtimeSync] Connection error:", error);
					reject(error);
				};
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Handles automatic reconnection logic with exponential backoff.
	 * @private
	 */
	async #reconnect() {
		if (this.#reconnectAttempts >= this.#config.maxReconnectAttempts) {
			console.error("[RealtimeSync] Max reconnection attempts reached");
			return;
		}

		this.#reconnectAttempts++;
		this.#metrics.reconnections++;

		const delay =
			this.#config.reconnectDelay *
			Math.pow(2, this.#reconnectAttempts - 1);
		console.log(
			`[RealtimeSync] Reconnecting in ${delay}ms (attempt ${this.#reconnectAttempts})`
		);

		setTimeout(async () => {
			try {
				await this.#connect();
			} catch (error) {
				console.error("[RealtimeSync] Reconnection failed:", error);
				this.#reconnect();
			}
		}, delay);
	}

	/**
	 * Parses incoming messages from the server and routes them to the appropriate handler.
	 * @private
	 * @param {string} data - The raw message data from the WebSocket.
	 */
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
				case "entity_update":
					this.#handleEntityUpdate(message);
					break;
				case "entity_delete":
					this.#handleEntityDelete(message);
					break;
				case "heartbeat":
					this.#handleHeartbeat(message);
					break;
				case "error":
					this.#handleError(message);
					break;
				default:
					console.warn(
						"[RealtimeSync] Unknown message type:",
						message.type
					);
			}
		} catch (error) {
			console.error("[RealtimeSync] Failed to parse message:", error);
		}
	}

	/**
	 * Handles an entity update message by notifying all relevant subscribers.
	 * @private
	 * @param {object} message - The parsed message object.
	 */
	#handleEntityUpdate(message) {
		const { entityType, entity } = message;
		const callbacks = this.#subscriptions.get(entityType);

		if (callbacks) {
			callbacks.forEach((callback) => {
				try {
					callback({
						type: "update",
						entity,
						timestamp: message.timestamp,
					});
				} catch (error) {
					console.error("[RealtimeSync] Callback error:", error);
				}
			});
		}
	}

	/**
	 * Handles an entity deletion message by notifying all relevant subscribers.
	 * @private
	 * @param {object} message - The parsed message object.
	 */
	#handleEntityDelete(message) {
		const { entityType, entityId } = message;
		const callbacks = this.#subscriptions.get(entityType);

		if (callbacks) {
			callbacks.forEach((callback) => {
				try {
					callback({
						type: "delete",
						entityId,
						timestamp: message.timestamp,
					});
				} catch (error) {
					console.error("[RealtimeSync] Callback error:", error);
				}
			});
		}
	}

	/**
	 * Handles a heartbeat request from the server by sending a response.
	 * @private
	 * @param {object} message - The heartbeat message.
	 */
	#handleHeartbeat(message) {
		// Respond to heartbeat
		this.#sendMessage({
			type: "heartbeat_response",
			timestamp: Date.now(),
		});
	}

	/**
	 * Handles an error message from the server.
	 * @private
	 * @param {object} message - The error message.
	 */
	#handleError(message) {
		console.error("[RealtimeSync] Server error:", message.error);
	}

	/**
	 * Handles a disconnection event by attempting to reconnect if appropriate.
	 * @private
	 */
	#handleDisconnection() {
		if (this.#reconnectAttempts < this.#config.maxReconnectAttempts) {
			this.#reconnect();
		}
	}

	/**
	 * Sends a message to the server, or queues it if the connection is down.
	 * @private
	 * @param {object} message - The message object to send.
	 */
	#sendMessage(message) {
		if (this.#isConnected()) {
			this.#connection.send(JSON.stringify(message));
			this.#metrics.messagesSent++;
		} else {
			// Queue message for when connection is restored
			this.#messageQueue.push(message);
		}
	}

	/**
	 * Pushes a single item to the server and waits for a confirmation response.
	 * @private
	 * @param {object} item - The item to push.
	 * @param {string} operation - The operation type.
	 * @returns {Promise<object>} A promise that resolves with the server's result or rejects on timeout/error.
	 */
	async #pushItem(item, operation) {
		return new Promise((resolve, reject) => {
			const requestId = this.#generateRequestId();
			const timeout = setTimeout(() => {
				reject(new Error("Push timeout"));
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
				type: "push_item",
				requestId,
				item,
				operation,
				timestamp: Date.now(),
			});
		});
	}

	/**
	 * Processes any messages that were queued while the connection was down.
	 * @private
	 */
	#processMessageQueue() {
		while (this.#messageQueue.length > 0 && this.#isConnected()) {
			const message = this.#messageQueue.shift();
			this.#sendMessage(message);
		}
	}

	/**
	 * Sets up a periodic heartbeat to keep the WebSocket connection alive.
	 * @private
	 */
	#setupHeartbeat() {
		setInterval(() => {
			if (this.#isConnected()) {
				this.#sendMessage({
					type: "heartbeat",
					timestamp: Date.now(),
				});
			}
		}, this.#config.heartbeatInterval);
	}

	/**
	 * Checks if the WebSocket connection is currently open.
	 * @private
	 * @returns {boolean} True if connected.
	 */
	#isConnected() {
		return this.#connection?.readyState === WebSocket.OPEN;
	}

	/**
	 * Generates a unique ID for a request to correlate it with a response.
	 * @private
	 * @returns {string} A unique request ID.
	 */
	#generateRequestId() {
		return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Updates the average latency metric based on a new message's round-trip time.
	 * @private
	 * @param {number} latency - The latency of the last message in milliseconds.
	 */
	#updateLatencyMetrics(latency) {
		const totalMessages = this.#metrics.messagesReceived;
		const totalLatency =
			this.#metrics.averageLatency * (totalMessages - 1) + latency;
		this.#metrics.averageLatency = totalLatency / totalMessages;
	}

	/**
	 * Adds a one-time message listener for request-response correlation.
	 * @private
	 * @param {Function} handler - The handler function to add.
	 */
	#addMessageListener(handler) {
		// Add to a list of message listeners (simplified implementation)
		if (!this._messageListeners) {
			this._messageListeners = [];
		}
		this._messageListeners.push(handler);
	}

	/**
	 * Removes a one-time message listener.
	 * @private
	 * @param {Function} handler - The handler function to remove.
	 */
	#removeMessageListener(handler) {
		if (this._messageListeners) {
			const index = this._messageListeners.indexOf(handler);
			if (index > -1) {
				this._messageListeners.splice(index, 1);
			}
		}
	}
}
