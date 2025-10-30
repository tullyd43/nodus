// server/OptimizationWebSocketServer.js
// Real-time WebSocket server for database optimization updates

import { EventEmitter } from "node:events"; // Use node:events for clarity in Node.js environment

import { WebSocketServer } from "ws";

/**
 * @class OptimizationWebSocketServer
 * @extends EventEmitter
 * @classdesc Manages a real-time WebSocket server for broadcasting database optimization
 * updates and performance metrics to connected clients. It handles client connections,
 * subscriptions, authentication, and communication with the `DatabaseOptimizer`.
 */
export class OptimizationWebSocketServer extends EventEmitter {
	/**
	 * Creates an instance of OptimizationWebSocketServer.
	 * @param {import('node:http').Server} server - The HTTP server instance to attach the WebSocket server to.
	 * @param {object} options - Configuration options.
	 * @param {import('./DatabaseOptimizer.js').DatabaseOptimizer} options.optimizer - The DatabaseOptimizer instance.
	 * @param {import('./OptimizationAccessControl.js').OptimizationAccessControl} options.accessControl - The Access Control instance.
	 */
	constructor(server, { optimizer, accessControl }) {
		super();
		/**
		 * The HTTP server instance.
		 * @type {import('node:http').Server}
		 * @private
		 */
		this.server = server;
		/**
		 * The DatabaseOptimizer instance.
		 * @type {import('./DatabaseOptimizer.js').DatabaseOptimizer}
		 * @private
		 */
		this.optimizer = optimizer;
		/**
		 * The Access Control instance.
		 * @type {import('./OptimizationAccessControl.js').OptimizationAccessControl}
		 * @private
		 */
		this.accessControl = accessControl;
		/**
		 * The WebSocketServer instance.
		 * @type {WebSocketServer|null}
		 * @private
		 */
		this.wss = null;
		/**
		 * A map of connected clients, keyed by their unique ID.
		 * @type {Map<string, object>}
		 * @private
		 */
		this.clients = new Map();
		/**
		 * Performance and usage metrics for the WebSocket server.
		 * @type {{connectionsTotal: number, connectionsActive: number, messagesTriggered: number, messagesSent: number}}
		 * @private
		 */
		this.metrics = {
			connectionsTotal: 0,
			connectionsActive: 0,
			messagesTriggered: 0,
			messagesSent: 0,
		};
	}

	/**
	 * Initializes the WebSocket server, sets up event handlers, and starts monitoring the optimizer.
	 * @returns {boolean} `true` if initialization is successful.
	 * @throws {Error} If the WebSocket server fails to initialize.
	 */
	initialize() {
		try {
			this.wss = new WebSocketServer({
				server: this.server,
				path: "/admin/optimization-stream",
				clientTracking: true,
			});

			this.setupWebSocketHandlers();
			this.setupOptimizerListeners();
			this.startHealthCheck();

			console.log("🔴 Optimization WebSocket server initialized");
			return true;
		} catch (error) {
			console.error("Failed to initialize WebSocket server:", error);
			throw error;
		}
	}

	/**
	 * Sets up event handlers for WebSocket connections, messages, and disconnections.
	 * @private
	 * @returns {void}
	 */
	setupWebSocketHandlers() {
		this.wss.on("connection", (ws, request) => {
			const clientId = this.generateClientId();
			const clientInfo = {
				id: clientId,
				ws,
				ip: request.socket.remoteAddress,
				userAgent: request.headers["user-agent"],
				connectedAt: new Date(),
				permissions: {},
				subscriptions: new Set(["all"]), // Default subscription
			};

			this.clients.set(clientId, clientInfo);
			this.metrics.connectionsTotal++;
			this.metrics.connectionsActive++;

			console.log(
				`👤 Client connected: ${clientId} from ${clientInfo.ip}`
			);

			// Setup client event handlers
			ws.on("message", (data) => {
				this.handleClientMessage(clientId, data);
			});

			ws.on("close", (code, reason) => {
				this.handleClientDisconnect(clientId, code, reason);
			});

			ws.on("error", (error) => {
				console.error(`WebSocket error for client ${clientId}:`, error);
				this.handleClientDisconnect(clientId, 1011, "Internal error");
			});

			// Send initial connection confirmation
			this.sendToClient(clientId, {
				type: "connection_established",
				clientId,
				serverTime: new Date().toISOString(),
				availableSubscriptions: [
					"optimization_events",
					"performance_metrics",
					"health_status",
					"system_logs",
				],
			});

			// Send current system status
			this.sendSystemStatus(clientId);
		});

		this.wss.on("error", (error) => {
			console.error("WebSocket server error:", error);
		});
	}

