/**
 * @file IdManager.js
 * @description A centralized manager for generating secure, unique, and auditable identifiers.
 * This system ensures that all ID generation is consistent, performant, and integrated with security and metrics.
 */

import { DateCore } from "../utils/DateUtils.js";

/**
 * @class IdManager
 * @description Manages the creation of unique identifiers (UUIDs) and provides hooks for auditing and metrics.
 */
export class IdManager {
	/**
	 * Creates an instance of IdManager.
	 * @param {object} context - The global application context.
	 * @param {import('../core/HybridStateManager.js').default} context.stateManager - The main state manager, providing access to all other managers.
	 */
	constructor({ stateManager } = {}) {
		// V8.0 Parity: Derive dependencies directly from stateManager.
		this.metrics = stateManager?.metricsRegistry?.namespace("idManager");
		this.logger = stateManager?.managers?.forensicLogger;
	}

	/**
	 * Generates a cryptographically secure v4 UUID.
	 * This is the standard method for creating unique IDs for any new entity.
	 * @param {object} [context={}] - Optional context for auditing.
	 * @param {string} [context.prefix=''] - A prefix for the ID (e.g., 'evt' for event).
	 * @param {string} [context.entityType=''] - The type of entity this ID is for.
	 * @param {string} [context.classification] - The security classification of the entity, for audit purposes.
	 * @returns {string} A v4 UUID, optionally prefixed.
	 */
	generate(context = {}) {
		const { prefix = "", entityType = "", classification } = context;

		// Use the browser's built-in crypto API for secure UUIDs.
		const uuid = crypto.randomUUID();
		const finalId = prefix ? `${prefix}_${uuid}` : uuid;

		// Metrics Integration
		this.metrics?.increment("ids.generated.total");
		if (entityType) {
			this.metrics?.increment(`ids.generated.by_type.${entityType}`);
		}

		// Auditing Integration for high-security contexts
		if (
			this.logger &&
			classification &&
			["secret", "top_secret"].includes(classification)
		) {
			this.logger.logAuditEvent(
				"ID_GENERATION_SENSITIVE",
				{
					id: finalId,
					entityType,
					classification,
				},
				context.securitySubject || {}
			);
		}

		return finalId;
	}

	/**
	 * Generates a simple, non-secure, time-based ID for low-risk use cases like DOM elements or toast notifications.
	 * @param {string} [prefix=''] - An optional prefix.
	 * @returns {string} A time-based unique string.
	 */
	generateSimpleId(prefix = "id") {
		return `${prefix}_${DateCore.timestamp()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}
