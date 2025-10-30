/**
 * Manages requests for moving data between different security domains (Cross-Domain Solution).
 * This class facilitates the process of requesting data classification downgrades or upgrades,
 * emitting events that can be handled by a guard or approval workflow.
 */
export class CrossDomainSolution {
	/**
	 * Creates an instance of the CrossDomainSolution.
	 * @param {object} config - The configuration object.
	 * @param {Function} [config.emit] - An event emitter function to broadcast CDS events.
	 */
	constructor({ emit }) {
		/**
		 * An event emitter function.
		 * @type {Function|undefined}
		 * @private
		 */
		this.emit = emit;
	}

	/**
	 * Initiates a request to downgrade the classification of a data entity.
	 * This is typically used when data needs to be moved from a higher security level to a lower one.
	 * The request is emitted as a 'cdsEvent' for an external guard or workflow to process.
	 *
	 * @param {object} params - The parameters for the downgrade request.
	 * @param {string} params.dataId - The unique identifier of the data entity to be downgraded.
	 * @param {string} params.fromLevel - The current security classification level of the data.
	 * @param {string} params.toLevel - The target (lower) security classification level.
	 * @param {string} params.justification - The reason or justification for the downgrade request.
	 * @returns {Promise<{ticketId: string, status: string}>} A promise that resolves with an object containing the ticket ID for tracking the request and its initial status.
	 */
	async requestDowngrade({ dataId, fromLevel, toLevel, justification }) {
		this.emit?.("cdsEvent", {
			type: "request_downgrade",
			dataId,
			fromLevel,
			toLevel,
			justification,
			ts: Date.now(),
		});
		return { ticketId: crypto.randomUUID(), status: "pending" };
	}

	/**
	 * Initiates a request to upgrade the classification of a data entity.
	 * This is used when data from a lower security level is incorporated into a higher-level entity,
	* requiring a formal process to approve the data's new classification.
	 * The request is emitted as a 'cdsEvent' for an external guard or workflow to process.
	 *
	 * @param {object} params - The parameters for the upgrade request.
	 * @param {string} params.dataId - The unique identifier of the data entity to be upgraded.
	 * @param {string} params.fromLevel - The current security classification level of the data.
	 * @param {string} params.toLevel - The target (higher) security classification level.
	 * @param {string} params.source - Information about the source or reason for the upgrade.
	 * @returns {Promise<{ticketId: string, status: string}>} A promise that resolves with an object containing the ticket ID for tracking the request and its initial status.
	 */
	async requestUpgrade({ dataId, fromLevel, toLevel, source }) {
		this.emit?.("cdsEvent", {
			type: "request_upgrade",
			dataId,
			fromLevel,
			toLevel,
			source,
			ts: Date.now(),
		});
		return { ticketId: crypto.randomUUID(), status: "pending" };
	}
}