	/**
	 * Sets up listeners for events emitted by the `DatabaseOptimizer` and broadcasts them to clients.
	 * @private
	 * @returns {void}
	 */
	setupOptimizerListeners() {
		// Listen to optimizer events
		if (this.optimizer.eventFlowEngine) {
			this.optimizer.eventFlowEngine.on(
				"optimization_applied",
				(data) => {
					this.broadcast({
						type: "optimization_applied",
						timestamp: new Date().toISOString(),
						optimizationType: data.type,
						table: data.table,
						field: data.field,
						approvedBy: data.approvedBy,
						executionTime: data.executionTime,
					});
				}
			);

			this.optimizer.eventFlowEngine.on(
				"suggestion_generated",
				(data) => {
					this.broadcast({
						type: "suggestion_generated",
						timestamp: new Date().toISOString(),
						suggestion: {
							id: data.id,
							table: data.table,
							field: data.field,
							type: data.type,
							estimatedBenefit: data.estimatedBenefit,
						},
					});
				}
			);

			this.optimizer.eventFlowEngine.on(
				"health_status_changed",
				(data) => {
					this.broadcast({
						type: "health_status_changed",
						timestamp: new Date().toISOString(),
						status: data.status,
						previousStatus: data.previousStatus,
						reason: data.reason,
					});
				}
			);
		}

		// Listen for system log events
		this.on("system_log", (logData) => {
			this.broadcast(
				{
					type: "system_log",
					timestamp: new Date().toISOString(),
					level: logData.level,
					component: logData.component,
					message: logData.message,
					metadata: logData.metadata,
				},
				["system_logs"]
			);
		});

		// Periodic metrics updates
		setInterval(() => {
			this.broadcastMetricsUpdate();
		}, 30000); // Every 30 seconds
	}

	/**
	 * Handles incoming messages from a connected WebSocket client.
	 * @private
	 * @param {string} clientId - The ID of the client sending the message.
	 * @param {import('ws').RawData} data - The raw message data received from the client.
	 */
	handleClientMessage(clientId, data) {
		try {
			const message = JSON.parse(data);
			const client = this.clients.get(clientId);

			if (!client) return;

			switch (message.type) {
				case "subscribe":
					this.handleSubscription(clientId, message.subscriptions);
					break;

				case "unsubscribe":
					this.handleUnsubscription(clientId, message.subscriptions);
					break;

				case "ping":
					this.sendToClient(clientId, {
						type: "pong",
						timestamp: new Date().toISOString(),
					});
					break;

				case "request_status":
					this.sendSystemStatus(clientId);
					break;

				case "authenticate":
					this.handleAuthentication(clientId, message.token);
					break;

				default:
					console.warn(
						`Unknown message type from client ${clientId}:`,
						message.type
					);
			}
		} catch (error) {
			console.error(
				`Failed to handle message from client ${clientId}:`,
				error
			);
			this.sendToClient(clientId, {
				type: "error",
				message: "Invalid message format",
			});
		}
	}

	/**
	 * Handles client authentication by verifying a provided token and updating client permissions.
	 * @private
	 * @param {string} clientId - The ID of the client attempting to authenticate.
	 * @param {string} token - The authentication token provided by the client.
	 */
	async handleAuthentication(clientId, token) {
		try {
			const client = this.clients.get(clientId);
			if (!client) return;

			// Verify token and get permissions
			const permissions = await this.verifyClientToken(token);

			client.permissions = permissions;
			client.authenticated = true;

			this.sendToClient(clientId, {
				type: "authentication_success",
				permissions,
				timestamp: new Date().toISOString(),
			});

			console.log(
				`🔐 Client ${clientId} authenticated with permissions:`,
				Object.keys(permissions)
			);
		} catch (error) {
			console.error(
				`Authentication failed for client ${clientId}:`,
				error
			);
			this.sendToClient(clientId, {
				type: "authentication_failed",
				message: "Invalid or expired token",
			});
		}
	}

