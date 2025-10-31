/**
 * @file ForensicLogger.js
 * @description Provides an immutable, chained, and optionally signed logging mechanism
 * for security-critical audit events. This version is designed for robust,
 * persistent storage using IndexedDB and aligns with the project's modern architecture.
 */

import { DateCore } from "@utils/DateUtils.js";

/**
 * @class ForensicLogger
 * @description Secure, immutable logging of audit events. This module captures,
 * stores, and can forward security-relevant and operational audit events,
 * providing a tamper-evident and comprehensive record of system activities.
 */
export class ForensicLogger {
	/** @private @type {ModernIndexedDB|null} */
	#db = null;
	/** @private @type {boolean} */
	#ready = false;
	/** @private @type {object} */
	#config;
	/**
	 * A buffer for events before the database is ready or for temporary storage.
	 * @private
	 * @type {Array<object>}
	 */
	#inMemoryBuffer = []; // Buffer for events before DB is ready or for temporary storage
	/** @private @type {number|null} */
	#bufferFlushInterval = null;

	/**
	 * Creates an instance of ForensicLogger.
	 * @param {object} context - The application context.
	 * @param {import('./HybridStateManager.js').default} context.stateManager - The main state manager, providing access to all other managers.
	 */
	constructor({ stateManager }) {
		this.stateManager = stateManager;
		// V8.0 Parity: Derive metricsRegistry directly from stateManager.
		this.metrics =
			stateManager.metricsRegistry?.namespace("forensicLogger");

		const options = stateManager.config.forensicLoggerConfig || {};
		this.#config = {
			storeName: options.storeName || "audit_events", // This is the primary store
			bufferSize: options.bufferSize || 100,
			flushInterval: options.flushInterval || 5000, // 5 seconds
			remoteEndpoint: options.remoteEndpoint || null,
			enableRemoteSync: options.enableRemoteSync || false,
			...options,
		};
	}

	/**
	 * Initializes the ForensicLogger, setting up IndexedDB and background flush.
	 * @returns {Promise<this>} A promise that resolves with the initialized ForensicLogger instance.
	 */
	async initialize() {
		if (this.#ready) return this;
		// V8.0 Parity: Use the shared storage instance from HybridStateManager.
		// Let errors propagate to the bootstrap process.
		this.#db = this.stateManager.storage.instance;
		if (!this.#db) {
			throw new Error("Storage instance not available in stateManager.");
		}
		this.#bufferFlushInterval = setInterval(
			() => this.#flushBuffer(),
			this.#config.flushInterval
		);
		this.#ready = true;
		console.log("[ForensicLogger] Initialized and ready for audit events.");
		return this;
	}

	/**
	 * Creates, signs, and logs a detailed audit event. This is the primary method for recording auditable actions.
	 * @param {string} type - The type of the audit event (e.g., 'ENTITY_CREATED').
	 * @param {object} payload - The data associated with the event.
	 * @param {object} [context={}] - Additional context, which may include a security subject override.
	 * @returns {Promise<void>}
	 */
	async logAuditEvent(type, payload, context = {}) {
		const event = await this.#createEnvelope(type, payload, context);

		// Use the internal logEvent to buffer and persist.
		await this.#logEvent(event);
		console.log(`[ForensicLogger][Audit] ${type}`, payload);
	}

	/**
	 * Creates a standard, signed, and tamper-evident log entry envelope.
	 * @private
	 * @param {string} type - The type of the audit event.
	 * @param {object} payload - The data associated with the event.
	 * @param {object} [context={}] - Additional context.
	 * @returns {Promise<object>} The structured and signed event envelope.
	 */
	async #createEnvelope(type, payload, context = {}) {
		const securityManager = this.stateManager.managers?.securityManager;
		const signer = this.stateManager.signer;

		if (!securityManager || !signer) {
			console.warn(
				"[ForensicLogger] SecurityManager or Signer not available. Audit event will be unsigned and may lack full context."
			);
		}

		const userContext =
			context.securitySubject || securityManager?.getSubject() || {};

		// In a real implementation, `previousHash` would be retrieved from the last stored log.
		const previousHash = "00000000000000000000000000000000"; // Placeholder

		// V8.0 Parity: Mandate 2.4 - Create the core data structure of the envelope first.
		const envelopeData = {
			id: crypto.randomUUID(),
			type,
			timestamp: DateCore.now(),
			previousHash,
			userContext: {
				userId: userContext.userId,
				role: userContext.role, // V8.0 Parity: Use 'role' for consistency with security subject.
				clearance: {
					level: userContext.level,
					compartments: Array.from(userContext.compartments || []),
				},
			},
			payload,
		};

		let signature = {
			signature: null,
			algorithm: "unsigned",
			publicKey: null,
		};

		// V8.0 Parity: Mandate 2.4 - The signature must cover the envelope's core data.
		if (signer) {
			// The signer is expected to handle the JSON stringification and hashing internally.
			signature = await signer.sign(envelopeData);
		}

		const finalEnvelope = {
			...envelopeData,
			signature, // Embed the signature object
		};

		return finalEnvelope;
	}

	/**
	 * Logs an audit event. Events are buffered and periodically flushed to IndexedDB.
	 * If remote sync is enabled, events are also forwarded to a remote endpoint.
	 * @private
	 * @param {object} event - The audit event object. Must contain at least `id`, `type`, `timestamp`, `payload`.
	 * @returns {Promise<void>}
	 */
	async #logEvent(event) {
		if (!event || !event.id || !event.type || !event.timestamp) {
			console.warn(
				"[ForensicLogger] Invalid event format, skipping:",
				event
			);
			this.metrics?.increment("errors");
			return;
		}

		this.#inMemoryBuffer.push(event);
		this.metrics?.increment("eventsLogged");

		if (this.#inMemoryBuffer.length >= this.#config.bufferSize) {
			await this.#flushBuffer();
		}

		if (this.#config.enableRemoteSync && this.#config.remoteEndpoint) {
			this.#forwardToRemote(event);
		}

		this.stateManager?.emit?.("auditEventLogged", event);
	}

	/**
	 * Flushes the in-memory event buffer to IndexedDB.
	 * @private
	 * @returns {Promise<void>}
	 */
	async #flushBuffer() {
		if (this.#inMemoryBuffer.length === 0 || !this.#db) {
			return;
		}

		const eventsToFlush = [...this.#inMemoryBuffer];
		this.#inMemoryBuffer = []; // Clear buffer immediately

		try {
			await this.#db.putBulk(this.#config.storeName, eventsToFlush);
			this.metrics?.increment("eventsFlushedToDB", eventsToFlush.length);
			this.metrics?.set("lastFlush", new Date().toISOString());
			this.stateManager?.emit?.("forensicLogFlushed", {
				count: eventsToFlush.length,
			});
		} catch (error) {
			console.error(
				"[ForensicLogger] Failed to flush events to IndexedDB:",
				error
			);
			this.stateManager?.emit?.("forensicLogError", {
				type: "flush_failed",
				message: error.message,
				error,
				events: eventsToFlush.map((e) => e.id),
			});
			// Re-add to buffer for retry or handle differently
			this.#inMemoryBuffer.unshift(...eventsToFlush);
			this.metrics?.increment("errors");
		}
	}

	/**
	 * Forwards an audit event to a remote logging endpoint.
	 * @private
	 * @param {object} event - The audit event to forward.
	 * @returns {Promise<void>}
	 */
	async #forwardToRemote(event) {
		try {
			const response = await fetch(this.#config.remoteEndpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					// Add authentication headers if necessary
				},
				body: JSON.stringify(event),
			});

			if (!response.ok) {
				throw new Error(
					`Remote logging failed: ${response.status} ${response.statusText}`
				);
			}
			this.metrics?.increment("eventsForwarded");
			this.stateManager?.emit?.("forensicLogForwarded", {
				eventId: event.id,
			});
		} catch (error) {
			console.error(
				`[ForensicLogger] Failed to forward event ${event.id} to remote:`,
				error
			);
			this.stateManager?.emit?.("forensicLogError", {
				type: "remote_forward_failed",
				message: error.message,
				error,
				eventId: event.id,
			});
			this.metrics?.increment("errors");
		}
	}

	/**
	 * Retrieves audit events from the local IndexedDB.
	 * @param {object} [options={}] - Query options (e.g., `type`, `userId`, `startDate`, `endDate`, `limit`).
	 * @returns {Promise<object[]>} A promise that resolves with an array of matching audit events.
	 */
	async getAuditTrail(options = {}) {
		if (!this.#ready || !this.#db) {
			console.warn(
				"[ForensicLogger] Database not ready, returning in-memory buffer."
			);
			// Even if DB is not ready, filter the in-memory buffer
			return this.#filterEvents([...this.#inMemoryBuffer], options);
		}

		try {
			// If filtering by type, use the new index for performance.
			if (options.type) {
				const byType = await this.#db.queryByIndex(
					this.#config.storeName,
					"type",
					options.type
				);
				// Further filter the indexed results
				return this.#filterEvents(byType, options);
			}

			// Otherwise, get all and filter in memory.
			const allEvents = await this.#db.getAll(
				this.#config.storeName,
				options
			);
			return this.#filterEvents(allEvents, options);
		} catch (error) {
			console.error(
				"[ForensicLogger] Failed to retrieve audit trail:",
				error
			);
			this.stateManager?.emit?.("forensicLogError", {
				type: "retrieve_failed",
				message: error.message,
				error,
			});
			return [];
		}
	}

	/**
	 * Helper to filter an array of events based on query options.
	 * @private
	 * @param {object[]} events - The array of events to filter.
	 * @param {object} options - The query options.
	 * @returns {object[]} The filtered array of events.
	 */
	#filterEvents(events, options) {
		let filtered = events;

		// This was already handled by the index if options.type was provided,
		// but this ensures it works for in-memory filtering too.
		if (options.type) {
			filtered = filtered.filter((e) => e.type === options.type);
		}
		if (options.userId) {
			filtered = filtered.filter((e) => e.userId === options.userId);
		}
		if (options.startDate) {
			const start = new Date(options.startDate).getTime();
			filtered = filtered.filter(
				(e) => new Date(e.timestamp).getTime() >= start
			);
		}
		if (options.endDate) {
			const end = new Date(options.endDate).getTime();
			filtered = filtered.filter(
				(e) => new Date(e.timestamp).getTime() <= end
			);
		}
		if (options.limit) {
			filtered = filtered.slice(0, options.limit);
		}
		return filtered;
	}

	/**
	 * Gets current metrics for the ForensicLogger.
	 * @returns {object} The metrics object.
	 */
	getMetrics() {
		return {
			...this.metrics?.getAllAsObject(),
			inMemoryBufferSize: this.#inMemoryBuffer.length,
			dbReady: this.#ready,
		};
	}

	/**
	 * Cleans up resources, stopping background flush and closing IndexedDB.
	 * @returns {Promise<void>}
	 */
	async cleanup() {
		if (this.#bufferFlushInterval) {
			clearInterval(this.#bufferFlushInterval);
			this.#bufferFlushInterval = null;
		}
		await this.#flushBuffer(); // Flush any remaining events
		if (this.#db) {
			// Do not close the shared DB instance.
			this.#db = null;
		}
		this.#ready = false;
		this.#inMemoryBuffer = [];
		console.log("[ForensicLogger] Cleaned up.");
	}
}

export default ForensicLogger;
