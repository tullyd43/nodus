/**
 * Tracks the flow of information between different security labels within the system.
 * This is a critical component for auditing and enforcing information flow control policies,
 * ensuring that data derivation from multiple sources is logged for security analysis.
 * It helps answer questions like "How was this Top Secret document created?" by tracing
 * its lineage back to its source data.
 */
export class InformationFlowTracker {
	/** @private @type {import('../HybridStateManager.js').default} */
	#stateManager;

	/**
	 * Creates an instance of the InformationFlowTracker.
	 * @param {object} context - The application context.
	 * @param {import('../HybridStateManager.js').default} context.stateManager - The main state manager instance.
	 */
	constructor({ stateManager }) {
		this.#stateManager = stateManager;
	}
	/**
	 * Logs an event indicating that a new data entity has been derived from one or more source entities.
	 * This method should be called whenever an operation combines, transforms, or otherwise uses
	 * data from existing entities to create a new one, especially when security labels are involved.
	 *
	 * @param {object[]} fromLabels - An array of security label objects from the source entities. Each object should represent the security context (e.g., `{ classification: 'secret', compartments: ['ALPHA'] }`).
	 * @param {object} derivedLabel - The security label object of the newly created (derived) entity.
	 * @param {object} meta - An object for additional metadata related to the derivation event. This can include information like the operation performed, the user ID, or the specific entities involved.
	 */
	derived(fromLabels, derivedLabel, meta) {
		this.#stateManager?.emit("infoFlow", {
			fromLabels,
			derivedLabel,
			...meta,
			ts: Date.now(),
		});
	}
}