	/**
	 * Verifies a client's authentication token against an authentication system.
	 * @private
	 * @param {string} token - The authentication token to verify.
	 * @returns {Promise<object>} A promise that resolves with the client's permissions.
	 */
	async verifyClientToken(token) {
		if (!this.accessControl) {
			throw new Error("Access control system is not configured.");
		}

		try {
			const sessionInfo = this.accessControl.getSessionInfo(token);
			if (!sessionInfo) {
				throw new Error("Invalid or expired session token.");
			}

			// Return the permissions from the valid session
			return sessionInfo.permissions;
		} catch (error) {
			console.error(
				"[OptimizationWebSocketServer] Token verification failed:",
				error.message
			);
			throw new Error("Token verification failed");
		}
	}

	/**
	 * Handles a client's request to subscribe to specific event types.
	 * @private
	 * @param {string} clientId - The ID of the client.
	 * @param {string[]} subscriptions - An array of subscription topics.
	 */
	handleSubscription(clientId, subscriptions) {
		const client = this.clients.get(clientId);
		if (!client) return;

		subscriptions.forEach((sub) => {
			client.subscriptions.add(sub);
		});

		this.sendToClient(clientId, {
			type: "subscription_updated",
			subscriptions: Array.from(client.subscriptions),
			timestamp: new Date().toISOString(),
		});

		console.log(`📡 Client ${clientId} subscribed to:`, subscriptions);
	}

	/**
	 * Handles a client's request to unsubscribe from specific event types.
	 * @private
	 * @param {string} clientId - The ID of the client.
	 * @param {string[]} subscriptions - An array of subscription topics to unsubscribe from.
	 */
	handleUnsubscription(clientId, subscriptions) {
		const client = this.clients.get(clientId);
		if (!client) return;

		subscriptions.forEach((sub) => {
			client.subscriptions.delete(sub);
		});

		this.sendToClient(clientId, {
			type: "subscription_updated",
			subscriptions: Array.from(client.subscriptions),
			timestamp: new Date().toISOString(),
		});
	}

	/**
	 * Handles a client disconnection event, removing the client from the active connections.
	 * @private
	 * @param {string} clientId - The ID of the disconnected client.
	 * @param {number} code - The WebSocket close code.
	 * @param {string} reason - The reason for the disconnection.
	 */
	handleClientDisconnect(clientId, code, reason) {
		const client = this.clients.get(clientId);
		if (client) {
			const duration = Date.now() - client.connectedAt.getTime();
			console.log(
				`👋 Client disconnected: ${clientId} (connected for ${Math.round(duration / 1000)}s)`
			);
			this.clients.delete(clientId);
			this.metrics.connectionsActive--;
		}
	}

	/**
	 * Sends the current system status, including optimizer metrics and suggestions, to a specific client.
	 * @private
	 * @param {string} clientId - The ID of the client to send the status to.
	 * @returns {Promise<void>}
	 */
	async sendSystemStatus(clientId) {
		try {
			const [health, metrics, suggestions, applied] = await Promise.all([
				this.optimizer.getHealthStatus(),
				this.optimizer.getMetrics(),
				this.optimizer.getPendingSuggestions(),
				this.optimizer.getAppliedOptimizations(),
			]);

			this.sendToClient(clientId, {
				type: "system_status",
				timestamp: new Date().toISOString(),
				health,
				metrics,
				pendingSuggestions: suggestions.length,
				appliedOptimizations: applied.length,
				serverMetrics: this.metrics,
			});
		} catch (error) {
			console.error("Failed to send system status:", error);
			this.sendToClient(clientId, {
				type: "error",
				message: "Failed to retrieve system status",
			});
		}
	}

	/**
	 * Periodically broadcasts updated metrics from the optimizer to all subscribed clients.
	 * @private
	 * @returns {Promise<void>}
	 */
	async broadcastMetricsUpdate() {
		try {
			const metrics = await this.optimizer.getEnhancedMetrics();

			this.broadcast(
				{
					type: "metrics_updated",
					timestamp: new Date().toISOString(),
					metrics: metrics.current,
					database: metrics.database,
					batchStatus: metrics.batchStatus,
				},
				["performance_metrics", "all"]
			);

			this.metrics.messagesTriggered++;
		} catch (error) {
			console.error("Failed to broadcast metrics update:", error);
		}
	}

	/**
	 * Sends a message to a specific WebSocket client.
	 * @private
	 * @param {string} clientId - The ID of the target client.
	 * @param {object} message - The message object to send.
	 */
	sendToClient(clientId, message) {
		const client = this.clients.get(clientId);
		if (!client || client.ws.readyState !== client.ws.OPEN) {
			return false;
		}

		try {
			client.ws.send(JSON.stringify(message));
			this.metrics.messagesSent++;
			return true;
		} catch (error) {
			console.error(
				`Failed to send message to client ${clientId}:`,
				error
			);
			return false;
		}
	}

