// modules/realtime-sync.js
// Real-time synchronization module for low-latency updates

import { AppError, StorageError } from "../../../utils/ErrorHelpers.js";

/**
 * @description
 * Manages real-time data synchronization using a WebSocket connection.
 * This module is designed for low-latency applications like live collaboration,
 * instant messaging, or real-time dashboards. It handles connection management,
 * automatic reconnection, message queuing, and a subscription model for receiving updates.
 *
 * @module RealtimeSync
 * @privateFields {#connection, #messageQueue, #subscriptions, #reconnectAttempts, #config, #stateManager, #pendingRequests, #heartbeatInterval, #metrics, #forensicLogger, #errorHelpers}
 */
export default class RealtimeSync {
	/** @private @type {WebSocket|null} */
	#connection = null;
	/** @private @type {Array<object>} */
	#messageQueue = [];
	/** @private @type {Map<string, Set<Function>>} */
	#subscriptions = new Map();
	/** @private @type {number} */
	#reconnectAttempts = 0;
	/** @private @type {object} */
	#config;
	/** @private @type {import('../../HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {Map<string, {resolve: Function, reject: Function}>} */
	#pendingRequests = new Map();
	/** @private @type {number|null} */
	#heartbeatInterval = null;
	/** @private @type {import('../../../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../../ForensicLogger.js').default|null} */
	#forensicLogger = null;
	/** @private @type {import('../../../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;

	/** @public @type {string} */
	name = "RealtimeSync";
	/** @public @type {boolean} */
	supportsPush = true;
	/** @public @type {boolean} */
	supportsPull = true;

