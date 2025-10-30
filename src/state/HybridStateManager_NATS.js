// core/HybridStateManager_NATS.js
// HybridStateManager — NATS-ready CQRS extension
// Extends your existing HybridStateManager with publish/subscribe support

import { connect } from "nats.ws";


export class HybridStateManager_NATS {
  constructor(config = {}) {
    this.config = {
      natsServers: config.natsServers || "wss://nats.localhost:4222",
      enabled: config.enabled ?? true,
      ...config,
    };
    this.natsClient = null;
    this.subscriptions = new Map();
  }

  safeEmit(eventName, detail) {
    if (typeof window.eventFlowEngine !== 'undefined') {
      window.eventFlowEngine.emit(eventName, detail);
    }
  }

  async initializeNATS() {
    if (!this.config.enabled) {
      console.warn("[HybridStateManager_NATS] Disabled.");
      return;
    }

    try {
      this.natsClient = await connect({ servers: this.config.natsServers });
      console.log(
        "[HybridStateManager_NATS] Connected to NATS:",
        this.config.natsServers,
      );
      await this.subscribeToEvents();
    } catch (err) {
                this.safeEmit("error", err);    }
  }

  async publishCommand(command) {
    if (!this.natsClient) {
      console.warn(
        "[HybridStateManager_NATS] NATS not connected. Command queued locally.",
      );
      // You can fallback to OfflineManager here
      return;
    }

    try {
      await this.natsClient.publish("commands", JSON.stringify(command));
      console.log("[HybridStateManager_NATS] Published command:", command.type);
    } catch (err) {
      console.error(
        "[HybridStateManager_NATS] Failed to publish command:",
        err,
      );
      this.safeEmit("error", err);
    }
  }

  async subscribeToEvents() {
    if (!this.natsClient) return;

    const sub = this.natsClient.subscribe("events");
    this.subscriptions.set("events", sub);

    (async () => {
      for await (const msg of sub) {
        try {
          const event = JSON.parse(new TextDecoder().decode(msg.data));
          this.handleEvent(event);
        } catch (err) {
          console.error("[HybridStateManager_NATS] Event parse error:", err);
        }
      }
    })();

    console.log("[HybridStateManager_NATS] Subscribed to NATS events channel");
  }

  handleEvent(event) {
    console.log("[HybridStateManager_NATS] Received event:", event.type);
    this.safeEmit("nats_event", event);

    // Integrate event with HybridStateManager core logic
    // Example: update local cache or replay into undo/redo system
    if (event.entity && event.type === "entity_updated") {
      // Update your unified entity store here
      console.debug(
        "[HybridStateManager_NATS] Applying entity update:",
        event.entity.id,
      );
    }
  }

  async close() {
    if (this.natsClient) {
      await this.natsClient.close();
      console.log("[HybridStateManager_NATS] Connection closed");
    }
  }
}
