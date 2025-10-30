// server/OptimizationWebSocketServer.js
// Real-time WebSocket server for database optimization updates

import { EventEmitter } from "events";

import { WebSocketServer } from "ws";

export class OptimizationWebSocketServer extends EventEmitter {
  constructor(server, optimizer) {
    super();
    this.server = server;
    this.optimizer = optimizer;
    this.wss = null;
    this.clients = new Map();
    this.metrics = {
      connectionsTotal: 0,
      connectionsActive: 0,
      messagesTriggered: 0,
      messagesSent: 0,
    };
  }

  /**
   * Initialize WebSocket server
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
   * Setup WebSocket connection handlers
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

      console.log(`👤 Client connected: ${clientId} from ${clientInfo.ip}`);

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
   * Setup optimizer event listeners
   */
  setupOptimizerListeners() {
    // Listen to optimizer events
    if (this.optimizer.eventFlowEngine) {
      this.optimizer.eventFlowEngine.on("optimization_applied", (data) => {
        this.broadcast({
          type: "optimization_applied",
          timestamp: new Date().toISOString(),
          optimizationType: data.type,
          table: data.table,
          field: data.field,
          approvedBy: data.approvedBy,
          executionTime: data.executionTime,
        });
      });

      this.optimizer.eventFlowEngine.on("suggestion_generated", (data) => {
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
      });

      this.optimizer.eventFlowEngine.on("health_status_changed", (data) => {
        this.broadcast({
          type: "health_status_changed",
          timestamp: new Date().toISOString(),
          status: data.status,
          previousStatus: data.previousStatus,
          reason: data.reason,
        });
      });
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
        ["system_logs"],
      );
    });

    // Periodic metrics updates
    setInterval(() => {
      this.broadcastMetricsUpdate();
    }, 30000); // Every 30 seconds
  }

  /**
   * Handle incoming client messages
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
            message.type,
          );
      }
    } catch (error) {
      console.error(`Failed to handle message from client ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: "error",
        message: "Invalid message format",
      });
    }
  }

  /**
   * Handle client authentication
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
        Object.keys(permissions),
      );
    } catch (error) {
      console.error(`Authentication failed for client ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: "authentication_failed",
        message: "Invalid or expired token",
      });
    }
  }

  /**
   * Verify client authentication token
   */
  async verifyClientToken(token) {
    try {
      // In production, verify against your auth system
      // For now, return default permissions
      return {
        canViewOptimizations: true,
        canApplyOptimizations: false,
        canViewMetrics: true,
        canConfigureSystem: false,
      };
    } catch (error) {
      throw new Error("Token verification failed");
    }
  }

  /**
   * Handle subscription changes
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
   * Handle unsubscription
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
   * Handle client disconnect
   */
  handleClientDisconnect(clientId, code, reason) {
    const client = this.clients.get(clientId);
    if (client) {
      const duration = Date.now() - client.connectedAt.getTime();
      console.log(
        `👋 Client disconnected: ${clientId} (connected for ${Math.round(duration / 1000)}s)`,
      );
      this.clients.delete(clientId);
      this.metrics.connectionsActive--;
    }
  }

  /**
   * Send current system status to a client
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
   * Broadcast metrics update to all clients
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
        ["performance_metrics", "all"],
      );

      this.metrics.messagesTriggered++;
    } catch (error) {
      console.error("Failed to broadcast metrics update:", error);
    }
  }

  /**
   * Send message to specific client
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
      console.error(`Failed to send message to client ${clientId}:`, error);
      return false;
    }
  }

  /**
   * Broadcast message to all subscribed clients
   */
  broadcast(message, subscriptions = ["all"]) {
    let sentCount = 0;

    this.clients.forEach((client, clientId) => {
      // Check if client is subscribed to any of the message subscriptions
      const isSubscribed = subscriptions.some(
        (sub) =>
          client.subscriptions.has(sub) || client.subscriptions.has("all"),
      );

      if (isSubscribed && this.sendToClient(clientId, message)) {
        sentCount++;
      }
    });

    console.log(`📡 Broadcasted to ${sentCount} clients:`, message.type);
    return sentCount;
  }

  /**
   * Start health check for connections
   */
  startHealthCheck() {
    setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (client.ws.readyState === client.ws.OPEN) {
          try {
            client.ws.ping();
          } catch (error) {
            console.warn(`Health check failed for client ${clientId}:`, error);
            this.handleClientDisconnect(clientId, 1011, "Health check failed");
          }
        } else {
          this.handleClientDisconnect(clientId, 1006, "Connection lost");
        }
      });
    }, 30000); // Every 30 seconds
  }

  /**
   * Generate unique client ID
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get server statistics
   */
  getStats() {
    const activeClients = Array.from(this.clients.values()).map((client) => ({
      id: client.id,
      ip: client.ip,
      connectedAt: client.connectedAt,
      subscriptions: Array.from(client.subscriptions),
      authenticated: client.authenticated || false,
    }));

    return {
      ...this.metrics,
      activeClients: activeClients.length,
      clients: activeClients,
      uptime: process.uptime(),
    };
  }

  /**
   * Shutdown WebSocket server
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
export function createOptimizationWebSocketMiddleware(optimizer) {
  return function optimizationWebSocketMiddleware(req, res, next) {
    // Add WebSocket server reference to request
    req.optimizationWS = req.app.get("optimizationWS");
    next();
  };
}

// Express route for WebSocket stats
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