	/**
	 * Broadcasts a message to all connected clients that are subscribed to the relevant topics.
	 * @private
	 * @param {object} message - The message object to broadcast.
	 * @param {string[]} [subscriptions=['all']] - An array of subscription topics relevant to the message.
	 * @returns {number} The number of clients the message was sent to.
	 */
	broadcast(message, subscriptions = ["all"]) {
		let sentCount = 0;

		this.clients.forEach((client, clientId) => {
			// Check if client is subscribed to any of the message subscriptions
			const isSubscribed = subscriptions.some(
				(sub) =>
					client.subscriptions.has(sub) ||
					client.subscriptions.has("all")
			);

			if (isSubscribed && this.sendToClient(clientId, message)) {
				sentCount++;
			}
		});

		console.log(`📡 Broadcasted to ${sentCount} clients:`, message.type);
		return sentCount;
	}

	/**
	 * Starts a periodic health check for all active WebSocket connections.
	 * @private
	 * @returns {void}
	 */
	startHealthCheck() {
		setInterval(() => {
			this.clients.forEach((client, clientId) => {
				if (client.ws.readyState === client.ws.OPEN) {
					try {
						client.ws.ping();
					} catch (error) {
						console.warn(
							`Health check failed for client ${clientId}:`,
							error
						);
						this.handleClientDisconnect(
							clientId,
							1011,
							"Health check failed"
						);
					}
				} else {
					this.handleClientDisconnect(
						clientId,
						1006,
						"Connection lost"
					);
				}
			});
		}, 30000); // Every 30 seconds
	}

	/**
	 * Generates a unique client ID for new WebSocket connections.
	 * @private
	 * @returns {string} A unique client ID.
	 */
	generateClientId() {
		return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Retrieves statistics about the WebSocket server, including active connections and message counts.
	 * @returns {object} An object containing server statistics.
	 * @public
	 */
	getStats() {
		const activeClients = Array.from(this.clients.values()).map(
			(client) => ({
				id: client.id,
				ip: client.ip,
				connectedAt: client.connectedAt,
				subscriptions: Array.from(client.subscriptions),
				authenticated: client.authenticated || false,
			})
		);

		return {
			...this.metrics,
			activeClients: activeClients.length,
			clients: activeClients,
			uptime: process.uptime(),
		};
	}

	/**
	 * Shuts down the WebSocket server gracefully, closing all client connections and the server itself.
	 * @returns {Promise<void>} A promise that resolves when the shutdown is complete.
	 * @public
	 */
	async shutdown() {
		console.log("🛑 Shutting down WebSocket server...");

		// Notify all clients about shutdown
		this.broadcast({
			type: "server_shutdown",
			message: "Server is shutting down",
			timestamp: new Date().toISOString(),
		});

		// Close all client connections
		this.clients.forEach((client, clientId) => {
			try {
				client.ws.close(1001, "Server shutdown");
			} catch (error) {
				console.error(`Failed to close client ${clientId}:`, error);
			}
		});

		// Close WebSocket server
		if (this.wss) {
			await new Promise((resolve) => {
				this.wss.close(() => {
					console.log("✅ WebSocket server closed");
					resolve();
				});
			});
		}

		this.clients.clear();
	}
}

// Express middleware for WebSocket integration
/**
 * Creates an Express middleware that attaches the `OptimizationWebSocketServer` instance
 * to the `req` object, making it accessible in subsequent route handlers.
 * @param {import('./DatabaseOptimizer.js').DatabaseOptimizer} optimizer - The DatabaseOptimizer instance.
 * @returns {import('express').RequestHandler} The Express middleware function.
 */
export function createOptimizationWebSocketMiddleware(optimizer) {
	return function optimizationWebSocketMiddleware(req, res, next) {
		// Add WebSocket server reference to request
		req.optimizationWS = req.app.get("optimizationWS");
		next();
	};
}

// Express route for WebSocket stats
/**
 * Creates an Express route handler to expose WebSocket server statistics.
 * @param {OptimizationWebSocketServer} wsServer - The OptimizationWebSocketServer instance.
 * @returns {import('express').RequestHandler} The Express route handler function.
 */
export function createWebSocketStatsRoute(wsServer) {
	return function getWebSocketStats(req, res) {
		try {
			const stats = wsServer.getStats();
			res.json({
				success: true,
				stats,
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: error.message,
			});
		}
	};
}

export default OptimizationWebSocketServer;
