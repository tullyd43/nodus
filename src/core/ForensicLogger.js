// src/core/ForensicLogger.js
// Forensic Audit Core: Secure, immutable logging of audit events.

import { forensicLogMigrations } from "@core/storage/migrations/forensic_log_migrations.js";
import { ModernIndexedDB } from "@core/storage/ModernIndexedDB.js";

/**
 * @description ForensicLogger: Secure, immutable logging of audit events.
 * This module is responsible for capturing, storing, and potentially forwarding
 * security-relevant and operational audit events. It aims to provide a tamper-evident
 * and comprehensive record of system activities.
 */
export class ForensicLogger {
	/** @type {import('./HybridStateManager.js').HybridStateManager|null} */
	stateManager = null;
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
	 * Performance and usage metrics for the logger.
	 * @private
	 * @type {{eventsLogged: number, eventsFlushedToDB: number, eventsForwarded: number, errors: number, lastFlush: string|null}}
	 */
	#metrics = {
		eventsLogged: 0,
		eventsFlushedToDB: 0,
		eventsForwarded: 0,
		errors: 0,
		lastFlush: null,
	};

	/**
	 * Creates an instance of ForensicLogger.
	 * @param {object} [options={}] - Configuration options for the logger.
	 * @param {string} [options.dbName='forensic_audit_log'] - The name of the IndexedDB database.
	 * @param {string} [options.storeName='audit_events'] - The name of the IndexedDB object store.
	 * @param {number} [options.dbVersion=2] - The version of the IndexedDB schema.
	 * @param {number} [options.bufferSize=100] - The maximum number of events to buffer in memory before flushing.
	 * @param {number} [options.flushInterval=5000] - The interval in milliseconds to flush buffered events to IndexedDB.
	 * @param {string|null} [options.remoteEndpoint=null] - URL for a remote audit logging service.
	 * @param {boolean} [options.enableRemoteSync=false] - Whether to enable remote synchronization of audit events.
	 */
	constructor(options = {}) {
		this.#config = {
			dbName: options.dbName || "forensic_audit_log",
			storeName: options.storeName || "audit_events", // This is the primary store
			dbVersion: options.dbVersion || 2, // Bump version for migration
			bufferSize: options.bufferSize || 100,
			flushInterval: options.flushInterval || 5000, // 5 seconds
			remoteEndpoint: options.remoteEndpoint || null,
			enableRemoteSync: options.enableRemoteSync || false,
			...options,
		};
	}

	/**
	 * Binds the HybridStateManager to this instance.
	 * @param {import('./HybridStateManager.js').HybridStateManager} manager - The state manager instance.
	 */
	bindStateManager(manager) {
		this.stateManager = manager;
	}

	/**
	 * Initializes the ForensicLogger, setting up IndexedDB and background flush.
	 * @returns {Promise<this>} A promise that resolves with the initialized ForensicLogger instance.
	 */
	async init() {
		if (this.#ready) return this;

		try {
			this.#db = new ModernIndexedDB(
				this.#config.dbName,
				this.#config.storeName,
				this.#config.dbVersion,
				forensicLogMigrations
			);
			await this.#db.init();

			this.#bufferFlushInterval = setInterval(
				() => this.#flushBuffer(),
				this.#config.flushInterval
			);

			this.#ready = true;
			console.log(
				"[ForensicLogger] Initialized and ready for audit events."
			);
		} catch (error) {
			console.error(
				"[ForensicLogger] Failed to initialize IndexedDB:",
				error
			);
			this.stateManager?.emit?.("forensicLogError", {
				type: "init_failed",
				message: error.message,
				error,
			});
			// Continue in-memory buffering if DB fails
		}
		return this;
	}

	/**
	 * Logs an audit event. Events are buffered and periodically flushed to IndexedDB.
	 * If remote sync is enabled, events are also forwarded to a remote endpoint.
	 * @param {object} event - The audit event object. Must contain at least `id`, `type`, `timestamp`, `payload`.
	 * @returns {Promise<void>}
	 */
	async logEvent(event) {
		if (!event || !event.id || !event.type || !event.timestamp) {
			console.warn(
				"[ForensicLogger] Invalid event format, skipping:",
				event
			);
			this.#metrics.errors++;
			return;
		}

		this.#inMemoryBuffer.push(event);
		this.#metrics.eventsLogged++;

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
		if (
			this.#inMemoryBuffer.length === 0 ||
			!this.#db ||
			!this.#db.isReady
		) {
			return;
		}

		const eventsToFlush = [...this.#inMemoryBuffer];
		this.#inMemoryBuffer = []; // Clear buffer immediately

		try {
			await this.#db.putBulk(eventsToFlush);
			this.#metrics.eventsFlushedToDB += eventsToFlush.length;
			this.#metrics.lastFlush = new Date().toISOString();
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
			this.#metrics.errors++;
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
			this.#metrics.eventsForwarded++;
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
			this.#metrics.errors++;
		}
	}

	/**
	 * Retrieves audit events from the local IndexedDB.
	 * @param {object} [options={}] - Query options (e.g., `type`, `userId`, `startDate`, `endDate`, `limit`).
	 * @returns {Promise<object[]>} A promise that resolves with an array of matching audit events.
	 */
	async getAuditTrail(options = {}) {
		if (!this.#ready || !this.#db?.isReady) {
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
			const allEvents = await this.#db.getAll(this.#config.storeName);
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
			...this.#metrics,
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
			this.#db.close();
			this.#db = null;
		}
		this.#ready = false;
		this.#inMemoryBuffer = [];
		console.log("[ForensicLogger] Cleaned up.");
	}
}

export default ForensicLogger;
