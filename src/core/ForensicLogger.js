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
 * @privateFields {#stateManager, #db, #metrics, #errorHelpers, #config, #ready, #inMemoryBuffer, #bufferFlushInterval, #lastLogHash}
 */
export class ForensicLogger {
	// V8.0 Parity: Mandate 3.1 - All internal properties MUST be private.
	/** @private @type {import('./HybridStateManager.js').default} */
	#stateManager;
	/** @private @type {import('./storage/ModernIndexedDB.js').ModernIndexedDB|null} */
	#db = null;
	/** @private @type {import('../utils/MetricsRegistry.js').MetricsRegistry|null} */
	#metrics = null;
	/** @private @type {import('../utils/ErrorHelpers.js').ErrorHelpers|null} */
	#errorHelpers = null;

	/** @private @type {object} */
	#config;
	/** @private @type {boolean} */
	#ready = false;
	/**
	 * A buffer for events before the database is ready or for temporary storage.
	 * @private
	 * @type {Array<object>}
	 */
	#inMemoryBuffer = [];
	/** @private @type {ReturnType<typeof setInterval>|null} */
	#bufferFlushInterval = null;
	/** @private @type {string|null} */
	#lastLogHash = null;

	/** @private @type {boolean} */
	#warnedUnsigned = false;
	/** @private @type {boolean} */
	#warnedUnsignedBlocked = false;

	/**
	 * Checks if unsigned audit logging is allowed by policy. Defaults to true in dev when policy is undefined.
	 * @private
	 * @returns {boolean}
	 */
	#isUnsignedAllowed() {
		try {
			const policies = this.#stateManager?.managers?.policies;
			const policy = policies?.getPolicy?.(
				"security",
				"allow_unsigned_audit_in_dev"
			);
			if (typeof policy === "boolean") return policy;
			// Default to dev-friendly when not explicitly set
			return !!(
				import.meta?.env?.DEV ||
				(typeof window !== "undefined" &&
					window.location?.hostname === "localhost")
			);
		} catch {
			return !!(
				import.meta?.env?.DEV ||
				(typeof window !== "undefined" &&
					window.location?.hostname === "localhost")
			);
		}
	}

	/**
	 * Creates an instance of ForensicLogger.
	 * @param {object} context - The application context.
	 * @param {import('./HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		// V8.0 Parity: Mandate 1.2 & 3.2 - Store stateManager privately and derive all dependencies.
		this.#stateManager = stateManager;
		this.#metrics =
			this.#stateManager.metricsRegistry?.namespace("forensicLogger");
		this.#errorHelpers = this.#stateManager.managers.errorHelpers;

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
		// Let errors propagate to the bootstrap process if storage is missing.
		this.#db = this.#stateManager.storage.instance;
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
		const securityManager = this.#stateManager.managers?.securityManager;
		const signer = this.#stateManager.signer;

		if (!securityManager || !signer) {
			const allowed = this.#isUnsignedAllowed();
			if (!allowed) {
				if (!this.#warnedUnsignedBlocked) {
					console.warn(
						"[ForensicLogger] Unsigned audit blocked by policy (security.allow_unsigned_audit_in_dev = false)."
					);
					this.#warnedUnsignedBlocked = true;
				}
			} else if (!this.#warnedUnsigned) {
				console.debug(
					"[ForensicLogger] Security services not ready; proceeding with unsigned audit."
				);
				this.#warnedUnsigned = true;
			}
		}

		const userContext =
			context.securitySubject || securityManager?.getSubject() || {};

		// Retrieve the hash of the last log entry to form a chain.
		const previousHash = await this.#getPreviousLogHash();

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

		const signature = {
			signature: null,
			algorithm: "unsigned",
			publicKey: null,
		};

		// V8.0 Parity: Mandate 2.4 - The signature must cover the envelope's core data.
		// The signer is expected to handle the JSON stringification and hashing internally.
		if (signer) {
			const {
				signature: sig,
				algorithm,
				publicKey,
			} = await signer.sign(envelopeData);
			signature.signature = sig;
			signature.algorithm = algorithm;
			signature.publicKey = publicKey;
		}

		const finalEnvelope = {
			...envelopeData,
			signature, // Embed the signature object
			// The hash of the current envelope is calculated *after* signing.
			hash: await this.#calculateHash(envelopeData, signature),
		};
		this.#lastLogHash = finalEnvelope.hash; // Cache the latest hash
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
			this.#metrics?.increment("errors.invalidFormat");
			return;
		}

		// Enforce policy: drop unsigned audits when disallowed
		try {
			const isUnsigned =
				!event?.signature?.signature &&
				event?.signature?.algorithm === "unsigned";
			if (isUnsigned && !this.#isUnsignedAllowed()) {
				if (!this.#warnedUnsignedBlocked) {
					console.warn(
						"[ForensicLogger] Dropping unsigned audit event due to policy."
					);
					this.#warnedUnsignedBlocked = true;
				}
				this.#metrics?.increment?.("unsignedDropped");
				return;
			}
		} catch {
			/* noop */
		}

		this.#inMemoryBuffer.push(event);
		this.#metrics?.increment("eventsLogged");

		if (this.#inMemoryBuffer.length >= this.#config.bufferSize) {
			await this.#flushBuffer();
		}

		if (this.#config.enableRemoteSync && this.#config.remoteEndpoint) {
			this.#forwardToRemote(event);
		}

		this.#stateManager?.emit?.("auditEventLogged", event);
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
			this.#metrics?.increment("eventsFlushedToDB", eventsToFlush.length);
			this.#metrics?.set("lastFlush", new Date().toISOString());
			this.#stateManager?.emit?.("forensicLogFlushed", {
				count: eventsToFlush.length,
			});
		} catch (error) {
			this.#errorHelpers?.handleError(error, {
				component: "ForensicLogger",
				operation: "flushBuffer",
				userFriendlyMessage:
					"Failed to save audit log to local storage.",
			});
			this.#stateManager?.emit?.("forensicLogError", {
				type: "flush_failed",
				message: error.message,
				error,
				events: eventsToFlush.map((e) => e.id),
			});
			// Re-add to buffer for retry or handle differently
			this.#inMemoryBuffer.unshift(...eventsToFlush);
			this.#metrics?.increment("errors.flushFailed");
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
			this.#metrics?.increment("eventsForwarded");
			this.#stateManager?.emit?.("forensicLogForwarded", {
				eventId: event.id,
			});
		} catch (error) {
			this.#errorHelpers?.handleError(error, {
				component: "ForensicLogger",
				operation: "forwardToRemote",
				context: { eventId: event.id },
			});
			this.#stateManager?.emit?.("forensicLogError", {
				type: "remote_forward_failed",
				message: error.message,
				error,
				eventId: event.id,
			});
			this.#metrics?.increment("errors.remoteForwardFailed");
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
			this.#errorHelpers?.handleError(error, {
				component: "ForensicLogger",
				operation: "getAuditTrail",
			});
			this.#stateManager?.emit?.("forensicLogError", {
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
	 * Retrieves the hash of the most recent log entry from the database.
	 * @private
	 * @returns {Promise<string>} The hash of the last log entry, or a default initial hash.
	 */
	async #getPreviousLogHash() {
		if (this.#lastLogHash) {
			return this.#lastLogHash;
		}

		if (!this.#db || !this.#ready) {
			return "0".repeat(64); // Initial hash if DB is not ready
		}

		try {
			const lastEvent = await this.#db.getLast(this.#config.storeName);
			this.#lastLogHash = lastEvent?.hash || "0".repeat(64);
			return this.#lastLogHash;
		} catch (error) {
			this.#errorHelpers?.handleError(error, {
				component: "ForensicLogger",
				operation: "getPreviousLogHash",
			});
			return "0".repeat(64); // Fallback on error
		}
	}

	/**
	 * Calculates a SHA-256 hash of the log envelope's content.
	 * @private
	 * @param {object} envelopeData - The core data of the envelope.
	 * @param {object} signature - The signature object.
	 * @returns {Promise<string>} The hex-encoded SHA-256 hash.
	 */
	async #calculateHash(envelopeData, signature) {
		const signer = this.#stateManager?.signer;
		const payload = { ...envelopeData, signature };
		if (signer && typeof signer.hash === "function") {
			return signer.hash(payload);
		}
		// Fallback: compute SHA-256 locally
		const encoded = new TextEncoder().encode(JSON.stringify(payload));
		const digest = await crypto.subtle.digest("SHA-256", encoded);
		return Array.from(new Uint8Array(digest))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}
	/**
	 * Gets current metrics for the ForensicLogger.
	 * @returns {object} The metrics object.
	 */
	getMetrics() {
		return {
			...this.#metrics?.getAllAsObject(),
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
