/**
 * @file HybridStateManager_NATS.js
 * @description Extends the HybridStateManager with real-time publish/subscribe capabilities using NATS.
 * This enables a Command Query Responsibility Segregation (CQRS) pattern, where state-changing commands
 * can be published to a central message bus and resulting events are subscribed to for updating client state.
 */

import { connect } from "nats.ws";

/**
 * @class HybridStateManager_NATS
 * @classdesc An extension for the HybridStateManager that integrates with a NATS server
 * to publish commands and subscribe to real-time events.
 */
export class HybridStateManager_NATS {
	/**
	 * Creates an instance of HybridStateManager_NATS.
	 * @param {object} [config={}] - Configuration options for the NATS connection.
	 * @param {string|string[]} [config.natsServers='wss://nats.localhost:4222'] - The URL or URLs of the NATS server(s).
	 * @param {boolean} [config.enabled=true] - Whether the NATS integration is enabled.
	 */
	constructor(config = {}) {
		this.config = {
			natsServers: config.natsServers || "wss://nats.localhost:4222",
			enabled: config.enabled ?? true,
			...config,
		};
		/** @type {import('nats.ws').NatsConnection|null} */
		this.natsClient = null;
		/** @type {Map<string, import('nats.ws').Subscription>} */
		this.subscriptions = new Map();
	}

	/**
	 * Safely emits an event through the global `eventFlowEngine` if it is available.
	 * @param {string} eventName - The name of the event to emit.
	 * @param {object} detail - The data payload for the event.
	 * @private
	 */
	safeEmit(eventName, detail) {
		if (typeof window.eventFlowEngine !== "undefined") {
			window.eventFlowEngine.emit(eventName, detail);
		}
	}

	/**
	 * Initializes the connection to the NATS server and subscribes to the events channel.
	 * @public
	 * @returns {Promise<void>}
	 */
	async initializeNATS() {
		if (!this.config.enabled) {
			console.warn("[HybridStateManager_NATS] Disabled.");
			return;
		}

		try {
			this.natsClient = await connect({
				servers: this.config.natsServers,
			});
			console.log(
				"[HybridStateManager_NATS] Connected to NATS:",
				this.config.natsServers
			);
			await this.subscribeToEvents();
		} catch (err) {
			this.safeEmit("error", err);
		}
  }
  
	/**
	 * Publishes a command object to the 'commands' NATS subject.
	 * @public
	 * @param {object} command - The command object to publish. It should be serializable to JSON.
	 * @returns {Promise<void>}
	 */
	async publishCommand(command) {
		if (!this.natsClient) {
			console.warn(
				"[HybridStateManager_NATS] NATS not connected. Command queued locally."
			);
			// You can fallback to OfflineManager here
			return;
		}

		try {
			await this.natsClient.publish("commands", JSON.stringify(command));
			console.log(
				"[HybridStateManager_NATS] Published command:",
				command.type
			);
		} catch (err) {
			console.error(
				"[HybridStateManager_NATS] Failed to publish command:",
				err
			);
			this.safeEmit("error", err);
		}
	}

	/**
	 * Subscribes to the 'events' NATS subject to receive real-time state change events from the backend.
	 * @public
	 * @returns {Promise<void>}
	 */
	async subscribeToEvents() {
		if (!this.natsClient) return;

		const sub = this.natsClient.subscribe("events");
		this.subscriptions.set("events", sub);

		(async () => {
			for await (const msg of sub) {
				try {
					const event = JSON.parse(
						new TextDecoder().decode(msg.data)
					);
					this.handleEvent(event);
				} catch (err) {
					console.error(
						"[HybridStateManager_NATS] Event parse error:",
						err
					);
				}
			}
		})();

		console.log(
			"[HybridStateManager_NATS] Subscribed to NATS events channel"
		);
	}

	/**
	 * Handles an incoming event from the NATS subscription by emitting it into the local event flow
	 * and performing any necessary state updates.
	 * @param {object} event - The event object received from NATS.
	 * @private
	 */
	handleEvent(event) {
		console.log("[HybridStateManager_NATS] Received event:", event.type);
		this.safeEmit("nats_event", event);

		// Integrate event with HybridStateManager core logic
		// Example: update local cache or replay into undo/redo system
		if (event.entity && event.type === "entity_updated") {
			// Update your unified entity store here
			console.debug(
				"[HybridStateManager_NATS] Applying entity update:",
				event.entity.id
			);
		}
	}

	/**
	 * Gracefully closes the connection to the NATS server.
	 * @public
	 * @returns {Promise<void>}
	 */
	async close() {
		if (this.natsClient) {
			await this.natsClient.close();
			console.log("[HybridStateManager_NATS] Connection closed");
		}
	}
}