	/**
	 * Creates an instance of RealtimeSync.
	 * @param {object} context - The application context.
	 * @param {import('../../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 * @param {object} [context.options={}] - Configuration options for the WebSocket connection.
	 */
	constructor({ stateManager, options = {} }) {
		this.#stateManager = stateManager;

		// V8.0 Parity: Mandate 1.2 - Derive dependencies from the stateManager.
		this.#metrics =
			this.#stateManager?.metricsRegistry?.namespace("realtimeSync");
		this.#forensicLogger = this.#stateManager?.managers?.forensicLogger;
		this.#errorHelpers = this.#stateManager?.managers?.errorHelpers;

		this.#config = {
			serverUrl: options.serverUrl || "wss://api.nodus.com/realtime",
			reconnectDelay: options.reconnectDelay || 1000,
			maxReconnectAttempts: options.maxReconnectAttempts || 5,
			heartbeatInterval: options.heartbeatInterval || 30000,
			messageTimeout: options.messageTimeout || 10000, // Increased timeout
			enableCompression: options.enableCompression || true,
			authTimeout: options.authTimeout || 5000,
			...options,
		};
	}

	/**
	 * Initializes the module by establishing a connection to the real-time server.
	 * @returns {Promise<this>} The initialized instance.
	 */
	async init() {
		await this.#connect();
		this.#audit("init", { config: this.#config });
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

		this.#audit("subscribed", {
			entityType,
			callback: callback.name || "anonymous",
		});
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
			this.#audit("unsubscribed", { entityType });
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
		const { entityTypes = [], since } = options;

		return new Promise((resolve, reject) => {
			const requestId = this.#generateRequestId();
			const timeout = setTimeout(() => {
				this.#pendingRequests.delete(requestId);
				const error = new StorageError("Pull request timeout", {
					context: { entityTypes, since },
				});
				reject(this.#errorHelpers?.handleError(error) || error);
			}, this.#config.messageTimeout);

			this.#pendingRequests.set(requestId, {
				resolve: (response) => {
					clearTimeout(timeout);
					this.#pendingRequests.delete(requestId);
					resolve({
						pulled: response.items?.length || 0,
						items: response.items || [],
					});
				},
				reject: (error) => {
					clearTimeout(timeout);
					this.#pendingRequests.delete(requestId);
					reject(error);
				},
			});

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
		if (this.#connection?.readyState === WebSocket.OPEN) {
			const uptime =
				Date.now() -
				(this.#metrics?.get("connectionStartTime")?.value ||
					Date.now());
			this.#metrics?.set("connectionUptime", uptime);
		}

		return {
			...(this.#metrics?.getAllAsObject() || {}),
			isConnected: this.#isConnected(),
			subscriptions: this.#subscriptions.size,
			pendingRequests: this.#pendingRequests.size,
			queuedMessages: this.#messageQueue.length,
		};
	}

	/**
	 * Disconnects from the server and cleans up resources.
	 */
	async disconnect() {
		if (this.#heartbeatInterval) {
			clearInterval(this.#heartbeatInterval);
			this.#heartbeatInterval = null;
		}

		if (this.#connection) {
			this.#connection.close();
			this.#connection = null;
		}

		this.#subscriptions.clear();
		this.#messageQueue = [];

		this.#audit("disconnected", {});
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
				// V8.0 Parity: Use securityManager to get auth token for connection.
				const authToken =
					this.#stateManager?.managers?.securityManager?.getAuthToken();
				if (!authToken) {
					return reject(
						new StorageError(
							"Authentication token not available for WebSocket connection."
						)
					);
				}

				// Append auth token as a query parameter for secure connection handshake.
				const url = new URL(this.#config.serverUrl);
				url.searchParams.append("token", authToken);

				this.#connection = new WebSocket(url.toString());

				this.#connection.onopen = () => {
					this.#audit("connected", {
						url: this.#config.serverUrl,
						attempt: this.#reconnectAttempts + 1,
					});
					this.#reconnectAttempts = 0;
					this.#metrics?.set("connectionStartTime", Date.now());

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
					this.#audit("connection_closed", {});
					this.#handleDisconnection();
				};

				this.#connection.onerror = (error) => {
					const storageError = new StorageError(
						"WebSocket connection error.",
						{
							cause: error,
						}
					);
					this.#audit("connection_error", {
						error: storageError.message,
					});
					reject(
						this.#errorHelpers?.handleError(storageError) ||
							storageError
					);
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
			this.#audit("reconnect_failed_max_attempts", {
				attempts: this.#config.maxReconnectAttempts,
			});
			return;
		}

		this.#reconnectAttempts++;
		this.#metrics?.increment("reconnections");

		const delay =
			this.#config.reconnectDelay *
			Math.pow(2, this.#reconnectAttempts - 1);
		this.#audit("reconnecting", {
			delay,
			attempt: this.#reconnectAttempts,
		});
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
			this.#metrics?.increment("messagesReceived");

			// Calculate latency if timestamp provided
			if (message.timestamp) {
				const latency = Date.now() - message.timestamp;
				this.#updateLatencyMetrics(latency);
			}

			// Handle request-response
			if (
				message.requestId &&
				this.#pendingRequests.has(message.requestId)
			) {
				this.#handleResponseMessage(message);
				return;
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
					this.#audit("unknown_message_type", { type: message.type });
			}
		} catch (error) {
			const appError = new AppError("Failed to parse WebSocket message", {
				cause: error,
				context: { rawData: data },
			});
			this.#audit("message_parse_failed", {
				error: appError.message,
			});
			this.#errorHelpers?.handleError(appError);
		}
	}

	/**
	 * Handles a response message by resolving or rejecting the corresponding pending promise.
	 * @private
	 * @param {object} message - The parsed response message.
	 */
	#handleResponseMessage(message) {
		const pending = this.#pendingRequests.get(message.requestId);
		if (pending) {
			if (message.success) {
				pending.resolve(message);
			} else {
				const error = new StorageError(
					message.error || "Unknown server error",
					{ context: { requestId: message.requestId } }
				);
				pending.reject(this.#errorHelpers?.handleError(error) || error);
			}
		} else {
			this.#audit("unknown_request_id", { requestId: message.requestId });
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
					const appError = new AppError(
						"Subscription callback error",
						{
							cause: error,
							context: { entityType },
						}
					);
					this.#errorHelpers?.handleError(appError);
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
					const appError = new AppError(
						"Subscription callback error",
						{
							cause: error,
							context: { entityType },
						}
					);
					this.#errorHelpers?.handleError(appError);
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
		const error = new StorageError("Real-time server error", {
			context: { serverError: message.error },
		});
		this.#audit("server_error", { error: message.error });
		this.#errorHelpers?.handleError(error);
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
			this.#metrics?.increment("messagesSent");
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
				this.#pendingRequests.delete(requestId);
				const error = new StorageError("Push timeout", {
					context: { itemId: item.id, operation },
				});
				reject(this.#errorHelpers?.handleError(error) || error);
			}, this.#config.messageTimeout);

			this.#pendingRequests.set(requestId, {
				resolve: (response) => {
					clearTimeout(timeout);
					this.#pendingRequests.delete(requestId);
					resolve(response.result);
				},
				reject: (error) => {
					clearTimeout(timeout);
					this.#pendingRequests.delete(requestId);
					reject(error);
				},
			});

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
		if (this.#heartbeatInterval) clearInterval(this.#heartbeatInterval);
		this.#heartbeatInterval = setInterval(() => {
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
		this.#metrics?.updateAverage("averageLatency", latency);
	}

	/**
	 * Logs an audit event if the forensic logger is available.
	 * @private
	 * @param {string} eventType - The type of the event (e.g., 'connected').
	 * @param {object} data - The data associated with the event.
	 */
	#audit(eventType, data) {
		if (this.#forensicLogger) {
			this.#forensicLogger.logAuditEvent(
				`REALTIME_SYNC_${eventType.toUpperCase()}`,
				data
			);
		}
	}
}
